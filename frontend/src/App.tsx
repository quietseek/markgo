import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Code2, FileCode, FileOutput, Loader2, PanelLeft, Sparkles, AppWindow } from 'lucide-react'
import { MAX_RECENT_WORKSPACES, type AppSettings, type FileNode, type WriteProposal, type UpdateCheck } from '@shared/types'
import { Editor, type EditorHandle, type HeadingInfo } from './components/Editor'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import { SettingsDialog } from './components/SettingsDialog'
import { WindowControls } from './components/WindowControls'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { AboutDialog, type UpdateState } from './components/AboutDialog'
import { PublishDialog } from './components/PublishDialog'
import { ExportDialog } from './components/ExportDialog'
import { Toasts } from './components/Toasts'
import { AgentPanel } from './components/AgentPanel'
import { LayoutControls, PublishActions } from './components/LayoutControls'
import { EditorWidthSwitch, ImageModeSwitch } from './components/EditorWidthSwitch'
import { DocumentTabs, documentKey, documentLabel, type DocumentTab } from './components/DocumentTabs'
import { buildEditorThemeCss, resolveEditorTheme } from './lib/editor-theme'
import { DiffReview } from './components/DiffReview'
import { activateChatDocument, chatBusy, clearChat, deactivateChatDocument, getAgentState, handleAgentEvent, lastDraftText, resolveProposal, useAgentState } from './lib/agent-store'
import { extractDraft } from './lib/writing'
import { basename, dirname, isInside } from './lib/assets'
import { countWords, extractTitle, renderWechat } from './lib/render'
import { prepareMermaid } from './lib/mermaid'
import { toast } from './lib/toast'
import { confirmDialog } from './lib/confirm'
import { ConfirmHost } from './components/ConfirmHost'
import { WELCOME_MD } from './lib/welcome'
import { useTyporaTheme } from './lib/use-typora-theme'
import { bodyWeight, typographyStyle } from './lib/typography'

const api = window.markgo
const isMac = api.platform === 'darwin'

interface Doc extends DocumentTab {
  /** 递增以强制重建编辑器（切换文件、外部重载） */
  version: number
  initial: string
}

type SaveState = 'saved' | 'saving' | 'unsaved'

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tree, setTree] = useState<FileNode[]>([])
  const [doc, setDoc] = useState<Doc | null>(null)
  const [tabs, setTabs] = useState<DocumentTab[]>([])
  const tabsRef = useRef<DocumentTab[]>([])
  const tabsEnabled = useRef(false)
  tabsEnabled.current = settings?.showDocumentTabs ?? false
  const commitTabs = useCallback((next: DocumentTab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])
  const [markdown, setMarkdown] = useState('')
  const [headings, setHeadings] = useState<HeadingInfo[]>([])
  const [sourceMode, setSourceMode] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [dialog, setDialog] = useState<null | 'settings' | 'settings-publish' | 'settings-ai' | 'settings-image' | 'publish' | 'export' | 'shortcuts' | 'about'>(null)
  // 打开导出对话框时的文档内容
  /** 打开导出对话框时的文档快照 */
  const [exportDoc, setExportDoc] = useState<{ markdown: string; path: string; isScratch: boolean } | null>(null)
  const [update, setUpdate] = useState<UpdateState>({ checking: false })
  const agent = useAgentState()
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  const editorRef = useRef<EditorHandle>(null)
  const saveTimer = useRef<number>(undefined)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const navigationQueue = useRef<Promise<unknown>>(Promise.resolve())
  const latest = useRef({ doc, markdown, saveState })
  latest.current = { doc, markdown, saveState }

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch, wechat: { ...s.wechat, ...(patch.wechat || {}) } } : s))
    const next = await api.settings.set(patch)
    setSettings(next)
  }, [])

  useEffect(() => api.settings.onChange(() => { void api.settings.get().then(setSettings) }), [])
  useEffect(() => {
    if (settings && !settings.showDocumentTabs) commitTabs(latest.current.doc ? [latest.current.doc] : [])
  }, [settings?.showDocumentTabs, commitTabs])
  useEffect(() => {
    void api.window.setOpenDocuments(tabs.filter((tab) => !tab.isExample).map((tab) => tab.path)).catch((err) => toast(String(err), 'error'))
  }, [tabs])
  useEffect(() => api.window.onDocumentsMoved(({ from, to }) => {
    const remap = (path: string) => documentKey(path) === documentKey(from) || documentKey(path).startsWith(documentKey(from) + '/') ? to + path.slice(from.length) : path
    commitTabs(tabsRef.current.map((tab) => ({ ...tab, path: remap(tab.path) })))
    const current = latest.current.doc
    if (current && remap(current.path) !== current.path) {
      const next = { ...current, path: remap(current.path) }
      latest.current.doc = next
      setDoc(next)
      void api.settings.set({ lastFile: next.path })
    }
  }), [commitTabs])

  // ---------- 外观 ----------
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const baseDark = settings?.appearance === 'dark' || (settings?.appearance !== 'light' && systemDark)
  // 浅色 / 深色外观各自可选用一个 Typora 主题；深浅以主题自身的背景色为准
  const typora = useTyporaTheme(settings ? (baseDark ? settings.darkTheme : settings.lightTheme) : undefined)
  const dark = typora ? typora.dark : baseDark
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    api.window.setDark(dark)
  }, [dark])

  // ---------- 文件 ----------
  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current)
    const { doc: d, markdown: previous, saveState: st } = latest.current
    if (!d || d.isExample) return
    if (st === 'saved' && !editorRef.current?.hasPendingChanges()) return saveQueue.current
    const md = editorRef.current?.getMarkdown() ?? previous
    latest.current = { doc: d, markdown: md, saveState: 'saving' }
    setMarkdown(md)
    setSaveState('saving')
    try {
      const task = saveQueue.current.catch(() => {}).then(() => api.fs.write(d.path, md))
      saveQueue.current = task
      await task
      api.ai.markSaved(d.path, md)
      if (latest.current.doc?.path === d.path && latest.current.markdown === md) {
        latest.current.saveState = 'saved'
        setSaveState('saved')
      }
    } catch (err) {
      setSaveState('unsaved')
      toast(`保存失败：${(err as Error).message}`, 'error')
      throw err
    }
  }, [])

  const refreshTree = useCallback(async (root?: string) => {
    const ws = root ?? (await api.settings.get()).lastWorkspace
    setTree(ws ? await api.fs.listTree(ws) : [])
  }, [])

  /** 切换笔记库，并记入最近的文件夹 */
  const openWorkspace = useCallback(
    async (dir: string) => {
      const recent = (await api.settings.get()).recentWorkspaces.filter((d) => d !== dir)
      if (!(await api.fs.exists(dir))) {
        toast(`文件夹已不存在：${dir}`, 'error')
        return updateSettings({ recentWorkspaces: recent })
      }
      await updateSettings({ lastWorkspace: dir, recentWorkspaces: [dir, ...recent].slice(0, MAX_RECENT_WORKSPACES) })
      await refreshTree(dir)
    },
    [refreshTree, updateSettings]
  )

  /**
   * 打开文档。external 为从桌面、文件管理器等外部打开：侧栏切换到文档所在的文件夹；
   * 应用内打开时，只有笔记库之外的文档才切换
   */
  const loadDocNow = useCallback(
    async (path: string, isScratch = false, external = false, preserveChat = false) => {
        if (chatBusy()) throw new Error('请先结束当前 AI 对话并完成修改审阅，再切换文章')
        await flushSave()
        if (!(await api.window.claimDocument(path))) return false
        let content: string
        try {
          content = await api.fs.read(path)
        } catch (err) {
          await api.window.claimDocument(latest.current.doc?.path ?? '')
          await api.window.setOpenDocuments(tabsRef.current.filter((tab) => !tab.isExample).map((tab) => tab.path))
          throw err
        }
        if (isScratch && !content.trim()) content = WELCOME_MD
        await activateChatDocument(path, preserveChat)
        const next = { path, isScratch, initial: content, version: (latest.current.doc?.version || 0) + 1 }
        latest.current = { doc: next, markdown: content, saveState: 'saved' }
        setDoc(next)
        setMarkdown(content)
        const opened = tabsRef.current.filter((tab) => !tab.isExample)
        commitTabs(!tabsEnabled.current ? [next] : opened.some((tab) => documentKey(tab.path) === documentKey(path)) ? opened : [...opened, next])
        api.ai.markSaved(path, content)
        setSaveState('saved')
        setSourceMode(false)
        if (!isScratch) {
          await api.settings.set({ lastFile: path })
          const ws = (await api.settings.get()).lastWorkspace
          const dir = dirname(path)
          if (external ? ws !== dir : !ws || !isInside(path, ws)) await openWorkspace(dir)
        } else await api.settings.set({ lastFile: undefined })
        return true
    },
    [flushSave, openWorkspace, commitTabs]
  )

  const loadDoc = useCallback((path: string, isScratch = false, external = false, preserveChat = false) => {
    const task = navigationQueue.current.catch(() => {}).then(() => loadDocNow(path, isScratch, external, preserveChat))
    navigationQueue.current = task
    return task
  }, [loadDocNow])

  const openExampleNow = useCallback(async () => {
    if (chatBusy()) throw new Error('请先结束当前 AI 对话并完成修改审阅，再关闭文章')
    await flushSave()
    await api.window.claimDocument('')
    const example: Doc = { path: '', isScratch: true, isExample: true, initial: WELCOME_MD, version: (latest.current.doc?.version || 0) + 1 }
    deactivateChatDocument()
    latest.current = { doc: example, markdown: WELCOME_MD, saveState: 'saved' }
    setDoc(example)
    setMarkdown(WELCOME_MD)
    setSaveState('saved')
    setSourceMode(false)
    commitTabs([example])
    await api.settings.set({ lastFile: undefined })
  }, [flushSave, commitTabs])

  const closeTab = useCallback((tab: DocumentTab) => {
    const task = navigationQueue.current.catch(() => {}).then(async () => {
      const current = latest.current.doc
      const index = tabsRef.current.findIndex((item) => documentKey(item.path) === documentKey(tab.path))
      if (index < 0 || !current) return
      const remaining = tabsRef.current.filter((item) => documentKey(item.path) !== documentKey(tab.path))
      if (documentKey(current.path) !== documentKey(tab.path)) { commitTabs(remaining); return }
      if (remaining.length === 0) { await openExampleNow(); return }
      const next = remaining[Math.min(index, remaining.length - 1)]
      if (await loadDocNow(next.path, next.isScratch)) commitTabs(remaining)
    })
    navigationQueue.current = task
    void task.catch((err) => toast(String(err instanceof Error ? err.message : err), 'error'))
  }, [commitTabs, loadDocNow, openExampleNow])

  const selectTab = useCallback((tab: DocumentTab) => {
    if (documentKey(tab.path) === documentKey(latest.current.doc?.path ?? '')) return
    void loadDoc(tab.path, tab.isScratch).catch((err) => toast(String(err instanceof Error ? err.message : err), 'error'))
  }, [loadDoc])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!tabsEnabled.current || event.altKey || !(event.ctrlKey || event.metaKey)) return
      const current = latest.current.doc
      if (!current) return
      if (event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(current) }
      else if (event.key === 'Tab' && event.ctrlKey && tabsRef.current.length > 1) {
        event.preventDefault()
        const index = tabsRef.current.findIndex((tab) => documentKey(tab.path) === documentKey(current.path))
        selectTab(tabsRef.current[(index + (event.shiftKey ? -1 : 1) + tabsRef.current.length) % tabsRef.current.length])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeTab, selectTab])

  const openScratch = useCallback(async () => loadDoc(await api.fs.scratchPath(), true), [loadDoc])

  const requestFile = useCallback(async (path: string, forceNew = false) => {
    try {
      if (await api.window.routeOpen(path, 'file', forceNew)) return
      if (path !== latest.current.doc?.path) await loadDoc(path)
    } catch (err) { toast((err as Error).message, 'error') }
  }, [loadDoc])

  const requestWorkspace = useCallback(async (dir: string) => {
    try {
      if (await api.window.routeOpen(dir, 'workspace')) return
      if ((await api.settings.get()).lastWorkspace === dir) return
      await flushSave()
      await openWorkspace(dir)
      await openScratch()
    } catch (err) { toast((err as Error).message, 'error') }
  }, [flushSave, openWorkspace, openScratch])

  const openFolder = useCallback(async () => {
    const dir = await api.fs.openFolder()
    if (dir) await requestWorkspace(dir)
  }, [requestWorkspace])

  const closeWorkspace = useCallback(async () => {
    await updateSettings({ lastWorkspace: undefined })
    setTree([])
  }, [updateSettings])

  const openFileDialog = useCallback(async () => {
    const p = await api.fs.openFile()
    if (p) await requestFile(p)
  }, [requestFile])

  useEffect(() => {
    ;(async () => {
      const s = await api.settings.get()
      tabsEnabled.current = s.showDocumentTabs
      setSettings(s)
      // 从桌面等外部打开时优先显示该文件，侧栏直接打开文档所在的文件夹
      const external = await api.app.takeOpenPath()
      if (s.lastWorkspace && !external) refreshTree(s.lastWorkspace)
      try {
        if (external && await loadDoc(external, false, true)) return
        if (!external && s.lastFile && s.startupOpen !== 'scratch' && await loadDoc(s.lastFile)) return
      } catch {
        /* 文件已不存在：侧栏仍显示上次的文件夹 */
        if (external && s.lastWorkspace) refreshTree(s.lastWorkspace)
      }
      await openScratch()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onEditorChange = useCallback(
    (md: string) => {
      latest.current = { ...latest.current, markdown: md, saveState: 'unsaved' }
      setMarkdown(md)
      setSaveState('unsaved')
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => { void flushSave().catch(() => {}) }, 800)
    },
    [flushSave]
  )

  // 自动更新安装前写盘
  useEffect(() => api.app.onSaveRequest(() => void flushSave().catch(() => {})), [flushSave])
  useEffect(() => api.window.onCloseRequest(() => {
    void flushSave().then(() => api.window.completeClose(true), () => api.window.completeClose(false))
  }), [flushSave])

  // 窗口关闭或刷新前写盘
  useEffect(() => {
    const onUnload = () => {
      const { doc: d, markdown: md, saveState: st } = latest.current
      if (d && !d.isExample && st !== 'saved') api.fs.write(d.path, md)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const saveAs = useCallback(async () => {
    if (chatBusy()) { toast('请先结束当前 AI 对话并完成修改审阅', 'info'); return }
    await flushSave()
    const previous = latest.current.doc
    const opened = tabsRef.current
    const md = editorRef.current?.getMarkdown() ?? latest.current.markdown
    const name = `${(extractTitle(md) || '未命名').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60)}.md`
    const target = await api.fs.saveAs(md, name)
    if (!target) return
    if (previous?.isScratch && !previous.isExample) await api.fs.write(previous.path, '')
    setSaveState('saved')
    if (!await loadDoc(target)) return
    if (previous && tabsEnabled.current) {
      const replacement = { path: target, isScratch: false }
      const next = opened.filter((tab) => documentKey(tab.path) !== documentKey(target)).map((tab) => documentKey(tab.path) === documentKey(previous.path) ? replacement : tab)
      commitTabs(next.some((tab) => documentKey(tab.path) === documentKey(target)) ? next : [...next, replacement])
    }
    refreshTree()
    toast('已保存', 'success')
  }, [loadDoc, refreshTree, flushSave, commitTabs])

  const save = useCallback(async () => {
    if (latest.current.doc?.isScratch) return saveAs()
    await flushSave()
    toast('已保存', 'success', 1200)
  }, [flushSave, saveAs])

  const createEntry = useCallback(
    async (dir: string, kind: 'file' | 'dir') => {
      try {
        const p = await api.fs.create(dir, kind === 'file' ? '未命名' : '新建文件夹', kind)
        await refreshTree()
        if (kind === 'file') await loadDoc(p)
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [loadDoc, refreshTree]
  )

  const newNote = useCallback(async () => {
    const ws = settings?.lastWorkspace
    if (ws) return createEntry(ws, 'file')
    await flushSave()
    const target = await api.fs.saveAs('', '未命名.md')
    if (target) loadDoc(target)
  }, [settings?.lastWorkspace, createEntry, flushSave, loadDoc])

  /** AI 写作：以标题新建文档并打开（有笔记库时建在库根目录，否则让用户选择位置） */
  const createDoc = useCallback(
    async (title: string) => {
      try {
        const ws = settings?.lastWorkspace
        await flushSave()
        const target = ws ? await api.fs.create(ws, title, 'file') : await api.fs.saveAs('', `${title.replace(/[\\/:*?"<>|]/g, ' ')}.md`)
        if (!target) return null
        await loadDoc(target, false, false, true)
        refreshTree()
        return target
      } catch (err) {
        toast((err as Error).message, 'error')
        return null
      }
    },
    [settings?.lastWorkspace, flushSave, loadDoc, refreshTree]
  )

  const renameEntry = useCallback(
    async (path: string, name: string) => {
      if (chatBusy()) { toast('请先结束当前 AI 对话并完成修改审阅', 'info'); return }
      try {
        if (latest.current.doc?.path === path) await flushSave()
        const next = await api.fs.rename(path, name)
        const oldKey = documentKey(path)
        commitTabs(tabsRef.current.map((tab) => documentKey(tab.path) === oldKey || documentKey(tab.path).startsWith(oldKey + '/') ? { ...tab, path: next + tab.path.slice(path.length) } : tab))
        const cur = latest.current.doc
        if (cur && (cur.path === path || cur.path.startsWith(path + '/') || cur.path.startsWith(path + '\\'))) {
          const moved = next + cur.path.slice(path.length)
          latest.current.doc = { ...cur, path: moved }
          setDoc({ ...cur, path: moved })
          api.settings.set({ lastFile: moved })
        }
        refreshTree()
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [flushSave, refreshTree, commitTabs]
  )

  /** 文件树右键导出：先打开该文档（打印为 PDF、排版 HTML 都按编辑区的内容生成），再显示导出对话框 */
  const exportEntry = useCallback(
    async (path: string) => {
      try {
        if (latest.current.doc?.path !== path) await loadDoc(path)
        else await flushSave()
        setExportDoc({ markdown: await api.fs.read(path), path, isScratch: false })
        setDialog('export')
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [loadDoc, flushSave]
  )

  /** 拖动文件或文件夹到另一个文件夹 */
  const moveEntry = useCallback(
    async (path: string, destDir: string) => {
      if (chatBusy()) { toast('请先结束当前 AI 对话并完成修改审阅', 'info'); return }
      try {
        const cur = latest.current.doc
        const affectsCurrent = cur && (cur.path === path || isInside(cur.path, path))
        if (affectsCurrent) await flushSave()
        const next = await api.fs.move(path, destDir)
        if (next === path) return
        const oldKey = documentKey(path)
        commitTabs(tabsRef.current.map((tab) => documentKey(tab.path) === oldKey || documentKey(tab.path).startsWith(oldKey + '/') ? { ...tab, path: next + tab.path.slice(path.length) } : tab))
        if (cur && affectsCurrent) {
          const moved = next + cur.path.slice(path.length)
          latest.current.doc = { ...cur, path: moved }
          setDoc({ ...cur, path: moved })
          api.settings.set({ lastFile: moved })
        }
        refreshTree()
      } catch (err) {
        toast((err as Error).message ?? String(err), 'error')
      }
    },
    [flushSave, refreshTree, commitTabs]
  )

  const deleteEntry = useCallback(
    async (path: string) => {
      const ok = await confirmDialog({
        title: `将「${basename(path)}」移到废纸篓？`,
        message: '之后可以在系统的废纸篓（回收站）中恢复。',
        confirmText: '移到废纸篓',
        danger: true
      })
      if (!ok) return
      if (chatBusy()) { toast('请先结束当前 AI 对话并完成修改审阅', 'info'); return }
      const cur = latest.current.doc
      const affected = (p: string) => documentKey(p) === documentKey(path) || documentKey(p).startsWith(documentKey(path) + '/')
      if (cur && affected(cur.path)) {
        window.clearTimeout(saveTimer.current)
        setSaveState('saved')
        latest.current.saveState = 'saved'
      }
      await api.fs.remove(path)
      const remaining = tabsRef.current.filter((tab) => !affected(tab.path))
      commitTabs(remaining)
      if (cur && affected(cur.path)) {
        latest.current = { ...latest.current, doc: null, saveState: 'saved' }
        if (tabsEnabled.current && remaining.length) await loadDoc(remaining[0].path, remaining[0].isScratch)
        else if (tabsEnabled.current) await openExampleNow()
        else await openScratch()
      }
      refreshTree()
    },
    [openScratch, refreshTree, commitTabs, loadDoc, openExampleNow]
  )

  // ---------- 公众号 ----------
  const copyToWechat = useCallback(async () => {
    if (!settings) return
    const md = editorRef.current?.getMarkdown() ?? latest.current.markdown
    await prepareMermaid(md)
    const html = renderWechat(md, {
      themeKey: settings.themeKey,
      fontSizeOffset: settings.fontSizeOffset,
      paraSpacingOffset: settings.paraSpacingOffset,
      linkToFootnote: settings.linkToFootnote
    })
    const holder = document.createElement('div')
    holder.innerHTML = html
    const localImages = Array.from(holder.querySelectorAll('img')).filter((img) => !/^https?:/i.test(img.getAttribute('src') || ''))
    await api.clipboard.writeHtml(html, holder.innerText)
    if (localImages.length)
      toast(`已复制。有 ${localImages.length} 张本地图片或图表无法直接粘贴，建议改用 PicGo 图床，或通过「发布」自动转存`, 'info', 6000)
    else toast('已复制排版内容，可直接粘贴到富文本编辑器', 'success')
  }, [settings])

  const exportHtml = useCallback(async () => {
    if (!settings || !doc) return
    const md = editorRef.current?.getMarkdown() ?? markdown
    const title = extractTitle(md) || '导出'
    await prepareMermaid(md)
    const body = renderWechat(md, { ...settings, resolveImage: (s) => s })
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f5f5f5;"><div style="max-width:677px;margin:0 auto;padding:32px 20px;background:#fff;">${body}</div></body></html>`
    const p = await api.fs.exportHtml(html, `${title}.html`)
    if (p) toast('已导出 HTML', 'success')
  }, [settings, doc, markdown])

  // ---------- AI ----------
  /** 取编辑器最新内容并立即保存（编辑器的 onChange 有防抖，不能只依赖已同步的 state） */
  const syncDocNow = useCallback(async () => {
    const md = editorRef.current?.getMarkdown() ?? latest.current.markdown
    if (md !== latest.current.markdown) {
      latest.current = { ...latest.current, markdown: md, saveState: 'unsaved' }
      setMarkdown(md)
      setSaveState('unsaved')
    }
    await flushSave()
    return md
  }, [flushSave])

  /** AI 写作的初稿写完后，文件名改为元信息中的 title（没有元信息时取正文标题） */
  const finishDraft = useCallback(
    async (path: string, fallback: string) => {
      const active = latest.current.doc?.path === path
      // 写入流式输出的最终全文（Agent 若改用工具直接写了文件，则沿用文件内容）
      const draft = extractDraft(lastDraftText(getAgentState().items))
      if (draft.trim()) {
        if (active) editorRef.current?.streamDocument(draft, true)
        else await api.fs.write(path, draft)
      }
      const md = active ? await syncDocNow() : await api.fs.read(path).catch(() => '')
      const title = extractTitle(md) || fallback
      const name = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (name && name !== basename(path).replace(/\.(md|markdown|txt)$/i, '')) await renameEntry(path, name)
      toast(`《${title}》初稿已完成`, 'success')
    },
    [syncDocNow, renameEntry]
  )

  // AI 写作：Agent 的回复流式写入目标文档，期间编辑区只读，完成后由 finishDraft 写入最终内容
  const drafting = agent.writing?.phase === 'drafting' ? agent.writing : undefined
  const draftActive = !!drafting?.docPath && !!doc && drafting.docPath.toLowerCase() === doc.path.toLowerCase()
  const draftText = draftActive ? extractDraft(lastDraftText(agent.items)) : ''
  const lastStream = useRef(0)
  useEffect(() => {
    if (!draftActive || !draftText) return
    // 节流：每次写入都会重新解析全文
    const wait = Math.max(0, lastStream.current + 150 - Date.now())
    const timer = window.setTimeout(() => {
      lastStream.current = Date.now()
      editorRef.current?.streamDocument(draftText)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [draftActive, draftText])

  useEffect(() => api.ai.onEvent(handleAgentEvent), [])

  useEffect(() => {
    const current = getAgentState()
    if (!chatBusy() && current.conversation && settings?.ai.activeAgentId !== current.conversation.agentId) clearChat()
  }, [settings?.ai.activeAgentId, agent.running, agent.loading])

  // 让 Agent 读取到编辑器中的实时内容（包括尚未保存的修改）
  useEffect(() => {
    if (doc) api.ai.setActiveDoc(doc.isExample ? null : doc.path, doc.isExample ? '' : markdown)
  }, [doc, markdown])

  const proposal = agent.proposals[0]
  const isActive = (p: WriteProposal) => !!doc && p.path.toLowerCase() === doc.path.toLowerCase()

  const resolveWrite = async (
    p: WriteProposal,
    accepted: boolean,
    content: string | undefined,
    result: 'accepted' | 'rejected' | 'partial',
    quiet = false
  ) => {
    if (isActive(p)) {
      if (accepted && content != null) {
        editorRef.current?.replaceDocument(content)
        setMarkdown(content)
      } else if (p.source === 'disk') {
        // 拒绝外部改动：用编辑器内容恢复磁盘文件
        const md = editorRef.current?.getMarkdown() ?? latest.current.markdown
        await api.fs.write(p.path, md)
        api.ai.markSaved(p.path, md)
      }
    }
    api.ai.resolveWrite(p.requestId, accepted, content)
    resolveProposal(p.requestId, result)
    if (!quiet)
      toast({ accepted: '已应用 AI 修改，可用 ⌘Z 撤销', partial: '已应用所选修改，可用 ⌘Z 撤销', rejected: '已拒绝修改' }[result], result === 'rejected' ? 'info' : 'success')
    if (!isActive(p) && accepted) refreshTree()
  }

  // AI 写作的新文档是 Agent 从零写起，直接应用，不再逐处审阅
  useEffect(() => {
    const w = agent.writing
    if (proposal && w?.phase === 'drafting' && w.docPath && proposal.path.toLowerCase() === w.docPath.toLowerCase() && isActive(proposal))
      resolveWrite(proposal, true, proposal.after, 'accepted', true)
  }, [proposal, agent.writing, doc])

  const checkUpdate = useCallback(async (manual = true) => {
    setUpdate((u) => ({ ...u, checking: true }))
    let result: UpdateCheck
    try { result = await api.app.checkUpdate(manual) }
    catch (err) { result = { ok: false, error: err instanceof Error ? err.message : String(err) } }
    setUpdate({ checking: false, result })
    return result
  }, [])
  // 启动后静默检查，之后每六小时检查；后端在多窗口间共享缓存。
  const autoCheckUpdate = settings?.autoCheckUpdate
  useEffect(() => {
    if (!autoCheckUpdate) return
    const run = async () => {
      const r = await checkUpdate(false)
      if (r.ok && r.hasUpdate)
        toast(`发现新版本 v${r.latest}，${r.installable ? '可在「关于」中一键更新' : '可在「关于」中前往下载'}`, 'info', 6000)
    }
    const timer = window.setTimeout(run, 5000)
    const interval = window.setInterval(run, 6 * 60 * 60 * 1000)
    return () => { window.clearTimeout(timer); window.clearInterval(interval) }
  }, [checkUpdate, autoCheckUpdate])
  const openUpdate = () => {
    setDialog('about')
    if (!update.checking) checkUpdate()
  }

  const openAi = () => {
    if (!settings?.showAgent) updateSettings({ showAgent: true })
  }

  // ---------- 菜单 ----------
  const handlers = useRef<Record<string, () => void>>({})
  handlers.current = {
    'new-file': newNote,
    'new-window': () => { void api.window.newWindow() },
    'open-file': openFileDialog,
    'open-folder': openFolder,
    save,
    'save-as': saveAs,
    'export-html': exportHtml,
    export: () => {
      const d = latest.current.doc
      if (!d) return
      setExportDoc({ markdown: editorRef.current?.getMarkdown() ?? latest.current.markdown, path: d.path, isScratch: d.isScratch })
      setDialog('export')
    },
    settings: () => setDialog('settings'),
    'toggle-sidebar': () => updateSettings({ showSidebar: !settings?.showSidebar }),
    'toggle-source': () => setSourceMode((v) => !v),
    'toggle-focus': () => setFocusMode((v) => !v),
    'toggle-typewriter': () => {
      const on = !settings?.typewriter
      updateSettings({ typewriter: on })
      toast(on ? '已开启打字机模式' : '已关闭打字机模式', 'info', 1500)
    },
    find: () => editorRef.current?.openFind(false),
    replace: () => editorRef.current?.openFind(true),
    'copy-wechat': copyToWechat,
    'publish-wechat': () => openPublish(),
    'toggle-ai': () => updateSettings({ showAgent: !settings?.showAgent }),
    'ai-new-chat': openAi,
    shortcuts: () => setDialog('shortcuts'),
    about: () => setDialog('about'),
    'check-update': openUpdate
  }
  useEffect(
    () =>
      api.onMenu((action) => handlers.current[action]?.()),
    []
  )
  useEffect(() => api.onOpenPath((p) => { void loadDoc(p).catch((err) => toast((err as Error).message, 'error')) }), [loadDoc])
  useEffect(() => api.onOpenWorkspace((dir) => { void requestWorkspace(dir) }), [requestWorkspace])

  const openPublish = () => {
    const md = editorRef.current?.getMarkdown()
    if (md != null) setMarkdown(md)
    setDialog('publish')
  }

  const words = useMemo(() => countWords(markdown), [markdown])

  // 编辑器主题：把排版主题转换为作用于所见即所得的样式表
  const editorThemeKey = settings ? resolveEditorTheme(settings.editorTheme, settings.themeKey) : null
  const editorThemeCss = useMemo(
    () => (editorThemeKey ? buildEditorThemeCss(editorThemeKey, settings!.fontSizeOffset, settings!.paraSpacingOffset) : ''),
    [editorThemeKey, settings?.fontSizeOffset, settings?.paraSpacingOffset]
  )
  useEffect(() => {
    let el = document.getElementById('mk-editor-theme') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'mk-editor-theme'
      document.head.appendChild(el)
    }
    el.textContent = editorThemeCss
  }, [editorThemeCss])

  if (!settings || !doc) return <div className="app-loading" />

  const title = documentLabel(doc)
  const showSidebar = settings.showSidebar && !focusMode
  const showAgent = settings.showAgent && !focusMode && !doc.isExample
  // 所选按钮样式与平台原生一致时由系统绘制，否则自绘（自绘按钮的样式与位置即时生效）
  const customControls = api.window.nativeControls
    ? null
    : settings.windowControls === 'classic'
      ? 'classic'
      : settings.trafficPosition === 'left'
        ? 'traffic-left'
        : 'traffic-right'

  return (
    <div className={`app ${isMac ? 'mac' : 'win'} ctl-${customControls ? 'custom' : 'native'}${focusMode ? ' focus' : ''}`}>
      <header
        className="titlebar"
        onDoubleClick={(event) => {
          if (event.button !== 0 || (event.target as Element).closest('button, input, a, select, textarea, [role="button"]')) return
          api.window.toggleFullscreen()
        }}
      >
        <div className="titlebar-left">
          {customControls === 'traffic-left' && <WindowControls variant="traffic" />}
          <button
            className={`icon-btn${showSidebar ? ' on' : ''}`}
            title="侧边栏 ⌘\"
            onClick={() => handlers.current['toggle-sidebar']()}
          >
            <PanelLeft size={17} />
          </button>
          <button className="icon-btn" title={isMac ? '新建窗口 ⇧⌘N' : '新建窗口 Ctrl+Shift+N'} onClick={() => void api.window.newWindow()}>
            <AppWindow size={17} />
          </button>
        </div>
        <div className="titlebar-title">
          <span className="doc-title" title={doc.isScratch ? undefined : doc.path}>
            {title}
          </span>
          <span className={`save-dot ${saveState}`} title={{ saved: '已保存', saving: '保存中', unsaved: '未保存' }[saveState]} />
        </div>
        <div className="titlebar-right">
          {customControls === 'classic' && <WindowControls variant="classic" />}
          {customControls === 'traffic-right' && <WindowControls variant="traffic" side="right" />}
        </div>
      </header>

      <div className="workbench">
        {showSidebar && (
          <Sidebar
            tab={sidebarTab}
            onTab={setSidebarTab}
            workspace={settings.lastWorkspace}
            recentWorkspaces={settings.recentWorkspaces}
            tree={tree}
            activePath={doc.path}
            isScratch={doc.isScratch}
            headings={headings}
            onOpenFolder={openFolder}
            onOpenWorkspace={requestWorkspace}
            onCloseWorkspace={closeWorkspace}
            onOpenFile={(p) => void requestFile(p)}
            onOpenInNewWindow={(p) => void requestFile(p, true)}
            onRefresh={() => refreshTree()}
            onCreate={createEntry}
            onRename={renameEntry}
            onDelete={deleteEntry}
            onExport={exportEntry}
            onMove={moveEntry}
            view={settings.sidebarView}
            outlinePosition={settings.outlinePosition}
            onView={(sidebarView) => updateSettings({ sidebarView })}
            onReveal={(p) => api.fs.reveal(p)}
            onHeadingClick={(i) => editorRef.current?.scrollToHeading(i)}
            onSettings={() => setDialog('settings')}
            onShortcuts={() => setDialog('shortcuts')}
            onAbout={() => setDialog('about')}
            onUpdate={openUpdate}
            hasUpdate={!!(update.result?.ok && update.result.hasUpdate)}
          />
        )}

        <main
          className={`editor-pane width-${settings.editorWidth}${proposal ? ' reviewing' : ''}${editorThemeKey && !sourceMode ? ' mk-themed' : ''}${typora && !editorThemeKey ? ' mk-typora' : ''}`}
          data-custom-font={settings.editorFontFamily?.trim() ? '' : undefined}
          data-custom-weight={bodyWeight(settings.editorFontWeight) ? '' : undefined}
          data-custom-code={settings.editorCodeFont?.trim() ? '' : undefined}
          style={typographyStyle(settings, !editorThemeKey && !typora)}
        >
          {settings.showDocumentTabs && !focusMode && <DocumentTabs tabs={tabs} activePath={doc.path} dirty={saveState !== 'saved'} onSelect={selectTab} onClose={closeTab} />}
          {proposal && (
            <DiffReview
              key={proposal.requestId}
              proposal={proposal}
              isActiveDoc={isActive(proposal)}
              queued={agent.proposals.length - 1}
              onResolve={(accepted, content, result) => resolveWrite(proposal, accepted, content, result)}
            />
          )}
          {draftActive && (
            <div className="draft-banner">
              <Loader2 size={14} className="spin" />
              <span>AI 正在写作，完成后即可编辑</span>
              {agent.running && (
                <button className="btn sm ghost" onClick={() => api.ai.cancel('chat')}>
                  停止
                </button>
              )}
            </div>
          )}
          <Editor
            key={doc.version}
            ref={editorRef}
            docPath={doc.path}
            initialMarkdown={doc.initial}
            sourceMode={sourceMode}
            typewriter={settings.typewriter}
            showToolbar={settings.showToolbar && !doc.isExample}
            imageGen={settings.imageGen}
            onOpenImageSettings={() => setDialog('settings-image')}
            onChange={onEditorChange}
            onHeadings={setHeadings}
            hideFrontMatter={!!editorThemeKey}
            readOnly={draftActive || doc.isExample}
          />
          <footer className="statusbar">
            <button
              className={`icon-btn sm${sourceMode ? ' on active' : ''}`}
              title={sourceMode ? '返回所见即所得 ⌘/' : 'Markdown 源码 ⌘/'}
              onClick={() => setSourceMode((v) => !v)}
            >
              {sourceMode ? <FileCode size={15} /> : <Code2 size={15} />}
            </button>
            <span>{words.toLocaleString()} 字</span>
            {sourceMode ? <span>Markdown 源码</span> : <LayoutControls settings={settings} onChange={updateSettings} />}
            <EditorWidthSwitch value={settings.editorWidth} onChange={(editorWidth) => updateSettings({ editorWidth })} />
            <ImageModeSwitch value={settings.imageUploadMode} onChange={(imageUploadMode) => updateSettings({ imageUploadMode })} />
            <span className="grow" />
            <span className="muted" title={doc.path}>
              {doc.isExample ? '示例文档 · 另存为后可编辑' : doc.isScratch ? '草稿自动保存在应用数据目录 · ⌘S 另存为' : { saved: '已保存', saving: '保存中…', unsaved: '编辑中' }[saveState]}
            </span>
            {doc.isExample && <button className="btn sm ghost" onClick={() => void saveAs()}>另存为</button>}
            <PublishActions onCopy={copyToWechat} onPublish={openPublish} />
            <button className="icon-btn sm" title={`导出为 PDF、Word、HTML 等${isMac ? ' ⇧⌘P' : ' Ctrl+Shift+P'}`} onClick={() => handlers.current.export()}>
              <FileOutput size={14} />
            </button>
            <span className="status-sep" />
            <button
              className={`icon-btn sm has-dot${showAgent ? ' on active' : ''}`}
              title="AI 助手 ⌘J"
              disabled={doc.isExample}
              onClick={() => handlers.current['toggle-ai']()}
            >
              <Sparkles size={15} />
              {agent.running && <span className="tab-dot" />}
            </button>
          </footer>
        </main>

        {showAgent && (
          <aside className="right-panel">
            <AgentPanel
              settings={settings}
              docPath={doc.path}
              getSelection={() => editorRef.current?.getSelectionText() ?? ''}
              syncDoc={syncDocNow}
              onSettings={() => setDialog('settings-ai')}
              onSwitchAgent={(id) => updateSettings({ ai: { ...settings.ai, activeAgentId: id } })}
              onCreateDoc={createDoc}
              onDraftDone={finishDraft}
            />
          </aside>
        )}
      </div>

      {(dialog === 'settings' || dialog === 'settings-publish' || dialog === 'settings-ai' || dialog === 'settings-image') && (
        <SettingsDialog
          settings={settings}
          initialTab={dialog === 'settings-publish' ? 'publish' : dialog === 'settings-ai' ? 'ai' : dialog === 'settings-image' ? 'image' : 'general'}
          onSave={async (patch) => {
            await updateSettings(patch)
            if ('showHiddenFiles' in patch) refreshTree()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'publish' && (
        <PublishDialog
          markdown={markdown}
          docPath={doc.path}
          settings={settings}
          onOpenSettings={() => setDialog('settings-publish')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'export' && exportDoc && (
        <ExportDialog
          markdown={exportDoc.markdown}
          docPath={exportDoc.path}
          isScratch={exportDoc.isScratch}
          title={exportDoc.isScratch ? extractTitle(exportDoc.markdown) || '未命名' : basename(exportDoc.path).replace(/\.(md|markdown|txt)$/i, '')}
          config={settings.export}
          onSave={(cfg) => updateSettings({ export: cfg })}
          onStyledHtml={() => {
            setDialog(null)
            exportHtml()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog update={update} onCheck={() => void checkUpdate(true)} onClose={() => setDialog(null)} />}
      <ConfirmHost />
      <Toasts />
    </div>
  )
}

