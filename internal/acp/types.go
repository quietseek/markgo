// Package acp 通过 Agent Client Protocol 连接 Claude Code、Codex、Gemini CLI 等编码 Agent，
// 为对话面板与内联 AI 提供会话，并把 Agent 对文件的修改交给用户审阅。
package acp

// 与前端 src/shared/types.ts 中的同名类型一一对应

type AgentInfo struct {
	Name        string       `json:"name"`
	Version     string       `json:"version,omitempty"`
	AuthMethods []AuthMethod `json:"authMethods"`
}

type AuthMethod struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type ToolCallView struct {
	ID     string   `json:"id"`
	Title  string   `json:"title"`
	Kind   string   `json:"kind,omitempty"`
	Status string   `json:"status,omitempty"`
	Paths  []string `json:"paths"`
}

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
}

type PermissionView struct {
	RequestID string             `json:"requestId"`
	Title     string             `json:"title"`
	Kind      string             `json:"kind,omitempty"`
	Options   []PermissionOption `json:"options"`
}

// WriteProposal Agent 想写入某个文件：当前文档在编辑器内审阅，其他文件在对话中审阅
type WriteProposal struct {
	RequestID string `json:"requestId"`
	Path      string `json:"path"`
	Before    string `json:"before"`
	After     string `json:"after"`
	// "agent" = 通过 ACP fs/write_text_file；"disk" = 检测到外部程序直接改写了文件
	Source string `json:"source"`
}

type PlanEntry struct {
	Content string `json:"content"`
	Status  string `json:"status"`
}

// Event 推给前端的会话事件（按 Channel 区分对话面板与内联 AI）
type Event struct {
	Type       string          `json:"type"`
	Channel    string          `json:"channel,omitempty"`
	Status     string          `json:"status,omitempty"`
	Info       *AgentInfo      `json:"info,omitempty"`
	Error      string          `json:"error,omitempty"`
	Text       string          `json:"text,omitempty"`
	Tool       *ToolCallView   `json:"tool,omitempty"`
	Entries    *[]PlanEntry    `json:"entries,omitempty"`
	Permission *PermissionView `json:"permission,omitempty"`
	Proposal   *WriteProposal  `json:"proposal,omitempty"`
	StopReason string          `json:"stopReason,omitempty"`
}

type PromptInput struct {
	// "chat" 为侧边对话；内联 AI 每次使用独立 channel
	Channel string `json:"channel"`
	Text    string `json:"text"`
	DocPath string `json:"docPath,omitempty"`
	// 当前文档在编辑器中的最新内容；nil 表示未提供
	DocContent *string `json:"docContent,omitempty"`
	Selection  string  `json:"selection,omitempty"`
	// 新开会话（清空上下文）
	Fresh bool `json:"fresh,omitempty"`
}

type Status string

const (
	StatusIdle     Status = "idle"
	StatusStarting Status = "starting"
	StatusReady    Status = "ready"
	StatusError    Status = "error"
)
