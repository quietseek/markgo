package update

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const manifestURL = "https://quietseek.github.io/markgo/latest.json"
const automaticInterval = 6 * time.Hour
const manualInterval = time.Minute
const maxManifestBytes = 1 << 20

type release struct {
	TagName string  `json:"tag_name"`
	HTMLURL string  `json:"html_url"`
	Assets  []Asset `json:"assets"`
}

type cachedRelease struct {
	CheckedAt time.Time `json:"checkedAt"`
	Release   release   `json:"release"`
}

// Checker is shared by all windows. The mutex also merges concurrent checks;
// persisted successful metadata avoids a fresh request on each application start.
type Checker struct {
	mu          sync.Mutex
	url         string
	cachePath   string
	loaded      bool
	cached      cachedRelease
	lastAttempt time.Time
	lastError   error
}

func NewChecker(cachePath string) *Checker {
	return &Checker{url: manifestURL, cachePath: cachePath}
}

// Check allows manual refresh after one minute; background checks reuse metadata
// for six hours. Errors are briefly shared too, without extending the valid cache.
func (c *Checker) Check(current string, kind Kind, manual bool) Check {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.loaded {
		c.load()
		c.loaded = true
	}
	now := time.Now()
	if age := now.Sub(c.cached.CheckedAt); !manual && !c.cached.CheckedAt.IsZero() && age >= 0 && age < automaticInterval {
		return c.cached.Release.check(current, kind)
	}
	if age := now.Sub(c.lastAttempt); !c.lastAttempt.IsZero() && age >= 0 && age < manualInterval {
		if c.lastError != nil {
			return Check{Error: c.lastError.Error()}
		}
		return c.cached.Release.check(current, kind)
	}
	r, err := c.fetch(manual)
	c.lastAttempt, c.lastError = time.Now(), err
	if err != nil {
		return Check{Error: err.Error()}
	}
	c.cached = cachedRelease{CheckedAt: c.lastAttempt, Release: r}
	c.save()
	return r.check(current, kind)
}

func (r release) check(current string, kind Kind) Check {
	latest := strings.TrimPrefix(r.TagName, "v")
	var asset *Asset
	if picked := PickAsset(r.Assets, kind); picked != nil {
		copy := *picked
		asset = &copy
	}
	return Check{OK: true, Current: current, Latest: latest, HasUpdate: CompareVersions(latest, current) > 0,
		URL: r.HTMLURL, Installable: asset != nil, Asset: asset}
}

var stableTag = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+$`)

func (r release) validate() error {
	if !stableTag.MatchString(r.TagName) || r.HTMLURL != RepoURL+"/releases/tag/"+r.TagName || len(r.Assets) == 0 {
		return errors.New("官网更新信息不完整，请稍后重试")
	}
	seen := make(map[string]bool)
	for _, asset := range r.Assets {
		validName := false
		for _, suffix := range assetSuffix {
			validName = validName || asset.Name == "MarkGo-"+strings.TrimPrefix(r.TagName, "v")+suffix
		}
		if !validName || seen[asset.Name] || asset.Size <= 0 || asset.URL != RepoURL+"/releases/download/"+r.TagName+"/"+asset.Name {
			return errors.New("官网安装包信息无效，请稍后重试")
		}
		seen[asset.Name] = true
	}
	return nil
}

func (c *Checker) fetch(manual bool) (release, error) {
	req, err := http.NewRequest(http.MethodGet, c.url, nil)
	if err != nil {
		return release{}, err
	}
	req.Header.Set("Accept", "application/json")
	if manual {
		req.Header.Set("Cache-Control", "no-cache")
	}
	res, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return release{}, fmt.Errorf("检查更新失败，请检查网络或代理：%w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return release{}, fmt.Errorf("官网更新服务暂不可用（HTTP %d），请稍后重试", res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxManifestBytes+1))
	if err != nil {
		return release{}, fmt.Errorf("读取更新信息失败：%w", err)
	}
	var r release
	if len(raw) > maxManifestBytes || json.Unmarshal(raw, &r) != nil {
		return release{}, errors.New("官网更新信息无法解析，请稍后重试")
	}
	if err := r.validate(); err != nil {
		return release{}, err
	}
	return r, nil
}

func (c *Checker) load() {
	if c.cachePath == "" {
		return
	}
	f, err := os.Open(c.cachePath)
	if err != nil {
		return
	}
	defer f.Close()
	var cache cachedRelease
	if json.NewDecoder(io.LimitReader(f, maxManifestBytes)).Decode(&cache) != nil || cache.Release.validate() != nil {
		return
	}
	age := time.Since(cache.CheckedAt)
	if cache.CheckedAt.IsZero() || age < 0 || age >= automaticInterval {
		return
	}
	c.cached, c.lastAttempt = cache, cache.CheckedAt
}

func (c *Checker) save() {
	if c.cachePath == "" {
		return
	}
	dir := filepath.Dir(c.cachePath)
	if os.MkdirAll(dir, 0o755) != nil {
		return
	}
	f, err := os.CreateTemp(dir, ".update-cache-*")
	if err != nil {
		return
	}
	defer os.Remove(f.Name())
	err = json.NewEncoder(f).Encode(c.cached)
	closeErr := f.Close()
	if err == nil && closeErr == nil {
		_ = os.Rename(f.Name(), c.cachePath)
	}
}
