/** 导出 PDF：按编辑区当前的样式（排版主题 / Typora 主题 / 原生样式）直接生成 PDF，不弹出打印对话框 */

import type { ExportConfig, MarginPreset } from '@shared/types'

const STYLE_ID = 'mk-print-pdf'

/** 纵向尺寸（毫米），与 Go 侧 pdfprint.PaperSizes 一致。 */
export const PAPER_SIZES: { key: ExportConfig['paperSize']; label: string; width: number; height: number; hint: string }[] = [
  { key: 'a4', label: 'A4', width: 210, height: 297, hint: '210 × 297 mm' },
  { key: 'a3', label: 'A3', width: 297, height: 420, hint: '297 × 420 mm' },
  { key: 'a5', label: 'A5', width: 148, height: 210, hint: '148 × 210 mm' },
  { key: 'b5', label: 'B5', width: 176, height: 250, hint: '176 × 250 mm' },
  { key: 'b4', label: 'B4', width: 250, height: 353, hint: '250 × 353 mm' },
  { key: 'letter', label: 'Letter', width: 215.9, height: 279.4, hint: '8.5 × 11 in' },
  { key: 'legal', label: 'Legal', width: 215.9, height: 355.6, hint: '8.5 × 14 in' }
]

export function pageLayout(config: Pick<ExportConfig, 'paperSize' | 'landscape' | 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight'>) {
  const paper = PAPER_SIZES.find((p) => p.key === config.paperSize) ?? PAPER_SIZES[0]
  const width = config.landscape ? paper.height : paper.width
  const height = config.landscape ? paper.width : paper.height
  const top = config.marginTop * 10
  const bottom = config.marginBottom * 10
  const left = config.marginLeft * 10
  const right = config.marginRight * 10
  const contentWidth = Math.max(0, width - left - right)
  const contentHeight = Math.max(0, height - top - bottom)
  // 与 PDF 导出校验一致：正文宽高至少 20 mm。
  const valid = [top, bottom, left, right].every((m) => Number.isFinite(m) && m >= 0) && contentWidth >= 20 && contentHeight >= 20
  return { paper, width, height, top, bottom, left, right, contentWidth, contentHeight, valid }
}

/** 常用页边距（厘米，与 Word 的预设一致） */
export const MARGIN_PRESETS: { key: Exclude<MarginPreset, 'custom'>; label: string; top: number; bottom: number; left: number; right: number }[] = [
  { key: 'normal', label: '常规', top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 },
  { key: 'narrow', label: '窄', top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 },
  { key: 'moderate', label: '适中', top: 2.54, bottom: 2.54, left: 1.91, right: 1.91 },
  { key: 'wide', label: '宽', top: 2.54, bottom: 2.54, left: 5.08, right: 5.08 }
]

/** 深色主题下不能导出 PDF（会打印出深色背景） */
export function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

/** 是否为有内容的正文块（不计 front matter 与空段落） */
function hasContent(el: Element): boolean {
  if (el.matches('.front-matter')) return false
  return !!el.textContent?.trim() || !!el.querySelector('img, svg, table, hr, iframe, video') || el.matches('hr, table')
}

/**
 * 一级标题分页：每个一级标题另起一页；文档开头（前面没有正文）的一级标题不分页，避免出现空白首页。
 * 用 nth-child 选择器指定，不改动编辑器的 DOM。
 */
export function h1BreakCss(root: Element | null): string {
  if (!root) return ''
  const selectors: string[] = []
  let seenContent = false
  Array.from(root.children).forEach((el, i) => {
    if (el.tagName === 'H1' && seenContent) selectors.push(`.prose-editor > :nth-child(${i + 1})`)
    if (hasContent(el)) seenContent = true
  })
  return selectors.length ? `@media print { ${selectors.join(', ')} { break-before: page !important; } }` : ''
}

/**
 * 在打印样式就绪后执行 run（调用 Go 侧生成 PDF），结束后恢复。
 * 页面大小与边距由 Go 侧的打印设置决定，这里不写 @page，以免与之叠加。
 */
export async function withPrintStyle<T>(config: Pick<ExportConfig, 'pageBreakH1'>, run: () => Promise<T>): Promise<T> {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = config.pageBreakH1 ? h1BreakCss(document.querySelector('.prose-editor')) : ''
  // 不打印光标与选区
  ;(document.activeElement as HTMLElement | null)?.blur()
  window.getSelection()?.removeAllRanges()
  try {
    return await run()
  } finally {
    el.textContent = ''
  }
}
