import { useMemo, useState } from 'react'
import { ExternalLink, ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { Modal } from './Modal'
import { prepareMermaid } from '../lib/mermaid'
import { extractDigest, extractTitle, firstImageSrc, removeTitleHeading, renderWechat } from '../lib/render'
import { resolveDisplaySrc } from '../lib/assets'
import { themeList } from '../lib/themes'
import { askOnce } from '../lib/ai'
import { toast } from '../lib/toast'

interface Props {
  markdown: string
  docPath: string
  settings: AppSettings
  onOpenSettings(): void
  onClose(): void
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; mediaId: string } | { kind: 'error'; message: string }

export function PublishDialog({ markdown, docPath, settings, onOpenSettings, onClose }: Props) {
  const [title, setTitle] = useState(() => extractTitle(markdown))
  const [author, setAuthor] = useState(settings.wechat.author)
  const [digest, setDigest] = useState(() => extractDigest(markdown))
  const [sourceUrl, setSourceUrl] = useState('')
  const [cover, setCover] = useState<string>(() => firstImageSrc(markdown) || '')
  const [dropTitle, setDropTitle] = useState(true)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [aiBusy, setAiBusy] = useState<null | 'title' | 'digest'>(null)

  const generate = async (field: 'title' | 'digest') => {
    setAiBusy(field)
    try {
      const article = markdown.slice(0, 8000)
      const result =
        field === 'title'
          ? await askOnce('为这篇文章拟一个适合微信公众号的标题，准确、有吸引力、不做标题党，不超过 30 字。只输出标题本身，不要引号。', article)
          : await askOnce('为这篇文章写一段微信公众号摘要，概括核心内容并吸引读者点开，不超过 100 字。只输出摘要本身。', article)
      const clean = result.replace(/^[#\s"“”'「」]+|["“”'「」\s]+$/g, '').split('\n')[0]
      if (field === 'title') setTitle(clean.slice(0, 64))
      else setDigest(result.replace(/\s+/g, ' ').slice(0, 120))
    } catch (err) {
      toast((err as Error).message, 'error', 8000)
    } finally {
      setAiBusy(null)
    }
  }
  const configured = !!(settings.wechat.appId && settings.wechat.appSecret)
  const themeLabel = useMemo(() => themeList.find((t) => t.key === settings.themeKey)?.label, [settings.themeKey])

  const publish = async () => {
    setStatus({ kind: 'busy' })
    // 公众号会单独展示文章标题，正文开头与标题相同的 H1 默认去掉，避免重复
    const body = dropTitle ? removeTitleHeading(markdown, title) : markdown
    await prepareMermaid(body)
    const content = renderWechat(body, {
      themeKey: settings.themeKey,
      fontSizeOffset: settings.fontSizeOffset,
      paraSpacingOffset: settings.paraSpacingOffset,
      linkToFootnote: settings.linkToFootnote
    })
    const res = await window.markgo.wechat.publishDraft({
      title,
      author,
      digest,
      content,
      cover: cover || undefined,
      contentSourceUrl: sourceUrl,
      docPath
    })
    setStatus(res.ok ? { kind: 'done', mediaId: res.mediaId! } : { kind: 'error', message: res.error || '发布失败' })
  }

  const pickCover = async () => {
    const p = await window.markgo.fs.pickImage()
    if (p) setCover(p)
  }

  if (!configured) {
    return (
      <Modal title="发布到公众号草稿箱" onClose={onClose}>
        <div className="modal-body empty-state">
          <p>还没有配置公众号开发者凭据。</p>
          <p className="note">在「设置 → 发布」填写 AppID / AppSecret，并把本机公网 IP 加入公众号 IP 白名单后即可一键发布草稿。</p>
          <button className="btn primary" onClick={onOpenSettings}>
            前往设置
          </button>
        </div>
      </Modal>
    )
  }

  if (status.kind === 'done') {
    return (
      <Modal title="已保存到草稿箱" onClose={onClose}>
        <div className="modal-body empty-state">
          <div className="success-mark">✓</div>
          <p>《{title}》已发送到公众号草稿箱。</p>
          <p className="note mono">media_id: {status.mediaId}</p>
          <div className="row center">
            <button className="btn" onClick={() => window.markgo.shell.openExternal('https://mp.weixin.qq.com/')}>
              <ExternalLink size={14} /> 打开公众号后台
            </button>
            <button className="btn primary" onClick={onClose}>
              完成
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  const busy = status.kind === 'busy'
  return (
    <Modal title="发布到公众号草稿箱" onClose={busy ? () => {} : onClose} width={600}>
      <div className="modal-body publish">
        <div className="publish-cover" onClick={pickCover} title="点击选择封面">
          {cover ? (
            <>
              <img src={resolveDisplaySrc(cover, docPath)} alt="封面" />
              <button
                className="cover-clear"
                onClick={(e) => {
                  e.stopPropagation()
                  setCover('')
                }}
                aria-label="移除封面"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <span>
              <ImagePlus size={20} />
              选择封面
            </span>
          )}
        </div>
        <div className="publish-fields">
          <div className="ai-field">
            <input className="publish-title" value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} placeholder="文章标题" />
            <button className="ai-gen" disabled={!!aiBusy} onClick={() => generate('title')} title="让 AI 拟标题">
              {aiBusy === 'title' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
            </button>
          </div>
          <div className="row">
            <input value={author} maxLength={16} onChange={(e) => setAuthor(e.target.value)} placeholder="作者" />
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="原文链接（可选）" />
          </div>
          <div className="ai-field">
            <textarea value={digest} maxLength={120} rows={3} onChange={(e) => setDigest(e.target.value)} placeholder="摘要（不填则由微信自动截取正文）" />
            <button className="ai-gen" disabled={!!aiBusy} onClick={() => generate('digest')} title="让 AI 写摘要">
              {aiBusy === 'digest' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
            </button>
          </div>
          <small className="counter">{digest.length}/120</small>
        </div>
      </div>
      <div className="publish-meta">
        <label className="check">
          <input type="checkbox" checked={dropTitle} onChange={(e) => setDropTitle(e.target.checked)} />
          正文去掉与标题重复的一级标题
        </label>
        <span>
          排版：{themeLabel} · 本地及外链图片将自动转存到微信
        </span>
      </div>
      {status.kind === 'error' && <div className="alert error">{status.message}</div>}
      <div className="modal-footer">
        <button className="btn ghost" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button className="btn primary" disabled={busy || !title.trim()} onClick={publish}>
          {busy ? '正在上传图片并发布…' : '发布到草稿箱'}
        </button>
      </div>
    </Modal>
  )
}
