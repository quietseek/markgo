import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal(props: { title: string; width?: number; onClose(): void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" style={{ width: props.width || 520 }} role="dialog" aria-label={props.title}>
        <div className="modal-head">
          <h3>{props.title}</h3>
          <button className="icon-btn sm" onClick={props.onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}
