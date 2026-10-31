// Package themes 管理用户导入的 Typora 主题：每个主题是一个 .css 文件，
// 以及可选的同名资源文件夹（字体、图片、被 @import 的样式表）。
package themes

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
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
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".css") {
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

// Import 复制主题 .css 及其旁边的同名文件夹；同名主题会被覆盖
func Import(dir, cssPath string) (Theme, error) {
	if !strings.EqualFold(filepath.Ext(cssPath), ".css") {
		return Theme{}, errors.New("请选择 Typora 主题的 .css 文件")
	}
	id := strings.TrimSuffix(filepath.Base(cssPath), filepath.Ext(cssPath))
	if !validID(id) {
		return Theme{}, errors.New("主题文件名无效")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Theme{}, err
	}
	if err := copyFile(cssPath, filepath.Join(dir, id+".css")); err != nil {
		return Theme{}, err
	}
	assets := filepath.Join(filepath.Dir(cssPath), id)
	if st, err := os.Stat(assets); err == nil && st.IsDir() {
		target := filepath.Join(dir, id)
		os.RemoveAll(target)
		if err := copyDir(assets, target); err != nil {
			return Theme{}, err
		}
	}
	return Theme{ID: id, Name: DisplayName(id)}, nil
}

// Remove 删除主题及其资源文件夹
func Remove(dir, id string) error {
	if !validID(id) {
		return errors.New("主题名称无效")
	}
	if err := os.Remove(filepath.Join(dir, id+".css")); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return os.RemoveAll(filepath.Join(dir, id))
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
