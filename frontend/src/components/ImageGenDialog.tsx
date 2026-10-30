import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { IMAGE_GEN_PROVIDERS, type AppSettings } from '@shared/types'
import { Modal } from './Modal'

interface Props {
  config: AppSettings['imageGen']
  /** 初始提示词（如编辑器中选中的文字） */
  initialPrompt?: string
  /** 把生成的图片按图床设置保存并插入正文 */
  onInsert(dataUrl: string, prompt: string): Promise<boolean>
  onOpenSettings(): void
  onClose(): void
}

export function ImageGenDialog({ config, initialPrompt = '', onInsert, onOpenSettings, onClose }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<null | 'generate' | 'insert'>(null)
  const provider = IMAGE_GEN_PROVIDERS.find((p) => p.id === config.provider)

  if (!config.apiKey || !config.model) {
    return (
      <Modal title="AI 生图" onClose={onClose}>
        <div className="modal-body empty-state">
          <p>还没有配置 AI 生图。</p>
          <p className="note">在「设置 → 图片 → AI 生图」选择供应商、填写 API Key 与模型后即可根据描述生成图片。</p>
          <button className="btn primary" onClick={onOpenSettings}>
            前往设置
          </button>
        </div>
      </Modal>
    )
  }

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy('generate')
    setError('')
    const res = await window.markgo.image.generate(prompt.trim())
    setBusy(null)
    if (res.ok && res.dataUrl) setImage(res.dataUrl)
    else setError(res.error || '生成失败')
  }

  const insert = async () => {
    if (!image) return
    setBusy('insert')
    const ok = await onInsert(image, prompt.trim())
    setBusy(null)
    if (ok) onClose()
  }

  return (
    <Modal title="AI 生图" onClose={busy ? () => {} : onClose} width={560}>
      <div className="modal-body image-gen">
        <textarea
          rows={3}
          autoFocus
          value={prompt}
          placeholder="描述想要的画面，如：清晨薄雾中的江南小镇，水墨风格"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
          }}
        />
        <div className="image-gen-preview">
          {busy === 'generate' ? (
            <span className="note">
              <Loader2 size={14} className="spin" /> 正在生成，通常需要 10～60 秒…
            </span>
          ) : image ? (
            <img src={image} alt={prompt} />
          ) : error ? (
            <span className="image-gen-error">{error}</span>
          ) : (
            <span className="note">
              {provider?.name || '自定义'} · {config.model}
            </span>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn" disabled={!!busy || !prompt.trim()} onClick={generate}>
          <Sparkles size={13} /> {image ? '重新生成' : '生成'}
        </button>
        <button className="btn primary" disabled={!image || !!busy} onClick={insert}>
          {busy === 'insert' ? '插入中…' : '插入'}
        </button>
      </div>
    </Modal>
  )
}
