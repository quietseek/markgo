import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  CircleArrowUp,
  Info,
  Keyboard,
  RefreshCw,
  Settings
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import type { HeadingInfo } from './Editor'
import { basename, dirname, isInside } from '../lib/assets'

export type SidebarTab = 'files' | 'outline'

interface Props {
  tab: SidebarTab
  onTab(tab: SidebarTab): void
  /** 单独打开文档的窗口：不显示文件列表 */
  docWindow: boolean
  workspace?: string
  recentWorkspaces: string[]
  tree: FileNode[]
  activePath?: string
  /** 当前打开的是未命名草稿 */
  isScratch: boolean
  headings: HeadingInfo[]
  onOpenFolder(): void
  onOpenWorkspace(dir: string): void
  onCloseWorkspace(): void
  onOpenFile(path: string): void
  onRefresh(): void
  onCreate(dir: string, kind: 'file' | 'dir'): void
  onRename(path: string, name: string): void
  onDelete(path: string): void
  onReveal(path: string): void
  onHeadingClick(index: number): void
  onSettings(): void
  onShortcuts(): void
  onAbout(): void
  onUpdate(): void
  /** 检测到新版本时在更新按钮上显示提示点 */
  hasUpdate: boolean
}

type Menu = { x: number; y: number; node: FileNode | null }

export function Sidebar(props: Props) {
  const tab = props.docWindow && props.tab === 'files' ? 'outline' : props.tab
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<Menu | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [wsMenu, setWsMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu && !wsMenu) return
    const close = () => {
      setMenu(null)
      setWsMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu, wsMenu])

  // 打开文件时自动展开其所在目录
  useEffect(() => {
    if (!props.activePath || !props.workspace) return
    setExpanded((prev) => {
      const next = new Set(prev)
      let dir = props.activePath!
      while (dir.length > props.workspace!.length) {
        dir = dir.slice(0, Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\')))
        next.add(dir)
      }
      return next
    })
  }, [props.activePath, props.workspace])

  const toggle = (p: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  const renderNodes = (nodes: FileNode[], depth: number) =>
    nodes.map((node) => {
      const isOpen = expanded.has(node.path)
      const isActive = node.path === props.activePath
      return (
        <div key={node.path}>
          <div
            className={`tree-row${isActive ? ' active' : ''}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => (node.type === 'dir' ? toggle(node.path) : props.onOpenFile(node.path))}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, node })
            }}
            title={node.path}
          >
            {node.type === 'dir' ? (
              <>
                <ChevronRight size={13} className={`tree-chevron${isOpen ? ' open' : ''}`} />
                {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
              </>
            ) : (
              <>
                <span className="tree-chevron-space" />
                <FileText size={15} />
              </>
            )}
            {renaming === node.path ? (
              <input
                className="tree-rename"
                autoFocus
                defaultValue={node.type === 'file' ? node.name.replace(/\.(md|markdown|txt)$/i, '') : node.name}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  setRenaming(null)
                  if (e.target.value.trim() && e.target.value !== node.name) props.onRename(node.path, e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className="tree-name">{node.type === 'file' ? node.name.replace(/\.(md|markdown)$/i, '') : node.name}</span>
            )}
          </div>
          {node.type === 'dir' && isOpen && node.children && renderNodes(node.children, depth + 1)}
        </div>
      )
    })

  const minLevel = Math.min(...props.headings.map((h) => h.level), 6)
  const otherRecent = props.recentWorkspaces.filter((d) => d !== props.workspace)
  // 从桌面 / 访达等外部打开、不在当前笔记库里的文件
  const outside = !props.isScratch && props.activePath && (!props.workspace || !isInside(props.activePath, props.workspace)) ? props.activePath : null
  const outsideCard = outside && (
    <div className="outside-file">
      <div className="outside-file-name" title={outside}>
        <FileText size={14} />
        <span>{basename(outside)}</span>
      </div>
      <p>
        {props.workspace ? '这个文件不在当前笔记库中' : '单独打开的文件'}，修改会自动保存到原位置：
        <span className="outside-file-path" title={dirname(outside)}>
          {dirname(outside)}
        </span>
      </p>
      <div className="row">
        <button className="btn sm" onClick={() => props.onOpenWorkspace(dirname(outside))}>
          <FolderOpen size={13} /> 打开所在文件夹
        </button>
        <button className="btn sm ghost" onClick={() => props.onReveal(outside)}>
          在文件管理器中显示
        </button>
      </div>
    </div>
  )
  const recentList = (dirs: string[], onPick: (dir: string) => void) =>
    dirs.map((dir) => (
      <button key={dir} className="recent-item" title={dir} onClick={() => onPick(dir)}>
        <Folder size={14} />
        <span className="recent-name">{basename(dir)}</span>
        <span className="recent-path">{dirname(dir)}</span>
      </button>
    ))

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        {(
          [
            ['files', '文件'],
            ['outline', '大纲']
          ] as const
        )
          .filter(([key]) => !props.docWindow || key !== 'files')
          .map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => props.onTab(key)}>
              {label}
            </button>
          ))}
      </div>

      {tab === 'files' ? (
        props.workspace ? (
          <>
            <div className="sidebar-head">
              <button
                className="workspace-name"
                title={`${props.workspace}\n点击切换文件夹`}
                onClick={(e) => {
                  e.stopPropagation()
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu(null)
                  setWsMenu(wsMenu ? null : { x: r.left, y: r.bottom + 4 })
                }}
              >
                <span>{basename(props.workspace)}</span>
                <ChevronDown size={12} />
              </button>
              <button className="icon-btn sm" title="新建笔记" onClick={() => props.onCreate(props.workspace!, 'file')}>
                <FilePlus2 size={15} />
              </button>
              <button className="icon-btn sm" title="新建文件夹" onClick={() => props.onCreate(props.workspace!, 'dir')}>
                <FolderPlus size={15} />
              </button>
              <button className="icon-btn sm" title="刷新" onClick={props.onRefresh}>
                <RefreshCw size={14} />
              </button>
            </div>
            {outsideCard}
            <div
              className="tree"
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, node: null })
              }}
            >
              {props.tree.length ? renderNodes(props.tree, 0) : <div className="sidebar-empty">文件夹中还没有 Markdown 笔记</div>}
            </div>
          </>
        ) : (
          <div className="sidebar-welcome">
            {outsideCard}
            <p>打开一个文件夹作为笔记库，所有笔记都以 .md 文件保存在本地。</p>
            <button className="btn primary" onClick={props.onOpenFolder}>
              <FolderOpen size={15} /> 打开文件夹
            </button>
            {props.recentWorkspaces.length > 0 && (
              <>
                <h5 className="recent-title">最近的文件夹</h5>
                <div className="recent-list">{recentList(props.recentWorkspaces, props.onOpenWorkspace)}</div>
              </>
            )}
          </div>
        )
      ) : (
        <div className="outline">
          {props.headings.length ? (
            props.headings.map((h, i) => (
              <div
                key={i}
                className="outline-item"
                style={{ paddingLeft: 12 + (h.level - minLevel) * 14 }}
                onClick={() => props.onHeadingClick(i)}
              >
                {h.text || '（空标题）'}
              </div>
            ))
          ) : (
            <div className="sidebar-empty">文档中还没有标题</div>
          )}
        </div>
      )}

      <div className="sidebar-foot">
        <button className="icon-btn sm" title="设置" onClick={props.onSettings}>
          <Settings size={15} />
        </button>
        <button className="icon-btn sm" title="键盘快捷键" onClick={props.onShortcuts}>
          <Keyboard size={15} />
        </button>
        <button className="icon-btn sm" title="关于 MarkGo" onClick={props.onAbout}>
          <Info size={15} />
        </button>
        <span className="grow" />
        <button
          className={`icon-btn sm has-dot${props.hasUpdate ? ' on' : ''}`}
          title={props.hasUpdate ? '发现新版本' : '检查更新'}
          onClick={props.onUpdate}
        >
          <CircleArrowUp size={15} />
          {props.hasUpdate && <span className="tab-dot" />}
        </button>
      </div>

      {wsMenu && (
        <div className="context-menu workspace-menu" style={{ top: wsMenu.y, left: wsMenu.x }} onClick={(e) => e.stopPropagation()}>
          {otherRecent.length > 0 && (
            <>
              <div className="menu-title">最近的文件夹</div>
              {recentList(otherRecent, (dir) => {
                setWsMenu(null)
                props.onOpenWorkspace(dir)
              })}
              <div className="menu-sep" />
            </>
          )}
          <button
            onClick={() => {
              setWsMenu(null)
              props.onOpenFolder()
            }}
          >
            打开其他文件夹…
          </button>
          <button
            onClick={() => {
              setWsMenu(null)
              props.onReveal(props.workspace!)
            }}
          >
            在文件管理器中显示
          </button>
          <div className="menu-sep" />
          <button
            onClick={() => {
              setWsMenu(null)
              props.onCloseWorkspace()
            }}
          >
            关闭文件夹
          </button>
        </div>
      )}

      {menu && (
        <div className="context-menu" style={{ top: menu.y, left: menu.x }}>
          {(!menu.node || menu.node.type === 'dir') && (
            <>
              <button onClick={() => props.onCreate(menu.node?.path || props.workspace!, 'file')}>新建笔记</button>
              <button onClick={() => props.onCreate(menu.node?.path || props.workspace!, 'dir')}>新建文件夹</button>
            </>
          )}
          {menu.node && (
            <>
              <button onClick={() => setRenaming(menu.node!.path)}>重命名</button>
              <button onClick={() => props.onReveal(menu.node!.path)}>在文件管理器中显示</button>
              <div className="menu-sep" />
              <button className="danger" onClick={() => props.onDelete(menu.node!.path)}>
                移到废纸篓
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
