package files

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestListTreeSortsDirsFirstNaturally(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"笔记10.md", "笔记2.md", "a.txt", "image.png", ".hidden.md"} {
		os.WriteFile(filepath.Join(root, name), nil, 0o644)
	}
	os.MkdirAll(filepath.Join(root, "z目录", "sub"), 0o755)
	os.MkdirAll(filepath.Join(root, "node_modules"), 0o755)
	tree := ListTree(root, false)
	var names []string
	for _, n := range tree {
		names = append(names, n.Name)
	}
	want := []string{"z目录", "a.txt", "笔记2.md", "笔记10.md"}
	if len(names) != len(want) {
		t.Fatalf("names=%v", names)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("names=%v want %v", names, want)
		}
	}
	if len(ListTree(root, true)) != 5 {
		t.Fatal("hidden files should be listed when enabled")
	}
}

func TestListTreeSkipsFoldersWithoutNotes(t *testing.T) {
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "assets"), 0o755)
	os.WriteFile(filepath.Join(root, "assets", "a.png"), nil, 0o644)
	os.MkdirAll(filepath.Join(root, "src", "deep"), 0o755)
	os.WriteFile(filepath.Join(root, "src", "deep", "main.go"), nil, 0o644)
	os.MkdirAll(filepath.Join(root, "posts", "img"), 0o755)
	os.WriteFile(filepath.Join(root, "posts", "img", "b.png"), nil, 0o644)
	os.WriteFile(filepath.Join(root, "posts", "hello.md"), nil, 0o644)
	os.MkdirAll(filepath.Join(root, "新建文件夹"), 0o755)
	tree := ListTree(root, false)
	var names []string
	for _, n := range tree {
		names = append(names, n.Name)
	}
	if len(names) != 2 || names[0] != "posts" || names[1] != "新建文件夹" {
		t.Fatalf("names=%v", names)
	}
	if posts := tree[0].Children; len(posts) != 1 || posts[0].Name != "hello.md" {
		t.Fatalf("posts=%v", posts)
	}
}

func TestCreateAndRename(t *testing.T) {
	dir := t.TempDir()
	a, err := CreateEntry(dir, "草稿", "file")
	if err != nil || filepath.Base(a) != "草稿.md" {
		t.Fatalf("a=%s err=%v", a, err)
	}
	b, _ := CreateEntry(dir, "草稿", "file")
	if filepath.Base(b) != "草稿 2.md" {
		t.Fatalf("b=%s", b)
	}
	if _, err := RenameEntry(b, "草稿"); err == nil {
		t.Fatal("expected conflict error")
	}
	c, err := RenameEntry(b, "a/b:c")
	if err != nil || filepath.Base(c) != "a b c.md" {
		t.Fatalf("c=%s err=%v", c, err)
	}
}

func TestResolveLocalImagePath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX paths")
	}
	doc := "/notes/post.md"
	cases := map[string]string{
		"assets/a%20b.png?x=1":                  "/notes/assets/a b.png",
		"/abs/x.png":                            "/abs/x.png",
		"file:///tmp/y.png":                     "/tmp/y.png",
		"/mg-asset/%2Ftmp%2Fz.png":              "/tmp/z.png",
		"wails://wails/mg-asset/%2Ftmp%2Fz.png": "/tmp/z.png",
		"https://example.com/a.png":             "",
		"data:image/png;base64,xx":              "",
	}
	for src, want := range cases {
		if got := ResolveLocalImagePath(src, doc); got != want {
			t.Errorf("%s: got %q want %q", src, got, want)
		}
	}
	if got := ResolveLocalImagePath("a.png", ""); got != "" {
		t.Errorf("relative without doc: %q", got)
	}
}

func TestRenameDoesNotOverwriteCaseVariant(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.md")
	os.WriteFile(a, []byte("a"), 0o644)
	upper := filepath.Join(dir, "A.md")
	if _, err := os.Stat(upper); err == nil {
		// 不区分大小写的文件系统：仅改大小写应当成功
		if got, err := RenameEntry(a, "A"); err != nil || filepath.Base(got) != "A.md" {
			t.Fatalf("got=%s err=%v", got, err)
		}
		return
	}
	os.WriteFile(upper, []byte("A"), 0o644)
	if _, err := RenameEntry(a, "A"); err == nil {
		t.Fatal("expected conflict on case-sensitive filesystem")
	}
	if raw, _ := os.ReadFile(upper); string(raw) != "A" {
		t.Fatal("existing file was overwritten")
	}
}

func TestIsInside(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	cases := map[string]bool{
		filepath.Join(root, "a.md"):               true,
		filepath.Join(root, "sub", "b.md"):        true,
		root:                                      false,
		filepath.Join(root+"2", "c.md"):           false,
		filepath.Join(filepath.Dir(root), "d.md"): false,
		filepath.Join(root, "..", "e.md"):         false,
	}
	for p, want := range cases {
		if got := IsInside(p, root); got != want {
			t.Errorf("IsInside(%q) = %v, want %v", p, got, want)
		}
	}
}
