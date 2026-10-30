/**
 * AI 修改审阅：把 Markdown 按块（段落、标题、列表、表格、代码块…）做差异比较，
 * 每一处连续的改动是一个 hunk，可单独接受或拒绝，最后合成为新的 Markdown。
 */
import { diffArrays, diffWords, type ChangeObject } from 'diff'
import { Lexer } from 'marked'

export interface Hunk {
  id: number
  before: string[]
  after: string[]
}

export type DiffPart = { kind: 'same'; blocks: string[] } | { kind: 'change'; hunk: Hunk }

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

/** 拆分为顶层 Markdown 块，保留每块的原始文本 */
export function splitBlocks(md: string): string[] {
  const text = md.replace(/\r\n/g, '\n')
  const blocks: string[] = []
  let body = text
  const fm = text.match(FRONT_MATTER)
  if (fm) {
    blocks.push(fm[0].trimEnd())
    body = text.slice(fm[0].length)
  }
  for (const token of new Lexer({ gfm: true }).lex(body)) {
    if (token.type === 'space') continue
    const raw = token.raw.replace(/\n+$/, '')
    if (raw.trim()) blocks.push(raw)
  }
  return blocks
}

const normalize = (block: string) => block.replace(/[ \t]+$/gm, '').trim()

export function diffBlocks(before: string, after: string): DiffPart[] {
  const changes = diffArrays(splitBlocks(before), splitBlocks(after), {
    comparator: (a: string, b: string) => normalize(a) === normalize(b)
  })
  const parts: DiffPart[] = []
  let id = 0
  for (const c of changes) {
    if (!c.added && !c.removed) {
      parts.push({ kind: 'same', blocks: c.value })
      continue
    }
    const last = parts[parts.length - 1]
    // 中间没有未改动块的连续改动视为同一处修改
    if (last?.kind === 'change') {
      if (c.removed) last.hunk.before.push(...c.value)
      else last.hunk.after.push(...c.value)
    } else {
      parts.push({ kind: 'change', hunk: { id: id++, before: c.removed ? [...c.value] : [], after: c.added ? [...c.value] : [] } })
    }
  }
  return parts
}

export const hunksOf = (parts: DiffPart[]) =>
  parts.flatMap((p) => (p.kind === 'change' ? [p.hunk] : []))

/**
 * 根据每处的接受状态合成结果。全部接受/全部拒绝时原样返回对应全文，
 * 避免改变用户原有的空行等格式。
 */
export function composeMarkdown(before: string, after: string, parts: DiffPart[], accepted: Set<number>): string {
  const hunks = hunksOf(parts)
  if (hunks.every((h) => accepted.has(h.id))) return after
  if (hunks.every((h) => !accepted.has(h.id))) return before
  const blocks: string[] = []
  for (const p of parts) {
    if (p.kind === 'same') blocks.push(...p.blocks)
    else blocks.push(...(accepted.has(p.hunk.id) ? p.hunk.after : p.hunk.before))
  }
  return blocks.join('\n\n') + '\n'
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity: 'word' }) : undefined

/** 段内词级差异（中文使用 Intl.Segmenter 分词） */
export function inlineDiff(before: string, after: string): ChangeObject<string>[] {
  return diffWords(before, after, { intlSegmenter: segmenter })
}

/** 一处修改是否适合用段内差异展示：一对一、同类型的块 */
export function isInlinePair(h: Hunk): boolean {
  if (h.before.length !== 1 || h.after.length !== 1) return false
  const kind = (b: string) => (/^#{1,6}\s/.test(b) ? 'h' : /^(```|~~~|\||[-*+]\s|\d+[.)]\s|>)/.test(b) ? 'x' : 'p')
  return kind(h.before[0]) === kind(h.after[0]) && kind(h.before[0]) !== 'x'
}
