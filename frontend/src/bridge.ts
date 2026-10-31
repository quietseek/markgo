// window.markgo 的 Wails 实现：方法调用 Go 端 Bridge 服务（bridge.go），事件经 Wails 事件系统推送。
// 前端其余代码只依赖 MarkGoApi 接口（shared/types.ts），与底层运行时无关。
import { Call, Events } from '@wailsio/runtime'
import type { AgentEvent, MarkGoApi, UpdateProgress } from '@shared/types'

const call = <T = unknown>(method: string, ...args: unknown[]): Promise<T> => Call.ByName(`main.Bridge.${method}`, ...args) as Promise<T>

/** Go 端以空字符串表示「对话框已取消」 */
const orNull = async (p: Promise<string>) => (await p) || null

function on<T>(name: string, cb: (data: T) => void): () => void {
  return Events.On(name, (ev: { data: T }) => cb(ev.data))
}

function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** 富文本复制：优先异步剪贴板接口，不支持时退回选区复制 */
async function writeHtml(html: string, text: string) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ])
      return
    } catch {
      // 继续尝试选区复制
    }
  }
  const holder = document.createElement('div')
  holder.contentEditable = 'true'
  holder.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const selection = window.getSelection()
  const saved = selection && selection.rangeCount ? selection.getRangeAt(0) : null
  const range = document.createRange()
  range.selectNodeContents(holder)
  selection?.removeAllRanges()
  selection?.addRange(range)
  const ok = document.execCommand('copy')
  selection?.removeAllRanges()
  if (saved) selection?.addRange(saved)
  holder.remove()
  if (!ok) throw new Error('无法写入剪贴板')
}

async function writeImage(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob()
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

/**
 * Windows / Linux 使用无边框窗口，没有菜单栏：在这里把快捷键映射为菜单动作（macOS 由原生菜单处理，见 menu.go）
 * key 为 KeyboardEvent.key 的小写形式
 */
const SHORTCUTS: { key: string; shift?: boolean; action: string }[] = [
  { key: 'n', action: 'new-file' },
  { key: 'o', action: 'open-file' },
  { key: 'o', shift: true, action: 'open-folder' },
  { key: 's', action: 'save' },
  { key: 's', shift: true, action: 'save-as' },
  { key: ',', action: 'settings' },
  { key: 'f', action: 'find' },
  { key: 'h', action: 'replace' },
  { key: '\\', action: 'toggle-sidebar' },
  { key: '/', action: 'toggle-source' },
  { key: 'f', shift: true, action: 'toggle-focus' },
  { key: 'j', action: 'toggle-ai' },
  { key: 'c', shift: true, action: 'copy-wechat' },
  { key: 'e', shift: true, action: 'publish-wechat' }
]

const menuListeners = new Set<(action: string) => void>()

function installShortcuts() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const key = e.key.toLowerCase()
      const hit = SHORTCUTS.find((s) => s.key === key && !!s.shift === e.shiftKey)
      if (!hit) return
      e.preventDefault()
      e.stopPropagation()
      menuListeners.forEach((cb) => cb(hit.action))
    },
    true
  )
}

/** 网页链接在系统浏览器中打开；拖到编辑区以外的文件不让窗口跳转过去 */
function installNavigationGuards() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || e.defaultPrevented || !/^https?:/i.test(a.href) || a.origin === location.origin) return
    e.preventDefault()
    void call('OpenExternal', a.href)
  })
  window.open = ((url?: string | URL) => {
    if (url && /^https?:/i.test(String(url))) void call('OpenExternal', String(url))
    return null
  }) as typeof window.open
  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', (e) => e.preventDefault())
}

export async function installBridge(): Promise<void> {
  // 页面（重新）加载期间收到的「打开文件」请求先排队，由前端启动后取走
  const [platform, nativeControls] = await Promise.all([call<string>('Platform'), call<boolean>('NativeControls'), call('PageLoading')])
  if (platform !== 'darwin') installShortcuts()
  installNavigationGuards()

  const api: MarkGoApi = {
    settings: {
      get: () => call('GetSettings'),
      // undefined 表示删除该项（如关闭文件夹时的 lastWorkspace），JSON 会丢弃 undefined，改为 null 传给 Go
      set: (patch) => call('SetSettings', Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v])))
    },
    themes: {
      list: () => call('ListThemes'),
      import: () => call('ImportTheme'),
      importFolder: () => call('ImportThemeFolder'),
      remove: (id) => call('RemoveTheme', id),
      openFolder: () => call('OpenThemesFolder'),
      onChange: (cb) => on<null>('themes:changed', () => cb())
    },
    fs: {
      openFolder: () => orNull(call('OpenFolder')),
      openFile: () => orNull(call('OpenFile')),
      listTree: (root) => call('ListTree', root),
      read: (p) => call('ReadFile', p),
      write: (p, content) => call('WriteFile', p, content),
      create: (dir, name, kind) => call('CreateEntry', dir, name, kind),
      rename: (p, name) => call('RenameEntry', p, name),
      remove: (p) => call('RemoveEntry', p),
      saveAs: (content, name) => orNull(call('SaveAs', content, name)),
      reveal: (p) => call('Reveal', p),
      exportHtml: (html, name) => orNull(call('ExportHtml', html, name)),
      saveFile: (data, name) => orNull(call('SaveFile', data, name)),
      pickImage: () => orNull(call('PickImage')),
      exists: (p) => call('Exists', p),
      scratchPath: () => call('ScratchPath')
    },
    image: {
      uploadPaths: (paths, docPath) => call('UploadPaths', paths, docPath ?? ''),
      uploadBuffer: (data, ext, docPath) => call('UploadBuffer', toBase64(data), ext, docPath ?? ''),
      testPicgo: () => call('TestPicgo'),
      uploadToHost: (src, docPath) => call('UploadToHost', src, docPath ?? ''),
      download: (src, docPath) => call('DownloadImage', src, docPath ?? ''),
      generate: (prompt) => call('GenerateImage', prompt),
      reveal: (src, docPath) => call('RevealImage', src, docPath ?? ''),
      // 网页拖放拿不到文件的磁盘路径，由调用方改为上传文件内容
      pathForFile: () => ''
    },
    wechat: {
      testConnection: () => call('WechatTest'),
      publishDraft: (input) => call('WechatPublish', input)
    },
    clipboard: { writeHtml, writeImage },
    shell: {
      openExternal: (url) => call('OpenExternal', url)
    },
    ai: {
      start: () => call('AiStart'),
      stop: () => call('AiStop'),
      prompt: (input) => call('AiPrompt', input),
      cancel: (channel) => call('AiCancel', channel),
      respondPermission: (requestId, optionId) => void call('AiRespondPermission', requestId, optionId),
      resolveWrite: (requestId, accepted, content) => void call('AiResolveWrite', requestId, accepted, content ?? null),
      setActiveDoc: (path, markdown) => void call('AiSetActiveDoc', path, markdown),
      markSaved: (path, content) => void call('AiMarkSaved', path, content),
      onEvent: (cb) => on<AgentEvent>('ai:event', cb)
    },
    platform,
    app: {
      info: () => call('AppInfo'),
      takeOpenPath: () => call('TakeOpenPath'),
      checkUpdate: () => call('CheckUpdate'),
      installUpdate: () => call('InstallUpdate'),
      onUpdateProgress: (cb) => on<UpdateProgress>('update:progress', cb),
      onSaveRequest: (cb) => on<null>('app:save', () => cb())
    },
    window: {
      setDark: (dark) => void call('SetDark', dark),
      minimize: () => void call('Minimize'),
      toggleMaximize: () => void call('ToggleMaximize'),
      close: () => void call('CloseWindow'),
      nativeControls,
      onMaximizeChange: (cb) => on<boolean>('window:maximized', cb)
    },
    onMenu(cb) {
      menuListeners.add(cb)
      const off = on<string>('menu', cb)
      return () => {
        menuListeners.delete(cb)
        off()
      }
    },
    onOpenPath: (cb) => on<string>('open-path', cb),
    onOpenWorkspace: (cb) => on<string>('open-workspace', cb)
  }
  window.markgo = api
}
