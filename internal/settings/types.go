// Package settings 读写应用设置（与前端 src/shared/types.ts 中的 AppSettings 一一对应）。
package settings

type AgentProfile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// 通过登录 shell 执行的启动命令，需启动一个 ACP（Agent Client Protocol）Agent
	Command string `json:"command"`
	// 已在「设置 → 集成」中安装（成功连接过一次）；nil 表示旧版本配置，尚无此概念
	Installed *bool `json:"installed,omitempty"`
}

type AiConfig struct {
	Agents        []AgentProfile `json:"agents"`
	ActiveAgentID string         `json:"activeAgentId"`
}

type WritingStyle struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type WritingConfig struct {
	Styles         []WritingStyle `json:"styles"`
	DefaultStyleID string         `json:"defaultStyleId"`
	Audience       string         `json:"audience"`
	Length         string         `json:"length"`
	Extra          string         `json:"extra"`
}

type ImageGenConfig struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
	// 单次生成的超时时间（秒）
	Timeout int `json:"timeout"`
}

type WechatConfig struct {
	AppID              string `json:"appId"`
	AppSecret          string `json:"appSecret"`
	Author             string `json:"author"`
	OpenComment        bool   `json:"openComment"`
	OnlyFansCanComment bool   `json:"onlyFansCanComment"`
}

// ExportConfig 通过 Pandoc 导出的配置
type ExportConfig struct {
	// Pandoc 程序路径，留空时自动查找
	PandocPath string `json:"pandocPath"`
	// 上次导出的格式
	LastFormat string `json:"lastFormat"`
	// 导出后：none 不处理；open 打开文件；reveal 在文件夹中显示
	AfterExport    string `json:"afterExport"`
	TOC            bool   `json:"toc"`
	NumberSections bool   `json:"numberSections"`
	// 所有格式通用的额外 Pandoc 参数
	ExtraArgs string `json:"extraArgs"`
	// 各格式的额外 Pandoc 参数
	FormatArgs map[string]string `json:"formatArgs"`
	// PDF：引擎（留空自动选择）、纸张、页边距、正文字体（留空时中文文档使用系统中文字体）
	PdfEngine string `json:"pdfEngine"`
	PaperSize string `json:"paperSize"`
	Margin    string `json:"margin"`
	MainFont  string `json:"mainFont"`
	// Word / OpenOffice 参考文档（决定样式）
	DocxReference string `json:"docxReference"`
	OdtReference  string `json:"odtReference"`
	// HTML：样式表、是否把图片等资源嵌入为单个文件
	HTMLCSS   string `json:"htmlCss"`
	HTMLEmbed bool   `json:"htmlEmbed"`
	// EPUB 封面图片
	EpubCover string `json:"epubCover"`
}

type AppSettings struct {
	ImageUploadMode   string         `json:"imageUploadMode"`
	PicgoServer       string         `json:"picgoServer"`
	LocalAssetsDir    string         `json:"localAssetsDir"`
	ThemeKey          string         `json:"themeKey"`
	FontSizeOffset    float64        `json:"fontSizeOffset"`
	ParaSpacingOffset float64        `json:"paraSpacingOffset"`
	LinkToFootnote    bool           `json:"linkToFootnote"`
	ShowAgent         bool           `json:"showAgent"`
	ShowSidebar       bool           `json:"showSidebar"`
	EditorTheme       string         `json:"editorTheme"`
	Appearance        string         `json:"appearance"`
	LightTheme        string         `json:"lightTheme"`
	DarkTheme         string         `json:"darkTheme"`
	ShowToolbar       bool           `json:"showToolbar"`
	Typewriter        bool           `json:"typewriter"`
	EditorWidth       string         `json:"editorWidth"`
	EditorFont        string         `json:"editorFont"`
	EditorFontSize    float64        `json:"editorFontSize"`
	EditorLineHeight  float64        `json:"editorLineHeight"`
	EditorParaSpacing float64        `json:"editorParaSpacing"`
	CloseAction       string         `json:"closeAction"`
	WindowControls    string         `json:"windowControls"`
	TrafficPosition   string         `json:"trafficPosition"`
	StartupOpen       string         `json:"startupOpen"`
	ShowHiddenFiles   bool           `json:"showHiddenFiles"`
	AutoCheckUpdate   bool           `json:"autoCheckUpdate"`
	TrayMenu          []string       `json:"trayMenu"`
	RecentWorkspaces  []string       `json:"recentWorkspaces"`
	Wechat            WechatConfig   `json:"wechat"`
	AI                AiConfig       `json:"ai"`
	Writing           WritingConfig  `json:"writing"`
	ImageGen          ImageGenConfig `json:"imageGen"`
	Export            ExportConfig   `json:"export"`
	LastWorkspace     string         `json:"lastWorkspace,omitempty"`
	LastFile          string         `json:"lastFile,omitempty"`
}

// ActiveAgent 返回当前选中的 Agent（找不到时退回第一个）
func (s *AppSettings) ActiveAgent() *AgentProfile {
	for i := range s.AI.Agents {
		if s.AI.Agents[i].ID == s.AI.ActiveAgentID {
			return &s.AI.Agents[i]
		}
	}
	if len(s.AI.Agents) > 0 {
		return &s.AI.Agents[0]
	}
	return nil
}

var AgentPresets = []AgentProfile{
	{ID: "claude", Name: "Claude Code", Command: "npx -y @agentclientprotocol/claude-agent-acp"},
	{ID: "codex", Name: "Codex", Command: "npx -y @agentclientprotocol/codex-acp"},
	{ID: "gemini", Name: "Gemini CLI", Command: "npx -y @google/gemini-cli --acp"},
	{ID: "opencode", Name: "OpenCode", Command: "npx -y opencode-ai acp"},
	{ID: "qwen", Name: "Qwen Code", Command: "npx -y @qwen-code/qwen-code --acp"},
	{ID: "copilot", Name: "GitHub Copilot", Command: "npx -y @github/copilot --acp"},
	{ID: "goose", Name: "Goose", Command: "goose acp"},
}

var WritingStylePresets = []WritingStyle{
	{ID: "pro", Name: "专业严谨", Description: "逻辑清晰、论据充分，用词准确克制，少用口语和感叹"},
	{ID: "casual", Name: "轻松口语", Description: "像和朋友聊天，句子短，多用「你」，适度幽默"},
	{ID: "story", Name: "故事叙述", Description: "从具体的人物和场景切入，用情节带出观点，注重细节与画面感"},
	{ID: "guide", Name: "干货清单", Description: "小标题清晰，多用要点和步骤，读完就能上手"},
	{ID: "opinion", Name: "观点评论", Description: "开门见山亮明观点，有论据有反驳，结尾给出态度"},
}

type ImageGenProvider struct {
	ID       string
	BaseURL  string
	Protocol string // "openai" | "dashscope"
}

var ImageGenProviders = []ImageGenProvider{
	{ID: "openai", BaseURL: "https://api.openai.com/v1", Protocol: "openai"},
	{ID: "doubao", BaseURL: "https://ark.cn-beijing.volces.com/api/v3", Protocol: "openai"},
	{ID: "dashscope", BaseURL: "https://dashscope.aliyuncs.com/api/v1", Protocol: "dashscope"},
	{ID: "zhipu", BaseURL: "https://open.bigmodel.cn/api/paas/v4", Protocol: "openai"},
	{ID: "siliconflow", BaseURL: "https://api.siliconflow.cn/v1", Protocol: "openai"},
	{ID: "custom", BaseURL: "", Protocol: "openai"},
}

// TrayMenuItems 托盘菜单项目（按菜单中的顺序）；Mac 表示是否用于 macOS 程序坞菜单；「退出」始终显示
var TrayMenuItems = []struct {
	Key   string
	Label string
	Mac   bool
}{
	{"show", "显示 MarkGo", false},
	{"new-file", "新建笔记", true},
	{"open-file", "打开文件…", true},
	{"open-folder", "打开文件夹…", true},
	{"recent", "最近的文件夹", true},
	{"ai", "AI 助手", true},
	{"settings", "设置…", true},
	{"quit", "退出", false},
}

func Defaults() AppSettings {
	return AppSettings{
		ImageUploadMode:   "picgo",
		PicgoServer:       "http://127.0.0.1:36677",
		LocalAssetsDir:    "assets",
		ThemeKey:          "claude",
		LinkToFootnote:    true,
		ShowSidebar:       true,
		EditorTheme:       "default",
		Appearance:        "system",
		ShowToolbar:       true,
		EditorWidth:       "wide",
		EditorFont:        "sans",
		EditorFontSize:    16,
		EditorLineHeight:  1.75,
		EditorParaSpacing: 0.85,
		CloseAction:       "quit",
		WindowControls:    "classic",
		TrafficPosition:   "right",
		StartupOpen:       "last",
		AutoCheckUpdate:   true,
		TrayMenu:          []string{"show", "new-file", "recent", "quit"},
		RecentWorkspaces:  []string{},
		AI:                AiConfig{Agents: append([]AgentProfile(nil), AgentPresets...), ActiveAgentID: "claude"},
		Writing: WritingConfig{
			Styles:         append([]WritingStyle(nil), WritingStylePresets...),
			DefaultStyleID: "casual",
			Length:         "medium",
		},
		ImageGen: ImageGenConfig{Provider: "openai", Model: "gpt-image-1", Timeout: 180},
		Export: ExportConfig{
			LastFormat:  "docx",
			AfterExport: "reveal",
			FormatArgs:  map[string]string{},
			PaperSize:   "a4",
			Margin:      "2.5cm",
			HTMLEmbed:   true,
		},
	}
}
