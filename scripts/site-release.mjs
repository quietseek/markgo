// 部署介绍页前，把最新 Release 的版本号、安装包直链与大小、CHANGELOG 亮点写进 site/index.html，输出到另一个目录。
// 页面里读取 GitHub API 的脚本仍保留作兜底；这里写好后，即使访客被限流或没有执行 JS，看到的也是最新版本。
// usage: node scripts/site-release.mjs <输出目录>   （可用 GITHUB_TOKEN 提高 API 限额，GITHUB_REPOSITORY 指定仓库）
//
// 亮点取自 CHANGELOG.md 对应版本小节里的 `<!-- 亮点：... -->`，没有就截取第一条说明的开头。
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) {
  console.error('usage: node scripts/site-release.mjs <输出目录>')
  process.exit(1)
}
const root = new URL('..', import.meta.url).pathname
const repo = process.env.GITHUB_REPOSITORY || 'quietseek/markgo'

cpSync(join(root, 'site'), out, { recursive: true })

const headers = { Accept: 'application/vnd.github+json' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
if (!res.ok) {
  // 读不到 Release 时照常部署原页面，由页面脚本在浏览器里补上版本信息
  console.warn(`::warning::读取最新 Release 失败（HTTP ${res.status}），介绍页按原样部署`)
  process.exit(0)
}
const rel = await res.json()
const ver = rel.tag_name

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const mb = (n) => (n / 1048576).toFixed(1) + ' MB'

/** CHANGELOG 中该版本的亮点 */
function highlight() {
  const lines = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n')
  const start = lines.findIndex((l) => /^## /.test(l) && l.replace(/^##\s+v?/, '').trim() === ver.replace(/^v/, ''))
  if (start < 0) return ''
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  if (end < 0) end = lines.length
  const section = lines.slice(start + 1, end)
  const marked = section.join('\n').match(/<!--\s*亮点[：:]\s*([\s\S]*?)\s*-->/)
  if (marked) return marked[1].trim()
  let heading = ''
  for (const l of section) {
    if (/^###\s/.test(l)) heading = l.replace(/^###\s+/, '').trim()
    else if (heading !== '下载地址' && /^- /.test(l)) {
      const text = l.slice(2).split(/[（(，,；;。]/)[0].trim()
      return text.length > 32 ? text.slice(0, 31) + '…' : text
    }
  }
  return ''
}

const file = join(out, 'index.html')
let html = readFileSync(file, 'utf8')
/** 按正则替换，没有匹配说明页面结构变了，直接报错 */
function replace(re, fn, what) {
  if (!re.test(html)) throw new Error(`site/index.html 中找不到${what}，请同步更新 scripts/site-release.mjs`)
  html = html.replace(re, fn)
}

const hl = highlight()
replace(
  /(<a class="eyebrow" id="release-tag"[^>]*>\s*<b>)[^<]*(<\/b>\s*<span>)[^<]*(<\/span>)/,
  (_, a, b, c) => `${a}${esc(ver)}${b}${esc(hl || '查看更新内容')}${c}`,
  '顶部的新版本提示'
)
replace(/(<p class="sub" id="dl-sub">)[^<]*(<\/p>)/, (_, a, b) => `${a}最新版本 ${esc(ver)}，免费、开源。安装后有新版本时，应用内一键更新。${b}`, '下载区说明')

for (const os of ['mac', 'win', 'linux']) {
  const re = new RegExp(`<a class="dl reveal" data-os="${os}" data-match="([^"]+)" href="[^"]*">([\\s\\S]*?)</a>`)
  replace(
    re,
    (all, match, body) => {
      const asset = rel.assets.find((x) => new RegExp(match).test(x.name))
      if (!asset) {
        console.warn(`::warning::${ver} 中没有匹配 ${match} 的安装包，${os} 下载卡片保持原样`)
        return all
      }
      const inner = body
        .replace(/(<span class="file">)[^<]*(<\/span>)/, `$1${esc(asset.name)}$2`)
        .replace(/(<span class="go">)[^<]*(<\/span>)/, `$1下载 ${esc(ver)} · ${mb(asset.size)} →$2`)
      return `<a class="dl reveal" data-os="${os}" data-match="${match}" href="${esc(asset.browser_download_url)}">${inner}</a>`
    },
    ` ${os} 下载卡片`
  )
}

writeFileSync(file, html)
console.log(`介绍页已写入 ${ver}${hl ? `（亮点：${hl}）` : ''}`)
