package images

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLocalModeCopiesIntoAssets(t *testing.T) {
	notes := t.TempDir()
	outside := t.TempDir()
	src := filepath.Join(outside, "pic.png")
	os.WriteFile(src, []byte("png"), 0o644)
	inside := filepath.Join(notes, "img", "in.png")
	os.MkdirAll(filepath.Dir(inside), 0o755)
	os.WriteFile(inside, []byte("png"), 0o644)

	u := &Uploader{Config: func() Config { return Config{Mode: "local", LocalAssetsDir: "assets"} }}
	doc := filepath.Join(notes, "post.md")
	res := u.UploadPaths([]string{src, inside, src}, doc)
	if !res.OK || len(res.URLs) != 3 {
		t.Fatalf("res=%+v", res)
	}
	want := []string{"assets/pic.png", "img/in.png", "assets/pic 2.png"}
	for i, w := range want {
		if res.URLs[i] != w {
			t.Fatalf("urls=%v want %v", res.URLs, want)
		}
	}
	buf := u.UploadBuffer([]byte("data"), "image/PNG!", doc)
	if !buf.OK || filepath.Dir(buf.URLs[0]) != "assets" || filepath.Ext(buf.URLs[0]) != ".imagepng" {
		t.Fatalf("buf=%+v", buf)
	}
	if r := u.UploadPaths([]string{src}, ""); r.OK {
		t.Fatal("unsaved document should fail in local mode")
	}
}
