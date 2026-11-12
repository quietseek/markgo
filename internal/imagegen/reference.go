package imagegen

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/quietseek/markgo/internal/files"
	_ "golang.org/x/image/webp"
)

const maxReferenceBytes = 10 << 20

type referenceImage struct {
	raw           []byte
	mime, ext     string
	width, height int
}

func parseReference(dataURL string) (referenceImage, error) {
	if len(dataURL) > base64.StdEncoding.EncodedLen(maxReferenceBytes)+64 {
		return referenceImage{}, errors.New("单张参考图不能超过 10 MB")
	}
	header, encoded, ok := strings.Cut(dataURL, ",")
	if !ok || !strings.HasPrefix(header, "data:image/") || !strings.HasSuffix(header, ";base64") {
		return referenceImage{}, errors.New("请添加 PNG、JPEG 或 WebP 图片")
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return referenceImage{}, errors.New("图片数据无法解析")
	}
	return inspectReference(raw)
}

func inspectReference(raw []byte) (referenceImage, error) {
	if len(raw) > maxReferenceBytes {
		return referenceImage{}, errors.New("单张参考图不能超过 10 MB")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || (format != "png" && format != "jpeg" && format != "webp") {
		return referenceImage{}, errors.New("请添加有效的 PNG、JPEG 或 WebP 图片")
	}
	if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 32_000_000 {
		return referenceImage{}, errors.New("参考图像素过大，请缩小到 3200 万像素以内")
	}
	return referenceImage{raw, "image/" + format, format, config.Width, config.Height}, nil
}

func (r referenceImage) dataURL() string {
	return "data:" + r.mime + ";base64," + base64.StdEncoding.EncodeToString(r.raw)
}

// LoadReference reads only the selected image; it never uploads to the image host.
func LoadReference(src, docPath string) Result {
	var raw []byte
	var err error
	if strings.HasPrefix(src, "data:") {
		ref, err := parseReference(src)
		if err != nil {
			return Result{Error: err.Error()}
		}
		return Result{OK: true, DataURL: ref.dataURL()}
	}
	var reader io.ReadCloser
	if strings.HasPrefix(src, "https://") || strings.HasPrefix(src, "http://") {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		req, e := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
		if e != nil {
			return Result{Error: "图片地址无效"}
		}
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			return Result{Error: "无法读取参考图，请检查网络或改用本地图片"}
		}
		reader = res.Body
		if res.StatusCode >= 300 {
			reader.Close()
			return Result{Error: fmt.Sprintf("读取参考图失败（HTTP %d）", res.StatusCode)}
		}
	} else {
		path := files.ResolveLocalImagePath(src, docPath)
		if path == "" {
			return Result{Error: "无法定位参考图"}
		}
		reader, err = os.Open(path)
		if err != nil {
			return Result{Error: "无法读取参考图，请检查图片文件是否存在"}
		}
	}
	defer reader.Close()
	raw, err = io.ReadAll(io.LimitReader(reader, maxReferenceBytes+1))
	if err != nil {
		return Result{Error: "参考图读取失败"}
	}
	ref, err := inspectReference(raw)
	if err != nil {
		return Result{Error: err.Error()}
	}
	return Result{OK: true, DataURL: ref.dataURL()}
}
