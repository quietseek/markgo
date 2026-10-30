export type ToastKind = 'info' | 'success' | 'error' | 'loading'
export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

type Listener = (items: ToastItem[]) => void
let items: ToastItem[] = []
let seq = 0
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l(items))

export function subscribeToasts(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export function toast(text: string, kind: ToastKind = 'info', duration = kind === 'error' ? 6000 : 2400): number {
  const id = ++seq
  items = [...items, { id, kind, text }]
  emit()
  if (kind !== 'loading') setTimeout(() => dismiss(id), duration)
  return id
}

/** 更新一条 loading toast 的结果 */
export function resolveToast(id: number, text: string, kind: Exclude<ToastKind, 'loading'>) {
  dismiss(id)
  toast(text, kind)
}
