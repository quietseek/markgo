package imagegen

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/quietseek/markgo/internal/settings"
)

var png, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
var dataURL = "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)

type recorded struct {
	path   string
	header http.Header
	body   map[string]any
}

func server(t *testing.T) (*httptest.Server, func() []recorded) {
	var mu sync.Mutex
	var requests []recorded
	polls := 0
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		json.Unmarshal(raw, &body)
		mu.Lock()
		requests = append(requests, recorded{r.URL.Path, r.Header.Clone(), body})
		mu.Unlock()
		reply := func(code int, v any) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(code)
			json.NewEncoder(w).Encode(v)
		}
		switch r.URL.Path {
		case "/img.png":
			w.Header().Set("Content-Type", "image/png")
			w.Write(png)
		case "/b64/images/generations":
			reply(200, map[string]any{"data": []any{map[string]any{"b64_json": base64.StdEncoding.EncodeToString(png)}}})
		case "/url/images/generations":
			reply(200, map[string]any{"data": []any{map[string]any{"url": srv.URL + "/img.png"}}})
		case "/sf/images/generations":
			reply(200, map[string]any{"images": []any{map[string]any{"url": srv.URL + "/img.png"}}})
		case "/slow/images/generations":
			select {
			case <-time.After(3 * time.Second):
			case <-r.Context().Done():
			}
			reply(200, map[string]any{"data": []any{}})
		case "/err/images/generations":
			reply(401, map[string]any{"error": map[string]any{"message": "Invalid API key"}})
		case "/ds/services/aigc/text2image/image-synthesis":
			reply(200, map[string]any{"output": map[string]any{"task_id": "t1", "task_status": "PENDING"}})
		case "/ds/tasks/t1":
			mu.Lock()
			polls++
			n := polls
			mu.Unlock()
			if n > 1 {
				reply(200, map[string]any{"output": map[string]any{"task_status": "SUCCEEDED", "results": []any{map[string]any{"url": srv.URL + "/img.png"}}}})
			} else {
				reply(200, map[string]any{"output": map[string]any{"task_status": "RUNNING"}})
			}
		default:
			reply(404, map[string]any{"message": "not found"})
		}
	}))
	t.Cleanup(srv.Close)
	return srv, func() []recorded {
		mu.Lock()
		defer mu.Unlock()
		return append([]recorded{}, requests...)
	}
}

func cfg(srv *httptest.Server, provider, path string) settings.ImageGenConfig {
	return settings.ImageGenConfig{Provider: provider, BaseURL: srv.URL + "/" + path, APIKey: "sk-test", Model: "m1", Timeout: 10}
}

func TestOpenAICompatibleB64(t *testing.T) {
	srv, requests := server(t)
	if r := Generate(cfg(srv, "openai", "b64"), "一只猫"); !r.OK || r.DataURL != dataURL {
		t.Fatalf("r=%+v", r)
	}
	req := requests()[0]
	if req.header.Get("Authorization") != "Bearer sk-test" {
		t.Fatalf("auth=%q", req.header.Get("Authorization"))
	}
	if req.body["model"] != "m1" || req.body["prompt"] != "一只猫" || req.body["n"] != float64(1) {
		t.Fatalf("body=%v", req.body)
	}
}

func TestDownloadsReturnedURLs(t *testing.T) {
	srv, _ := server(t)
	for _, c := range []struct{ provider, path string }{{"doubao", "url"}, {"siliconflow", "sf"}} {
		if r := Generate(cfg(srv, c.provider, c.path), "a"); !r.OK || r.DataURL != dataURL {
			t.Fatalf("%s: r=%+v", c.provider, r)
		}
	}
}

func TestDashscopeAsyncTask(t *testing.T) {
	PollInterval = 50 * time.Millisecond
	srv, requests := server(t)
	if r := Generate(cfg(srv, "dashscope", "ds"), "山水"); !r.OK || r.DataURL != dataURL {
		t.Fatalf("r=%+v", r)
	}
	created := requests()[0]
	if !strings.HasSuffix(created.path, "image-synthesis") || created.header.Get("X-DashScope-Async") != "enable" {
		t.Fatalf("created=%+v", created)
	}
	if input, _ := created.body["input"].(map[string]any); input["prompt"] != "山水" {
		t.Fatalf("body=%v", created.body)
	}
}

func TestPassesThroughAPIErrors(t *testing.T) {
	srv, _ := server(t)
	if r := Generate(cfg(srv, "custom", "err"), "a"); r.OK || r.Error != "生图失败：Invalid API key" {
		t.Fatalf("r=%+v", r)
	}
}

func TestTimeout(t *testing.T) {
	srv, _ := server(t)
	c := cfg(srv, "custom", "slow")
	c.Timeout = 1
	if r := Generate(c, "a"); r.OK || !strings.Contains(r.Error, "生成超时（1 秒）") {
		t.Fatalf("r=%+v", r)
	}
}

func TestMissingConfig(t *testing.T) {
	if r := Generate(settings.ImageGenConfig{Provider: "openai", Model: "m1"}, "a"); !strings.Contains(r.Error, "API Key") {
		t.Fatalf("r=%+v", r)
	}
	if r := Generate(settings.ImageGenConfig{Provider: "custom", APIKey: "k", Model: "m1"}, "a"); !strings.Contains(r.Error, "接口地址") {
		t.Fatalf("r=%+v", r)
	}
}
