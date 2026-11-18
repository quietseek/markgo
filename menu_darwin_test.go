package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestMacEditingMenuShortcuts(t *testing.T) {
	app := application.New(application.Options{Name: "MarkGo"})
	menu := buildAppMenu(app, &Bridge{})
	for _, tc := range []struct {
		name     string
		role     application.Role
		shortcut string
	}{
		{"复制", application.Copy, "Cmd+C"},
		{"粘贴", application.Paste, "Cmd+V"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			item := menu.FindByRole(tc.role)
			if item == nil {
				t.Fatalf("找不到菜单项 %q", tc.name)
			}
			if got := item.GetAccelerator(); got != tc.shortcut {
				t.Errorf("%s 快捷键为 %q，期望 %q", tc.name, got, tc.shortcut)
			}
		})
	}
}
