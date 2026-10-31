import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Code2, FileCode, PanelLeft, Sparkles } from 'lucide-react'
import { MAX_RECENT_WORKSPACES, type AppSettings, type FileNode, type WriteProposal } from '@shared/types'
import { Editor, type EditorHandle, type HeadingInfo } from './components/Editor'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import { SettingsDialog } from './components/SettingsDialog'
import { WindowControls } from './components/WindowControls'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { AboutDialog, type UpdateState } from './components/AboutDialog'
import { PublishDialog } from './components/PublishDialog'
import { Toasts } from './components/Toasts'
import { AgentPanel } from './components/AgentPanel'
import { LayoutControls, PublishActions } from './components/LayoutControls'
import { EditorWidthSwitch, ImageModeSwitch } from './components/EditorWidthSwitch'
import { buildEditorThemeCss, resolveEditorTheme } from './lib/editor-theme'
import { DiffReview } from './components/DiffReview'
import { handleAgentEvent, handleChannelEvent, resolveProposal, useAgentState } from './lib/agent-store'
import { basename } from './lib/assets'
import { countWords, extractTitle, renderWechat } from './lib/render'
import { prepareMermaid } from './lib/mermaid'
import { toast } from './lib/toast'
import { WELCOME_MD } from './lib/welcome'

const api = window.markgo
const isMac = api.platform === 'darwin'
/** 单独打开文档的窗口：只编辑这一个文件，笔记库、AI 对话等在主窗口中 */
const docWindow = api.window.docPath
/** 文档窗口中交给主窗口处理的菜单动作 */
const MAIN_ONLY_ACTIONS = ['new-file', 'open-folder', 'toggle-ai', 'ai-new-chat']

interface Doc {
  path: string
  isScratch: boolean
  /** 递增以强制重建编辑器（切换文件、外部重载） */
  version: number
  initial: string
}

type SaveState = 'saved' | 'saving' | 'unsaved'

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tree, setTree] = useState<FileNode[]>([])
  const [doc, setDoc] = useState<Doc | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [headings, setHeadings] = useState<HeadingInfo[]>([])
  const [sourceMode, setSourceMode] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [dialog, setDialog] = useState<null | 'settings' | 'settings-publish' | 'settings-ai' | 'settings-image' | 'publish' | 'shortcuts' | 'about'>(null)
  const [update, setUpdate] = useState<UpdateState>({ checking: false })
  const agent = useAgentState()
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('files')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  const editorRef = useRef<EditorHandle>(null)
  const saveTimer = useRef<number>(undefined)
  const latest = useRef({ doc, markdown, saveState })
  latest.current = { doc, markdown, saveState }

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch, wechat: { ...s.wechat, ...(patch.wechat || {}) } } : s))
    const next = await api.settings.set(patch)
    setSettings(next)
  }, [])

  // ---------- 外观 ----------
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const dark = settings?.appearance === 'dark' || (settings?.appearance !== 'light' && systemDark)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    api.window.setDark(dark)
  }, [dark])

  // ---------- 文件 ----------
  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current)
    const { doc: d, markdown: md, saveState: st } = latest.current
    if (!d || st === 'saved') return
    setSaveState('saving')
    try {
      await api.fs.write(d.path, md)
      api.ai.markSaved(d.path, md)
      if (latest.current.markdown === md) setSaveState('saved')
    } catch (err) {
      setSaveState('unsaved')
      toast(`保存失败：${(err as Error).message}`, 'error')
    }
  }, [])

  const loadDoc = useCallback(
    async (path: string, isScratch = false) => {
      await flushSave()
      let content = await api.fs.read(path)
      if (isScratch && !content.trim()) content = WELCOME_MD
      setDoc((prev) => ({ path, isScratch, initial: content, version: (prev?.version || 0) + 1 }))
      setMarkdown(content)
      api.ai.markSaved(path, content)
      setSaveState('saved')
      setSourceMode(false)
      if (docWindow) api.window.docMoved(path)
      else if (!isScratch) api.settings.set({ lastFile: path })
      else api.settings.set({ lastFile: undefined })
    },
    [flushSave]
  )

  const openScratch = useCallback(async () => loadDoc(await api.fs.scratchPath(), true), [loadDoc])

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

  const openFolder = useCallback(async () => {
    const dir = await api.fs.openFolder()
    if (dir) await openWorkspace(dir)
  }, [openWorkspace])

  const closeWorkspace = useCallback(async () => {
    await updateSettings({ lastWorkspace: undefined })
    setTree([])
  }, [updateSettings])

  /** 笔记库中的文件在主窗口打开，其余单独开一个窗口（由 Go 端判断） */
  const openFileDialog = useCallback(async () => {
    const p = await api.fs.openFile()
    if (p && p !== latest.current.doc?.path) await api.app.openDocument(p)
  }, [])

  useEffect(() => {
    ;(async () => {
      const s = await api.settings.get()
      setSettings(s)
      if (docWindow) {
        setSidebarTab('outline')
        try {
          await loadDoc(docWindow)
        } catch (err) {
          toast(`无法打开文件：${(err as Error).message}`, 'error')
        }
        return
      }
      if (s.lastWorkspace) refreshTree(s.lastWorkspace)
      try {
        // 从桌面等外部打开时优先显示该文件
        const external = await api.app.takeOpenPath()
        if (external) return await loadDoc(external)
        if (s.lastFile && s.startupOpen !== 'scratch') return await loadDoc(s.lastFile)
      } catch {
        /* 上次的文件已不存在 */
      }
      await openScratch()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onEditorChange = useCallback(
    (md: string) => {
      setMarkdown(md)
      setSaveState('unsaved')
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flushSave, 800)
    },
    [flushSave]
  )

  useEffect(() => api.settings.onChange(setSettings), [])

  // 文档窗口关闭前先写盘
  useEffect(
    () =>
      api.window.onCloseRequest(async () => {
        await flushSave()
        api.window.confirmClose()
      }),
    [flushSave]
  )

  // 窗口关闭或刷新前写盘
  useEffect(() => {
    const onUnload = () => {
      const { doc: d, markdown: md, saveState: st } = latest.current
      if (d && st !== 'saved') api.fs.write(d.path, md)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const saveAs = useCallback(async () => {
    const md = editorRef.current?.getMarkdown() ?? latest.current.markdown
    const name = `${(extractTitle(md) || '未命名').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60)}.md`
    const target = await api.fs.saveAs(md, name)
    if (!target) return
    if (latest.current.doc?.isScratch) await api.fs.write(latest.current.doc.path, '')
    setSaveState('saved')
    await loadDoc(target)
    refreshTree()
    toast('已保存', 'success')
  }, [loadDoc, refreshTree])

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
        await loadDoc(target)
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
      try {
        if (latest.current.doc?.path === path) await flushSave()
        const next = await api.fs.rename(path, name)
        const cur = latest.current.doc
        if (cur && (cur.path === path || cur.path.startsWith(path + '/') || cur.path.startsWith(path + '\\'))) {
          const moved = next + cur.path.slice(path.length)
          setDoc({ ...cur, path: moved })
          api.settings.set({ lastFile: moved })
        }
        refreshTree()
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [flushSave, refreshTree]
  )

  const deleteEntry = useCallback(
    async (path: string) => {
      if (!confirm(`确定将「${basename(path)}」移到废纸篓吗？`)) return
      const cur = latest.current.doc
      if (cur && cur.path.startsWith(path)) {
        window.clearTimeout(saveTimer.current)
        setSaveState('saved')
        latest.current.saveState = 'saved'
      }
      await api.fs.remove(path)
      if (cur && cur.path.startsWith(path)) await openScratch()
      refreshTree()
    },
    [openScratch, refreshTree]
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

  useEffect(() => api.ai.onEvent(docWindow ? handleChannelEvent : handleAgentEvent), [])

  // 让 Agent 读取到编辑器中的实时内容（包括尚未保存的修改）
  useEffect(() => {
    if (doc && !docWindow) api.ai.setActiveDoc(doc.path, markdown)
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

  const checkUpdate = useCallback(async () => {
    setUpdate((u) => ({ ...u, checking: true }))
    const result = await api.app.checkUpdate()
    setUpdate({ checking: false, result })
  }, [])
  // 启动后静默检查一次更新，有新版本时在左下角提示
  const autoCheckUpdate = settings?.autoCheckUpdate
  useEffect(() => {
    if (!autoCheckUpdate) return
    const timer = window.setTimeout(checkUpdate, 5000)
    return () => window.clearTimeout(timer)
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
    'open-file': openFileDialog,
    'open-folder': openFolder,
    save,
    'save-as': saveAs,
    'export-html': exportHtml,
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
      api.onMenu((action) => {
        if (docWindow && MAIN_ONLY_ACTIONS.includes(action)) api.window.runInMain(action)
        else handlers.current[action]?.()
      }),
    []
  )
  useEffect(() => api.onOpenPath((p) => loadDoc(p)), [loadDoc])
  useEffect(() => api.onOpenWorkspace((dir) => openWorkspace(dir)), [openWorkspace])

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

  const title = doc.isScratch ? '未命名草稿' : basename(doc.path).replace(/\.(md|markdown|txt)$/i, '')
  const showSidebar = settings.showSidebar && !focusMode
  const showAgent = settings.showAgent && !focusMode && !docWindow
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
      <header className="titlebar">
        <div className="titlebar-left">
          {customControls === 'traffic-left' && <WindowControls variant="traffic" />}
          <button
            className={`icon-btn${showSidebar ? ' on' : ''}`}
            title="侧边栏 ⌘\"
            onClick={() => handlers.current['toggle-sidebar']()}
          >
            <PanelLeft size={17} />
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
            docWindow={!!docWindow}
            workspace={settings.lastWorkspace}
            recentWorkspaces={settings.recentWorkspaces}
            tree={tree}
            activePath={doc.path}
            isScratch={doc.isScratch}
            headings={headings}
            onOpenFolder={openFolder}
            onOpenWorkspace={openWorkspace}
            onCloseWorkspace={closeWorkspace}
            onOpenFile={(p) => p !== doc.path && loadDoc(p)}
            onRefresh={() => refreshTree()}
            onCreate={createEntry}
            onRename={renameEntry}
            onDelete={deleteEntry}
            onReveal={(p) => api.fs.reveal(p)}
            onHeadingClick={(i) => editorRef.current?.scrollToHeading(i)}
            onSettings={() => setDialog('settings')}
            onShortcuts={() => setDialog('shortcuts')}
            onAbout={() => setDialog('about')}
            onUpdate={openUpdate}
            hasUpdate={!!(update.result?.ok && update.result.hasUpdate)}
          />
        )}

        <main className={`editor-pane width-${settings.editorWidth}${proposal ? ' reviewing' : ''}${editorThemeKey && !sourceMode ? ' mk-themed' : ''}`}>
          {proposal && (
            <DiffReview
              key={proposal.requestId}
              proposal={proposal}
              isActiveDoc={isActive(proposal)}
              queued={agent.proposals.length - 1}
              onResolve={(accepted, content, result) => resolveWrite(proposal, accepted, content, result)}
            />
          )}
          <Editor
            key={doc.version}
            ref={editorRef}
            docPath={doc.path}
            initialMarkdown={doc.initial}
            sourceMode={sourceMode}
            typewriter={settings.typewriter}
            showToolbar={settings.showToolbar}
            imageGen={settings.imageGen}
            onOpenImageSettings={() => setDialog('settings-image')}
            onChange={onEditorChange}
            onHeadings={setHeadings}
            hideFrontMatter={!!editorThemeKey}
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
              {doc.isScratch ? '草稿自动保存在应用数据目录 · ⌘S 另存为' : { saved: '已保存', saving: '保存中…', unsaved: '编辑中' }[saveState]}
            </span>
            <PublishActions onCopy={copyToWechat} onPublish={openPublish} />
            {!docWindow && (
              <>
                <span className="status-sep" />
                <button
                  className={`icon-btn sm has-dot${showAgent ? ' on active' : ''}`}
                  title="AI 助手 ⌘J"
                  onClick={() => handlers.current['toggle-ai']()}
                >
                  <Sparkles size={15} />
                  {agent.running && <span className="tab-dot" />}
                </button>
              </>
            )}
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
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog update={update} onCheck={checkUpdate} onClose={() => setDialog(null)} />}
      <Toasts />
    </div>
  )
}

