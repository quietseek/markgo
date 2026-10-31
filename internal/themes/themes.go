// Package themes 管理用户导入的 Typora 主题：每个主题是一个 .css 文件，
// 以及可选的同名资源文件夹（字体、图片、被 @import 的样式表）。
package themes

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// URLPrefix 前端通过 /mg-theme/<相对路径> 读取主题文件
const URLPrefix = "/mg-theme/"

type Theme struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// List 列出目录中的主题（按名称排序）；目录不存在时返回空列表
func List(dir string) []Theme {
	entries, err := os.ReadDir(dir)
	out := []Theme{}
	if err != nil {
		return out
	}
	for _, e := range entries {
		if e.IsDir() || !IsThemeFile(e.Name()) {
			continue
		}
		id := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		out = append(out, Theme{ID: id, Name: DisplayName(id)})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

// DisplayName 把文件名转为显示名：drake-light → Drake Light
func DisplayName(id string) string {
	words := strings.FieldsFunc(id, func(r rune) bool { return r == '-' || r == '_' || r == ' ' })
	for i, w := range words {
		r := []rune(w)
		r[0] = unicode.ToUpper(r[0])
		words[i] = string(r)
	}
	return strings.Join(words, " ")
}

func validID(id string) bool {
	return id != "" && id != "." && id != ".." && !strings.ContainsAny(id, `/\`)
}

// 主题样式表中引用的相对路径：@import "x" / @import url(x) / url(x)
var refRe = regexp.MustCompile(`(?i)@import\s+(?:url\(\s*)?["']?([^"')\s;]+)|url\(\s*["']?([^"')]+?)["']?\s*\)`)

// assetDirs 返回主题需要的资源文件夹（相对样式表所在目录的顶层文件夹名）：
// 同名文件夹，以及样式表通过 @import / url() 引用到的文件夹（如 drake-light.css 引用的 drake/）
func assetDirs(id, css string) []string {
	seen := map[string]bool{id: true}
	out := []string{id}
	for _, m := range refRe.FindAllStringSubmatch(css, -1) {
		ref := m[1]
		if ref == "" {
			ref = m[2]
		}
		ref = strings.TrimSpace(ref)
		if i := strings.IndexAny(ref, "?#"); i >= 0 {
			ref = ref[:i]
		}
		ref = strings.TrimPrefix(filepath.ToSlash(ref), "./")
		if ref == "" || strings.HasPrefix(ref, "/") || strings.HasPrefix(ref, "../") || strings.Contains(ref, ":") {
			continue
		}
		top, _, nested := strings.Cut(ref, "/")
		if !nested || !validID(top) || seen[top] {
			continue
		}
		seen[top] = true
		out = append(out, top)
	}
	return out
}

func themeID(cssPath string) string {
	return strings.TrimSuffix(filepath.Base(cssPath), filepath.Ext(cssPath))
}

// IsThemeFile 判断是否为可导入的主题样式表（排除 Typora 的 *.user.css 等自定义覆盖文件）
func IsThemeFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".css") && !strings.HasSuffix(lower, ".user.css") &&
		lower != "base.css" && lower != "base-control.css"
}

// Import 复制主题 .css 及其资源文件夹（同名文件夹与样式表引用的文件夹）；同名主题会被覆盖
func Import(dir, cssPath string) (Theme, error) {
	if !strings.EqualFold(filepath.Ext(cssPath), ".css") {
		return Theme{}, errors.New("请选择 Typora 主题的 .css 文件")
	}
	id := themeID(cssPath)
	if !validID(id) {
		return Theme{}, errors.New("主题文件名无效")
	}
	css, err := os.ReadFile(cssPath)
	if err != nil {
		return Theme{}, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Theme{}, err
	}
	if err := os.WriteFile(filepath.Join(dir, id+".css"), css, 0o644); err != nil {
		return Theme{}, err
	}
	src := filepath.Dir(cssPath)
	for _, name := range assetDirs(id, string(css)) {
		assets := filepath.Join(src, name)
		if st, err := os.Stat(assets); err != nil || !st.IsDir() {
			continue
		}
		target := filepath.Join(dir, name)
		os.RemoveAll(target)
		if err := copyDir(assets, target); err != nil {
			return Theme{}, err
		}
	}
	return Theme{ID: id, Name: DisplayName(id)}, nil
}

// ImportFolder 导入文件夹（如 Typora 的主题文件夹）中所有的主题样式表
func ImportFolder(dir, folder string) ([]Theme, []error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, []error{err}
	}
	var out []Theme
	var errs []error
	for _, e := range entries {
		if e.IsDir() || !IsThemeFile(e.Name()) {
			continue
		}
		t, err := Import(dir, filepath.Join(folder, e.Name()))
		if err != nil {
			errs = append(errs, fmt.Errorf("%s：%w", e.Name(), err))
			continue
		}
		out = append(out, t)
	}
	if len(out) == 0 && len(errs) == 0 {
		errs = append(errs, errors.New("所选文件夹中没有 Typora 主题（.css 文件）"))
	}
	return out, errs
}

// Remove 删除主题及其资源文件夹（仍被其他主题使用的文件夹会保留）
func Remove(dir, id string) error {
	if !validID(id) {
		return errors.New("主题名称无效")
	}
	file := filepath.Join(dir, id+".css")
	css, _ := os.ReadFile(file)
	if err := os.Remove(file); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	used := map[string]bool{}
	for _, t := range List(dir) {
		other, _ := os.ReadFile(filepath.Join(dir, t.ID+".css"))
		for _, name := range assetDirs(t.ID, string(other)) {
			used[name] = true
		}
	}
	for _, name := range assetDirs(id, string(css)) {
		if !used[name] {
			if err := os.RemoveAll(filepath.Join(dir, name)); err != nil {
				return err
			}
		}
	}
	return nil
}

// Resolve 把 /mg-theme/ 之后的相对路径解析为主题目录中的文件；越界时返回 false
func Resolve(dir, rel string) (string, bool) {
	rel = strings.TrimPrefix(filepath.ToSlash(rel), "/")
	if rel == "" {
		return "", false
	}
	p := filepath.Join(dir, filepath.FromSlash(rel))
	r, err := filepath.Rel(dir, p)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", false
	}
	return p, true
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !d.Type().IsRegular() {
			return nil
		}
		return copyFile(p, target)
	})
}
