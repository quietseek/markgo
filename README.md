<h1 align="center">MarkGo</h1>

<div align="center"><a href="https://github.com/quietseek/markgo/actions/workflows/build.yml"><img alt="Build" src="https://github.com/quietseek/markgo/actions/workflows/build.yml/badge.svg"></a> <a href="https://github.com/quietseek/markgo/releases"><img alt="Release" src="https://img.shields.io/github/v/release/quietseek/markgo"></a> <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a> <img alt="Go" src="https://img.shields.io/github/go-mod/go-version/quietseek/markgo"> <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey"></div>

<p align="center">
🇨🇳 <a href="./README.md">简体中文</a> | 🇺🇸 <a href="./README.en.md">English</a>
</p>

MarkGo 是一款面向内容创作者的桌面端 Markdown 写作与笔记应用。它以本地文件夹作为笔记库，提供基于 Tiptap 的所见即所得编辑体验，并集成了 AI 写作辅助、图床上传与排版主题，写完即可复制排版内容或一键发布。

支持 macOS、Windows 与 Linux。基于 [Wails 3](https://v3.wails.io)（Go + 系统 WebView）构建，不捆绑浏览器内核与 Node.js，安装包小巧。

## 目录

- [功能概览](#功能概览)
- [安装](#安装)
- [快速上手](#快速上手)
- [AI 写作](#ai-写作)
- [图床配置](#图床配置)
- [发布](#发布)
- [数学公式](#数学公式)
- [键盘快捷键](#键盘快捷键)
- [开发指南](#开发指南)
- [版本发布](#版本发布)
- [参与贡献](#参与贡献)
- [许可与致谢](#许可与致谢)

## 功能概览

| 模块 | 说明 |
| --- | --- |
| 笔记库 | 以任意本地文件夹作为笔记库，文件均为标准 `.md` 格式，不含笔记的文件夹不显示；笔记库以外的文件在新窗口中单独打开；支持新建、重命名、移到废纸篓、在文件管理器中显示；编辑内容自动保存 |
| 编辑器 | 基于 Tiptap 3 的所见即所得编辑：标题、列表、任务列表、表格（行列工具条）、代码块（语言选择、语法高亮、一键复制、格式化）、Mermaid 图表（实时渲染，可复制为图片或导出 PNG / SVG）、引用、高亮、上下标、链接、图片、数学公式（KaTeX）；支持 `/` 命令菜单、顶部快捷操作栏（可在设置中关闭）、文档开头 YAML 元信息（front matter）的折叠显示与编辑（套用排版主题时隐藏）、选区格式工具栏、查找替换、Typora 风格快捷键、Markdown 源码模式、大纲导航、专注模式与打字机模式 |
| 排版 | 内置 15 种排版主题，主题直接作用于编辑区，所见即所得；支持字号、段距调整及外链转文末脚注；编辑区宽度提供「标准 / 宽屏 / 铺满」三种预设；「原生样式」可设置字体、字号、行距与段落间距，并在状态栏直接切换系统 / 深色 / 浅色外观 |
| 图片 | 支持粘贴、拖拽和命令插入；可上传至 PicGo / PicList 图床，或保存到文档同级的 `assets` 目录；支持 AI 生图；图片操作条可把本地图片上传到图床、把网络图片存到本地、替换图片、编辑说明文字 |
| AI 写作 | 通过 Agent Client Protocol（ACP）连接本机 AI Agent；提供对话助手、按风格从话题生成大纲并写成新文档、选区内联改写与续写、自然语言生成公式；Agent 的修改须经差异审阅后方可应用 |
| 发布 | 一键复制带排版的富文本，粘贴到任意富文本编辑器（Mermaid 图表自动转为图片）；也可配置后直接发布（目前支持微信公众号草稿箱，正文图片自动转存） |
| 其他 | 浅色 / 深色 / 跟随系统外观；关闭到后台（Windows / Linux 托盘菜单可自定义）；最近打开的文件夹；经典或红绿灯窗口按钮；导出带排版的 HTML；未命名草稿自动持久化 |

内置排版主题：暖陶米白、极简留白、暗夜深色、简洁蓝、优雅棕、活力红、琥珀橙、清新绿、健康绿、杂志红、复古纸、海盐青、科技蓝、报刊体、暖阳红。

## 安装

从 [Releases](https://github.com/quietseek/markgo/releases) 页面下载对应平台的安装包：

| 系统 | 安装包 | 运行环境 |
| --- | --- | --- |
| macOS（Apple 芯片与 Intel 通用） | `MarkGo-<版本>-mac-universal.dmg` | macOS 11+ |
| Windows | `MarkGo-<版本>-win-x64-setup.exe` | WebView2 运行时（Windows 10/11 通常已自带，安装程序会自动补装） |
| Linux | `MarkGo-<版本>-linux-x86_64.AppImage` 或 `MarkGo-<版本>-linux-amd64.deb` | GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+） |

安装后，有新版本时可在「帮助 → 关于」（或侧边栏左下角的更新按钮）中点击「立即更新」，MarkGo 会自动下载、安装并重新打开，无需手动下载。

> [!NOTE]
> 当前安装包未经代码签名。
> - **macOS**：首次打开若提示「已损坏」或「无法验证开发者」，请在终端执行 `xattr -cr /Applications/MarkGo.app` 后重新打开。
> - **Windows**：若出现 SmartScreen 提示，请点击「更多信息 → 仍要运行」。

## 快速上手

### 写作、排版与发布

1. 启动后通过「文件 → 打开文件夹」（`⌘⇧O`）选择一个目录作为笔记库。笔记库以外的 Markdown 文件（「打开文件」`⌘O`、双击或拖到程序图标）会在新窗口中单独打开。
2. 使用 `⌘N` 新建笔记。在编辑区输入 `/` 可调出命令菜单，选中文字后可使用格式工具栏。通过 `/` 命令「元信息」可在文档开头添加标题、日期、标签等元信息，在「原生样式」下可展开编辑。
3. 在底部状态栏选择排版主题、调整字号与段距，切换编辑区宽度与图片插入方式（图床 / 本地）。选择「原生样式」时，编辑区使用默认样式，发布时仍应用所选主题。
4. 完成写作后，点击状态栏右侧的图标按钮，可复制排版内容或发布。

### 用 AI 写一篇文章

1. 按 [AI 写作 → 配置](#配置) 安装并连接一个 Agent，在「设置 → 写作偏好」中设置写作风格、篇幅（短文 / 中篇 / 长文）与目标读者。
2. 按 `⌘J` 打开 AI 助手，点击「写文章」，输入话题并选择风格与篇幅，点击「生成大纲」。
3. 在对话中与 Agent 讨论、修改大纲；满意后点击「开始写作」，MarkGo 会以建议标题新建文档，Agent 的输出实时流式写入编辑区（写作期间只读），完成后即可编辑。
4. 用选区「AI」菜单润色或改写段落，再按上面的步骤排版发布。

## AI 写作

AI 写作不直接调用模型 API，也不需要 API Key：能力由本机已安装的 Agent 提供，MarkGo 通过 [Agent Client Protocol](https://agentclientprotocol.com) 以子进程方式与其通信（JSON-RPC over stdio）。

### 配置

1. 确保本机已安装 Node.js，并在终端完成所用 Agent 的登录：

   | Agent | 登录方式 |
   | --- | --- |
   | Claude Code | 运行 `claude` 后执行 `/login` |
   | Codex | 运行 `codex login` |
   | Gemini CLI | 运行 `gemini` 完成授权 |
   | OpenCode | 运行 `opencode auth login` |
   | Qwen Code | 运行 `qwen` 完成授权 |
   | GitHub Copilot | 运行 `copilot` 后执行 `/login` |
   | Goose | 安装 Goose CLI 后运行 `goose configure` |

2. 在「设置 → AI 集成」中找到对应的 Agent，点击「安装」。预置 Agent 通过 `npx` 启动，首次安装需要下载；连接成功后卡片上会标注「已连接」，已安装的其他 Agent 可点击「使用」切换。
3. 其他支持 ACP 的 Agent 可通过「＋ 添加自定义 Agent」添加，填写其 ACP 模式的启动命令后安装即可；展开卡片可修改启动命令或卸载。启动命令通过登录 shell 执行，会继承 shell 中的环境变量（如 API Key）。

### 使用

- **写文章**：在「设置 → 写作偏好」中设置写作风格、篇幅、目标读者和补充要求。在 AI 助手中点击「写文章」并输入话题，Agent 会先给出大纲；在对话中讨论修改，确认后点击「开始写作」，MarkGo 会以建议标题新建文档，Agent 的输出实时流式写入编辑区，写作期间编辑区只读，可随时停止，完成后即可编辑。初稿开头带有元信息（title、slug、summary、category、status、theme、tags、updated_at），写完后文档按元信息中的 title 命名。
- **AI 公式**：通过 `/` 命令菜单选择「AI 公式」，或选中一段描述文字后点击格式工具栏中的「∑」，用自然语言描述即可生成 LaTeX 公式，预览确认后插入。
- **AI 助手**（`⌘J`）：在侧边面板中与 Agent 对话，可引用当前选区。Agent 的执行计划、工具调用与权限请求均会显示在对话中。
- **内联 AI**：选中文字后，在格式工具栏中选择「AI」，可执行润色、改写、扩写、精简、中英互译或自定义指令；也可通过 `/` 命令菜单使用「AI 续写」「AI 指令」。结果会先在卡片中预览，确认后再替换或插入。
- **发布辅助**：在发布对话框中，可由 AI 生成标题与摘要。

### AI 生图

AI 生图直接调用图像模型接口，需在「设置 → 图片处理 → AI 生图」中选择供应商（OpenAI、豆包、通义万相、智谱、硅基流动或自定义 OpenAI 兼容接口），填写 API Key 与模型，并可调整超时时间。API Key 加密保存在本机。

通过 `/` 命令菜单选择「AI 生图」或点击顶部操作栏按钮，输入画面描述即可生成；预览满意后插入，图片会按图床设置上传到 PicGo 或保存到本地图片目录。

### 修改审阅

为保证文档安全，Agent 对文档的任何修改都不会直接生效：

- Agent 通过 ACP `fs/read_text_file` 读取的是编辑器中的实时内容，包含尚未保存的修改。
- Agent 通过 `fs/write_text_file` 写入的内容会先在编辑区以「段落级 + 词级」差异展示。用户可逐处接受或拒绝，确认后一次性应用，并可通过 `⌘Z` 撤销。
- 若 Agent 绕过 ACP 直接修改了磁盘上的当前文件，MarkGo 同样会检测到并进入审阅流程。此时选择拒绝，文件将恢复为修改前的内容。

## 图床配置

MarkGo 通过 [PicGo](https://github.com/Molunerfinn/PicGo) 或 [PicList](https://github.com/Kuingsmile/PicList) 的 HTTP Server 上传图片：

1. 安装并启动 PicGo 或 PicList，并配置好图床，例如七牛云、腾讯云 COS、阿里云 OSS、GitHub、SM.MS 等。
2. 在 PicGo「设置 → 设置 Server」中开启 Server，默认监听地址为 `127.0.0.1:36677`。
3. 在 MarkGo「设置 → 图片处理 → 图床」中选择「PicGo 图床」，然后点击「测试上传」进行验证。

上传使用接口 `POST /upload`，请求体为 `{"list": ["<本地路径>"]}`。剪贴板中的图片会先写入临时文件，再提交上传。

## 发布

目前支持发布到微信公众号草稿箱。

### 前置条件

1. 在「设置 → 发布渠道」中填写公众号的 AppID 与 AppSecret。AppSecret 经系统钥匙串加密后仅保存在本机。
2. 在公众号后台「设置与开发 → 基本配置 → IP 白名单」中添加本机的公网出口 IP，否则接口会返回错误码 `40164`。
3. 公众号需具备草稿箱接口权限，即已认证的服务号或订阅号。

### 发布流程

发布在主进程中完成，不受浏览器跨域限制：

```
stable_token
  → media/uploadimg          上传正文图片（非 JPG/PNG 或超过 1 MB 的图片自动转码压缩）
  → material/add_material    上传封面（永久素材）
  → draft/add                写入草稿（标题、作者、摘要、原文链接、留言设置）
```

发布对话框会自动提取以下信息，所有字段均可修改：

- **标题**：优先使用 front matter 中的 `title`，其次使用文中第一个标题。
- **摘要**：取正文前 120 字。
- **封面**：取正文首图。

默认会去除正文中与标题重复的一级标题。

## 数学公式

- 行内公式：输入 `$E=mc^2$` 即自动转换。为避免误识别金额，`$` 内侧不能是空格，结尾 `$` 后不能紧跟数字。
- 公式块：在空行输入 `$$` 后回车，或使用公式块快捷键与 `/` 命令菜单。
- 点击公式即可编辑 LaTeX 源码，实时预览，也可以用自然语言让 AI 生成。
- 复制排版内容或发布时，公式会转换为 SVG，目标平台无需支持 LaTeX。

## 键盘快捷键

macOS 使用 `⌘`，Windows 与 Linux 对应 `Ctrl`。完整列表见「帮助 → 键盘快捷键」。段落类快捷键与 Typora 一致。

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 标题 1–6 / 正文 | `⌘1`–`⌘6` / `⌘0` | `Ctrl+1`–`Ctrl+6` / `Ctrl+0` |
| 代码块 | `⌘⌥C` | `Ctrl+Shift+K` |
| 公式块 | `⌘⌥B` | `Ctrl+Shift+M` |
| 表格 | `⌘⌥T` | `Ctrl+T` |
| 有序 / 无序列表 | `⌘⌥O` / `⌘⌥U` | `Ctrl+Shift+[` / `Ctrl+Shift+]` |
| 引用 | `⌘⌥Q` | `Ctrl+Shift+Q` |
| 查找 / 替换 | `⌘F` / `⌘⌥F` | `Ctrl+F` / `Ctrl+H` |

| 操作 | 快捷键 |
| --- | --- |
| 新建笔记 | `⌘N` |
| 打开文件 / 打开文件夹 | `⌘O` / `⌘⇧O` |
| 保存 / 另存为 | `⌘S` / `⌘⇧S` |
| 设置 | `⌘,` |
| 切换侧边栏 | `⌘\` |
| 切换源码模式 | `⌘/` |
| 专注模式 | `⌘⇧F` |
| AI 助手 | `⌘J` |
| 复制排版内容 | `⌘⇧C` |
| 发布 | `⌘⇧E` |

## 开发指南

### 环境要求

- Go 1.26+
- Node.js 22+ 与 npm
- Wails 3 CLI：`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0`，可用 `wails3 doctor` 检查环境
- Linux 另需 `libgtk-4-dev`、`libwebkitgtk-6.0-dev`；Windows 打包需 NSIS

### 常用命令

```bash
wails3 dev                         # 开发模式（前端热更新，Go 代码修改后自动重启）
wails3 build                       # 构建当前平台的可执行文件到 bin/
wails3 package                     # 打包当前平台（macOS .app / Windows NSIS 安装包 / Linux AppImage、deb 等）
go test ./internal/...             # Go 单元测试（含基于 ACP 协议的模拟 Agent）
cd frontend && npm test            # 前端单元测试（Vitest）
cd frontend && npm run typecheck   # 前端类型检查
```

### 技术栈

Wails 3 · Go · React · TypeScript · Vite · Tiptap 3（`@tiptap/markdown`）· jsdiff · marked · lowlight · lucide-react · Vitest

### 架构

前端界面只依赖 `window.markgo` 接口（`frontend/src/shared/types.ts` 中的 `MarkGoApi`）。`frontend/src/bridge.ts` 用 Wails 运行时实现它：方法经 `Call.ByName('main.Bridge.<方法>')` 调用 Go 端 `Bridge` 服务，Agent 会话、菜单、打开文件等由 Go 端通过 Wails 事件推送。

<details>
<summary>目录结构</summary>

```
main.go                      # 应用入口：窗口、单实例、文件关联、/mg-asset/ 本地图片中间件
bridge.go                    # 绑定到前端的 Bridge 服务（对应 window.markgo 的每个方法）
menu.go                      # macOS 菜单栏、Windows / Linux 托盘菜单
internal/
├── settings/                # 设置持久化与迁移（密钥经系统钥匙串中的密钥 AES-GCM 加密）
├── files/                   # 笔记库文件树与文件操作、本地图片路径解析
├── images/                  # PicGo 上传与本地 assets 存储
├── imagegen/                # AI 生图（OpenAI 兼容接口 / 通义万相异步任务）
├── wechat/                  # 公众号接口：access token、图片转存（必要时缩放转 JPEG）、草稿
├── acp/                     # ACP 客户端：JSON-RPC、Agent 进程、会话、权限、文件读写代理、外部修改检测
├── update/                  # 通过 GitHub Releases 检查更新
└── platform/                # 移到废纸篓 / 回收站、用户数据目录
frontend/
├── src/
│   ├── bridge.ts            # window.markgo 的 Wails 实现；Windows / Linux 快捷键
│   ├── App.tsx
│   ├── components/          # 编辑器、侧边栏、状态栏排版控件、AI 面板、差异审阅、设置与发布对话框
│   ├── lib/                 # 排版主题、渲染管线、编辑区样式、差异审阅、AI 对话状态
│   └── shared/types.ts      # 前后端共享的类型定义
└── tests/                   # Vitest 测试
build/                       # Wails 构建配置（config.yml）、各平台图标与打包脚本
```

</details>

Windows 与 Linux 使用无边框窗口，标题栏与窗口按钮由前端绘制，菜单快捷键由 `bridge.ts` 处理；macOS 使用系统菜单栏与红绿灯按钮。

## 版本发布

GitHub Actions 会在每次推送时执行类型检查与测试。推送 `v*` 标签（或手动触发工作流）后，会自动打包三个平台的安装包；推送标签时还会创建 GitHub Release。

1. 在 [`CHANGELOG.md`](CHANGELOG.md) 中添加新版本的小节，例如 `## v0.1.1`，按需写「修复问题」「新增功能」「优化改进」三级标题（没有内容的不写），最后是「下载地址」（链接中的版本号替换为新版本）。Release 说明取自该小节，缺少小节或「下载地址」时，发布任务会失败。
2. 同步更新版本号：`main.go` 中的 `Version`、`build/config.yml` 的 `info.version`（随后执行 `wails3 task common:update:build-assets`）、`frontend/package.json`。
3. 提交并推送标签：

   ```bash
   git tag v0.1.1
   git push --follow-tags
   ```

## 参与贡献

欢迎通过 [Issues](https://github.com/quietseek/markgo/issues) 反馈问题或提出建议，也欢迎提交 Pull Request：

1. Fork 仓库并从 `main` 创建分支。
2. 按 [开发指南](#开发指南) 准备环境，用 `wails3 dev` 验证改动。
3. 提交前运行测试与类型检查：

   ```bash
   go test ./internal/...
   cd frontend && npm test && npm run typecheck
   ```

4. 面向用户的改动请在 [`CHANGELOG.md`](CHANGELOG.md) 的「未发布」小节中补充说明。

## 许可与致谢

本项目基于 [MIT License](LICENSE) 发布。

排版主题及公众号兼容处理移植自 [MarkNice](https://github.com/willmove/marknice)，© 2026 Willmove，遵循 MIT License。
