import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { subscribeConfirm, type ConfirmRequest } from '../lib/confirm'

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  useEffect(() => subscribeConfirm(setReq), [])

  useEffect(() => {
    if (!req) return
    okRef.current?.focus()
    // 捕获阶段处理，避免 Esc 同时关闭下面的设置等对话框；回车由获得焦点的按钮处理
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      req.resolve(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [req])

  if (!req) return null
  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && req.resolve(false)}>
      <div className="modal confirm-dialog" role="alertdialog" aria-label={req.title}>
        <div className="confirm-body">
          {req.danger && (
            <span className="confirm-icon">
              <AlertTriangle size={18} />
            </span>
          )}
          <div>
            <h3>{req.title}</h3>
            {req.message && <p>{req.message}</p>}
          </div>
        </div>
        <div className="confirm-actions">
          <button className="btn" onClick={() => req.resolve(false)}>
            {req.cancelText ?? '取消'}
          </button>
          <button ref={okRef} className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => req.resolve(true)}>
            {req.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
