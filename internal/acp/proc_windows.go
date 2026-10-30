package acp

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

const createNoWindow = 0x08000000

func shellCommand(command string) *exec.Cmd {
	shell := os.Getenv("ComSpec")
	if shell == "" {
		shell = "cmd.exe"
	}
	cmd := exec.Command(shell)
	// CmdLine 是完整命令行（含程序名），原样交给 cmd /d /s /c，避免 Go 对参数再次加引号
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine:       `"` + shell + `" /d /s /c "` + command + `"`,
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return cmd
}

// 结束 cmd 及其拉起的 node 等子进程
func killTree(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	kill := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
	kill.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	if kill.Run() != nil {
		_ = cmd.Process.Kill()
	}
}

func signalDescription(*os.ProcessState) string { return "" }
