import type { ReactNode } from 'react'
import { Image } from 'lucide-react'
import type { EditorWidth, ImageUploadMode } from '@shared/types'

export const EDITOR_WIDTHS: { key: EditorWidth; label: string; hint: string }[] = [
  { key: 'default', label: '标准', hint: '适合阅读的正文宽度' },
  { key: 'wide', label: '宽屏', hint: '更宽的正文，适合表格与代码' },
  { key: 'full', label: '铺满', hint: '正文铺满编辑区' }
]

const IMAGE_MODES: { key: ImageUploadMode; label: string; hint: string }[] = [
  { key: 'picgo', label: '图床', hint: '插入图片时上传到 PicGo / PicList 图床' },
  { key: 'local', label: '本地', hint: '插入图片时保存到文档旁的本地目录' }
]

/** 状态栏中的胶囊切换 */
export function CapsuleSwitch<T extends string>(props: {
  title: string
  icon?: ReactNode
  options: { key: T; label: string; hint: string }[]
  value: T
  onChange(v: T): void
}) {
  return (
    <div className="width-switch" title={props.title}>
      {props.icon && <span className="width-switch-icon">{props.icon}</span>}
      {props.options.map((o) => (
        <button key={o.key} className={props.value === o.key ? 'active' : ''} title={o.hint} onClick={() => props.onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 状态栏中的编辑区宽度预设 */
export function EditorWidthSwitch({ value, onChange }: { value: EditorWidth; onChange(v: EditorWidth): void }) {
  return <CapsuleSwitch title="编辑区宽度" options={EDITOR_WIDTHS} value={value} onChange={onChange} />
}

/** 状态栏中的图片插入方式 */
export function ImageModeSwitch({ value, onChange }: { value: ImageUploadMode; onChange(v: ImageUploadMode): void }) {
  return <CapsuleSwitch title="图片插入方式" icon={<Image size={12} />} options={IMAGE_MODES} value={value} onChange={onChange} />
}
