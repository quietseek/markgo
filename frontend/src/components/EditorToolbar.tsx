import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Sigma,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Undo2,
  Workflow
} from 'lucide-react'

export interface ToolbarActions {
  link(): void
  math(): void
  image(): void
  imageGen(): void
  mermaid(): void
}

interface Item {
  key: string
  title: string
  icon: React.ReactNode
  run(): void
  active?: boolean
  disabled?: boolean
}

/** 编辑区顶部的单行快捷操作栏 */
export function EditorToolbar({ editor, actions }: { editor: Editor; actions: ToolbarActions }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      empty: e.state.selection.empty,
      paragraph: e.isActive('paragraph'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock')
    })
  })
  const chain = () => editor.chain().focus()

  const groups: Item[][] = [
    [
      { key: 'undo', title: '撤销 ⌘Z', icon: <Undo2 />, run: () => chain().undo().run(), disabled: !s.canUndo },
      { key: 'redo', title: '重做 ⇧⌘Z', icon: <Redo2 />, run: () => chain().redo().run(), disabled: !s.canRedo }
    ],
    [
      { key: 'p', title: '正文 ⌘0', icon: <Pilcrow />, run: () => chain().setParagraph().run(), active: s.paragraph },
      { key: 'h1', title: '一级标题 ⌘1', icon: <Heading1 />, run: () => chain().toggleHeading({ level: 1 }).run(), active: s.h1 },
      { key: 'h2', title: '二级标题 ⌘2', icon: <Heading2 />, run: () => chain().toggleHeading({ level: 2 }).run(), active: s.h2 },
      { key: 'h3', title: '三级标题 ⌘3', icon: <Heading3 />, run: () => chain().toggleHeading({ level: 3 }).run(), active: s.h3 }
    ],
    [
      { key: 'bold', title: '加粗 ⌘B', icon: <Bold />, run: () => chain().toggleBold().run(), active: s.bold },
      { key: 'italic', title: '斜体 ⌘I', icon: <Italic />, run: () => chain().toggleItalic().run(), active: s.italic },
      { key: 'strike', title: '删除线', icon: <Strikethrough />, run: () => chain().toggleStrike().run(), active: s.strike },
      { key: 'highlight', title: '高亮', icon: <Highlighter />, run: () => chain().toggleHighlight().run(), active: s.highlight },
      { key: 'code', title: '行内代码', icon: <Code />, run: () => chain().toggleCode().run(), active: s.code },
      {
        key: 'link',
        title: s.empty && !s.link ? '链接 ⌘K（先选中文字）' : '链接 ⌘K',
        icon: <Link2 />,
        run: actions.link,
        active: s.link,
        disabled: s.empty && !s.link
      }
    ],
    [
      { key: 'ul', title: '无序列表', icon: <List />, run: () => chain().toggleBulletList().run(), active: s.bulletList },
      { key: 'ol', title: '有序列表', icon: <ListOrdered />, run: () => chain().toggleOrderedList().run(), active: s.orderedList },
      { key: 'task', title: '任务列表', icon: <ListChecks />, run: () => chain().toggleTaskList().run(), active: s.taskList },
      { key: 'quote', title: '引用', icon: <Quote />, run: () => chain().toggleBlockquote().run(), active: s.blockquote }
    ],
    [
      { key: 'codeBlock', title: '代码块', icon: <SquareCode />, run: () => chain().toggleCodeBlock().run(), active: s.codeBlock },
      { key: 'table', title: '表格', icon: <TableIcon />, run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      { key: 'math', title: '公式', icon: <Sigma />, run: actions.math },
      { key: 'image', title: '图片', icon: <ImageIcon />, run: actions.image },
      { key: 'imageGen', title: 'AI 生图', icon: <ImagePlus />, run: actions.imageGen },
      { key: 'mermaid', title: 'Mermaid 图表', icon: <Workflow />, run: actions.mermaid },
      { key: 'hr', title: '分割线', icon: <Minus />, run: () => chain().setHorizontalRule().run() }
    ]
  ]

  return (
    <div className="editor-toolbar" onMouseDown={(e) => e.preventDefault()}>
      <div className="editor-toolbar-inner">
        {groups.map((g, i) => (
          <div className="tb-group" key={i}>
            {g.map((item) => (
              <button
                key={item.key}
                className={item.active ? 'active' : ''}
                title={item.title}
                disabled={item.disabled}
                onClick={item.run}
              >
                {item.icon}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
