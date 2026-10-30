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

func TestDefaultsFollowPlatform(t *testing.T) {
	mac := New(t.TempDir(), "darwin", nil).Get()
	if mac.CloseAction != "background" || mac.WindowControls != "traffic" {
		t.Fatalf("mac=%s/%s", mac.CloseAction, mac.WindowControls)
	}
	win := New(t.TempDir(), "windows", nil).Get()
	if win.CloseAction != "quit" || win.WindowControls != "classic" || len(win.AI.Agents) != len(AgentPresets) {
		t.Fatalf("win=%+v", win)
	}
}

func TestSetMergesNestedObjectsAndEncryptsSecrets(t *testing.T) {
	dir := t.TempDir()
	s := New(dir, "linux", fakeBox{})
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
	reloaded := New(dir, "linux", fakeBox{}).Get()
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
	cfg := New(dir, "linux", nil).Get()
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
	s := New(t.TempDir(), "linux", nil)
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
