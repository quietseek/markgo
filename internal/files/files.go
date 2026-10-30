// Package files 负责笔记库的文件树与文件操作。
package files

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	Type     string     `json:"type"` // "file" | "dir"
	Children []FileNode `json:"children,omitempty"`
}

var noteExts = []string{".md", ".markdown", ".txt"}
var ignored = []string{"node_modules", ".git", ".obsidian", ".trash"}

const maxDepth = 8

func IsNote(name string) bool {
	return slices.Contains(noteExts, strings.ToLower(filepath.Ext(name)))
}

// ListTree 列出笔记库中的文件夹与笔记：文件夹在前，按中文拼音与数字自然排序。
// 不含笔记的文件夹（如只放图片的 assets）不列出；完全空的文件夹保留，以便显示刚新建的文件夹
func ListTree(root string, showHidden bool) []FileNode {
	col := collate.New(language.SimplifiedChinese, collate.Numeric)
	return listTree(root, showHidden, 0, col)
}

func listTree(root string, showHidden bool, depth int, col *collate.Collator) []FileNode {
	nodes := []FileNode{}
	if depth > maxDepth {
		return nodes
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nodes
	}
	for _, e := range entries {
		name := e.Name()
		if (!showHidden && strings.HasPrefix(name, ".")) || slices.Contains(ignored, name) {
			continue
		}
		full := filepath.Join(root, name)
		isDir := e.IsDir()
		// 跟随指向文件夹的符号链接
		if e.Type()&os.ModeSymlink != 0 {
			if st, err := os.Stat(full); err == nil {
				isDir = st.IsDir()
			}
		}
		if isDir {
			children := listTree(full, showHidden, depth+1, col)
			if len(children) == 0 && !isEmptyDir(full) {
				continue
			}
			nodes = append(nodes, FileNode{Name: name, Path: full, Type: "dir", Children: children})
		} else if IsNote(name) {
			nodes = append(nodes, FileNode{Name: name, Path: full, Type: "file"})
		}
	}
	slices.SortStableFunc(nodes, func(a, b FileNode) int {
		if a.Type != b.Type {
			if a.Type == "dir" {
				return -1
			}
			return 1
		}
		return col.CompareString(a.Name, b.Name)
	})
	return nodes
}

func isEmptyDir(p string) bool {
	entries, err := os.ReadDir(p)
	return err == nil && len(entries) == 0
}

// IsInside 文件是否位于目录之内
func IsInside(file, dir string) bool {
	rel, err := filepath.Rel(dir, file)
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func exists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}

// UniquePath 生成不重名的路径：name.md -> name 2.md
func UniquePath(dir, name string) string {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	candidate := filepath.Join(dir, name)
	for i := 2; exists(candidate); i++ {
		candidate = filepath.Join(dir, fmt.Sprintf("%s %d%s", stem, i, ext))
	}
	return candidate
}

func CreateEntry(dir, name, kind string) (string, error) {
	clean := SanitizeName(name)
	if clean == "" {
		if kind == "file" {
			clean = "未命名"
		} else {
			clean = "新建文件夹"
		}
	}
	if kind == "dir" {
		target := UniquePath(dir, clean)
		return target, os.MkdirAll(target, 0o755)
	}
	if !IsNote(clean) {
		clean += ".md"
	}
	target := UniquePath(dir, clean)
	return target, os.WriteFile(target, nil, 0o644)
}

func RenameEntry(path, newName string) (string, error) {
	clean := SanitizeName(newName)
	if clean == "" {
		return "", errors.New("名称不能为空")
	}
	st, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !st.IsDir() && filepath.Ext(clean) == "" {
		clean += filepath.Ext(path)
	}
	target := filepath.Join(filepath.Dir(path), clean)
	if target == path {
		return path, nil
	}
	// 仅大小写不同的改名在不区分大小写的文件系统上指向同一个文件，允许；否则不能覆盖已有文件
	if targetInfo, err := os.Stat(target); err == nil && !os.SameFile(targetInfo, st) {
		return "", fmt.Errorf("已存在同名文件：%s", clean)
	}
	return target, os.Rename(path, target)
}

var unsafeChars = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f]`)
var spaces = regexp.MustCompile(`\s+`)

func SanitizeName(name string) string {
	return strings.TrimSpace(spaces.ReplaceAllString(unsafeChars.ReplaceAllString(name, " "), " "))
}

// AssetPrefix 前端显示本地图片的地址前缀：/mg-asset/<encodeURIComponent(absPath)>，由资源服务中间件提供
const AssetPrefix = "/mg-asset/"

var remoteSrc = regexp.MustCompile(`(?i)^(https?:|data:|blob:)`)
var winAbs = regexp.MustCompile(`^[a-zA-Z]:[\\/]`)

// ResolveLocalImagePath 解析正文中的图片地址为本地绝对路径；非本地地址返回空字符串
func ResolveLocalImagePath(src, docPath string) string {
	if src == "" || remoteSrc.MatchString(src) {
		return ""
	}
	if p, ok := DecodeAssetURL(src); ok {
		return p
	}
	if strings.HasPrefix(src, "file://") {
		u, err := url.Parse(src)
		if err != nil {
			return ""
		}
		p := u.Path
		// file:///C:/x.png
		if winAbs.MatchString(strings.TrimPrefix(p, "/")) {
			p = strings.TrimPrefix(p, "/")
		}
		return filepath.FromSlash(p)
	}
	clean := src
	if i := strings.IndexAny(clean, "?#"); i >= 0 {
		clean = clean[:i]
	}
	if dec, err := url.PathUnescape(clean); err == nil {
		clean = dec
	}
	if filepath.IsAbs(clean) || winAbs.MatchString(clean) || strings.HasPrefix(clean, "/") {
		return filepath.FromSlash(clean)
	}
	if docPath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(docPath), filepath.FromSlash(clean))
}

// DecodeAssetURL 解析 /mg-asset/<encoded> 或完整的 http(s)://host/mg-asset/<encoded>
func DecodeAssetURL(src string) (string, bool) {
	i := strings.Index(src, AssetPrefix)
	if i < 0 || (i > 0 && !strings.Contains(src[:i], "://")) {
		return "", false
	}
	raw := src[i+len(AssetPrefix):]
	p, err := url.PathUnescape(raw)
	if err != nil {
		return "", false
	}
	return p, true
}

var imageExts = []string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}

func IsImagePath(p string) bool {
	return slices.Contains(imageExts, strings.ToLower(filepath.Ext(p)))
}
