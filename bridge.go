package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/quietseek/markgo/internal/acp"
	"github.com/quietseek/markgo/internal/files"
	"github.com/quietseek/markgo/internal/imagegen"
	"github.com/quietseek/markgo/internal/images"
	"github.com/quietseek/markgo/internal/platform"
	"github.com/quietseek/markgo/internal/settings"
	"github.com/quietseek/markgo/internal/update"
	"github.com/quietseek/markgo/internal/wechat"
)

// Bridge 绑定到前端的服务：前端 window.markgo 的每个方法都对应这里的一个方法
// （见 frontend/src/bridge.ts）
type Bridge struct {
	app      *application.App
	window   *application.WebviewWindow
	store    *settings.Store
	acp      *acp.Manager
	uploader *images.Uploader
	wechat   *wechat.Client

	// 本次启动是否使用系统原生窗口按钮（与平台习惯一致时），否则由前端绘制；切换需重启
	nativeControls bool
	// 用户确认退出（菜单、托盘、⌘Q）后为 true；此前点关闭按钮按「关闭行为」设置处理
	quitting atomic.Bool
	relaunch atomic.Bool
	// 自动更新进行中
	updating      atomic.Bool
	trayMu        sync.Mutex
	tray          *application.SystemTray
	openMu        sync.Mutex
	pending       string // 前端就绪前收到的待打开文件（双击 / 拖到图标 / 命令行），由前端启动时取走
	ready         bool
	activeDoc     atomic.Value // string
	owner         *Bridge
	windowsMu     sync.Mutex
	windows       map[uint]*Bridge
	focused       *Bridge
	routeMu       sync.Mutex
	settingsMu    sync.Mutex
	workspace     string // guarded by openMu; window-local, unlike persisted last-used defaults
	lastFile      string
	document      string // claimed by this window while loading/editing
	scratch       string
	fresh         bool
	allowClose    atomic.Bool
	quitPending   map[uint]bool
	quitCancelled bool
}

func newBridge(store *settings.Store) *Bridge {
	b := &Bridge{store: store}
	cfg := store.Get()
	b.owner = b
	b.windows = make(map[uint]*Bridge)
	b.workspace, b.lastFile = cfg.LastWorkspace, cfg.LastFile
	b.nativeControls = nativeControlsFor(&cfg)
	b.activeDoc.Store("")
	b.uploader = &images.Uploader{Config: func() images.Config {
		s := store.Get()
		return images.Config{Mode: s.ImageUploadMode, PicgoServer: s.PicgoServer, LocalAssetsDir: s.LocalAssetsDir}
	}}
	b.wechat = &wechat.Client{Config: func() settings.WechatConfig { return store.Get().Wechat }}
	b.acp = acp.NewManager(acp.Host{
		Emit: func(e acp.Event) { emitTo(b.window, "ai:event", e) },
		Profile: func() *settings.AgentProfile {
			s := store.Get()
			return s.ActiveAgent()
		},
		Cwd:     b.agentCwd,
		Version: Version,
	})
	return b
}

// 仅 macOS 的红绿灯在左侧时可用系统按钮；Windows / Linux 为无边框窗口，按钮由前端绘制
func nativeControlsFor(s *settings.AppSettings) bool {
	return isMac && s.WindowControls == "traffic" && s.TrafficPosition == "left"
}

func (b *Bridge) ServiceName() string { return "Bridge" }

// 向前端发送事件；退出过程中 Agent 仍可能上报状态，此时应用已不在运行，忽略即可
func (b *Bridge) emit(name string, data any) {
	if b.app != nil {
		b.app.Event.Emit(name, data)
	}
}

// 只向一个窗口发送事件
func emitTo(w *application.WebviewWindow, name string, data any) {
	if w != nil {
		w.DispatchWailsEvent(&application.CustomEvent{Name: name, Data: data})
	}
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

// Agent 会话的工作目录：笔记库 > 当前文档目录 > 用户目录
func (b *Bridge) agentCwd() string {
	if ws := b.sessionSettings().LastWorkspace; ws != "" && dirExists(ws) {
		return ws
	}
	if doc, _ := b.activeDoc.Load().(string); doc != "" && dirExists(filepath.Dir(doc)) {
		return filepath.Dir(doc)
	}
	home, _ := os.UserHomeDir()
	return home
}

// ---------- 窗口 ----------

var (
	lightBg = application.NewRGB(0xff, 0xff, 0xff)
	darkBg  = application.NewRGB(0x1b, 0x1c, 0x1f)
)

func (b *Bridge) createWindow() {
	hidden := application.ButtonEnabled
	if isMac && !b.nativeControls {
		hidden = application.ButtonHidden
	}
	w := b.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:      "editor-" + windowToken(),
		Title:     appName,
		Width:     1320,
		Height:    860,
		MinWidth:  760,
		MinHeight: 520,
		URL:       "/",
		// Windows / Linux 使用无边框窗口，标题栏与窗口按钮由前端绘制
		Frameless:           !isMac,
		BackgroundColour:    lightBg,
		MinimiseButtonState: hidden,
		MaximiseButtonState: hidden,
		CloseButtonState:    hidden,
		Mac: application.MacWindow{
			TitleBar:                application.MacTitleBarHiddenInset,
			InvisibleTitleBarHeight: 44,
		},
		Windows: application.WindowsWindow{DisableMenu: true},
	})
	w.OnWindowEvent(events.Common.WindowMaximise, func(*application.WindowEvent) { emitTo(w, "window:maximized", true) })
	w.OnWindowEvent(events.Common.WindowUnMaximise, func(*application.WindowEvent) { emitTo(w, "window:maximized", false) })
	b.window = w
	b.owner.windowsMu.Lock()
	b.owner.windows[w.ID()] = b
	b.owner.focused = b
	b.owner.windowsMu.Unlock()
	w.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		if b.owner.quitting.Load() || b.allowClose.Load() {
			return
		}
		e.Cancel()
		emitTo(w, "window:close-request", nil)
	})
}

func (b *Bridge) showWindow() {
	if b.window == nil {
		return
	}
	if b.window.IsMinimised() {
		b.window.Restore()
	}
	b.window.Show()
	b.window.Focus()
}

func (b *Bridge) Platform() string { return runtime.GOOS }

func (b *Bridge) NativeControls(ctx context.Context) bool {
	b = b.session(ctx)
	return b.nativeControls
}

func (b *Bridge) SetDark(ctx context.Context, dark bool) {
	b = b.session(ctx)

	if b.window != nil {
		b.window.SetBackgroundColour(map[bool]application.RGBA{true: darkBg, false: lightBg}[dark])
	}
}

func (b *Bridge) Minimize(ctx context.Context) {
	b = b.session(ctx)

	if b.window != nil {
		b.window.Minimise()
	}
}

func (b *Bridge) ToggleMaximize(ctx context.Context) {
	b = b.session(ctx)

	if b.window != nil {
		b.window.ToggleMaximise()
	}
}

func (b *Bridge) CloseWindow(ctx context.Context) {
	b = b.session(ctx)

	if b.window != nil {
		b.window.Close()
	}
}

func (b *Bridge) promptRelaunch() {
	dialog := b.app.Dialog.Info().SetTitle(appName).SetMessage("窗口样式将在重启后生效")
	if b.window != nil {
		dialog.AttachToWindow(b.window)
	}
	restart := dialog.AddButton("立即重启")
	restart.OnClick(func() {
		b.owner.relaunch.Store(true)
		b.app.Quit()
	})
	dialog.SetDefaultButton(restart)
	dialog.SetCancelButton(dialog.AddButton("稍后"))
	dialog.Show()
}

func (b *Bridge) relaunchIfRequested() {
	if b.relaunch.Load() {
		relaunch()
	}
}

func (b *Bridge) shutdown() {
	b.quitting.Store(true)
	for _, session := range b.sessions() {
		session.acp.Dispose()
	}
}

// ---------- 打开文件 ----------

// openPath 在主窗口中打开文档；笔记库之外的文档由前端把笔记库切换到其所在文件夹。
// 主窗口前端尚未就绪（例如双击文件启动应用）时排队，等前端就绪后取走
func (b *Bridge) openPath(file string) {
	b.openMu.Lock()
	defer b.openMu.Unlock()
	if !b.ready {
		b.pending = file
		return
	}
	b.showWindow()
	emitTo(b.window, "open-path", file)
}

func (b *Bridge) onSecondInstance(args []string, cwd string) {
	if p := noteFromArgs(args, cwd); p != "" {
		b.openExternal(p)
		return
	}
	b.activeSession().showWindow()
}

// PageLoading 前端（重新）加载时调用：在前端取走待打开文件之前，新的打开请求先排队
func (b *Bridge) PageLoading(ctx context.Context) {
	b = b.session(ctx)

	b.openMu.Lock()
	b.ready = false
	b.openMu.Unlock()
}

// TakeOpenPath 前端启动时取走待打开的文件
func (b *Bridge) TakeOpenPath(ctx context.Context) *string {
	b = b.session(ctx)

	b.openMu.Lock()
	defer b.openMu.Unlock()
	b.ready = true
	b.fresh = false
	p := b.pending
	b.pending = ""
	if p == "" {
		return nil
	}
	return &p
}

// ---------- 设置 ----------

func (b *Bridge) GetSettings(ctx context.Context) settings.AppSettings {
	return b.session(ctx).sessionSettings()
}

func (b *Bridge) SetSettings(ctx context.Context, patch map[string]json.RawMessage) (settings.AppSettings, error) {
	b = b.session(ctx)
	b.owner.settingsMu.Lock()
	defer b.owner.settingsMu.Unlock()
	launchKey := func(s settings.AppSettings) string {
		if a := s.ActiveAgent(); a != nil {
			return a.ID + "\n" + a.Command
		}
		return ""
	}
	prev := b.store.Get()
	next, err := b.store.Set(patch)
	if err != nil {
		return next, err
	}
	// 当前 Agent 或其启动命令变化后断开，下次提问时按新配置启动
	if _, ok := patch["ai"]; ok && launchKey(prev) != launchKey(next) {
		for _, session := range b.sessions() {
			if session.acp.Status() != acp.StatusIdle {
				session.acp.Stop()
			}
		}
	}
	b.openMu.Lock()
	if _, ok := patch["lastWorkspace"]; ok {
		b.workspace = next.LastWorkspace
	}
	if _, ok := patch["lastFile"]; ok {
		b.lastFile = next.LastFile
	}
	b.openMu.Unlock()
	_, trayChanged := patch["trayMenu"]
	_, recentChanged := patch["recentWorkspaces"]
	if trayChanged || recentChanged {
		b.owner.refreshTrayMenu()
	}
	if nextNative := nativeControlsFor(&next); nextNative != nativeControlsFor(&prev) && nextNative != b.nativeControls {
		b.promptRelaunch()
	}
	for k := range patch {
		if k != "lastWorkspace" && k != "lastFile" {
			b.emit("settings:changed", nil)
			break
		}
	}
	return b.sessionSettings(), nil
}

// ---------- 文件 ----------

func (b *Bridge) openDialog() *application.OpenFileDialogStruct {
	d := b.app.Dialog.OpenFile()
	if b.window != nil {
		d.AttachToWindow(b.window)
	}
	return d
}

func (b *Bridge) saveDialog(dir, name string) *application.SaveFileDialogStruct {
	d := b.app.Dialog.SaveFile().SetDirectory(dir).SetFilename(name).CanCreateDirectories(true)
	if b.window != nil {
		d.AttachToWindow(b.window)
	}
	return d
}

func (b *Bridge) OpenFolder(ctx context.Context) (string, error) {
	b = b.session(ctx)

	return b.openDialog().CanChooseDirectories(true).CanChooseFiles(false).CanCreateDirectories(true).PromptForSingleSelection()
}

func (b *Bridge) OpenFile(ctx context.Context) (string, error) {
	b = b.session(ctx)

	return b.openDialog().AddFilter("Markdown", "*.md;*.markdown;*.txt").PromptForSingleSelection()
}

func (b *Bridge) PickImage(ctx context.Context) (string, error) {
	b = b.session(ctx)

	return b.openDialog().AddFilter("图片", "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp;*.svg").PromptForSingleSelection()
}

func (b *Bridge) Exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func (b *Bridge) ListTree(root string) []files.FileNode {
	return files.ListTree(root, b.store.Get().ShowHiddenFiles)
}

func (b *Bridge) ReadFile(p string) (string, error) {
	raw, err := os.ReadFile(p)
	return string(raw), err
}

func (b *Bridge) WriteFile(p, content string) error {
	return os.WriteFile(p, []byte(content), 0o644)
}

func (b *Bridge) CreateEntry(dir, name, kind string) (string, error) {
	return files.CreateEntry(dir, name, kind)
}

func (b *Bridge) RenameEntry(p, name string) (string, error) { return files.RenameEntry(p, name) }

func (b *Bridge) MoveEntry(p, destDir string) (string, error) { return files.MoveEntry(p, destDir) }

func (b *Bridge) RemoveEntry(p string) error { return platform.MoveToTrash(p) }

func (b *Bridge) Reveal(p string) error { return b.app.Env.OpenFileManager(p, true) }

// ScratchPath 未命名草稿的持久化路径（位于用户数据目录）
func (b *Bridge) ScratchPath(ctx context.Context) (string, error) {
	b = b.session(ctx)

	p := b.scratch
	if p == "" {
		p = filepath.Join(b.store.Dir(), "scratch.md")
	}
	if _, err := os.Stat(p); err == nil {
		return p, nil
	}
	if err := os.MkdirAll(b.store.Dir(), 0o755); err != nil {
		return "", err
	}
	return p, os.WriteFile(p, nil, 0o644)
}

func (b *Bridge) SaveAs(ctx context.Context, content, suggestedName string) (string, error) {
	b = b.session(ctx)

	dir := b.sessionSettings().LastWorkspace
	if dir == "" {
		dir = platform.DocumentsDir()
	}
	if suggestedName == "" {
		suggestedName = "未命名.md"
	}
	p, err := b.saveDialog(dir, suggestedName).AddFilter("Markdown", "*.md").PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	b.openMu.Lock()
	previous := b.document
	b.openMu.Unlock()
	if !b.ClaimDocument(ctx, p) {
		return "", errors.New("该文件已在另一个窗口打开，请在对应窗口保存")
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		b.ClaimDocument(ctx, previous)
		return "", err
	}
	return p, nil
}

var dataURIRe = regexp.MustCompile(`(?s)^data:[^;,]*;base64,(.*)$`)

// SaveFile 导出图表等文件：data 为文本或 base64 data URI（二进制）
func (b *Bridge) SaveFile(ctx context.Context, data, suggestedName string) (string, error) {
	b = b.session(ctx)

	ext := strings.TrimPrefix(filepath.Ext(suggestedName), ".")
	if ext == "" {
		ext = "txt"
	}
	p, err := b.saveDialog(platform.DocumentsDir(), suggestedName).AddFilter(strings.ToUpper(ext), "*."+ext).PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	content := []byte(data)
	if m := dataURIRe.FindStringSubmatch(data); m != nil {
		if content, err = base64.StdEncoding.DecodeString(m[1]); err != nil {
			return "", err
		}
	}
	return p, os.WriteFile(p, content, 0o644)
}

func (b *Bridge) ExportHtml(ctx context.Context, html, suggestedName string) (string, error) {
	b = b.session(ctx)

	if suggestedName == "" {
		suggestedName = "导出.html"
	}
	p, err := b.saveDialog(platform.DocumentsDir(), suggestedName).AddFilter("HTML", "*.html").PromptForSingleSelection()
	if err != nil || p == "" {
		return "", err
	}
	return p, os.WriteFile(p, []byte(html), 0o644)
}

// ---------- 图片 ----------

func (b *Bridge) UploadPaths(paths []string, docPath string) images.UploadResult {
	return b.uploader.UploadPaths(paths, docPath)
}

// UploadBuffer data 为 base64 编码的二进制图片
func (b *Bridge) UploadBuffer(data []byte, ext, docPath string) images.UploadResult {
	return b.uploader.UploadBuffer(data, ext, docPath)
}

func (b *Bridge) TestPicgo() images.UploadResult { return b.uploader.TestPicgo() }

func (b *Bridge) UploadToHost(src, docPath string) images.UploadResult {
	return b.uploader.UploadToHost(src, docPath)
}

func (b *Bridge) DownloadImage(src, docPath string) images.UploadResult {
	return b.uploader.DownloadToAssets(src, docPath)
}

func (b *Bridge) GenerateImage(prompt string) imagegen.Result {
	return imagegen.Generate(b.store.Get().ImageGen, prompt)
}

// RevealImage 在文件管理器中显示本地图片；找不到时返回 false
func (b *Bridge) RevealImage(src, docPath string) bool {
	p := files.ResolveLocalImagePath(src, docPath)
	if p == "" || !b.Exists(p) {
		return false
	}
	return b.app.Env.OpenFileManager(p, true) == nil
}

// ---------- 发布 ----------

func (b *Bridge) WechatTest() wechat.TestResult { return b.wechat.TestConnection() }

func (b *Bridge) WechatPublish(input wechat.DraftInput) wechat.DraftResult {
	return b.wechat.PublishDraft(input)
}

var httpURL = regexp.MustCompile(`(?i)^https?:`)

func (b *Bridge) OpenExternal(url string) error {
	if !httpURL.MatchString(url) {
		return errors.New("只能打开 http(s) 链接")
	}
	return b.app.Browser.OpenURL(url)
}

// ---------- AI ----------

type startResult struct {
	OK    bool           `json:"ok"`
	Info  *acp.AgentInfo `json:"info,omitempty"`
	Error string         `json:"error,omitempty"`
}

func (b *Bridge) AiStart(ctx context.Context) startResult {
	b = b.session(ctx)

	info, err := b.acp.Start()
	if err != nil {
		return startResult{Error: err.Error()}
	}
	return startResult{OK: true, Info: info}
}

func (b *Bridge) AiStop(ctx context.Context) {
	b = b.session(ctx)
	b.acp.Stop()
}

type promptResult struct {
	OK         bool   `json:"ok"`
	StopReason string `json:"stopReason,omitempty"`
	Error      string `json:"error,omitempty"`
}

func (b *Bridge) AiPrompt(ctx context.Context, input acp.PromptInput) promptResult {
	b = b.session(ctx)

	stop, err := b.acp.Prompt(input)
	if err != nil {
		return promptResult{Error: err.Error()}
	}
	return promptResult{OK: true, StopReason: stop}
}

func (b *Bridge) AiCancel(ctx context.Context, channel string) {
	b = b.session(ctx)
	b.acp.Cancel(channel)
}

func (b *Bridge) AiRespondPermission(ctx context.Context, requestID string, optionID *string) {
	b = b.session(ctx)

	b.acp.RespondPermission(requestID, optionID)
}

func (b *Bridge) AiResolveWrite(ctx context.Context, requestID string, accepted bool, content *string) {
	b = b.session(ctx)

	b.acp.ResolveWrite(requestID, accepted, content)
}

func (b *Bridge) AiSetActiveDoc(ctx context.Context, path *string, markdown string) {
	b = b.session(ctx)

	if path != nil {
		b.activeDoc.Store(*path)
	} else {
		b.activeDoc.Store("")
	}
	b.acp.SetActiveDoc(path, markdown)
}

func (b *Bridge) AiMarkSaved(ctx context.Context, path, content string) {
	b = b.session(ctx)
	b.acp.MarkSaved(path, content)
}

// ---------- 应用 ----------

type appInfo struct {
	Version  string `json:"version"`
	Wails    string `json:"wails"`
	Go       string `json:"go"`
	Platform string `json:"platform"`
	Homepage string `json:"homepage"`
}

func (b *Bridge) AppInfo() appInfo {
	return appInfo{
		Version:  Version,
		Wails:    wailsVersion(),
		Go:       strings.TrimPrefix(runtime.Version(), "go"),
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
		Homepage: update.RepoURL,
	}
}
