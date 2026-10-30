import { Node } from '@tiptap/core'

/** 文档开头的 YAML 元信息：--- 与 --- 之间的内容（允许为空） */
const FRONT_MATTER_RE = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/

/** 第一行有效内容须形如 key: value，避免把「分割线 + 文字 + 分割线」误认为元信息 */
const looksLikeYaml = (yaml: string) => {
  const first = yaml.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#'))
  return !first || /^[\w$"'-][^:\n]*:(\s|$)/.test(first)
}

export interface FrontMatterEntry {
  key: string
  /** 列表（[a, b] 或 - a）解析为数组，其余保留原文 */
  value: string | string[]
}

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, '$2')

/** 只解析常见的扁平结构（key: value、行内数组、缩进列表），无法识别的行返回 null，由调用方退回原文显示 */
export function parseFrontMatter(yaml: string): FrontMatterEntry[] | null {
  const entries: FrontMatterEntry[] = []
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = line.match(/^\s+-\s+(.*)$/)
    if (item) {
      const last = entries[entries.length - 1]
      if (!last || (typeof last.value === 'string' && last.value !== '')) return null
      last.value = [...(Array.isArray(last.value) ? last.value : []), unquote(item[1])]
      continue
    }
    const kv = line.match(/^([^\s:#][^:]*):(?:\s+(.*))?$/)
    if (!kv) return null
    const raw = (kv[2] ?? '').trim()
    const list = raw.match(/^\[(.*)\]$/)
    entries.push({
      key: kv[1].trim(),
      value: list ? list[1].split(',').map(unquote).filter(Boolean) : unquote(raw)
    })
  }
  return entries
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    frontMatter: {
      /** 在文档开头插入元信息（已存在时不重复插入） */
      insertFrontMatter: (yaml: string) => ReturnType
    }
  }
}

export const FrontMatter = Node.create({
  name: 'frontMatter',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { yaml: { default: '' } }
  },

  addStorage() {
    /** 由命令插入时，节点挂载后直接进入编辑状态 */
    return { editOnMount: false }
  },

  parseHTML() {
    return [{ tag: 'div[data-front-matter]', getAttrs: (el) => ({ yaml: (el as HTMLElement).textContent || '' }) }]
  },

  renderHTML({ node }) {
    return ['div', { 'data-front-matter': '' }, ['pre', node.attrs.yaml]]
  },

  markdownTokenizer: {
    name: 'frontMatter',
    level: 'block',
    start: (src: string) => (src.startsWith('---') ? 0 : -1),
    tokenize: (src, tokens) => {
      // 只认文档最开头（块级引用等嵌套内容中极少出现同样的结构）
      if (tokens.some((t) => t.type !== 'space')) return undefined
      const m = src.match(FRONT_MATTER_RE)
      if (!m || !looksLikeYaml(m[1] ?? '')) return undefined
      return { type: 'frontMatter', raw: m[0], yaml: m[1] ?? '' }
    }
  },

  parseMarkdown: (token) => ({ type: 'frontMatter', attrs: { yaml: token.yaml } }),

  renderMarkdown: (node) => {
    const yaml = (node.attrs?.yaml as string) || ''
    return yaml ? `---\n${yaml}\n---` : '---\n---'
  },

  addCommands() {
    return {
      insertFrontMatter:
        (yaml) =>
        ({ state, tr, dispatch }) => {
          if (state.doc.firstChild?.type.name === this.name) return false
          if (dispatch) {
            this.storage.editOnMount = true
            tr.insert(0, this.type.create({ yaml }))
          }
          return true
        }
    }
  }
})
