package platform

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFreedesktopTrash(t *testing.T) {
	data := t.TempDir()
	t.Setenv("XDG_DATA_HOME", data)
	dir := t.TempDir()
	for i := 0; i < 2; i++ {
		file := filepath.Join(dir, "note.md")
		os.WriteFile(file, []byte("x"), 0o644)
		if err := freedesktopTrash(file); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(file); !os.IsNotExist(err) {
			t.Fatal("file still exists")
		}
	}
	entries, _ := os.ReadDir(filepath.Join(data, "Trash", "files"))
	if len(entries) != 2 {
		t.Fatalf("entries=%v", entries)
	}
	info, _ := os.ReadFile(filepath.Join(data, "Trash", "info", "note.md.trashinfo"))
	if !strings.Contains(string(info), "Path="+filepath.Join(dir, "note.md")) {
		t.Fatalf("info=%s", info)
	}
}
