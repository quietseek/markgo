package main

import (
	"embed"
	_ "embed"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/quietseek/markgo/internal/files"
	"github.com/quietseek/markgo/internal/platform"
	"github.com/quietseek/markgo/internal/settings"
	"github.com/quietseek/markgo/internal/themes"
)

// Version 应用版本，发布时与 build/config.yml、frontend/package.json 保持一致
const Version = "0.4.3"

const appName = "MarkGo"

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

const isMac = runtime.GOOS == "darwin"

func main() {
	store := settings.New(platform.DataDir(appName), runtime.GOOS, settings.NewKeyringBox(appName))
	themeDir = filepath.Join(store.Dir(), "themes")
	b := newBridge(store)

	app := application.New(application.Options{
		Name:        appName,
		Description: "简洁的桌面 Markdown 写作与笔记应用",
		Icon:        appIcon,
		Services:    []application.Service{application.NewService(b)},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: assetMiddleware,
		},
		Mac: application.MacOptions{
			// 关闭窗口后是否退出由「关闭行为」设置决定
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		Windows: application.WindowsOptions{DisableQuitOnLastWindowClosed: true},
		Linux:   application.LinuxOptions{DisableQuitOnLastWindowClosed: true, ProgramName: "markgo"},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "ai.markgo.app",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				b.onSecondInstance(data.Args, data.WorkingDir)
			},
		},
		FileAssociations: []string{".md", ".markdown"},
		ShouldQuit: func() bool {
			b.quitting.Store(true)
			return true
		},
		OnShutdown:   b.shutdown,
		PostShutdown: b.relaunchIfRequested,
	})
	b.app = app

	// 从访达双击 / 拖到程序坞图标 / 文件关联打开
	app.Event.OnApplicationEvent(events.Common.ApplicationOpenedWithFile, func(e *application.ApplicationEvent) {
		if p := e.Context().Filename(); p != "" {
			b.openPath(p)
		}
	})
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		if !isMac {
			b.ensureTray()
		}
		if p := noteFromArgs(os.Args[1:], ""); p != "" {
			b.openPath(p)
		}
	})
	if isMac {
		// 点击程序坞图标时重新显示隐藏的窗口
		app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) { b.showWindow() })
		app.Menu.SetApplicationMenu(buildAppMenu(app, b))
	}

	b.createWindow()

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

// noteFromArgs 从命令行参数中找出要打开的 Markdown 文件
func noteFromArgs(args []string, cwd string) string {
	for _, a := range args {
		if strings.HasPrefix(a, "-") || !files.IsNote(a) {
			continue
		}
		if !filepath.IsAbs(a) && cwd != "" {
			a = filepath.Join(cwd, a)
		}
		if st, err := os.Stat(a); err == nil && !st.IsDir() {
			return a
		}
	}
	return ""
}

// 导入的 Typora 主题所在目录
var themeDir string

// 编辑器 / 预览中显示本地图片：/mg-asset/<encodeURIComponent(absPath)>，仅允许图片文件
func assetMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Typora 主题文件：/mg-theme/<相对主题目录的路径>
		if rel, ok := strings.CutPrefix(r.URL.Path, themes.URLPrefix); ok {
			file, ok := themes.Resolve(themeDir, rel)
			if !ok {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, file)
			return
		}
		if !strings.HasPrefix(r.URL.Path, files.AssetPrefix) {
			next.ServeHTTP(w, r)
			return
		}
		file, ok := files.DecodeAssetURL(r.URL.EscapedPath())
		if !ok || !(files.IsImagePath(file) || (filepath.Ext(file) == "" && sniffsAsImage(file))) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, file)
	})
}

// 无扩展名的图片（如部分图床下载的文件）按内容判断
func sniffsAsImage(file string) bool {
	f, err := os.Open(file)
	if err != nil {
		return false
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := f.Read(head)
	return strings.HasPrefix(http.DetectContentType(head[:n]), "image/")
}

// relaunch 重新启动应用
func relaunch() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	// macOS 通过 open 重新打开 .app，保证以正常应用身份启动
	if isMac {
		if i := strings.Index(exe, ".app/"); i >= 0 {
			_ = exec.Command("open", "-n", exe[:i+4]).Start()
			return
		}
	}
	args := slices.DeleteFunc(slices.Clone(os.Args[1:]), files.IsNote)
	_ = exec.Command(exe, args...).Start()
}
