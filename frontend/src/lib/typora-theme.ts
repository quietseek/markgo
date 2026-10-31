/**
 * 把 Typora 主题（.css）转换为 MarkGo 可用的样式：
 *  - 写作区：#write 下的规则作用于编辑器（.mk-typora .prose-editor），html / body 的排版作用于编辑区；
 *  - 界面：由主题的 --bg-color、--text-color、--side-bar-bg-color 等变量推导出应用的界面色变量；
 *  - Typora 自身界面（侧栏、菜单、弹窗、专注模式等）的规则全部丢弃，避免影响 MarkGo 的界面。
 * 代码块：Typora 的 CodeMirror 高亮类名（.cm-keyword 等）映射为 highlight.js 类名。
 */

/** 编辑区容器（相当于 Typora 的 html / body） */
export const PANE_SCOPE = '.mk-typora'
/** 写作区（相当于 Typora 的 #write） */
export const DOC_SCOPE = '.mk-typora .prose-editor'

export interface CompiledTheme {
  css: string
  dark: boolean
}

// ---------- CSS 解析 ----------

type CssNode =
  | { kind: 'rule'; selector: string; body: string }
  | { kind: 'block'; prelude: string; children: CssNode[] }
  | { kind: 'raw'; text: string }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 从 i 开始跳过字符串，返回字符串结束后的位置 */
function skipString(s: string, i: number): number {
  const q = s[i]
  for (i++; i < s.length; i++) {
    if (s[i] === '\\') i++
    else if (s[i] === q) return i + 1
  }
  return i
}

/** 找到与 s[open] 处 '{' 匹配的 '}' */
function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === '"' || c === "'") {
      i = skipString(s, i) - 1
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return s.length
}

const NESTED_AT = /^@(media|supports|layer|document|-moz-document)\b/i

export function parseCss(css: string): CssNode[] {
  const nodes: CssNode[] = []
  let i = 0
  const s = css
  while (i < s.length) {
    while (i < s.length && /[\s;]/.test(s[i])) i++
    if (i >= s.length) break
    // 读到 '{' 或 ';'（语句型 at 规则）
    let j = i
    while (j < s.length && s[j] !== '{' && s[j] !== ';' && s[j] !== '}') {
      if (s[j] === '"' || s[j] === "'") j = skipString(s, j)
      else if (s[j] === '(') {
        // url(...) 等括号中可能出现 ';'
        let depth = 0
        for (; j < s.length; j++) {
          if (s[j] === '(') depth++
          else if (s[j] === ')' && --depth === 0) break
        }
        j++
      } else j++
    }
    const prelude = s.slice(i, j).trim()
    if (j >= s.length || s[j] !== '{') {
      if (prelude) nodes.push({ kind: 'raw', text: prelude + ';' })
      i = j + 1
      continue
    }
    const end = matchBrace(s, j)
    const inner = s.slice(j + 1, end)
    if (NESTED_AT.test(prelude)) nodes.push({ kind: 'block', prelude, children: parseCss(inner) })
    else if (prelude.startsWith('@')) nodes.push({ kind: 'raw', text: `${prelude} {${inner}}` })
    else nodes.push({ kind: 'rule', selector: prelude, body: inner })
    i = end + 1
  }
  return nodes
}

/** 按顶层逗号切分（忽略括号与字符串中的逗号） */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"' || c === "'") i = skipString(s, i) - 1
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim()).filter(Boolean)
}

type Decl = [prop: string, value: string]

function parseDecls(body: string): Decl[] {
  return splitTop(body, ';')
    .map((d) => {
      const k = d.indexOf(':')
      return k > 0 ? ([d.slice(0, k).trim(), d.slice(k + 1).trim()] as Decl) : null
    })
    .filter((d): d is Decl => !!d && !!d[0] && !!d[1])
}

const declText = (decls: Decl[]) => decls.map(([p, v]) => `${p}: ${v}`).join('; ')

// ---------- 选择器改写 ----------

/** Typora 自身界面、导出、专注模式等与写作区无关的选择器 */
const DROP =
  /#typora-|\.typora-|\.megamenu|\.context-menu|\.dropdown|\.modal|\.popover|\.btn\b|#md-|\.md-(?!fences(?![\w-]))|(^|[\s>+~])(header|footer|nav|button|input|select|textarea|audio|video)\b|\.sidebar|#sidebar|\.outline-|\.file-|\.ty-|#toc-|\.CodeMirror|\.on-focus-mode|\.native-window|\.html-for-mac|\.os-|\.mac-|\.export-|\.auto-suggest|\.code-tooltip|\.enable-diagrams|::?-webkit-scrollbar|\.in-text-selection|\[hidden\]|\.task-list|#w-|\.nav-group|#info-panel|\.long-btn|#recent-|#file-|#footer|\.footer|#spell|#top-titlebar|\.toolbar|\.form-|\.input-group|\.clear-btn|\.mathjax|\.cm-s-typora-default|\.mouse-hover|\.selected-folder|\.pin-|\.unibody|\.window-|\.is-mac|\.ty-|#ty-|\.panel|\.popover|\.tooltip|\.inline-math|#math-|\.sourceview|#write-|\.searchpanel/

/** CodeMirror 高亮类名 → highlight.js 类名 */
const CM_TO_HLJS: Record<string, string> = {
  keyword: 'keyword',
  string: 'string',
  'string-2': 'regexp',
  comment: 'comment',
  number: 'number',
  atom: 'literal',
  def: 'title',
  variable: 'variable',
  'variable-2': 'variable',
  'variable-3': 'type',
  type: 'type',
  property: 'property',
  attribute: 'attr',
  tag: 'name',
  builtin: 'built_in',
  meta: 'meta',
  operator: 'operator',
  qualifier: 'selector-class',
  bracket: 'punctuation',
  header: 'section',
  quote: 'quote',
  link: 'link',
  positive: 'addition',
  negative: 'deletion'
}

export type MappedSelector = { page: true } | { page: false; selector: string; write: boolean } | null

/** 改写单个选择器；返回 null 表示丢弃，page 表示作用于 html / body / :root */
export function mapSelector(sel: string): MappedSelector {
  let s = sel.trim()
  if (!s || DROP.test(s)) return null
  // 代码块高亮
  s = s.replace(/\.cm-s-inner\b/g, '.md-fences')
  let unknown = false
  s = s.replace(/\.cm-([\w-]+)/g, (_, name: string) => {
    const h = CM_TO_HLJS[name]
    if (!h) unknown = true
    return `.hljs-${h}`
  })
  if (unknown) return null
  s = s.replace(/\bpre\.md-fences\b/g, '.md-fences')
  // 去掉开头的 html / body / :root
  const lead = /^(html|body|:root)(?=$|[\s>])\s*(>\s*)?/
  let stripped = false
  while (lead.test(s)) {
    s = s.replace(lead, '')
    stripped = true
  }
  if (!s) return stripped ? { page: true } : null
  // 带类名 / 属性等修饰的 html、body（如 body.os-windows）只在 Typora 的特定环境下生效，忽略
  if (/(^|[\s>+~])(html|body|:root)(?![\w-])/.test(s)) return null
  if (s.startsWith('#write')) {
    const rest = s.slice('#write'.length)
    if (rest && !/^[\s>+~:.[]/.test(rest)) return null
    return { page: false, selector: DOC_SCOPE + rest, write: rest.trim() === '' }
  }
  return { page: false, selector: `${DOC_SCOPE} ${s}`, write: false }
}

// ---------- 颜色 ----------

type Rgb = [number, number, number]

const NAMED: Record<string, Rgb> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  whitesmoke: [245, 245, 245],
  snow: [255, 250, 250],
  ivory: [255, 255, 240],
  linen: [250, 240, 230],
  beige: [245, 245, 220],
  floralwhite: [255, 250, 240],
  ghostwhite: [248, 248, 255],
  oldlace: [253, 245, 230],
  seashell: [255, 245, 238],
  gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
  navy: [0, 0, 128],
  red: [255, 0, 0],
  blue: [0, 0, 255],
  green: [0, 128, 0]
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round) as Rgb
}

export function parseColor(input: string): Rgb | null {
  const c = input.trim().toLowerCase()
  if (NAMED[c]) return NAMED[c]
  let m = /^#([0-9a-f]{3,8})$/.exec(c)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('')
    if (h.length !== 6 && h.length !== 8) return null
    if (h.length === 8 && parseInt(h.slice(6), 16) === 0) return null
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
  }
  m = /^rgba?\(([^)]+)\)$/.exec(c)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length >= 4 && parseFloat(parts[3]) === 0) return null
    const v = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)))
    return v.length === 3 && v.every((x) => !isNaN(x)) ? (v.map(Math.round) as Rgb) : null
  }
  m = /^hsla?\(([^)]+)\)$/.exec(c)
  if (m) {
    const [h, s, l] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat)
    return [h, s, l].every((x) => !isNaN(x)) ? hslToRgb(h, s / 100, l / 100) : null
  }
  return null
}

/** 从 background 等简写中取出第一个能识别的颜色 */
function findColor(value: string): Rgb | null {
  const whole = parseColor(value)
  if (whole) return whole
  for (const token of value.match(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b[a-z]+\b/gi) || []) {
    const c = parseColor(token)
    if (c) return c
  }
  return null
}

const hex = (c: Rgb) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb
function luminance(c: Rgb): number {
  const [r, g, b] = c.map((x) => {
    const v = x / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 展开 var(--x, fallback) */
function resolveVars(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 8) return value
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_, name: string, fb?: string) => {
    const v = vars[name] ?? fb
    return v ? resolveVars(v, vars, depth + 1) : ''
  })
}

/** 由主题颜色推导应用界面的颜色变量 */
export function deriveUiVars(vars: Record<string, string>, pageBg?: string, pageText?: string): { dark: boolean; decls: Decl[] } {
  const color = (v?: string) => (v ? findColor(resolveVars(v, vars)) : null)
  const bg = color(vars['--bg-color']) ?? color(pageBg) ?? ([255, 255, 255] as Rgb)
  const dark = luminance(bg) < 0.18
  const text = color(vars['--text-color']) ?? color(pageText) ?? ((dark ? [221, 221, 221] : [51, 51, 51]) as Rgb)
  const extreme: Rgb = dark ? [255, 255, 255] : [0, 0, 0]
  const surface = color(vars['--side-bar-bg-color']) ?? mix(bg, text, 0.035)
  const decls: Decl[] = [
    ['--bg', hex(bg)],
    ['--surface', hex(surface)],
    ['--surface-muted', hex(mix(bg, text, 0.045))],
    ['--surface-hover', hex(mix(surface, text, 0.07))],
    ['--surface-active', hex(mix(surface, text, 0.12))],
    ['--text', hex(text)],
    ['--text-strong', hex(mix(text, extreme, 0.35))],
    ['--text-muted', hex(mix(text, bg, 0.42))],
    ['--ghost', hex(mix(text, bg, 0.62))],
    ['--border', hex(mix(bg, text, 0.1))],
    ['--border-strong', hex(mix(bg, text, 0.17))]
  ]
  const accent = color(vars['--primary-color'])
  if (accent) {
    const fg: Rgb = luminance(accent) > 0.45 ? [17, 17, 17] : [255, 255, 255]
    decls.push(['--primary', hex(accent)], ['--primary-hover', hex(mix(accent, extreme, 0.12))], ['--primary-fg', hex(fg)])
  } else {
    const strong = mix(text, extreme, 0.35)
    decls.push(['--primary', hex(strong)], ['--primary-hover', hex(mix(strong, extreme, 0.2))], ['--primary-fg', hex(bg)])
  }
  if (vars['--monospace']) decls.push(['--mono', vars['--monospace']])
  return { dark, decls }
}

// ---------- 编译 ----------

/** 写作区本身（#write）中由 MarkGo 管理的布局属性 */
const WRITE_LAYOUT = /^(max-width|min-width|width|height|min-height|margin.*|padding.*|position|left|right|top|bottom|overflow.*)$/
/** html / body 上不应带入编辑区的属性 */
const PAGE_SKIP = /^(width|height|min-height|max-width|margin.*|padding.*|position|overflow.*|-webkit-text-size-adjust|-ms-text-size-adjust|fill)$/

/** Typora 基础样式中代码块的默认外观（主题常依赖它） */
const BASE_CSS = `${DOC_SCOPE} .md-fences { padding: 8px 12px; border-radius: 3px; background: var(--surface-muted); }`
/** 主题规则之后的修正：代码块内的 pre / code 不再套用行内代码与 pre 的样式 */
const AFTER_CSS = [
  `${DOC_SCOPE} .md-fences > pre { background: transparent; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; }`,
  `${DOC_SCOPE} .md-fences code { background: none; padding: 0; border: 0; border-radius: 0; font-size: inherit; color: inherit; }`
].join('\n')

export function compileTyporaTheme(source: string): CompiledTheme {
  const nodes = parseCss(stripComments(source))
  const vars: Record<string, string> = {}
  let pageBg: string | undefined
  let pageText: string | undefined
  let writeBg: string | undefined

  const emitRules = (list: CssNode[], top: boolean): string[] => {
    const out: string[] = []
    for (const node of list) {
      if (node.kind === 'raw') {
        // @font-face、@keyframes 保留；@import（远程资源受内容安全策略限制）、@charset、@include-when-export 等丢弃
        if (/^@(font-face|keyframes|-webkit-keyframes)\b/i.test(node.text)) out.push(node.text)
        continue
      }
      if (node.kind === 'block') {
        if (/^@media\b[^{]*\bprint\b/i.test(node.prelude) && !/\bscreen\b/i.test(node.prelude)) continue
        const inner = emitRules(node.children, false)
        if (inner.length) out.push(`${node.prelude} {\n${inner.join('\n')}\n}`)
        continue
      }
      const decls = parseDecls(node.body)
      if (!decls.length) continue
      const mapped = splitTop(node.selector, ',').map(mapSelector)
      const normal = mapped.filter((m): m is Extract<MappedSelector, { page: false }> => !!m && !m.page)
      if (mapped.some((m) => m?.page)) {
        const custom = decls.filter(([p]) => p.startsWith('--'))
        if (top) for (const [p, v] of custom) vars[p] = v
        if (custom.length) out.push(`:root[data-typora] { ${declText(custom)} }`)
        const bgDecls = decls.filter(([p]) => /^background/.test(p))
        const rest = decls.filter(([p]) => !p.startsWith('--') && !/^background/.test(p) && !PAGE_SKIP.test(p))
        if (top) {
          for (const [p, v] of bgDecls) pageBg = v
          for (const [p, v] of rest) if (p === 'color') pageText = v
        }
        if (bgDecls.length) out.push(`${PANE_SCOPE} { ${declText(bgDecls)} }`)
        if (rest.length) out.push(`${DOC_SCOPE} { ${declText(rest)} }`)
      }
      // #write 自身与其他选择器分开：#write 的布局属性由 MarkGo 管理
      const write = normal.filter((m) => m.write)
      const others = normal.filter((m) => !m.write)
      if (write.length) {
        const kept = decls.filter(([p]) => !WRITE_LAYOUT.test(p))
        if (top) for (const [p, v] of kept) if (/^background/.test(p)) writeBg = v
        if (kept.length) out.push(`${DOC_SCOPE} { ${declText(kept)} }`)
      }
      if (others.length) out.push(`${others.map((m) => m.selector).join(',\n')} { ${declText(decls)} }`)
    }
    return out
  }

  const rules = emitRules(nodes, true)
  const ui = deriveUiVars(vars, pageBg ?? writeBg, pageText)
  const css = [`:root[data-typora][data-theme] { ${declText(ui.decls)} }`, BASE_CSS, ...rules, AFTER_CSS].join('\n')
  return { css, dark: ui.dark }
}

// ---------- 加载 ----------

const THEME_PREFIX = '/mg-theme/'

/** 规范化主题目录内的相对路径（不允许越出主题目录） */
export function joinThemePath(base: string, rel: string): string {
  const parts = base ? base.split('/') : []
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

const themeUrl = (path: string) => THEME_PREFIX + path.split('/').map(encodeURIComponent).join('/')
const isExternal = (u: string) => /^([a-z][\w+.-]*:|\/|#)/i.test(u)

/** 读取主题文件：内联同目录中被 @import 的样式表，把相对 url() 改为 /mg-theme/ 地址 */
export async function loadThemeSource(path: string, fetchText: (url: string) => Promise<string>, depth = 0): Promise<string> {
  const base = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const text = stripComments(await fetchText(themeUrl(path)))
  const imports: string[] = []
  const IMPORT = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^'")\s;]+))\s*\)?[^;]*;/gi
  let out = text.replace(IMPORT, (_all, d?: string, s?: string, bare?: string) => {
    const href = (d ?? s ?? bare)!
    // 远程样式受内容安全策略限制；Typora 的图表与源码模式样式与 MarkGo 的结构不同，一并跳过
    if (isExternal(href) || depth >= 4 || /(mermaid|sourcemode)[^/]*\.css$/i.test(href)) return ''
    imports.push(joinThemePath(base, href))
    return `/*@mg-import ${imports.length - 1}*/`
  })
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, _q, href: string) => (isExternal(href) || /^data:/i.test(href) ? all : `url("${themeUrl(joinThemePath(base, href))}")`))
  const loaded = await Promise.all(imports.map((p) => loadThemeSource(p, fetchText, depth + 1).catch(() => '')))
  return out.replace(/\/\*@mg-import (\d+)\*\//g, (_, i: string) => loaded[Number(i)])
}

export async function loadTyporaTheme(id: string): Promise<CompiledTheme> {
  const source = await loadThemeSource(`${id}.css`, async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`无法读取主题文件（${res.status}）`)
    return res.text()
  })
  return compileTyporaTheme(source)
}
