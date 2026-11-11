import type { CSSProperties } from 'react'
import type { AppSettings, SystemFont } from '@shared/types'

export function findSystemFont(fonts: SystemFont[], value: string): SystemFont | undefined {
  const name = value.trim().toLowerCase()
  return fonts.find((font) => [font.family, font.displayName, ...(font.aliases ?? [])].some((alias) => alias?.toLowerCase() === name))
}

export function systemFontOptions(fonts: SystemFont[]) {
  return fonts.map((font) => ({
    value: font.family,
    label: font.displayName || font.family,
    hint: font.displayName && font.displayName !== font.family ? font.family : undefined,
    searchText: (font.aliases ?? []).join(' ')
  })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
}

export const EDITOR_FONTS = {
  sans: 'var(--font)',
  serif: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', STSong, SimSun, serif"
}

/** Quote a single family name, never interpret user input as CSS declarations or a font stack. */
export function fontFamily(value: string, code = false): string | undefined {
  if (!value.trim()) return undefined
  if (!code && (value === 'sans' || value === 'serif')) return EDITOR_FONTS[value]
  const quoted = value.trim().replace(/[\\"\u0000-\u001f\u007f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)
  return `"${quoted}", ${code ? 'var(--mono)' : 'var(--font)'}`
}

export function bodyWeight(value: number): number | undefined {
  return [300, 400, 500, 600, 700].includes(value) ? value : undefined
}

export function typographyStyle(settings: AppSettings, native: boolean): CSSProperties {
  const weight = bodyWeight(settings.editorFontWeight)
  return {
    ...(native ? {
      '--ed-font': EDITOR_FONTS[settings.editorFont] ?? EDITOR_FONTS.sans,
      '--ed-font-size': `${settings.editorFontSize}px`,
      '--ed-line-height': settings.editorLineHeight,
      '--ed-para-spacing': `${settings.editorParaSpacing}em`
    } : {}),
    '--custom-font': fontFamily(settings.editorFontFamily ?? ''),
    '--custom-weight': weight,
    '--custom-strong-weight': weight ? Math.min(900, Math.max(700, weight + 200)) : undefined,
    '--custom-code-font': fontFamily(settings.editorCodeFont ?? '', true)
  } as CSSProperties
}
