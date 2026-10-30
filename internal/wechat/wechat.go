// Package wechat 把排版后的文章发布到微信公众号草稿箱。
package wechat

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	_ "image/gif"
	_ "image/png"

	"golang.org/x/image/draw"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	"github.com/quietseek/markgo/internal/files"
	"github.com/quietseek/markgo/internal/settings"
)

// MARKGO_WECHAT_API 仅用于本地联调/测试时指向模拟服务
func api() string {
	if v := os.Getenv("MARKGO_WECHAT_API"); v != "" {
		return v
	}
	return "https://api.weixin.qq.com/cgi-bin"
}

// 正文图片接口仅支持 jpg/png 且 ≤ 1MB
const contentImageLimit = 1024 * 1024

var errorHints = map[int]string{
	40001: "AppSecret 错误或 access_token 无效",
	40013: "AppID 无效",
	40125: "AppSecret 无效",
	40164: "当前出口 IP 不在公众号白名单中：请到「公众号后台 → 设置与开发 → 基本配置 → IP 白名单」添加本机公网 IP",
	41005: "缺少图片数据",
	45009: "接口调用超过当日上限",
	48001: "公众号未获得该接口权限（个人订阅号未认证时无法调用草稿接口）",
	53404: "账号已被限制发文",
	61004: "当前出口 IP 不在公众号白名单中",
}

type apiError struct {
	Code int
	Msg  string
}

func (e *apiError) Error() string {
	if hint, ok := errorHints[e.Code]; ok {
		return fmt.Sprintf("%s（errcode %d: %s）", hint, e.Code, e.Msg)
	}
	return fmt.Sprintf("微信接口错误 %d: %s", e.Code, e.Msg)
}

type DraftInput struct {
	Title  string  `json:"title"`
	Author *string `json:"author,omitempty"`
	Digest string  `json:"digest,omitempty"`
	// 已套用主题内联样式的 HTML
	Content string `json:"content"`
	// 封面图：本地路径或 http(s) URL；为空则取正文第一张图
	Cover            string `json:"cover,omitempty"`
	ContentSourceURL string `json:"contentSourceUrl,omitempty"`
	// 当前文档路径，用于解析正文中的相对路径图片
	DocPath string `json:"docPath,omitempty"`
}

type DraftResult struct {
	OK      bool   `json:"ok"`
	MediaID string `json:"mediaId,omitempty"`
	Error   string `json:"error,omitempty"`
}

type TestResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type Client struct {
	Config func() settings.WechatConfig
	HTTP   *http.Client

	mu    sync.Mutex
	token struct {
		appID     string
		value     string
		expiresAt time.Time
	}
}

func (c *Client) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 60 * time.Second}
}

// 统一解析微信接口返回：errcode 非 0 时报错
func (c *Client) do(req *http.Request, out any) error {
	res, err := c.http().Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	var e struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(raw, &e); err != nil {
		return fmt.Errorf("微信接口返回了无法解析的内容（HTTP %d）", res.StatusCode)
	}
	if e.ErrCode != 0 {
		return &apiError{Code: e.ErrCode, Msg: e.ErrMsg}
	}
	return json.Unmarshal(raw, out)
}

func (c *Client) postJSON(rawURL string, body, out any) error {
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, rawURL, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	return c.do(req, out)
}

func (c *Client) accessToken(force bool) (string, error) {
	cfg := c.Config()
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return "", errors.New("请先在「设置 → 发布」中填写 AppID 与 AppSecret")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if !force && c.token.appID == cfg.AppID && time.Now().Before(c.token.expiresAt) {
		return c.token.value, nil
	}
	// stable_token 不会让其他服务已获取的 token 失效
	var data struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	body := map[string]any{"grant_type": "client_credential", "appid": cfg.AppID, "secret": cfg.AppSecret, "force_refresh": false}
	if err := c.postJSON(api()+"/stable_token", body, &data); err != nil {
		return "", err
	}
	c.token.appID, c.token.value = cfg.AppID, data.AccessToken
	c.token.expiresAt = time.Now().Add(time.Duration(data.ExpiresIn-300) * time.Second)
	return data.AccessToken, nil
}

func (c *Client) resetToken() {
	c.mu.Lock()
	c.token.value, c.token.appID = "", ""
	c.mu.Unlock()
}

func (c *Client) postMedia(rawURL string, img loadedImage, filename string) (map[string]any, error) {
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="media"; filename="%s"`, filename))
	h.Set("Content-Type", mimeTypes[img.ext])
	part, err := form.CreatePart(h)
	if err != nil {
		return nil, err
	}
	part.Write(img.buf)
	form.Close()
	req, err := http.NewRequest(http.MethodPost, rawURL, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	out := map[string]any{}
	return out, c.do(req, &out)
}

type loadedImage struct {
	buf []byte
	ext string
}

var mimeTypes = map[string]string{"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "bmp": "image/bmp", "webp": "image/webp"}

func sniffExt(b []byte) string {
	switch {
	case len(b) > 1 && b[0] == 0x89 && b[1] == 0x50:
		return "png"
	case len(b) > 1 && b[0] == 0xff && b[1] == 0xd8:
		return "jpg"
	case bytes.HasPrefix(b, []byte("GIF")):
		return "gif"
	case bytes.HasPrefix(b, []byte("BM")):
		return "bmp"
	case len(b) >= 12 && string(b[8:12]) == "WEBP":
		return "webp"
	}
	return ""
}

var dataURIRe = regexp.MustCompile(`(?s)^data:[^;,]*(;base64)?,(.*)$`)

func (c *Client) loadImage(src, docPath string) (loadedImage, error) {
	var buf []byte
	switch {
	case strings.HasPrefix(src, "data:"):
		m := dataURIRe.FindStringSubmatch(src)
		if m == nil {
			return loadedImage{}, errors.New("无法解析 data URI 图片")
		}
		if m[1] != "" {
			b, err := base64.StdEncoding.DecodeString(m[2])
			if err != nil {
				return loadedImage{}, errors.New("无法解析 data URI 图片")
			}
			buf = b
		} else {
			s, err := url.PathUnescape(m[2])
			if err != nil {
				s = m[2]
			}
			buf = []byte(s)
		}
	case isHTTP(src):
		res, err := c.http().Get(src)
		if err != nil {
			return loadedImage{}, err
		}
		defer res.Body.Close()
		if res.StatusCode >= 300 {
			return loadedImage{}, fmt.Errorf("下载图片失败 HTTP %d: %s", res.StatusCode, src)
		}
		if buf, err = io.ReadAll(res.Body); err != nil {
			return loadedImage{}, err
		}
	default:
		local := files.ResolveLocalImagePath(src, docPath)
		if local == "" {
			return loadedImage{}, fmt.Errorf("无法定位本地图片：%s", src)
		}
		b, err := os.ReadFile(local)
		if err != nil {
			return loadedImage{}, err
		}
		buf = b
	}
	ext := sniffExt(buf)
	if ext == "" {
		clean := src
		if i := strings.IndexAny(clean, "?#"); i >= 0 {
			clean = clean[:i]
		}
		ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(clean)), ".")
	}
	if ext == "" {
		ext = "png"
	}
	if ext == "jpeg" {
		ext = "jpg"
	}
	return loadedImage{buf: buf, ext: ext}, nil
}

// 转成正文接口可接受的 jpg/png（≤1MB），必要时缩放压缩
func normalizeForContent(img loadedImage) (loadedImage, error) {
	if (img.ext == "png" || img.ext == "jpg") && len(img.buf) <= contentImageLimit {
		return img, nil
	}
	decoded, _, err := image.Decode(bytes.NewReader(img.buf))
	if err != nil {
		return img, fmt.Errorf("公众号正文仅支持 jpg/png，且无法自动转换 %s 格式，请先换成 jpg/png 再发布", img.ext)
	}
	decoded = resize(decoded, 1080)
	for _, q := range []int{90, 80, 70, 60, 50} {
		if buf := encodeJPEG(decoded, q); len(buf) <= contentImageLimit {
			return loadedImage{buf: buf, ext: "jpg"}, nil
		}
	}
	return loadedImage{buf: encodeJPEG(resize(decoded, 720), 60), ext: "jpg"}, nil
}

// 等比缩小到不超过 maxWidth；JPEG 不支持透明，先铺白底
func resize(src image.Image, maxWidth int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > maxWidth {
		h = h * maxWidth / w
		w = maxWidth
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
	return dst
}

func encodeJPEG(img image.Image, quality int) []byte {
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality})
	return buf.Bytes()
}

func (c *Client) uploadContentImage(token, src, docPath string) (string, error) {
	img, err := c.loadImage(src, docPath)
	if err != nil {
		return "", err
	}
	if img, err = normalizeForContent(img); err != nil {
		return "", err
	}
	data, err := c.postMedia(api()+"/media/uploadimg?access_token="+token, img, "image."+img.ext)
	if err != nil {
		return "", err
	}
	return fmt.Sprint(data["url"]), nil
}

func (c *Client) uploadThumb(token, src, docPath string) (string, error) {
	img, err := c.loadImage(src, docPath)
	if err != nil {
		return "", err
	}
	if !slices.Contains([]string{"png", "jpg", "gif", "bmp"}, img.ext) || len(img.buf) > 10*1024*1024 {
		if img, err = normalizeForContent(img); err != nil {
			return "", err
		}
	}
	data, err := c.postMedia(api()+"/material/add_material?access_token="+token+"&type=image", img, "cover."+img.ext)
	if err != nil {
		return "", err
	}
	return fmt.Sprint(data["media_id"]), nil
}

var imgSrcRe = regexp.MustCompile(`(?i)<img\b[^>]*?\ssrc=("([^"]*)"|'([^']*)')[^>]*>`)
var wechatImageRe = regexp.MustCompile(`(?i)^https?://mmbiz\.qpic\.cn/`)

// 正文中的第三方/本地图片统一转存到微信，避免外链图片在公众号中无法显示
func (c *Client) rehostImages(token, html, docPath string) (string, string, error) {
	srcOf := func(m []string) (raw, quoted string) {
		if m[2] != "" || strings.HasPrefix(m[1], `"`) {
			return m[2], m[1]
		}
		return m[3], m[1]
	}
	mapping := map[string]string{}
	for _, m := range imgSrcRe.FindAllStringSubmatch(html, -1) {
		raw, _ := srcOf(m)
		src := decodeEntities(raw)
		if _, done := mapping[src]; done {
			continue
		}
		if wechatImageRe.MatchString(src) {
			mapping[src] = src
			continue
		}
		hosted, err := c.uploadContentImage(token, src, docPath)
		if err != nil {
			return "", "", err
		}
		mapping[src] = hosted
	}
	first := ""
	out := imgSrcRe.ReplaceAllStringFunc(html, func(tag string) string {
		m := imgSrcRe.FindStringSubmatch(tag)
		raw, quoted := srcOf(m)
		src := decodeEntities(raw)
		if first == "" {
			first = src
		}
		next, ok := mapping[src]
		if !ok {
			return tag
		}
		q := quoted[:1]
		return strings.Replace(tag, quoted, q+next+q, 1)
	})
	return out, first, nil
}

var entities = strings.NewReplacer("&amp;", "&", "&quot;", `"`, "&#39;", "'", "&lt;", "<", "&gt;", ">")

func decodeEntities(s string) string { return entities.Replace(s) }

func (c *Client) TestConnection() TestResult {
	if _, err := c.accessToken(true); err != nil {
		return TestResult{Error: err.Error()}
	}
	return TestResult{OK: true}
}

func (c *Client) PublishDraft(input DraftInput) DraftResult {
	mediaID, err := c.publish(input)
	if err != nil {
		var ae *apiError
		if errors.As(err, &ae) && (ae.Code == 40001 || ae.Code == 42001) {
			c.resetToken()
		}
		return DraftResult{Error: err.Error()}
	}
	return DraftResult{OK: true, MediaID: mediaID}
}

func (c *Client) publish(input DraftInput) (string, error) {
	cfg := c.Config()
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return "", errors.New("标题不能为空")
	}
	token, err := c.accessToken(false)
	if err != nil {
		return "", err
	}
	html, first, err := c.rehostImages(token, input.Content, input.DocPath)
	if err != nil {
		return "", err
	}
	cover := strings.TrimSpace(input.Cover)
	if cover == "" {
		cover = first
	}
	if cover == "" {
		return "", errors.New("公众号草稿必须有封面图：请在发布面板选择封面，或在正文中插入至少一张图片")
	}
	thumb, err := c.uploadThumb(token, cover, input.DocPath)
	if err != nil {
		return "", err
	}
	author := cfg.Author
	if input.Author != nil {
		author = *input.Author
	}
	article := map[string]any{
		"article_type":          "news",
		"title":                 truncate(title, 64),
		"author":                truncate(author, 16),
		"digest":                truncate(input.Digest, 120),
		"content":               html,
		"content_source_url":    input.ContentSourceURL,
		"thumb_media_id":        thumb,
		"need_open_comment":     boolInt(cfg.OpenComment),
		"only_fans_can_comment": boolInt(cfg.OnlyFansCanComment),
	}
	var data struct {
		MediaID string `json:"media_id"`
	}
	if err := c.postJSON(api()+"/draft/add?access_token="+token, map[string]any{"articles": []any{article}}, &data); err != nil {
		return "", err
	}
	return data.MediaID, nil
}

// 按字符（而不是字节）截断，与 JS 的 String.prototype.slice 对中文的效果一致
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func isHTTP(s string) bool {
	l := strings.ToLower(s)
	return strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://")
}
