/**
 * Mermaid 图表：编辑区实时渲染，复制 / 发布 / 导出时转为 PNG。
 * mermaid 体积较大，首次用到时再加载。
 */
import { findMermaidBlocks, setMermaidImage } from './render'

type MermaidApi = typeof import('mermaid').default

let loader: Promise<MermaidApi> | null = null
let initializedDark: boolean | null = null
let seq = 0
/** mermaid.render 共用全局配置，不能并发 */
let queue: Promise<unknown> = Promise.resolve()
const svgCache = new Map<string, string>()

function load(): Promise<MermaidApi> {
  loader ??= import('mermaid').then((m) => m.default)
  return loader
}

/** 渲染为 SVG 字符串；语法错误时抛出 */
export function renderMermaidSvg(code: string, dark = false): Promise<string> {
  const key = `${dark ? 'd' : 'l'}:${code}`
  const hit = svgCache.get(key)
  if (hit) return Promise.resolve(hit)
  const task = queue.then(async () => {
    const mermaid = await load()
    if (initializedDark !== dark) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
        // 不用 foreignObject 渲染文字，导出 PNG 时画布才不会被污染
        htmlLabels: false,
        suppressErrorRendering: true,
        flowchart: { htmlLabels: false },
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
      })
      initializedDark = dark
    }
    const id = `mermaid-${++seq}`
    let svg: string
    try {
      ;({ svg } = await mermaid.render(id, code))
    } finally {
      // 渲染失败时 mermaid 可能在 body 留下临时节点
      document.getElementById(`d${id}`)?.remove()
    }
    if (svgCache.size > 200) svgCache.clear()
    svgCache.set(key, svg)
    return svg
  })
  queue = task.catch(() => {})
  return task
}

/** SVG 的像素尺寸（取 viewBox） */
function svgSize(svg: string): { width: number; height: number } {
  const box = svg.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/)
  return box ? { width: Number(box[1]), height: Number(box[2]) } : { width: 800, height: 600 }
}

/** SVG 转 PNG data URI（白底，默认 2 倍分辨率） */
export async function svgToPng(svg: string, scale = 2): Promise<string> {
  const { width, height } = svgSize(svg)
  // mermaid 输出 width="100%"，需要写明尺寸才能按原大小绘制
  const sized = svg.replace(/<svg\b([^>]*)>/, (_, attrs: string) => {
    const rest = attrs.replace(/\s(width|height)="[^"]*"/g, '').replace(/\sstyle="[^"]*"/, '')
    return `<svg${rest} width="${width}" height="${height}">`
  })
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

/** 复制 / 发布 / 导出前调用：把文档中的 mermaid 代码块预先渲染为图片，渲染管线会用图片替换代码 */
export async function prepareMermaid(md: string): Promise<void> {
  for (const code of findMermaidBlocks(md)) {
    try {
      setMermaidImage(code, await svgToPng(await renderMermaidSvg(code)))
    } catch {
      /* 语法错误的图表保留为代码块 */
    }
  }
}
