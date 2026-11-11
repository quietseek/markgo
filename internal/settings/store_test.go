package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeBox struct{}

func (fakeBox) Seal(s string) string {
	if s == "" {
		return ""
	}
	return secretPrefix + strings.ToUpper(s)
}
func (fakeBox) Open(s string) string {
	if !strings.HasPrefix(s, secretPrefix) {
		return s
	}
	return strings.ToLower(s[len(secretPrefix):])
}

func raw(t *testing.T, v string) map[string]json.RawMessage {
	t.Helper()
	m := map[string]json.RawMessage{}
	if err := json.Unmarshal([]byte(v), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestDefaults(t *testing.T) {
	cfg := New(t.TempDir(), nil).Get()
	if cfg.CloseAction != "background" || cfg.WindowControls != "traffic" || cfg.TrafficPosition != "right" ||
		cfg.EditorWidth != "full" || len(cfg.AI.Agents) != len(AgentPresets) {
		t.Fatalf("cfg=%+v", cfg)
	}
}

func TestTypographyPreservesLegacyAndPersistsOverrides(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{"editorFont":"serif"}`), 0600); err != nil {
		t.Fatal(err)
	}
	s := New(dir, nil)
	old := s.Get()
	if old.EditorFont != "serif" || old.EditorFontFamily != "" || old.EditorFontWeight != 0 || old.EditorCodeFont != "" {
		t.Fatalf("legacy settings changed: %+v", old)
	}
	if _, err := s.Set(raw(t, `{"editorFontFamily":"Microsoft YaHei","editorFontWeight":500,"editorCodeFont":"Consolas"}`)); err != nil {
		t.Fatal(err)
	}
	loaded := New(dir, nil).Get()
	if loaded.EditorFontFamily != "Microsoft YaHei" || loaded.EditorFontWeight != 500 || loaded.EditorCodeFont != "Consolas" {
		t.Fatalf("overrides lost: %+v", loaded)
	}
	if _, err := s.Set(raw(t, `{"editorFontFamily":"","editorFontWeight":0,"editorCodeFont":""}`)); err != nil {
		t.Fatal(err)
	}
	reset := New(dir, nil).Get()
	if reset.EditorFontFamily != "" || reset.EditorFontWeight != 0 || reset.EditorCodeFont != "" {
		t.Fatal("reset did not persist")
	}
}

func TestSetMergesNestedObjectsAndEncryptsSecrets(t *testing.T) {
	dir := t.TempDir()
	s := New(dir, fakeBox{})
	if _, err := s.Set(raw(t, `{"wechat":{"appId":"wx1","appSecret":"secret"},"themeKey":"github"}`)); err != nil {
		t.Fatal(err)
	}
	next, err := s.Set(raw(t, `{"wechat":{"author":"me"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if next.Wechat.AppID != "wx1" || next.Wechat.AppSecret != "secret" || next.Wechat.Author != "me" || next.ThemeKey != "github" {
		t.Fatalf("next=%+v", next.Wechat)
	}
	disk, _ := os.ReadFile(filepath.Join(dir, "settings.json"))
	if strings.Contains(string(disk), `"secret"`) || !strings.Contains(string(disk), "enc:SECRET") {
		t.Fatalf("secret stored in plain text: %s", disk)
	}
	reloaded := New(dir, fakeBox{}).Get()
	if reloaded.Wechat.AppSecret != "secret" || reloaded.Wechat.Author != "me" {
		t.Fatalf("reloaded=%+v", reloaded.Wechat)
	}
}

func TestMigratesOldSettings(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "settings.json"), []byte(`{
		"editorTheme": "wechat",
		"editorWidth": "narrow",
		"lastWorkspace": "/notes",
		"wechat": {"appSecret": "enc:undecryptable"},
		"ai": {"agents": [{"id": "codex", "name": "Codex", "command": "codex-acp"}], "activeAgentId": "codex"}
	}`), 0o644)
	cfg := New(dir, nil).Get()
	if cfg.ThemeKey != "wechat" || cfg.EditorTheme != "sync" || cfg.EditorWidth != "default" {
		t.Fatalf("theme=%s/%s width=%s", cfg.ThemeKey, cfg.EditorTheme, cfg.EditorWidth)
	}
	if len(cfg.RecentWorkspaces) != 1 || cfg.RecentWorkspaces[0] != "/notes" {
		t.Fatalf("recent=%v", cfg.RecentWorkspaces)
	}
	if cfg.Wechat.AppSecret != "" {
		t.Fatalf("undecryptable secret should be dropped, got %q", cfg.Wechat.AppSecret)
	}
	if a := cfg.ActiveAgent(); a.ID != "codex" || a.Command != "codex-acp" || a.Installed == nil || !*a.Installed {
		t.Fatalf("active=%+v", a)
	}
	if len(cfg.AI.Agents) != len(AgentPresets) {
		t.Fatalf("presets not appended: %d", len(cfg.AI.Agents))
	}
}

func TestSetNullDeletesAndAgentsDoNotInheritFields(t *testing.T) {
	s := New(t.TempDir(), nil)
	s.Set(raw(t, `{"lastWorkspace":"/notes","ai":{"agents":[{"id":"a","name":"A","command":"a","installed":true},{"id":"b","name":"B","command":"b"}]}}`))
	next, err := s.Set(raw(t, `{"lastWorkspace":null,"ai":{"agents":[{"id":"b","name":"B","command":"b"}]}}`))
	if err != nil {
		t.Fatal(err)
	}
	if next.LastWorkspace != "" {
		t.Fatalf("lastWorkspace=%q", next.LastWorkspace)
	}
	if len(next.AI.Agents) != 1 || next.AI.Agents[0].Installed != nil {
		t.Fatalf("agents=%+v", next.AI.Agents)
	}
}
