import { beforeEach, describe, expect, it } from 'vitest'
import { addUserMessage, clearChat, getAgentState, handleAgentEvent, lastDraftText, setWriting } from '../src/lib/agent-store'

const brief = { topic: '测试文章', style: { id: 's', name: '干货', description: '清晰' }, length: 'long' as const }

beforeEach(() => clearChat())

describe('writing reply routing', () => {
  it.each(['测试文章', undefined])('keeps streamed draft text available for document writing (title: %s)', (title) => {
    setWriting({ brief, phase: 'drafting', docPath: '/notes/draft.md', title })
    addUserMessage('大纲确认，开始写作')

    const chunks = ['---\ntitle: 测试文章\n---\n', '\n# 测试文章\n\n正文']
    for (const [index, text] of chunks.entries()) {
      handleAgentEvent({ type: 'message', channel: 'chat', text })
      expect(lastDraftText()).toBe(chunks.slice(0, index + 1).join(''))
    }
    handleAgentEvent({ type: 'done', channel: 'chat', stopReason: 'end_turn' })
    setWriting(undefined)
    expect(lastDraftText()).toBe(chunks.join(''))
    expect(getAgentState().items.at(-1)).toMatchObject({ kind: 'agent', draft: title ?? '', running: false })
  })

  it.each(['outline', undefined] as const)('keeps ordinary and outline replies in chat (phase: %s)', (phase) => {
    if (phase) setWriting({ brief, phase })
    addUserMessage('请回复')
    handleAgentEvent({ type: 'message', channel: 'chat', text: '# 建议标题\n\n要点' })
    expect(lastDraftText()).toBe('')
    const reply = getAgentState().items.at(-1)
    expect(reply).toMatchObject({ kind: 'agent', text: '# 建议标题\n\n要点' })
    expect(reply && 'draft' in reply ? reply.draft : undefined).toBeUndefined()
  })
})
