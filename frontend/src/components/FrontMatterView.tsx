import { useEffect, useMemo, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { ChevronRight, FileCode2, PenLine, Trash2 } from 'lucide-react'
import { parseFrontMatter } from '../lib/front-matter'

/** 文档开头的 YAML 元信息：默认折叠为一行摘要，展开后以属性表显示，可切换为源码编辑 */
export function FrontMatterView({ node, updateAttributes, deleteNode, editor, extension }: ReactNodeViewProps) {
  const yaml = node.attrs.yaml as string
  const storage = extension.storage as { editOnMount: boolean }
  const [editing, setEditing] = useState(() => storage.editOnMount)
  const [open, setOpen] = useState(editing)
  const [draft, setDraft] = useState(yaml)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // 完成 / 取消后编辑器取回焦点会再触发一次 blur，只处理第一次
  const settled = useRef(false)
  const entries = useMemo(() => parseFrontMatter(yaml), [yaml])

  useEffect(() => {
    storage.editOnMount = false
  }, [])

  useEffect(() => {
    if (!editing) return
    const el = areaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const startEdit = () => {
    settled.current = false
    setDraft(yaml)
    setOpen(true)
    setEditing(true)
  }
  const finishEdit = (save: boolean) => {
    if (settled.current) return
    settled.current = true
    if (save && draft !== yaml) updateAttributes({ yaml: draft.replace(/\s+$/, '') })
    setEditing(false)
    editor.commands.focus()
  }

  const title = entries?.find((e) => e.key === 'title')?.value
  const summary = entries
    ? [title && (Array.isArray(title) ? title.join(', ') : title), `${entries.length} 项`].filter(Boolean).join(' · ')
    : `${yaml.split('\n').filter((l) => l.trim()).length} 行`

  return (
    <NodeViewWrapper className={`front-matter${open ? ' open' : ''}`} contentEditable={false}>
      <div className="fm-head" onClick={() => !editing && setOpen((v) => !v)}>
        <ChevronRight size={14} className="fm-chevron" />
        <FileCode2 size={13} />
        <span className="fm-label">元信息</span>
        {!open && <span className="fm-summary">{summary}</span>}
        <span className="fm-actions" onClick={(e) => e.stopPropagation()}>
          {!editing && (
            <button title="编辑源码" onClick={startEdit}>
              <PenLine size={13} />
            </button>
          )}
          <button title="删除元信息" onClick={() => deleteNode()}>
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      {open && (
        <div className="fm-body">
          {editing ? (
            <>
              <textarea
                ref={areaRef}
                className="fm-source"
                value={draft}
                rows={Math.max(3, draft.split('\n').length)}
                spellCheck={false}
                placeholder="title: 文章标题"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                    e.preventDefault()
                    finishEdit(e.key === 'Enter')
                  }
                }}
                onBlur={() => finishEdit(true)}
              />
              <small className="fm-hint">YAML 格式 · ⌘↵ 完成 · Esc 取消</small>
            </>
          ) : entries && entries.length ? (
            <dl className="fm-props" onDoubleClick={startEdit}>
              {entries.map((e, i) => (
                <div key={i} className="fm-prop">
                  <dt>{e.key}</dt>
                  <dd>
                    {Array.isArray(e.value) ? (
                      e.value.map((v, j) => (
                        <span key={j} className="fm-tag">
                          {v}
                        </span>
                      ))
                    ) : e.value ? (
                      e.value
                    ) : (
                      <span className="fm-empty">空</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <pre className="fm-raw" onDoubleClick={startEdit}>
              {yaml || '（空）'}
            </pre>
          )}
        </div>
      )}
    </NodeViewWrapper>
  )
}
