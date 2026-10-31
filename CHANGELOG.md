# 更新日志

每个版本发布时，GitHub Release 的说明取自本文件对应版本的小节，按「修复问题、新增功能、优化改进、下载地址」组织，没有内容的小节不写。发版前请先在这里补充内容。

## v0.4.0

### 新增功能

- **支持 Typora 主题**：在「设置 → 通用设置 → 外观」中导入 Typora 的 .css 主题（连同旁边的同名资源文件夹），并分别选作浅色、深色外观的主题；跟随系统时自动切换
  - 界面（侧栏、工具栏、对话框）采用主题的配色，深浅以主题背景色为准
  - 编辑区使用「原生样式」时套用主题的正文排版；套用排版主题时仍以排版主题为准
  - 代码块高亮映射为主题的配色；Typora 自身界面、图表与源码模式的样式不会带入

### 优化改进

- 不再提供 Linux AppImage 安装包，Linux 请使用 .deb 安装包；从 AppImage 版本升级需手动安装

### 下载地址

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | [MarkGo-0.4.0-mac-universal.dmg](https://github.com/quietseek/markgo/releases/download/v0.4.0/MarkGo-0.4.0-mac-universal.dmg) |
| Windows 10 / 11 | [MarkGo-0.4.0-win-x64-setup.exe](https://github.com/quietseek/markgo/releases/download/v0.4.0/MarkGo-0.4.0-win-x64-setup.exe) |
| Linux（Debian / Ubuntu） | [MarkGo-0.4.0-linux-amd64.deb](https://github.com/quietseek/markgo/releases/download/v0.4.0/MarkGo-0.4.0-linux-amd64.deb) |

> Windows 需要 WebView2 运行时（系统通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app`；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。

## v0.3.1

### 优化改进

- 打开笔记库之外的文档（「打开文件」、双击、拖到程序图标）改为在主窗口中打开，侧栏的文件夹自动切换到文档所在的文件夹，不再单独新开窗口

### 下载地址

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | [MarkGo-0.3.1-mac-universal.dmg](https://github.com/quietseek/markgo/releases/download/v0.3.1/MarkGo-0.3.1-mac-universal.dmg) |
| Windows 10 / 11 | [MarkGo-0.3.1-win-x64-setup.exe](https://github.com/quietseek/markgo/releases/download/v0.3.1/MarkGo-0.3.1-win-x64-setup.exe) |
| Linux（AppImage） | [MarkGo-0.3.1-linux-x86_64.AppImage](https://github.com/quietseek/markgo/releases/download/v0.3.1/MarkGo-0.3.1-linux-x86_64.AppImage) |
| Linux（Debian / Ubuntu） | [MarkGo-0.3.1-linux-amd64.deb](https://github.com/quietseek/markgo/releases/download/v0.3.1/MarkGo-0.3.1-linux-amd64.deb) |

> Windows 需要 WebView2 运行时（系统通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app`；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。

## v0.3.0

### 修复问题

- Windows / Linux 启动后托盘没有图标：现在应用运行期间托盘图标一直显示
- MarkGo 正在运行时安装新版本会因文件被占用而失败：安装 / 卸载程序会先提示并关闭正在运行的 MarkGo

### 新增功能

- 应用内一键更新：发现新版本后在「关于」中点击「立即更新」，自动下载对应平台的安装包、安装并重新打开（macOS .app、Windows 安装版、Linux AppImage / deb）；启动时检查到新版本会提示
- 状态栏排版主题菜单的「原生样式」下可直接切换界面外观：系统 / 深色 / 浅色
- 设置 → 编辑器新增「原生样式」排版选项：字体（黑体 / 宋体）、字号、行距、段落间距，标题随正文字号等比缩放
- AI 写作的初稿实时流式写入编辑区，写作期间编辑区只读并可随时停止，完成后即可编辑；对话中只显示写入进度
- AI 写作的初稿开头自动生成元信息：title、slug、summary、category、status、theme（当前排版主题）、tags、updated_at；写完后文档按元信息中的 title 命名

### 优化改进

- Windows 安装程序的语言跟随系统（简体中文 / 英文），升级时安装到原来的目录
- 设置左侧栏改为三到四字的名称：通用设置、编辑器、图片处理、写作偏好、AI 集成、发布渠道

### 下载地址

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | [MarkGo-0.3.0-mac-universal.dmg](https://github.com/quietseek/markgo/releases/download/v0.3.0/MarkGo-0.3.0-mac-universal.dmg) |
| Windows 10 / 11 | [MarkGo-0.3.0-win-x64-setup.exe](https://github.com/quietseek/markgo/releases/download/v0.3.0/MarkGo-0.3.0-win-x64-setup.exe) |
| Linux（AppImage） | [MarkGo-0.3.0-linux-x86_64.AppImage](https://github.com/quietseek/markgo/releases/download/v0.3.0/MarkGo-0.3.0-linux-x86_64.AppImage) |
| Linux（Debian / Ubuntu） | [MarkGo-0.3.0-linux-amd64.deb](https://github.com/quietseek/markgo/releases/download/v0.3.0/MarkGo-0.3.0-linux-amd64.deb) |

> Windows 需要 WebView2 运行时（系统通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app`；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。

## v0.2.1

### 优化改进

- 元信息回到编辑区，以折叠块显示，可展开查看属性或编辑源码；套用排版主题时编辑区即发布效果的预览，不再显示元信息，切换到「原生样式」即可编辑
- 移除侧边栏「信息」页
- 顶部快捷操作栏图标改为左对齐

### 下载地址

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | [MarkGo-0.2.1-mac-universal.dmg](https://github.com/quietseek/markgo/releases/download/v0.2.1/MarkGo-0.2.1-mac-universal.dmg) |
| Windows 10 / 11 | [MarkGo-0.2.1-win-x64-setup.exe](https://github.com/quietseek/markgo/releases/download/v0.2.1/MarkGo-0.2.1-win-x64-setup.exe) |
| Linux（AppImage） | [MarkGo-0.2.1-linux-x86_64.AppImage](https://github.com/quietseek/markgo/releases/download/v0.2.1/MarkGo-0.2.1-linux-x86_64.AppImage) |
| Linux（Debian / Ubuntu） | [MarkGo-0.2.1-linux-amd64.deb](https://github.com/quietseek/markgo/releases/download/v0.2.1/MarkGo-0.2.1-linux-amd64.deb) |

> Windows 需要 WebView2 运行时（系统通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app`；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。

## v0.2.0

### 新增功能

- **单独打开的文档使用新窗口**：打开不在当前笔记库中的文件（「打开文件」、双击、拖到程序图标）时在新窗口中编辑，已打开的文件直接切换到对应窗口；笔记库中的文件仍在主窗口打开
- **侧边栏「信息」**：在「大纲」右侧新增「信息」页，集中查看与编辑元信息（YAML front matter），并显示字数、阅读时长、标题与图片数量、文件位置；编辑区中的元信息收为一行摘要，点击跳转到「信息」
- **代码块格式化**：JavaScript、TypeScript、JSON、CSS / SCSS / Less、HTML、Markdown、YAML、GraphQL、SQL 代码块可一键格式化
- **上下标**：支持 `H~2~O`、`x^2^` 写法，选区工具栏可设置上标 / 下标，复制与发布时同样生效

### 优化改进

- 打开文件夹后不再列出不含 Markdown 笔记的文件夹（如只放图片的 assets），完全空的文件夹保留
- 状态栏的图片插入方式改为与编辑区宽度相同的胶囊切换，可直接在「图床 / 本地」间切换
- AI 写作的篇幅改为短文 / 中篇 / 长文（长文约 1 万字），界面不再突出字数，Agent 以内容完整为准

### 下载地址

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | [MarkGo-0.2.0-mac-universal.dmg](https://github.com/quietseek/markgo/releases/download/v0.2.0/MarkGo-0.2.0-mac-universal.dmg) |
| Windows 10 / 11 | [MarkGo-0.2.0-win-x64-setup.exe](https://github.com/quietseek/markgo/releases/download/v0.2.0/MarkGo-0.2.0-win-x64-setup.exe) |
| Linux（AppImage） | [MarkGo-0.2.0-linux-x86_64.AppImage](https://github.com/quietseek/markgo/releases/download/v0.2.0/MarkGo-0.2.0-linux-x86_64.AppImage) |
| Linux（Debian / Ubuntu） | [MarkGo-0.2.0-linux-amd64.deb](https://github.com/quietseek/markgo/releases/download/v0.2.0/MarkGo-0.2.0-linux-amd64.deb) |

> Windows 需要 WebView2 运行时（系统通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app`；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。

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
