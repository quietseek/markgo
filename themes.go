package main

// Typora 主题：导入、列出与删除（文件经 /mg-theme/ 提供给前端）

import (
	"os"

	"github.com/quietseek/markgo/internal/themes"
)

func (b *Bridge) ListThemes() []themes.Theme { return themes.List(themeDir) }

type themeImport struct {
	Themes []themes.Theme `json:"themes"`
	Errors []string       `json:"errors"`
}

// ImportTheme 选择一个或多个 Typora 主题的 .css 文件导入；取消时返回空结果
func (b *Bridge) ImportTheme() (themeImport, error) {
	res := themeImport{Themes: []themes.Theme{}, Errors: []string{}}
	paths, err := b.openDialog().AddFilter("Typora 主题", "*.css").PromptForMultipleSelection()
	if err != nil || len(paths) == 0 {
		return res, err
	}
	for _, p := range paths {
		t, err := themes.Import(themeDir, p)
		if err != nil {
			res.Errors = append(res.Errors, err.Error())
			continue
		}
		res.Themes = append(res.Themes, t)
	}
	b.broadcastThemes()
	return res, nil
}

// ImportThemeFolder 选择文件夹（如 Typora 的主题文件夹），批量导入其中所有主题；取消时返回空结果
func (b *Bridge) ImportThemeFolder() (themeImport, error) {
	res := themeImport{Themes: []themes.Theme{}, Errors: []string{}}
	dir, err := b.openDialog().CanChooseDirectories(true).CanChooseFiles(false).PromptForSingleSelection()
	if err != nil || dir == "" {
		return res, err
	}
	list, errs := themes.ImportFolder(themeDir, dir)
	res.Themes = append(res.Themes, list...)
	for _, e := range errs {
		res.Errors = append(res.Errors, e.Error())
	}
	if len(list) > 0 {
		b.broadcastThemes()
	}
	return res, nil
}

func (b *Bridge) RemoveTheme(id string) error {
	if err := themes.Remove(themeDir, id); err != nil {
		return err
	}
	b.broadcastThemes()
	return nil
}

// OpenThemesFolder 在文件管理器中打开主题目录，便于手动增删主题文件
func (b *Bridge) OpenThemesFolder() error {
	if err := os.MkdirAll(themeDir, 0o755); err != nil {
		return err
	}
	return b.app.Env.OpenFileManager(themeDir, false)
}

// 通知前端主题列表有变化（重新加载正在使用的主题）
func (b *Bridge) broadcastThemes() { b.emit("themes:changed", nil) }
