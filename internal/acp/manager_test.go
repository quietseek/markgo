package acp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/quietseek/markgo/internal/settings"
)

type harness struct {
	t       *testing.T
	dir     string
	doc     string
	manager *Manager

	mu        sync.Mutex
	events    []Event
	listeners []func(Event)
}

func setup(t *testing.T, env string) *harness {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	h := &harness{t: t, dir: t.TempDir()}
	h.doc = filepath.Join(h.dir, "note.md")
	os.WriteFile(h.doc, []byte("# 标题\n\n磁盘上的旧内容\n"), 0o644)
	command := strings.TrimSpace(fmt.Sprintf("MARKGO_MOCK_AGENT=1 %s %q", env, exe))
	h.manager = NewManager(Host{
		Emit: h.emit,
		Profile: func() *settings.AgentProfile {
			return &settings.AgentProfile{ID: "mock", Name: "Mock", Command: command}
		},
		Cwd:     func() string { return h.dir },
		Version: "test",
	})
	t.Cleanup(h.manager.Dispose)
	return h
}

func (h *harness) emit(e Event) {
	h.mu.Lock()
	h.events = append(h.events, e)
	listeners := append([]func(Event){}, h.listeners...)
	h.mu.Unlock()
	for _, l := range listeners {
		l(e)
	}
}

func (h *harness) on(l func(Event)) {
	h.mu.Lock()
	h.listeners = append(h.listeners, l)
	h.mu.Unlock()
}

func (h *harness) snapshot() []Event {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]Event{}, h.events...)
}

func (h *harness) text(from int, channel string) string {
	var b strings.Builder
	for _, e := range h.snapshot()[from:] {
		if e.Type == "message" && (channel == "" || e.Channel == channel) {
			b.WriteString(e.Text)
		}
	}
	return b.String()
}

func (h *harness) find(typ string) *Event {
	for _, e := range h.snapshot() {
		if e.Type == typ {
			return &e
		}
	}
	return nil
}

func (h *harness) autoAnswer(accept bool, content *string) {
	h.on(func(e Event) {
		if e.Type == "permission" {
			allow := "allow"
			go h.manager.RespondPermission(e.Permission.RequestID, &allow)
		}
		if e.Type == "write" {
			go h.manager.ResolveWrite(e.Proposal.RequestID, accept, content)
		}
	})
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for condition")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func str(s string) *string { return &s }

func TestInitializesAndStreamsAReply(t *testing.T) {
	h := setup(t, "")
	info, err := h.manager.Start()
	if err != nil {
		t.Fatal(err)
	}
	if info.Name != "Mock Agent" || h.manager.Status() != StatusReady {
		t.Fatalf("info=%+v status=%s", info, h.manager.Status())
	}
	stop, err := h.manager.Prompt(PromptInput{Channel: "chat", Text: "hi"})
	if err != nil || stop != "end_turn" {
		t.Fatalf("stop=%q err=%v", stop, err)
	}
	if got := h.text(0, ""); got != "你好，我是 **Mock Agent**。" {
		t.Fatalf("text=%q", got)
	}
	if h.find("thought") == nil {
		t.Fatal("missing thought")
	}
	if last := h.snapshot()[len(h.snapshot())-1]; last.Type != "done" {
		t.Fatalf("last event should be done, got %s", last.Type)
	}
}

func TestServesLiveContentAndRoutesWritesThroughReview(t *testing.T) {
	h := setup(t, "")
	h.manager.SetActiveDoc(&h.doc, "# 标题\n\n编辑器里未保存的内容\n")
	h.autoAnswer(true, nil)
	if _, err := h.manager.Prompt(PromptInput{Channel: "chat", Text: "please edit", DocPath: h.doc}); err != nil {
		t.Fatal(err)
	}
	w := h.find("write")
	if w == nil || w.Proposal.Source != "agent" {
		t.Fatalf("write=%+v", w)
	}
	// Agent 读到的是编辑器实时内容，而不是磁盘内容
	if !strings.Contains(w.Proposal.Before, "未保存的内容") || !strings.Contains(w.Proposal.After, "# 标题（AI 修订版）") {
		t.Fatalf("proposal=%+v", w.Proposal)
	}
	// 当前文档由编辑器负责保存，ACP 层不直接写盘
	if raw, _ := os.ReadFile(h.doc); !strings.Contains(string(raw), "磁盘上的旧内容") {
		t.Fatalf("disk changed: %s", raw)
	}
	var lastTool *ToolCallView
	for _, e := range h.snapshot() {
		if e.Type == "tool" {
			lastTool = e.Tool
		}
	}
	if lastTool == nil || lastTool.Status != "completed" || len(lastTool.Paths) != 1 || lastTool.Paths[0] != h.doc {
		t.Fatalf("tool=%+v", lastTool)
	}
	if p := h.find("plan"); p == nil || len(*p.Entries) != 2 {
		t.Fatalf("plan=%+v", p)
	}
}

func TestReportsRejectionBackToTheAgent(t *testing.T) {
	h := setup(t, "")
	h.manager.SetActiveDoc(&h.doc, "# 标题\n")
	h.autoAnswer(false, nil)
	h.manager.Prompt(PromptInput{Channel: "chat", Text: "edit", DocPath: h.doc})
	if got := h.text(0, ""); !strings.Contains(got, "修改被拒绝") {
		t.Fatalf("text=%q", got)
	}
}

func TestWritesOtherFilesAfterAcceptance(t *testing.T) {
	h := setup(t, "")
	other := filepath.Join(h.dir, "other.md")
	os.WriteFile(other, []byte("# 另一篇\n"), 0o644)
	h.autoAnswer(true, str("部分接受的结果\n"))
	if _, err := h.manager.Prompt(PromptInput{Channel: "chat", Text: "edit", DocPath: other}); err != nil {
		t.Fatal(err)
	}
	if raw, _ := os.ReadFile(other); string(raw) != "部分接受的结果\n" {
		t.Fatalf("other=%q", raw)
	}
}

func TestInlineChannelsAutoRejectPermissions(t *testing.T) {
	h := setup(t, "")
	stop, err := h.manager.Prompt(PromptInput{Channel: "inline-1", Text: "[MarkGo 内联编辑] 润色", Selection: "原文", Fresh: true})
	if err != nil || stop != "end_turn" {
		t.Fatalf("stop=%q err=%v", stop, err)
	}
	if got := h.text(0, "inline-1"); got != "【润色】原文" {
		t.Fatalf("text=%q", got)
	}
	if h.find("permission") != nil {
		t.Fatal("inline permission should not reach the UI")
	}
}

func TestCancelsARunningPrompt(t *testing.T) {
	h := setup(t, "")
	type result struct {
		stop string
		err  error
	}
	done := make(chan result, 1)
	go func() {
		stop, err := h.manager.Prompt(PromptInput{Channel: "chat", Text: "slow"})
		done <- result{stop, err}
	}()
	waitFor(t, 10*time.Second, func() bool { return h.find("message") != nil })
	h.manager.Cancel("chat")
	select {
	case r := <-done:
		if r.err != nil || r.stop != "cancelled" {
			t.Fatalf("result=%+v", r)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("prompt was not cancelled")
	}
}

func TestDetectsDirectDiskEdits(t *testing.T) {
	h := setup(t, "")
	if _, err := h.manager.Start(); err != nil {
		t.Fatal(err)
	}
	h.manager.SetActiveDoc(&h.doc, "# 标题\n\n磁盘上的旧内容\n")
	h.manager.MarkSaved(h.doc, "# 标题\n\n磁盘上的旧内容\n")
	time.Sleep(100 * time.Millisecond)
	os.WriteFile(h.doc, []byte("# 标题\n\n被外部程序改写\n"), 0o644)
	waitFor(t, 5*time.Second, func() bool { return h.find("write") != nil })
	w := h.find("write")
	if w.Proposal.Source != "disk" || w.Proposal.After != "# 标题\n\n被外部程序改写\n" {
		t.Fatalf("proposal=%+v", w.Proposal)
	}
	// 退出前处理掉等待中的审阅，避免 goroutine 泄漏
	h.manager.ResolveWrite(w.Proposal.RequestID, false, nil)
}

func TestReportsFailingLaunchWithStderr(t *testing.T) {
	m := NewManager(Host{
		Emit: func(Event) {},
		Profile: func() *settings.AgentProfile {
			return &settings.AgentProfile{ID: "x", Name: "x", Command: `echo "boom: not an agent" >&2; exit 3`}
		},
		Cwd: t.TempDir,
	})
	defer m.Dispose()
	_, err := m.Start()
	if err == nil || !strings.Contains(err.Error(), "boom: not an agent") {
		t.Fatalf("err=%v", err)
	}
}

type contextReport struct {
	Types            []string `json:"types"`
	Embedded         *string  `json:"embedded"`
	InlineDoc        *string  `json:"inlineDoc"`
	Preamble         bool     `json:"preamble"`
	MentionsProtocol bool     `json:"mentionsProtocol"`
}

func (h *harness) probe(content, docPath string) contextReport {
	h.t.Helper()
	before := len(h.snapshot())
	if _, err := h.manager.Prompt(PromptInput{Channel: "chat", Text: "context?", DocPath: docPath, DocContent: &content}); err != nil {
		h.t.Fatal(err)
	}
	var r contextReport
	if err := json.Unmarshal([]byte(h.text(before, "chat")), &r); err != nil {
		h.t.Fatal(err)
	}
	return r
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestEmbedsLiveContentOnlyWhenChanged(t *testing.T) {
	h := setup(t, "")
	first := h.probe("# 标题\n\n未保存的草稿", h.doc)
	if strings.Join(first.Types, ",") != "text,resource" || deref(first.Embedded) != "# 标题\n\n未保存的草稿" || !first.Preamble || first.MentionsProtocol {
		t.Fatalf("first=%+v", first)
	}
	same := h.probe("# 标题\n\n未保存的草稿", h.doc)
	if strings.Join(same.Types, ",") != "text" || same.Embedded != nil || same.Preamble {
		t.Fatalf("same=%+v", same)
	}
	changed := h.probe("# 标题\n\n又改了一句", h.doc)
	if strings.Join(changed.Types, ",") != "text,resource" || deref(changed.Embedded) != "# 标题\n\n又改了一句" || changed.Preamble {
		t.Fatalf("changed=%+v", changed)
	}
}

func TestReintroducesDocumentAfterSwitching(t *testing.T) {
	h := setup(t, "")
	h.probe("A", h.doc)
	other := h.probe("B", filepath.Join(h.dir, "other.md"))
	if deref(other.Embedded) != "B" || !other.Preamble {
		t.Fatalf("other=%+v", other)
	}
}

func TestFallsBackToInlineTextWithoutEmbeddedContext(t *testing.T) {
	h := setup(t, "MOCK_EMBEDDED=0")
	r := h.probe("# 标题\n\n正文", h.doc)
	if strings.Join(r.Types, ",") != "text" || r.Embedded != nil || deref(r.InlineDoc) != "# 标题\n\n正文" || !r.Preamble {
		t.Fatalf("r=%+v", r)
	}
}

func TestLinksInsteadOfEmbeddingLargeDocuments(t *testing.T) {
	h := setup(t, "")
	r := h.probe(strings.Repeat("字", 200_001), h.doc)
	if strings.Join(r.Types, ",") != "text,resource_link" || r.Embedded != nil {
		t.Fatalf("r=%+v", r)
	}
}

func TestSliceLines(t *testing.T) {
	two := 2
	if got := SliceLines("a\nb\nc\nd", &two, &two); got != "b\nc" {
		t.Fatalf("got %q", got)
	}
	if got := SliceLines("a\nb", nil, nil); got != "a\nb" {
		t.Fatalf("got %q", got)
	}
}

func TestToolCallWithContentArrayIsForwarded(t *testing.T) {
	var got []Event
	m := NewManager(Host{Emit: func(e Event) { got = append(got, e) }})
	m.channels["s1"] = "chat"
	params := []byte(`{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Edit","status":"pending","content":[{"type":"diff","path":"/a.md","oldText":"a","newText":"b"}]}}`)
	m.handle("session/update", params, true)
	if len(got) != 1 || got[0].Tool == nil || got[0].Tool.Title != "Edit" {
		t.Fatalf("events=%+v", got)
	}
}
