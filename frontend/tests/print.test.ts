import { describe, expect, it } from 'vitest'
import { MARGIN_PRESETS, h1BreakCss } from '../src/lib/print'

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
