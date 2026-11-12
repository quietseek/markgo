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
	"mime/multipart"
	"net/http"
	"net/textproto"
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
	return GenerateWithOptions(cfg, Request{Prompt: prompt})
}

func GenerateWithOptions(cfg settings.ImageGenConfig, input Request) Result {
	prompt := strings.TrimSpace(input.Prompt)
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
	capabilities := GetCapabilities(cfg.Provider, cfg.Model)
	if err := capabilities.validate(input); err != nil {
		return Result{Error: err.Error()}
	}
	refs := make([]referenceImage, 0, len(input.Images))
	for _, dataURL := range input.Images {
		ref, err := parseReference(dataURL)
		if err != nil {
			return Result{Error: err.Error()}
		}
		refs = append(refs, ref)
	}
	size := capabilities.size(input, refs)
	if len(refs) > 0 {
		if input.Mode == "edit" {
			prompt = "请按照以下要求修改第一张图片，保留未要求改变的主体与细节。其余图片（如有）仅作为参考。\n\n" + prompt
		} else {
			prompt = "请根据以下描述创作新图片，附图仅用于参考风格、配色与构图。\n\n" + prompt
		}
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
		image, err = dashscope(ctx, baseURL, cfg.APIKey, cfg.Model, prompt, size)
	} else {
		image, err = openai(ctx, baseURL, cfg, prompt, size, input.Quality, refs)
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
	if stream, ok := body.(io.Reader); ok {
		reader = stream
	} else if body != nil {
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
	raw, err := io.ReadAll(io.LimitReader(res.Body, (64<<20)+1))
	if err != nil {
		if ctx.Err() != nil {
			return errTimeout
		}
		return err
	}
	if len(raw) > 64<<20 {
		return errors.New("生图接口返回的内容过大")
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
func openai(ctx context.Context, baseURL string, cfg settings.ImageGenConfig, prompt, size, quality string, refs []referenceImage) (string, error) {
	type item struct {
		URL     string `json:"url"`
		B64JSON string `json:"b64_json"`
	}
	var data struct {
		Data   []item `json:"data"`
		Images []item `json:"images"`
	}
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + cfg.APIKey}
	endpoint := baseURL + "/images/generations"
	fields := map[string]any{"model": cfg.Model, "prompt": prompt, "n": 1}
	if size != "" {
		key := "size"
		if cfg.Provider == "siliconflow" {
			key = "image_size"
		}
		fields[key] = size
	}
	if quality != "" {
		fields["quality"] = quality
	}
	var body any = fields
	if seedream(cfg.Provider, cfg.Model) {
		delete(fields, "n")
		fields["response_format"] = "b64_json"
		if strings.HasPrefix(cfg.Model, "doubao-seedream-4-") || strings.HasPrefix(cfg.Model, "doubao-seedream-5-0-lite") {
			fields["sequential_image_generation"] = "disabled"
		}
		if len(refs) > 0 {
			images := make([]string, 0, len(refs))
			for _, ref := range refs {
				images = append(images, ref.dataURL())
			}
			fields["image"] = images
		}
	} else if len(refs) > 0 {
		endpoint = baseURL + "/images/edits"
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for key, value := range fields {
			if err := writer.WriteField(key, fmt.Sprint(value)); err != nil {
				return "", err
			}
		}
		for i, ref := range refs {
			header := make(textproto.MIMEHeader)
			header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="image[]"; filename="reference-%d.%s"`, i+1, ref.ext))
			header.Set("Content-Type", ref.mime)
			part, err := writer.CreatePart(header)
			if err != nil {
				return "", err
			}
			if _, err = part.Write(ref.raw); err != nil {
				return "", err
			}
		}
		if err := writer.Close(); err != nil {
			return "", err
		}
		headers["Content-Type"] = writer.FormDataContentType()
		body = &buf
	}
	if err := request(ctx, http.MethodPost, endpoint, headers, body, &data); err != nil {
		return "", err
	}
	items := append(data.Data, data.Images...)
	if len(items) > 0 {
		if items[0].B64JSON != "" {
			raw, err := base64.StdEncoding.DecodeString(items[0].B64JSON)
			if err != nil {
				return "", errors.New("生图接口返回了无效的图片数据")
			}
			return imageDataURL(raw)
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
func dashscope(ctx context.Context, baseURL, apiKey, model, prompt, size string) (string, error) {
	auth := "Bearer " + apiKey
	var created struct {
		Output struct {
			TaskID string `json:"task_id"`
		} `json:"output"`
	}
	headers := map[string]string{"Authorization": auth, "Content-Type": "application/json", "X-DashScope-Async": "enable"}
	parameters := map[string]any{"n": 1}
	if size != "" {
		parameters["size"] = size
	}
	body := map[string]any{"model": model, "input": map[string]any{"prompt": prompt}, "parameters": parameters}
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
	raw, err := io.ReadAll(io.LimitReader(res.Body, (32<<20)+1))
	if err != nil {
		return "", err
	}
	return imageDataURL(raw)
}

func imageDataURL(raw []byte) (string, error) {
	if len(raw) > 32<<20 {
		return "", errors.New("生成的图片超过 32 MB，请选择较小尺寸")
	}
	mt, _, _ := mime.ParseMediaType(http.DetectContentType(raw))
	if mt != "image/png" && mt != "image/jpeg" && mt != "image/webp" {
		return "", errors.New("生图接口没有返回有效的 PNG、JPEG 或 WebP 图片")
	}
	return "data:" + mt + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}
