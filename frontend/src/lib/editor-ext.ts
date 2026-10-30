import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

// ---------- Typora 风格快捷键 ----------

export interface TyporaKeymapOptions {
  /** 插入块级公式（打开公式编辑） */
  onMathBlock(): void
  /** 打开查找 / 替换（菜单快捷键之外的兜底，例如焦点在编辑器时） */
  onFind(replace: boolean): void
}

/** 与 Typora 保持一致：macOS 段落类多用 ⌘⌥，Windows / Linux 用 Ctrl+Shift */
export const TyporaKeymap = Extension.create<TyporaKeymapOptions>({
  name: 'typoraKeymap',
  addOptions: () => ({ onMathBlock: () => {}, onFind: () => {} }),
  addKeyboardShortcuts() {
    const ed = this.editor
    const heading = (level: 1 | 2 | 3 | 4 | 5 | 6) => () => ed.chain().focus().toggleHeading({ level }).run()
    const table = () => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    const math = () => (this.options.onMathBlock(), true)
    const find = (replace: boolean) => () => (this.options.onFind(replace), true)
    const common = {
      'Mod-f': find(false),
      [isMac ? 'Mod-Alt-f' : 'Mod-h']: find(true),
      'Mod-1': heading(1),
      'Mod-2': heading(2),
      'Mod-3': heading(3),
      'Mod-4': heading(4),
      'Mod-5': heading(5),
      'Mod-6': heading(6),
      'Mod-0': () => ed.chain().focus().setParagraph().run()
    }
    if (isMac)
      return {
        ...common,
        'Mod-Alt-c': () => ed.chain().focus().toggleCodeBlock().run(),
        'Mod-Alt-b': math,
        'Mod-Alt-t': table,
        'Mod-Alt-q': () => ed.chain().focus().toggleBlockquote().run(),
        'Mod-Alt-o': () => ed.chain().focus().toggleOrderedList().run(),
        'Mod-Alt-u': () => ed.chain().focus().toggleBulletList().run(),
        'Mod-Alt-x': () => ed.chain().focus().toggleTaskList().run(),
        'Ctrl-`': () => ed.chain().focus().toggleCode().run(),
        'Ctrl-Shift-`': () => ed.chain().focus().toggleStrike().run()
      }
    return {
      ...common,
      'Mod-Shift-k': () => ed.chain().focus().toggleCodeBlock().run(),
      'Mod-Shift-m': math,
      'Mod-t': table,
      'Mod-Shift-q': () => ed.chain().focus().toggleBlockquote().run(),
      'Mod-Shift-[': () => ed.chain().focus().toggleOrderedList().run(),
      'Mod-Shift-]': () => ed.chain().focus().toggleBulletList().run(),
      'Mod-Shift-x': () => ed.chain().focus().toggleTaskList().run(),
      'Mod-Shift-`': () => ed.chain().focus().toggleCode().run(),
      'Alt-Shift-5': () => ed.chain().focus().toggleStrike().run()
    }
  }
})

// ---------- 查找替换 ----------

export interface SearchMatch {
  from: number
  to: number
}

interface SearchState {
  query: string
  caseSensitive: boolean
  matches: SearchMatch[]
  index: number
  deco: DecorationSet
}

export const searchKey = new PluginKey<SearchState>('markgoSearch')

function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  const out: SearchMatch[] = []
  if (!query) return out
  const needle = caseSensitive ? query : query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // 逐字符记录文档位置；公式、图片等行内原子节点占一个占位符
    let text = ''
    const at: number[] = []
    node.forEach((child, offset) => {
      const s = child.isText ? child.text! : '￼'
      for (let i = 0; i < s.length; i++) at.push(pos + 1 + offset + i)
      text += s
    })
    const hay = caseSensitive ? text : text.toLowerCase()
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length))
      out.push({ from: at[i], to: at[i + needle.length - 1] + 1 })
    return false
  })
  return out
}

function decorate(doc: PMNode, matches: SearchMatch[], index: number) {
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === index ? 'search-match current' : 'search-match' }))
  )
}

const empty: SearchState = { query: '', caseSensitive: false, matches: [], index: -1, deco: DecorationSet.empty }

export const Search = Extension.create({
  name: 'markgoSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => empty,
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined
            if (!meta && !tr.docChanged) return prev
            const query = meta?.query ?? prev.query
            if (!query) return empty
            const caseSensitive = meta?.caseSensitive ?? prev.caseSensitive
            const matches = findMatches(state.doc, query, caseSensitive)
            let index = meta?.index ?? prev.index
            if (meta?.query !== undefined && meta.index === undefined) {
              // 新的查询：从光标之后最近的一处开始
              const head = state.selection.from
              index = matches.findIndex((m) => m.from >= head)
              if (index < 0) index = matches.length ? 0 : -1
            }
            if (index >= matches.length) index = matches.length - 1
            return { query, caseSensitive, matches, index, deco: decorate(state.doc, matches, index) }
          }
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.deco
        }
      })
    ]
  }
})

export const getSearch = (state: EditorState) => searchKey.getState(state) ?? empty

export function setSearch(editor: Editor, query: string, caseSensitive: boolean) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, caseSensitive }))
  revealCurrent(editor)
}

export function gotoMatch(editor: Editor, step: 1 | -1) {
  const { matches, index } = getSearch(editor.state)
  if (!matches.length) return
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { index: (index + step + matches.length) % matches.length }))
  revealCurrent(editor)
}

export function replaceCurrent(editor: Editor, text: string) {
  const { matches, index } = getSearch(editor.state)
  const m = matches[index]
  if (!m) return
  editor.view.dispatch(editor.state.tr.insertText(text, m.from, m.to))
  revealCurrent(editor)
}

export function replaceAll(editor: Editor, text: string) {
  const { matches } = getSearch(editor.state)
  if (!matches.length) return 0
  const tr = editor.state.tr
  for (let i = matches.length - 1; i >= 0; i--) tr.insertText(text, matches[i].from, matches[i].to)
  editor.view.dispatch(tr)
  return matches.length
}

export function clearSearch(editor: Editor) {
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query: '' }))
}

function revealCurrent(editor: Editor) {
  requestAnimationFrame(() => editor.view.dom.querySelector('.search-match.current')?.scrollIntoView({ block: 'center' }))
}
