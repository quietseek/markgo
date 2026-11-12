import { useEffect, useRef } from 'react'
import { FileText, X } from 'lucide-react'
import { basename } from '../lib/assets'

export interface DocumentTab {
  path: string
  isScratch: boolean
  isExample?: boolean
}

export function documentKey(path: string) {
  const normalized = path.replace(/\\/g, '/')
  return window.markgo.platform === 'win32' || window.markgo.platform === 'windows' ? normalized.toLowerCase() : normalized
}

export function documentLabel(tab: DocumentTab) {
  return tab.isExample ? '示例文档' : tab.isScratch ? '未命名草稿' : basename(tab.path).replace(/\.(md|markdown|txt)$/i, '')
}

export function DocumentTabs({ tabs, activePath, dirty, onSelect, onClose }: {
  tabs: DocumentTab[]
  activePath: string
  dirty: boolean
  onSelect(tab: DocumentTab): void
  onClose(tab: DocumentTab): void
}) {
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [activePath, tabs.length])
  return <div className="document-tabs" role="tablist" aria-label="打开的文档">
    {tabs.map((tab, index) => {
      const active = documentKey(tab.path) === documentKey(activePath)
      const label = documentLabel(tab)
      return <div className={`document-tab${active ? ' active' : ''}`} key={documentKey(tab.path)} onAuxClick={(event) => {
        if (event.button === 1) { event.preventDefault(); onClose(tab) }
      }}>
        <button ref={active ? activeRef : undefined} className="document-tab-select" role="tab" aria-selected={active}
          tabIndex={active ? 0 : -1} title={tab.path || label} onClick={() => onSelect(tab)} onKeyDown={(event) => {
            const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
            if (offset) {
              event.preventDefault()
              const next = (index + offset + tabs.length) % tabs.length
              event.currentTarget.closest('.document-tabs')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
              onSelect(tabs[next])
            }
            if (event.key === 'Delete') { event.preventDefault(); onClose(tab) }
          }}>
          <FileText size={13} /><span>{label}</span>{active && dirty && <i className="document-tab-dirty" aria-label="未保存" />}
        </button>
        <button className="document-tab-close" title={`关闭 ${label}`} aria-label={`关闭 ${label}`} onClick={() => onClose(tab)}><X size={12} /></button>
      </div>
    })}
  </div>
}
