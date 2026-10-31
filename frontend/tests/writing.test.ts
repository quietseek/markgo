import { describe, expect, it } from 'vitest'
import { draftPrompt, localIsoTime } from '../src/lib/writing'

describe('AI writing prompt', () => {
  it('formats local time with timezone offset', () => {
    expect(localIsoTime(new Date(2026, 9, 10, 11, 38, 29))).toMatch(/^2026-10-10T11:38:29[+-]\d{2}:\d{2}$/)
  })

  it('asks for front matter with the current theme and time', () => {
    const now = new Date(2026, 9, 10, 11, 38, 29)
    const prompt = draftPrompt(
      { topic: '软考', style: { id: 's', name: '干货', description: '清晰' }, length: 'long' },
      { styles: [], defaultStyleId: 's', audience: '', length: 'long', extra: '' },
      '/notes/a.md',
      'retro',
      now
    )
    for (const field of ['title:', 'slug:', 'summary:', 'category:', 'status: draft', 'theme: retro', 'tags:', `updated_at: ${localIsoTime(now)}`])
      expect(prompt).toContain(field)
    expect(prompt).toContain('/notes/a.md')
  })
})

describe('extractDraft', () => {
  it('keeps the article and drops wrappers and prefaces', async () => {
    const { extractDraft } = await import('../src/lib/writing')
    const article = '---\ntitle: 标题\n---\n\n# 标题\n\n正文'
    expect(extractDraft(article)).toBe(article)
    expect(extractDraft('```markdown\n' + article + '\n```')).toBe(article)
    expect(extractDraft('好的，下面是全文：\n\n' + article)).toBe(article)
    const noMeta = '# 标题\n\n段落\n\n---\n\n下一节'
    expect(extractDraft(noMeta)).toBe(noMeta)
    // 流式过程中只有开头
    expect(extractDraft('```markdown\n---\ntitle: 标')).toBe('---\ntitle: 标')
  })
})
