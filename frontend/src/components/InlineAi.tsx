import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { CornerDownLeft, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { inlineDiff } from '../lib/diff'
import { renderAgentMarkdown } from '../lib/sanitize'
import { stripInline } from '../lib/render'
import { cleanResult, inlinePrompt, runChannel } from '../lib/ai'

export interface InlineAiAction {
  key: string
  label: string
  instruction: string
}

export const INLINE_ACTIONS: InlineAiAction[] = [
  { key: 'polish', label: '润色', instruction: '润色这段文字：修正错别字和语病，让表达更流畅自然，保持原意和语气。' },
  { key: 'rewrite', label: '改写', instruction: '换一种表达方式改写这段文字，保持原意。' },
  { key: 'expand', label: '扩写', instruction: '扩写这段文字，补充细节、例子或论据，篇幅约为原来的两倍。' },
  { key: 'shorten', label: '精简', instruction: '精简这段文字，删去冗余，只保留核心信息。' },
  { key: 'en', label: '译为英文', instruction: '把这段文字翻译成自然地道的英文。' },
  { key: 'zh', label: '译为中文', instruction: '把这段文字翻译成自然流畅的简体中文。' }
]

export const CONTINUE_ACTION: InlineAiAction = {
  key: 'continue',
  label: '续写',
  instruction: '这是文章已有的内容。请顺着上文的思路和文风，自然地续写一到两段。只输出续写的新内容，不要重复原文。'
}

export interface InlineAiRequest {
  /** 选区；from === to 表示在光标处插入 */
  from: number
  to: number
  /** 发送给 Agent 的原文（Markdown） */
  source: string
  action?: InlineAiAction
  top: number
  left: number
}

// 每个窗口各自计数，随机起点避免多个窗口的频道重名
let channelSeq = Math.floor(Math.random() * 1e9)

type Phase = 'ask' | 'running' | 'done' | 'error'

export function InlineAiCard({ editor, request, onClose }: { editor: Editor; request: InlineAiRequest; onClose(): void }) {
  const [action, setAction] = useState<InlineAiAction | undefined>(request.action)
  const [custom, setCustom] = useState('')
  const [phase, setPhase] = useState<Phase>(request.action ? 'running' : 'ask')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [compare, setCompare] = useState(false)
  const channel = useRef('')
  const insertMode = request.from === request.to

  const run = useCallback(
    async (act: InlineAiAction) => {
      if (channel.current) await window.markgo.ai.cancel(channel.current)
      const ch = `inline-${++channelSeq}`
      channel.current = ch
      setAction(act)
      setText('')
      setError('')
      setPhase('running')
      try {
        const res = await runChannel(
          { channel: ch, fresh: true, text: inlinePrompt(act.instruction), selection: request.source },
          (t) => channel.current === ch && setText((prev) => prev + t)
        )
        if (channel.current !== ch) return
        if (res.stopReason === 'cancelled') {
          setError('已取消')
          setPhase('error')
        } else setPhase('done')
      } catch (err) {
        if (channel.current !== ch) return
        setError((err as Error).message)
        setPhase('error')
      }
    },
    [request.source]
  )

  useEffect(() => {
    if (request.action) run(request.action)
    return () => {
      if (channel.current) window.markgo.ai.cancel(channel.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const result = cleanResult(text)

  const apply = (below = false) => {
    if (!result) return
    const json = editor.markdown?.parse(result)
    const blocks = json?.content || []
    // 单段结果作为行内内容替换，避免把原段落拆开
    const inline = blocks.length === 1 && blocks[0].type === 'paragraph' && !below
    const content = inline ? blocks[0].content || [] : blocks
    const chain = editor.chain().focus()
    if (below || insertMode) {
      const $to = editor.state.doc.resolve(request.to)
      const pos = below && $to.depth >= 1 ? $to.after(1) : request.to
      chain.insertContentAt(pos, content).run()
    } else {
      chain.insertContentAt({ from: request.from, to: request.to }, content).run()
    }
    onClose()
  }

  const discard = () => {
    if (channel.current && phase === 'running') window.markgo.ai.cancel(channel.current)
    onClose()
    editor.commands.focus()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        discard()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phase === 'done') {
        e.preventDefault()
        apply()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const html = useMemo(() => renderAgentMarkdown(result), [result])
  const diff = useMemo(
    () => (compare && phase === 'done' ? inlineDiff(stripInline(request.source), stripInline(result)) : []),
    [compare, phase, request.source, result]
  )

  return (
    <div className="inline-ai" style={{ top: request.top, left: request.left }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="inline-ai-head">
        <Sparkles size={14} />
        <span>{action ? `AI · ${action.label}` : 'AI 指令'}</span>
        {phase === 'running' && <Loader2 size={13} className="spin" />}
        <span className="grow" />
        {phase === 'done' && !insertMode && (
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            对比原文
          </label>
        )}
        <button className="icon-btn sm" onClick={discard} title="放弃（Esc）">
          <X size={14} />
        </button>
      </div>

      {phase === 'ask' ? (
        <form
          className="inline-ai-ask"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) run({ key: 'custom', label: custom.trim().slice(0, 12), instruction: custom.trim() })
          }}
        >
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={insertMode ? '让 AI 写点什么，例如：写一段引出下文的过渡' : '告诉 AI 如何修改选中的内容'}
          />
          <button className="send-btn" type="submit" disabled={!custom.trim()}>
            <CornerDownLeft size={14} />
          </button>
        </form>
      ) : (
        <div className="inline-ai-body">
          {compare && diff.length ? (
            <p className="diff-inline">
              {diff.map((c, i) => (c.added ? <ins key={i}>{c.value}</ins> : c.removed ? <del key={i}>{c.value}</del> : <span key={i}>{c.value}</span>))}
            </p>
          ) : result ? (
            <div className="prose-editor" dangerouslySetInnerHTML={{ __html: html }} />
          ) : phase === 'running' ? (
            <div className="msg-waiting">
              <Loader2 size={14} className="spin" /> Agent 正在处理…
            </div>
          ) : null}
          {phase === 'error' && <div className="msg-error">{error}</div>}
        </div>
      )}

      {(phase === 'done' || phase === 'error') && (
        <div className="inline-ai-actions">
          {phase === 'done' && result && (
            <>
              <button className="btn primary" onClick={() => apply()}>
                {insertMode ? '插入' : '替换'} <kbd>⌘↵</kbd>
              </button>
              {!insertMode && (
                <button className="btn" onClick={() => apply(true)}>
                  插入到下方
                </button>
              )}
            </>
          )}
          {action && (
            <button className="btn ghost" onClick={() => run(action)}>
              <RotateCcw size={13} /> 重试
            </button>
          )}
          <button className="btn ghost" onClick={discard}>
            放弃
          </button>
        </div>
      )}
    </div>
  )
}
