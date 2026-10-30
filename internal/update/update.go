// Package update 通过 GitHub Releases 检查新版本。
package update

import (
	"encoding/json"
	"fmt"
	"net/http"
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

// Latest 查询 GitHub 最新 Release
func Latest(current string) Check {
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
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return Check{Error: fmt.Sprintf("检查更新失败：%v", err)}
	}
	latest := strings.TrimPrefix(data.TagName, "v")
	return Check{OK: true, Current: current, Latest: latest, HasUpdate: CompareVersions(latest, current) > 0, URL: data.HTMLURL}
}
