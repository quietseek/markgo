import { WRITING_LENGTHS, type WritingConfig, type WritingLength, type WritingStyle } from '@shared/types'

export interface WritingBrief {
  topic: string
  style: WritingStyle
  length: WritingLength
}

const words = (length: WritingLength) => WRITING_LENGTHS.find((l) => l.key === length)?.words ?? 1500

function requirements(brief: WritingBrief, config: WritingConfig) {
  return [
    `话题：${brief.topic}`,
    `写作风格：${brief.style.name}——${brief.style.description}`,
    config.audience.trim() && `目标读者：${config.audience.trim()}`,
    `篇幅：约 ${words(brief.length)} 字`,
    config.extra.trim() && `补充要求：${config.extra.trim()}`
  ]
    .filter(Boolean)
    .join('\n')
}

/** 第一步：只出大纲，等待讨论 */
export function outlinePrompt(brief: WritingBrief, config: WritingConfig) {
  return `我想写一篇文章，请先拟定大纲。现在不要写正文，也不要创建或修改任何文件。

${requirements(brief, config)}

请按以下格式回复：
1. 第一行用「# 」给出建议标题；
2. 用多级列表列出各部分的要点，每部分注明大致字数；
3. 最后用一两句话说明整体思路。

之后我们会讨论并修改大纲，等我确认后再开始写作。`
}

/** 第二步：按确认的大纲写入新文档 */
export function draftPrompt(brief: WritingBrief, config: WritingConfig, path: string) {
  return `大纲已确认。请按我们最终确认的大纲撰写全文，写入文件：${path}（已创建，内容为空）。

${requirements(brief, config)}

要求：使用 Markdown，第一行为「# 标题」；不要修改其他文件。写完后简单说明即可，不必在回复中重复全文。`
}

/** 从大纲回复中取建议标题 */
export function outlineTitle(text: string) {
  const m = text.match(/^\s*#\s+(.+)$/m)
  return m ? m[1].replace(/[*_`《》]/g, '').trim() : ''
}
