import { useEffect, useMemo, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Code2 } from 'lucide-react'
import { renderHtmlBlock, sanitizeHtml } from '../lib/sanitize'

/**
 * 文档中的原生 HTML：按渲染效果显示，双击（或块级右上角按钮）编辑源码。
 * 源码原样保存，渲染时移除脚本与事件属性，链接不在编辑区内跳转。
 */
export function HtmlView({ node, updateAttributes, deleteNode, editor, selected }: ReactNodeViewProps) {
  const block = node.type.name === 'htmlBlock'
  const html = node.attrs.html as string
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(html)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // 完成 / 取消后编辑器取回焦点会再触发一次 blur，只处理第一次
  const settled = useRef(false)
  const rendered = useMemo(() => (block ? renderHtmlBlock(html) : sanitizeHtml(html)), [block, html])
  const visible = useMemo(() => {
    const el = document.createElement('div')
    el.innerHTML = rendered
    return !!el.textContent?.trim() || !!el.querySelector('img,svg,video,audio,canvas,hr,input,table,picture')
  }, [rendered])

  useEffect(() => {
    if (!editing) return
    const el = areaRef.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const startEdit = () => {
    if (!editor.isEditable) return
    settled.current = false
    setDraft(html)
    setEditing(true)
  }
  const finishEdit = (save: boolean) => {
    if (settled.current) return
    settled.current = true
    setEditing(false)
    const next = draft.replace(/^\n+|\s+$/g, '')
    if (save && next !== html) {
      if (next) updateAttributes({ html: next })
      else deleteNode()
    }
    editor.commands.focus()
  }

  const source = editing && (
    <textarea
      ref={areaRef}
      className="html-source"
      value={draft}
      rows={block ? Math.max(2, draft.split('\n').length) : Math.min(8, Math.max(2, draft.split('\n').length))}
      spellCheck={false}
      placeholder="HTML 源码，留空删除"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          finishEdit(e.key === 'Enter')
        }
      }}
      onBlur={() => finishEdit(true)}
    />
  )
  // 链接不在编辑区内跳转（会把整个应用导航走），按住 ⌘ / Ctrl 时交给系统浏览器打开
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault()
    const href = a.getAttribute('href')
    if ((e.metaKey || e.ctrlKey) && href && /^https?:/i.test(href)) window.open(href, '_blank')
  }

  if (block)
    return (
      <NodeViewWrapper className={`html-block${editing ? ' editing' : ''}${selected ? ' selected' : ''}`} contentEditable={false}>
        {editing ? (
          <>
            {source}
            <small className="html-hint">HTML · ⌘↵ 完成 · Esc 取消</small>
          </>
        ) : (
          <>
            {visible ? (
              <div className="html-render" onClick={onClick} onDoubleClick={startEdit} dangerouslySetInnerHTML={{ __html: rendered }} />
            ) : (
              <div className="html-empty" onDoubleClick={startEdit}>
                <Code2 size={13} /> {html.startsWith('<!--') ? 'HTML 注释' : 'HTML（无可见内容）'}
              </div>
            )}
            {editor.isEditable && (
              <button className="html-edit" title="编辑 HTML 源码" onMouseDown={(e) => e.preventDefault()} onClick={startEdit}>
                <Code2 size={12} />
              </button>
            )}
          </>
        )}
      </NodeViewWrapper>
    )

  return (
    <NodeViewWrapper as="span" className={`html-inline${selected ? ' selected' : ''}`} contentEditable={false}>
      {visible ? (
        <span className="html-render" onClick={onClick} onDoubleClick={startEdit} dangerouslySetInnerHTML={{ __html: rendered }} />
      ) : (
        <span className="html-empty" onDoubleClick={startEdit} title={html}>
          <Code2 size={11} />
        </span>
      )}
      {editing && <span className="html-popover">{source}</span>}
    </NodeViewWrapper>
  )
}
