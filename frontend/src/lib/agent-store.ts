import { useSyncExternalStore } from 'react'
import type { AgentEvent, AgentInfo, AgentStatus, PermissionView, ToolCallView, WriteProposal } from '@shared/types'
import type { WritingBrief } from './writing'

export type ChatItem =
  | { id: number; kind: 'user'; text: string; selection?: string }
  | {
      id: number
      kind: 'agent'
      text: string
      thought: string
      tools: ToolCallView[]
      plan: { content: string; status: string }[]
      running: boolean
      error?: string
      /** AI 写作的初稿回复（文章标题）：正文流式写入文档，对话中只显示进度 */
      draft?: string
    }
  | { id: number; kind: 'permission'; permission: PermissionView; chosen?: string }
  | {
      id: number
      kind: 'write'
      path: string
      source: WriteProposal['source']
      duringTurn?: boolean
      state: 'pending' | 'accepted' | 'rejected' | 'partial'
    }

export interface AgentState {
  status: AgentStatus
  info?: AgentInfo
  error?: string
  items: ChatItem[]
  running: boolean
  /** 等待用户审阅的写入提议（队列，先到先审） */
  proposals: WriteProposal[]
  /** 写作流程：先讨论大纲（outline），确认后写入新文档（drafting） */
  writing?: WritingSession
}

export interface WritingSession {
  brief: WritingBrief
  phase: 'outline' | 'drafting'
  /** 写作阶段的目标文档：Agent 对它的写入直接应用，无需逐处审阅 */
  docPath?: string
  title?: string
}

let state: AgentState = { status: 'idle', items: [], running: false, proposals: [] }
let seq = 0
const listeners = new Set<() => void>()
const set = (next: Partial<AgentState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

/** 内联 AI 等其他频道的订阅者 */
const channelListeners = new Map<string, (e: AgentEvent) => void>()
export function onChannel(channel: string, cb: (e: AgentEvent) => void) {
  channelListeners.set(channel, cb)
  return () => channelListeners.delete(channel)
}

function updateLastAgent(fn: (item: Extract<ChatItem, { kind: 'agent' }>) => Extract<ChatItem, { kind: 'agent' }>) {
  const items = [...state.items]
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'agent') {
      items[i] = fn(it)
      set({ items })
      return
    }
    if (it.kind === 'user') break
  }
  // 当前轮次还没有 Agent 条目（例如先收到权限请求）时新建
  const draft = state.writing?.phase === 'drafting' ? (state.writing.title ?? '') : undefined
  const created = fn({ id: ++seq, kind: 'agent', text: '', thought: '', tools: [], plan: [], running: true, draft })
  set({ items: [...state.items, created] })
}

/** 最近一次 AI 写作初稿回复的原文（流式累积） */
export function lastDraftText(items: ChatItem[] = state.items): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'agent' && it.draft !== undefined) return it.text
  }
  return ''
}

/** 单独打开文档的窗口只处理本窗口发起的频道（内联 AI 等），对话与写入审阅由主窗口处理 */
export function handleChannelEvent(e: AgentEvent) {
  if (e.type !== 'status' && e.type !== 'write' && e.channel !== 'chat') channelListeners.get(e.channel)?.(e)
}

export function handleAgentEvent(e: AgentEvent) {
  if (e.type === 'status') {
    set({ status: e.status, info: e.info ?? state.info, error: e.error })
    if (e.status === 'error' || e.status === 'idle') {
      // 进程退出：结束进行中的轮次，丢弃无法再回应的审阅
      if (state.running) finishTurn(e.error)
      set({ proposals: [] })
    }
    return
  }
  if (e.type === 'write') {
    const proposal: WriteProposal = { ...e.proposal, duringTurn: state.running }
    // Agent 连续多次编辑同一文件（磁盘改动）时合并为一次审阅：保留最初的“修改前”，更新为最新的“修改后”
    const pending = state.proposals.find((p) => p.source === 'disk' && proposal.source === 'disk' && p.path === proposal.path)
    if (pending) {
      window.markgo.ai.resolveWrite(pending.requestId, false)
      set({
        proposals: state.proposals.map((p) =>
          p === pending ? { ...proposal, before: pending.before, duringTurn: pending.duringTurn || proposal.duringTurn } : p
        )
      })
      return
    }
    // 写入提议无论来自哪个频道都进入编辑区审阅队列
    set({
      proposals: [...state.proposals, proposal],
      items: [
        ...state.items,
        { id: ++seq, kind: 'write', path: proposal.path, source: proposal.source, duringTurn: proposal.duringTurn, state: 'pending' }
      ]
    })
    return
  }
  if (e.channel !== 'chat') {
    channelListeners.get(e.channel)?.(e)
    return
  }
  switch (e.type) {
    case 'message':
      updateLastAgent((a) => ({ ...a, text: a.text + e.text }))
      break
    case 'thought':
      updateLastAgent((a) => ({ ...a, thought: a.thought + e.text }))
      break
    case 'tool':
      updateLastAgent((a) => {
        const idx = a.tools.findIndex((t) => t.id === e.tool.id)
        const tools = idx >= 0 ? a.tools.map((t, i) => (i === idx ? e.tool : t)) : [...a.tools, e.tool]
        return { ...a, tools }
      })
      break
    case 'plan':
      updateLastAgent((a) => ({ ...a, plan: e.entries }))
      break
    case 'permission':
      set({ items: [...state.items, { id: ++seq, kind: 'permission', permission: e.permission }] })
      break
    case 'done':
      finishTurn()
      break
    case 'error':
      finishTurn(e.error)
      break
  }
}

function finishTurn(error?: string) {
  updateLastAgent((a) => ({ ...a, running: false, error: error ?? a.error }))
  set({ running: false })
}

export function addUserMessage(text: string, selection?: string) {
  set({
    running: true,
    items: [
      ...state.items,
      { id: ++seq, kind: 'user', text, selection },
      { id: ++seq, kind: 'agent', text: '', thought: '', tools: [], plan: [], running: true }
    ]
  })
}

export function markPermission(requestId: string, chosen: string) {
  set({
    items: state.items.map((it) => (it.kind === 'permission' && it.permission.requestId === requestId ? { ...it, chosen } : it))
  })
}

/** 审阅完成：出队并在对话中记录结果 */
export function resolveProposal(requestId: string, result: 'accepted' | 'rejected' | 'partial') {
  const proposal = state.proposals.find((p) => p.requestId === requestId)
  const items = [...state.items]
  if (proposal) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (it.kind === 'write' && it.path === proposal.path && it.state === 'pending') {
        items[i] = { ...it, state: result }
        break
      }
    }
  }
  set({ proposals: state.proposals.filter((p) => p.requestId !== requestId), items })
}

export function clearChat() {
  set({ items: state.items.filter((it) => it.kind === 'write' && it.state === 'pending'), running: false, writing: undefined })
}

export function setWriting(writing: WritingSession | undefined) {
  set({ writing })
}

export function getAgentState() {
  return state
}

export function useAgentState(): AgentState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}
