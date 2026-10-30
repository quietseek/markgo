import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'

const make = (md: string) =>
  new Editor({
    extensions: [StarterKit, Markdown, Image, Highlight, TableKit, TaskList, TaskItem.configure({ nested: true })],
    content: md,
    contentType: 'markdown'
  })

describe('tiptap markdown round trip', () => {
  it('keeps common markdown structures', () => {
    const md = [
      '# 标题',
      '',
      '段落 **粗体** *斜体* ~~删除~~ `code` ==高亮== [链接](https://a.com)',
      '',
      '- a',
      '- b',
      '',
      '1. one',
      '2. two',
      '',
      '- [x] done',
      '- [ ] todo',
      '',
      '> quote',
      '',
      '```js',
      'const a = 1',
      '```',
      '',
      '| h1 | h2 |',
      '| --- | --- |',
      '| c1 | c2 |',
      '',
      '![alt](assets/img.png)',
      '',
      '---'
    ].join('\n')
    const out = make(md).getMarkdown()
    for (const piece of [
      '# 标题',
      '**粗体**',
      '*斜体*',
      '~~删除~~',
      '`code`',
      '==高亮==',
      '[链接](https://a.com)',
      '- [x] done',
      '- [ ] todo',
      '> quote',
      '```js',
      '| h1',
      '![alt](assets/img.png)',
      '1. one'
    ])
      expect(out, piece).toContain(piece)
  })
})

describe('math round trip', () => {
  it('keeps inline and block math, ignores prices', async () => {
    const { StrictInlineMath, MultilineBlockMath } = await import('../src/lib/math')
    const editor = new Editor({
      extensions: [StarterKit, Markdown, StrictInlineMath, MultilineBlockMath],
      content: '价格 $5 和 $10\n\n质能方程 $E=mc^2$\n\n$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$\n',
      contentType: 'markdown'
    })
    const types: string[] = []
    editor.state.doc.descendants((n) => void types.push(n.type.name))
    expect(types.filter((t) => t === 'inlineMath')).toHaveLength(1)
    expect(types).toContain('blockMath')
    const out = editor.getMarkdown()
    expect(out).toContain('$5 和 $10')
    expect(out).toContain('$E=mc^2$')
    expect(out).toContain('$$\n\\begin{aligned}')
  })
})

describe('front matter', () => {
  const load = async (md: string) => {
    const { FrontMatter } = await import('../src/lib/front-matter')
    return new Editor({ extensions: [StarterKit, Markdown, FrontMatter], content: md, contentType: 'markdown' })
  }

  it('keeps yaml at the top of the document', async () => {
    const md = '---\ntitle: 你好\ntags: [a, b]\n---\n\n# 正文\n\n段落'
    const editor = await load(md)
    expect(editor.state.doc.firstChild?.type.name).toBe('frontMatter')
    expect(editor.state.doc.firstChild?.attrs.yaml).toBe('title: 你好\ntags: [a, b]')
    expect(editor.getMarkdown().trim()).toBe(md)
  })

  it('only matches at the start and only when it looks like yaml', async () => {
    const later = await load('段落\n\n---\ntitle: x\n---\n')
    const notYaml = await load('---\n\n一段普通文字\n\n---\n')
    for (const editor of [later, notYaml]) {
      const types: string[] = []
      editor.state.doc.descendants((n) => void types.push(n.type.name))
      expect(types).not.toContain('frontMatter')
    }
  })

  it('parses flat yaml for display', async () => {
    const { parseFrontMatter } = await import('../src/lib/front-matter')
    expect(parseFrontMatter('title: "Hi"\ntags:\n  - a\n  - b\ndraft: true')).toEqual([
      { key: 'title', value: 'Hi' },
      { key: 'tags', value: ['a', 'b'] },
      { key: 'draft', value: 'true' }
    ])
    expect(parseFrontMatter('author:\n  name: x')).toBeNull()
  })
})
