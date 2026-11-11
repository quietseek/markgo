import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../src/shared/types'
import { findSystemFont, fontFamily, systemFontOptions, typographyStyle } from '../src/lib/typography'

describe('editor typography', () => {
  it('displays Chinese names while keeping English families and aliases searchable', () => {
    const fonts = [{ family: 'KaiTi', displayName: '楷体', aliases: ['KaiTi', '楷体', '楷體'], monospace: false }]
    expect(systemFontOptions(fonts)[0]).toMatchObject({ value: 'KaiTi', label: '楷体', searchText: 'KaiTi 楷体 楷體' })
    for (const name of ['楷体', '楷體', 'kaiti', ' KaiTi ']) expect(findSystemFont(fonts, name)?.family).toBe('KaiTi')
    expect(findSystemFont(fonts, '未安装字体')).toBeUndefined()
  })
  it('leaves themes in control by default and retains the legacy native font', () => {
    const settings = { ...defaultSettings, editorFont: 'serif' as const }
    expect(typographyStyle(settings, false)).not.toHaveProperty('--ed-font')
    expect(typographyStyle(settings, true)).toHaveProperty('--ed-font', expect.stringContaining('SimSun'))
    expect(fontFamily('')).toBeUndefined()
  })

  it('treats a custom name as one quoted family and includes a fallback', () => {
    expect(fontFamily('My Font, serif')).toBe('"My Font, serif", var(--font)')
    expect(fontFamily('A";color:red;\\B\n')).toBe('"A\\22 ;color:red;\\5c B", var(--font)')
    expect(fontFamily('Consolas', true)).toBe('"Consolas", var(--mono)')
  })

  it('keeps emphasis heavier than a bold body and rejects unsupported weights', () => {
    expect(typographyStyle({ ...defaultSettings, editorFontWeight: 700 }, false)).toHaveProperty('--custom-strong-weight', 900)
    expect(typographyStyle({ ...defaultSettings, editorFontWeight: 999 }, false)).toHaveProperty('--custom-weight', undefined)
  })
})
