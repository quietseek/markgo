/** 应用内确认框（替代原生 confirm，外观与应用一致）；由 ConfirmHost 渲染 */
export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮显示为红色 */
  danger?: boolean
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve(ok: boolean): void
}

let current: ConfirmRequest | null = null
const listeners = new Set<(req: ConfirmRequest | null) => void>()
const emit = () => listeners.forEach((l) => l(current))

export function subscribeConfirm(l: (req: ConfirmRequest | null) => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  current?.resolve(false)
  return new Promise((resolve) => {
    current = {
      ...opts,
      resolve: (ok) => {
        current = null
        emit()
        resolve(ok)
      }
    }
    emit()
  })
}
