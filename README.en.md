<h1 align="center">MarkGo</h1>

<div align="center"><a href="https://github.com/quietseek/markgo/actions/workflows/build.yml"><img alt="Build" src="https://github.com/quietseek/markgo/actions/workflows/build.yml/badge.svg"></a> <a href="https://github.com/quietseek/markgo/releases"><img alt="Release" src="https://img.shields.io/github/v/release/quietseek/markgo"></a> <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a> <img alt="Go" src="https://img.shields.io/github/go-mod/go-version/quietseek/markgo"> <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey"></div>

<p align="center">
🇨🇳 <a href="./README.md">简体中文</a> | 🇺🇸 <a href="./README.en.md">English</a>
</p>

MarkGo is a desktop Markdown writing and note-taking app for content creators. It uses a local folder as your notebook, offers a WYSIWYG editing experience built on Tiptap, and integrates AI writing assistance, image hosting uploads and layout themes, so you can copy the styled result or publish it in one click as soon as you finish writing.

It runs on macOS, Windows and Linux. Built with [Wails 3](https://v3.wails.io) (Go + the system WebView), it bundles neither a browser engine nor Node.js, so the installer stays small.

> [!NOTE]
> MarkGo's interface is currently available in Simplified Chinese only. UI labels below are quoted in Chinese with an English gloss, e.g. 「设置」(Settings).

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [AI Writing](#ai-writing)
- [Image Hosting](#image-hosting)
- [Publishing](#publishing)
- [Math](#math)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Development](#development)
- [Releasing](#releasing)
- [Contributing](#contributing)
- [License and Acknowledgments](#license-and-acknowledgments)

## Features

| Module | Description |
| --- | --- |
| Notebook | Any local folder can be a notebook, and every note is a plain `.md` file; folders without notes are hidden; opening a file outside the notebook switches to its folder; create, rename, move to trash and reveal in the file manager; edits are saved automatically |
| Editor | WYSIWYG editing on Tiptap 3: headings, lists, task lists, tables (row/column toolbar), code blocks (language picker, syntax highlighting, one-click copy, formatting), Mermaid diagrams (live rendering, copy as image or export PNG / SVG), blockquotes, highlights, sub/superscript, links, images and math (KaTeX); `/` command menu, top quick-action bar (can be turned off in settings), collapsible YAML front matter display and editing (hidden while a layout theme is applied), selection toolbar, find and replace, Typora-style shortcuts, Markdown source mode, outline navigation, focus mode and typewriter mode |
| Layout | 15 built-in layout themes applied directly to the editor; adjustable font size and paragraph spacing; external links can be turned into end-of-article footnotes; three editor width presets: 「标准 / 宽屏 / 铺满」(Standard / Wide / Full); 「原生样式」(Native style) offers font, font size, line height and paragraph spacing settings, and the status bar switches between system / dark / light appearance |
| Images | Paste, drag and drop, or insert via command; upload to a PicGo / PicList image host, or save to an `assets` folder next to the document; AI image generation; the image toolbar can upload local images to the host, save remote images locally, replace an image and edit its caption |
| AI writing | Connects to AI agents installed on your machine through the Agent Client Protocol (ACP): chat assistant, styled outline-to-article writing from a topic, inline rewrite and continuation of a selection, and math from natural language; every change from an agent must pass a diff review before it is applied |
| Publishing | Copy styled rich text in one click and paste it into any rich-text editor (Mermaid diagrams become images automatically); or publish directly once configured (currently WeChat Official Account drafts, with body images re-uploaded automatically) |
| Other | Light / dark / system appearance, with imported Typora themes usable as the light or dark theme; close to background (customizable tray menu on Windows / Linux); recent folders; classic or traffic-light window buttons; export styled HTML; untitled drafts persisted automatically |

Built-in layout themes: 暖陶米白, 极简留白, 暗夜深色, 简洁蓝, 优雅棕, 活力红, 琥珀橙, 清新绿, 健康绿, 杂志红, 复古纸, 海盐青, 科技蓝, 报刊体, 暖阳红.

## Installation

Download the installer for your platform from the [Releases](https://github.com/quietseek/markgo/releases) page:

| OS | Package | Requirements |
| --- | --- | --- |
| macOS (universal: Apple silicon and Intel) | `MarkGo-<version>-mac-universal.dmg` | macOS 11+ |
| Windows | `MarkGo-<version>-win-x64-setup.exe` | WebView2 runtime (usually preinstalled on Windows 10/11; the installer adds it if missing) |
| Linux | `MarkGo-<version>-linux-amd64.deb` | GTK 4 and WebKitGTK 6.0 (Ubuntu 24.04+ / Debian 13+) |

Once installed, when a new version is available, click 「立即更新」(Update now) in About (or the update button at the bottom left of the sidebar): MarkGo downloads, installs and reopens itself, with no manual download needed.

> [!NOTE]
> The installers are not code-signed yet.
> - **macOS**: if the first launch says the app "is damaged" or "cannot be verified", run `xattr -cr /Applications/MarkGo.app` in Terminal and open it again.
> - **Windows**: if SmartScreen appears, click "More info → Run anyway".

## Quick Start

### Write, style and publish

1. After launching, choose a folder as your notebook via 「文件 → 打开文件夹」(File → Open Folder, `⌘⇧O`). Markdown files outside the notebook (opened with 「打开文件」(Open File) `⌘O`, by double-clicking, or by dropping onto the app icon) open in the main window, and the sidebar switches to that file's folder.
2. Press `⌘N` to create a note. Type `/` in the editor for the command menu; select text to bring up the formatting toolbar. The `/` command 「元信息」(Front matter) adds a title, date, tags and so on at the top of the document; expand it to edit under 「原生样式」(Native style).
3. In the bottom status bar, pick a layout theme, adjust font size and paragraph spacing, and switch the editor width and the image insertion mode (「图床 / 本地」, image host / local). With 「原生样式」(Native style), the editor uses the default look while publishing still applies the selected theme.
4. When you are done, use the icon buttons on the right of the status bar to copy the styled content or publish.

### Write an article with AI

1. Install and connect an agent as described in [AI Writing → Setup](#setup), then set the writing style, length (「短文 / 中篇 / 长文」, short / medium / long) and target audience in 「设置 → 写作偏好」(Settings → Writing Preferences).
2. Press `⌘J` to open the AI assistant, click 「写文章」(Write article), enter a topic, choose a style and length, then click 「生成大纲」(Generate outline).
3. Discuss and refine the outline with the agent in the chat; when you are happy with it, click 「开始写作」(Start writing). MarkGo creates a new document with the suggested title and streams the agent's output into the editor live (read-only while writing); you can edit once it finishes.
4. Polish or rewrite paragraphs with the selection 「AI」 menu, then style and publish as above.

## AI Writing

AI writing does not call model APIs directly and needs no API key: the capability comes from agents installed on your machine. MarkGo talks to them as subprocesses over the [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC over stdio).

### Setup

1. Make sure Node.js is installed, and sign in to your agent in a terminal:

   | Agent | Sign-in |
   | --- | --- |
   | Claude Code | Run `claude`, then `/login` |
   | Codex | Run `codex login` |
   | Gemini CLI | Run `gemini` and complete authorization |
   | OpenCode | Run `opencode auth login` |
   | Qwen Code | Run `qwen` and complete authorization |
   | GitHub Copilot | Run `copilot`, then `/login` |
   | Goose | Install the Goose CLI, then run `goose configure` |

2. Find the agent in 「设置 → AI 集成」(Settings → AI Integrations) and click 「安装」(Install). Preset agents are launched through `npx`, so the first install downloads them; once connected, the card shows 「已连接」(Connected). Click 「使用」(Use) on another installed agent to switch.
3. Other ACP-compatible agents can be added with 「＋ 添加自定义 Agent」(+ Add custom agent): enter the command that starts it in ACP mode and install it. Expand a card to edit its command or uninstall it. Launch commands run through your login shell and inherit its environment variables (such as API keys).

### Usage

- **Write an article**: set the writing style, length, target audience and extra requirements in 「设置 → 写作偏好」(Settings → Writing Preferences). In the AI assistant, click 「写文章」(Write article) and enter a topic; the agent proposes an outline first. Discuss it in the chat, then click 「开始写作」(Start writing): MarkGo creates a new document with the suggested title and streams the agent's output into the editor live; the editor is read-only while writing, you can stop at any time, and it becomes editable once the draft is finished. The draft starts with front matter (title, slug, summary, category, status, theme, tags, updated_at), and once it is finished the document is renamed after the front matter `title`.
- **AI math**: choose 「AI 公式」(AI formula) from the `/` menu, or select a description and click "∑" in the formatting toolbar; describe the formula in natural language to generate LaTeX, preview it, then insert.
- **AI assistant** (`⌘J`): chat with the agent in the side panel and quote the current selection. The agent's plan, tool calls and permission requests all show up in the conversation.
- **Inline AI**: after selecting text, choose 「AI」 in the formatting toolbar to polish, rewrite, expand, condense, translate between Chinese and English, or run a custom instruction; 「AI 续写」(AI continue) and 「AI 指令」(AI instruction) are also available in the `/` menu. Results are previewed in a card before replacing or inserting.
- **Publishing help**: AI can generate the title and digest in the publish dialog.

### AI image generation

AI image generation calls image model APIs directly. Choose a provider in 「设置 → 图片处理 → AI 生图」(Settings → Image Handling → AI image) — OpenAI, Doubao, Tongyi Wanxiang, Zhipu, SiliconFlow, or a custom OpenAI-compatible endpoint — and fill in the API key and model; the timeout is adjustable. API keys are stored encrypted on your machine.

Choose 「AI 生图」(AI image) from the `/` menu or click the button in the top action bar, then describe the image. Insert it once you are happy with the preview; the image is uploaded to PicGo or saved to the local image folder according to your image settings.

### Change review

To keep your documents safe, no change from an agent takes effect directly:

- What the agent reads through ACP `fs/read_text_file` is the live editor content, including unsaved edits.
- What the agent writes through `fs/write_text_file` is first shown in the editor as a paragraph- and word-level diff. You can accept or reject each change, apply them all at once, and undo with `⌘Z`.
- If the agent bypasses ACP and modifies the current file on disk, MarkGo detects it and starts the same review. Rejecting restores the file to its previous content.

## Image Hosting

MarkGo uploads images through the HTTP server of [PicGo](https://github.com/Molunerfinn/PicGo) or [PicList](https://github.com/Kuingsmile/PicList):

1. Install and start PicGo or PicList and configure an image host, such as Qiniu, Tencent Cloud COS, Alibaba Cloud OSS, GitHub or SM.MS.
2. Enable the server in PicGo under 「设置 → 设置 Server」(Settings → Server); it listens on `127.0.0.1:36677` by default.
3. In MarkGo, choose 「PicGo 图床」(PicGo host) under 「设置 → 图片处理 → 图床」(Settings → Image Handling → Image host), then click 「测试上传」(Test upload) to verify.

Uploads use `POST /upload` with the body `{"list": ["<local path>"]}`. Images from the clipboard are written to a temporary file before being uploaded.

## Publishing

Publishing to WeChat Official Account drafts is currently supported.

### Prerequisites

1. Fill in the account's AppID and AppSecret in 「设置 → 发布渠道」(Settings → Publishing Channels). The AppSecret is encrypted with a key from the system keychain and stored only on your machine.
2. Add your machine's public egress IP to the IP allowlist in the Official Account console (「设置与开发 → 基本配置 → IP 白名单」), otherwise the API returns error code `40164`.
3. The account needs draft API permission, i.e. a verified service or subscription account.

### Publishing flow

Publishing runs in the main process, so it is not subject to browser CORS restrictions:

```
stable_token
  → media/uploadimg          upload body images (non-JPG/PNG or images over 1 MB are transcoded and compressed)
  → material/add_material    upload the cover (permanent material)
  → draft/add                create the draft (title, author, digest, source URL, comment settings)
```

The publish dialog fills in the following automatically, and every field can be edited:

- **Title**: the front matter `title` if present, otherwise the first heading in the document.
- **Digest**: the first 120 characters of the body.
- **Cover**: the first image in the body.

By default, a level-1 heading identical to the title is removed from the body.

## Math

- Inline math: typing `$E=mc^2$` converts automatically. To avoid mistaking prices for math, there must be no space just inside the `$` signs, and the closing `$` must not be followed by a digit.
- Math blocks: type `$$` on an empty line and press Enter, or use the math block shortcut or the `/` menu.
- Click a formula to edit its LaTeX with a live preview, or let AI generate it from natural language.
- When copying styled content or publishing, formulas are converted to SVG, so the target platform does not need LaTeX support.

## Keyboard Shortcuts

macOS uses `⌘`; Windows and Linux use `Ctrl` instead. See 「帮助 → 键盘快捷键」(Help → Keyboard Shortcuts) for the full list. Paragraph shortcuts match Typora.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Heading 1–6 / Paragraph | `⌘1`–`⌘6` / `⌘0` | `Ctrl+1`–`Ctrl+6` / `Ctrl+0` |
| Code block | `⌘⌥C` | `Ctrl+Shift+K` |
| Math block | `⌘⌥B` | `Ctrl+Shift+M` |
| Table | `⌘⌥T` | `Ctrl+T` |
| Ordered / bulleted list | `⌘⌥O` / `⌘⌥U` | `Ctrl+Shift+[` / `Ctrl+Shift+]` |
| Blockquote | `⌘⌥Q` | `Ctrl+Shift+Q` |
| Find / Replace | `⌘F` / `⌘⌥F` | `Ctrl+F` / `Ctrl+H` |

| Action | Shortcut |
| --- | --- |
| New note | `⌘N` |
| Open file / Open folder | `⌘O` / `⌘⇧O` |
| Save / Save as | `⌘S` / `⌘⇧S` |
| Settings | `⌘,` |
| Toggle sidebar | `⌘\` |
| Toggle source mode | `⌘/` |
| Focus mode | `⌘⇧F` |
| AI assistant | `⌘J` |
| Copy styled content | `⌘⇧C` |
| Publish | `⌘⇧E` |

## Development

### Requirements

- Go 1.26+
- Node.js 22+ and npm
- Wails 3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0`; run `wails3 doctor` to check your environment
- Linux also needs `libgtk-4-dev` and `libwebkitgtk-6.0-dev`; packaging on Windows needs NSIS

### Common commands

```bash
wails3 dev                         # development mode (frontend hot reload, auto-restart on Go changes)
wails3 build                       # build an executable for the current platform into bin/
wails3 package                     # package for the current platform (macOS .app / Windows NSIS installer / Linux deb, etc.)
go test ./internal/...             # Go unit tests (including a mock agent speaking ACP)
cd frontend && npm test            # frontend unit tests (Vitest)
cd frontend && npm run typecheck   # frontend type checking
```

### Tech stack

Wails 3 · Go · React · TypeScript · Vite · Tiptap 3 (`@tiptap/markdown`) · jsdiff · marked · lowlight · lucide-react · Vitest

### Architecture

The frontend UI depends only on the `window.markgo` interface (`MarkGoApi` in `frontend/src/shared/types.ts`). `frontend/src/bridge.ts` implements it on the Wails runtime: methods call the Go `Bridge` service via `Call.ByName('main.Bridge.<Method>')`, while agent sessions, menus, file opening and so on are pushed from Go as Wails events.

<details>
<summary>Directory structure</summary>

```
main.go                      # app entry: window, single instance, file associations, /mg-asset/ local image middleware
bridge.go                    # Bridge service bound to the frontend (one method per window.markgo method)
menu.go                      # macOS menu bar, Windows / Linux tray menu
internal/
├── settings/                # settings persistence and migration (secrets AES-GCM encrypted with a key from the system keychain)
├── files/                   # notebook file tree and file operations, local image path resolution
├── images/                  # PicGo uploads and local assets storage
├── imagegen/                # AI image generation (OpenAI-compatible APIs / Tongyi Wanxiang async tasks)
├── wechat/                  # Official Account APIs: access token, image re-upload (resized to JPEG when needed), drafts
├── acp/                     # ACP client: JSON-RPC, agent process, sessions, permissions, file read/write proxy, external change detection
├── update/                  # update checks via GitHub Releases
└── platform/                # move to trash / recycle bin, user data directory
frontend/
├── src/
│   ├── bridge.ts            # Wails implementation of window.markgo; Windows / Linux shortcuts
│   ├── App.tsx
│   ├── components/          # editor, sidebar, status bar layout controls, AI panel, diff review, settings and publish dialogs
│   ├── lib/                 # layout themes, render pipeline, editor styles, diff review, AI chat state
│   └── shared/types.ts      # types shared between frontend and backend
└── tests/                   # Vitest tests
build/                       # Wails build config (config.yml), platform icons and packaging scripts
```

</details>

Windows and Linux use frameless windows whose title bar and window buttons are drawn by the frontend, with menu shortcuts handled in `bridge.ts`; macOS uses the system menu bar and traffic-light buttons.

## Releasing

GitHub Actions runs type checks and tests on every push. Pushing a `v*` tag (or triggering the workflow manually) builds installers for all three platforms; pushing a tag also creates a GitHub Release.

1. Add a section for the new version to [`CHANGELOG.md`](CHANGELOG.md), e.g. `## v0.1.1`, with level-3 headings 「修复问题」「新增功能」「优化改进」(Fixes, New features, Improvements) as needed (omit empty ones), followed by 「下载地址」(Downloads) with the version number in the links updated. The release notes are taken from that section; the release job fails if the section or 「下载地址」 is missing.
2. Bump the version everywhere: `Version` in `main.go`, `info.version` in `build/config.yml` (then run `wails3 task common:update:build-assets`), and `frontend/package.json`.
3. Commit and push the tag:

   ```bash
   git tag v0.1.1
   git push --follow-tags
   ```

## Contributing

Bug reports and suggestions are welcome via [Issues](https://github.com/quietseek/markgo/issues), and so are pull requests:

1. Fork the repository and create a branch from `main`.
2. Set up your environment following [Development](#development) and verify your change with `wails3 dev`.
3. Run tests and type checks before submitting:

   ```bash
   go test ./internal/...
   cd frontend && npm test && npm run typecheck
   ```

4. For user-facing changes, add a note under the 「未发布」(Unreleased) section of [`CHANGELOG.md`](CHANGELOG.md).

## License and Acknowledgments

This project is released under the [MIT License](LICENSE).

The layout themes and WeChat compatibility handling are ported from [MarkNice](https://github.com/willmove/marknice), © 2026 Willmove, under the MIT License.
