// Package images 处理插入图片：PicGo 图床上传、复制到文档同级图片目录、下载网络图片。
package images

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/quietseek/markgo/internal/files"
)

type UploadResult struct {
	OK    bool     `json:"ok"`
	URLs  []string `json:"urls"`
	Error string   `json:"error,omitempty"`
}

func fail(msg string) UploadResult { return UploadResult{URLs: []string{}, Error: msg} }

// Config 由调用方从设置中提供
type Config struct {
	Mode           string // "picgo" | "local"
	PicgoServer    string
	LocalAssetsDir string
}

type Uploader struct {
	Config func() Config
	Client *http.Client
}

func (u *Uploader) client() *http.Client {
	if u.Client != nil {
		return u.Client
	}
	return &http.Client{Timeout: 60 * time.Second}
}

func (u *Uploader) assetsDir(docPath string) string {
	dir := u.Config().LocalAssetsDir
	if dir == "" {
		dir = "assets"
	}
	return filepath.Join(filepath.Dir(docPath), dir)
}

func tempDir() string { return filepath.Join(os.TempDir(), "markgo") }

const noDocError = "当前文档尚未保存到磁盘，无法使用本地图片目录"

// PicGo / PicList 内置 HTTP Server 协议：
//
//	POST {server}/upload  body: {"list": ["/abs/path.png"]}
//	-> {"success": true, "result": ["https://..."]}
func (u *Uploader) picgoUpload(paths []string) UploadResult {
	server := strings.TrimRight(u.Config().PicgoServer, "/")
	body, _ := json.Marshal(map[string]any{"list": paths})
	res, err := u.client().Post(server+"/upload", "application/json", bytes.NewReader(body))
	if err != nil {
		return fail(fmt.Sprintf("无法连接 PicGo（%s）。请确认 PicGo 已启动并开启 Server 功能。%v", server, err))
	}
	defer res.Body.Close()
	var data struct {
		Success bool     `json:"success"`
		Result  []string `json:"result"`
		Message string   `json:"message"`
		Msg     string   `json:"msg"`
	}
	if json.NewDecoder(res.Body).Decode(&data) != nil || !data.Success || len(data.Result) == 0 {
		msg := data.Message
		if msg == "" {
			msg = data.Msg
		}
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", res.StatusCode)
		}
		return fail("PicGo 上传失败：" + msg)
	}
	return UploadResult{OK: true, URLs: data.Result}
}

// 本地模式：复制到文档同级图片目录，返回相对路径
func (u *Uploader) copyToAssets(paths []string, docPath string) UploadResult {
	if docPath == "" {
		return fail(noDocError)
	}
	docDir := filepath.Dir(docPath)
	dir := u.assetsDir(docPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fail(err.Error())
	}
	urls := []string{}
	for _, p := range paths {
		// 已在文档目录内的图片直接引用
		if rel, err := filepath.Rel(docDir, p); err == nil && !strings.HasPrefix(rel, "..") {
			urls = append(urls, filepath.ToSlash(rel))
			continue
		}
		target := files.UniquePath(dir, filepath.Base(p))
		if err := copyFile(p, target); err != nil {
			return fail(err.Error())
		}
		rel, _ := filepath.Rel(docDir, target)
		urls = append(urls, filepath.ToSlash(rel))
	}
	return UploadResult{OK: true, URLs: urls}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func (u *Uploader) UploadPaths(paths []string, docPath string) UploadResult {
	if len(paths) == 0 {
		return UploadResult{OK: true, URLs: []string{}}
	}
	if u.Config().Mode == "picgo" {
		return u.picgoUpload(paths)
	}
	return u.copyToAssets(paths, docPath)
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]`)

// UploadBuffer 上传剪贴板 / 拖拽得到的二进制图片
func (u *Uploader) UploadBuffer(data []byte, ext, docPath string) UploadResult {
	safeExt := nonAlnum.ReplaceAllString(strings.ToLower(ext), "")
	if safeExt == "" {
		safeExt = "png"
	}
	name := fmt.Sprintf("image-%s-%s.%s", time.Now().UTC().Format("20060102150405"), strconv.FormatInt(rand.Int64N(36*36*36*36), 36), safeExt)
	local := u.Config().Mode == "local"
	if local && docPath == "" {
		return fail(noDocError)
	}
	dir := tempDir()
	if local {
		dir = u.assetsDir(docPath)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fail(err.Error())
	}
	file := filepath.Join(dir, name)
	if err := os.WriteFile(file, data, 0o644); err != nil {
		return fail(err.Error())
	}
	if local {
		rel, _ := filepath.Rel(filepath.Dir(docPath), file)
		return UploadResult{OK: true, URLs: []string{filepath.ToSlash(rel)}}
	}
	defer os.Remove(file)
	return u.picgoUpload([]string{file})
}

var extByType = map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp"}

// 下载网络图片到指定目录，返回文件路径
func (u *Uploader) download(rawURL, dir string) (string, error) {
	res, err := u.client().Get(rawURL)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("下载图片失败（HTTP %d）", res.StatusCode)
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	urlName := path.Base(parsed.Path)
	name := ""
	if files.IsImagePath(urlName) {
		name = files.SanitizeName(urlName)
	}
	if name == "" {
		mt, _, _ := mime.ParseMediaType(res.Header.Get("Content-Type"))
		ext := extByType[mt]
		if ext == "" {
			ext = "png"
		}
		name = fmt.Sprintf("image-%s.%s", strconv.FormatInt(time.Now().UnixMilli(), 36), ext)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	target := files.UniquePath(dir, name)
	out, err := os.Create(target)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(out, res.Body); err != nil {
		out.Close()
		os.Remove(target)
		return "", err
	}
	return target, out.Close()
}

// UploadToHost 把正文中的一张图片上传到 PicGo 图床（与「插入图片时」的设置无关）；网络图片先下载再上传
func (u *Uploader) UploadToHost(src, docPath string) UploadResult {
	if isHTTP(src) {
		file, err := u.download(src, tempDir())
		if err != nil {
			return fail(err.Error())
		}
		defer os.Remove(file)
		return u.picgoUpload([]string{file})
	}
	local := files.ResolveLocalImagePath(src, docPath)
	if local == "" {
		return fail("无法定位这张图片")
	}
	if _, err := os.Stat(local); err != nil {
		return fail("找不到图片文件：" + local)
	}
	return u.picgoUpload([]string{local})
}

// DownloadToAssets 把网络图片下载到文档同级的本地图片目录，返回相对路径
func (u *Uploader) DownloadToAssets(src, docPath string) UploadResult {
	if docPath == "" {
		return fail("当前文档尚未保存到磁盘，无法保存到本地图片目录")
	}
	file, err := u.download(src, u.assetsDir(docPath))
	if err != nil {
		return fail(err.Error())
	}
	rel, _ := filepath.Rel(filepath.Dir(docPath), file)
	return UploadResult{OK: true, URLs: []string{filepath.ToSlash(rel)}}
}

// 1x1 透明 PNG
var testPNG, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

// TestPicgo 用 1x1 PNG 测试 PicGo 连通性（会真实上传一张极小图片）
func (u *Uploader) TestPicgo() UploadResult {
	file := filepath.Join(os.TempDir(), fmt.Sprintf("markgo-picgo-test-%d.png", time.Now().UnixMilli()))
	if err := os.WriteFile(file, testPNG, 0o644); err != nil {
		return fail(err.Error())
	}
	defer os.Remove(file)
	return u.picgoUpload([]string{file})
}

func isHTTP(s string) bool {
	l := strings.ToLower(s)
	return strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://")
}
