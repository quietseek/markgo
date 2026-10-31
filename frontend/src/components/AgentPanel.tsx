import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Blocks,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileDiff,
  Loader2,
  PenLine,
  Plus,
  Quote,
  Square,
  TerminalSquare,
  X,
  XCircle
} from 'lucide-react'
import { WRITING_LENGTHS, type AppSettings, type ToolCallView, type WritingLength } from '@shared/types'
import {
  addUserMessage,
  clearChat,
  getAgentState,
  handleAgentEvent,
  markPermission,
  setWriting,
  useAgentState,
  type ChatItem
} from '../lib/agent-store'
import { draftPrompt, outlinePrompt, outlineTitle } from '../lib/writing'
import { renderAgentMarkdown } from '../lib/sanitize'
import { countWords } from '../lib/render'
import { basename } from '../lib/assets'
import { Popover } from './LayoutControls'

const api = window.markgo

const QUICK_PROMPTS = [
  { label: '润色全文', text: '请通读当前文档并润色全文：修正错别字与语病，让表达更流畅，保持原意与结构。直接修改文档。' },
  { label: '检查错别字', text: '请检查当前文档中的错别字、标点和语病，逐条列出问题和修改建议，暂时不要修改文档。' },
  { label: '拟标题', text: '请根据当前文档拟 5 个标题，风格各不相同，每个不超过 30 字。' },
  { label: '提炼要点', text: '请用 5 条以内的要点总结当前文档的核心内容。' }
]

interface Props {
  settings: AppSettings
  docPath: string
  getSelection(): string
  /** 保存当前文档并返回编辑器中的最新内容（随提示词附带给 Agent） */
  syncDoc(): Promise<string>
  onSettings(): void
  onSwitchAgent(id: string): void
  /** 新建文档并打开，返回路径（取消时为 null） */
  onCreateDoc(title: string): Promise<string | null>
  /** AI 写作的初稿写完：按元信息中的标题重命名文档 */
  onDraftDone(path: string, title: string): void
}

export function AgentPanel({ settings, docPath, getSelection, syncDoc, onSettings, onSwitchAgent, onCreateDoc, onDraftDone }: Props) {
  const state = useAgentState()
  const [input, setInput] = useState('')
  const [quote, setQuote] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const agent = settings.ai.agents.find((a) => a.id === settings.ai.activeAgentId) || settings.ai.agents[0]

  // 新内容到达时滚动到底部（用户向上翻阅时不打扰）
  const stick = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.items])

  const send = async (text = input) => {
    const content = text.trim()
    if (!content || state.running) return
    const selection = quote ?? undefined
    setInput('')
    setQuote(null)
    // 先保存：Agent 通常用自带工具直接读写磁盘，保证它读到的就是编辑器里的内容
    await ask(content, { selection, docContent: await syncDoc() })
  }

  /** display：对话中显示的简短文字（写作流程的提示词较长） */
  const ask = async (text: string, opts: { display?: string; selection?: string; doc?: string; docContent: string }) => {
    stick.current = true
    addUserMessage(opts.display ?? text, opts.selection)
    // 结果通过事件流回填；这里只兜底处理没有产生事件的失败
    const fresh = freshNext.current
    freshNext.current = false
    const res = await api.ai.prompt({ channel: 'chat', text, docPath: opts.doc ?? docPath, docContent: opts.docContent, selection: opts.selection, fresh })
    if (!res.ok && getAgentState().running) handleAgentEvent({ type: 'error', channel: 'chat', error: res.error || '请求失败' })
  }

  // ---------- 写作：话题 → 大纲讨论 → 写入新文档 ----------
  const [composing, setComposing] = useState(false)
  const writing = state.writing
  const startOutline = async (topic: string, styleId: string, length: WritingLength) => {
    const style = settings.writing.styles.find((s) => s.id === styleId) || settings.writing.styles[0]
    const brief = { topic, style, length }
    await newChat()
    setComposing(false)
    setWriting({ brief, phase: 'outline' })
    const label = WRITING_LENGTHS.find((l) => l.key === length)?.label
    await ask(outlinePrompt(brief, settings.writing), {
      display: `写一篇文章：${topic}\n${style.name} · ${label}，先拟大纲`,
      docContent: await syncDoc()
    })
  }
  const lastReply = [...state.items].reverse().find((it) => it.kind === 'agent')
  const startDraft = async () => {
    if (!writing) return
    const replies = state.items.filter((it): it is Extract<ChatItem, { kind: 'agent' }> => it.kind === 'agent')
    const title = replies.map((r) => outlineTitle(r.text)).filter(Boolean).pop() || writing.brief.topic.slice(0, 30)
    const path = await onCreateDoc(title)
    if (!path) return
    setWriting({ ...writing, phase: 'drafting', docPath: path, title })
    await ask(draftPrompt(writing.brief, settings.writing, path, settings.themeKey), { display: `大纲确认，开始写作《${title}》`, doc: path, docContent: '' })
  }
  // 写作完成后退出写作流程（稍作等待：磁盘改动的检测略有延迟）
  const drafting = writing?.phase === 'drafting'
  useEffect(() => {
    if (!drafting || state.running) return
    const timer = window.setTimeout(() => {
      const w = getAgentState().writing
      setWriting(undefined)
      if (w?.docPath) onDraftDone(w.docPath, w.title || '')
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [drafting, state.running])

  // “新对话”后的第一条消息新建 ACP 会话
  const freshNext = useRef(false)
  const newChat = async () => {
    if (state.running) await api.ai.cancel('chat')
    clearChat()
    freshNext.current = true
  }

  const statusText = { idle: '未连接', starting: '连接中…', ready: '已连接', error: '连接出错' }[state.status]
  // 下拉中只列已安装的 Agent（当前 Agent 总是列出）
  const agents = settings.ai.agents.filter((a) => a.installed || a.id === agent?.id)

  return (
    <div className="agent-panel">
      <div className="agent-head">
        <Popover
          className="agent-picker"
          trigger={(open) => (
            <span className={`agent-trigger${open ? ' on' : ''}`} title={state.info ? `${state.info.name} ${state.info.version || ''}` : statusText}>
              <span className="agent-avatar">
                {(agent?.name.trim()[0] || '?').toUpperCase()}
                <i className={`agent-dot ${state.status}`} />
              </span>
              <span className="agent-trigger-text">
                <b>{agent?.name || '未选择 Agent'}</b>
                <small>{statusText}</small>
              </span>
              <ChevronDown size={14} />
            </span>
          )}
        >
          {(close) => (
            <div className="agent-menu">
              {agents.map((a) => (
                <button
                  key={a.id}
                  className={a.id === agent?.id ? 'active' : ''}
                  onClick={() => {
                    if (a.id !== agent?.id) onSwitchAgent(a.id)
                    close()
                  }}
                >
                  <span className="agent-avatar sm">{(a.name.trim()[0] || '?').toUpperCase()}</span>
                  {a.name}
                  {a.id === agent?.id && <Check size={13} />}
                </button>
              ))}
              <div className="menu-sep" />
              <button
                onClick={() => {
                  close()
                  onSettings()
                }}
              >
                <Blocks size={14} />
                管理 Agent…
              </button>
            </div>
          )}
        </Popover>
        <span className="grow" />
        <button className={`icon-btn sm${composing ? ' active' : ''}`} title="写文章" onClick={() => setComposing((v) => !v)}>
          <PenLine size={15} />
        </button>
        <button className="icon-btn sm" title="新对话" onClick={newChat}>
          <Plus size={16} />
        </button>
        <button className="icon-btn sm" title="配置 Agent" onClick={onSettings}>
          <Blocks size={15} />
        </button>
      </div>

      <div
        className="agent-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {composing && <WritingCard settings={settings} onCancel={() => setComposing(false)} onSubmit={startOutline} />}
        {composing ? null : state.items.length === 0 ? (
          <div className="agent-empty">
            <Bot size={28} strokeWidth={1.5} />
            <p>Agent 的修改会先展示差异，确认后才应用</p>
            {state.status === 'error' && state.error && <pre className="agent-error">{state.error}</pre>}
            <div className="quick-prompts">
              <button className="accent" onClick={() => setComposing(true)}>
                <PenLine size={12} /> 写文章
              </button>
              {QUICK_PROMPTS.map((q) => (
                <button key={q.label} onClick={() => send(q.text)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          state.items.map((item) => <ChatRow key={item.id} item={item} />)
        )}
        {state.status === 'error' && state.items.length > 0 && state.error && <pre className="agent-error">{state.error}</pre>}
      </div>

      {writing?.phase === 'outline' && !state.running && lastReply && (
        <div className="writing-bar">
          <span>满意就开始写作，或继续提修改意见</span>
          <button className="btn ghost" onClick={() => setWriting(undefined)}>
            退出
          </button>
          <button className="btn primary" onClick={startDraft}>
            开始写作
          </button>
        </div>
      )}
      {drafting && (
        <div className="writing-bar">
          <Loader2 size={13} className="spin" />
          <span>正在写入《{writing?.title}》…</span>
        </div>
      )}
      <div className="agent-composer">
        {quote && (
          <div className="quote-chip">
            <Quote size={12} />
            <span>{quote}</span>
            <button onClick={() => setQuote(null)} aria-label="移除引用">
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          ref={inputRef}
          value={input}
          rows={3}
          placeholder={writing?.phase === 'outline' ? '对大纲提意见，如：第二部分再展开一些…' : `向 ${agent?.name || 'Agent'} 提问或下达修改指令…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="composer-bar">
          <button
            className="chip-btn"
            title="把编辑器中的选中内容作为引用附带给 Agent"
            onClick={() => {
              const sel = getSelection().trim()
              setQuote(sel || null)
              inputRef.current?.focus()
            }}
          >
            <Quote size={13} /> 引用选区
          </button>
          <span className="grow" />
          {state.running ? (
            <button className="send-btn stop" title="停止" onClick={() => api.ai.cancel('chat')}>
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button className="send-btn" title="发送（Enter）" disabled={!input.trim()} onClick={() => send()}>
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function WritingCard({
  settings,
  onCancel,
  onSubmit
}: {
  settings: AppSettings
  onCancel(): void
  onSubmit(topic: string, styleId: string, length: WritingLength): void
}) {
  const { styles, defaultStyleId, length: defaultLength } = settings.writing
  const [topic, setTopic] = useState('')
  const [styleId, setStyleId] = useState(defaultStyleId)
  const [length, setLength] = useState<WritingLength>(defaultLength)
  const submit = () => topic.trim() && onSubmit(topic.trim(), styleId, length)
  return (
    <div className="writing-card">
      <div className="writing-card-head">
        <PenLine size={14} />
        写文章
      </div>
      <textarea
        autoFocus
        rows={3}
        value={topic}
        placeholder="想写什么？如：为什么越来越多年轻人开始写日记"
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <label>风格</label>
      <div className="writing-chips">
        {styles.map((s) => (
          <button key={s.id} className={s.id === styleId ? 'active' : ''} title={s.description} onClick={() => setStyleId(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <label>篇幅</label>
      <div className="writing-chips">
        {WRITING_LENGTHS.map((l) => (
          <button key={l.key} className={l.key === length ? 'active' : ''} title={`约 ${l.words} 字`} onClick={() => setLength(l.key)}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="row end">
        <button className="btn ghost" onClick={onCancel}>
          取消
        </button>
        <button className="btn primary" disabled={!topic.trim()} onClick={submit}>
          生成大纲
        </button>
      </div>
    </div>
  )
}

function ChatRow({ item }: { item: ChatItem }) {
  if (item.kind === 'user') {
    return (
      <div className="msg-user">
        {item.selection && <div className="msg-quote">{item.selection}</div>}
        <div>{item.text}</div>
      </div>
    )
  }
  if (item.kind === 'permission') return <PermissionCard item={item} />
  if (item.kind === 'write') {
    const label = { pending: '待审阅', accepted: '已接受', rejected: '已拒绝', partial: '部分接受' }[item.state]
    return (
      <div className={`msg-write ${item.state}`}>
        <FileDiff size={14} />
        <span>
          {item.source === 'disk' && !item.duringTurn ? '检测到文件被修改' : '修改了'} {basename(item.path)}
        </span>
        <em>{label}</em>
      </div>
    )
  }
  return <AgentMessage item={item} />
}

function AgentMessage({ item }: { item: Extract<ChatItem, { kind: 'agent' }> }) {
  const isDraft = item.draft !== undefined
  // 初稿正文流式写入编辑区，对话中只显示进度
  const html = useMemo(() => (isDraft ? '' : renderAgentMarkdown(item.text)), [item.text, isDraft])
  const [showThought, setShowThought] = useState(false)
  const waiting = item.running && !item.text && !item.tools.length && !item.thought
  return (
    <div className="msg-agent">
      {item.thought && (
        <div className="msg-thought">
          <button onClick={() => setShowThought((v) => !v)}>
            <Brain size={13} /> 思考过程
            <ChevronRight size={13} className={showThought ? 'open' : ''} />
          </button>
          {showThought && <div className="thought-text">{item.thought}</div>}
        </div>
      )}
      {item.plan.length > 0 && (
        <ul className="msg-plan">
          {item.plan.map((p, i) => (
            <li key={i} className={p.status}>
              {p.status === 'completed' ? <CheckCircle2 size={13} /> : p.status === 'in_progress' ? <Loader2 size={13} className="spin" /> : <Circle size={13} />}
              {p.content}
            </li>
          ))}
        </ul>
      )}
      {item.tools.length > 0 && (
        <div className="msg-tools">
          {item.tools.map((t) => (
            <ToolChip key={t.id} tool={t} />
          ))}
        </div>
      )}
      {isDraft && item.text ? (
        <div className="msg-draft">
          {item.running ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
          {item.running ? '正在写入' : '已写入'}《{item.draft || '新文档'}》 · {countWords(item.text).toLocaleString()} 字
        </div>
      ) : (
        item.text && <div className="msg-text" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {waiting && (
        <div className="msg-waiting">
          <Loader2 size={14} className="spin" /> 正在思考…
        </div>
      )}
      {item.error && <div className="msg-error">{item.error}</div>}
    </div>
  )
}

/** 标题里的绝对路径只显示文件名 */
const shortenPaths = (text: string) => text.replace(/(?:[A-Za-z]:)?(?:[\\/][^\s\\/]+)+[\\/]([^\s\\/]+)/g, '$1')

function ToolChip({ tool }: { tool: ToolCallView }) {
  const icon =
    tool.status === 'completed' ? (
      <CheckCircle2 size={13} />
    ) : tool.status === 'failed' ? (
      <XCircle size={13} />
    ) : tool.status === 'in_progress' ? (
      <Loader2 size={13} className="spin" />
    ) : (
      <TerminalSquare size={13} />
    )
  const title = shortenPaths(tool.title)
  return (
    <div className={`tool-chip ${tool.status || ''}`} title={tool.title}>
      {icon}
      <span>{title}</span>
    </div>
  )
}

function PermissionCard({ item }: { item: Extract<ChatItem, { kind: 'permission' }> }) {
  const { permission, chosen } = item
  return (
    <div className={`perm-card${chosen ? ' done' : ''}`}>
      <div className="perm-title">Agent 请求权限</div>
      <div className="perm-desc" title={permission.title}>
        {shortenPaths(permission.title)}
      </div>
      {chosen ? (
        <div className="perm-chosen">已选择：{chosen}</div>
      ) : (
        <div className="perm-actions">
          {permission.options.map((o) => (
            <button
              key={o.optionId}
              className={`btn ${o.kind.startsWith('allow') ? (o.kind === 'allow_once' ? 'primary' : '') : 'ghost'}`}
              onClick={() => {
                api.ai.respondPermission(permission.requestId, o.optionId)
                markPermission(permission.requestId, o.name)
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
