import type { PromptInput } from '@shared/types'
import { onChannel } from './agent-store'

/** 内联类请求的统一约束：只要结果文本，不要工具调用 */
export const INLINE_RULES =
  '要求：只输出处理后的 Markdown 正文本身；不要任何解释、前言或总结；不要用代码块包裹；不要调用工具，不要读取或修改任何文件。'

export const inlinePrompt = (instruction: string) => `[MarkGo 内联编辑] ${instruction}\n${INLINE_RULES}`

/** Agent 偶尔会用代码块或引号包裹结果，去掉这层包装 */
export function cleanResult(text: string): string {
  let t = text.trim()
  const fence = t.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/)
  if (fence) t = fence[1].trim()
  if (/^"""[\s\S]*"""$/.test(t)) t = t.slice(3, -3).trim()
  return t
}

/**
 * 在独立频道上运行一次请求，流式回调文本。以频道内的 done / error 事件作为结束信号：
 * 它们保证在最后一个文本片段之后到达，而 prompt 调用本身的返回可能更早。
 */
export function runChannel(input: PromptInput, onText: (text: string) => void): Promise<{ stopReason: string }> {
  return new Promise((resolve, reject) => {
    const off = onChannel(input.channel, (e) => {
      if (e.type === 'message') onText(e.text)
      else if (e.type === 'done') {
        off()
        resolve({ stopReason: e.stopReason })
      } else if (e.type === 'error') {
        off()
        reject(new Error(e.error))
      }
    })
    window.markgo.ai.prompt(input).then((res) => {
      // Agent 启动失败等情况不会产生频道事件
      if (!res.ok) {
        off()
        reject(new Error(res.error || '请求失败'))
      }
    })
  })
}

let seq = Math.floor(Math.random() * 1e9)

/** 一次性请求：新建独立会话，返回清理后的完整回复 */
export async function askOnce(instruction: string, source: string): Promise<string> {
  let text = ''
  await runChannel({ channel: `oneshot-${++seq}`, fresh: true, text: inlinePrompt(instruction), selection: source }, (t) => (text += t))
  return cleanResult(text)
}
