# 更新日志

每个版本发布时，GitHub Release 的说明取自本文件对应版本的小节，按「修复问题、新增功能、优化改进、下载地址」组织，没有内容的小节不写。发版前请先在这里补充内容。

## v0.1.0

### 新增功能

- **笔记库**：以任意本地文件夹作为笔记库，文件均为标准 `.md`；支持新建、重命名、移到废纸篓、在文件管理器中显示，可快速切换最近打开的文件夹
- **所见即所得编辑**：基于 Tiptap 3，支持标题、列表、任务列表、表格、代码块（语法高亮）、Mermaid 图表、引用、高亮、链接、图片、数学公式；提供 `/` 命令菜单、顶部快捷操作栏、选区格式工具栏、查找替换、源码模式、大纲导航、专注模式与打字机模式
- **元信息**：文档开头的 YAML front matter 折叠显示与编辑
- **排版主题**：15 种主题直接作用于编辑区，可调整字号、段距，外链可转为文末脚注
- **复制与导出**：一键复制带排版的富文本（图表与公式自动转为图片），或导出排版 HTML
- **发布**：发布到微信公众号草稿箱，正文图片自动转存
- **图片**：粘贴、拖拽或命令插入；上传到 PicGo / PicList 图床，或保存到文档同级的图片目录
- **AI 生图**：支持 OpenAI、豆包、通义万相、智谱 AI、硅基流动及自定义 OpenAI 兼容接口
- **AI 写作**：通过 Agent Client Protocol 连接本机的 Claude Code、Codex、Gemini CLI 等 Agent，提供对话助手、按风格从话题生成大纲并成文、选区内联改写与续写、自然语言生成公式；Agent 对文档的修改须经差异审阅，可逐处接受
- **外观与窗口**：浅色 / 深色 / 跟随系统；关闭到后台，Windows / Linux 托盘菜单可自定义；经典或红绿灯窗口按钮

### 优化改进

- 基于 Wails 3 与系统 WebView 构建，不捆绑浏览器内核，安装包小巧、启动快
- 编辑内容自动保存，未命名草稿自动持久化
- AppSecret、API Key 等密钥经系统钥匙串中的密钥加密保存
- macOS 提供 Apple 芯片与 Intel 通用安装包

### 下载地址

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | [MarkGo-0.1.0-mac-universal.dmg](https://github.com/quietseek/markgo/releases/download/v0.1.0/MarkGo-0.1.0-mac-universal.dmg) |
| Windows 10 / 11 | [MarkGo-0.1.0-win-x64-setup.exe](https://github.com/quietseek/markgo/releases/download/v0.1.0/MarkGo-0.1.0-win-x64-setup.exe) |
| Linux（AppImage） | [MarkGo-0.1.0-linux-x86_64.AppImage](https://github.com/quietseek/markgo/releases/download/v0.1.0/MarkGo-0.1.0-linux-x86_64.AppImage) |
| Linux（Debian / Ubuntu） | [MarkGo-0.1.0-linux-amd64.deb](https://github.com/quietseek/markgo/releases/download/v0.1.0/MarkGo-0.1.0-linux-amd64.deb) |

> Windows 需要 WebView2 运行时（系统通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app`；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。
