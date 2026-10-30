import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { CloudUpload, Download, ExternalLink, FolderOpen, ImageOff, Link2, RefreshCw, Trash2, Type } from 'lucide-react'
import { getAssetBase, isLocalSrc, isRemoteSrc, resolveDisplaySrc } from '../lib/assets'
import { resolveToast, toast } from '../lib/toast'

/** 图片：悬停 / 选中时显示操作条（上传到图床、下载到本地、替换、说明文字、复制地址、删除） */
export function ImageView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const src = (node.attrs.src as string) || ''
  const alt = (node.attrs.alt as string) || ''
  const [broken, setBroken] = useState(false)
  const [editingAlt, setEditingAlt] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => setBroken(false), [src])

  const api = window.markgo
  const docPath = getAssetBase()
  const local = isLocalSrc(src)
  const remote = isRemoteSrc(src)

  /** 执行一次图片地址替换，并给出进度提示 */
  const swap = async (pending: string, done: string, task: () => Promise<{ ok: boolean; urls: string[]; error?: string }>) => {
    setBusy(true)
    const tid = toast(pending, 'loading')
    try {
      const res = await task()
      if (!res.ok || !res.urls[0]) throw new Error(res.error || '操作失败')
      updateAttributes({ src: res.urls[0] })
      resolveToast(tid, done, 'success')
    } catch (err) {
      resolveToast(tid, (err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const upload = () => swap('正在上传到图床…', '已上传到图床，图片地址已替换', () => api.image.uploadToHost(src, docPath))
  const download = () => swap('正在下载图片…', '已保存到本地图片目录', () => api.image.download(src, docPath))
  const replace = async () => {
    const path = await api.fs.pickImage()
    if (path) swap('正在插入图片…', '图片已替换', () => api.image.uploadPaths([path], docPath))
  }
  const reveal = async () => {
    if (!(await api.image.reveal(src, docPath))) toast('找不到图片文件', 'error')
  }
  const copySrc = () => {
    navigator.clipboard.writeText(src)
    toast('已复制图片地址', 'success')
  }

  return (
    <NodeViewWrapper className={`image-block${selected ? ' selected' : ''}${busy ? ' busy' : ''}`}>
      <div className="image-frame">
        {broken ? (
          <div className="image-broken" contentEditable={false}>
            <ImageOff size={18} />
            <span>图片无法显示</span>
            <code>{src}</code>
          </div>
        ) : (
          <img src={resolveDisplaySrc(src)} alt={alt} title={node.attrs.title || undefined} draggable={false} onError={() => setBroken(true)} />
        )}
        <div className="image-toolbar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
          {local && (
            <ToolBtn title="上传到图床（PicGo），并替换为网络地址" onClick={upload} disabled={busy}>
              <CloudUpload size={14} />
              <span>上传</span>
            </ToolBtn>
          )}
          {remote && (
            <ToolBtn title="下载到文档的本地图片目录" onClick={download} disabled={busy}>
              <Download size={14} />
              <span>存到本地</span>
            </ToolBtn>
          )}
          <ToolBtn title="替换图片" onClick={replace} disabled={busy}>
            <RefreshCw size={14} />
          </ToolBtn>
          <ToolBtn title={alt ? `图片说明：${alt}` : '图片说明（alt）'} onClick={() => setEditingAlt(true)} active={editingAlt}>
            <Type size={14} />
          </ToolBtn>
          <ToolBtn title="复制图片地址" onClick={copySrc}>
            <Link2 size={14} />
          </ToolBtn>
          {local ? (
            <ToolBtn title="在文件夹中显示" onClick={reveal}>
              <FolderOpen size={14} />
            </ToolBtn>
          ) : remote ? (
            <ToolBtn title="在浏览器中打开" onClick={() => api.shell.openExternal(src)}>
              <ExternalLink size={14} />
            </ToolBtn>
          ) : null}
          <span className="image-toolbar-sep" />
          <ToolBtn title="删除图片" onClick={deleteNode}>
            <Trash2 size={14} />
          </ToolBtn>
        </div>
      </div>
      {editingAlt && <AltInput initial={alt} onDone={(v) => (v !== null && updateAttributes({ alt: v }), setEditingAlt(false))} />}
    </NodeViewWrapper>
  )
}

function AltInput({ initial, onDone }: { initial: string; onDone(v: string | null): void }) {
  const [value, setValue] = useState(initial)
  const settled = useRef(false)
  const finish = (v: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(v)
  }
  return (
    <div className="image-caption editing" contentEditable={false}>
      <input
        autoFocus
        value={value}
        placeholder="图片说明（alt），图片无法显示时代替图片"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(value.trim())
          else if (e.key === 'Escape') finish(null)
        }}
        onBlur={() => finish(value.trim())}
      />
    </div>
  )
}

function ToolBtn(props: { title: string; onClick(): void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button className={props.active ? 'active' : ''} title={props.title} disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  )
}
