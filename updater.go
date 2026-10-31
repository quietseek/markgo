package main

// 应用内自动更新：下载本机安装方式对应的安装包，安装后重启应用

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/quietseek/markgo/internal/update"
)

// 当前 .app 包的路径（不在 .app 中运行时为空）
func appBundle() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if i := strings.Index(exe, ".app/"); i >= 0 {
		return exe[:i+4]
	}
	return ""
}

// installKind 判断本机的安装方式；开发构建等无法自动更新的情况返回空
func installKind() update.Kind {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	switch runtime.GOOS {
	case "darwin":
		if appBundle() != "" {
			return update.KindMac
		}
	case "windows":
		// 由安装程序安装的才有卸载程序
		if _, err := os.Stat(filepath.Join(filepath.Dir(exe), "uninstall.exe")); err == nil {
			return update.KindWindows
		}
	case "linux":
		if strings.HasPrefix(exe, "/usr/") {
			if _, err := exec.LookPath("dpkg"); err == nil {
				return update.KindDeb
			}
		}
	}
	return ""
}

func (b *Bridge) CheckUpdate() update.Check { return update.Latest(Version, installKind()) }

type updateProgress struct {
	Phase    string `json:"phase"` // download | install
	Received int64  `json:"received"`
	Total    int64  `json:"total"`
}

type installResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// InstallUpdate 下载并安装最新版本，成功后退出并重新启动应用
func (b *Bridge) InstallUpdate() installResult {
	if !b.updating.CompareAndSwap(false, true) {
		return installResult{Error: "正在更新中"}
	}
	if err := b.installUpdate(); err != nil {
		b.updating.Store(false)
		return installResult{Error: err.Error()}
	}
	// 稍后退出，让前端先收到结果
	go func() {
		time.Sleep(300 * time.Millisecond)
		b.quitting.Store(true)
		b.app.Quit()
	}()
	return installResult{OK: true}
}

func (b *Bridge) installUpdate() error {
	kind := installKind()
	c := update.Latest(Version, kind)
	switch {
	case !c.OK:
		return errors.New(c.Error)
	case !c.HasUpdate:
		return errors.New("已是最新版本")
	case c.Asset == nil:
		return errors.New("当前安装方式不支持自动更新，请前往下载页手动安装")
	}

	dir, err := os.MkdirTemp("", "markgo-update-")
	if err != nil {
		return err
	}
	dest := filepath.Join(dir, "."+c.Asset.Name+".download")
	err = update.Download(c.Asset.URL, dest, func(received, total int64) {
		b.emit("update:progress", updateProgress{Phase: "download", Received: received, Total: total})
	})
	if err != nil {
		os.Remove(dest)
		return err
	}

	b.emit("update:progress", updateProgress{Phase: "install"})
	// 让前端先把未保存的修改写盘
	b.emit("app:save", nil)
	time.Sleep(1200 * time.Millisecond)

	switch kind {
	case update.KindWindows:
		return installWindows(dest)
	case update.KindMac:
		if err := installMac(dest); err != nil {
			return err
		}
	case update.KindDeb:
		// pkexec 弹出系统的管理员授权窗口
		if out, err := exec.Command("pkexec", "dpkg", "-i", dest).CombinedOutput(); err != nil {
			return fmt.Errorf("安装失败：%s", strings.TrimSpace(string(out)+" "+err.Error()))
		}
	}
	b.relaunch.Store(true)
	return nil
}

// Windows：应用退出后静默运行安装程序（会弹出管理员授权），无论成败都重新打开应用
func installWindows(setup string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	q := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	script := fmt.Sprintf(
		"Wait-Process -Id %d -Timeout 30 -ErrorAction SilentlyContinue; try { Start-Process -FilePath %s -ArgumentList '/S' -Wait } finally { Start-Process -FilePath %s }",
		os.Getpid(), q(setup), q(exe),
	)
	return exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script).Start()
}

// macOS：挂载 dmg，用其中的 .app 替换当前的 .app 包
func installMac(dmg string) error {
	target := appBundle()
	if target == "" {
		return errors.New("找不到当前应用的位置")
	}
	mount, err := os.MkdirTemp("", "markgo-dmg-")
	if err != nil {
		return err
	}
	if out, err := exec.Command("hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, dmg).CombinedOutput(); err != nil {
		return fmt.Errorf("无法打开安装包：%s", strings.TrimSpace(string(out)))
	}
	defer exec.Command("hdiutil", "detach", "-force", mount).Run()
	apps, _ := filepath.Glob(filepath.Join(mount, "*.app"))
	if len(apps) == 0 {
		return errors.New("安装包中没有找到应用")
	}
	staging, old := target+".update", target+".old"
	os.RemoveAll(staging)
	os.RemoveAll(old)
	if out, err := exec.Command("ditto", apps[0], staging).CombinedOutput(); err != nil {
		os.RemoveAll(staging)
		return fmt.Errorf("没有权限写入 %s，请手动安装：%s", filepath.Dir(target), strings.TrimSpace(string(out)))
	}
	if err := os.Rename(target, old); err != nil {
		os.RemoveAll(staging)
		return fmt.Errorf("无法替换应用：%v", err)
	}
	if err := os.Rename(staging, target); err != nil {
		os.Rename(old, target)
		return fmt.Errorf("无法替换应用：%v", err)
	}
	os.RemoveAll(old)
	_ = exec.Command("xattr", "-dr", "com.apple.quarantine", target).Run()
	return nil
}
