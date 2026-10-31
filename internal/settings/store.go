package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"sync"
)

// 嵌套对象：读取与更新时按字段合并，而不是整体替换
var nestedKeys = []string{"wechat", "ai", "writing", "imageGen", "export"}

type Store struct {
	mu       sync.Mutex
	dir      string
	platform string
	secrets  SecretBox
	cache    *AppSettings
}

// New 创建设置存储。dir 为用户数据目录，platform 取 runtime.GOOS（决定平台相关的默认值）。
func New(dir, platform string, secrets SecretBox) *Store {
	if secrets == nil {
		secrets = plainBox{}
	}
	return &Store{dir: dir, platform: platform, secrets: secrets}
}

func (s *Store) Dir() string { return s.dir }

func (s *Store) file() string { return filepath.Join(s.dir, "settings.json") }

// Get 返回当前设置的副本
func (s *Store) Get() AppSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return clone(s.load())
}

func (s *Store) load() *AppSettings {
	if s.cache != nil {
		return s.cache
	}
	stored := map[string]json.RawMessage{}
	if data, err := os.ReadFile(s.file()); err == nil {
		if json.Unmarshal(data, &stored) != nil {
			stored = map[string]json.RawMessage{}
		}
	}
	defaults := Defaults()
	merged := mergeJSON(toMap(&defaults), stored)
	cfg := Defaults()
	if raw, err := json.Marshal(merged); err == nil {
		// 个别字段类型不符时保留默认值
		_ = json.Unmarshal(raw, &cfg)
	}
	cfg.Wechat.AppSecret = s.secrets.Open(cfg.Wechat.AppSecret)
	cfg.ImageGen.APIKey = s.secrets.Open(cfg.ImageGen.APIKey)
	s.migrate(&cfg, stored)
	s.cache = &cfg
	return s.cache
}

func (s *Store) migrate(cfg *AppSettings, stored map[string]json.RawMessage) {
	has := func(k string) bool {
		v, ok := stored[k]
		return ok && string(v) != "null" && string(v) != `""`
	}
	// 旧版本可为编辑器单独指定主题；现在编辑区所见即发布所得，统一为排版主题
	if cfg.EditorTheme != "default" && cfg.EditorTheme != "sync" {
		if cfg.EditorTheme != "" {
			cfg.ThemeKey = cfg.EditorTheme
		}
		cfg.EditorTheme = "sync"
	}
	// 关闭行为与窗口按钮样式默认跟随平台习惯
	isMac := s.platform == "darwin"
	if !has("closeAction") {
		cfg.CloseAction = map[bool]string{true: "background", false: "quit"}[isMac]
	}
	if !has("windowControls") {
		cfg.WindowControls = map[bool]string{true: "traffic", false: "classic"}[isMac]
	}
	// 旧版本没有「安装」概念：已在使用的 Agent 视为已安装
	if has("ai") && !slices.ContainsFunc(cfg.AI.Agents, func(a AgentProfile) bool { return a.Installed != nil }) {
		yes := true
		for i := range cfg.AI.Agents {
			if cfg.AI.Agents[i].ID == cfg.AI.ActiveAgentID {
				cfg.AI.Agents[i].Installed = &yes
			}
		}
	}
	// 补上新增的预置 Agent（保留用户已有配置与顺序）
	for _, preset := range AgentPresets {
		if !slices.ContainsFunc(cfg.AI.Agents, func(a AgentProfile) bool { return a.ID == preset.ID }) {
			cfg.AI.Agents = append(cfg.AI.Agents, preset)
		}
	}
	if cfg.Export.FormatArgs == nil {
		cfg.Export.FormatArgs = map[string]string{}
	}
	if cfg.TrayMenu == nil {
		cfg.TrayMenu = Defaults().TrayMenu
	}
	if cfg.RecentWorkspaces == nil {
		cfg.RecentWorkspaces = []string{}
	}
	// 旧版本没有最近列表：以当前笔记库作为第一项
	if !has("recentWorkspaces") && cfg.LastWorkspace != "" {
		cfg.RecentWorkspaces = []string{cfg.LastWorkspace}
	}
	// 旧版本的宽度选项（窄 / 适中 / 宽）迁移到新的预设
	if !slices.Contains([]string{"default", "wide", "full"}, cfg.EditorWidth) {
		cfg.EditorWidth = "default"
	}
}

// Set 按字段合并更新并落盘；patch 为 Partial<AppSettings> 的 JSON
func (s *Store) Set(patch map[string]json.RawMessage) (AppSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := s.load()
	// 解码到全新的结构体：json 会复用已有切片元素，旧 Agent 的 installed 等字段会残留到新数组里
	var next AppSettings
	raw, err := json.Marshal(mergeJSON(toMap(current), patch))
	if err == nil {
		err = json.Unmarshal(raw, &next)
	}
	if err != nil {
		return clone(current), err
	}
	s.cache = &next
	onDisk := clone(&next)
	onDisk.Wechat.AppSecret = s.secrets.Seal(next.Wechat.AppSecret)
	onDisk.ImageGen.APIKey = s.secrets.Seal(next.ImageGen.APIKey)
	data, _ := json.MarshalIndent(onDisk, "", "  ")
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return clone(&next), err
	}
	return clone(&next), os.WriteFile(s.file(), data, 0o600)
}

// Update 在 Go 侧修改设置（如记录最近的文件夹），等价于 Set
func (s *Store) Update(fn func(cfg *AppSettings)) (AppSettings, error) {
	cfg := s.Get()
	fn(&cfg)
	patch := toMap(&cfg)
	return s.Set(patch)
}

func toMap(v any) map[string]json.RawMessage {
	raw, _ := json.Marshal(v)
	m := map[string]json.RawMessage{}
	_ = json.Unmarshal(raw, &m)
	return m
}

func mergeJSON(base, patch map[string]json.RawMessage) map[string]json.RawMessage {
	out := make(map[string]json.RawMessage, len(base)+len(patch))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range patch {
		// null 表示删除该项（恢复为零值）
		if string(v) == "null" {
			delete(out, k)
			continue
		}
		if slices.Contains(nestedKeys, k) {
			var b, p map[string]json.RawMessage
			if json.Unmarshal(out[k], &b) == nil && json.Unmarshal(v, &p) == nil && p != nil {
				if b == nil {
					b = map[string]json.RawMessage{}
				}
				for pk, pv := range p {
					b[pk] = pv
				}
				v, _ = json.Marshal(b)
			}
		}
		out[k] = v
	}
	return out
}

func clone(cfg *AppSettings) AppSettings {
	var out AppSettings
	raw, _ := json.Marshal(cfg)
	_ = json.Unmarshal(raw, &out)
	return out
}
