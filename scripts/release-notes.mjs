// 从 CHANGELOG.md 提取某个版本的说明，并附上下载指引，作为 GitHub Release 的正文。
// usage: node scripts/release-notes.mjs v0.2.1 > release-notes.md
import { readFileSync } from 'node:fs'

const tag = process.argv[2]
if (!tag) {
  console.error('usage: node scripts/release-notes.mjs <tag>')
  process.exit(1)
}
const version = tag.replace(/^v/, '')

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const lines = changelog.split('\n')
const start = lines.findIndex((l) => /^## /.test(l) && l.replace(/^##\s+v?/, '').trim() === version)
if (start < 0) {
  console.error(`CHANGELOG.md 中没有 ${tag} 的小节，请先补充更新日志再发版`)
  process.exit(1)
}
let end = lines.findIndex((l, i) => i > start && /^## /.test(l))
if (end < 0) end = lines.length
const notes = lines
  .slice(start + 1, end)
  .join('\n')
  .trim()
if (!notes) {
  console.error(`CHANGELOG.md 中 ${tag} 的小节为空`)
  process.exit(1)
}

const downloads = `## 下载

| 系统 | 安装包 |
| --- | --- |
| macOS（Apple 芯片与 Intel 通用） | \`MarkGo-${version}-mac-universal.dmg\` |
| Windows | \`MarkGo-${version}-win-x64-setup.exe\` |
| Linux | \`MarkGo-${version}-linux-x86_64.AppImage\` 或 \`MarkGo-${version}-linux-amd64.deb\` |

> Windows 需要 WebView2 运行时（Windows 10/11 通常已自带，安装程序会自动补装）；Linux 需要 GTK 4 与 WebKitGTK 6.0（Ubuntu 24.04+ / Debian 13+）。
> 安装包未经代码签名：macOS 首次打开如提示「已损坏」或「无法验证开发者」，请在终端执行 \`xattr -cr /Applications/MarkGo.app\` 后再打开；Windows 如出现 SmartScreen 提示，点击「更多信息 → 仍要运行」。`

process.stdout.write(`${notes}\n\n${downloads}\n`)
