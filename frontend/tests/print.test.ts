import { describe, expect, it } from 'vitest'
import { MARGIN_PRESETS, h1BreakCss, pageLayout } from '../src/lib/print'
import { defaultSettings } from '../src/shared/types'

function editor(html: string): Element {
  const root = document.createElement('div')
  root.className = 'prose-editor'
  root.innerHTML = html
  return root
}

describe('h1BreakCss', () => {
  it('breaks before every h1 except a leading one', () => {
    const css = h1BreakCss(editor('<h1>A</h1><p>x</p><h2>B</h2><h1>C</h1><p>y</p><h1>D</h1>'))
    expect(css).toContain('.prose-editor > :nth-child(4)')
    expect(css).toContain('.prose-editor > :nth-child(6)')
    expect(css).not.toContain(':nth-child(1)')
    expect(css).toContain('break-before: page')
  })
  it('ignores front matter and empty paragraphs before the first h1', () => {
    const css = h1BreakCss(editor('<div class="front-matter">title: x</div><p></p><h1>A</h1><p>x</p><h1>B</h1>'))
    expect(css).not.toContain(':nth-child(3)')
    expect(css).toContain(':nth-child(5)')
  })
  it('breaks before the first h1 when content precedes it', () => {
    expect(h1BreakCss(editor('<p>intro</p><h1>A</h1>'))).toContain(':nth-child(2)')
  })
  it('returns empty css without h1 or root', () => {
    expect(h1BreakCss(editor('<p>x</p><h2>y</h2>'))).toBe('')
    expect(h1BreakCss(null)).toBe('')
  })
})

describe('MARGIN_PRESETS', () => {
  it('starts with the Word normal margins', () => {
    expect(MARGIN_PRESETS[0]).toMatchObject({ key: 'normal', top: 2.54, left: 3.18 })
  })
})

describe('pageLayout', () => {
  it('converts asymmetric margins from centimeters to millimeters', () => {
    const p = pageLayout({ ...defaultSettings.export, marginTop: 1, marginBottom: 2, marginLeft: 3, marginRight: 4 })
    expect(p).toMatchObject({ width: 210, height: 297, top: 10, bottom: 20, left: 30, right: 40, contentWidth: 140, contentHeight: 267, valid: true })
  })

  it('rotates the paper while keeping margins on their named edges', () => {
    const p = pageLayout({ ...defaultSettings.export, paperSize: 'letter', landscape: true, marginTop: 1, marginBottom: 2, marginLeft: 3, marginRight: 4 })
    expect(p.width).toBe(279.4)
    expect(p.height).toBe(215.9)
    expect(p.contentWidth).toBeCloseTo(209.4)
    expect(p.contentHeight).toBeCloseTo(185.9)
    expect(p.left).toBe(30)
    expect(p.top).toBe(10)
  })

  it('flags margins leaving less than 20 mm of content, including overlapping margins', () => {
    const p = pageLayout({ ...defaultSettings.export, paperSize: 'a5', marginLeft: 10, marginRight: 10 })
    expect(p.valid).toBe(false)
    expect(p.contentWidth).toBe(0)
    expect(pageLayout({ ...defaultSettings.export, paperSize: 'a4', marginLeft: 10, marginRight: 10 }).valid).toBe(false)
    expect(pageLayout({ ...defaultSettings.export, marginLeft: 10, marginRight: 9 }).valid).toBe(true)
  })
})
