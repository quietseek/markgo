import { markdownToHtml } from './render'
import { resolveDisplaySrc } from './assets'

/** 移除脚本、样式表、内嵌页面与事件属性，本地图片走 /mg-asset/ 地址 */
export function sanitizeHtml(html: string, opts: { blankLinks?: boolean } = {}): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild!
  root.querySelectorAll('script,style,iframe,frame,frameset,object,embed,form,link,meta,base').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        name === 'formaction' ||
        (/^(href|src|xlink:href|action|poster)$/.test(name) && /^\s*(javascript|vbscript):/i.test(attr.value))
      )
        el.removeAttribute(attr.name)
    }
  })
  root.querySelectorAll('img').forEach((img) => img.setAttribute('src', resolveDisplaySrc(img.getAttribute('src'))))
  if (opts.blankLinks) root.querySelectorAll('a').forEach((a) => a.setAttribute('target', '_blank'))
  return root.innerHTML
}

/** 渲染 Agent 输出的 Markdown */
export function renderAgentMarkdown(md: string): string {
  return sanitizeHtml(markdownToHtml(md), { blankLinks: true })
}

/** 渲染文档中的原生 HTML 块：块内空行之间的 Markdown 也一并渲染（与 GitHub 一致） */
export function renderHtmlBlock(raw: string): string {
  return sanitizeHtml(markdownToHtml(raw))
}
