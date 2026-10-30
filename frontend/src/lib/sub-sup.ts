import SubscriptBase from '@tiptap/extension-subscript'
import SuperscriptBase from '@tiptap/extension-superscript'

/**
 * 上下标：与 Typora / Pandoc 一致，H~2~O、x^2^。
 * 内容不能含空白，避免把普通文字中的 ~ 与 ^ 误认为上下标（如 x^2 + y^2）；~~删除线~~ 不受影响
 */
export const SUB_RE = /^~(?!~)([^\s~]+)~(?!~)/
export const SUP_RE = /^\^([^\s^]+)\^/

/**
 * 内容含空白、无法写成 ~x~ / ^x^ 时退回 HTML 标签。
 * 标记跨多段文本时，序列化器用占位内容取开闭符号，实际文字在 meta.markText 中
 */
const wrap = (mark: string, tag: string) => (node: unknown, h: { renderChildren(n: unknown): string }, ctx?: { meta?: { markText?: string } }) => {
  const inner = h.renderChildren(node)
  const text = ctx?.meta?.markText ?? inner
  return /^[^\s~^]+$/.test(text) ? `${mark}${inner}${mark}` : `<${tag}>${inner}</${tag}>`
}

export const Subscript = SubscriptBase.extend({
  renderMarkdown: wrap('~', 'sub'),
  parseMarkdown: (token, h) => h.applyMark('subscript', h.parseInline(token.tokens || [])),
  markdownTokenizer: {
    name: 'subscript',
    level: 'inline',
    start: (src: string) => src.search(/~(?!~)/),
    tokenize(src, _, h) {
      const m = SUB_RE.exec(src)
      if (m) return { type: 'subscript', raw: m[0], text: m[1], tokens: h.inlineTokens(m[1]) }
    }
  }
})

export const Superscript = SuperscriptBase.extend({
  renderMarkdown: wrap('^', 'sup'),
  parseMarkdown: (token, h) => h.applyMark('superscript', h.parseInline(token.tokens || [])),
  markdownTokenizer: {
    name: 'superscript',
    level: 'inline',
    start: (src: string) => src.indexOf('^'),
    tokenize(src, _, h) {
      const m = SUP_RE.exec(src)
      if (m) return { type: 'superscript', raw: m[0], text: m[1], tokens: h.inlineTokens(m[1]) }
    }
  }
})
