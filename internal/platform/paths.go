package platform

import (
	"os"
	"path/filepath"
)

// DataDir 用户数据目录：macOS ~/Library/Application Support/<app>，Windows %AppData%\<app>，Linux ~/.config/<app>
func DataDir(app string) string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	return filepath.Join(base, app)
}

// DocumentsDir 用户的「文稿」目录，不存在时退回用户主目录
func DocumentsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	for _, name := range []string{"Documents", "文档"} {
		if st, err := os.Stat(filepath.Join(home, name)); err == nil && st.IsDir() {
			return filepath.Join(home, name)
		}
	}
	return home
}
