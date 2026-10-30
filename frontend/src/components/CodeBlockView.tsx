import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeViewContent, NodeViewWrapper, type Editor, type ReactNodeViewProps } from '@tiptap/react'
import { Braces, Check, ChevronDown, Copy, Download, Search } from 'lucide-react'
import { renderMermaidSvg, svgToPng } from '../lib/mermaid'
import { toast } from '../lib/toast'
import { canFormat, formatCode } from '../lib/format-code'

/** 常用语言放前面，其余按名称排列 */
const POPULAR = ['plaintext', 'mermaid', 'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'bash', 'json', 'sql', 'html', 'css', 'markdown', 'yaml']
const LABELS: Record<string, string> = {
  plaintext: '纯文本',
  mermaid: 'Mermaid 图表',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  'python-repl': 'Python REPL',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  bash: 'Bash',
  shell: 'Shell',
  json: 'JSON',
  sql: 'SQL',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  markdown: 'Markdown',
  yaml: 'YAML',
  ini: 'INI / TOML',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  objectivec: 'Objective-C',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
  'php-template': 'PHP Template',
  ruby: 'Ruby',
  perl: 'Perl',
  lua: 'Lua',
  r: 'R',
  graphql: 'GraphQL',
  diff: 'Diff',
  makefile: 'Makefile',
  arduino: 'Arduino',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly'
}
const label = (l: string) => LABELS[l] || l
/** 搜索时可用的简写 */
const ALIASES: Record<string, string[]> = {
  javascript: ['js', 'jsx', 'node'],
  typescript: ['ts', 'tsx'],
  python: ['py'],
  bash: ['sh', 'zsh'],
  shell: ['console'],
  yaml: ['yml'],
  markdown: ['md'],
  cpp: ['c++', 'cc'],
  csharp: ['cs', 'c#'],
  go: ['golang'],
  kotlin: ['kt'],
  ruby: ['rb'],
  rust: ['rs'],
  ini: ['toml'],
  objectivec: ['objc']
}
/** 匹配程度：0 不匹配，越小越靠前 */
function rank(l: string, q: string) {
  const names = [l, label(l).toLowerCase(), ...(ALIASES[l] || [])]
  if (names.some((n) => n === q)) return 1
  if (names.some((n) => n.startsWith(q))) return 2
  return names.some((n) => n.includes(q)) ? 3 : 0
}

export function CodeBlockView({ node, updateAttributes, extension, editor, getPos }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false)
  const [picking, setPicking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const all: string[] = extension.options.lowlight.listLanguages()
  const lang = (node.attrs.language as string | null) || 'plaintext'
  const isMermaid = lang === 'mermaid'
  const caretInside = useCaretInside(editor, getPos, isMermaid)
  // 图表：光标在块内或内容为空时显示源码，否则只显示渲染结果
  const showCode = !isMermaid || caretInside || !node.textContent.trim()

  const popular = POPULAR.filter((l) => l === 'html' || l === 'mermaid' || all.includes(l))
  const rest = all.filter((l) => !POPULAR.includes(l) && l !== 'xml').concat('xml').sort((a, b) => label(a).localeCompare(label(b)))

  const format = async () => {
    const code = node.textContent
    if (!code.trim()) return
    try {
      const out = await formatCode(code, lang)
      const pos = getPos()
      // 等待期间块可能已被修改或删除，此时放弃
      if (out === code || typeof pos !== 'number' || editor.state.doc.nodeAt(pos)?.textContent !== code) return
      const current = editor.state.doc.nodeAt(pos)!
      editor
        .chain()
        .command(({ tr, state }) => {
          const from = pos + 1
          const to = from + current.content.size
          if (out) tr.replaceWith(from, to, state.schema.text(out))
          else tr.delete(from, to)
          return true
        })
        .run()
    } catch (err) {
      toast(`无法格式化：${(err as Error).message.split('\n')[0]}`, 'error')
    }
  }

  const editCode = () => {
    const pos = getPos()
    if (typeof pos === 'number') editor.chain().focus().setTextSelection(pos + 1 + node.content.size).run()
  }

  return (
    <NodeViewWrapper className={`code-block${isMermaid ? ' mermaid' : ''}${showCode ? '' : ' code-hidden'}`}>
      <div className={`code-block-head${picking || exporting ? ' open' : ''}`} contentEditable={false}>
        <button ref={triggerRef} className="code-lang" title="代码语言" onClick={() => setPicking((v) => !v)}>
          {label(lang)}
          <ChevronDown size={12} />
        </button>
        {isMermaid && <MermaidExport code={node.textContent} open={exporting} onOpen={setExporting} />}
        {canFormat(lang) && editor.isEditable && (
          <button title="格式化代码" onClick={format}>
            <Braces size={13} />
          </button>
        )}
        <button
          title="复制代码"
          onClick={() => {
            navigator.clipboard.writeText(node.textContent)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {picking && (
        <LanguagePicker
          anchor={triggerRef.current!}
          current={lang}
          popular={popular}
          rest={rest}
          onPick={(l) => {
            updateAttributes({ language: l === 'plaintext' ? null : l })
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
      <pre>
        <NodeViewContent<'code'> as="code" className={lang !== 'plaintext' ? `language-${lang}` : undefined} />
      </pre>
      {isMermaid && <MermaidDiagram code={node.textContent} onEdit={editCode} />}
    </NodeViewWrapper>
  )
}

/** 光标是否位于该节点内（节点视图默认不会随选区变化重新渲染） */
function useCaretInside(editor: Editor, getPos: () => number | undefined, enabled: boolean) {
  const [inside, setInside] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const check = () => {
      const pos = getPos()
      const n = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null
      const { from, to } = editor.state.selection
      setInside(!!n && pos != null && from > pos && to < pos + n.nodeSize)
    }
    check()
    editor.on('selectionUpdate', check)
    return () => {
      editor.off('selectionUpdate', check)
    }
  }, [editor, getPos, enabled])
  return inside
}

function useDarkTheme() {
  const read = () => document.documentElement.dataset.theme === 'dark'
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

/** 实时渲染 mermaid；输入时防抖，出错时保留上一次的结果并提示错误 */
function MermaidDiagram({ code, onEdit }: { code: string; onEdit(): void }) {
  const dark = useDarkTheme()
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!code.trim()) {
      setSvg('')
      setError('')
      return
    }
    let alive = true
    const t = window.setTimeout(() => {
      renderMermaidSvg(code, dark).then(
        (out) => alive && (setSvg(out), setError('')),
        (err: Error) => alive && setError(err.message.split('\n').filter(Boolean).slice(0, 3).join('\n') || '语法错误')
      )
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [code, dark])

  if (!code.trim()) return null
  return (
    <div className="mermaid-view" contentEditable={false} onClick={onEdit} title="点击编辑图表源码">
      {svg ? <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : !error && <div className="mermaid-loading">正在渲染…</div>}
      {error && <div className="mermaid-error">{error}</div>}
    </div>
  )
}

const stamp = () => new Date().toLocaleString('sv-SE').replace(/[-: ]/g, '').slice(0, 12)

/** 图表导出：复制为图片、导出 PNG / SVG（统一使用浅色主题，便于插入文章） */
function MermaidExport({ code, open, onOpen }: { code: string; open: boolean; onOpen(v: boolean): void }) {
  const boxRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && onOpen(false)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onOpen])

  const run = async (kind: 'copy' | 'png' | 'svg') => {
    onOpen(false)
    try {
      const svg = await renderMermaidSvg(code)
      const api = window.markgo
      if (kind === 'svg') {
        if (await api.fs.saveFile(svg, `图表-${stamp()}.svg`)) toast('已导出 SVG', 'success')
        return
      }
      const png = await svgToPng(svg)
      if (kind === 'copy') {
        await api.clipboard.writeImage(png)
        toast('已复制图表图片', 'success')
      } else if (await api.fs.saveFile(png, `图表-${stamp()}.png`)) toast('已导出 PNG', 'success')
    } catch (err) {
      toast(`图表无法导出：${(err as Error).message.split('\n')[0]}`, 'error')
    }
  }

  return (
    <span className="mermaid-export" ref={boxRef}>
      <button title="导出图表" disabled={!code.trim()} onClick={() => onOpen(!open)}>
        <Download size={13} />
      </button>
      {open && (
        <div className="mermaid-export-menu">
          <button onClick={() => run('copy')}>复制为图片</button>
          <button onClick={() => run('png')}>导出 PNG</button>
          <button onClick={() => run('svg')}>导出 SVG</button>
        </div>
      )}
    </span>
  )
}

/** 渲染到 body 的语言选择浮层：可搜索、键盘选择，也可直接输入未收录的语言名 */
function LanguagePicker(props: { anchor: HTMLElement; current: string; popular: string[]; rest: string[]; onPick(l: string): void; onClose(): void }) {
  const { anchor, current, popular, rest, onPick, onClose } = props
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const sections = useMemo(() => {
    if (!q) return [{ title: '常用', items: popular }, { title: '全部语言', items: rest }]
    const match = [...popular, ...rest].map((l) => [l, rank(l, q)] as const).filter(([, r]) => r)
    return [{ title: '', items: match.sort((a, b) => a[1] - b[1]).map(([l]) => l) }]
  }, [q, popular, rest])
  const items = sections.flatMap((s) => s.items)
  const custom = q && !items.some((l) => rank(l, q) === 1) ? q.replace(/\s+/g, '-') : ''
  const options = custom ? [...items, custom] : items

  useEffect(() => setActive(q ? 0 : Math.max(0, options.indexOf(current))), [q])

  // 贴着触发按钮右对齐；下方空间不足时向上展开
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const h = boxRef.current?.offsetHeight || 320
    const top = r.bottom + 4 + h > window.innerHeight - 8 ? r.top - 4 - h : r.bottom + 4
    setPos({ top: Math.max(8, top), left: Math.max(8, r.right - 220) })
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose()
    const onScroll = (e: Event) => !boxRef.current?.contains(e.target as Node) && onClose()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchor, onClose])

  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (options[active]) onPick(options[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const item = (l: string, text: string) => {
    const i = options.indexOf(l)
    return (
      <button
        key={l}
        className={`lang-item${i === active ? ' active' : ''}`}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(l)}
      >
        <span>{text}</span>
        {l === current && <Check size={13} />}
      </button>
    )
  }

  return createPortal(
    <div ref={boxRef} className="lang-picker" style={pos}>
      <div className="lang-search">
        <Search size={13} />
        <input autoFocus value={query} placeholder="搜索或输入语言" onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
      </div>
      <div ref={listRef} className="lang-list">
        {sections.map((s) => (
          <div key={s.title}>
            {s.title && <div className="lang-section">{s.title}</div>}
            {s.items.map((l) => item(l, label(l)))}
          </div>
        ))}
        {custom && item(custom, `使用「${custom}」`)}
        {!options.length && <div className="lang-empty">没有匹配的语言</div>}
      </div>
    </div>,
    document.body
  )
}
