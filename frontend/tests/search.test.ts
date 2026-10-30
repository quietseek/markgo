import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Search, getSearch, gotoMatch, replaceAll, replaceCurrent, setSearch } from '../src/lib/editor-ext'

const make = (md: string) => new Editor({ extensions: [StarterKit, Markdown, Search], content: md, contentType: 'markdown' })

describe('find & replace', () => {
  it('finds across formatting, respects case, replaces', async () => {
    const ed = make('Hello **wor**ld, hello world\n\n# World')
    setSearch(ed, 'world', false)
    expect(getSearch(ed.state).matches).toHaveLength(3)
    setSearch(ed, 'World', true)
    expect(getSearch(ed.state).matches).toHaveLength(1)
    setSearch(ed, 'world', false)
    gotoMatch(ed, 1)
    expect(getSearch(ed.state).index).toBe(1)
    replaceCurrent(ed, 'earth')
    expect(getSearch(ed.state).matches).toHaveLength(2)
    expect(replaceAll(ed, 'moon')).toBe(2)
    expect(ed.getMarkdown()).toContain('hello earth')
    expect(ed.getMarkdown()).toContain('# moon')
    expect(getSearch(ed.state).matches).toHaveLength(0)
    // 等编辑器的延时任务执行完再销毁，避免它们在测试环境（jsdom）销毁后才运行
    await new Promise((r) => setTimeout(r, 100))
    ed.destroy()
  })
})
