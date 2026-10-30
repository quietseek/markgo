/**
 * 把公众号排版主题（MarkNice 内联样式表）转换为作用于编辑器的 CSS，
 * 让 Tiptap 所见即所得直接呈现文章的最终版式。
 *
 * 发布管线中的结构改写（活力红的飘带标题、暖阳红的圆圈编号、琥珀橙的序号）
 * 无法改动 ProseMirror 管理的 DOM，这里用伪元素与 CSS 计数器近似实现。
 */
import { scaledStyle } from './render'
import { themes, tokenHeadingOptions } from './themes'

export const EDITOR_THEME_DEFAULT = 'default'
export const EDITOR_THEME_SYNC = 'sync'

const ROOT = '.mk-themed .ProseMirror'

/** 'sync' 跟随排版主题；'default' 或未知主题返回 null（使用原生编辑器样式） */
export function resolveEditorTheme(editorTheme: string, layoutTheme: string): string | null {
  const key = editorTheme === EDITOR_THEME_SYNC ? layoutTheme : editorTheme
  return themes[key] ? key : null
}

const PAPER_VARS_LIGHT =
  '--text:#555;--text-strong:#2b2b2b;--text-muted:#999;--surface-hover:#f3f3f3;--surface-muted:#f8f8f8;--border:#eee;--border-strong:#ddd;--ghost:#c0c0c0;--mark:#fff1a8;--primary:#1a1c1e;caret-color:#222'
const PAPER_VARS_DARK =
  '--text:#d5dbff;--text-strong:#e9ecff;--text-muted:#8a93c4;--surface-hover:#23294a;--surface-muted:#171b2f;--border:#2f3763;--border-strong:#3a4270;--ghost:#5a6190;--mark:#5c4d12;--primary:#cbd5ff;caret-color:#e9ecff'

const decl = (style: string) =>
  style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .join(';\n  ')

const rule = (selectors: string[], style: string) => `${selectors.join(',\n')} {\n  ${decl(style)};\n}`

export function buildEditorThemeCss(themeKey: string, fontOffset = 0, spacingOffset = 0): string {
  const theme = themes[themeKey]
  if (!theme) return ''
  const scale = (s: string) => scaledStyle(s, fontOffset, spacingOffset)
  const css: string[] = []

  // 文章“纸面”：白底卡片，主题若定义了背景（暗夜、复古等）会覆盖。
  // 纸面内重设界面色变量，避免应用深色模式的颜色落到浅色纸面上。
  const dark = themeKey === 'night'
  css.push(
    rule(
      [ROOT],
      `${dark ? PAPER_VARS_DARK : PAPER_VARS_LIGHT};background:#ffffff;color:#222;padding:32px 28px 48px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04);min-height:60vh`
    ),
    rule([ROOT], scale(theme.section)),
    // 主题未定义的元素与发布效果一致：继承正文颜色
    rule([`${ROOT} strong`, `${ROOT} b`, `${ROOT} em`, `${ROOT} a`], 'color:inherit')
  )

  for (const [selector, style] of Object.entries(theme.styles)) {
    const selectors = selector.split(',').map((s) => `${ROOT} ${s.trim()}`)
    css.push(rule(selectors, scale(style)))
  }

  // 与发布管线一致的修正
  css.push(
    rule(
      [`${ROOT} pre code`],
      'background:none;padding:0;border-radius:0;font-size:inherit;font-family:Menlo,Consolas,monospace;white-space:inherit;color:inherit'
    ),
    // 编辑器中列表项、表格单元格内容包在 <p> 里，去掉段落外边距以贴近发布效果
    rule([`${ROOT} li > p`, `${ROOT} td > p`, `${ROOT} th > p`], 'margin:0'),
    rule([`${ROOT} ul[data-type='taskList']`], 'list-style:none;padding-left:0.2em'),
    rule([`${ROOT} a`], 'text-decoration-thickness:auto')
  )

  css.push(...decorations(themeKey, scale))
  return css.join('\n\n')
}

function decorations(themeKey: string, scale: (s: string) => string): string[] {
  const theme = themes[themeKey]
  const out: string[] = []

  if (theme.headingVariant === 'ribbon') {
    // 飘带标题：色块标签 + 右侧斜角，标签下方一条主题色线
    const line = theme.headingLine || theme.accent
    for (const tag of ['h1', 'h2']) {
      const o = tokenHeadingOptions(tag.toUpperCase())
      out.push(
        rule(
          [`${ROOT} ${tag}`],
          scale(
            `position:relative;display:block;width:fit-content;max-width:88%;margin:${o.margin};padding:${o.bgPadding};background:${theme.headingBg || theme.accent};border:0;border-radius:${o.bgRadius}px ${o.bgRadius}px 0 0;box-shadow:0 2px 0 0 ${line};color:${theme.headingText || '#ffffff'};font-size:${o.fontSize}px;line-height:${o.lineHeight};font-weight:${o.fontWeight}`
          )
        ),
        rule(
          [`${ROOT} ${tag}::after`],
          `content:'';position:absolute;right:-${o.tailWidth}px;bottom:0;width:0;height:0;border-left:${o.tailWidth}px solid ${theme.headingTailBg || '#e5e7eb'};border-top:${o.tailHeight}px solid transparent`
        )
      )
    }
  }

  if (themeKey === 'amber') {
    // 标题色块居中；有序列表使用彩色“1、”序号
    out.push(
      rule([`${ROOT} h1`, `${ROOT} h2`], 'display:table;margin-left:auto;margin-right:auto'),
      rule([`${ROOT} ol`], 'list-style:none;padding-left:0;counter-reset:mk-ol'),
      rule([`${ROOT} ol > li`], 'counter-increment:mk-ol'),
      rule([`${ROOT} ol > li > p:first-child::before`], "content:counter(mk-ol) '、';color:#c8722a;font-weight:700")
    )
  }

  if (themeKey === 'warmred') {
    // 章节标题（二级标题）居中，上方显示圆圈编号 01、02…
    out.push(
      rule([ROOT], 'counter-reset:mk-h2'),
      rule([`${ROOT} h1`], 'text-align:center'),
      rule([`${ROOT} h2`], 'counter-increment:mk-h2;display:table;margin-left:auto;margin-right:auto;margin-top:64px'),
      rule(
        [`${ROOT} h2::before`],
        "content:counter(mk-h2, decimal-leading-zero);display:block;box-sizing:border-box;width:52px;height:52px;margin:0 auto 8px;line-height:48px;border:2px solid #c0392b;border-radius:50%;color:#c0392b;font-size:24px;font-weight:900;text-align:center;font-family:'DIN Alternate','Impact','Arial Black',sans-serif;letter-spacing:1px"
      )
    )
  }

  return out
}
