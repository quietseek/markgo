import { describe, expect, it } from 'vitest'
import { buildEditorThemeCss, resolveEditorTheme } from '@renderer/lib/editor-theme'
import { themeList } from '@renderer/lib/themes'

const parse = (css: string) => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  const rules = [...style.sheet!.cssRules] as CSSStyleRule[]
  style.remove()
  return rules
}

describe('editor themes', () => {
  it('defaults to the native editor and resolves sync to the layout theme', () => {
    expect(resolveEditorTheme('default', 'claude')).toBeNull()
    expect(resolveEditorTheme('sync', 'ocean')).toBe('ocean')
    expect(resolveEditorTheme('vivid', 'ocean')).toBe('vivid')
    expect(resolveEditorTheme('no-such-theme', 'ocean')).toBeNull()
    expect(buildEditorThemeCss('no-such-theme')).toBe('')
  })

  it.each(themeList.map((t) => t.key))('%s compiles to valid scoped CSS', (key) => {
    const css = buildEditorThemeCss(key)
    const rules = parse(css)
    // 每条规则都被解析（语法错误的规则会被浏览器静默丢弃）
    expect(rules.length).toBe(css.match(/\{\n/g)!.length)
    for (const r of rules) expect(r.selectorText.split(',').every((s) => s.trim().startsWith('.mk-themed .ProseMirror'))).toBe(true)
    const p = rules.find((r) => r.selectorText === '.mk-themed .ProseMirror p')!
    expect(p.style.getPropertyValue('font-size')).toMatch(/px$/)
  })

  it('applies font size and spacing offsets like the preview', () => {
    const p = (css: string) => parse(css).find((r) => r.selectorText === '.mk-themed .ProseMirror p')!.style
    expect(p(buildEditorThemeCss('simple')).getPropertyValue('font-size')).toBe('14px')
    expect(p(buildEditorThemeCss('simple', 2, 4)).getPropertyValue('font-size')).toBe('16px')
    // 段距偏移与预览一致：作用于三值/四值 margin（如标题）
    const h1 = parse(buildEditorThemeCss('simple', 0, 4)).find((r) => r.selectorText === '.mk-themed .ProseMirror h1')!.style
    expect(h1.getPropertyValue('margin')).toBe('28px 0px 20px')
  })

  it('approximates structural decorations with CSS', () => {
    expect(buildEditorThemeCss('vivid')).toMatch(/h1::after[\s\S]*border-left:26px solid/)
    expect(buildEditorThemeCss('warmred')).toContain('counter(mk-h2, decimal-leading-zero)')
    expect(buildEditorThemeCss('amber')).toContain("content:counter(mk-ol) '、'")
  })
})
