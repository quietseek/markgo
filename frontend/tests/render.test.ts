import { describe, expect, it } from 'vitest'
import { removeTitleHeading, extractDigest, extractTitle, findMermaidBlocks, firstImageSrc, renderWechat, scaledStyle, setMermaidImage, countWords } from '@renderer/lib/render'
import { themeList, themes } from '@renderer/lib/themes'

const SAMPLE = `# 一、开篇标题

正文段落，含 **加粗**、*斜体*、\`code\` 与 [链接](https://example.com)。

## 2. 第二节

- 列表项 **重点**
- [x] 已完成

1. 第一
2. 第二

> 引用

\`\`\`js
const a = 1
\`\`\`

| 列1 | 列2 |
| --- | --- |
| a | b |

![图](assets/a.png)
`

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.firstElementChild as HTMLElement

describe('marknice themes', () => {
  it('ships the 15 themes from marknice', () => {
    expect(themeList).toHaveLength(15)
    for (const t of themeList) expect(themes[t.key], t.key).toBeDefined()
  })

  it.each(themeList.map((t) => t.key))('renders %s with inline styles only', (key) => {
    const root = parse(renderWechat(SAMPLE, { themeKey: key }))
    expect(root.tagName).toBe('SECTION')
    expect(root.getAttribute('style')).toContain('font-family')
    expect(root.querySelector('[class]')).toBeNull()
    expect(root.querySelector('input')).toBeNull()
    for (const p of root.querySelectorAll('p')) expect(p.getAttribute('style')).toBeTruthy()
    expect(root.querySelector('blockquote')!.getAttribute('style')).toContain('margin')
  })

  it('applies theme specific decorations', () => {
    const vivid = parse(renderWechat(SAMPLE, { themeKey: 'vivid' }))
    expect(vivid.querySelector('h1,h2')).toBeNull() // ribbon 替换为 section
    const amber = parse(renderWechat(SAMPLE, { themeKey: 'amber' }))
    expect(amber.querySelector('ol li span')!.textContent).toBe('1、')
    const warm = parse(renderWechat(SAMPLE, { themeKey: 'warmred' }))
    // 仅有开篇 H1 时按 H2 编号：“2. 第二节” 的前缀被转换成圆形徽标
    const h2 = warm.querySelector('h2')!
    expect(h2.querySelector('span span')!.textContent).toBe('2')
    expect(h2.textContent).toBe('2第二节')
    expect(h2.innerHTML).toContain('border:2px solid #c0392b')
  })
})

describe('render options', () => {
  it('scales font size and spacing', () => {
    expect(scaledStyle('font-size:16px;margin:10px 0 12px;', 2, 4)).toBe('font-size:18px;margin:14px 0 16px;')
  })

  it('converts external links to footnotes', () => {
    const root = parse(renderWechat(SAMPLE, { themeKey: 'claude', linkToFootnote: true }))
    expect(root.querySelector('a')).toBeNull()
    expect(root.textContent).toContain('参考链接')
    expect(root.textContent).toContain('[1] 链接: https://example.com')
  })

  it('rewrites image src via resolver', () => {
    const root = parse(renderWechat(SAMPLE, { themeKey: 'claude', resolveImage: (s) => `x://${s}` }))
    expect(root.querySelector('img')!.getAttribute('src')).toBe('x://assets/a.png')
  })

  it('turns task checkboxes into characters', () => {
    const root = parse(renderWechat(SAMPLE, { themeKey: 'simple' }))
    expect(root.textContent).toContain('☑ 已完成')
  })
})

describe('metadata helpers', () => {
  it('extracts title, digest, cover', () => {
    expect(extractTitle(SAMPLE)).toBe('一、开篇标题')
    expect(extractTitle('---\ntitle: 前言\n---\n# 其他')).toBe('前言')
    expect(extractDigest(SAMPLE)).toBe('正文段落，含 加粗、斜体、code 与 链接。')
    expect(extractDigest('# T\n\n- [ ] 待办一\n- 列表二\n\n```\ncode line\n```')).toBe('待办一 列表二')
    expect(firstImageSrc(SAMPLE)).toBe('assets/a.png')
    expect(countWords('你好 world')).toBe(3)
  })
})

describe('removeTitleHeading', () => {
  it('removes only the first H1 matching the title', () => {
    const md = '![x](a.png)\n# 标题\n\n正文\n\n# 标题\n## 标题'
    expect(removeTitleHeading(md, '标题')).toBe('![x](a.png)\n\n正文\n\n# 标题\n## 标题')
    expect(removeTitleHeading('# 其他\n正文', '标题')).toBe('# 其他\n正文')
  })
})

describe('math', () => {
  it('renders block and inline math as svg, leaves prices alone', async () => {
    const { markdownToHtml } = await import('../src/lib/render')
    const html = markdownToHtml('价格 $5 和 $10。\n\n质能方程 $E=mc^2$ 很有名。\n\n$$\n\\frac{a}{b}\n$$\n')
    expect(html).toContain('$5 和 $10')
    expect(html).toContain('<span data-math="inline"><svg')
    expect(html).toContain('<section data-math="block"><svg')
  })
})

describe('mermaid', () => {
  const md = '# T\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n> ```mermaid\n> graph TD\n>   X --> Y\n> ```\n\n```js\nlet a\n```\n'

  it('finds mermaid blocks, including nested ones', () => {
    expect(findMermaidBlocks(md)).toEqual(['graph LR\n  A --> B', 'graph TD\n  X --> Y'])
  })

  it('renders prepared diagrams as images and leaves others as code', () => {
    setMermaidImage('graph LR\n  A --> B', 'data:image/png;base64,AAAA')
    const html = renderWechat(md, { themeKey: 'simple' })
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).not.toContain('A --&gt; B')
    // 未预渲染（例如语法错误）的图表保留为代码
    expect(html).toContain('X --&gt; Y')
    expect(html).toContain('let a')
  })
})

describe('sub / superscript', () => {
  it('renders ~x~ and ^x^ without breaking strikethrough', () => {
    const html = renderWechat('H~2~O，x^2^，~~删除~~，x^2 + y^2', { themeKey: themeList[0].key })
    const body = parse(html)
    expect(body.querySelector('sub')?.textContent).toBe('2')
    expect(body.querySelector('sup')?.textContent).toBe('2')
    expect(body.querySelector('del, s')?.textContent).toBe('删除')
    expect(body.textContent).toContain('x^2 + y^2')
  })
})
