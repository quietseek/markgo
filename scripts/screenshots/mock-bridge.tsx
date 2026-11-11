// 截图用入口：用内存中的示例笔记库模拟 window.markgo，让真实界面在普通浏览器里渲染。
// 画面由 URL 参数控制，见 shoot.mjs 中的 SHOTS。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultSettings, type AppSettings, type FileNode, type MarkGoApi } from '../../frontend/src/shared/types'
import { NOTES } from './notes'
import '../../frontend/src/styles.css'

const q = new URLSearchParams(location.search)
const ROOT = '/Users/me/写作'
const files: Record<string, string> = Object.fromEntries(Object.entries(NOTES).map(([k, v]) => [`${ROOT}/${k}`, v]))

let settings: AppSettings = {
  ...defaultSettings,
  lastWorkspace: ROOT,
  lastFile: `${ROOT}/${q.get('doc') ?? '公众号/慢写作.md'}`,
  themeKey: q.get('theme') ?? defaultSettings.themeKey,
  // sync：编辑区跟随排版主题；default：原生样式
  editorTheme: q.get('editorTheme') ?? 'sync',
  appearance: (q.get('appearance') as AppSettings['appearance']) ?? 'light',
  showAgent: q.has('agent'),
  showSidebar: !q.has('nosidebar'),
  editorWidth: (q.get('width') as AppSettings['editorWidth']) ?? defaultSettings.editorWidth,
  // 启动 5 秒后的更新检查会弹出提示，截图时关闭
  autoCheckUpdate: false
}

function tree(): FileNode[] {
  const root: FileNode[] = []
  for (const rel of Object.keys(NOTES)) {
    let level = root
    let path = ROOT
    rel.split('/').forEach((name, i, parts) => {
      path += '/' + name
      const isFile = i === parts.length - 1
      let node = level.find((n) => n.name === name)
      if (!node) {
        node = isFile ? { name, path, type: 'file' } : { name, path, type: 'dir', children: [] }
        level.push(node)
      }
      if (!isFile) level = node.children!
    })
  }
  return root
}

const noop = () => {}
/** 未实现的方法：on* 返回取消订阅函数，其余返回空结果的 Promise */
function stub<T extends object>(impl: Partial<T> = {}): T {
  return new Proxy(impl, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target]
      if (key.startsWith('on')) return () => noop
      return async () => (/list|formats/i.test(key) ? [] : null)
    }
  }) as T
}

const api: MarkGoApi = {
  fonts: stub(),
  platform: q.get('platform') ?? 'darwin',
  settings: {
    get: async () => settings,
    set: async (patch) => (settings = { ...settings, ...patch })
  },
  fs: stub<MarkGoApi['fs']>({
    listTree: async () => tree(),
    read: async (p) => files[p] ?? '',
    write: async (p, c) => void (files[p] = c),
    exists: async (p) => p in files,
    scratchPath: async () => '/tmp/scratch.md'
  }),
  themes: stub(),
  export: stub(),
  image: stub<MarkGoApi['image']>({ pathForFile: () => '' }),
  wechat: stub(),
  clipboard: stub(),
  shell: stub(),
  ai: stub<MarkGoApi['ai']>({ respondPermission: noop, resolveWrite: noop, setActiveDoc: noop, markSaved: noop }),
  app: stub<MarkGoApi['app']>({
    info: async () => ({ version: '', wails: '', go: '', platform: 'darwin/arm64', homepage: '' })
  }),
  window: stub<MarkGoApi['window']>({ setDark: noop, minimize: noop, toggleMaximize: noop, close: noop, nativeControls: false }),
  onMenu: () => noop,
  onOpenPath: () => noop,
  onOpenWorkspace: () => noop
}
window.markgo = api

// 组件在模块顶层读取 window.markgo，需先装好桥接再加载界面
import('../../frontend/src/App').then(({ App }) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
)
