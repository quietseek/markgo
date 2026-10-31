import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor as TiptapEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { mergeAttributes } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder, CharacterCount } from '@tiptap/extensions'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import type { Node as PMNode } from '@tiptap/pm/model'
import 'katex/dist/katex.min.css'
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  ImagePlus,
  Italic,
  FileCode2,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  PenLine,
  Radical,
  Sigma,
  Sparkles,
  SquareCode,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Trash2,
  Wand2,
  Workflow
} from 'lucide-react'
import { resolveDisplaySrc, setAssetBase } from '../lib/assets'
import { resolveToast, toast } from '../lib/toast'
import { CONTINUE_ACTION, INLINE_ACTIONS, InlineAiCard, type InlineAiAction, type InlineAiRequest } from './InlineAi'
import { CodeBlockView } from './CodeBlockView'
import { FrontMatterView } from './FrontMatterView'
import { EditorToolbar } from './EditorToolbar'
import { ImageView } from './ImageView'
import { ImageGenDialog } from './ImageGenDialog'
import type { AppSettings } from '@shared/types'
import { MathPopover, type MathTarget } from './MathPopover'
import { FindBar } from './FindBar'
import { MultilineBlockMath, StrictInlineMath, looksLikeLatex } from '../lib/math'
import { Search, TyporaKeymap } from '../lib/editor-ext'
import { FrontMatter } from '../lib/front-matter'
import { Subscript, Superscript } from '../lib/sub-sup'

const lowlight = createLowlight(common)
const bubbleMenuKey = new PluginKey('markgoBubbleMenu')
const tableMenuKey = new PluginKey('markgoTableMenu')

/** 代码块带语言选择与复制按钮 */
const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  }
})

/** 文档开头的 YAML 元信息，默认折叠 */
const FrontMatterBlock = FrontMatter.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FrontMatterView)
  }
})

/** 显示时把本地路径映射到 /mg-asset/，序列化 markdown 时仍保留原始 src */
const LocalImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: resolveDisplaySrc(HTMLAttributes.src) })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  }
})

const MERMAID_SAMPLE = `flowchart LR
  A[开始] --> B{是否通过}
  B -->|是| C[发布]
  B -->|否| D[修改]
  D --> B`

/** 插入 mermaid 代码块：空段落直接转换，否则插到当前块之后 */
function insertMermaid(editor: TiptapEditor) {
  const { $from } = editor.state.selection
  const block = { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: MERMAID_SAMPLE }] }
  if ($from.parent.type.name === 'paragraph' && !$from.parent.content.size && $from.depth === 1)
    editor.chain().focus().insertContentAt({ from: $from.before(), to: $from.after() }, block).run()
  else editor.chain().focus().insertContentAt($from.after(1), block).run()
}

export interface EditorHandle {
  getMarkdown(): string
  focus(): void
  scrollToHeading(index: number): void
  insertImageFromPicker(): void
  /** 当前选中内容（Markdown） */
  getSelectionText(): string
  /** 用新的 Markdown 替换全文（AI 修改审阅通过后调用，可撤销） */
  replaceDocument(md: string): void
  /** 打开查找（replace 为 true 时同时显示替换） */
  openFind(replace: boolean): void
  /**
   * AI 写作流式写入全文：不进入撤销历史；done 为 true 时是最终内容，触发保存
   */
  streamDocument(md: string, done?: boolean): void
}

interface Props {
  docPath: string
  initialMarkdown: string
  sourceMode: boolean
  /** 打字机模式：光标所在行保持在视口中部 */
  typewriter?: boolean
  /** 顶部显示快捷操作栏 */
  showToolbar?: boolean
  /** AI 生图配置 */
  imageGen: AppSettings['imageGen']
  onOpenImageSettings(): void
  onChange(md: string): void
  onHeadings(headings: HeadingInfo[]): void
  /** 套用排版主题时隐藏文档开头的元信息（编辑区即发布效果的预览） */
  hideFrontMatter?: boolean
  /** 只读（AI 写作流式写入期间） */
  readOnly?: boolean
}

export interface HeadingInfo {
  level: number
  text: string
}

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp'
}

async function uploadFiles(files: File[], docPath: string): Promise<string[]> {
  const api = window.markgo
  const urls: string[] = []
  const tid = toast(files.length > 1 ? `正在上传 ${files.length} 张图片…` : '正在上传图片…', 'loading')
  try {
    for (const file of files) {
      const path = api.image.pathForFile(file)
      const res = path
        ? await api.image.uploadPaths([path], docPath)
        : await api.image.uploadBuffer(await file.arrayBuffer(), IMAGE_EXT_BY_MIME[file.type] || 'png', docPath)
      if (!res.ok) throw new Error(res.error || '上传失败')
      urls.push(...res.urls)
    }
    resolveToast(tid, '图片已插入', 'success')
  } catch (err) {
    resolveToast(tid, (err as Error).message, 'error')
  }
  return urls
}

const normalizeMd = (md: string) => md.replace(/\n{3,}/g, '\n\n').trimEnd()

const looksLikeMarkdown = (text: string) =>
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|\*\*[^*]+\*\*|!?\[[^\]]*\]\([^)]+\)/.test(text)

interface SlashItem {
  key: string
  label: string
  hint: string
  icon: React.ReactNode
  run(editor: TiptapEditor): void
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { docPath, initialMarkdown, sourceMode, typewriter, showToolbar, imageGen, onOpenImageSettings, onChange, onHeadings, hideFrontMatter, readOnly },
  ref
) {
  const [source, setSource] = useState(initialMarkdown)
  const [slash, setSlash] = useState<{ query: string; from: number; top: number; left: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashRef = useRef(slash)
  slashRef.current = slash
  const docPathRef = useRef(docPath)
  docPathRef.current = docPath
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const changeTimer = useRef<number>(undefined)
  const openLinkRef = useRef<() => void>(() => {})
  // 公式：点击已有公式编辑，或新建（扩展的配置在创建编辑器时就固定了，通过 ref 调用最新的实现）
  const [math, setMath] = useState<MathTarget | null>(null)
  const editMathRef = useRef<(node: PMNode, pos: number) => void>(() => {})
  const newMathRef = useRef<(display: boolean, describe?: string) => void>(() => {})
  const openFindRef = useRef<(replace: boolean) => void>(() => {})
  const typewriterRef = useRef(typewriter)
  typewriterRef.current = typewriter
  const lastEmitted = useRef(initialMarkdown)

  setAssetBase(docPath)

  const insertImages = useCallback(async (editor: TiptapEditor, files: File[], pos?: number) => {
    const urls = await uploadFiles(files, docPathRef.current)
    if (!urls.length) return
    const nodes = urls.map((src) => ({ type: 'image', attrs: { src, alt: '' } }))
    if (pos != null) editor.chain().focus().insertContentAt(pos, nodes).run()
    else editor.chain().focus().insertContent(nodes).run()
  }, [])

  const pickImage = useCallback(
    async (editor: TiptapEditor) => {
      const path = await window.markgo.fs.pickImage()
      if (!path) return
      const tid = toast('正在上传图片…', 'loading')
      const res = await window.markgo.image.uploadPaths([path], docPathRef.current)
      if (!res.ok) return resolveToast(tid, res.error || '上传失败', 'error')
      resolveToast(tid, '图片已插入', 'success')
      editor.chain().focus().setImage({ src: res.urls[0] }).run()
    },
    []
  )

  // AI 生图：记下打开时的插入位置，选中的文字作为初始描述
  const [genImage, setGenImage] = useState<{ prompt: string; pos: number } | null>(null)
  const openImageGen = useCallback((editor: TiptapEditor) => {
    const { from, to, empty } = editor.state.selection
    setGenImage({ prompt: empty ? '' : editor.state.doc.textBetween(from, to, ' '), pos: to })
  }, [])
  const insertGenerated = async (dataUrl: string, prompt: string, pos: number) => {
    const ed = editorRef.current
    if (!ed) return false
    const blob = await (await fetch(dataUrl)).blob()
    const tid = toast('正在保存图片…', 'loading')
    const res = await window.markgo.image.uploadBuffer(await blob.arrayBuffer(), IMAGE_EXT_BY_MIME[blob.type] || 'png', docPathRef.current)
    if (!res.ok) {
      resolveToast(tid, res.error || '保存失败', 'error')
      return false
    }
    resolveToast(tid, '图片已插入', 'success')
    const alt = prompt.replace(/\s+/g, ' ').slice(0, 40)
    ed.chain().focus().insertContentAt(Math.min(pos, ed.state.doc.content.size), { type: 'image', attrs: { src: res.urls[0], alt } }).run()
    return true
  }

  const emitHeadings = useCallback(
    (editor: TiptapEditor) => {
      const list: HeadingInfo[] = []
      editor.state.doc.forEach((node) => {
        if (node.type.name === 'heading') list.push({ level: node.attrs.level, text: node.textContent })
      })
      onHeadings(list)
    },
    [onHeadings]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
      }),
      CodeBlock.configure({ lowlight, defaultLanguage: null }),
      StrictInlineMath.configure({ katexOptions: { throwOnError: false }, onClick: (node, pos) => editMathRef.current(node, pos) }),
      MultilineBlockMath.configure({ katexOptions: { displayMode: true, throwOnError: false }, onClick: (node, pos) => editMathRef.current(node, pos) }),
      TyporaKeymap.configure({ onMathBlock: () => newMathRef.current(true), onFind: (replace) => openFindRef.current(replace) }),
      Search,
      Markdown.configure({ markedOptions: { gfm: true } }),
      FrontMatterBlock,
      LocalImage.configure({ allowBase64: true }),
      Highlight,
      Subscript,
      Superscript,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? '标题' : '开始写作，输入 “/” 唤出命令…')
      })
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    autofocus: 'start',
    editorProps: {
      attributes: { class: 'prose-editor', spellcheck: 'false' },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
        if (files.length) {
          event.preventDefault()
          insertImages(editorRef.current!, files)
          return true
        }
        const html = event.clipboardData?.getData('text/html')
        const text = event.clipboardData?.getData('text/plain')
        if (!html && text && looksLikeMarkdown(text) && !view.state.selection.$from.parent.type.spec.code) {
          event.preventDefault()
          editorRef.current!.commands.insertContent(text, { contentType: 'markdown' })
          return true
        }
        return false
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        insertImages(editorRef.current!, files, pos)
        return true
      },
      handleKeyDown(view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !view.state.selection.empty) {
          openLinkRef.current()
          return true
        }
        // 与 Typora 一致：在空段落输入 $$ 后回车，插入公式块
        const { $from, empty } = view.state.selection
        if (event.key === 'Enter' && !slashRef.current && empty && $from.parent.type.name === 'paragraph' && $from.parent.textContent === '$$') {
          editorRef.current!.chain().deleteRange({ from: $from.start(), to: $from.end() }).run()
          newMathRef.current(true)
          return true
        }
        const s = slashRef.current
        if (!s) return false
        const items = filteredRef.current
        if (event.key === 'ArrowDown') {
          setSlashIndex((i) => (i + 1) % Math.max(items.length, 1))
          return true
        }
        if (event.key === 'ArrowUp') {
          setSlashIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1))
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[slashIndexRef.current]
          if (item) {
            runSlash(item)
            return true
          }
          return false
        }
        if (event.key === 'Escape') {
          setSlash(null)
          return true
        }
        return false
      }
    },
    onCreate({ editor }) {
      // 光标放在元信息之后的第一行，而不是选中元信息本身
      const first = editor.state.doc.firstChild
      if (first?.type.name === 'frontMatter' && editor.state.selection.from === 0 && editor.state.doc.childCount > 1)
        editor.commands.setTextSelection(first.nodeSize + 1)
      lastEmitted.current = editor.getMarkdown()
      emitHeadings(editor)
    },
    onUpdate({ editor }) {
      window.clearTimeout(changeTimer.current)
      changeTimer.current = window.setTimeout(() => {
        // 聚焦后 TrailingNode 等插件会追加空段落，这类“非用户修改”不应把文件标记为已修改并重写
        const md = editor.getMarkdown()
        if (normalizeMd(md) !== normalizeMd(lastEmitted.current)) {
          lastEmitted.current = md
          onChangeRef.current(md)
        }
        emitHeadings(editor)
      }, 250)
      detectSlash(editor)
      keepCaretCentered(editor)
    },
    onSelectionUpdate({ editor }) {
      detectSlash(editor)
      setAiMenu(false)
      keepCaretCentered(editor)
    }
  })
  const editorRef = useRef(editor)
  editorRef.current = editor

  /** 浮层定位：相对 .editor-scroll 的坐标 */
  const anchorAt = (ed: TiptapEditor, pos: number, width: number) => {
    const host = ed.view.dom.closest('.editor-scroll')!
    const rect = host.getBoundingClientRect()
    const coords = ed.view.coordsAtPos(pos)
    return {
      top: coords.bottom - rect.top + host.scrollTop + 8,
      left: Math.max(16, Math.min(coords.left - rect.left - 24, rect.width - width - 16))
    }
  }

  editMathRef.current = (node, pos) => {
    const ed = editorRef.current
    if (!ed) return
    const display = node.type.name === 'blockMath'
    const end = pos + node.nodeSize
    setMath({ pos, from: pos, to: end, display, latex: node.attrs.latex, ...anchorAt(ed, display ? end - 1 : end, 440) })
  }
  newMathRef.current = (display, describe) => {
    const ed = editorRef.current
    if (!ed) return
    const { from, to } = ed.state.selection
    setMath({ from, to, display, latex: '', describe, ...anchorAt(ed, to, 440) })
  }

  /** 选中文字转公式：本身是 LaTeX 就直接转换，否则当作描述交给 AI */
  const selectionToMath = (ed: TiptapEditor) => {
    const { from, to } = ed.state.selection
    const text = ed.state.doc.textBetween(from, to, ' ').trim()
    if (!text) return
    if (looksLikeLatex(text)) ed.chain().focus().insertContentAt({ from, to }, { type: 'inlineMath', attrs: { latex: text } }).run()
    else newMathRef.current(false, text)
  }

  function keepCaretCentered(ed: TiptapEditor) {
    if (!typewriterRef.current || !ed.isFocused) return
    const host = ed.view.dom.closest('.editor-scroll') as HTMLElement | null
    if (!host) return
    const caret = ed.view.coordsAtPos(ed.state.selection.head)
    const rect = host.getBoundingClientRect()
    const delta = caret.top - (rect.top + rect.height * 0.45)
    if (Math.abs(delta) > 4) host.scrollTop += delta
  }

  // ---------- 查找替换 ----------
  const [find, setFind] = useState<{ replace: boolean; initial: string; seq: number } | null>(null)
  openFindRef.current = (replace) => {
    const ed = editorRef.current
    if (!ed || sourceMode) return
    const { from, to } = ed.state.selection
    const selected = ed.state.doc.textBetween(from, to, ' ')
    setFind((f) => ({ replace, initial: selected && !selected.includes('\n') ? selected : (f?.initial ?? ''), seq: (f?.seq ?? 0) + 1 }))
  }

  // ---------- 内联 AI ----------
  const [aiReq, setAiReq] = useState<InlineAiRequest | null>(null)
  const [aiMenu, setAiMenu] = useState(false)
  const aiOpen = useRef(false)
  aiOpen.current = !!aiReq
  // 气泡菜单只在选区或文档变化时重新判断是否显示，打开 AI 卡片时需主动隐藏
  useEffect(() => {
    if (aiReq && editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(bubbleMenuKey, 'hide'))
  }, [aiReq, editor])

  const selectionMarkdown = (ed: TiptapEditor, from: number, to: number) => {
    const slice = ed.state.doc.slice(from, to)
    // 段落内的选区切出来是行内节点，需要包一层段落再序列化
    const json = slice.content.toJSON()
    const content = slice.content.firstChild?.isInline ? [{ type: 'paragraph', content: json }] : json
    try {
      return ed.markdown?.serialize({ type: 'doc', content }).trim() || ''
    } catch {
      return ed.state.doc.textBetween(from, to, '\n\n')
    }
  }

  function openInlineAi(ed: TiptapEditor, mode: 'selection' | 'continue' | 'ask', action?: InlineAiAction) {
    const { from, to, empty } = ed.state.selection
    const useSelection = mode === 'selection' && !empty
    const anchor = useSelection ? to : from
    // 续写 / 指令：把光标前的内容（最多约 4000 字）作为上下文
    const source = useSelection ? selectionMarkdown(ed, from, to) : selectionMarkdown(ed, 0, from).slice(-4000)
    const host = ed.view.dom.closest('.editor-scroll')!
    const rect = host.getBoundingClientRect()
    const coords = ed.view.coordsAtPos(anchor)
    const width = Math.min(560, rect.width - 32)
    setAiMenu(false)
    setAiReq({
      from: useSelection ? from : anchor,
      to: anchor,
      source,
      action: mode === 'continue' ? CONTINUE_ACTION : action,
      top: coords.bottom - rect.top + host.scrollTop + 10,
      left: Math.max(16, Math.min(coords.left - rect.left - 40, rect.width - width - 16))
    })
  }

  function detectSlash(ed: TiptapEditor) {
    const { $from, empty } = ed.state.selection
    if (!empty || $from.parent.type.name !== 'paragraph') return setSlash(null)
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const m = before.match(/^\/([^\s/]{0,12})$/)
    if (!m) return slashRef.current && setSlash(null)
    const coords = ed.view.coordsAtPos($from.pos)
    const host = ed.view.dom.closest('.editor-scroll')!.getBoundingClientRect()
    const scrollTop = ed.view.dom.closest('.editor-scroll')!.scrollTop
    if (!slashRef.current) setSlashIndex(0)
    setSlash({ query: m[1], from: $from.start(), top: coords.bottom - host.top + scrollTop + 6, left: coords.left - host.left })
  }

  const slashItems: SlashItem[] = useMemo(
    () => [
      { key: 'p', label: '正文', hint: 'text zw', icon: <Pilcrow size={16} />, run: (e) => e.chain().setParagraph().run() },
      { key: 'h1', label: '一级标题', hint: 'h1 bt', icon: <Heading1 size={16} />, run: (e) => e.chain().setHeading({ level: 1 }).run() },
      { key: 'h2', label: '二级标题', hint: 'h2 bt', icon: <Heading2 size={16} />, run: (e) => e.chain().setHeading({ level: 2 }).run() },
      { key: 'h3', label: '三级标题', hint: 'h3 bt', icon: <Heading3 size={16} />, run: (e) => e.chain().setHeading({ level: 3 }).run() },
      { key: 'ul', label: '无序列表', hint: 'ul list lb', icon: <List size={16} />, run: (e) => e.chain().toggleBulletList().run() },
      { key: 'ol', label: '有序列表', hint: 'ol list lb', icon: <ListOrdered size={16} />, run: (e) => e.chain().toggleOrderedList().run() },
      { key: 'task', label: '任务列表', hint: 'todo task rw', icon: <ListChecks size={16} />, run: (e) => e.chain().toggleTaskList().run() },
      { key: 'quote', label: '引用', hint: 'quote yy', icon: <Quote size={16} />, run: (e) => e.chain().toggleBlockquote().run() },
      { key: 'code', label: '代码块', hint: 'code dm', icon: <SquareCode size={16} />, run: (e) => e.chain().toggleCodeBlock().run() },
      {
        key: 'table',
        label: '表格',
        hint: 'table bg',
        icon: <TableIcon size={16} />,
        run: (e) => e.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      },
      { key: 'math', label: '公式', hint: 'math formula gs latex', icon: <Sigma size={16} />, run: () => newMathRef.current(true) },
      { key: 'imath', label: '行内公式', hint: 'inline math hngs', icon: <Radical size={16} />, run: () => newMathRef.current(false) },
      { key: 'mermaid', label: '图表', hint: 'mermaid chart diagram flow tb lct', icon: <Workflow size={16} />, run: (e) => insertMermaid(e) },
      { key: 'hr', label: '分割线', hint: 'hr divider fgx', icon: <Minus size={16} />, run: (e) => e.chain().setHorizontalRule().run() },
      {
        key: 'meta',
        label: '元信息',
        hint: 'front matter yaml meta yxx',
        icon: <FileCode2 size={16} />,
        run: (e) => {
          let title = ''
          e.state.doc.descendants((n) => {
            if (!title && n.type.name === 'heading') title = n.textContent
            return !title
          })
          const date = new Date().toLocaleDateString('sv-SE')
          e.chain().insertFrontMatter(`title: ${title}\ndate: ${date}\ntags: []`).run()
          if (e.storage.frontMatter.hidden) toast('已插入元信息。套用排版主题时编辑区不显示元信息，切换到「原生样式」即可编辑', 'info', 4000)
        }
      },
      { key: 'img', label: '图片', hint: 'image img tp', icon: <ImageIcon size={16} />, run: (e) => pickImage(e) },
      { key: 'ai-img', label: 'AI 生图', hint: 'ai image img draw sct', icon: <ImagePlus size={16} />, run: (e) => openImageGen(e) },
      { key: 'ai-continue', label: 'AI 续写', hint: 'ai continue xx', icon: <PenLine size={16} />, run: (e) => openInlineAi(e, 'continue') },
      { key: 'ai-math', label: 'AI 公式', hint: 'ai math formula gs', icon: <Sigma size={16} />, run: () => newMathRef.current(true, '') },
      { key: 'ai-ask', label: 'AI 指令', hint: 'ai ask zl', icon: <Sparkles size={16} />, run: (e) => openInlineAi(e, 'ask') }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickImage, openImageGen]
  )

  const filtered = useMemo(() => {
    if (!slash) return []
    const q = slash.query.toLowerCase()
    return slashItems.filter((i) => !q || i.label.includes(q) || i.hint.includes(q) || i.key.startsWith(q))
  }, [slash, slashItems])
  const filteredRef = useRef(filtered)
  filteredRef.current = filtered
  const slashIndexRef = useRef(slashIndex)
  slashIndexRef.current = slashIndex

  function runSlash(item: SlashItem) {
    const ed = editorRef.current
    const s = slashRef.current
    if (!ed || !s) return
    ed.chain().focus().deleteRange({ from: s.from, to: ed.state.selection.from }).run()
    setSlash(null)
    item.run(ed)
  }

  // 源码模式切换：进入时取当前 markdown，退出时回写编辑器
  const prevSource = useRef(sourceMode)
  useEffect(() => {
    if (!editor || prevSource.current === sourceMode) return
    prevSource.current = sourceMode
    if (sourceMode) setSource(editor.getMarkdown())
    else {
      editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false })
      lastEmitted.current = editor.getMarkdown()
      emitHeadings(editor)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, editor])

  useEffect(() => () => window.clearTimeout(changeTimer.current), [])

  useEffect(() => {
    if (editor) editor.storage.frontMatter.hidden = !!hideFrontMatter
  }, [editor, hideFrontMatter])

  useEffect(() => {
    if (editor && editor.isEditable === !!readOnly) editor.setEditable(!readOnly, false)
  }, [editor, readOnly])

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (sourceMode ? source : (editor?.getMarkdown() ?? '')),
      focus: () => editor?.commands.focus(),
      scrollToHeading(index) {
        if (!editor) return
        const headings = editor.view.dom.querySelectorAll('h1,h2,h3,h4,h5,h6')
        headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      insertImageFromPicker: () => editor && pickImage(editor),
      getSelectionText() {
        if (!editor || sourceMode) return ''
        const { from, to, empty } = editor.state.selection
        return empty ? '' : selectionMarkdown(editor, from, to)
      },
      replaceDocument(md) {
        if (sourceMode) {
          setSource(md)
          onChangeRef.current(md)
        } else editor?.commands.setContent(md, { contentType: 'markdown' })
      },
      openFind: (replace) => openFindRef.current(replace),
      streamDocument(md, done = false) {
        if (sourceMode) {
          setSource(md)
          if (done) onChangeRef.current(md)
          return
        }
        if (!editor) return
        editor.chain().setMeta('addToHistory', false).setContent(md, { contentType: 'markdown', emitUpdate: done }).run()
        if (!done) {
          // 跟随写入位置
          const scroller = editor.view.dom.closest('.editor-scroll')
          scroller?.scrollTo({ top: scroller.scrollHeight })
        }
      }
    }),
    [editor, sourceMode, source, pickImage]
  )

  // WebView 中 window.prompt 不可用，链接在气泡菜单内联编辑
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const openLinkEditor = () => {
    if (!editor) return
    setLinkDraft((editor.getAttributes('link').href as string | undefined) || '')
  }
  const applyLink = () => {
    if (!editor || linkDraft === null) return
    const url = linkDraft.trim()
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    setLinkDraft(null)
  }
  openLinkRef.current = openLinkEditor

  if (sourceMode) {
    return (
      <div className="editor-scroll">
        <textarea
          className="source-editor"
          value={source}
          readOnly={readOnly}
          spellCheck={false}
          autoFocus
          onChange={(e) => {
            setSource(e.target.value)
            onChange(e.target.value)
          }}
        />
      </div>
    )
  }

  return (
    <div className="editor-scroll">
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey={bubbleMenuKey}
          className="bubble-menu"
          shouldShow={({ editor: ed, state }) =>
            !state.selection.empty &&
            !ed.isActive('codeBlock') &&
            !ed.isActive('image') &&
            !ed.isActive('inlineMath') &&
            !ed.isActive('blockMath') &&
            !ed.isActive('frontMatter') &&
            !aiOpen.current
          }
        >
          {linkDraft !== null ? (
            <form
              className="bubble-link"
              onSubmit={(e) => {
                e.preventDefault()
                applyLink()
              }}
            >
              <input
                autoFocus
                value={linkDraft}
                placeholder="粘贴或输入链接，留空移除"
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setLinkDraft(null)}
                onBlur={() => setLinkDraft(null)}
              />
            </form>
          ) : aiMenu ? (
            <div className="bubble-ai">
              {INLINE_ACTIONS.map((a) => (
                <button key={a.key} onMouseDown={(e) => e.preventDefault()} onClick={() => openInlineAi(editor, 'selection', a)}>
                  {a.label}
                </button>
              ))}
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => openInlineAi(editor, 'selection')}>
                <Wand2 size={13} /> 自定义…
              </button>
            </div>
          ) : (
          <>
          <button className="bubble-ai-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => setAiMenu(true)} title="AI 编辑选中内容">
            <Sparkles size={14} /> AI
          </button>
          <span className="bubble-sep" />
          <BubbleBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="加粗 ⌘B">
            <Bold size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体 ⌘I">
            <Italic size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="删除线">
            <Strikethrough size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="高亮">
            <Highlighter size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().unsetSubscript().toggleSuperscript().run()} title="上标 x^2^">
            <SuperscriptIcon size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().unsetSuperscript().toggleSubscript().run()} title="下标 H~2~O">
            <SubscriptIcon size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="行内代码">
            <Code size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('link')} onClick={openLinkEditor} title="链接 ⌘K">
            <Link2 size={15} />
          </BubbleBtn>
          <BubbleBtn onClick={() => selectionToMath(editor)} title="转为公式（描述文字会由 AI 生成公式）">
            <Sigma size={15} />
          </BubbleBtn>
          <span className="bubble-sep" />
          <BubbleBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题">
            <Heading2 size={15} />
          </BubbleBtn>
          <BubbleBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用">
            <Quote size={15} />
          </BubbleBtn>
          </>
          )}
        </BubbleMenu>
      )}
      {editor && find && (
        <FindBar key={find.seq} editor={editor} replace={find.replace} initial={find.initial} onClose={() => setFind(null)} />
      )}
      {editor && (
        <BubbleMenu
          editor={editor}
          pluginKey={tableMenuKey}
          className="table-menu"
          options={{ placement: 'top-start', offset: 6 }}
          shouldShow={({ editor: ed }) => ed.isEditable && ed.isActive('table') && !aiOpen.current}
          getReferencedVirtualElement={() => {
            const ed = editorRef.current
            if (!ed) return null
            const dom = ed.view.domAtPos(ed.state.selection.from).node
            const table = (dom instanceof HTMLElement ? dom : dom.parentElement)?.closest('table')
            return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null
          }}
        >
          <BubbleBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="上方插入行">
            <BetweenHorizontalStart size={15} />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="下方插入行">
            <BetweenHorizontalEnd size={15} />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="左侧插入列">
            <BetweenVerticalStart size={15} />
          </BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="右侧插入列">
            <BetweenVerticalEnd size={15} />
          </BubbleBtn>
          <span className="bubble-sep" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>
            删行
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>
            删列
          </button>
          <span className="bubble-sep" />
          <BubbleBtn onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">
            <Trash2 size={15} />
          </BubbleBtn>
        </BubbleMenu>
      )}
      {editor && showToolbar && (
        <EditorToolbar
          editor={editor}
          actions={{
            link: () => {
              if (editor.state.selection.empty) editor.chain().focus().extendMarkRange('link').run()
              openLinkEditor()
            },
            math: () => newMathRef.current(true),
            image: () => pickImage(editor),
            imageGen: () => openImageGen(editor),
            mermaid: () => insertMermaid(editor)
          }}
        />
      )}
      <EditorContent editor={editor} className={`editor-content${typewriter ? ' typewriter' : ''}`} />
      {editor && math && <MathPopover key={`${math.from}-${math.to}`} editor={editor} target={math} onClose={() => setMath(null)} />}
      {genImage && (
        <ImageGenDialog
          config={imageGen}
          initialPrompt={genImage.prompt}
          onInsert={(dataUrl, prompt) => insertGenerated(dataUrl, prompt, genImage.pos)}
          onOpenSettings={() => {
            setGenImage(null)
            onOpenImageSettings()
          }}
          onClose={() => setGenImage(null)}
        />
      )}
      {editor && aiReq && <InlineAiCard key={`${aiReq.from}-${aiReq.to}-${aiReq.action?.key}`} editor={editor} request={aiReq} onClose={() => setAiReq(null)} />}
      {slash && filtered.length > 0 && (
        <div className="slash-menu" style={{ top: slash.top, left: slash.left }} onMouseDown={(e) => e.preventDefault()}>
          {filtered.map((item, i) => (
            <button
              key={item.key}
              className={i === slashIndex ? 'active' : ''}
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => runSlash(item)}
            >
              <span className="slash-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

function BubbleBtn(props: { active?: boolean; onClick(): void; title: string; children: React.ReactNode }) {
  return (
    <button className={props.active ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={props.onClick} title={props.title}>
      {props.children}
    </button>
  )
}
