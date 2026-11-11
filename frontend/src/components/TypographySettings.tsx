import { useEffect, useState, type CSSProperties } from 'react'
import type { AppSettings, SystemFont } from '@shared/types'
import { ComboBox, Select } from './Select'
import { Row } from './SettingsDialog'
import { bodyWeight, findSystemFont, fontFamily, systemFontOptions } from '../lib/typography'

const FOLLOW = '跟随主题'
const PRESETS: Record<string, string> = { [FOLLOW]: '', 黑体: 'sans', 宋体: 'serif' }

export function TypographySettings({ draft, settings, set }: {
  draft: AppSettings
  settings: AppSettings
  set(patch: Partial<AppSettings>): void
}) {
  const [fonts, setFonts] = useState<SystemFont[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let alive = true
    setState('loading')
    window.markgo.fonts.list().then((list) => {
      if (alive) { setFonts(list); setState('ready') }
    }).catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [reload])

  const missing = (value: string, code = false) => state === 'ready' && !!value.trim()
    && (code || !['sans', 'serif'].includes(value))
    && !findSystemFont(fonts, value)
  const body = draft.editorFontFamily || ''
  const code = draft.editorCodeFont || ''

  return (
    <>
      <Row label="正文字体" desc="默认跟随主题；自定义字体也会应用于标题">
        <ComboBox
          className="font-setting-select"
          value={body}
          options={[...Object.entries(PRESETS).map(([label, value]) => ({ label, value })), ...systemFontOptions(fonts)]}
          placeholder={FOLLOW}
          ariaLabel="正文字体"
          onChange={(value) => set({ editorFontFamily: PRESETS[value] ?? findSystemFont(fonts, value)?.family ?? value })}
        />
      </Row>
      <Row label="正文字重" desc="字体不支持所选字重时，会使用最接近的效果">
        <Select className="font-setting-select" value={String(draft.editorFontWeight || 0)} title="正文字重" options={[
          { value: '0', label: FOLLOW },
          { value: '300', label: '细体 · 300' },
          { value: '400', label: '常规 · 400' },
          { value: '500', label: '中等 · 500' },
          { value: '600', label: '半粗 · 600' },
          { value: '700', label: '粗体 · 700' }
        ]} onChange={(value) => set({ editorFontWeight: Number(value) })} />
      </Row>
      <Row label="代码字体" desc="用于行内代码、代码块和 Markdown 源码；列表推荐等宽字体">
        <ComboBox className="font-setting-select" value={code} options={[{ value: '', label: FOLLOW }, ...systemFontOptions(fonts.filter((f) => f.monospace))]}
          placeholder={FOLLOW} ariaLabel="代码字体"
          onChange={(value) => set({ editorCodeFont: value === FOLLOW ? '' : findSystemFont(fonts, value)?.family ?? value })} />
      </Row>
      <div className="font-settings-preview">
        <FontPreview draft={draft} settings={settings} />
        {(missing(body) || missing(code, true)) && <p className="font-settings-note" role="status">
          未在本机字体列表中找到「{[missing(body) ? body : '', missing(code, true) ? code : ''].filter(Boolean).join('、')}」，不可用时自动使用备用字体。
        </p>}
        <div className="font-settings-actions">
          <span className="font-settings-note" role="status">{state === 'loading' ? '正在读取本机字体…' : state === 'error' ? '字体列表读取失败，仍可输入字体名称' : `可搜索或输入字体名称 · ${fonts.length} 个本机字体`}</span>
          <button type="button" className="btn sm ghost" onClick={() => setReload((v) => v + 1)} disabled={state === 'loading'}>刷新字体</button>
          <button type="button" className="btn sm ghost" onClick={() => set({ editorFontFamily: '', editorFontWeight: 0, editorCodeFont: '', editorFont: 'sans' })}>恢复默认</button>
        </div>
      </div>
    </>
  )
}

function FontPreview({ draft, settings }: { draft: AppSettings; settings: AppSettings }) {
  const [sample, setSample] = useState<{ body?: CSSProperties; heading?: CSSProperties; strong?: CSSProperties; code?: CSSProperties }>({})
  useEffect(() => {
    // 仅跟随编辑区的字体与字重；预览字号、行距保持紧凑，避免主题大标题撑高设置页。
    const frame = requestAnimationFrame(() => {
      const root = document.querySelector('.editor-pane .prose-editor')
      if (!root) return
      const read = (el: Element): CSSProperties => {
        const s = getComputedStyle(el)
        return { fontFamily: s.fontFamily, fontWeight: s.fontWeight }
      }
      const base = read(root)
      setSample({
        body: read(root.querySelector('p') ?? root),
        heading: root.querySelector('h2') ? read(root.querySelector('h2')!) : { ...base, fontWeight: 700 },
        strong: root.querySelector('strong') ? read(root.querySelector('strong')!) : { fontWeight: 700 },
        code: root.querySelector('code') ? read(root.querySelector('code')!) : { fontFamily: 'var(--mono)', fontWeight: 400 }
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [settings])
  const family = fontFamily(draft.editorFontFamily || '')
  const weight = bodyWeight(draft.editorFontWeight)
  return (
    <div className="font-preview" aria-label="字体预览" style={{ ...sample.body, ...(family ? { fontFamily: family } : {}), ...(weight ? { fontWeight: weight } : {}) }}>
      <h3 style={{ ...sample.heading, ...(family ? { fontFamily: family } : {}) }}>让文字呈现自己的节奏</h3>
      <p>中文与 English 交织，记录每一个想法。0123456789</p>
      <p><strong style={{ ...sample.strong, fontFamily: 'inherit', ...(weight ? { fontWeight: Math.min(900, Math.max(700, weight + 200)) } : {}) }}>加粗文字</strong>保留清晰层次，阅读更从容。</p>
      <code style={{ ...sample.code, ...(fontFamily(draft.editorCodeFont || '', true) ? { fontFamily: fontFamily(draft.editorCodeFont, true) } : {}) }}>const message = "Hello, MarkGo";</code>
    </div>
  )
}
