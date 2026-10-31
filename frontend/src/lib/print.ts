/** 打印为 PDF：按编辑区当前的样式（排版主题 / Typora 主题 / 原生样式）打印正文，可在系统打印对话框中存储为 PDF */

const PAGE_STYLE_ID = 'mk-print-page'

export interface PrintOptions {
  /** 默认的 PDF 文件名（取自文档标题） */
  title: string
  paperSize: 'a3' | 'a4' | 'a5' | 'b4' | 'b5' | 'letter' | 'legal'
  landscape?: boolean
  /** 页边距（CSS 长度，如 2.5cm） */
  margin: string
}

const CSS_LENGTH = /^\d+(\.\d+)?(cm|mm|in|pt|px|pc|q)$/i

const CSS_PAGE_SIZES: Record<string, string> = { a3: 'A3', a4: 'A4', a5: 'A5', b4: 'B4', b5: 'B5', letter: 'letter', legal: 'legal' }

export function pageCss({ paperSize, landscape, margin }: Pick<PrintOptions, 'paperSize' | 'landscape' | 'margin'>): string {
  const m = CSS_LENGTH.test(margin.trim()) ? margin.trim() : '2cm'
  return `@page { size: ${CSS_PAGE_SIZES[paperSize] ?? 'A4'}${landscape ? ' landscape' : ''}; margin: ${m}; }`
}

export async function printDocument(opts: PrintOptions): Promise<void> {
  let el = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = PAGE_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = pageCss(opts)

  // 打印对话框以页面标题作为默认文件名，结束后恢复
  const prevTitle = document.title
  document.title = opts.title || prevTitle
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    document.title = prevTitle
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.setTimeout(restore, 5 * 60 * 1000)

  // 不打印光标与选区
  ;(document.activeElement as HTMLElement | null)?.blur()
  window.getSelection()?.removeAllRanges()
  try {
    await window.markgo.window.print()
  } catch (err) {
    restore()
    throw err
  }
}
