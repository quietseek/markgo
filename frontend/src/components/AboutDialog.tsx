import { useEffect, useState } from 'react'
import type { AppInfo, UpdateCheck } from '@shared/types'
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
              {update.checking
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
            <button className="btn primary" onClick={() => api.shell.openExternal(r.url)}>
              前往下载
            </button>
          ) : (
            <button className="btn" disabled={update.checking} onClick={onCheck}>
              检查更新
            </button>
          )}
        </div>

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
