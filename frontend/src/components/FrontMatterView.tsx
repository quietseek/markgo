import { useMemo } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { ChevronRight, FileCode2 } from 'lucide-react'
import { parseFrontMatter } from '../lib/front-matter'

/** 文档开头的 YAML 元信息：编辑区只显示一行摘要，点击在侧边栏「信息」中查看与编辑 */
export function FrontMatterView({ node, extension }: ReactNodeViewProps) {
  const yaml = node.attrs.yaml as string
  const entries = useMemo(() => parseFrontMatter(yaml), [yaml])
  const title = entries?.find((e) => e.key === 'title')?.value
  const summary = entries
    ? [title && (Array.isArray(title) ? title.join(', ') : title), `${entries.length} 项`].filter(Boolean).join(' · ')
    : `${yaml.split('\n').filter((l) => l.trim()).length} 行`

  return (
    <NodeViewWrapper className="front-matter" contentEditable={false}>
      <div className="fm-head" title="在侧边栏中查看与编辑元信息" onClick={() => extension.options.onOpen()}>
        <FileCode2 size={13} />
        <span className="fm-label">元信息</span>
        <span className="fm-summary">{summary}</span>
        <ChevronRight size={13} className="fm-chevron" />
      </div>
    </NodeViewWrapper>
  )
}
