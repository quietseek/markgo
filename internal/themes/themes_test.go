package themes

import (
	"os"
	"path/filepath"
	"testing"
)

func TestImportListRemove(t *testing.T) {
	src, dir := t.TempDir(), filepath.Join(t.TempDir(), "themes")
	os.WriteFile(filepath.Join(src, "drake-light.css"), []byte("#write{}"), 0o644)
	os.MkdirAll(filepath.Join(src, "drake-light", "fonts"), 0o755)
	os.WriteFile(filepath.Join(src, "drake-light", "fonts", "a.woff"), []byte("x"), 0o644)

	th, err := Import(dir, filepath.Join(src, "drake-light.css"))
	if err != nil || th.ID != "drake-light" || th.Name != "Drake Light" {
		t.Fatalf("import: %+v %v", th, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "drake-light", "fonts", "a.woff")); err != nil {
		t.Fatal("assets folder not copied")
	}
	if l := List(dir); len(l) != 1 || l[0].ID != "drake-light" {
		t.Fatalf("list: %+v", l)
	}
	if _, err := Import(dir, filepath.Join(src, "x.txt")); err == nil {
		t.Fatal("non-css accepted")
	}
	if err := Remove(dir, "drake-light"); err != nil {
		t.Fatal(err)
	}
	if l := List(dir); len(l) != 0 {
		t.Fatalf("not removed: %+v", l)
	}
	if Remove(dir, "../x") == nil {
		t.Fatal("invalid id accepted")
	}
}

func TestResolve(t *testing.T) {
	dir := t.TempDir()
	if p, ok := Resolve(dir, "night/codeblock.dark.css"); !ok || p != filepath.Join(dir, "night", "codeblock.dark.css") {
		t.Fatal(p, ok)
	}
	for _, bad := range []string{"", "../secret", "night/../../x"} {
		if _, ok := Resolve(dir, bad); ok {
			t.Fatal("accepted", bad)
		}
	}
}
