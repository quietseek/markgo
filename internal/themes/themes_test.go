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

func TestSharedAssetFolder(t *testing.T) {
	src, dir := t.TempDir(), filepath.Join(t.TempDir(), "themes")
	css := `@import url("drake/drake.css"); @font-face{src:url('./drake/fonts/a.woff')} body{background:url(https://x.com/a.png)}`
	os.WriteFile(filepath.Join(src, "drake-light.css"), []byte(css), 0o644)
	os.WriteFile(filepath.Join(src, "drake-dark.css"), []byte(css), 0o644)
	os.WriteFile(filepath.Join(src, "base.user.css"), []byte(""), 0o644)
	os.MkdirAll(filepath.Join(src, "drake", "fonts"), 0o755)
	os.WriteFile(filepath.Join(src, "drake", "drake.css"), []byte("a{}"), 0o644)
	os.WriteFile(filepath.Join(src, "drake", "fonts", "a.woff"), []byte("x"), 0o644)

	got, errs := ImportFolder(dir, src)
	if len(errs) != 0 || len(got) != 2 {
		t.Fatalf("import folder: %+v %v", got, errs)
	}
	if _, err := os.Stat(filepath.Join(dir, "drake", "fonts", "a.woff")); err != nil {
		t.Fatal("referenced folder not copied")
	}
	if l := List(dir); len(l) != 2 {
		t.Fatalf("list: %+v", l)
	}
	Remove(dir, "drake-light")
	if _, err := os.Stat(filepath.Join(dir, "drake")); err != nil {
		t.Fatal("shared folder removed while still used")
	}
	Remove(dir, "drake-dark")
	if _, err := os.Stat(filepath.Join(dir, "drake")); err == nil {
		t.Fatal("unused folder kept")
	}
	if _, errs := ImportFolder(dir, t.TempDir()); len(errs) == 0 {
		t.Fatal("empty folder accepted")
	}
}
