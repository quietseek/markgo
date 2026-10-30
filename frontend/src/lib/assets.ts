/** 把文档中的相对/绝对本地图片路径映射为 /mg-asset/ 地址（由 Go 端资源中间件提供），供编辑器与预览显示 */
let baseDocPath: string | undefined

/** 与 Go 端 files.AssetPrefix 一致 */
export const ASSET_PREFIX = '/mg-asset/'

export function setAssetBase(docPath: string | undefined) {
  baseDocPath = docPath
}

export const getAssetBase = () => baseDocPath

/** 网络 / 内嵌图片之外的地址都视为本地图片 */
export const isRemoteSrc = (src: string) => /^https?:/i.test(src)
export const isLocalSrc = (src: string) => !!src && !/^(https?:|data:|blob:)/i.test(src)

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(0, i) : p
}

export function basename(p: string): string {
  return p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)
}

/** 文件是否位于文件夹内（含子目录） */
export function isInside(file: string, dir: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  return norm(file).startsWith(norm(dir) + '/')
}

function joinPath(dir: string, rel: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  const parts = (dir + sep + rel).split(/[\\/]+/)
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') out.pop()
    else if (part !== '.') out.push(part)
  }
  const joined = out.join(sep)
  return dir.startsWith('/') && !joined.startsWith('/') ? '/' + joined : joined
}

const isAbsolute = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p)

export function resolveDisplaySrc(src: string | null | undefined, docPath = baseDocPath): string {
  if (!src) return ''
  if (/^(https?:|data:|blob:)/i.test(src) || src.startsWith(ASSET_PREFIX)) return src
  let local: string | null = null
  if (src.startsWith('file://')) local = decodeURIComponent(src.replace(/^file:\/\//, ''))
  else if (isAbsolute(src)) local = src
  else if (docPath) local = joinPath(dirname(docPath), decodeURIComponent(src.split(/[?#]/)[0]))
  return local ? ASSET_PREFIX + encodeURIComponent(local) : src
}
