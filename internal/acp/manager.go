package acp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/quietseek/markgo/internal/settings"
)

// ProtocolVersion ACP 协议版本
const ProtocolVersion = 1

const stderrTail = 4000

// 嵌入到提示词中的文档内容上限（字符），超过则只附带文件链接
const maxEmbedChars = 200_000

// InitTimeout 连接 Agent 的超时时间（首次通过 npx 启动需要下载）
var InitTimeout = 120 * time.Second

// 对话频道中附带给 Agent 的工作约定。
// 注意：fs/read_text_file 等是客户端协议方法而不是模型可调用的工具，不能写进提示词；
// 主流 ACP 适配器（Claude Code、Codex）都用自带工具直接读写磁盘，
// 因此 MarkGo 在发送前先保存文档，并把最新内容随提示词附上。
func chatPreamble(docPath string) string {
	return strings.Join([]string{
		"[MarkGo] 用户正在 MarkGo 编辑器中写作，当前文档：" + docPath,
		"- 消息中附带了该文档在编辑器中的最新内容（已同步保存到磁盘），请以它为准；之后若文档有变化会再次附上。",
		"- 需要修改文档时，直接用你的文件编辑工具修改该文件。MarkGo 会向用户展示修改前后的差异，由用户逐处确认后才会生效。",
		"- 保持 Markdown 格式与用户原有的写作风格，回答使用用户的语言。",
	}, "\n")
}

// Host 由应用提供：事件推送、当前 Agent 配置与会话工作目录
type Host struct {
	Emit    func(Event)
	Profile func() *settings.AgentProfile
	// Agent 会话的工作目录：笔记库 > 当前文档目录 > 用户目录
	Cwd func() string
	// 上报给 Agent 的客户端版本
	Version string
}

type decision struct {
	accepted bool
	content  *string
}

type sentDoc struct{ path, content string }

type launchCall struct {
	done chan struct{}
	info *AgentInfo
	err  error
}

type Manager struct {
	host Host

	mu              sync.Mutex
	cmd             *exec.Cmd
	conn            *Conn
	starting        *launchCall
	info            *AgentInfo
	embeddedContext bool
	stderr          string
	sessions        map[string]string // channel -> sessionId
	channels        map[string]string // sessionId -> channel
	sentDocs        map[string]sentDoc
	tools           map[string]ToolCallView
	permissions     map[string]pendingPermission
	writes          map[string]pendingWrite
	seq             int

	// 当前文档：Agent 读取时返回实时内容；监视磁盘以发现 Agent 绕过 ACP 直接改写文件
	activeDoc   *sentDoc
	diskContent *string
	watcher     *fsnotify.Watcher
	watchTimer  *time.Timer
}

type pendingPermission struct {
	channel string
	ch      chan *string
}

type pendingWrite struct {
	channel string
	ch      chan decision
}

func NewManager(host Host) *Manager {
	m := &Manager{host: host}
	m.resetLocked()
	return m
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.statusLocked()
}

func (m *Manager) statusLocked() Status {
	switch {
	case m.conn != nil && m.info != nil:
		return StatusReady
	case m.starting != nil:
		return StatusStarting
	}
	return StatusIdle
}

func (m *Manager) emitStatus(status Status, errMsg string) {
	m.mu.Lock()
	info := m.info
	m.mu.Unlock()
	m.host.Emit(Event{Type: "status", Status: string(status), Info: info, Error: errMsg})
}

// Start 启动并连接 Agent；已连接时直接返回，启动中则等待同一次启动
func (m *Manager) Start() (*AgentInfo, error) {
	m.mu.Lock()
	if m.conn != nil && m.info != nil {
		info := m.info
		m.mu.Unlock()
		return info, nil
	}
	if call := m.starting; call != nil {
		m.mu.Unlock()
		<-call.done
		return call.info, call.err
	}
	call := &launchCall{done: make(chan struct{})}
	m.starting = call
	m.mu.Unlock()

	call.info, call.err = m.launch()
	m.mu.Lock()
	if m.starting == call {
		m.starting = nil
	}
	m.mu.Unlock()
	close(call.done)
	return call.info, call.err
}

func (m *Manager) launch() (*AgentInfo, error) {
	profile := m.host.Profile()
	if profile == nil || strings.TrimSpace(profile.Command) == "" {
		return nil, errors.New("请先在「设置 → 集成」中安装 Agent")
	}
	m.emitStatus(StatusStarting, "")
	cmd := shellCommand(profile.Command)
	cmd.Dir = m.host.Cwd()
	cmd.Env = os.Environ()
	stdin, err1 := cmd.StdinPipe()
	stdout, err2 := cmd.StdoutPipe()
	stderr, err3 := cmd.StderrPipe()
	if err := errors.Join(err1, err2, err3); err != nil {
		return nil, m.failLaunch(err)
	}
	// 启动前登记，期间的 Stop() 能让本次启动作废
	m.mu.Lock()
	m.cmd, m.stderr = cmd, ""
	m.mu.Unlock()
	if err := cmd.Start(); err != nil {
		return nil, m.failLaunch(err)
	}

	stdoutDone := make(chan struct{})
	stdoutReader, stdoutWriter := io.Pipe()
	go func() {
		io.Copy(stdoutWriter, stdout)
		stdoutWriter.Close()
		close(stdoutDone)
	}()
	stderrDone := make(chan struct{})
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stderr.Read(buf)
			if n > 0 {
				m.mu.Lock()
				m.stderr = tail(m.stderr+string(buf[:n]), stderrTail)
				m.mu.Unlock()
			}
			if err != nil {
				break
			}
		}
		close(stderrDone)
	}()

	conn := NewConn(stdoutReader, stdin, m.handle)

	go func() {
		<-stdoutDone
		<-stderrDone
		err := cmd.Wait()
		conn.Close(exitError(cmd, err))
		m.mu.Lock()
		// 已连接的 Agent 意外退出；启动过程中的退出由 launch 处理
		active := m.cmd == cmd && m.info != nil
		if active {
			m.resetLocked()
		}
		lastLines := m.stderrLinesLocked()
		m.mu.Unlock()
		if active {
			msg := "Agent 进程已退出"
			if lastLines != "" {
				msg += "：\n" + lastLines
			}
			m.emitStatus(StatusError, msg)
		}
	}()

	ctx, cancel := context.WithTimeoutCause(context.Background(), InitTimeout, errors.New("连接 Agent 超时（首次通过 npx 启动需要下载，可稍后重试）"))
	defer cancel()
	var init struct {
		AgentCapabilities struct {
			PromptCapabilities struct {
				EmbeddedContext bool `json:"embeddedContext"`
			} `json:"promptCapabilities"`
		} `json:"agentCapabilities"`
		AgentInfo *struct {
			Name    string `json:"name"`
			Title   string `json:"title"`
			Version string `json:"version"`
		} `json:"agentInfo"`
		AuthMethods []AuthMethod `json:"authMethods"`
	}
	err := conn.Request(ctx, "initialize", map[string]any{
		"protocolVersion":    ProtocolVersion,
		"clientCapabilities": map[string]any{"fs": map[string]bool{"readTextFile": true, "writeTextFile": true}, "terminal": false},
		"clientInfo":         map[string]string{"name": "markgo", "title": "MarkGo", "version": m.host.Version},
	}, &init)

	m.mu.Lock()
	if m.cmd != cmd {
		// 连接过程中被 Stop() 或切换 Agent 取代
		m.mu.Unlock()
		conn.Close(nil)
		killTree(cmd)
		if err == nil {
			err = errors.New("连接已取消")
		}
		return nil, err
	}
	if err != nil {
		// 等进程退出后再取 stderr，报错信息才完整
		m.mu.Unlock()
		select {
		case <-stderrDone:
		case <-time.After(500 * time.Millisecond):
		}
		return nil, m.failLaunch(err)
	}
	info := &AgentInfo{Name: profile.Name, AuthMethods: init.AuthMethods}
	if info.AuthMethods == nil {
		info.AuthMethods = []AuthMethod{}
	}
	if a := init.AgentInfo; a != nil {
		info.Version = a.Version
		if a.Title != "" {
			info.Name = a.Title
		} else if a.Name != "" {
			info.Name = a.Name
		}
	}
	m.conn = conn
	m.info = info
	m.embeddedContext = init.AgentCapabilities.PromptCapabilities.EmbeddedContext
	m.mu.Unlock()
	m.emitStatus(StatusReady, "")
	return info, nil
}

func (m *Manager) failLaunch(err error) error {
	m.mu.Lock()
	lastLines := m.stderrLinesLocked()
	m.mu.Unlock()
	m.Stop()
	msg := err.Error()
	if lastLines != "" {
		msg += "\n" + lastLines
	}
	m.emitStatus(StatusError, msg)
	return errors.New(msg)
}

func (m *Manager) stderrLinesLocked() string {
	lines := strings.Split(strings.TrimSpace(m.stderr), "\n")
	if len(lines) > 6 {
		lines = lines[len(lines)-6:]
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func exitError(cmd *exec.Cmd, err error) error {
	if cmd.ProcessState != nil {
		if desc := signalDescription(cmd.ProcessState); desc != "" {
			return fmt.Errorf("Agent 进程已退出（%s）", desc)
		}
		return fmt.Errorf("Agent 进程已退出（code %d）", cmd.ProcessState.ExitCode())
	}
	return fmt.Errorf("Agent 进程已退出（%v）", err)
}

// ---------- 处理 Agent 发来的请求与通知 ----------

func (m *Manager) channelOf(sessionID string) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ch, ok := m.channels[sessionID]
	return ch, ok
}

func (m *Manager) handle(method string, params json.RawMessage, isNotification bool) (any, error) {
	switch method {
	case "session/update":
		var p struct {
			SessionID string        `json:"sessionId"`
			Update    sessionUpdate `json:"update"`
		}
		if json.Unmarshal(params, &p) == nil {
			if channel, ok := m.channelOf(p.SessionID); ok {
				m.forwardUpdate(channel, p.Update)
			}
		}
		return nil, nil
	case "session/request_permission":
		return m.requestPermission(params)
	case "fs/read_text_file":
		return m.readTextFile(params)
	case "fs/write_text_file":
		return m.writeTextFile(params)
	}
	if isNotification {
		return nil, nil
	}
	return nil, &RPCError{Code: -32601, Message: "Method not found: " + method}
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type sessionUpdate struct {
	SessionUpdate string `json:"sessionUpdate"`
	// 消息块为单个 ContentBlock；tool_call 中为数组，这里只解析前者
	Content    json.RawMessage `json:"content"`
	ToolCallID string          `json:"toolCallId"`
	Title      string          `json:"title"`
	Kind       *string         `json:"kind"`
	Status     *string         `json:"status"`
	Locations  *[]struct {
		Path string `json:"path"`
	} `json:"locations"`
	Entries []PlanEntry `json:"entries"`
}

func (m *Manager) forwardUpdate(channel string, u sessionUpdate) {
	switch u.SessionUpdate {
	case "agent_message_chunk", "agent_thought_chunk":
		var block contentBlock
		if json.Unmarshal(u.Content, &block) == nil && block.Type == "text" && block.Text != "" {
			typ := "message"
			if u.SessionUpdate == "agent_thought_chunk" {
				typ = "thought"
			}
			m.host.Emit(Event{Type: typ, Channel: channel, Text: block.Text})
		}
	case "tool_call", "tool_call_update":
		tool := m.mergeTool(u)
		m.host.Emit(Event{Type: "tool", Channel: channel, Tool: &tool})
	case "plan":
		entries := make([]PlanEntry, 0, len(u.Entries))
		for _, e := range u.Entries {
			entries = append(entries, PlanEntry{Content: e.Content, Status: e.Status})
		}
		m.host.Emit(Event{Type: "plan", Channel: channel, Entries: &entries})
	}
}

func (m *Manager) mergeTool(u sessionUpdate) ToolCallView {
	m.mu.Lock()
	defer m.mu.Unlock()
	prev := m.tools[u.ToolCallID]
	next := ToolCallView{ID: u.ToolCallID, Title: u.Title, Kind: prev.Kind, Status: prev.Status, Paths: prev.Paths}
	if next.Title == "" {
		next.Title = prev.Title
	}
	if next.Title == "" {
		next.Title = "工具调用"
	}
	if u.Kind != nil {
		next.Kind = *u.Kind
	}
	if u.Status != nil {
		next.Status = *u.Status
	}
	if u.Locations != nil {
		next.Paths = []string{}
		for _, l := range *u.Locations {
			next.Paths = append(next.Paths, l.Path)
		}
	}
	if next.Paths == nil {
		next.Paths = []string{}
	}
	m.tools[u.ToolCallID] = next
	return next
}

type permissionOutcome struct {
	Outcome  string `json:"outcome"`
	OptionID string `json:"optionId,omitempty"`
}

func (m *Manager) requestPermission(params json.RawMessage) (any, error) {
	var p struct {
		SessionID string `json:"sessionId"`
		ToolCall  struct {
			ToolCallID string  `json:"toolCallId"`
			Title      string  `json:"title"`
			Kind       *string `json:"kind"`
		} `json:"toolCall"`
		Options []PermissionOption `json:"options"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &RPCError{Code: -32602, Message: err.Error()}
	}
	channel, ok := m.channelOf(p.SessionID)
	if !ok {
		channel = "chat"
	}
	// 内联 AI 只需要文本结果，不允许执行任何操作
	if channel != "chat" {
		for _, o := range p.Options {
			if strings.HasPrefix(o.Kind, "reject") {
				return map[string]any{"outcome": permissionOutcome{Outcome: "selected", OptionID: o.OptionID}}, nil
			}
		}
		return map[string]any{"outcome": permissionOutcome{Outcome: "cancelled"}}, nil
	}
	title := p.ToolCall.Title
	m.mu.Lock()
	if title == "" {
		title = m.tools[p.ToolCall.ToolCallID].Title
	}
	requestID := m.nextIDLocked("perm")
	ch := make(chan *string, 1)
	m.permissions[requestID] = pendingPermission{channel: channel, ch: ch}
	m.mu.Unlock()
	if title == "" {
		title = "Agent 请求执行操作"
	}
	view := PermissionView{RequestID: requestID, Title: title, Options: p.Options}
	if p.ToolCall.Kind != nil {
		view.Kind = *p.ToolCall.Kind
	}
	if view.Options == nil {
		view.Options = []PermissionOption{}
	}
	m.host.Emit(Event{Type: "permission", Channel: channel, Permission: &view})
	if optionID := <-ch; optionID != nil {
		return map[string]any{"outcome": permissionOutcome{Outcome: "selected", OptionID: *optionID}}, nil
	}
	return map[string]any{"outcome": permissionOutcome{Outcome: "cancelled"}}, nil
}

func (m *Manager) readTextFile(params json.RawMessage) (any, error) {
	var p struct {
		Path  string `json:"path"`
		Line  *int   `json:"line"`
		Limit *int   `json:"limit"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &RPCError{Code: -32602, Message: err.Error()}
	}
	path, _ := filepath.Abs(p.Path)
	m.mu.Lock()
	var text string
	live := m.activeDoc != nil && samePath(path, m.activeDoc.path)
	if live {
		text = m.activeDoc.content
	}
	m.mu.Unlock()
	if !live {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		text = string(raw)
	}
	return map[string]string{"content": SliceLines(text, p.Line, p.Limit)}, nil
}

func (m *Manager) writeTextFile(params json.RawMessage) (any, error) {
	var p struct {
		SessionID string `json:"sessionId"`
		Path      string `json:"path"`
		Content   string `json:"content"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &RPCError{Code: -32602, Message: err.Error()}
	}
	channel, ok := m.channelOf(p.SessionID)
	if !ok {
		channel = "chat"
	}
	if channel != "chat" {
		return nil, errors.New("内联 AI 不允许修改文件，请直接在回复中输出结果")
	}
	path, _ := filepath.Abs(p.Path)
	m.mu.Lock()
	isActive := m.activeDoc != nil && samePath(path, m.activeDoc.path)
	var before string
	if isActive {
		before = m.activeDoc.content
	}
	m.mu.Unlock()
	if !isActive {
		if raw, err := os.ReadFile(path); err == nil {
			before = string(raw)
		}
	}
	if before == p.Content {
		return nil, nil
	}
	d := m.propose(channel, WriteProposal{Path: path, Before: before, After: p.Content, Source: "agent"})
	if !d.accepted {
		return nil, errors.New("用户拒绝了这次修改")
	}
	final := p.Content
	if d.content != nil {
		final = *d.content
	}
	if isActive {
		// 编辑器负责应用并保存；同步实时内容，避免 Agent 紧接着读到旧版本
		m.mu.Lock()
		if m.activeDoc != nil && samePath(path, m.activeDoc.path) {
			m.activeDoc.content = final
		}
		m.mu.Unlock()
		return nil, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	return nil, os.WriteFile(path, []byte(final), 0o644)
}

func (m *Manager) propose(channel string, p WriteProposal) decision {
	ch := make(chan decision, 1)
	m.mu.Lock()
	p.RequestID = m.nextIDLocked("write")
	m.writes[p.RequestID] = pendingWrite{channel: channel, ch: ch}
	m.mu.Unlock()
	m.host.Emit(Event{Type: "write", Channel: channel, Proposal: &p})
	return <-ch
}

// ---------- 提问 ----------

// Prompt 在 channel 对应的会话中提问，阻塞到这一轮回答结束
func (m *Manager) Prompt(input PromptInput) (string, error) {
	if _, err := m.Start(); err != nil {
		return "", err
	}
	m.mu.Lock()
	conn := m.conn
	sessionID := ""
	if !input.Fresh {
		sessionID = m.sessions[input.Channel]
	}
	m.mu.Unlock()
	if conn == nil {
		return "", errors.New("Agent 未连接")
	}
	isNew := sessionID == ""
	if isNew {
		var res struct {
			SessionID string `json:"sessionId"`
		}
		if err := conn.Request(context.Background(), "session/new", map[string]any{"cwd": m.host.Cwd(), "mcpServers": []any{}}, &res); err != nil {
			msg := m.describeError(err)
			m.host.Emit(Event{Type: "error", Channel: input.Channel, Error: msg})
			return "", errors.New(msg)
		}
		sessionID = res.SessionID
		m.mu.Lock()
		if old, ok := m.sessions[input.Channel]; ok {
			delete(m.channels, old)
		}
		m.sessions[input.Channel] = sessionID
		m.channels[sessionID] = input.Channel
		m.mu.Unlock()
	}
	blocks := m.buildPrompt(sessionID, input, isNew)
	var res struct {
		StopReason string `json:"stopReason"`
	}
	if err := conn.Request(context.Background(), "session/prompt", map[string]any{"sessionId": sessionID, "prompt": blocks}, &res); err != nil {
		msg := m.describeError(err)
		m.host.Emit(Event{Type: "error", Channel: input.Channel, Error: msg})
		return "", errors.New(msg)
	}
	// 本轮的 session/update 通知已在响应之前按顺序处理完，done 是该轮最后一个事件
	m.host.Emit(Event{Type: "done", Channel: input.Channel, StopReason: res.StopReason})
	return res.StopReason, nil
}

func (m *Manager) buildPrompt(sessionID string, input PromptInput, isNew bool) []map[string]any {
	parts := []string{}
	docBlocks := []map[string]any{}
	if input.Channel == "chat" && input.DocPath != "" {
		m.mu.Lock()
		prev, hasPrev := m.sentDocs[sessionID]
		embedded := m.embeddedContext
		m.mu.Unlock()
		switched := !hasPrev || !samePath(prev.path, input.DocPath)
		if isNew || switched {
			parts = append(parts, chatPreamble(input.DocPath))
		}
		uri := fileURL(input.DocPath)
		name := filepath.Base(input.DocPath)
		content := input.DocContent
		tooLarge := content != nil && len([]rune(*content)) > maxEmbedChars
		switch {
		case content != nil && !tooLarge && (switched || prev.content != *content):
			m.mu.Lock()
			m.sentDocs[sessionID] = sentDoc{path: input.DocPath, content: *content}
			m.mu.Unlock()
			if embedded {
				docBlocks = append(docBlocks, map[string]any{"type": "resource", "resource": map[string]any{"uri": uri, "mimeType": "text/markdown", "text": *content}})
			} else {
				parts = append(parts, fmt.Sprintf("当前文档 %s 的最新内容：\n\n````markdown\n%s\n````", name, *content))
			}
		case content == nil || tooLarge:
			// 内容过大或未提供：只给出文件位置，由 Agent 自行读取（发送前已保存）
			parts = append(parts, "（文档较大，本条消息未附带全文，请直接读取该文件，磁盘上已是最新内容。）")
			docBlocks = append(docBlocks, map[string]any{"type": "resource_link", "uri": uri, "name": name})
		}
	}
	if input.Selection != "" {
		parts = append(parts, "用户选中的文本：\n\"\"\"\n"+input.Selection+"\n\"\"\"")
	}
	parts = append(parts, input.Text)
	return append([]map[string]any{{"type": "text", "text": strings.Join(parts, "\n\n")}}, docBlocks...)
}

func (m *Manager) Cancel(channel string) {
	m.mu.Lock()
	sessionID := m.sessions[channel]
	for id, p := range m.permissions {
		if p.channel == channel {
			p.ch <- nil
			delete(m.permissions, id)
		}
	}
	conn := m.conn
	m.mu.Unlock()
	if sessionID != "" && conn != nil {
		_ = conn.Notify("session/cancel", map[string]string{"sessionId": sessionID})
	}
}

func (m *Manager) RespondPermission(requestID string, optionID *string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, ok := m.permissions[requestID]; ok {
		p.ch <- optionID
		delete(m.permissions, requestID)
	}
}

func (m *Manager) ResolveWrite(requestID string, accepted bool, content *string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if w, ok := m.writes[requestID]; ok {
		w.ch <- decision{accepted: accepted, content: content}
		delete(m.writes, requestID)
	}
}

// ---------- 当前文档与外部修改检测 ----------

func (m *Manager) SetActiveDoc(path *string, markdown string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if path == nil || *path == "" {
		m.activeDoc = nil
		m.unwatchLocked()
		return
	}
	changed := m.activeDoc == nil || !samePath(m.activeDoc.path, *path)
	m.activeDoc = &sentDoc{path: *path, content: markdown}
	if changed {
		m.watchDocLocked(*path)
	}
}

// MarkSaved 编辑器刚保存文件后调用，避免被误判为外部修改
func (m *Manager) MarkSaved(path, content string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeDoc != nil && samePath(path, m.activeDoc.path) {
		m.diskContent = &content
	}
}

func (m *Manager) watchDocLocked(path string) {
	m.unwatchLocked()
	m.diskContent = nil
	if raw, err := os.ReadFile(path); err == nil {
		s := string(raw)
		m.diskContent = &s
	}
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return
	}
	// 监视目录而不是文件：很多工具通过“写临时文件再改名”的方式保存
	if err := w.Add(filepath.Dir(path)); err != nil {
		w.Close()
		return
	}
	m.watcher = w
	name := filepath.Base(path)
	go func() {
		for {
			select {
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if !samePath(filepath.Base(ev.Name), name) {
					continue
				}
				m.mu.Lock()
				if m.watcher == w {
					if m.watchTimer != nil {
						m.watchTimer.Stop()
					}
					m.watchTimer = time.AfterFunc(250*time.Millisecond, func() { m.checkDisk(path) })
				}
				m.mu.Unlock()
			case _, ok := <-w.Errors:
				if !ok {
					return
				}
			}
		}
	}()
}

func (m *Manager) checkDisk(path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	content := string(raw)
	m.mu.Lock()
	if m.activeDoc == nil || !samePath(m.activeDoc.path, path) {
		m.mu.Unlock()
		return
	}
	if (m.diskContent != nil && content == *m.diskContent) || content == m.activeDoc.content {
		m.diskContent = &content
		m.mu.Unlock()
		return
	}
	// 只在有 Agent 连接时把外部改动当作 AI 修改来审阅
	if m.conn == nil {
		m.mu.Unlock()
		return
	}
	m.diskContent = &content
	before := m.activeDoc.content
	m.mu.Unlock()
	d := m.propose("chat", WriteProposal{Path: path, Before: before, After: content, Source: "disk"})
	if !d.accepted {
		return
	}
	m.mu.Lock()
	if m.activeDoc != nil && samePath(m.activeDoc.path, path) {
		if d.content != nil {
			m.activeDoc.content = *d.content
		} else {
			m.activeDoc.content = content
		}
	}
	m.mu.Unlock()
}

func (m *Manager) unwatchLocked() {
	if m.watcher != nil {
		m.watcher.Close()
		m.watcher = nil
	}
	if m.watchTimer != nil {
		m.watchTimer.Stop()
		m.watchTimer = nil
	}
}

// ---------- 生命周期 ----------

func (m *Manager) resetLocked() {
	m.conn = nil
	m.cmd = nil
	m.info = nil
	m.sessions = map[string]string{}
	m.channels = map[string]string{}
	m.sentDocs = map[string]sentDoc{}
	m.tools = map[string]ToolCallView{}
	for _, p := range m.permissions {
		p.ch <- nil
	}
	m.permissions = map[string]pendingPermission{}
	for _, w := range m.writes {
		w.ch <- decision{}
	}
	m.writes = map[string]pendingWrite{}
}

// Stop 断开并结束 Agent 进程
func (m *Manager) Stop() {
	m.mu.Lock()
	cmd, conn := m.cmd, m.conn
	m.starting = nil
	m.resetLocked()
	m.mu.Unlock()
	if conn != nil {
		conn.Close(errors.New("Agent 已断开"))
	}
	if cmd != nil {
		killTree(cmd)
	}
	m.emitStatus(StatusIdle, "")
}

func (m *Manager) Dispose() {
	m.mu.Lock()
	m.unwatchLocked()
	m.mu.Unlock()
	m.Stop()
}

func (m *Manager) nextIDLocked(prefix string) string {
	m.seq++
	return prefix + "-" + strconv.Itoa(m.seq)
}

// SliceLines ACP 行号从 1 开始
func SliceLines(text string, line, limit *int) string {
	if (line == nil || *line == 0) && (limit == nil || *limit == 0) {
		return text
	}
	lines := strings.Split(text, "\n")
	start := 0
	if line != nil && *line > 0 {
		start = *line - 1
	}
	if start > len(lines) {
		start = len(lines)
	}
	end := len(lines)
	if limit != nil && *limit > 0 && start+*limit < end {
		end = start + *limit
	}
	return strings.Join(lines[start:end], "\n")
}

func samePath(a, b string) bool {
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func fileURL(p string) string {
	slashed := filepath.ToSlash(p)
	if !strings.HasPrefix(slashed, "/") {
		slashed = "/" + slashed
	}
	return (&url.URL{Scheme: "file", Path: slashed}).String()
}

func tail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[len(s)-n:]
}

var authRe = regexp.MustCompile(`(?i)auth`)

func (m *Manager) describeError(err error) string {
	var rpcErr *RPCError
	// ACP 约定 -32000 为需要认证
	if (errors.As(err, &rpcErr) && rpcErr.Code == -32000) || authRe.MatchString(err.Error()) {
		m.mu.Lock()
		info := m.info
		m.mu.Unlock()
		methods := []string{}
		if info != nil {
			for _, a := range info.AuthMethods {
				if a.Description != nil && *a.Description != "" {
					methods = append(methods, *a.Description)
				} else {
					methods = append(methods, a.Name)
				}
			}
		}
		hint := ""
		if len(methods) > 0 {
			hint = "可用方式：" + strings.Join(methods, "；") + "。"
		}
		return "Agent 需要先登录认证。" + hint + "请在终端中按该 Agent 的说明完成登录（如运行 claude 并执行 /login，或设置 API Key 环境变量）后重试。"
	}
	return err.Error()
}
