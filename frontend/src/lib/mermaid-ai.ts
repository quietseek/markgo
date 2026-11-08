import { inlinePrompt, runChannel } from './ai'

/** Accept either bare Mermaid or a single Mermaid fenced block, without prose. */
export function cleanMermaid(text: string): string {
  const value = text.trim().replace(/\r\n/g, '\n')
  const fence = value.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i)
  return (fence ? fence[1] : value).trim()
}

export async function generateMermaid(description: string, onText: (code: string) => void, signal: AbortSignal): Promise<string> {
  let text = ''
  const result = await runChannel({
    channel: `mermaid-${crypto.randomUUID()}`,
    fresh: true,
    text: inlinePrompt('根据用户描述生成一个 Mermaid 11 图表。选择合适的图表类型（流程图、时序图、状态图、类图、ER 图等）。只输出可直接渲染的 Mermaid 源码，不要 Markdown 代码围栏、解释或 HTML。节点 ID 使用英文字母，中文标签用双引号包裹。不要使用初始化指令、外部资源、链接或点击事件。'),
    selection: description
  }, (chunk) => { text += chunk; onText(cleanMermaid(text)) }, signal)
  if (signal.aborted || result.stopReason === 'cancelled') throw new DOMException('已取消', 'AbortError')
  const code = cleanMermaid(text)
  if (!code) throw new Error('AI 没有返回图表，请调整描述后重试')
  return code
}
