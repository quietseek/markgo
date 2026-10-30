import type { EditorWidth } from '@shared/types'

export const EDITOR_WIDTHS: { key: EditorWidth; label: string; hint: string }[] = [
  { key: 'default', label: '标准', hint: '适合阅读的正文宽度' },
  { key: 'wide', label: '宽屏', hint: '更宽的正文，适合表格与代码' },
  { key: 'full', label: '铺满', hint: '正文铺满编辑区' }
]

/** 状态栏中的编辑区宽度预设 */
export function EditorWidthSwitch({ value, onChange }: { value: EditorWidth; onChange(v: EditorWidth): void }) {
  return (
    <div className="width-switch" title="编辑区宽度">
      {EDITOR_WIDTHS.map((w) => (
        <button key={w.key} className={value === w.key ? 'active' : ''} title={w.hint} onClick={() => onChange(w.key)}>
          {w.label}
        </button>
      ))}
    </div>
  )
}
