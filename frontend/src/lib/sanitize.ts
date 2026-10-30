import { markdownToHtml } from './render'
import { resolveDisplaySrc } from './assets'

/** 渲染 Agent 输出的 Markdown：移除脚本与事件属性，本地图片走 /mg-asset/ 地址 */
export function renderAgentMarkdown(md: string): string {
  const doc = new DOMParser().parseFromString(`<div>${markdownToHtml(md)}</div>`, 'text/html')
  const root = doc.body.firstElementChild!
  root.querySelectorAll('script,style,iframe,object,embed,form,link,meta').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name)
    }
  })
  root.querySelectorAll('img').forEach((img) => img.setAttribute('src', resolveDisplaySrc(img.getAttribute('src'))))
  root.querySelectorAll('a').forEach((a) => a.setAttribute('target', '_blank'))
  return root.innerHTML
}
