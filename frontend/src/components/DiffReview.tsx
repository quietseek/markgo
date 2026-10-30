import { useMemo, useState } from 'react'
import { Check, FileDiff, X } from 'lucide-react'
import type { WriteProposal } from '@shared/types'
import { composeMarkdown, diffBlocks, hunksOf, inlineDiff, isInlinePair, type Hunk } from '../lib/diff'
import { renderAgentMarkdown } from '../lib/sanitize'
import { basename } from '../lib/assets'
import { stripInline } from '../lib/render'

interface Props {
  proposal: WriteProposal
  isActiveDoc: boolean
  queued: number
  onResolve(accepted: boolean, content: string | undefined, result: 'accepted' | 'rejected' | 'partial'): void
}

/** AI 修改审阅：逐处接受 / 拒绝，确认后一次性应用 */
export function DiffReview({ proposal, isActiveDoc, queued, onResolve }: Props) {
  const parts = useMemo(() => diffBlocks(proposal.before, proposal.after), [proposal])
  const hunks = useMemo(() => hunksOf(parts), [parts])
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(hunks.map((h) => h.id)))
  const [showAll, setShowAll] = useState(false)

  const toggle = (id: number, value: boolean) =>
    setAccepted((prev) => {
      const next = new Set(prev)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })

  const apply = () => {
    if (!accepted.size) return onResolve(false, undefined, 'rejected')
    const content = composeMarkdown(proposal.before, proposal.after, parts, accepted)
    onResolve(true, content, accepted.size === hunks.length ? 'accepted' : 'partial')
  }

  const source =
    proposal.source === 'disk'
      ? proposal.duringTurn
        ? 'Agent 修改了当前文档'
        : '文件在编辑器外被修改'
      : isActiveDoc
        ? 'Agent 建议修改当前文档'
        : 'Agent 想要写入另一个文件'
  const hint = proposal.source === 'disk' ? ' · 拒绝将恢复为修改前的内容' : ''

  return (
    <div className="diff-review">
      <div className="diff-head">
        <FileDiff size={16} />
        <div className="diff-title">
          <strong>{source}</strong>
          <span>
            {basename(proposal.path)} · {hunks.length ? `${hunks.length} 处修改` : '内容相同'}
            {hint}
            {queued > 0 && ` · 之后还有 ${queued} 个待审阅`}
          </span>
        </div>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          显示全文
        </label>
        <button className="btn ghost" onClick={() => onResolve(false, undefined, 'rejected')}>
          全部拒绝
        </button>
        <button className="btn" onClick={() => onResolve(true, proposal.after, 'accepted')}>
          全部接受
        </button>
        <button className="btn primary" onClick={apply}>
          应用所选（{accepted.size}/{hunks.length}）
        </button>
      </div>

      <div className="diff-scroll">
        <div className="diff-body prose-editor">
          {parts.map((p, i) =>
            p.kind === 'same' ? (
              showAll ? (
                <Blocks key={i} blocks={p.blocks} className="diff-same" />
              ) : (
                <Collapsed key={i} blocks={p.blocks} first={i === 0} last={i === parts.length - 1} />
              )
            ) : (
              <HunkView key={i} hunk={p.hunk} accepted={accepted.has(p.hunk.id)} onToggle={(v) => toggle(p.hunk.id, v)} />
            )
          )}
        </div>
      </div>
    </div>
  )
}

function HunkView({ hunk, accepted, onToggle }: { hunk: Hunk; accepted: boolean; onToggle(v: boolean): void }) {
  return (
    <section className={`diff-hunk ${accepted ? 'is-accepted' : 'is-rejected'}`}>
      <div className="hunk-actions">
        <button className={accepted ? 'on' : ''} onClick={() => onToggle(true)} title="接受此处">
          <Check size={14} /> 接受
        </button>
        <button className={!accepted ? 'on' : ''} onClick={() => onToggle(false)} title="保留原文">
          <X size={14} /> 拒绝
        </button>
      </div>
      {isInlinePair(hunk) ? (
        <InlinePair before={hunk.before[0]} after={hunk.after[0]} />
      ) : (
        <>
          {hunk.before.length > 0 && <Blocks blocks={hunk.before} className="diff-del" />}
          {hunk.after.length > 0 && <Blocks blocks={hunk.after} className="diff-ins" />}
        </>
      )}
    </section>
  )
}

/** 同一段落的词级差异：在一段中标出删除与新增 */
function InlinePair({ before, after }: { before: string; after: string }) {
  const heading = before.match(/^(#{1,6})\s/)?.[1].length
  const changes = inlineDiff(stripMarks(before), stripMarks(after))
  const content = changes.map((c, i) =>
    c.added ? <ins key={i}>{c.value}</ins> : c.removed ? <del key={i}>{c.value}</del> : <span key={i}>{c.value}</span>
  )
  const Tag = heading ? (`h${heading}` as 'h1') : 'p'
  return <Tag className="diff-inline">{content}</Tag>
}

/** 词级差异展示纯文本（去掉标题符号等 Markdown 标记），结构差异由块级视图负责 */
const stripMarks = (block: string) => stripInline(block.replace(/^#{1,6}\s+/, ''))

function Blocks({ blocks, className }: { blocks: string[]; className: string }) {
  const html = useMemo(() => renderAgentMarkdown(blocks.join('\n\n')), [blocks])
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function Collapsed({ blocks, first, last }: { blocks: string[]; first: boolean; last: boolean }) {
  // 只保留与改动相邻的一块作为上下文
  const before = first ? [] : blocks.slice(0, 1)
  const after = last ? [] : blocks.slice(-1)
  const hidden = blocks.length - before.length - after.length
  if (blocks.length <= 2) return <Blocks blocks={blocks} className="diff-same" />
  return (
    <>
      {before.length > 0 && <Blocks blocks={before} className="diff-same" />}
      {hidden > 0 && <div className="diff-gap">… {hidden} 个未修改的段落 …</div>}
      {after.length > 0 && <Blocks blocks={after} className="diff-same" />}
    </>
  )
}
