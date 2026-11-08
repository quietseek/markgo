import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanMermaid, generateMermaid } from '../src/lib/mermaid-ai'
import { runChannel } from '../src/lib/ai'

vi.mock('../src/lib/ai', () => ({ inlinePrompt: (s: string) => s, runChannel: vi.fn() }))

describe('AI Mermaid generation', () => {
  beforeEach(() => vi.clearAllMocks())
  it('unwraps Mermaid fences while preserving diagram syntax and Chinese labels', () => {
    expect(cleanMermaid('```mermaid\r\nflowchart LR\r\n A["开始"] --> B["发布"]\r\n```')).toBe('flowchart LR\n A["开始"] --> B["发布"]')
    expect(cleanMermaid('sequenceDiagram\n A->>B: Hello')).toBe('sequenceDiagram\n A->>B: Hello')
  })
  it('streams and returns a complete diagram on an isolated channel', async () => {
    vi.mocked(runChannel).mockImplementation(async (_input, onText) => {
      onText('```mermaid\nflowchart LR\n'); onText(' A --> B\n```')
      return { stopReason: 'end_turn' }
    })
    const result = await generateMermaid('发布流程', vi.fn(), new AbortController().signal)
    expect(result).toBe('flowchart LR\n A --> B')
    expect(vi.mocked(runChannel).mock.calls[0][0]).toMatchObject({ fresh: true, selection: '发布流程', channel: expect.stringMatching(/^mermaid-/) })
  })
  it('rejects an empty or cancelled generation instead of presenting it as complete', async () => {
    vi.mocked(runChannel).mockResolvedValue({ stopReason: 'end_turn' })
    await expect(generateMermaid('x', vi.fn(), new AbortController().signal)).rejects.toThrow('没有返回图表')
    vi.mocked(runChannel).mockResolvedValue({ stopReason: 'cancelled' })
    await expect(generateMermaid('x', vi.fn(), new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
