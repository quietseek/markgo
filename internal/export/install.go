package export

// 一键安装 Pandoc 与 PDF 引擎：Windows 用 winget，macOS 在终端中用 Homebrew，Linux 用 pkexec + apt

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"time"
)

// 可一键安装的工具
const (
	ToolPandoc = "pandoc"
	ToolPDF    = "pdf"
)

// InstallResult 安装结果
type InstallResult struct {
	// 已在终端中开始安装（macOS），安装完成后需重新检测
	Terminal bool   `json:"terminal,omitempty"`
	Error    string `json:"error,omitempty"`
}

// installPlan 某个平台上安装某个工具的方式
type installPlan struct {
	program string   // 包管理器（winget / brew / apt-get）
	args    []string // 包管理器的参数
}

// installPlans 各平台的安装命令
func installPlans(goos, tool string) (installPlan, bool) {
	switch goos + "/" + tool {
	case "windows/pandoc":
		return installPlan{"winget", []string{"install", "--source", "winget", "--exact", "--id", "JohnMacFarlane.Pandoc"}}, true
	case "windows/pdf":
		return installPlan{"winget", []string{"install", "-e", "--id", "MiKTeX.MiKTeX"}}, true
	case "darwin/pandoc":
		return installPlan{"brew", []string{"install", "pandoc"}}, true
	case "darwin/pdf":
		return installPlan{"brew", []string{"install", "librsvg", "python", "homebrew/cask/basictex"}}, true
	case "linux/pandoc":
		return installPlan{"apt-get", []string{"install", "pandoc"}}, true
	case "linux/pdf":
		return installPlan{"apt-get", []string{"install", "texlive"}}, true
	}
	return installPlan{}, false
}

// InstallCommand 安装命令（显示给用户）
func InstallCommand(tool string) string {
	p, ok := installPlans(runtime.GOOS, tool)
	if !ok {
		return ""
	}
	cmd := p.program + " " + strings.Join(p.args, " ")
	if runtime.GOOS == "linux" {
		cmd = "sudo " + cmd
	}
	return cmd
}

// Install 安装 Pandoc 或 PDF 引擎。Windows / Linux 等待安装完成；macOS 打开终端执行 Homebrew
func Install(ctx context.Context, tool string) InstallResult {
	p, ok := installPlans(runtime.GOOS, tool)
	if !ok {
		return InstallResult{Error: "当前系统不支持一键安装，请按说明手动安装"}
	}
	var err error
	switch runtime.GOOS {
	case "windows":
		err = installWindows(ctx, p)
	case "darwin":
		err = installMac(p)
		if err == nil {
			return InstallResult{Terminal: true}
		}
	default:
		err = installLinux(ctx, p)
	}
	if err != nil {
		return InstallResult{Error: err.Error()}
	}
	return InstallResult{}
}

// 安装耗时较长（MiKTeX、TeX Live 需下载数百 MB）
const installTimeout = 60 * time.Minute

func installWindows(ctx context.Context, p installPlan) error {
	winget := lookPath("winget")
	if winget == "" {
		return errors.New("未找到 winget，请先从 Microsoft Store 安装「应用安装程序」，或下载安装包手动安装")
	}
	args := append(slices.Clone(p.args), "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity")
	out, err := runInstaller(ctx, winget, args)
	if err == nil {
		return nil
	}
	// 已安装（APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED）
	var exit *exec.ExitError
	if errors.As(err, &exit) && uint32(exit.ExitCode()) == 0x8A15002B {
		return nil
	}
	return installError(err, out)
}

func installLinux(ctx context.Context, p installPlan) error {
	apt := lookPath(p.program)
	if apt == "" {
		apt = lookPath("apt")
	}
	if apt == "" {
		return errors.New("未找到 apt，请使用发行版的包管理器手动安装")
	}
	pkexec := lookPath("pkexec")
	if pkexec == "" {
		return fmt.Errorf("未找到 pkexec，无法获取管理员权限，请在终端中执行：sudo %s %s", p.program, strings.Join(p.args, " "))
	}
	args := append([]string{"/usr/bin/env", "DEBIAN_FRONTEND=noninteractive", apt}, p.args...)
	args = append(args, "-y")
	out, err := runInstaller(ctx, pkexec, args)
	if err == nil {
		return nil
	}
	// 126：取消了授权；127：未通过授权
	var exit *exec.ExitError
	if errors.As(err, &exit) && (exit.ExitCode() == 126 || exit.ExitCode() == 127) {
		return errors.New("未获得管理员权限，已取消安装")
	}
	return installError(err, out)
}

// macOS 上 BasicTeX 的安装程序需要输入密码，在终端中执行以便查看进度与输入密码
func installMac(p installPlan) error {
	brew := lookPath("brew")
	if brew == "" {
		return errors.New("未找到 Homebrew，请先安装 Homebrew（https://brew.sh），或下载安装包手动安装")
	}
	script := shellQuote(brew) + " " + strings.Join(p.args, " ")
	osa := fmt.Sprintf("tell application \"Terminal\"\nactivate\ndo script %s\nend tell", appleString(script))
	if out, err := exec.Command("osascript", "-e", osa).CombinedOutput(); err != nil {
		return installError(err, string(out))
	}
	return nil
}

func runInstaller(ctx context.Context, program string, args []string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, installTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, program, args...)
	hideWindow(cmd)
	cmd.Env = append(os.Environ(), "PATH="+searchPath())
	out, err := cmd.CombinedOutput()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return string(out), errors.New("安装超时")
	}
	return string(out), err
}

// 进度条等控制字符
var ansiRe = regexp.MustCompile(`\x1b\[[0-9;?]*[A-Za-z]`)

// installError 附上安装输出的最后几行
func installError(err error, out string) error {
	var lines []string
	for _, l := range strings.Split(ansiRe.ReplaceAllString(out, ""), "\n") {
		// 进度条用 \r 覆盖同一行，只保留最后的内容
		if i := strings.LastIndex(strings.TrimRight(l, "\r"), "\r"); i >= 0 {
			l = l[i+1:]
		}
		if l = strings.TrimSpace(l); l != "" && strings.Trim(l, `-\|/█▒ `) != "" {
			lines = append(lines, l)
		}
	}
	if len(lines) > 8 {
		lines = lines[len(lines)-8:]
	}
	msg := err.Error()
	if len(lines) > 0 {
		msg += "\n" + strings.Join(lines, "\n")
	}
	return fmt.Errorf("安装失败：%s", msg)
}

// shellQuote 用单引号包裹 shell 参数
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// appleString AppleScript 字符串字面量
func appleString(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}
