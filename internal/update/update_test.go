package update

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		sign int
	}{{"0.8.0", "0.7.9", 1}, {"0.7.0", "0.7.0", 0}, {"1.0", "1.0.1", -1}, {"0.10.0", "0.9.0", 1}, {"1.2.3-beta", "1.2.3", 0}}
	for _, c := range cases {
		got := CompareVersions(c.a, c.b)
		if (got > 0) != (c.sign > 0) || (got < 0) != (c.sign < 0) {
			t.Errorf("%s vs %s = %d", c.a, c.b, got)
		}
	}
}

func TestPickAsset(t *testing.T) {
	assets := []Asset{
		{Name: "MarkGo-0.3.0-mac-universal.dmg"},
		{Name: "MarkGo-0.3.0-win-x64-setup.exe"},
		{Name: "MarkGo-0.3.0-linux-x86_64.AppImage"},
		{Name: "MarkGo-0.3.0-linux-amd64.deb"},
	}
	for kind, want := range map[Kind]string{KindMac: "dmg", KindWindows: "exe", KindAppImage: "AppImage", KindDeb: "deb"} {
		if a := PickAsset(assets, kind); a == nil || !strings.HasSuffix(a.Name, want) {
			t.Errorf("%s: %v", kind, a)
		}
	}
	if PickAsset(assets, "") != nil || PickAsset(assets[:1], KindDeb) != nil {
		t.Error("expected no asset")
	}
}

func TestLatestAndDownload(t *testing.T) {
	body := strings.Repeat("x", 1<<20)
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/" + Repo + "/releases/latest":
			w.Write([]byte(`{"tag_name":"v9.0.0","html_url":"https://example.com","assets":[{"name":"MarkGo-9.0.0-linux-amd64.deb","browser_download_url":"` + srv.URL + `/pkg","size":1048576}]}`))
		case "/pkg":
			w.Write([]byte(body))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	apiBase = srv.URL
	c := Latest("0.2.1", KindDeb)
	if !c.OK || !c.HasUpdate || !c.Installable || c.Asset == nil {
		t.Fatalf("check = %+v", c)
	}
	if Latest("0.2.1", KindMac).Installable {
		t.Fatal("mac asset should be missing")
	}
	dest := filepath.Join(t.TempDir(), "pkg")
	var last int64
	if err := Download(c.Asset.URL, dest, func(r, _ int64) { last = r }); err != nil {
		t.Fatal(err)
	}
	if st, _ := os.Stat(dest); st.Size() != int64(len(body)) || last != int64(len(body)) {
		t.Fatalf("size=%d last=%d", st.Size(), last)
	}
	if err := Download(srv.URL+"/missing", dest, nil); err == nil {
		t.Fatal("expected error")
	}
}
