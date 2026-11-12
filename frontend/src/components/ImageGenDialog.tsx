import { useEffect, useRef, useState } from 'react'
import { Download, ImagePlus, Images, Loader2, Plus, RotateCcw, Sparkles, WandSparkles, X } from 'lucide-react'
import { IMAGE_GEN_PROVIDERS, type AppSettings, type ImageGenCapabilities } from '@shared/types'
import { Modal } from './Modal'
import { Select } from './Select'

interface Props {
  config: AppSettings['imageGen']
  initialPrompt?: string
  initialImage?: string
  docPath?: string
  onInsert(dataUrl: string, prompt: string, replace: boolean): Promise<boolean>
  onOpenSettings(): void
  onClose(): void
}

type Reference = { id: number; dataUrl: string; name: string }
type Version = { id: number; dataUrl: string; prompt: string }
const qualityLabels: Record<string, string> = { auto: '自动', low: '草图', medium: '标准', high: '精细', standard: '标准', hd: '高清' }
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export function ImageGenDialog({ config, initialPrompt = '', initialImage, docPath, onInsert, onOpenSettings, onClose }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [mode, setMode] = useState<'generate' | 'edit'>(initialImage ? 'edit' : 'generate')
  const [references, setReferences] = useState<Reference[]>([])
  const [capabilities, setCapabilities] = useState<ImageGenCapabilities | null>(null)
  const [ratio, setRatio] = useState('auto')
  const [quality, setQuality] = useState('')
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>('load')
  const lock = useRef(true)
  const sequence = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const provider = IMAGE_GEN_PROVIDERS.find((p) => p.id === config.provider)
  const image = versions.find((v) => v.id === selected)
  const configured = !!config.apiKey && !!config.model
  const maxImages = capabilities?.maxImages || 0

  useEffect(() => {
    let disposed = false
    if (!configured) { lock.current = false; setBusy(null); return }
    lock.current = true
    setBusy('load')
    setCapabilities(null)
    setRatio('auto')
    setQuality('')
    const load = async () => {
      try {
        const caps = await window.markgo.image.capabilities(config.provider, config.model)
        if (disposed) return
        setCapabilities(caps)
        if (initialImage) {
          const result = await window.markgo.image.readReference(initialImage, docPath)
          if (disposed) return
          if (!result.ok || !result.dataUrl) throw new Error(result.error || '原图读取失败')
          setReferences([{ id: ++sequence.current, dataUrl: result.dataUrl, name: '正文原图' }])
        }
      } catch (err) {
        if (!disposed) setError(message(err))
      } finally {
        if (!disposed) { lock.current = false; setBusy(null) }
      }
    }
    void load()
    return () => { disposed = true }
  }, [config.provider, config.model, configured, initialImage, docPath])

  const run = async (kind: string, task: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(kind)
    setError('')
    setNotice('')
    try { await task() } catch (err) { setError(message(err)) }
    finally { lock.current = false; setBusy(null) }
  }

  const addFiles = (files: File[]) => run('read', async () => {
    if (!maxImages) throw new Error('当前模型尚未适配参考图，请在设置中选择支持改图的模型')
    if (references.length + files.length > maxImages) throw new Error(`最多添加 ${maxImages} 张图片（含原图）`)
    const added: Reference[] = []
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('参考图支持 PNG、JPEG 和 WebP')
      if (file.size > 10 * 1024 * 1024) throw new Error('单张参考图不能超过 10 MB')
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('图片读取失败，请重试'))
        reader.readAsDataURL(file)
      })
      added.push({ id: ++sequence.current, dataUrl, name: file.name || '粘贴的图片' })
    }
    setReferences((current) => [...current, ...added])
  })

  const generate = () => run('generate', async () => {
    if (!prompt.trim()) throw new Error(mode === 'edit' ? '请描述要修改的内容' : '请描述想要的画面')
    if (mode === 'edit' && !references.length) throw new Error('请先添加要修改的图片')
    const result = await window.markgo.image.generate({ prompt: prompt.trim(), mode, ratio, quality, images: references.map((ref) => ref.dataUrl) })
    if (!result.ok || !result.dataUrl) throw new Error(result.error || '生成失败，请重试')
    const version = { id: ++sequence.current, dataUrl: result.dataUrl, prompt: prompt.trim() }
    setVersions((current) => [...current, version].slice(-6))
    setSelected(version.id)
  })

  const useImage = (replace: boolean) => run('insert', async () => {
    if (image && await onInsert(image.dataUrl, image.prompt, replace)) onClose()
  })

  const save = () => run('save', async () => {
    if (!image) return
    const ext = image.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : image.dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'
    const path = await window.markgo.fs.saveFile(image.dataUrl, `AI配图.${ext}`)
    if (path) setNotice('图片已另存')
  })

  const continueEditing = () => {
    if (!image || busy || !maxImages) return
    setReferences([{ id: ++sequence.current, dataUrl: image.dataUrl, name: '所选生成结果' }])
    setMode('edit')
    setRatio('auto')
    setPrompt('')
    setError('')
    setNotice('已将所选结果作为原图，请输入修改要求')
    promptInput.current?.focus()
  }

  if (!configured) return (
    <Modal title="AI 生图" onClose={onClose}>
      <div className="modal-body empty-state">
        <p>还没有配置 AI 生图。</p>
        <p className="note">在「设置 → 图片处理 → AI 生图」填写 API Key 与模型，即可生成配图或修改图片。</p>
        <button className="btn primary" onClick={onOpenSettings}>前往设置</button>
      </div>
    </Modal>
  )

  const preview = image?.dataUrl || (mode === 'edit' ? references[0]?.dataUrl : undefined)
  const unsupported = !!capabilities && !maxImages
  const canGenerate = !!capabilities && !!prompt.trim() && !busy && (mode !== 'edit' || (maxImages > 0 && references.length > 0)) && references.length <= maxImages

  return (
    <Modal title={initialImage ? 'AI 改图' : 'AI 生图'} onClose={busy ? () => {} : onClose} width={860}>
      <div className="modal-body image-gen"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation() } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) void addFiles(Array.from(e.dataTransfer.files)) }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith('image/'))
          if (files.length) { e.preventDefault(); e.stopPropagation(); void addFiles(files) }
        }}>
        <div className="image-gen-controls">
          <div className="image-gen-mode" role="group" aria-label="图片操作">
            <button aria-pressed={mode === 'generate'} disabled={!!busy} onClick={() => setMode('generate')}>生成新图</button>
            <button aria-pressed={mode === 'edit'} disabled={!!busy || unsupported} onClick={() => setMode('edit')}>修改图片</button>
          </div>
          <label htmlFor="image-gen-prompt">{mode === 'edit' ? '想修改什么？' : '描述你的画面'}</label>
          <textarea id="image-gen-prompt" ref={promptInput} rows={5} autoFocus value={prompt} disabled={!!busy}
            placeholder={mode === 'edit' ? '例如：背景换成浅米色，保留主体和构图' : '例如：清晨薄雾中的江南小镇，水墨风格，留白适合文章配图'}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (canGenerate) void generate() } }} />
          <div className="image-gen-label"><span>{mode === 'edit' ? '原图与参考图' : '参考图'} <small>{mode === 'edit' ? '第一张为原图' : '可选'}</small></span>{maxImages > 0 && <span>{references.length} / {maxImages}</span>}</div>
          <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp"
            onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) void addFiles(files) }} />
          <div className="image-gen-references">
            {references.map((reference, i) => (
              <div className="image-gen-thumb" key={reference.id} title={reference.name}>
                <img src={reference.dataUrl} alt={reference.name} />
                <span>{mode === 'edit' && i === 0 ? '原图' : `参考 ${mode === 'edit' ? i : i + 1}`}</span>
                <button className="image-gen-remove" aria-label={`移除${reference.name}`} disabled={!!busy} onClick={() => setReferences((current) => current.filter((ref) => ref.id !== reference.id))}><X size={12} /></button>
              </div>
            ))}
            {references.length < maxImages && <button className={`image-gen-add${references.length ? '' : ' empty'}`} disabled={!!busy} onClick={() => fileInput.current?.click()} aria-label="添加参考图">
              <Plus size={18} /><span>{references.length ? '添加' : '点击添加 · 拖入或粘贴'}</span>
            </button>}
          </div>
          <p className="image-gen-hint">{unsupported ? '当前模型仅适配文字生图，可在设置中切换 GPT Image 或 Seedream 4 / 5。' : mode === 'edit' ? '第一张为原图，其余图片作参考。PNG / JPEG / WebP，每张不超过 10 MB。' : '参考图片的风格、配色与构图。PNG / JPEG / WebP，每张不超过 10 MB。'}</p>
          <label>画面比例</label>
          <div className="image-gen-ratios" role="group" aria-label="画面比例">
            {(capabilities?.ratios || [{ value: 'auto', size: '' }]).map((item) => (
              <button key={item.value} aria-pressed={ratio === item.value} title={item.size || (mode === 'edit' ? '使用最接近原图的支持比例' : '由模型决定')} disabled={!!busy} onClick={() => setRatio(item.value)}>
                <i style={{ aspectRatio: item.value === 'auto' ? '1' : item.value.replace(':', '/') }} />{item.value === 'auto' ? '自动' : item.value}
              </button>
            ))}
          </div>
          {mode === 'edit' && <p className="image-gen-hint">自动使用最接近原图的可用比例。</p>}
          {!!capabilities?.qualities.length && <details className="image-gen-more"><summary>更多选项</summary>
            <div className="image-gen-quality"><span>画质</span><Select ariaLabel="画质" value={quality} disabled={!!busy} onChange={setQuality} options={[{value: '', label: '模型默认'}, ...capabilities.qualities.map((value) => ({ value, label: qualityLabels[value] || value }))]} /></div>
          </details>}
          <button className="btn primary image-gen-generate" disabled={!canGenerate} onClick={() => void generate()}>
            {busy === 'generate' ? <Loader2 size={14} className="spin" /> : image ? <RotateCcw size={14} /> : <Sparkles size={14} />}
            {busy === 'generate' ? '正在生成…' : mode === 'edit' ? '生成修改结果' : image ? '再生成一张' : '生成图片'}
          </button>
          <button className="image-gen-model" title={`${provider?.name || '自定义'} · ${config.model}，点击更换设置`} disabled={!!busy} onClick={onOpenSettings}>{provider?.name || '自定义'} · {config.model}</button>
        </div>
        <div className="image-gen-results">
          <div className="image-gen-label"><span>{image ? '生成结果' : preview ? '原图预览' : '画面预览'}</span>{image && <button className="image-gen-text-btn" disabled={!!busy || !maxImages} onClick={continueEditing}><WandSparkles size={13} />继续修改</button>}</div>
          <div className="image-gen-preview" aria-busy={busy === 'generate'}>
            {preview ? <img src={preview} alt={image?.prompt || '待修改的原图'} /> : <div className="image-gen-empty"><Images size={32} strokeWidth={1} /><span>为你的文字添一幅画</span><small>描述画面，也可以添加参考图</small></div>}
            {(busy === 'generate' || busy === 'load') && <div className="image-gen-progress" role="status"><Loader2 size={20} className="spin" /><span>{busy === 'load' ? '正在准备…' : '正在绘制，请稍候…'}</span><small>{busy === 'generate' ? '生成期间会保留上一张结果' : ''}</small></div>}
          </div>
          {!!versions.length && <div className="image-gen-history" aria-label="本次生成的版本">
            {versions.map((version, i) => <button key={version.id} aria-pressed={version.id === selected} aria-label={`查看版本 ${i + 1}`} disabled={!!busy} title={version.prompt} onClick={() => setSelected(version.id)}><img src={version.dataUrl} alt={`版本 ${i + 1}`} /><span>{i + 1}</span></button>)}
            <small>保留最近 6 张<br />关闭窗口后清空</small>
          </div>}
          {error && <p className="image-gen-error" role="alert">{error}</p>}
          {notice && <p className="image-gen-hint" role="status">{notice}</p>}
        </div>
      </div>
      <div className="modal-footer image-gen-footer">
        <button className="btn image-gen-save" disabled={!image || !!busy} onClick={() => void save()}><Download size={13} />另存图片</button>
        <button className={`btn${initialImage ? '' : ' primary'}`} disabled={!image || !!busy} onClick={() => void useImage(false)}><ImagePlus size={13} />插入文档</button>
        {initialImage && <button className="btn primary" disabled={!image || !!busy} onClick={() => void useImage(true)}>{busy === 'insert' ? '保存中…' : '替换原图'}</button>}
      </div>
    </Modal>
  )
}
