// Package imagegen 按「设置 → 图片 → AI 生图」的配置调用生图接口。
package imagegen

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/quietseek/markgo/internal/settings"
)

type Result struct {
	OK bool `json:"ok"`
	// 生成的图片（data URL），插入时再按图床设置保存
	DataURL string `json:"dataUrl,omitempty"`
	Error   string `json:"error,omitempty"`
}

// PollInterval 百炼异步任务的轮询间隔（测试中调小）
var PollInterval = 2 * time.Second

var errTimeout = errors.New("timeout")

// Generate 根据提示词生成一张图片，返回 data URL（供应商返回的链接通常有时效，插入前再按图床设置保存）
func Generate(cfg settings.ImageGenConfig, prompt string) Result {
	var provider *settings.ImageGenProvider
	for i := range settings.ImageGenProviders {
		if settings.ImageGenProviders[i].ID == cfg.Provider {
			provider = &settings.ImageGenProviders[i]
		}
	}
	baseURL := cfg.BaseURL
	if baseURL == "" && provider != nil {
		baseURL = provider.BaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")
	switch {
	case baseURL == "":
		return Result{Error: "请先在「设置 → 图片 → AI 生图」中填写接口地址"}
	case cfg.APIKey == "":
		return Result{Error: "请先在「设置 → 图片 → AI 生图」中填写 API Key"}
	case cfg.Model == "":
		return Result{Error: "请先在「设置 → 图片 → AI 生图」中填写模型"}
	case strings.TrimSpace(prompt) == "":
		return Result{Error: "请输入图片描述"}
	}
	seconds := cfg.Timeout
	if seconds <= 0 {
		seconds = 180
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(seconds)*time.Second)
	defer cancel()
	var image string
	var err error
	if provider != nil && provider.Protocol == "dashscope" {
		image, err = dashscope(ctx, baseURL, cfg.APIKey, cfg.Model, prompt)
	} else {
		image, err = openai(ctx, baseURL, cfg.APIKey, cfg.Model, prompt)
	}
	if err == nil && !strings.HasPrefix(image, "data:") {
		image, err = toDataURL(ctx, image)
	}
	if err != nil {
		if errors.Is(err, errTimeout) || errors.Is(err, context.DeadlineExceeded) {
			return Result{Error: fmt.Sprintf("生成超时（%d 秒），可在「设置 → 图片 → AI 生图」中调大超时时间", seconds)}
		}
		return Result{Error: err.Error()}
	}
	return Result{OK: true, DataURL: image}
}

func request(ctx context.Context, method, rawURL string, headers map[string]string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return errTimeout
		}
		host := rawURL
		if u, perr := url.Parse(rawURL); perr == nil {
			host = u.Host
		}
		return fmt.Errorf("无法连接生图接口（%s）：%v", host, err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		if ctx.Err() != nil {
			return errTimeout
		}
		return err
	}
	if res.StatusCode >= 300 {
		return fmt.Errorf("生图失败：%s", errorMessage(raw, res.StatusCode))
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("生图接口返回了无法解析的内容")
	}
	return nil
}

// 各家接口的错误格式：{"error":{"message"}} / {"message"} / {"error":"..."} / {"msg"}
func errorMessage(raw []byte, status int) string {
	var data struct {
		Error   json.RawMessage `json:"error"`
		Message string          `json:"message"`
		Msg     string          `json:"msg"`
	}
	if json.Unmarshal(raw, &data) == nil {
		var nested struct {
			Message string `json:"message"`
		}
		var plain string
		switch {
		case json.Unmarshal(data.Error, &nested) == nil && nested.Message != "":
			return nested.Message
		case data.Message != "":
			return data.Message
		case json.Unmarshal(data.Error, &plain) == nil && plain != "":
			return plain
		case data.Msg != "":
			return data.Msg
		}
	}
	return fmt.Sprintf("HTTP %d", status)
}

// OpenAI 兼容协议（OpenAI / 豆包 / 智谱 / 硅基流动等）：
//
//	POST {base}/images/generations  {"model", "prompt"}
//	-> {"data": [{"url"} | {"b64_json"}]}，硅基流动另有 {"images": [{"url"}]}
func openai(ctx context.Context, baseURL, apiKey, model, prompt string) (string, error) {
	type item struct {
		URL     string `json:"url"`
		B64JSON string `json:"b64_json"`
	}
	var data struct {
		Data   []item `json:"data"`
		Images []item `json:"images"`
	}
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + apiKey}
	if err := request(ctx, http.MethodPost, baseURL+"/images/generations", headers, map[string]any{"model": model, "prompt": prompt, "n": 1}, &data); err != nil {
		return "", err
	}
	items := append(data.Data, data.Images...)
	if len(items) > 0 {
		if items[0].B64JSON != "" {
			return "data:image/png;base64," + items[0].B64JSON, nil
		}
		if items[0].URL != "" {
			return items[0].URL, nil
		}
	}
	return "", errors.New("生图接口没有返回图片")
}

// 阿里云百炼（通义万相）异步任务：
//
//	POST {base}/services/aigc/text2image/image-synthesis（X-DashScope-Async: enable）-> output.task_id
//	GET  {base}/tasks/{task_id} -> output.task_status / output.results[0].url
func dashscope(ctx context.Context, baseURL, apiKey, model, prompt string) (string, error) {
	auth := "Bearer " + apiKey
	var created struct {
		Output struct {
			TaskID string `json:"task_id"`
		} `json:"output"`
	}
	headers := map[string]string{"Authorization": auth, "Content-Type": "application/json", "X-DashScope-Async": "enable"}
	body := map[string]any{"model": model, "input": map[string]any{"prompt": prompt}, "parameters": map[string]any{"n": 1}}
	if err := request(ctx, http.MethodPost, baseURL+"/services/aigc/text2image/image-synthesis", headers, body, &created); err != nil {
		return "", err
	}
	taskID := created.Output.TaskID
	if taskID == "" {
		return "", errors.New("生图接口没有返回任务 ID")
	}
	for {
		select {
		case <-ctx.Done():
			return "", errTimeout
		case <-time.After(PollInterval):
		}
		var task struct {
			Output struct {
				TaskStatus string `json:"task_status"`
				Message    string `json:"message"`
				Results    []struct {
					URL string `json:"url"`
				} `json:"results"`
			} `json:"output"`
		}
		if err := request(ctx, http.MethodGet, baseURL+"/tasks/"+taskID, map[string]string{"Authorization": auth}, nil, &task); err != nil {
			return "", err
		}
		switch status := task.Output.TaskStatus; status {
		case "SUCCEEDED":
			for _, r := range task.Output.Results {
				if r.URL != "" {
					return r.URL, nil
				}
			}
			return "", errors.New("生图接口没有返回图片")
		case "FAILED", "CANCELED", "UNKNOWN":
			msg := task.Output.Message
			if msg == "" {
				msg = status
			}
			return "", fmt.Errorf("生图失败：%s", msg)
		}
	}
}

func toDataURL(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return "", errTimeout
		}
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("下载生成的图片失败（HTTP %d）", res.StatusCode)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	mt, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
	if mt == "" {
		mt = "image/png"
	}
	return "data:" + mt + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}
