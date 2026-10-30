package platform

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// 优先使用 gio（GNOME / 多数桌面自带），否则按 freedesktop.org Trash 规范移到 ~/.local/share/Trash
func moveToTrash(path string) error {
	if gio, err := exec.LookPath("gio"); err == nil {
		if exec.Command(gio, "trash", path).Run() == nil {
			return nil
		}
	}
	return freedesktopTrash(path)
}

func freedesktopTrash(path string) error {
	dataHome := os.Getenv("XDG_DATA_HOME")
	if dataHome == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		dataHome = filepath.Join(home, ".local", "share")
	}
	trash := filepath.Join(dataHome, "Trash")
	filesDir, infoDir := filepath.Join(trash, "files"), filepath.Join(trash, "info")
	if err := os.MkdirAll(filesDir, 0o700); err != nil {
		return err
	}
	if err := os.MkdirAll(infoDir, 0o700); err != nil {
		return err
	}
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	name := base
	for i := 2; ; i++ {
		info, err := os.OpenFile(filepath.Join(infoDir, name+".trashinfo"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			escaped := (&url.URL{Path: path}).EscapedPath()
			fmt.Fprintf(info, "[Trash Info]\nPath=%s\nDeletionDate=%s\n", escaped, time.Now().Format("2006-01-02T15:04:05"))
			info.Close()
			break
		}
		if !os.IsExist(err) {
			return err
		}
		name = fmt.Sprintf("%s.%d%s", stem, i, ext)
	}
	if err := os.Rename(path, filepath.Join(filesDir, name)); err != nil {
		os.Remove(filepath.Join(infoDir, name+".trashinfo"))
		return fmt.Errorf("无法移到废纸篓（%v）", err)
	}
	return nil
}
