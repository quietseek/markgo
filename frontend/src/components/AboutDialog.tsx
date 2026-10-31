import { useEffect, useState } from 'react'
import type { AppInfo, UpdateCheck, UpdateProgress } from '@shared/types'
import { Modal } from './Modal'
import appIcon from '../assets/icon.png'

const api = window.markgo

export type UpdateState = { checking: boolean; result?: UpdateCheck }

interface Props {
  update: UpdateState
  onCheck(): void
  onClose(): void
}

export function AboutDialog({ update, onCheck, onClose }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    api.app.info().then(setInfo)
  }, [])
  const r = update.result
  // 自动更新：下载 → 安装 → 应用退出并重新打开
  const [installing, setInstalling] = useState<UpdateProgress | null>(null)
  const [installError, setInstallError] = useState('')
  useEffect(() => api.app.onUpdateProgress(setInstalling), [])
  const install = async () => {
    setInstallError('')
    setInstalling({ phase: 'download', received: 0, total: 0 })
    const res = await api.app.installUpdate()
    if (!res.ok) {
      setInstalling(null)
      setInstallError(res.error || '更新失败')
    }
  }
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  const progressText = !installing
    ? ''
    : installing.phase === 'install'
      ? '正在安装，完成后会自动重新打开…'
      : installing.total
        ? `正在下载 ${Math.floor((installing.received / installing.total) * 100)}%（${mb(installing.received)} / ${mb(installing.total)} MB）`
        : `正在下载 ${mb(installing.received)} MB`

  return (
    <Modal title="关于" onClose={onClose} width={420}>
      <div className="modal-body about">
        <img src={appIcon} alt="" width={72} height={72} />
        <h2>MarkGo</h2>
        <p className="about-tagline">简洁的 Markdown 写作与笔记</p>
        <div className={`about-update${r?.ok && r.hasUpdate ? ' has-update' : ''}`}>
          <div className="about-version">
            <b>版本 {info?.version ?? '…'}</b>
            <small>
              {installing
                ? progressText
                : installError
                  ? `自动更新失败：${installError}`
                  : update.checking
                    ? '正在检查更新…'
                    : !r
                      ? '检查是否有可用的新版本'
                      : !r.ok
                        ? '检查失败，请稍后重试'
                        : r.hasUpdate
                          ? `发现新版本 v${r.latest}`
                          : '已是最新版本'}
            </small>
          </div>
          {r?.ok && r.hasUpdate ? (
            r.installable && !installError ? (
              <button className="btn primary" disabled={!!installing} onClick={install}>
                {installing ? '更新中…' : '立即更新'}
              </button>
            ) : (
              <button className="btn primary" onClick={() => api.shell.openExternal(r.url)}>
                前往下载
              </button>
            )
          ) : (
            <button className="btn" disabled={update.checking} onClick={onCheck}>
              检查更新
            </button>
          )}
        </div>
        {installing?.phase === 'download' && installing.total > 0 && (
          <div className="about-progress">
            <span style={{ width: `${(installing.received / installing.total) * 100}%` }} />
          </div>
        )}

        {info && (
          <p className="about-meta">
            Wails {info.wails} · Go {info.go} · {info.platform}
          </p>
        )}
        <p className="about-links">
          <a onClick={() => info && api.shell.openExternal(info.homepage)}>GitHub</a>
          <a onClick={() => info && api.shell.openExternal(`${info.homepage}/releases`)}>更新日志</a>
        </p>
        <p className="about-meta">MIT License</p>
      </div>
    </Modal>
  )
}
