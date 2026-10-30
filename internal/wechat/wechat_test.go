package wechat

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/quietseek/markgo/internal/settings"
)

func pngBytes(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		for y := 0; y < h; y++ {
			img.Set(x, y, color.NRGBA{uint8(x * 7), uint8(y * 13), uint8(x ^ y), 255})
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func TestNormalizeConvertsLargeImagesToJPEG(t *testing.T) {
	big := pngBytes(2000, 1200)
	if len(big) <= contentImageLimit {
		// 噪点图压缩率低，正常应超过 1MB；不足时手动构造超限
		big = append(big, make([]byte, contentImageLimit)...)
	}
	out, err := normalizeForContent(loadedImage{buf: big, ext: "png"})
	if err != nil {
		t.Fatal(err)
	}
	if out.ext != "jpg" || len(out.buf) > contentImageLimit {
		t.Fatalf("ext=%s size=%d", out.ext, len(out.buf))
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(out.buf))
	if err != nil || cfg.Width != 1080 {
		t.Fatalf("width=%d err=%v", cfg.Width, err)
	}
	small := pngBytes(10, 10)
	if same, _ := normalizeForContent(loadedImage{buf: small, ext: "png"}); !bytes.Equal(same.buf, small) {
		t.Fatal("small png should be kept as is")
	}
}

func TestPublishDraftRehostsImages(t *testing.T) {
	var mu sync.Mutex
	var draft map[string]any
	uploads := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		defer mu.Unlock()
		switch r.URL.Path {
		case "/stable_token":
			w.Write([]byte(`{"access_token":"tok","expires_in":7200}`))
		case "/media/uploadimg":
			uploads++
			w.Write([]byte(`{"url":"https://mmbiz.qpic.cn/x.png"}`))
		case "/material/add_material":
			w.Write([]byte(`{"media_id":"thumb1"}`))
		case "/draft/add":
			json.Unmarshal(body, &draft)
			w.Write([]byte(`{"media_id":"draft1"}`))
		default:
			w.Write([]byte(`{"errcode":40001,"errmsg":"bad"}`))
		}
	}))
	defer srv.Close()
	t.Setenv("MARKGO_WECHAT_API", srv.URL)

	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.png"), pngBytes(4, 4), 0o644)
	c := &Client{Config: func() settings.WechatConfig {
		return settings.WechatConfig{AppID: "wx", AppSecret: "s", Author: "默认作者", OpenComment: true}
	}}
	res := c.PublishDraft(DraftInput{
		Title:   "  标题  ",
		Content: `<p><img src="a.png" alt=""><img src='https://mmbiz.qpic.cn/keep.png'><img src="a.png"></p>`,
		DocPath: filepath.Join(dir, "post.md"),
	})
	if !res.OK || res.MediaID != "draft1" {
		t.Fatalf("res=%+v", res)
	}
	article := draft["articles"].([]any)[0].(map[string]any)
	content := article["content"].(string)
	if uploads != 1 || strings.Contains(content, `src="a.png"`) || !strings.Contains(content, `'https://mmbiz.qpic.cn/keep.png'`) {
		t.Fatalf("uploads=%d content=%s", uploads, content)
	}
	if article["title"] != "标题" || article["author"] != "默认作者" || article["thumb_media_id"] != "thumb1" || article["need_open_comment"] != float64(1) {
		t.Fatalf("article=%v", article)
	}
}

func TestPublishRequiresCover(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"access_token":"tok","expires_in":7200}`))
	}))
	defer srv.Close()
	t.Setenv("MARKGO_WECHAT_API", srv.URL)
	c := &Client{Config: func() settings.WechatConfig { return settings.WechatConfig{AppID: "wx", AppSecret: "s"} }}
	if res := c.PublishDraft(DraftInput{Title: "t", Content: "<p>无图</p>"}); res.OK || !strings.Contains(res.Error, "封面图") {
		t.Fatalf("res=%+v", res)
	}
}

func TestErrorHints(t *testing.T) {
	if msg := (&apiError{Code: 40164, Msg: "ip"}).Error(); !strings.Contains(msg, "白名单") {
		t.Fatal(msg)
	}
}
