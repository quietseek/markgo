import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Modal } from './Modal'
import { generateMermaid } from '../lib/mermaid-ai'
import { renderMermaidSvg } from '../lib/mermaid'

export function MermaidGenDialog({ initialPrompt = '', onInsert, onClose }: {
  initialPrompt?: string
  onInsert(code: string): void
  onClose(): void
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState({ code: '', svg: '', error: '' })
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (busy || !code.trim()) return
    let alive = true
    const timer = window.setTimeout(() => {
      renderMermaidSvg(code, document.documentElement.dataset.theme === 'dark').then(
        (svg) => { if (alive) setPreview({ code, svg, error: '' }) },
        (err: Error) => { if (alive) setPreview({ code, svg: '', error: err.message }) }
      )
    }, 250)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [code, busy])

  const generate = async () => {
    if (!prompt.trim() || busy) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setCode('')
    setPreview({ code: '', svg: '', error: '' })
    try {
      const result = await generateMermaid(prompt.trim(), setCode, controller.signal)
      if (!controller.signal.aborted) setCode(result)
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message)
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false) }
    }
  }
  const valid = !!code.trim() && preview.code === code && !!preview.svg && !busy
  return (
    <Modal title="AI Mermaid 图表" width={860} onClose={onClose}>
      <div className="mermaid-gen">
        <label htmlFor="mermaid-prompt">描述你想要的图表</label>
        <textarea id="mermaid-prompt" autoFocus rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例如：画一个文章发布流程，包含写作、审阅、修改和发布，审阅不通过时返回修改。" />
        <div className="mermaid-gen-actions">
          <span className="muted">使用设置中选定的 AI Agent</span>
          <span className="grow" />
          {busy ? <button className="btn" onClick={() => request.current?.abort()}>停止生成</button> :
            <button className="btn primary" disabled={!prompt.trim()} onClick={() => void generate()}><Sparkles size={14} />{code ? '重新生成' : '生成图表'}</button>}
        </div>
        {error && <div className="mermaid-error" role="alert">{error}</div>}
        <div className="mermaid-gen-grid">
          <div><label htmlFor="mermaid-source">Mermaid 源码</label><textarea id="mermaid-source" spellCheck={false} value={code} readOnly={busy} onChange={(e) => setCode(e.target.value)} placeholder="生成后可在这里修改源码" /></div>
          <div><label>预览</label><div className="mermaid-gen-preview">
            {busy ? <span><Loader2 size={16} className="spin" /> 正在生成…</span> : !code.trim() ? <span className="muted">图表将在这里显示</span> : preview.code !== code ? <span className="muted">正在渲染…</span> : preview.svg ? <div dangerouslySetInnerHTML={{ __html: preview.svg }} /> : <div className="mermaid-error" role="alert">{preview.error}</div>}
          </div></div>
        </div>
        <div className="mermaid-gen-actions"><span className="muted">确认后插入为可编辑的图表，支持撤销</span><span className="grow" /><button className="btn ghost" onClick={onClose}>取消</button><button className="btn primary" disabled={!valid} onClick={() => { onInsert(code.trim()); onClose() }}>插入图表</button></div>
      </div>
    </Modal>
  )
}
