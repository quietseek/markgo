//go:build !windows

package export

import "os/exec"

func hideWindow(*exec.Cmd) {}
