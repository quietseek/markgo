import { describe, expect, it } from 'vitest'
import { composeMarkdown, diffBlocks, hunksOf, inlineDiff, isInlinePair, splitBlocks } from '@renderer/lib/diff'
import { renderAgentMarkdown } from '@renderer/lib/sanitize'

const BEFORE = `---
title: 测试
---

# 标题

第一段保持不变。

第二段写得不太好。

- 列表一
- 列表二

结尾。
`

const AFTER = `---
title: 测试
---

# 标题

第一段保持不变。

第二段经过润色，表达更清楚。

- 列表一
- 列表二
- 列表三

新增的一段。

结尾。
`

describe('block diff', () => {
  it('splits markdown into top-level blocks', () => {
    expect(splitBlocks(BEFORE)).toEqual(['---\ntitle: 测试\n---', '# 标题', '第一段保持不变。', '第二段写得不太好。', '- 列表一\n- 列表二', '结尾。'])
  })

  it('groups contiguous removals and additions into one hunk', () => {
    const hunks = hunksOf(diffBlocks(BEFORE, AFTER))
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({ before: ['第二段写得不太好。', '- 列表一\n- 列表二'] })
    expect(hunks[0].after).toEqual(['第二段经过润色，表达更清楚。', '- 列表一\n- 列表二\n- 列表三', '新增的一段。'])
  })

  it('composes partial acceptance and keeps exact text for all/none', () => {
    const parts = diffBlocks(BEFORE, AFTER)
    const ids = hunksOf(parts).map((h) => h.id)
    expect(composeMarkdown(BEFORE, AFTER, parts, new Set(ids))).toBe(AFTER)
    expect(composeMarkdown(BEFORE, AFTER, parts, new Set())).toBe(BEFORE)
  })

  it('accepts a single hunk independently', () => {
    const before = '甲\n\n乙\n\n丙\n\n丁\n'
    const after = '甲\n\n乙改\n\n丙\n\n丁改\n'
    const parts = diffBlocks(before, after)
    const [h1] = hunksOf(parts)
    expect(composeMarkdown(before, after, parts, new Set([h1.id]))).toBe('甲\n\n乙改\n\n丙\n\n丁\n')
  })

  it('ignores trailing whitespace differences', () => {
    expect(hunksOf(diffBlocks('a  \n\nb\n', 'a\n\nb'))).toHaveLength(0)
  })

  it('word-diffs Chinese paragraphs', () => {
    const changes = inlineDiff('今天天气很好', '今天天气非常好')
    expect(changes.some((c) => c.added)).toBe(true)
    expect(changes.filter((c) => !c.added && !c.removed).map((c) => c.value).join('')).toContain('今天')
    expect(isInlinePair({ id: 0, before: ['段落一'], after: ['段落二'] })).toBe(true)
    expect(isInlinePair({ id: 0, before: ['# 标题'], after: ['正文'] })).toBe(false)
  })
})

describe('agent markdown sanitizing', () => {
  it('strips scripts, handlers and javascript urls', () => {
    const html = renderAgentMarkdown('hi <img src=x onerror="alert(1)"> [x](javascript:alert(1))\n\n<script>alert(1)</script>')
    expect(html).not.toMatch(/onerror|<script|javascript:/)
  })
})
