import { useEffect, useState } from 'react'
import { CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import { dismiss, subscribeToasts, type ToastItem } from '../lib/toast'

const ICONS = {
  info: <Info size={15} />,
  success: <CheckCircle2 size={15} />,
  error: <XCircle size={15} />,
  loading: <Loader2 size={15} className="spin" />
}

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    const off = subscribeToasts(setItems)
    return () => {
      off()
    }
  }, [])
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => t.kind !== 'loading' && dismiss(t.id)}>
          {ICONS[t.kind]}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
