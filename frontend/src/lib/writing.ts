import { WRITING_LENGTHS, type WritingConfig, type WritingLength, type WritingStyle } from '@shared/types'

export interface WritingBrief {
  topic: string
  style: WritingStyle
  length: WritingLength
}

const lengthHint = (length: WritingLength) => {
  const l = WRITING_LENGTHS.find((x) => x.key === length) ?? WRITING_LENGTHS[1]
  return `${l.label}，约 ${l.words} 字（以内容完整为准，不必严格控制字数）`
}

function requirements(brief: WritingBrief, config: WritingConfig) {
  return [
    `话题：${brief.topic}`,
    `写作风格：${brief.style.name}——${brief.style.description}`,
    config.audience.trim() && `目标读者：${config.audience.trim()}`,
    `篇幅：${lengthHint(brief.length)}`,
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
2. 用多级列表列出各部分的要点；
3. 最后用一两句话说明整体思路。

之后我们会讨论并修改大纲，等我确认后再开始写作。`
}

/** 本地时间的 ISO 8601 写法，带时区偏移：2026-10-10T11:38:29+08:00 */
export function localIsoTime(date = new Date()) {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const tz = `${offset >= 0 ? '+' : '-'}${pad(offset / 60)}:${pad(offset % 60)}`
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${tz}`
}

/** 文章开头的元信息：由 Agent 按全文填写，主题与时间由应用给出 */
function frontMatterSpec(themeKey: string, now: Date) {
  return `---
title: 文章标题
slug: 英文小写、以连字符分隔的短链接，如 ruankao-architecture-key-topics
summary: 一两句话的摘要，不超过 120 字
category: 一个简短的分类
status: draft
theme: ${themeKey}
tags:
  - 标签（3～6 个）
updated_at: ${localIsoTime(now)}
---`
}

/** 第二步：按确认的大纲写入新文档 */
export function draftPrompt(brief: WritingBrief, config: WritingConfig, path: string, themeKey: string, now = new Date()) {
  return `大纲已确认。请按我们最终确认的大纲撰写全文，目标文件：${path}（已创建，内容为空，由 MarkGo 写入）。

${requirements(brief, config)}

要求：
1. 文件开头写 YAML 元信息，字段与格式如下（按全文内容填写；status、theme、updated_at 原样保留）：

${frontMatterSpec(themeKey, now)}

2. 元信息之后是正文，使用 Markdown，正文第一行为「# 标题」，与元信息中的 title 一致。
3. 直接在回复中输出完整文章（从第一行 --- 开始），MarkGo 会把你的回复实时写入该文件；不要调用工具，不要读取或修改任何文件，不要用代码块包裹全文，文章前后也不要任何说明。`
}

/**
 * 从初稿回复中取出文章：去掉 Agent 偶尔加的代码块包裹与开头说明。
 * 流式过程中也可调用（结尾的代码块可能尚未出现）
 */
export function extractDraft(text: string): string {
  let t = text.replace(/^\s*```(?:markdown|md)?[ \t]*\n/, '')
  // 只在 --- 之后像元信息（key: value）时才认作文章开头，避免把正文中的分割线当成起点
  const start = t.search(/^---[ \t]*\n[\w-]+:/m)
  if (start > 0 && start < 400) t = t.slice(start)
  return t.replace(/\n```\s*$/, '\n').trimEnd()
}

/** 从大纲回复中取建议标题 */
export function outlineTitle(text: string) {
  const m = text.match(/^\s*#\s+(.+)$/m)
  return m ? m[1].replace(/[*_`《》]/g, '').trim() : ''
}
