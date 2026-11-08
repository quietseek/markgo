import { beforeEach, expect, it, vi } from 'vitest'
import { runChannel } from '../src/lib/ai'
import { onChannel } from '../src/lib/agent-store'

vi.mock('../src/lib/agent-store', () => ({ onChannel: vi.fn() }))
const off = vi.fn()
const prompt = vi.fn()
const cancel = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(onChannel).mockReturnValue(off)
  Object.defineProperty(window, 'markgo', { configurable: true, value: { ai: { prompt, cancel } } })
  cancel.mockResolvedValue(undefined)
})

it('propagates transport errors and removes the channel listener', async () => {
  prompt.mockRejectedValue(new Error('connection lost'))
  await expect(runChannel({ channel: 'mermaid-1', text: 'diagram' }, vi.fn())).rejects.toThrow('connection lost')
  expect(off).toHaveBeenCalledOnce()
})

it('cancels only its own generation and removes listeners when the dialog closes', async () => {
  prompt.mockReturnValue(new Promise(() => {}))
  const controller = new AbortController()
  const request = runChannel({ channel: 'mermaid-2', text: 'diagram' }, vi.fn(), controller.signal)
  controller.abort()
  await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  expect(cancel).toHaveBeenCalledWith('mermaid-2')
  expect(off).toHaveBeenCalledOnce()
})
