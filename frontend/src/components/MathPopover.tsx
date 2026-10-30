import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import katex from 'katex'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import { generateLatex } from '../lib/math'

export interface MathTarget {
  /** 编辑已有公式时为节点位置；新建时为要替换的范围 */
  pos?: number
  from: number
  to: number
  display: boolean
  latex: string
  /** 打开时自动用 AI 生成（来自选中文字或「AI 公式」命令） */
  describe?: string
  top: number
  left: number
}

export function MathPopover({ editor, target, onClose }: { editor: Editor; target: MathTarget; onClose(): void }) {
  const editing = target.pos != null
  const [latex, setLatex] = useState(target.latex)
  const [display, setDisplay] = useState(target.display)
  const [describe, setDescribe] = useState(target.describe ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const latexRef = useRef<HTMLTextAreaElement>(null)
  const describeRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // 点击浮层外部时关闭（不保存）
  useEffect(() => {
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && onClose()
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const preview = useMemo(() => {
    if (!latex.trim()) return { html: '', error: '' }
    try {
      return { html: katex.renderToString(latex, { displayMode: display, throwOnError: true }), error: '' }
    } catch (err) {
      return { html: '', error: (err as Error).message.replace(/^KaTeX parse error: /, '') }
    }
  }, [latex, display])

  const generate = async (text = describe) => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await generateLatex(text.trim(), display)
      if (!result) throw new Error('AI 没有返回公式')
      setLatex(result)
      latexRef.current?.focus()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (target.describe) generate(target.describe)
    else if (editing || target.latex) latexRef.current?.focus()
    else describeRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = () => {
    const value = latex.trim()
    if (!value) return remove()
    const type = display ? 'blockMath' : 'inlineMath'
    const chain = editor.chain().focus()
    if (editing) {
      const node = editor.state.doc.nodeAt(target.pos!)
      if (node?.type.name === type) chain.command(({ tr }) => (tr.setNodeMarkup(target.pos!, undefined, { latex: value }), true)).run()
      else chain.insertContentAt({ from: target.pos!, to: target.pos! + (node?.nodeSize ?? 0) }, { type, attrs: { latex: value } }).run()
    } else {
      chain.insertContentAt({ from: target.from, to: target.to }, { type, attrs: { latex: value } }).run()
    }
    onClose()
  }

  const remove = () => {
    if (editing) {
      const node = editor.state.doc.nodeAt(target.pos!)
      if (node) editor.chain().focus().deleteRange({ from: target.pos!, to: target.pos! + node.nodeSize }).run()
    }
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      editor.commands.focus()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      apply()
    }
  }

  return (
    <div className="math-pop" ref={boxRef} style={{ top: target.top, left: target.left }} onKeyDown={onKeyDown}>
      <form
        className="math-ai"
        onSubmit={(e) => {
          e.preventDefault()
          generate()
        }}
      >
        <Sparkles size={14} />
        <input ref={describeRef} value={describe} placeholder="用自然语言描述公式，如：一元二次方程求根公式" onChange={(e) => setDescribe(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !describe.trim()}>
          {busy ? <Loader2 size={13} className="spin" /> : 'AI 生成'}
        </button>
      </form>
      <textarea
        ref={latexRef}
        className="math-src"
        rows={display ? 3 : 1}
        value={latex}
        spellCheck={false}
        placeholder="LaTeX，如 E = mc^2"
        onChange={(e) => setLatex(e.target.value)}
      />
      <div className={`math-preview${display ? ' display' : ''}`}>
        {preview.html ? (
          <span dangerouslySetInnerHTML={{ __html: preview.html }} />
        ) : (
          <span className="muted">{preview.error || error || (busy ? '正在生成…' : '预览')}</span>
        )}
      </div>
      {preview.html && error && <div className="math-error">{error}</div>}
      <div className="math-foot">
        <div className="segmented">
          <button className={!display ? 'active' : ''} onClick={() => setDisplay(false)}>
            行内
          </button>
          <button className={display ? 'active' : ''} onClick={() => setDisplay(true)}>
            独立
          </button>
        </div>
        <span className="grow" />
        {editing && (
          <button className="icon-btn sm" title="删除公式" onClick={remove}>
            <Trash2 size={14} />
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn primary" disabled={!!preview.error} onClick={apply} title="⌘↵">
          {editing ? '更新' : '插入'}
        </button>
      </div>
    </div>
  )
}
