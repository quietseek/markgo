import { Node } from '@tiptap/core'

/**
 * 原生 HTML：Markdown 中的 HTML 块与行内 HTML 按原文保存为原子节点，编辑区渲染显示，保存时原样写回。
 * 不再交给 schema 解析，否则 <div align>、<details>、<kbd>、带 width 的 <img> 等会被拆散或丢弃。
 */

// CommonMark 第 6 类 HTML 块的标签
const BLOCK_TAGS =
  'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul'
const BLOCK_OPEN_RE = new RegExp(`^ {0,3}<(${BLOCK_TAGS})(?=[\\s/>])`, 'i')
// marked 打断段落时传入的是去掉首字符的源码，只能认换行之后的位置
const BLOCK_START_RE = new RegExp(`\\n {0,3}<(?:${BLOCK_TAGS})(?=[\\s/>])`, 'i')

// 编辑器已有对应格式的行内标签，继续解析为可编辑的标记
const MARK_TAGS = new Set(['br', 'sub', 'sup', 'mark', 's', 'del', 'strike', 'strong', 'b', 'em', 'i', 'u', 'code'])
const VOID_TAGS = new Set(['area', 'col', 'embed', 'hr', 'img', 'input', 'source', 'track', 'wbr'])
const ATTRS = `(?:\\s+[^\\s"'=<>\`/]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?)*`
const INLINE_OPEN_RE = new RegExp(`^<([a-zA-Z][\\w-]*)${ATTRS}\\s*(/?)>`)

/** 从 src 开头的开始标签起，找到与之配对的结束标签末尾（支持同名嵌套），找不到返回 -1 */
function matchClose(src: string, tag: string, from: number): number {
  const re = new RegExp(`<(/?)${tag}(?=[\\s/>])${ATTRS}\\s*(/?)>`, 'gi')
  re.lastIndex = from
  let depth = 1
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[2]) continue
    depth += m[1] ? -1 : 1
    if (!depth) return m.index + m[0].length
  }
  return -1
}

/** 行内 HTML 片段：注释、自闭合 / 空元素，或带配对结束标签的完整元素 */
export function matchInlineHtml(src: string): string | undefined {
  if (src.startsWith('<!--')) {
    const end = src.indexOf('-->', 4)
    return end < 0 ? undefined : src.slice(0, end + 3)
  }
  const m = INLINE_OPEN_RE.exec(src)
  if (!m) return
  const tag = m[1].toLowerCase()
  if (MARK_TAGS.has(tag)) return
  if (m[2] || VOID_TAGS.has(tag)) return m[0]
  const end = matchClose(src, tag, m[0].length)
  if (end < 0) return
  // 只含文字的 <a> 仍按链接处理，便于编辑；包着图片等标签时（如徽章）保留原文
  if (tag === 'a' && !src.slice(m[0].length, end).replace(/<\/a\s*>$/i, '').includes('<')) return
  return src.slice(0, end)
}

/**
 * HTML 块中间有空行时（如 <details> 里写 Markdown），CommonMark 会在空行处切开；
 * 这里把开始标签到配对结束标签整体作为一个块，渲染时再交给 Markdown 解析内部内容
 */
export function matchHtmlBlock(src: string): string | undefined {
  const m = BLOCK_OPEN_RE.exec(src)
  if (!m) return
  const end = matchClose(src, m[1].toLowerCase(), m[0].length)
  if (end < 0) return
  const nl = src.indexOf('\n', end)
  const lineEnd = nl < 0 ? src.length : nl
  if (src.slice(end, lineEnd).trim()) return
  const raw = src.slice(0, nl < 0 ? src.length : nl + 1)
  return /\n[ \t]*\n/.test(raw.trimEnd()) ? raw : undefined
}

const trimHtml = (html: string) => html.replace(/^\n+|\s+$/g, '')

export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { html: { default: '', rendered: false } }
  },

  parseHTML() {
    return [{ tag: 'div[data-html-block]', priority: 60, getAttrs: (el) => ({ html: (el as HTMLElement).getAttribute('data-html-block') || '' }) }]
  },

  renderHTML({ node }) {
    return ['div', { 'data-html-block': node.attrs.html }]
  },

  markdownTokenName: 'html',
  markdownTokenizer: {
    name: 'htmlBlockSpan',
    level: 'block',
    start: (src: string) => {
      const i = src.search(BLOCK_START_RE)
      return i < 0 ? -1 : i + 1
    },
    tokenize(src) {
      const raw = matchHtmlBlock(src)
      if (raw) return { type: 'html', raw, text: raw, block: true }
    }
  },

  parseMarkdown: (token) => {
    const html = trimHtml(token.text || token.raw || '')
    return token.block && html ? { type: 'htmlBlock', attrs: { html } } : []
  },

  renderMarkdown: (node) => (node.attrs?.html as string) || ''
})

export const HtmlInline = Node.create({
  name: 'htmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { html: { default: '', rendered: false } }
  },

  parseHTML() {
    return [{ tag: 'span[data-html-inline]', priority: 60, getAttrs: (el) => ({ html: (el as HTMLElement).getAttribute('data-html-inline') || '' }) }]
  },

  renderHTML({ node }) {
    return ['span', { 'data-html-inline': node.attrs.html }]
  },

  markdownTokenizer: {
    name: 'htmlInline',
    level: 'inline',
    start: (src: string) => src.indexOf('<'),
    tokenize(src) {
      const raw = matchInlineHtml(src)
      if (raw) return { type: 'htmlInline', raw, text: raw }
    }
  },

  parseMarkdown: (token) => ({ type: 'htmlInline', attrs: { html: token.raw } }),

  renderMarkdown: (node) => (node.attrs?.html as string) || ''
})
