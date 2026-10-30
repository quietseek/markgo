package acp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

// 测试用 ACP Agent：测试二进制以 MARKGO_MOCK_AGENT=1 重新启动自身，
// 通过 stdio 讲 Agent Client Protocol，按提示词中的关键字执行固定剧本
func TestMain(m *testing.M) {
	if os.Getenv("MARKGO_MOCK_AGENT") == "1" {
		runMockAgent()
		return
	}
	os.Exit(m.Run())
}

type promptBlock struct {
	Type     string `json:"type"`
	Text     string `json:"text"`
	URI      string `json:"uri"`
	Resource *struct {
		URI  string `json:"uri"`
		Text string `json:"text"`
	} `json:"resource"`
}

func runMockAgent() {
	var (
		mu        sync.Mutex
		seq       int
		cancelled = map[string]bool{}
		conn      *Conn
	)
	isCancelled := func(id string) bool {
		mu.Lock()
		defer mu.Unlock()
		return cancelled[id]
	}
	say := func(sessionID, text string) {
		conn.Notify("session/update", map[string]any{"sessionId": sessionID, "update": map[string]any{"sessionUpdate": "agent_message_chunk", "content": map[string]any{"type": "text", "text": text}}})
	}
	update := func(sessionID string, u map[string]any) {
		conn.Notify("session/update", map[string]any{"sessionId": sessionID, "update": u})
	}
	ctx := context.Background()
	handler := func(method string, params json.RawMessage, _ bool) (any, error) {
		switch method {
		case "initialize":
			return map[string]any{
				"protocolVersion": ProtocolVersion,
				// MOCK_EMBEDDED=0 模拟不支持嵌入资源的 Agent
				"agentCapabilities": map[string]any{"promptCapabilities": map[string]any{"embeddedContext": os.Getenv("MOCK_EMBEDDED") != "0"}},
				"agentInfo":         map[string]any{"name": "mock-agent", "title": "Mock Agent", "version": "1.0.0"},
				"authMethods":       []any{},
			}, nil
		case "session/new":
			mu.Lock()
			seq++
			id := fmt.Sprintf("s%d", seq)
			mu.Unlock()
			return map[string]any{"sessionId": id}, nil
		case "session/cancel":
			var p struct {
				SessionID string `json:"sessionId"`
			}
			json.Unmarshal(params, &p)
			mu.Lock()
			cancelled[p.SessionID] = true
			mu.Unlock()
			return nil, nil
		case "session/prompt":
		default:
			return nil, &RPCError{Code: -32601, Message: "not found"}
		}
		var p struct {
			SessionID string        `json:"sessionId"`
			Prompt    []promptBlock `json:"prompt"`
		}
		json.Unmarshal(params, &p)
		sid := p.SessionID
		var texts, types []string
		var resource, link *promptBlock
		for i, b := range p.Prompt {
			types = append(types, b.Type)
			switch b.Type {
			case "text":
				texts = append(texts, b.Text)
			case "resource":
				resource = &p.Prompt[i]
			case "resource_link":
				link = &p.Prompt[i]
			}
		}
		text := strings.Join(texts, "\n")
		docURI := ""
		if resource != nil {
			docURI = resource.Resource.URI
		} else if link != nil {
			docURI = link.URI
		}
		end := map[string]any{"stopReason": "end_turn"}

		switch {
		case strings.Contains(text, "context?"):
			// 回报收到的上下文，供测试断言
			report := map[string]any{"types": types, "embedded": nil, "inlineDoc": nil, "preamble": strings.Contains(text, "[MarkGo]"),
				"mentionsProtocol": regexp.MustCompile(`fs/(read|write)_text_file`).MatchString(text)}
			if resource != nil {
				report["embedded"] = resource.Resource.Text
			}
			if m := regexp.MustCompile("(?s)````markdown\n(.*?)\n````").FindStringSubmatch(text); m != nil {
				report["inlineDoc"] = m[1]
			}
			raw, _ := json.Marshal(report)
			say(sid, string(raw))
			return end, nil

		case strings.Contains(text, "[MarkGo 内联编辑]"):
			selected := ""
			if m := regexp.MustCompile(`(?s)"""\n(.*?)\n"""`).FindStringSubmatch(text); m != nil {
				selected = m[1]
			}
			// 内联频道的权限请求应被自动拒绝
			var perm struct {
				Outcome permissionOutcome `json:"outcome"`
			}
			conn.Request(ctx, "session/request_permission", map[string]any{"sessionId": sid, "toolCall": map[string]any{"toolCallId": "x"},
				"options": []any{map[string]any{"optionId": "allow", "name": "Allow", "kind": "allow_once"}, map[string]any{"optionId": "no", "name": "No", "kind": "reject_once"}}}, &perm)
			if perm.Outcome.OptionID != "no" {
				say(sid, "权限未被拒绝！")
			}
			say(sid, "【润色】")
			say(sid, selected)
			return end, nil

		case strings.Contains(text, "slow"):
			for i := 0; i < 100 && !isCancelled(sid); i++ {
				say(sid, ".")
				time.Sleep(50 * time.Millisecond)
			}
			if isCancelled(sid) {
				return map[string]any{"stopReason": "cancelled"}, nil
			}
			return end, nil

		case strings.Contains(text, "edit") && docURI != "":
			u, _ := url.Parse(docURI)
			path := u.Path
			update(sid, map[string]any{"sessionUpdate": "plan", "entries": []any{
				map[string]any{"content": "读取文档", "priority": "high", "status": "in_progress"},
				map[string]any{"content": "修改标题", "priority": "high", "status": "pending"}}})
			update(sid, map[string]any{"sessionUpdate": "tool_call", "toolCallId": "t1", "title": "Read " + path, "kind": "read", "status": "in_progress", "locations": []any{map[string]any{"path": path}}})
			var read struct {
				Content string `json:"content"`
			}
			if err := conn.Request(ctx, "fs/read_text_file", map[string]any{"sessionId": sid, "path": path}, &read); err != nil {
				say(sid, "读取失败："+err.Error())
				return end, nil
			}
			update(sid, map[string]any{"sessionUpdate": "tool_call_update", "toolCallId": "t1", "status": "completed"})
			var perm struct {
				Outcome permissionOutcome `json:"outcome"`
			}
			conn.Request(ctx, "session/request_permission", map[string]any{"sessionId": sid, "toolCall": map[string]any{"toolCallId": "t2", "title": "Edit " + path, "kind": "edit"},
				"options": []any{map[string]any{"optionId": "allow", "name": "Allow", "kind": "allow_once"}, map[string]any{"optionId": "reject", "name": "Reject", "kind": "reject_once"}}}, &perm)
			if perm.Outcome.Outcome != "selected" || perm.Outcome.OptionID != "allow" {
				say(sid, "好的，不修改。")
				return end, nil
			}
			next := regexp.MustCompile(`(?m)^# (.*)$`).ReplaceAllString(read.Content, "# $1（AI 修订版）") + "\n\n新增的结尾段落。\n"
			if err := conn.Request(ctx, "fs/write_text_file", map[string]any{"sessionId": sid, "path": path, "content": next}, nil); err != nil {
				say(sid, "修改被拒绝："+err.Error())
			} else {
				say(sid, fmt.Sprintf("已修改，原文 %d 字符。", len([]rune(read.Content))))
			}
			return end, nil
		}

		update(sid, map[string]any{"sessionUpdate": "agent_thought_chunk", "content": map[string]any{"type": "text", "text": "思考中"}})
		say(sid, "你好，")
		say(sid, "我是 **Mock Agent**。")
		return end, nil
	}
	// stdin 关闭（客户端断开）后退出
	conn = NewConn(exitOnEOF{}, os.Stdout, func(method string, params json.RawMessage, isNotification bool) (any, error) {
		if isNotification && method != "session/cancel" {
			return nil, nil
		}
		return handler(method, params, isNotification)
	})
	select {}
}

type exitOnEOF struct{}

func (exitOnEOF) Read(p []byte) (int, error) {
	n, err := os.Stdin.Read(p)
	if err != nil {
		os.Exit(0)
	}
	return n, nil
}
