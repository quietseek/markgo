package main

// Typora 主题：导入、列出与删除（文件经 /mg-theme/ 提供给前端）

import "github.com/quietseek/markgo/internal/themes"

func (b *Bridge) ListThemes() []themes.Theme { return themes.List(themeDir) }

// ImportTheme 选择 Typora 主题的 .css 文件并导入；取消时返回 nil
func (b *Bridge) ImportTheme() (*themes.Theme, error) {
	p, err := b.openDialog().AddFilter("Typora 主题", "*.css").PromptForSingleSelection()
	if err != nil || p == "" {
		return nil, err
	}
	t, err := themes.Import(themeDir, p)
	if err != nil {
		return nil, err
	}
	b.broadcastThemes()
	return &t, nil
}

func (b *Bridge) RemoveTheme(id string) error {
	if err := themes.Remove(themeDir, id); err != nil {
		return err
	}
	b.broadcastThemes()
	return nil
}

// 通知前端主题列表有变化（重新加载正在使用的主题）
func (b *Bridge) broadcastThemes() { b.emit("themes:changed", nil) }
