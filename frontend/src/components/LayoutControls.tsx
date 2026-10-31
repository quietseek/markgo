import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Minus, Plus, Send, SlidersHorizontal } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { themeList } from '../lib/themes'
import { EDITOR_THEME_DEFAULT, EDITOR_THEME_SYNC } from '../lib/editor-theme'
import { CapsuleSwitch } from './EditorWidthSwitch'

type LayoutPatch = Partial<Pick<AppSettings, 'themeKey' | 'editorTheme' | 'fontSizeOffset' | 'paraSpacingOffset' | 'linkToFootnote' | 'appearance'>>

const APPEARANCES: { key: AppSettings['appearance']; label: string; hint: string }[] = [
  { key: 'system', label: '系统', hint: '跟随系统的浅色 / 深色外观' },
  { key: 'light', label: '浅色', hint: '浅色外观' },
  { key: 'dark', label: '深色', hint: '深色外观' }
]

interface Props {
  settings: AppSettings
  onChange(patch: LayoutPatch): void
}

/** 状态栏中的排版控制：主题直接作用于所见即所得编辑区，发布与复制使用同一套排版 */
export function LayoutControls({ settings, onChange }: Props) {
  const native = settings.editorTheme === EDITOR_THEME_DEFAULT
  const current = themeList.find((t) => t.key === settings.themeKey) || themeList[0]
  const adjusted = settings.fontSizeOffset !== 0 || settings.paraSpacingOffset !== 0

  return (
    <>
      <Popover
        className="layout-theme"
        trigger={(open) => (
          <span className={`link${open ? ' on' : ''}`} title="排版主题：直接呈现在编辑区，复制与发布时使用">
            <span className={`swatch${native ? ' default' : ''}`} style={native ? undefined : { background: current.swatch }} />
            {native ? '原生样式' : current.label}
          </span>
        )}
      >
        {(close) => (
          <div className="layout-menu">
            <div className="layout-native-row">
              <button
                className={native ? 'active' : ''}
                title={`原生样式：编辑区使用应用自身的样式，发布仍使用${current.label}`}
                onClick={() => {
                  onChange({ editorTheme: EDITOR_THEME_DEFAULT })
                  close()
                }}
              >
                <span className="swatch default" />
                原生样式
                {native && <Check size={13} />}
              </button>
              <CapsuleSwitch title="界面外观" options={APPEARANCES} value={settings.appearance} onChange={(appearance) => onChange({ appearance })} />
            </div>
            <div className="menu-sep" />
            <div className="layout-grid">
              {themeList.map((t) => (
                <button
                  key={t.key}
                  className={!native && t.key === settings.themeKey ? 'active' : ''}
                  onClick={() => {
                    onChange({ themeKey: t.key, editorTheme: EDITOR_THEME_SYNC })
                    close()
                  }}
                >
                  <span className="swatch" style={{ background: t.swatch }} />
                  {t.label}
                  {t.key === settings.themeKey && <Check size={13} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>

      <Popover
        className="layout-adjust"
        trigger={(open) => (
          <span className={`link${open || adjusted ? ' on' : ''}`} title="字号与段距">
            <SlidersHorizontal size={12} />
          </span>
        )}
      >
        {() => (
          <div className="adjust-pop">
            <Stepper label="字号" value={settings.fontSizeOffset} onChange={(v) => onChange({ fontSizeOffset: v })} />
            <Stepper label="段距" value={settings.paraSpacingOffset} onChange={(v) => onChange({ paraSpacingOffset: v })} />
            <label className="check" title="外链转为文末参考链接，适合不支持外链跳转的平台">
              <input type="checkbox" checked={settings.linkToFootnote} onChange={(e) => onChange({ linkToFootnote: e.target.checked })} />
              链接转脚注
            </label>
          </div>
        )}
      </Popover>
    </>
  )
}

/** 复制与发布：状态栏末尾的图标按钮 */
export function PublishActions({ onCopy, onPublish }: { onCopy(): void; onPublish(): void }) {
  return (
    <span className="publish-actions">
      <button className="icon-btn sm" title="复制排版内容 ⇧⌘C" onClick={onCopy}>
        <Copy size={14} />
      </button>
      <button className="icon-btn sm" title="发布 ⇧⌘E" onClick={onPublish}>
        <Send size={13} />
      </button>
    </span>
  )
}

export function Popover({
  className,
  trigger,
  children
}: {
  className: string
  trigger(open: boolean): ReactNode
  children(close: () => void): ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className={`status-pop ${className}`} ref={ref}>
      <span onClick={() => setOpen((v) => !v)}>{trigger(open)}</span>
      {open && children(() => setOpen(false))}
    </div>
  )
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button onClick={() => onChange(Math.max(value - 1, -6))} aria-label={`${label}减小`}>
        <Minus size={12} />
      </button>
      <em>{value > 0 ? `+${value}` : value}</em>
      <button onClick={() => onChange(Math.min(value + 1, 12))} aria-label={`${label}增大`}>
        <Plus size={12} />
      </button>
    </div>
  )
}
