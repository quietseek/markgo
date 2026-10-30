import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, PenLine, Plus, Trash2 } from 'lucide-react'
import { extractFrontMatter, parseFrontMatter } from '../lib/front-matter'
import { extractTitle } from '../lib/render'

interface Props {
  markdown: string
  words: number
  /** 文件路径；未命名草稿为空 */
  path?: string
  /** 由 / 命令插入元信息后直接进入编辑；开始编辑后调用 onEditStarted */
  editRequested: boolean
  onEditStarted(): void
  onChange(yaml: string | null): void
  onReveal(path: string): void
}

/** 侧边栏「信息」：文档开头的 YAML 元信息与文档统计 */
export function DocInfo({ markdown, words, path, editRequested, onEditStarted, onChange, onReveal }: Props) {
  const yaml = useMemo(() => extractFrontMatter(markdown), [markdown])
  const entries = useMemo(() => (yaml === null ? null : parseFrontMatter(yaml)), [yaml])
  const [draft, setDraft] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const startEdit = (initial = yaml ?? '') => setDraft(initial)
  useEffect(() => {
    if (!editRequested) return
    startEdit()
    onEditStarted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequested])
  useEffect(() => {
    const el = areaRef.current
    if (draft === null || !el || document.activeElement === el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [draft])

  const finishEdit = (save: boolean) => {
    if (draft === null) return
    const next = draft.replace(/\s+$/, '')
    if (save && next !== yaml) onChange(next)
    setDraft(null)
  }

  const addMeta = () => {
    const title = extractTitle(markdown)
    startEdit(`title: ${title}\ndate: ${new Date().toLocaleDateString('sv-SE')}\ntags: []`)
  }

  const stats = useMemo(() => {
    const body = markdown.replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, '')
    return {
      headings: body.match(/^#{1,6}\s/gm)?.length ?? 0,
      images: markdown.match(/!\[[^\]]*\]\([^)]*\)/g)?.length ?? 0,
      minutes: Math.max(1, Math.round(words / 400))
    }
  }, [markdown, words])

  return (
    <div className="doc-info">
      <section>
        <div className="doc-info-head">
          <h5>元信息</h5>
          {yaml !== null && draft === null && (
            <>
              <button className="icon-btn sm" title="编辑元信息" onClick={() => startEdit()}>
                <PenLine size={13} />
              </button>
              <button className="icon-btn sm" title="删除元信息" onClick={() => onChange(null)}>
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
        {draft !== null ? (
          <>
            <textarea
              ref={areaRef}
              className="fm-source"
              value={draft}
              rows={Math.max(4, draft.split('\n').length + 1)}
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
        ) : yaml === null ? (
          <div className="doc-info-none">
            文档开头没有元信息（YAML front matter），可用来记录标题、日期、标签等。
            <button className="btn sm" onClick={addMeta}>
              <Plus size={13} /> 添加元信息
            </button>
          </div>
        ) : entries && entries.length ? (
          <dl className="fm-props" onDoubleClick={() => startEdit()} title="双击编辑">
            {entries.map((e, i) => (
              <div key={i} className="fm-prop">
                <dt title={e.key}>{e.key}</dt>
                <dd>
                  {Array.isArray(e.value) ? (
                    e.value.length ? (
                      e.value.map((v, j) => (
                        <span key={j} className="fm-tag">
                          {v}
                        </span>
                      ))
                    ) : (
                      <span className="fm-empty">空</span>
                    )
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
          <pre className="fm-raw" onDoubleClick={() => startEdit()}>
            {yaml || '（空）'}
          </pre>
        )}
      </section>

      <section>
        <div className="doc-info-head">
          <h5>文档</h5>
        </div>
        <dl className="doc-stats">
          <div>
            <dt>字数</dt>
            <dd>{words.toLocaleString()}</dd>
          </div>
          <div>
            <dt>阅读时长</dt>
            <dd>约 {stats.minutes} 分钟</dd>
          </div>
          <div>
            <dt>标题</dt>
            <dd>{stats.headings}</dd>
          </div>
          <div>
            <dt>图片</dt>
            <dd>{stats.images}</dd>
          </div>
        </dl>
      </section>

      {path && (
        <section>
          <div className="doc-info-head">
            <h5>位置</h5>
          </div>
          <div className="doc-path">
            <span>{path}</span>
            <button className="icon-btn sm" title="在文件管理器中显示" onClick={() => onReveal(path)}>
              <FolderOpen size={13} />
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
