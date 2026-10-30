// 从 CHANGELOG.md 提取某个版本的说明（修复问题、新增功能、优化改进、下载地址），作为 GitHub Release 的正文。
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
// 每个版本的说明需包含这四个小节，缺少时提前报错，避免发布不完整的说明
const missing = ['修复问题', '新增功能', '优化改进', '下载地址'].filter((h) => !new RegExp(`^###\\s+${h}\\s*$`, 'm').test(notes))
if (missing.length) {
  console.error(`CHANGELOG.md 中 ${tag} 的小节缺少：${missing.join('、')}`)
  process.exit(1)
}

process.stdout.write(`${notes}\n`)
