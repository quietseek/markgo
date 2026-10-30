/**
 * Markdown -> 公众号富文本渲染管线。
 * sanitizeForWechat / scaledStyle / 各主题特殊处理移植自 MarkNice（MIT），
 * 改为纯函数：主题、字号与段距偏移通过参数传入。
 */
import { Marked } from 'marked'
import { texToSvg } from './math-svg'
import { INLINE_MATH_RE } from './math-re'
import { themes, tokenHeadingOptions, tokenHeadingStyle, type Theme } from './themes'

export interface RenderOptions {
  themeKey: string
  fontSizeOffset?: number
  paraSpacingOffset?: number
  /** 把外链转换为文末脚注（公众号正文不允许普通外链） */
  linkToFootnote?: boolean
  /** 改写图片地址（例如把相对路径映射为本地预览地址） */
  resolveImage?: (src: string) => string
}

const marked = new Marked({ gfm: true, breaks: false })
marked.use({
  extensions: [
    {
      name: 'blockMath',
      level: 'block',
      start: (src: string) => (src.includes('$$') ? src.indexOf('$$') : undefined),
      tokenizer(src: string) {
        const m = src.match(/^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/)
        if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() }
      },
      renderer: (token) => `<section data-math="block">${texToSvg(token.text, true)}</section>`
    },
    {
      name: 'inlineMath',
      level: 'inline',
      start: (src: string) => (src.includes('$') ? src.indexOf('$') : undefined),
      tokenizer(src: string) {
        const m = src.match(INLINE_MATH_RE)
        if (m) return { type: 'inlineMath', raw: m[0], text: m[1].trim() }
      },
      renderer: (token) => `<span data-math="inline">${texToSvg(token.text, false)}</span>`
    }
  ]
})

// mermaid 图表：复制 / 发布前由 prepareMermaid 预先渲染为 PNG，这里同步取用
const mermaidImages = new Map<string, string>()
export function setMermaidImage(code: string, dataUri: string) {
  if (mermaidImages.size > 100) mermaidImages.clear()
  mermaidImages.set(code, dataUri)
}
marked.use({
  renderer: {
    code(token) {
      const img = token.lang?.trim() === 'mermaid' && mermaidImages.get(token.text)
      return img ? `<p data-mermaid=""><img src="${img}" alt="图表"></p>` : false
    }
  }
})

/** 文档中所有 mermaid 代码块的源码（包括列表、引用中的） */
export function findMermaidBlocks(md: string): string[] {
  const out: string[] = []
  marked.walkTokens(marked.lexer(stripFrontMatter(md)), (t) => {
    if (t.type === 'code' && t.lang?.trim() === 'mermaid' && t.text.trim()) out.push(t.text)
  })
  return [...new Set(out)]
}

export function markdownToHtml(md: string): string {
  return marked.parse(stripFrontMatter(md), { async: false }) as string
}

export function stripFrontMatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

export function scaledStyle(styleText: string, fontOffset = 0, spacingOffset = 0): string {
  let s = styleText
  if (fontOffset) s = s.replace(/font-size:(\d+)px/g, (_, n) => `font-size:${Math.max(Number(n) + fontOffset, 9)}px`)
  if (spacingOffset) {
    s = s.replace(/margin:([-\d]+)px ([-\d]+(?:px)?) ([-\d]+)px/g, (_, top, mid, bot) =>
      `margin:${Math.max(Number(top) + spacingOffset, 0)}px ${mid} ${Math.max(Number(bot) + spacingOffset, 0)}px`
    )
    s = s.replace(/margin:([-\d]+)px ([-\d]+(?:px)?) ([-\d]+)px ([-\d]+(?:px)?)/g, (_, top, h1, bot, h2) =>
      `margin:${Math.max(Number(top) + spacingOffset, 0)}px ${h1} ${Math.max(Number(bot) + spacingOffset, 0)}px ${h2}`
    )
  }
  return s
}

function applyInlineStyles(container: Element, styleMap: Record<string, string>, fontOffset: number, spacingOffset: number) {
  Object.entries(styleMap).forEach(([tag, style]) => {
    const styleWithScale = scaledStyle(style, fontOffset, spacingOffset)
    container.querySelectorAll(tag).forEach((el) => {
      const prev = el.getAttribute('style') || ''
      el.setAttribute('style', prev ? `${prev};${styleWithScale}` : styleWithScale)
    })
  })
}

function detectHeadingNumberPrefix(text: string): { value: string; length: number } | null {
  const patterns = [
    /^\s*[（(]\s*([0-9]{1,2}|[一二三四五六七八九十百]+)\s*[)）][、.．:：]?\s*/,
    /^\s*([0-9]{1,2}|[一二三四五六七八九十百]+)\s*[、.．:：]\s*/,
    /^\s*([0-9]{1,2})\s+/
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return { value: match[1], length: match[0].length }
  }
  return null
}

function stripTextPrefix(node: Node, count: number): number {
  if (!count) return 0
  Array.from(node.childNodes).forEach((child) => {
    if (!count) return
    if (child.nodeType === 3) {
      const text = child.nodeValue || ''
      if (text.length <= count) {
        count -= text.length
        child.nodeValue = ''
      } else {
        child.nodeValue = text.slice(count)
        count = 0
      }
    } else if (child.nodeType === 1) {
      count = stripTextPrefix(child, count)
    }
  })
  return count
}

function createWarmredCircle(label: string, block: boolean): string {
  const outerStyle = block
    ? 'display:block;text-align:center;margin-bottom:8px;'
    : 'display:inline-block;vertical-align:middle;margin-right:10px;'
  const circleStyle = block
    ? "display:inline-block;box-sizing:border-box;width:52px;height:52px;line-height:48px;border:2px solid #c0392b;border-radius:50%;background:transparent;color:#c0392b;font-size:24px;font-weight:900;text-align:center;font-family:'DIN Alternate','Impact','Arial Black',sans-serif;letter-spacing:1px;"
    : "display:inline-block;box-sizing:border-box;min-width:40px;height:40px;line-height:36px;padding:0 8px;border:2px solid #c0392b;border-radius:999px;background:transparent;color:#c0392b;font-size:16px;font-weight:900;text-align:center;font-family:'DIN Alternate','Impact','Arial Black',sans-serif;letter-spacing:0;"
  return `<span style="${outerStyle}"><span style="${circleStyle}">${label}</span></span>`
}

/** 外链转脚注：正文保留文字 + 上标序号，文末追加「参考链接」 */
function linksToFootnotes(doc: Document, root: Element, theme: Theme) {
  const links = Array.from(root.querySelectorAll('a[href]')).filter((a) => {
    const href = a.getAttribute('href') || ''
    return /^https?:/i.test(href) && !/^https?:\/\/mp\.weixin\.qq\.com\//i.test(href) && a.textContent?.trim() !== href
  })
  if (!links.length) return
  const accent = theme.accent || '#576b95'
  const items: string[] = []
  links.forEach((a, i) => {
    const sup = doc.createElement('sup')
    sup.setAttribute('style', `color:${accent};font-size:12px;`)
    sup.textContent = `[${i + 1}]`
    const span = doc.createElement('span')
    span.setAttribute('style', `color:${accent};`)
    span.innerHTML = a.innerHTML
    a.replaceWith(span, sup)
    items.push(`${a.textContent || ''}: ${a.getAttribute('href')}`)
  })
  const section = doc.createElement('section')
  section.innerHTML =
    `<p style="margin:28px 0 8px;font-size:14px;font-weight:700;color:${accent};">参考链接</p>` +
    items
      .map(
        (t, i) =>
          `<p style="margin:4px 0;font-size:12px;line-height:1.7;color:#888;word-break:break-all;">[${i + 1}] ${escapeHtml(t)}</p>`
      )
      .join('')
  root.appendChild(section)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 把 HTML 片段转换为可直接粘贴/提交到公众号的内联样式 HTML */
export function sanitizeForWechat(html: string, opts: RenderOptions): string {
  const themeKey = themes[opts.themeKey] ? opts.themeKey : 'simple'
  const theme = themes[themeKey]
  const offset = opts.fontSizeOffset || 0
  const paraSpacingOffset = opts.paraSpacingOffset || 0
  const doc = new DOMParser().parseFromString(`<section>${html}</section>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  root.setAttribute('style', theme.section)
  root.querySelectorAll('script,style,iframe,object,embed').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    ;[...el.attributes].forEach((attr) => {
      const n = attr.name.toLowerCase()
      if (n.startsWith('on') || n === 'id' || n === 'class') el.removeAttribute(attr.name)
    })
  })
  // 任务列表：公众号会过滤 <input>，替换为字符
  root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    const next = input.nextSibling
    if (next?.nodeType === 3) next.nodeValue = (next.nodeValue || '').replace(/^\s+/, '')
    input.replaceWith(doc.createTextNode(input.hasAttribute('checked') ? '☑ ' : '☐ '))
  })
  root.querySelectorAll('li').forEach((li) => {
    if (/^[☑☐]/.test(li.textContent || '')) li.setAttribute('style', 'list-style:none;')
  })
  if (opts.resolveImage) {
    root.querySelectorAll('img').forEach((img) => img.setAttribute('src', opts.resolveImage!(img.getAttribute('src') || '')))
  }
  if (opts.linkToFootnote) linksToFootnotes(doc, root, theme)

  applyInlineStyles(root, theme.styles, offset, paraSpacingOffset)
  root.querySelectorAll('[data-math]').forEach((el) => {
    el.setAttribute(
      'style',
      el.getAttribute('data-math') === 'block' ? 'margin:1em 0;text-align:center;overflow-x:auto;' : 'display:inline-block;max-width:100%;'
    )
    el.removeAttribute('data-math')
  })
  root.querySelectorAll('[data-mermaid]').forEach((el) => {
    el.setAttribute('style', 'margin:1em 0;text-align:center;')
    el.querySelector('img')?.setAttribute('style', 'display:inline-block;max-width:100%;height:auto;margin:0;')
    el.removeAttribute('data-mermaid')
  })
  root.querySelectorAll('pre code').forEach((el) => {
    el.setAttribute(
      'style',
      'background:none;padding:0;border-radius:0;font-size:inherit;font-family:Menlo,Consolas,monospace;white-space:inherit;word-break:inherit;overflow-wrap:inherit;color:inherit;'
    )
  })
  // 防止公众号编辑器把列表/表格中的行首 code、strong 断行
  root.querySelectorAll('li code, td code, th code').forEach((el) => {
    if (el.closest('pre')) return
    el.parentNode!.insertBefore(doc.createTextNode('‎'), el)
  })
  root.querySelectorAll('li strong, td strong, th strong, li b, td b, th b').forEach((el) => {
    if (el.previousSibling) return
    el.parentNode!.insertBefore(doc.createTextNode('‎'), el)
  })

  if (themeKey === 'amber') {
    root.querySelectorAll('h1, h2').forEach((el) => {
      const wrapper = doc.createElement('div')
      wrapper.setAttribute('style', 'text-align:center;margin:0;padding:0;')
      el.parentNode!.insertBefore(wrapper, el)
      wrapper.appendChild(el)
    })
    root.querySelectorAll('ol').forEach((ol) => {
      ol.setAttribute('style', (ol.getAttribute('style') || '') + ';list-style:none;padding-left:0;')
      ol.querySelectorAll(':scope > li').forEach((li, i) => {
        li.innerHTML = `<span style="color:#c8722a;font-weight:700;">${i + 1}、</span>` + li.innerHTML
      })
    })
  }

  if (themeKey === 'warmred') {
    let headingCounter = 0
    const h1List = Array.from(root.querySelectorAll('h1'))
    const hasOnlyOpeningTitle = h1List.length === 1 && h1List[0] === root.firstElementChild
    const headingTag = h1List.length && !hasOnlyOpeningTitle ? 'h1' : 'h2'
    const baseTopMargin = headingTag === 'h1' ? 36 : 32
    const baseBottomMargin = headingTag === 'h1' ? 18 : 16
    const headingTopMargin = Math.max((baseTopMargin + paraSpacingOffset) * 2, 0)
    const headingBottomMargin = Math.max((baseBottomMargin + paraSpacingOffset) / 2, 0)
    root.querySelectorAll(headingTag).forEach((el) => {
      const numbered = detectHeadingNumberPrefix(el.textContent || '')
      const wrapper = doc.createElement('div')
      wrapper.setAttribute('style', `text-align:center;margin:${headingTopMargin}px 0 ${headingBottomMargin}px;padding:0;`)
      el.parentNode!.insertBefore(wrapper, el)
      wrapper.appendChild(el)
      const headingStyle = (el.getAttribute('style') || '').replace(/margin:[^;]+;?/g, '')
      el.setAttribute('style', `${headingStyle};margin:0;`)
      if (numbered) {
        const numericValue = /^[0-9]+$/.test(numbered.value) ? Number(numbered.value) : null
        headingCounter = numericValue || headingCounter + 1
        stripTextPrefix(el, numbered.length)
        el.insertAdjacentHTML('afterbegin', createWarmredCircle(numbered.value, false))
      } else {
        headingCounter++
        wrapper.insertAdjacentHTML('afterbegin', createWarmredCircle(String(headingCounter).padStart(2, '0'), true))
      }
    })
  }

  if (theme.headingVariant === 'ribbon') {
    root.querySelectorAll('h1,h2').forEach((h) => {
      const o = tokenHeadingOptions(h.tagName)
      const wrapper = doc.createElement('section')
      wrapper.setAttribute('style', scaledStyle(tokenHeadingStyle(theme as never, o), offset, paraSpacingOffset))
      const label = doc.createElement('section')
      label.setAttribute(
        'style',
        scaledStyle(
          `display:inline-block;box-sizing:border-box;max-width:88%;padding:${o.bgPadding};background:${theme.headingBg || theme.accent};border-radius:${o.bgRadius}px ${o.bgRadius}px 0 0;color:${theme.headingText || '#ffffff'};font-size:${o.fontSize}px;line-height:${o.lineHeight};font-weight:${o.fontWeight};letter-spacing:0;vertical-align:bottom;`,
          offset,
          paraSpacingOffset
        )
      )
      label.textContent = h.textContent || ''
      const tail = doc.createElement('span')
      tail.setAttribute(
        'style',
        `display:inline-block;width:0;height:0;border-left:${o.tailWidth}px solid ${theme.headingTailBg || '#e5e7eb'};border-top:${o.tailHeight}px solid transparent;vertical-align:bottom;`
      )
      wrapper.appendChild(label)
      wrapper.appendChild(tail)
      h.replaceWith(wrapper)
    })
  }
  return root.outerHTML
}

export function renderWechat(md: string, opts: RenderOptions): string {
  return sanitizeForWechat(markdownToHtml(md), opts)
}

/** 标题：front matter title > 第一个标题 > 第一行文字 */
export function extractTitle(md: string): string {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const fmTitle = fm?.[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]
  if (fmTitle) return fmTitle
  const body = stripFrontMatter(md)
  const heading = body.match(/^#{1,6}\s+(.+?)\s*#*$/m)?.[1]
  if (heading) return stripInline(heading)
  const first = body.split(/\r?\n/).find((l) => l.trim())
  return first ? stripInline(first.replace(/^[>+\-*]\s+/, '')).slice(0, 64) : ''
}

/** 摘要：优先取正文段落的纯文本，没有段落时退化为列表/引用内容 */
export function extractDigest(md: string, max = 120): string {
  const lines = stripFrontMatter(md)
    .replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^!\[/.test(l) && !/^\|/.test(l) && !/^([-*_]\s*){3,}$/.test(l))
  const isBlock = (l: string) => /^([-*+]|\d+[.)]|>)\s/.test(l)
  const paragraphs = lines.filter((l) => !isBlock(l))
  const source = paragraphs.length ? paragraphs : lines.map((l) => l.replace(/^([-*+]|\d+[.)]|>)\s+(\[[ xX]\]\s+)?/, ''))
  return source.map(stripInline).join(' ').slice(0, max)
}

/** 去掉正文中第一个与文章标题相同的一级标题（公众号会单独展示标题） */
export function removeTitleHeading(md: string, title: string): string {
  const target = stripInline(title)
  let removed = false
  return md.replace(/^#[ \t]+(.+?)[ \t#]*(\r?\n|$)/gm, (line, text: string) => {
    if (removed || stripInline(text) !== target) return line
    removed = true
    return ''
  })
}

export function stripInline(text: string): string {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\((?:[^()\\]|\\.)*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()\\]|\\.)*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countWords(md: string): number {
  const text = stripFrontMatter(md).replace(/```[\s\S]*?```/g, '').replace(/[#>*_`~\-|[\]()!]/g, ' ')
  const cjk = text.match(/[一-鿿㐀-䶿豈-﫿]/g)?.length || 0
  const words = text.replace(/[一-鿿㐀-䶿豈-﫿]/g, ' ').match(/[A-Za-z0-9]+/g)?.length || 0
  return cjk + words
}

export function firstImageSrc(md: string): string | undefined {
  return stripFrontMatter(md).match(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/)?.[1]
}
