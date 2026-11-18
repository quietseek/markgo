import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import { Subscript, Superscript } from '../src/lib/sub-sup'
import { HtmlBlock, HtmlInline, matchInlineHtml } from '../src/lib/html-node'
import { renderHtmlBlock, sanitizeHtml } from '../src/lib/sanitize'

const make = (md: string) =>
  new Editor({
    extensions: [StarterKit, Markdown, Image, Subscript, Superscript, HtmlBlock, HtmlInline],
    content: md,
    contentType: 'markdown'
  })
const types = (ed: Editor) => (ed.getJSON().content || []).map((n) => n.type)

describe('native html', () => {
  it('keeps html blocks verbatim', () => {
    const md = '# T\n\n<div align="center">\n  <img src="logo.png" width="20"> hi\n</div>\n\n正文'
    const ed = make(md)
    expect(types(ed)).toEqual(['heading', 'htmlBlock', 'paragraph'])
    expect(ed.getMarkdown()).toBe(md)
  })

  it('keeps a block spanning blank lines as one node', () => {
    const md = '<details>\n<summary>更多</summary>\n\n**内容**\n\n</details>\n\n后文'
    const ed = make(md)
    expect(types(ed)).toEqual(['htmlBlock', 'paragraph'])
    expect(ed.getMarkdown()).toBe(md)
    const html = renderHtmlBlock(ed.getJSON().content![0].attrs!.html)
    expect(html).toContain('<summary>更多</summary>')
    expect(html).toContain('<strong>内容</strong>')
  })

  it('keeps inline html and comments', () => {
    const md = '按 <kbd>Ctrl</kbd> 和 <span style="color:red">红 <b>字</b></span> <!-- note --> 结束'
    const ed = make(md)
    const inline = ed.getJSON().content![0].content!.filter((n) => n.type === 'htmlInline')
    expect(inline.map((n) => (n as { attrs: { html: string } }).attrs.html)).toEqual(['<kbd>Ctrl</kbd>', '<span style="color:red">红 <b>字</b></span>', '<!-- note -->'])
    expect(ed.getMarkdown()).toBe(md)
  })

  it('keeps badges and standalone images with attributes', () => {
    const md = '<a href="https://x.com"><img src="badge.svg" alt="b"></a> 文字 <img src="i.png" width="16">'
    expect(make(md).getMarkdown()).toBe(md)
  })

  it('leaves editable formatting tags and autolinks alone', () => {
    expect(matchInlineHtml('<sup>b c</sup>')).toBeUndefined()
    expect(matchInlineHtml('<a href="x">text</a>')).toBeUndefined()
    expect(matchInlineHtml('<https://a.com>')).toBeUndefined()
    expect(matchInlineHtml('<span>unclosed')).toBeUndefined()
    expect(matchInlineHtml('<span a="1>2">x<span>y</span></span>tail')).toBe('<span a="1>2">x<span>y</span></span>')
    const ed = make('a<sup>b c</sup> 与 <b>粗</b>')
    expect(ed.getHTML()).toContain('<sup>b c</sup>')
    expect(ed.getHTML()).toContain('<strong>粗</strong>')
  })

  it('does not treat html inside code as html', () => {
    const md = '`<div>x</div>`\n\n```html\n<div>\n\n</div>\n```'
    const ed = make(md)
    expect(types(ed)).toEqual(['paragraph', 'codeBlock'])
    expect(ed.getMarkdown()).toBe(md)
  })

  it('lets an html block interrupt a paragraph only at line start', () => {
    const ed = make('段落 <div>不是块</div>\n<details>\n<summary>s</summary>\n\n内容\n\n</details>')
    expect(types(ed)).toEqual(['paragraph', 'htmlBlock'])
    expect(ed.getJSON().content![0].content!.some((n) => n.type === 'htmlInline')).toBe(true)
  })

  it('strips scripts and handlers when rendering', () => {
    const out = sanitizeHtml('<img src="x.png" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">l</a><style>body{}</style>')
    expect(out).not.toMatch(/onerror|script|javascript|style/)
  })
})
