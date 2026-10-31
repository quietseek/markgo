package main

import (
	"path/filepath"
	"runtime/debug"
	"slices"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/quietseek/markgo/internal/settings"
)

func (b *Bridge) sendMenu(action string) func(*application.Context) {
	return func(*application.Context) { b.sendToFocused("menu", action) }
}

// buildAppMenu macOS 菜单栏；Windows / Linux 为无边框窗口，快捷键由前端处理（frontend/src/bridge.ts）
func buildAppMenu(app *application.App, b *Bridge) *application.Menu {
	menu := app.Menu.New()
	menu.AddRole(application.AppMenu)

	file := menu.AddSubmenu("文件")
	file.Add("新建笔记").SetAccelerator("CmdOrCtrl+N").OnClick(b.sendMenu("new-file"))
	file.Add("打开文件…").SetAccelerator("CmdOrCtrl+O").OnClick(b.sendMenu("open-file"))
	file.Add("打开文件夹…").SetAccelerator("CmdOrCtrl+Shift+O").OnClick(b.sendMenu("open-folder"))
	file.AddSeparator()
	file.Add("保存").SetAccelerator("CmdOrCtrl+S").OnClick(b.sendMenu("save"))
	file.Add("另存为…").SetAccelerator("CmdOrCtrl+Shift+S").OnClick(b.sendMenu("save-as"))
	file.Add("导出排版 HTML…").OnClick(b.sendMenu("export-html"))
	file.AddSeparator()
	file.Add("设置…").SetAccelerator("CmdOrCtrl+,").OnClick(b.sendMenu("settings"))

	edit := menu.AddSubmenu("编辑")
	edit.Add("撤销").SetRole(application.Undo)
	edit.Add("重做").SetRole(application.Redo)
	edit.AddSeparator()
	edit.Add("剪切").SetRole(application.Cut)
	edit.Add("复制").SetRole(application.Copy)
	edit.Add("粘贴").SetRole(application.Paste)
	edit.Add("粘贴为纯文本").SetRole(application.PasteAndMatchStyle)
	edit.Add("全选").SetRole(application.SelectAll)
	edit.AddSeparator()
	edit.Add("查找").SetAccelerator("CmdOrCtrl+F").OnClick(b.sendMenu("find"))
	edit.Add("替换").SetAccelerator("Cmd+Alt+F").OnClick(b.sendMenu("replace"))

	view := menu.AddSubmenu("视图")
	view.Add("切换侧边栏").SetAccelerator("CmdOrCtrl+\\").OnClick(b.sendMenu("toggle-sidebar"))
	view.Add("切换源码模式").SetAccelerator("CmdOrCtrl+/").OnClick(b.sendMenu("toggle-source"))
	view.Add("专注模式").SetAccelerator("CmdOrCtrl+Shift+F").OnClick(b.sendMenu("toggle-focus"))
	view.Add("打字机模式").OnClick(b.sendMenu("toggle-typewriter"))
	view.AddSeparator()
	view.Add("放大").SetRole(application.ZoomIn)
	view.Add("缩小").SetRole(application.ZoomOut)
	view.Add("实际大小").SetRole(application.ResetZoom)
	view.AddSeparator()
	view.Add("开发者工具").SetRole(application.OpenDevTools)
	view.Add("全屏").SetRole(application.ToggleFullscreen)

	ai := menu.AddSubmenu("AI")
	ai.Add("AI 助手").SetAccelerator("CmdOrCtrl+J").OnClick(b.sendMenu("toggle-ai"))
	ai.Add("新对话").OnClick(b.sendMenu("ai-new-chat"))

	publish := menu.AddSubmenu("发布")
	publish.Add("复制排版内容").SetAccelerator("CmdOrCtrl+Shift+C").OnClick(b.sendMenu("copy-wechat"))
	publish.Add("发布…").SetAccelerator("CmdOrCtrl+Shift+E").OnClick(b.sendMenu("publish-wechat"))

	menu.AddRole(application.WindowMenu)

	help := menu.AddSubmenu("帮助")
	help.Add("键盘快捷键").OnClick(b.sendMenu("shortcuts"))
	help.Add("检查更新…").OnClick(b.sendMenu("check-update"))
	help.AddSeparator()
	help.Add("关于 MarkGo").OnClick(b.sendMenu("about"))
	return menu
}

// ---------- 托盘 ----------
// Wails 暂无程序坞菜单接口：macOS 上点击程序坞图标重新显示窗口，不提供自定义菜单

// Windows / Linux 的托盘图标：应用运行期间一直显示，窗口关闭到后台后可从这里找回
func (b *Bridge) ensureTray() {
	b.trayMu.Lock()
	defer b.trayMu.Unlock()
	if b.tray != nil {
		return
	}
	b.tray = b.app.SystemTray.New()
	b.tray.SetIcon(appIcon)
	b.tray.SetTooltip(appName)
	b.tray.SetMenu(b.buildTrayMenu())
	b.tray.OnClick(b.showWindow)
}

func (b *Bridge) refreshTrayMenu() {
	b.trayMu.Lock()
	defer b.trayMu.Unlock()
	if b.tray != nil {
		b.tray.SetMenu(b.buildTrayMenu())
	}
}

// buildTrayMenu 按「设置 → 通用 → 托盘菜单」组装；分组之间加分隔线：显示 | 新建与打开 | 最近 | AI 与设置 | 退出
func (b *Bridge) buildTrayMenu() *application.Menu {
	cfg := b.store.Get()
	menu := b.app.Menu.New()
	// 先显示窗口再执行，窗口隐藏在后台时也能看到结果
	run := func(action string) func(*application.Context) {
		return func(*application.Context) {
			b.showWindow()
			emitTo(b.window, "menu", action)
		}
	}
	lastSep := true
	sep := func() {
		if !lastSep {
			menu.AddSeparator()
			lastSep = true
		}
	}
	for _, item := range settings.TrayMenuItems {
		if (!slices.Contains(cfg.TrayMenu, item.Key) && item.Key != "quit") || (isMac && !item.Mac) {
			continue
		}
		switch item.Key {
		case "show":
			menu.Add(item.Label).OnClick(func(*application.Context) { b.showWindow() })
		case "quit":
			sep()
			menu.Add(item.Label).OnClick(func(*application.Context) { b.app.Quit() })
		case "recent":
			sep()
			recent := slices.DeleteFunc(slices.Clone(cfg.RecentWorkspaces), func(d string) bool { return !dirExists(d) })
			if len(recent) == 0 {
				menu.Add(item.Label).SetEnabled(false)
				break
			}
			sub := menu.AddSubmenu(item.Label)
			for _, dir := range recent {
				dir := dir
				sub.Add(filepath.Base(dir)).SetTooltip(dir).OnClick(func(*application.Context) {
					b.showWindow()
					emitTo(b.window, "open-workspace", dir)
				})
			}
		default:
			if item.Key == "new-file" || item.Key == "ai" {
				sep()
			}
			action := item.Key
			if action == "ai" {
				action = "ai-new-chat"
			}
			menu.Add(item.Label).OnClick(run(action))
		}
		lastSep = false
	}
	return menu
}

func wailsVersion() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, dep := range info.Deps {
			if dep.Path == "github.com/wailsapp/wails/v3" {
				return dep.Version
			}
		}
	}
	return "v3"
}
