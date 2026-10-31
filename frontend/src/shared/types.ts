export type ImageUploadMode = 'picgo' | 'local'

export interface TyporaThemeImport {
  themes: TyporaThemeInfo[]
  errors: string[]
}

export interface TyporaThemeInfo {
  id: string
  name: string
}

export interface AppSettings {
  /** 图片插入方式：PicGo 图床上传，或复制到文档同级 assets 目录 */
  imageUploadMode: ImageUploadMode
  /** PicGo / PicList 内置 HTTP Server 地址 */
  picgoServer: string
  /** 本地模式下图片存放目录（相对当前文档） */
  localAssetsDir: string
  /** 排版主题 key（marknice 主题） */
  themeKey: string
  fontSizeOffset: number
  paraSpacingOffset: number
  /** 外链转为文末脚注 */
  linkToFootnote: boolean
  /** 右侧 AI 助手面板 */
  showAgent: boolean
  showSidebar: boolean
  /** 编辑器主题：'default' 原生样式，'sync' 跟随排版主题，或指定排版主题 key */
  editorTheme: string
  /** 应用界面外观 */
  appearance: 'system' | 'light' | 'dark'
  /** 浅色外观使用的 Typora 主题 id；空为内置浅色 */
  lightTheme: string
  /** 深色外观使用的 Typora 主题 id；空为内置深色 */
  darkTheme: string
  /** 编辑区顶部显示快捷操作栏 */
  showToolbar: boolean
  /** 打字机模式：光标所在行保持在视口中部 */
  typewriter: boolean
  /** 编辑区宽度预设：默认 / 宽屏 / 铺满 */
  editorWidth: EditorWidth
  /** 原生样式的正文字体：sans 黑体；serif 宋体 */
  editorFont: 'sans' | 'serif'
  /** 原生样式的正文字号（px） */
  editorFontSize: number
  /** 原生样式的行距（倍数） */
  editorLineHeight: number
  /** 原生样式的段落间距（em） */
  editorParaSpacing: number
  /** 关闭窗口时：quit 退出应用；background 保留在后台（macOS 程序坞 / Windows、Linux 系统托盘） */
  closeAction: CloseAction
  /** 窗口控制按钮样式：classic 最小化 / 最大化 / 关闭；traffic 红绿灯 */
  windowControls: WindowControls
  /** 红绿灯位置 */
  trafficPosition: 'left' | 'right'
  /** 启动时打开：last 上次的文件；scratch 草稿 */
  startupOpen: 'last' | 'scratch'
  /** 文件树显示以 . 开头的文件与文件夹 */
  showHiddenFiles: boolean
  /** 启动后自动检查更新 */
  autoCheckUpdate: boolean
  /** 托盘菜单（macOS 为程序坞菜单）中显示的项目 */
  trayMenu: TrayMenuItem[]
  /** 最近打开的文件夹，最新的在前 */
  recentWorkspaces: string[]
  wechat: WechatConfig
  ai: AiConfig
  writing: WritingConfig
  imageGen: ImageGenConfig
  lastWorkspace?: string
  lastFile?: string
}

export type TrayMenuItem = 'show' | 'new-file' | 'open-file' | 'open-folder' | 'recent' | 'ai' | 'settings' | 'quit'

/** 托盘菜单项目（按菜单中的顺序）；mac 表示是否用于 macOS 程序坞菜单（程序坞自带显示与退出）；「退出」始终显示 */
export const TRAY_MENU_ITEMS: { key: TrayMenuItem; label: string; mac: boolean }[] = [
  { key: 'show', label: '显示 MarkGo', mac: false },
  { key: 'new-file', label: '新建笔记', mac: true },
  { key: 'open-file', label: '打开文件…', mac: true },
  { key: 'open-folder', label: '打开文件夹…', mac: true },
  { key: 'recent', label: '最近的文件夹', mac: true },
  { key: 'ai', label: 'AI 助手', mac: true },
  { key: 'settings', label: '设置…', mac: true },
  { key: 'quit', label: '退出', mac: false }
]

export const MAX_RECENT_WORKSPACES = 8

export type EditorWidth = 'default' | 'wide' | 'full'
export type CloseAction = 'quit' | 'background'
export type WindowControls = 'classic' | 'traffic'

export interface AgentProfile {
  id: string
  name: string
  /** 通过登录 shell 执行的启动命令，需启动一个 ACP（Agent Client Protocol）Agent */
  command: string
  /** 已在「设置 → AI 集成」中安装（成功连接过一次） */
  installed?: boolean
}

export interface AiConfig {
  agents: AgentProfile[]
  activeAgentId: string
}

export const AGENT_PRESETS: AgentProfile[] = [
  { id: 'claude', name: 'Claude Code', command: 'npx -y @agentclientprotocol/claude-agent-acp' },
  { id: 'codex', name: 'Codex', command: 'npx -y @agentclientprotocol/codex-acp' },
  { id: 'gemini', name: 'Gemini CLI', command: 'npx -y @google/gemini-cli --acp' },
  { id: 'opencode', name: 'OpenCode', command: 'npx -y opencode-ai acp' },
  { id: 'qwen', name: 'Qwen Code', command: 'npx -y @qwen-code/qwen-code --acp' },
  { id: 'copilot', name: 'GitHub Copilot', command: 'npx -y @github/copilot --acp' },
  { id: 'goose', name: 'Goose', command: 'goose acp' }
]

export interface WritingStyle {
  id: string
  name: string
  /** 给 AI 的风格描述 */
  description: string
}

export type WritingLength = 'short' | 'medium' | 'long'

/** words 只作为给 Agent 的篇幅参考，界面上不突出字数 */
export const WRITING_LENGTHS: { key: WritingLength; label: string; words: number }[] = [
  { key: 'short', label: '短文', words: 1000 },
  { key: 'medium', label: '中篇', words: 3000 },
  { key: 'long', label: '长文', words: 10000 }
]

export interface WritingConfig {
  styles: WritingStyle[]
  defaultStyleId: string
  /** 目标读者 */
  audience: string
  length: WritingLength
  /** 补充要求：人称、禁用词、固定结尾等 */
  extra: string
}

export const WRITING_STYLE_PRESETS: WritingStyle[] = [
  { id: 'pro', name: '专业严谨', description: '逻辑清晰、论据充分，用词准确克制，少用口语和感叹' },
  { id: 'casual', name: '轻松口语', description: '像和朋友聊天，句子短，多用「你」，适度幽默' },
  { id: 'story', name: '故事叙述', description: '从具体的人物和场景切入，用情节带出观点，注重细节与画面感' },
  { id: 'guide', name: '干货清单', description: '小标题清晰，多用要点和步骤，读完就能上手' },
  { id: 'opinion', name: '观点评论', description: '开门见山亮明观点，有论据有反驳，结尾给出态度' }
]

export interface ImageGenProvider {
  id: string
  name: string
  /** 默认接口地址 */
  baseUrl: string
  /** 接口协议：OpenAI 兼容的 /images/generations，或阿里云百炼的异步任务接口 */
  protocol: 'openai' | 'dashscope'
  /** 常用模型，可在设置中自行填写其他模型 */
  models: string[]
}

export const IMAGE_GEN_PROVIDERS: ImageGenProvider[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai', models: ['gpt-image-1', 'dall-e-3'] },
  {
    id: 'doubao',
    name: '豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'openai',
    models: ['doubao-seedream-4-0-250828', 'doubao-seedream-3-0-t2i-250415']
  },
  {
    id: 'dashscope',
    name: '通义万相（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    protocol: 'dashscope',
    models: ['wanx2.1-t2i-turbo', 'wanx2.1-t2i-plus']
  },
  { id: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: 'openai', models: ['cogview-4', 'cogview-3-flash'] },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai',
    models: ['Kwai-Kolors/Kolors', 'black-forest-labs/FLUX.1-schnell']
  },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', protocol: 'openai', models: [] }
]

export interface ImageGenConfig {
  /** IMAGE_GEN_PROVIDERS 中的 id */
  provider: string
  /** 为空则使用供应商默认地址 */
  baseUrl: string
  apiKey: string
  model: string
  /** 单次生成的超时时间（秒） */
  timeout: number
}

export interface ImageGenResult {
  ok: boolean
  /** 生成的图片（data URL），插入时再按图床设置保存 */
  dataUrl?: string
  error?: string
}

export interface WechatConfig {
  appId: string
  appSecret: string
  author: string
  /** 是否打开评论 */
  openComment: boolean
  /** 仅粉丝可评论 */
  onlyFansCanComment: boolean
}

export const defaultSettings: AppSettings = {
  imageUploadMode: 'picgo',
  typewriter: false,
  showToolbar: true,
  picgoServer: 'http://127.0.0.1:36677',
  localAssetsDir: 'assets',
  themeKey: 'claude',
  fontSizeOffset: 0,
  paraSpacingOffset: 0,
  linkToFootnote: true,
  showAgent: false,
  showSidebar: true,
  editorTheme: 'default',
  appearance: 'system',
  lightTheme: '',
  darkTheme: '',
  editorWidth: 'wide',
  editorFont: 'sans',
  editorFontSize: 16,
  editorLineHeight: 1.75,
  editorParaSpacing: 0.85,
  // 以下两项的平台默认值在主进程读取设置时补齐（macOS：后台 + 红绿灯）
  closeAction: 'quit',
  windowControls: 'classic',
  trafficPosition: 'right',
  startupOpen: 'last',
  showHiddenFiles: false,
  autoCheckUpdate: true,
  trayMenu: ['show', 'new-file', 'recent', 'quit'],
  recentWorkspaces: [],
  wechat: {
    appId: '',
    appSecret: '',
    author: '',
    openComment: false,
    onlyFansCanComment: false
  },
  ai: {
    agents: AGENT_PRESETS,
    activeAgentId: 'claude'
  },
  writing: {
    styles: WRITING_STYLE_PRESETS,
    defaultStyleId: 'casual',
    audience: '',
    length: 'medium',
    extra: ''
  },
  imageGen: {
    provider: 'openai',
    baseUrl: '',
    apiKey: '',
    model: 'gpt-image-1',
    timeout: 180
  }
}

export interface AppInfo {
  version: string
  wails: string
  go: string
  /** 操作系统/架构，如 darwin/arm64 */
  platform: string
  /** GitHub 仓库地址 */
  homepage: string
}

export type UpdateCheck =
  | {
      ok: true
      current: string
      latest: string
      hasUpdate: boolean
      url: string
      /** 本机的安装方式有对应的安装包，可在应用内自动更新 */
      installable: boolean
    }
  | { ok: false; error: string }

/** 自动更新进度：下载中（字节数，total 未知时为 0）或安装中 */
export interface UpdateProgress {
  phase: 'download' | 'install'
  received: number
  total: number
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
}

export interface UploadResult {
  ok: boolean
  urls: string[]
  error?: string
}

export interface WechatDraftInput {
  title: string
  author?: string
  digest?: string
  /** 已套用主题内联样式的 HTML */
  content: string
  /** 封面图：本地路径或 http(s) URL；为空则取正文第一张图 */
  cover?: string
  /** 原文链接 */
  contentSourceUrl?: string
  /** 当前文档路径，用于解析正文中的相对路径图片 */
  docPath?: string
}

export interface WechatDraftResult {
  ok: boolean
  mediaId?: string
  error?: string
}

// ---------- AI / ACP ----------

export type AgentStatus = 'idle' | 'starting' | 'ready' | 'error'

export interface AgentInfo {
  name: string
  version?: string
  /** Agent 声明的认证方式（未登录时用于提示） */
  authMethods: { id: string; name: string; description?: string | null }[]
}

export interface ToolCallView {
  id: string
  title: string
  kind?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** 涉及的文件 */
  paths: string[]
}

export interface PermissionView {
  requestId: string
  title: string
  kind?: string
  options: { optionId: string; name: string; kind: string }[]
}

/** Agent 想写入某个文件：当前文档在编辑器内审阅，其他文件在对话中审阅 */
export interface WriteProposal {
  requestId: string
  path: string
  /** 写入前的内容（当前文档取编辑器实时内容） */
  before: string
  after: string
  /** 'agent' = 通过 ACP fs/write_text_file；'disk' = 检测到外部程序直接改写了文件 */
  source: 'agent' | 'disk'
  /** 由渲染进程标记：改动发生在 Agent 回答期间（磁盘改动几乎必然来自 Agent 的文件编辑工具） */
  duringTurn?: boolean
}

/** 主进程推给渲染进程的会话事件（按 channel 区分对话面板与内联 AI） */
export type AgentEvent =
  | { type: 'status'; status: AgentStatus; info?: AgentInfo; error?: string }
  | { type: 'message'; channel: string; text: string }
  | { type: 'thought'; channel: string; text: string }
  | { type: 'tool'; channel: string; tool: ToolCallView }
  | { type: 'plan'; channel: string; entries: { content: string; status: string }[] }
  | { type: 'permission'; channel: string; permission: PermissionView }
  | { type: 'write'; channel: string; proposal: WriteProposal }
  | { type: 'done'; channel: string; stopReason: string }
  | { type: 'error'; channel: string; error: string }

export interface PromptInput {
  /** 'chat' 为侧边对话；内联 AI 每次使用独立 channel */
  channel: string
  text: string
  /** 当前文档路径 */
  docPath?: string
  /** 当前文档在编辑器中的最新内容，随提示词附带给 Agent（仅在变化时重新附上） */
  docContent?: string
  /** 选中的文本，作为上下文引用 */
  selection?: string
  /** 新开会话（清空上下文） */
  fresh?: boolean
}

export interface MarkGoApi {
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  fs: {
    openFolder(): Promise<string | null>
    openFile(): Promise<string | null>
    listTree(root: string): Promise<FileNode[]>
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
    create(dir: string, name: string, kind: 'file' | 'dir'): Promise<string>
    rename(path: string, newName: string): Promise<string>
    remove(path: string): Promise<void>
    saveAs(content: string, suggestedName: string): Promise<string | null>
    reveal(path: string): Promise<void>
    exportHtml(html: string, suggestedName: string): Promise<string | null>
    /** 另存文件；data 为文本或 base64 data URI */
    saveFile(data: string, suggestedName: string): Promise<string | null>
    pickImage(): Promise<string | null>
    exists(path: string): Promise<boolean>
    /** 未命名草稿的持久化路径（位于用户数据目录） */
    scratchPath(): Promise<string>
  }
  /** 导入的 Typora 主题 */
  themes: {
    list(): Promise<TyporaThemeInfo[]>
    /** 选择一个或多个 .css 文件导入；取消时 themes 与 errors 均为空 */
    import(): Promise<TyporaThemeImport>
    /** 选择文件夹，批量导入其中所有主题 */
    importFolder(): Promise<TyporaThemeImport>
    remove(id: string): Promise<void>
    /** 在文件管理器中打开主题目录 */
    openFolder(): Promise<void>
    onChange(cb: () => void): () => void
  }
  image: {
    /** 上传本地文件路径列表 */
    uploadPaths(paths: string[], docPath?: string): Promise<UploadResult>
    /** 上传剪贴板/拖拽得到的二进制图片 */
    uploadBuffer(data: ArrayBuffer, ext: string, docPath?: string): Promise<UploadResult>
    testPicgo(): Promise<UploadResult>
    /** 把正文中的一张图片（本地或网络）上传到 PicGo 图床 */
    uploadToHost(src: string, docPath?: string): Promise<UploadResult>
    /** 把网络图片下载到文档的本地图片目录 */
    download(src: string, docPath?: string): Promise<UploadResult>
    /** 在文件管理器中显示本地图片；找不到时返回 false */
    reveal(src: string, docPath?: string): Promise<boolean>
    /** AI 生图：按「设置 → 图片处理 → AI 生图」的配置生成一张图片 */
    generate(prompt: string): Promise<ImageGenResult>
    /** 文件对象 -> 绝对路径（拖拽时使用） */
    pathForFile(file: File): string
  }
  wechat: {
    testConnection(): Promise<{ ok: boolean; error?: string }>
    publishDraft(input: WechatDraftInput): Promise<WechatDraftResult>
  }
  clipboard: {
    writeHtml(html: string, text: string): Promise<void>
    writeImage(dataUrl: string): Promise<void>
  }
  shell: {
    openExternal(url: string): Promise<void>
  }
  ai: {
    start(): Promise<{ ok: boolean; info?: AgentInfo; error?: string }>
    stop(): Promise<void>
    prompt(input: PromptInput): Promise<{ ok: boolean; stopReason?: string; error?: string }>
    cancel(channel: string): Promise<void>
    respondPermission(requestId: string, optionId: string | null): void
    /** 对写入提议的决定：接受时 content 为最终写入内容（可能是部分接受的结果） */
    resolveWrite(requestId: string, accepted: boolean, content?: string): void
    /** 告知主进程当前打开的文档与实时内容（供 Agent 读取未保存的修改） */
    setActiveDoc(path: string | null, markdown: string): void
    /** 渲染进程刚保存文件后告知，避免被误判为外部修改 */
    markSaved(path: string, content: string): void
    onEvent(cb: (e: AgentEvent) => void): () => void
  }
  platform: string
  app: {
    info(): Promise<AppInfo>
    /** 启动时取走待打开的文件（从桌面等外部打开 MarkGo 时） */
    takeOpenPath(): Promise<string | null>
    checkUpdate(): Promise<UpdateCheck>
    /** 下载并安装最新版本，成功后应用会退出并自动重新打开 */
    installUpdate(): Promise<{ ok: boolean; error?: string }>
    onUpdateProgress(cb: (p: UpdateProgress) => void): () => void
    /** 自动更新安装前，保存未写盘的修改 */
    onSaveRequest(cb: () => void): () => void
  }
  window: {
    setDark(dark: boolean): void
    minimize(): void
    toggleMaximize(): void
    close(): void
    /** 本次启动是否使用系统原生窗口按钮（切换需重启） */
    nativeControls: boolean
    onMaximizeChange(cb: (maximized: boolean) => void): () => void
  }
  onMenu(cb: (action: string) => void): () => void
  onOpenPath(cb: (path: string) => void): () => void
  /** 从托盘 / 程序坞菜单打开最近的文件夹 */
  onOpenWorkspace(cb: (dir: string) => void): () => void
}
