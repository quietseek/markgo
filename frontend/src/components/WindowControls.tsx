import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import type { WindowControls as Variant } from '@shared/types'

const api = window.markgo

/** 自绘窗口按钮：用于与平台原生样式不同的选择（如 Windows 上的红绿灯、右侧红绿灯） */
export function WindowControls({ variant, side = 'left' }: { variant: Variant; side?: 'left' | 'right' }) {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => api.window.onMaximizeChange(setMaximized), [])

  if (variant === 'traffic')
    return (
      <div className={`win-traffic ${side}`}>
        <button className="tl-close" title="关闭" onClick={api.window.close}>
          <X size={8} strokeWidth={3} />
        </button>
        <button className="tl-min" title="最小化" onClick={api.window.minimize}>
          <Minus size={8} strokeWidth={3} />
        </button>
        <button className="tl-max" title={maximized ? '还原' : '最大化'} onClick={api.window.toggleMaximize}>
          <Square size={6} strokeWidth={3} />
        </button>
      </div>
    )

  return (
    <div className="win-classic">
      <button title="最小化" onClick={api.window.minimize}>
        <Minus size={15} strokeWidth={1.5} />
      </button>
      <button title={maximized ? '还原' : '最大化'} onClick={api.window.toggleMaximize}>
        {maximized ? <Copy size={12} strokeWidth={1.5} className="flip" /> : <Square size={12} strokeWidth={1.5} />}
      </button>
      <button className="close" title="关闭" onClick={api.window.close}>
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}
