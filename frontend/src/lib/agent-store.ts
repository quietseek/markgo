import { useSyncExternalStore } from 'react'
import type { AgentEvent, AgentInfo, AgentStatus, Conversation, PermissionView, ToolCallView, WriteProposal } from '@shared/types'
import type { WritingBrief } from './writing'

export type ChatItem =
  | { id: number; kind: 'user'; text: string; selection?: string }
  | {
      id: number
      kind: 'agent'
      /** Only adjacent chunks of the same kind share a row. */
      segment?: 'message' | 'thought' | 'tool' | 'plan'
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
  documentId?: string
  conversation?: Conversation
  conversations: Conversation[]
  loading: boolean
  historyError?: string
  restorePending?: boolean
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

let state: AgentState = { status: 'idle', items: [], running: false, proposals: [], conversations: [], loading: false }
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

type AgentItem = Extract<ChatItem, { kind: 'agent' }>

function endSegments(items: ChatItem[]): ChatItem[] {
  return items.map((item) => item.kind === 'agent' && item.running ? { ...item, running: false } : item)
}

function updateAgentSegment(segment: NonNullable<AgentItem['segment']>, fn: (item: AgentItem) => AgentItem) {
  const items = [...state.items]
  const last = items.at(-1)
  // Reuse the empty reply placeholder or an adjacent segment. Never reach back
  // across thoughts, tools, permissions or writes to append later prose.
  if (last?.kind === 'agent' && (last.segment === undefined || last.segment === segment)) {
    items[items.length - 1] = fn({ ...last, segment })
    set({ items })
    return
  }
  const draft = state.writing?.phase === 'drafting' ? (state.writing.title ?? '') : undefined
  const created = fn({ id: ++seq, kind: 'agent', segment, text: '', thought: '', tools: [], plan: [], running: state.running, draft })
  set({ items: [...endSegments(items), created] })
}

function updateTool(tool: ToolCallView) {
  // Status updates belong to the original tool card, even when later text has
  // arrived. Tool IDs are scoped to the current user turn here.
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i]
    if (item.kind === 'user') break
    if (item.kind === 'agent' && item.tools.some((t) => t.id === tool.id)) {
      const items = [...state.items]
      items[i] = { ...item, tools: item.tools.map((t) => t.id === tool.id ? tool : t) }
      set({ items })
      return
    }
  }
  updateAgentSegment('tool', (item) => ({ ...item, tools: [...item.tools, tool] }))
}

/** 最近一次 AI 写作初稿回复的原文（流式累积） */
export function lastDraftText(items: ChatItem[] = state.items): string {
  const parts: string[] = []
  let found = false
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'user' && found) break
    if (it.kind === 'agent' && it.draft !== undefined) {
      found = true
      parts.push(it.text)
    }
  }
  return parts.reverse().join('')
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
        ...endSegments(state.items),
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
      updateAgentSegment('message', (a) => ({ ...a, text: a.text + e.text }))
      break
    case 'thought':
      updateAgentSegment('thought', (a) => ({ ...a, thought: a.thought + e.text }))
      break
    case 'tool':
      updateTool(e.tool)
      break
    case 'plan':
      updateAgentSegment('plan', (a) => ({ ...a, plan: e.entries }))
      break
    case 'permission':
      set({ items: [...endSegments(state.items), { id: ++seq, kind: 'permission', permission: e.permission }] })
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
  if (error) updateAgentSegment('message', (a) => ({ ...a, error }))
  set({ items: endSegments(state.items), running: false })
}

export function addUserMessage(text: string, selection?: string) {
  // 正常事件流会复用这个占位条目，必须在创建时标记初稿，供编辑区提取正文。
  const draft = state.writing?.phase === 'drafting' ? (state.writing.title ?? '') : undefined
  set({
    running: true,
    items: [
      ...state.items,
      { id: ++seq, kind: 'user', text, selection },
      { id: ++seq, kind: 'agent', text: '', thought: '', tools: [], plan: [], running: true, draft }
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
  set({ items: state.items.filter((it) => it.kind === 'write' && it.state === 'pending'), running: false, writing: undefined, conversation: undefined, historyError: undefined, restorePending: false })
}

export function deactivateChatDocument() {
  clearChat()
  set({ documentId: undefined, conversations: [], restorePending: false })
}

export function setChatLoading(loading: boolean) { set({ loading }) }

export function restoreRecentConversation(agentId: string) {
  if (!state.restorePending || chatBusy()) return
  set({ restorePending: false })
  const recent = state.conversations.find((c) => c.agentId === agentId)
  if (recent) void restoreConversation(recent)
}

export function chatBusy() {
  return state.running || state.loading || state.proposals.length > 0
}

export function rememberConversation(conversation: Conversation) {
  set({ conversation, conversations: [conversation, ...state.conversations.filter((c) => c.id !== conversation.id)] })
}

export async function refreshConversations() {
  if (!state.documentId) return
  const documentId = state.documentId
  const conversations = await window.markgo.history.list(documentId)
  if (state.documentId === documentId) set({ conversations })
}

// Apply replay only after session/load succeeds; partial failed replays never
// appear as a successfully restored conversation or trigger writing workflows.
export function replayConversation(events: AgentEvent[]) {
  set({ items: [], writing: undefined, running: false })
  for (const event of events) {
    if (event.type === 'user') {
      const items = state.items.map((it) => it.kind === 'agent' ? { ...it, running: false } : it)
      const last = items.at(-1)
      if (last?.kind === 'user') items[items.length - 1] = { ...last, text: last.text + event.text, selection: event.selection ?? last.selection }
      else items.push({ id: ++seq, kind: 'user', text: event.text, selection: event.selection })
      set({ items })
    } else if (['message', 'thought', 'tool', 'plan'].includes(event.type)) {
      handleAgentEvent(event)
    }
  }
  set({ items: state.items.map((it) => it.kind === 'agent' ? { ...it, running: false } : it), running: false })
}

export async function restoreConversation(conversation: Conversation) {
  if (chatBusy()) return
  clearChat()
  set({ loading: true, conversation, historyError: undefined })
  try {
    const result = await window.markgo.history.load(conversation.id)
    replayConversation(result.events)
    rememberConversation(result.conversation)
  } catch (err) {
    set({ historyError: String(err instanceof Error ? err.message : err) })
  } finally {
    set({ loading: false })
  }
}

export async function activateChatDocument(path: string, preserve = false) {
  if (chatBusy()) throw new Error('请先结束当前 AI 对话并完成修改审阅，再切换文章')
  set({ loading: true })
  try {
    const doc = await window.markgo.history.document(path)
    if (state.documentId === doc.id) return
    if (preserve && state.conversation) {
      const conversation = await window.markgo.history.bind(state.conversation.id, path)
      set({ documentId: doc.id, conversation })
      await refreshConversations()
      return
    }
    clearChat()
    set({ documentId: doc.id, conversations: [] })
    await refreshConversations()
    set({ restorePending: true })
  } catch (err) {
    clearChat()
    set({ documentId: undefined, conversations: [], historyError: String(err instanceof Error ? err.message : err) })
  } finally {
    set({ loading: false })
  }
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
