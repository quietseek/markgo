// Package platform 封装与操作系统相关的能力：移到废纸篓、用户数据目录等。
package platform

import (
	"os"
	"path/filepath"
)

// MoveToTrash 把文件或文件夹移到系统废纸篓 / 回收站
func MoveToTrash(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(abs); err != nil {
		return err
	}
	return moveToTrash(abs)
}
