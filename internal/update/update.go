// Package update 通过 GitHub Releases 检查新版本，并下载对应平台的安装包。
package update

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const Repo = "quietseek/markgo"

var RepoURL = "https://github.com/" + Repo

// 测试中指向模拟服务
var apiBase = "https://api.github.com"

type Check struct {
	OK        bool   `json:"ok"`
	Current   string `json:"current,omitempty"`
	Latest    string `json:"latest,omitempty"`
	HasUpdate bool   `json:"hasUpdate"`
	URL       string `json:"url,omitempty"`
	Error     string `json:"error,omitempty"`
	// 本机的安装方式有对应的安装包，可在应用内自动更新
	Installable bool `json:"installable"`
	// 自动更新使用的安装包（不发给前端，安装时重新查询）
	Asset *Asset `json:"-"`
}

type Asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
	Size int64  `json:"size"`
}

// Kind 安装方式：mac（.app）、windows（NSIS 安装包）、deb；空字符串表示不支持自动更新
type Kind string

const (
	KindMac     Kind = "mac"
	KindWindows Kind = "windows"
	KindDeb     Kind = "deb"
)

// 各安装方式对应的 Release 安装包后缀（与 .github/workflows/build.yml 的命名一致）
var assetSuffix = map[Kind]string{
	KindMac:     "-mac-universal.dmg",
	KindWindows: "-win-x64-setup.exe",
	KindDeb:     "-linux-amd64.deb",
}

// PickAsset 按安装方式选出安装包
func PickAsset(assets []Asset, kind Kind) *Asset {
	suffix, ok := assetSuffix[kind]
	if !ok {
		return nil
	}
	for i := range assets {
		if strings.HasSuffix(assets[i].Name, suffix) {
			return &assets[i]
		}
	}
	return nil
}

var versionSep = regexp.MustCompile(`[.-]`)

// CompareVersions 比较 x.y.z 版本号：a > b 返回正数
func CompareVersions(a, b string) int {
	pa, pb := versionSep.Split(a, -1), versionSep.Split(b, -1)
	num := func(parts []string, i int) int {
		if i >= len(parts) {
			return 0
		}
		n, _ := strconv.Atoi(parts[i])
		return n
	}
	for i := 0; i < 3; i++ {
		if d := num(pa, i) - num(pb, i); d != 0 {
			return d
		}
	}
	return 0
}

// Latest 查询 GitHub 最新 Release；kind 为本机的安装方式，用于挑选自动更新的安装包
func Latest(current string, kind Kind) Check {
	req, _ := http.NewRequest(http.MethodGet, apiBase+"/repos/"+Repo+"/releases/latest", nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return Check{Error: fmt.Sprintf("检查更新失败：%v", err)}
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Check{Error: fmt.Sprintf("GitHub 返回 %d", res.StatusCode)}
	}
	var data struct {
		TagName string  `json:"tag_name"`
		HTMLURL string  `json:"html_url"`
		Assets  []Asset `json:"assets"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return Check{Error: fmt.Sprintf("检查更新失败：%v", err)}
	}
	latest := strings.TrimPrefix(data.TagName, "v")
	asset := PickAsset(data.Assets, kind)
	return Check{
		OK:          true,
		Current:     current,
		Latest:      latest,
		HasUpdate:   CompareVersions(latest, current) > 0,
		URL:         data.HTMLURL,
		Installable: asset != nil,
		Asset:       asset,
	}
}

// Download 下载安装包到 dest，progress 报告已下载与总字节数（总数未知时为 0）
func Download(url, dest string, progress func(received, total int64)) error {
	res, err := (&http.Client{Timeout: 30 * time.Minute}).Get(url)
	if err != nil {
		return fmt.Errorf("下载失败：%v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("下载失败：服务器返回 %d", res.StatusCode)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	total := res.ContentLength
	if total < 0 {
		total = 0
	}
	var received int64
	buf := make([]byte, 256<<10)
	last := time.Time{}
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				return werr
			}
			received += int64(n)
			if progress != nil && time.Since(last) > 150*time.Millisecond {
				last = time.Now()
				progress(received, total)
			}
		}
		if errors.Is(rerr, io.EOF) {
			break
		}
		if rerr != nil {
			f.Close()
			return fmt.Errorf("下载失败：%v", rerr)
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	if total > 0 && received != total {
		return fmt.Errorf("下载不完整：%d / %d 字节", received, total)
	}
	if progress != nil {
		progress(received, total)
	}
	return nil
}
