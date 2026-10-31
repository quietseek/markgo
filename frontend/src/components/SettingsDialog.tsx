import { useEffect, useRef, useState } from 'react'
import { Blocks, ChevronDown, FileText, Image, PenLine, Plus, Send, Settings2, Trash2 } from 'lucide-react'
import { AGENT_PRESETS, IMAGE_GEN_PROVIDERS, TRAY_MENU_ITEMS, WRITING_LENGTHS, WRITING_STYLE_PRESETS, type AgentProfile, type AppSettings, type TyporaThemeInfo } from '@shared/types'
import { Modal } from './Modal'
import { toast } from '../lib/toast'
import { EDITOR_WIDTHS } from './EditorWidthSwitch'
import { useAgentState } from '../lib/agent-store'

const isMac = window.markgo.platform === 'darwin'

interface Props {
  settings: AppSettings
  initialTab?: Tab
  onSave(patch: Partial<AppSettings>): Promise<void>
  onClose(): void
}

type Tab = 'general' | 'editor' | 'image' | 'writing' | 'ai' | 'publish'

const TABS: { key: Tab; label: string; Icon: typeof Settings2 }[] = [
  { key: 'general', label: '通用设置', Icon: Settings2 },
  { key: 'editor', label: '编辑器', Icon: FileText },
  { key: 'image', label: '图片处理', Icon: Image },
  { key: 'writing', label: '写作偏好', Icon: PenLine },
  { key: 'ai', label: 'AI 集成', Icon: Blocks },
  { key: 'publish', label: '发布渠道', Icon: Send }
]

/** 原生样式的排版选项：值以字符串作为分段按钮的键 */
const FONT_SIZES = ['14', '15', '16', '17', '18', '20'] as const
const LINE_HEIGHTS = [
  ['1.5', '紧凑'],
  ['1.75', '标准'],
  ['2', '宽松']
] as const
const PARA_SPACINGS = [
  ['0.5', '紧凑'],
  ['0.85', '标准'],
  ['1.3', '宽松']
] as const

const AGENT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Anthropic 的编程 Agent',
  codex: 'OpenAI 的编程 Agent',
  gemini: 'Google 的命令行 Agent',
  opencode: '开源的终端编程 Agent',
  qwen: '通义千问编程 Agent',
  copilot: 'GitHub 的编程 Agent',
  goose: 'Block 开源的本地 Agent'
}

export function SettingsDialog({ settings, initialTab = 'general', onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [busy, setBusy] = useState<string | null>(null)
  const set = (patch: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...patch }))
  const setWx = (patch: Partial<AppSettings['wechat']>) => setDraft((d) => ({ ...d, wechat: { ...d.wechat, ...patch } }))
  const setGen = (patch: Partial<AppSettings['imageGen']>) => setDraft((d) => ({ ...d, imageGen: { ...d.imageGen, ...patch } }))

  // 修改即时生效：只提交变化的字段；文本输入稍作合并，关闭时立即写入
  const saved = useRef(settings)
  const latest = useRef(draft)
  latest.current = draft
  const flush = () => {
    const patch: Partial<AppSettings> = {}
    for (const key of Object.keys(latest.current) as (keyof AppSettings)[])
      if (JSON.stringify(latest.current[key]) !== JSON.stringify(saved.current[key])) Object.assign(patch, { [key]: latest.current[key] })
    if (!Object.keys(patch).length) return Promise.resolve()
    saved.current = latest.current
    return onSave(patch)
  }
  useEffect(() => {
    const timer = window.setTimeout(flush, 300)
    return () => window.clearTimeout(timer)
  }, [draft])
  useEffect(() => () => void flush(), [])
  // 需要立即生效的修改（如切换 Agent 后马上连接）：不等重新渲染，直接写入
  const commit = (patch: Partial<AppSettings>) => {
    latest.current = { ...latest.current, ...patch }
    setDraft(latest.current)
    return flush()
  }

  const testPicgo = async () => {
    setBusy('picgo')
    await flush()
    const res = await window.markgo.image.testPicgo()
    setBusy(null)
    if (res.ok) toast(`PicGo 连接成功：${res.urls[0]}`, 'success', 4000)
    else toast(res.error || 'PicGo 连接失败', 'error')
  }

  const testWechat = async () => {
    setBusy('wechat')
    await flush()
    const res = await window.markgo.wechat.testConnection()
    setBusy(null)
    if (res.ok) toast('公众号接口连接成功', 'success')
    else toast(res.error || '连接失败', 'error', 9000)
  }

  return (
    <Modal title="设置" onClose={onClose} width={720}>
      <div className="settings">
        <nav className="settings-nav">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'general' && (
            <>
              <Group title="外观">
                <Row label="主题" desc="界面的浅色 / 深色外观；跟随系统时按系统外观选用下方的主题">
                  <Segmented
                    value={draft.appearance}
                    options={[
                      ['system', '跟随系统'],
                      ['light', '浅色'],
                      ['dark', '深色']
                    ]}
                    onChange={(appearance) => set({ appearance })}
                  />
                </Row>
                <TyporaThemes draft={draft} set={set} />
              </Group>
              <Group title="窗口">
                <Row label="关闭窗口时">
                  <Segmented
                    value={draft.closeAction}
                    options={[
                      ['quit', '退出应用'],
                      ['background', isMac ? '保留在程序坞' : '最小化到托盘']
                    ]}
                    onChange={(closeAction) => set({ closeAction })}
                  />
                </Row>
                <Row label="窗口按钮" desc="标题栏的最小化 / 最大化 / 关闭按钮样式">
                  <Segmented
                    value={draft.windowControls}
                    options={[
                      ['classic', '经典'],
                      ['traffic', '红绿灯']
                    ]}
                    onChange={(windowControls) => set({ windowControls })}
                  />
                </Row>
                {draft.windowControls === 'traffic' && (
                  <Row label="红绿灯位置">
                    <Segmented
                      value={draft.trafficPosition}
                      options={[
                        ['left', '左侧'],
                        ['right', '右侧']
                      ]}
                      onChange={(trafficPosition) => set({ trafficPosition })}
                    />
                  </Row>
                )}
              </Group>
              {(isMac || draft.closeAction === 'background') && (
                <Group title={isMac ? '程序坞菜单' : '托盘菜单'}>
                  <Row
                    label="菜单项目"
                    desc={isMac ? '右键点击程序坞图标时显示的快捷操作' : '右键点击托盘图标时显示的项目；「退出」始终显示'}
                    stack
                  >
                    <div className="check-chips">
                      {TRAY_MENU_ITEMS.filter((item) => item.key !== 'quit' && (!isMac || item.mac)).map(({ key, label }) => {
                        const on = draft.trayMenu.includes(key)
                        return (
                          <button
                            key={key}
                            className={`check-chip${on ? ' on' : ''}`}
                            aria-pressed={on}
                            onClick={() => set({ trayMenu: on ? draft.trayMenu.filter((k) => k !== key) : [...draft.trayMenu, key] })}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </Row>
                </Group>
              )}
              <Group title="更新">
                <Row label="自动检查更新" desc="启动后在后台检查，有新版本时在左下角提示">
                  <Switch checked={draft.autoCheckUpdate} onChange={(autoCheckUpdate) => set({ autoCheckUpdate })} />
                </Row>
              </Group>
            </>
          )}

          {tab === 'editor' && (
            <>
              <Group title="编辑">
                <Row label="编辑区宽度">
                  <Segmented
                    value={draft.editorWidth}
                    options={EDITOR_WIDTHS.map((w) => [w.key, w.label] as const)}
                    onChange={(editorWidth) => set({ editorWidth })}
                  />
                </Row>
                <Row label="顶部操作栏" desc="在编辑区顶部显示标题、格式、列表、插入等常用按钮">
                  <Switch checked={draft.showToolbar} onChange={(showToolbar) => set({ showToolbar })} />
                </Row>
                <Row label="打字机模式" desc="光标所在行始终保持在编辑区中部">
                  <Switch checked={draft.typewriter} onChange={(typewriter) => set({ typewriter })} />
                </Row>
              </Group>
              <Group title="原生样式">
                <Row label="字体" desc="编辑区选择「原生样式」时的正文排版；套用排版主题或 Typora 主题时由主题决定">
                  <Segmented
                    value={draft.editorFont}
                    options={[
                      ['sans', '黑体'],
                      ['serif', '宋体']
                    ]}
                    onChange={(editorFont) => set({ editorFont })}
                  />
                </Row>
                <Row label="字号">
                  <Segmented
                    value={String(draft.editorFontSize)}
                    options={FONT_SIZES.map((v) => [v, v] as const)}
                    onChange={(v) => set({ editorFontSize: Number(v) })}
                  />
                </Row>
                <Row label="行距">
                  <Segmented value={String(draft.editorLineHeight)} options={LINE_HEIGHTS} onChange={(v) => set({ editorLineHeight: Number(v) })} />
                </Row>
                <Row label="段落间距">
                  <Segmented value={String(draft.editorParaSpacing)} options={PARA_SPACINGS} onChange={(v) => set({ editorParaSpacing: Number(v) })} />
                </Row>
              </Group>
              <Group title="文件">
                <Row label="启动时打开">
                  <Segmented
                    value={draft.startupOpen}
                    options={[
                      ['last', '上次的文件'],
                      ['scratch', '草稿']
                    ]}
                    onChange={(startupOpen) => set({ startupOpen })}
                  />
                </Row>
                <Row label="显示隐藏文件" desc="在文件树中显示以 . 开头的文件和文件夹">
                  <Switch checked={draft.showHiddenFiles} onChange={(showHiddenFiles) => set({ showHiddenFiles })} />
                </Row>
              </Group>
            </>
          )}

          {tab === 'image' && (
            <>
              <Group title="图床">
                <Row label="图片存放方式">
                  <Segmented
                    value={draft.imageUploadMode}
                    options={[
                      ['picgo', 'PicGo 图床'],
                      ['local', '本地目录']
                    ]}
                    onChange={(imageUploadMode) => set({ imageUploadMode })}
                  />
                </Row>
                {draft.imageUploadMode === 'picgo' ? (
                  <Row label="PicGo Server" desc="需在 PicGo / PicList 中开启 Server" stack>
                    <div className="row">
                      <input value={draft.picgoServer} onChange={(e) => set({ picgoServer: e.target.value })} placeholder="http://127.0.0.1:36677" />
                      <button className="btn" disabled={busy === 'picgo'} onClick={testPicgo}>
                        {busy === 'picgo' ? '测试中…' : '测试上传'}
                      </button>
                    </div>
                  </Row>
                ) : (
                  <Row label="图片目录" desc="相对于文档所在目录">
                    <input className="set-input" value={draft.localAssetsDir} onChange={(e) => set({ localAssetsDir: e.target.value })} placeholder="assets" />
                  </Row>
                )}
              </Group>
              <ImageGenSettings gen={draft.imageGen} onChange={setGen} />
            </>
          )}

          {tab === 'writing' && <WritingSettings writing={draft.writing} onChange={(patch) => set({ writing: { ...draft.writing, ...patch } })} />}

          {tab === 'ai' && <Integrations ai={draft.ai} setAi={(ai) => set({ ai })} commitAi={(ai) => commit({ ai })} />}

          {tab === 'publish' && (
            <>
              <Group title="微信公众号">
                <Row label="AppID">
                  <input className="set-input" value={draft.wechat.appId} onChange={(e) => setWx({ appId: e.target.value.trim() })} placeholder="wx…" />
                </Row>
                <Row label="AppSecret" desc="加密保存在本机">
                  <input
                    className="set-input"
                    type="password"
                    value={draft.wechat.appSecret}
                    onChange={(e) => setWx({ appSecret: e.target.value.trim() })}
                    placeholder="设置与开发 → 基本配置"
                  />
                </Row>
                <Row label="测试连接" desc="需将本机公网 IP 加入公众号后台的 IP 白名单，且账号已认证">
                  <button className="btn" disabled={busy === 'wechat'} onClick={testWechat}>
                    {busy === 'wechat' ? '连接中…' : '测试连接'}
                  </button>
                </Row>
              </Group>
              <Group title="发布默认值">
                <Row label="默认作者">
                  <input className="set-input" value={draft.wechat.author} maxLength={16} onChange={(e) => setWx({ author: e.target.value })} />
                </Row>
                <Row label="打开留言">
                  <Switch checked={draft.wechat.openComment} onChange={(openComment) => setWx({ openComment })} />
                </Row>
                <Row label="仅粉丝可留言">
                  <Switch
                    checked={draft.wechat.onlyFansCanComment}
                    disabled={!draft.wechat.openComment}
                    onChange={(onlyFansCanComment) => setWx({ onlyFansCanComment })}
                  />
                </Row>
                <Row label="外链转为文末脚注" desc="公众号正文不支持外链跳转，转为脚注保留链接地址">
                  <Switch checked={draft.linkToFootnote} onChange={(linkToFootnote) => set({ linkToFootnote })} />
                </Row>
              </Group>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** 浅色 / 深色外观选用的 Typora 主题，以及导入、删除主题 */
function TyporaThemes({ draft, set }: { draft: AppSettings; set(patch: Partial<AppSettings>): void }) {
  const [themes, setThemes] = useState<TyporaThemeInfo[]>([])
  const reload = () => window.markgo.themes.list().then(setThemes)
  useEffect(() => {
    reload()
  }, [])

  const importTheme = async () => {
    try {
      const t = await window.markgo.themes.import()
      if (!t) return
      await reload()
      toast(`已导入 Typora 主题「${t.name}」，可在上方选用`, 'success')
    } catch (err) {
      toast(`导入失败：${(err as Error).message ?? err}`, 'error')
    }
  }
  const remove = async (t: TyporaThemeInfo) => {
    if (!confirm(`删除 Typora 主题「${t.name}」？`)) return
    await window.markgo.themes.remove(t.id)
    const patch: Partial<AppSettings> = {}
    if (draft.lightTheme === t.id) patch.lightTheme = ''
    if (draft.darkTheme === t.id) patch.darkTheme = ''
    if (Object.keys(patch).length) set(patch)
    reload()
  }
  const picker = (value: string, builtin: string, onChange: (v: string) => void) => (
    <select className="select" value={themes.some((t) => t.id === value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{builtin}</option>
      {themes.map((t) => (
        <option key={t.id} value={t.id}>
          Typora · {t.name}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <Row label="浅色主题">{picker(draft.lightTheme, '内置浅色', (lightTheme) => set({ lightTheme }))}</Row>
      <Row label="深色主题">{picker(draft.darkTheme, '内置深色', (darkTheme) => set({ darkTheme }))}</Row>
      <Row label="Typora 主题" desc="导入 Typora 的 .css 主题文件（连同旁边的同名资源文件夹），用于界面配色与原生样式的编辑区">
        <button className="btn" onClick={importTheme}>
          <Plus size={14} /> 导入主题…
        </button>
      </Row>
      {themes.length > 0 && (
        <div className="typora-theme-list">
          {themes.map((t) => (
            <div key={t.id} className="typora-theme-item">
              <span>{t.name}</span>
              {(draft.lightTheme === t.id || draft.darkTheme === t.id) && (
                <small>{[draft.lightTheme === t.id && '浅色', draft.darkTheme === t.id && '深色'].filter(Boolean).join(' / ')}使用中</small>
              )}
              <button className="icon-btn sm" title="删除主题" onClick={() => remove(t)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="set-group">
      <h4 className="settings-section">{title}</h4>
      <div className="set-card">{children}</div>
    </section>
  )
}

function Row({ label, desc, stack, children }: { label: string; desc?: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <div className={`set-row${stack ? ' stack' : ''}`}>
      <div className="set-label">
        <b>{label}</b>
        {desc && <small>{desc}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange(v: T): void }) {
  return (
    <div className="segmented">
      {options.map(([key, label]) => (
        <button key={key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange(v: boolean): void }) {
  return (
    <button role="switch" aria-checked={checked} className={`switch${checked ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!checked)} />
  )
}

function ImageGenSettings({ gen, onChange }: { gen: AppSettings['imageGen']; onChange(patch: Partial<AppSettings['imageGen']>): void }) {
  const provider = IMAGE_GEN_PROVIDERS.find((p) => p.id === gen.provider) || IMAGE_GEN_PROVIDERS[IMAGE_GEN_PROVIDERS.length - 1]
  // 切换供应商时清空自定义地址，模型换成该供应商的首选
  const pickProvider = (id: string) => {
    const next = IMAGE_GEN_PROVIDERS.find((p) => p.id === id)!
    onChange({ provider: id, baseUrl: '', model: next.models[0] || '' })
  }

  return (
    <Group title="AI 生图">
      <Row label="供应商">
        <select className="select" value={provider.id} onChange={(e) => pickProvider(e.target.value)}>
          {IMAGE_GEN_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="接口地址" desc={provider.baseUrl ? '留空使用供应商默认地址' : 'OpenAI 兼容的 /images/generations 接口'}>
        <input
          className="set-input"
          value={gen.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value.trim() })}
          placeholder={provider.baseUrl || 'https://…/v1'}
        />
      </Row>
      <Row label="API Key" desc="加密保存在本机">
        <input className="set-input" type="password" value={gen.apiKey} onChange={(e) => onChange({ apiKey: e.target.value.trim() })} placeholder="sk-…" />
      </Row>
      <Row label="模型" desc="可从列表选择，也可直接填写模型名">
        <input
          className="set-input"
          list="image-gen-models"
          value={gen.model}
          onChange={(e) => onChange({ model: e.target.value.trim() })}
          placeholder={provider.models[0] || '模型名称'}
        />
        <datalist id="image-gen-models">
          {provider.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Row>
      <Row label="超时时间" desc="单次生成最长等待时间，高清或排队较久的模型可适当调大">
        <input
          className="set-input narrow"
          type="number"
          min={10}
          max={1800}
          step={10}
          value={gen.timeout}
          onChange={(e) => onChange({ timeout: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          onBlur={() => gen.timeout < 10 && onChange({ timeout: 10 })}
        />
        <span className="set-unit">秒</span>
      </Row>
    </Group>
  )
}

function Integrations({
  ai,
  setAi,
  commitAi
}: {
  ai: AppSettings['ai']
  setAi(ai: AppSettings['ai']): void
  commitAi(ai: AppSettings['ai']): Promise<void>
}) {
  const agent = useAgentState()
  const [open, setOpen] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const latest = useRef(ai)
  latest.current = ai
  const commit = (next: AppSettings['ai']) => {
    latest.current = next
    return commitAi(next)
  }
  const patchAgent = (id: string, patch: Partial<AgentProfile>, extra: Partial<AppSettings['ai']> = {}) =>
    setAi({ ...latest.current, ...extra, agents: latest.current.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })

  // 当前 Agent 连接成功即视为已安装（例如直接在 AI 面板中使用过）
  const active = ai.agents.find((a) => a.id === ai.activeAgentId)
  useEffect(() => {
    if (agent.status === 'ready' && active && !active.installed) patchAgent(active.id, { installed: true })
  }, [agent.status, active?.id])

  // 安装 = 切换为当前 Agent 并完成一次连接（npx 预置命令会在此时下载）
  const connect = async (a: AgentProfile) => {
    const prev = latest.current.activeAgentId
    setInstalling(a.id)
    await commit({ ...latest.current, activeAgentId: a.id })
    await window.markgo.ai.stop()
    const res = await window.markgo.ai.start()
    setInstalling(null)
    if (res.ok) {
      patchAgent(a.id, { installed: true })
      toast(`已连接 ${res.info!.name}${res.info!.version ? ` ${res.info!.version}` : ''}`, 'success', 4000)
    } else {
      if (!a.installed) {
        await window.markgo.ai.stop()
        await commit({ ...latest.current, activeAgentId: prev })
      }
      toast(res.error || '连接失败', 'error', 12000)
    }
  }

  const uninstall = async (a: AgentProfile) => {
    const custom = !AGENT_PRESETS.some((p) => p.id === a.id)
    const agents = custom ? ai.agents.filter((x) => x.id !== a.id) : ai.agents.map((x) => (x.id === a.id ? { ...x, installed: false } : x))
    const next = a.id === ai.activeAgentId ? agents.find((x) => x.installed)?.id || agents[0]?.id || '' : ai.activeAgentId
    if (a.id === ai.activeAgentId) await window.markgo.ai.stop()
    await commit({ agents, activeAgentId: next })
    setOpen(null)
  }

  const addAgent = () => {
    const id = `custom-${Date.now().toString(36)}`
    setAi({ ...ai, agents: [...ai.agents, { id, name: '自定义 Agent', command: '' }] })
    setOpen(id)
  }

  const badge = (a: AgentProfile) => {
    if (installing === a.id) return <span className="int-badge busy">{a.installed ? '连接中' : '安装中'}</span>
    if (a.id === ai.activeAgentId) {
      if (agent.status === 'ready') return <span className="int-badge ok">已连接</span>
      if (agent.status === 'starting') return <span className="int-badge busy">连接中</span>
      if (agent.status === 'error' && a.installed) return <span className="int-badge err">连接失败</span>
      if (a.installed) return <span className="int-badge">当前使用</span>
    }
    return a.installed ? <span className="int-badge">已安装</span> : null
  }

  return (
    <>
      <h4 className="settings-section">ACP Agent</h4>
      <div className="int-list">
        {ai.agents.map((a) => {
          const preset = AGENT_PRESETS.find((p) => p.id === a.id)
          const expanded = open === a.id
          const isActive = a.id === ai.activeAgentId && a.installed
          return (
            <div key={a.id} className={`int-card${expanded ? ' open' : ''}`}>
              <div className="int-row">
                <span className="int-avatar">{(a.name.trim()[0] || '?').toUpperCase()}</span>
                <div className="int-main">
                  <div className="int-name">
                    {a.name}
                    {badge(a)}
                  </div>
                  <div className="int-desc">{preset ? AGENT_DESCRIPTIONS[a.id] : a.command || '尚未填写启动命令'}</div>
                </div>
                {!a.installed ? (
                  <button className="btn" disabled={!!installing || !a.command.trim()} onClick={() => connect(a)}>
                    {installing === a.id ? '安装中…' : '安装'}
                  </button>
                ) : isActive ? (
                  <button className="btn ghost" disabled={!!installing} onClick={() => connect(a)}>
                    {installing === a.id ? '连接中…' : '重新连接'}
                  </button>
                ) : (
                  <button className="btn" disabled={!!installing} onClick={() => connect(a)}>
                    {installing === a.id ? '连接中…' : '使用'}
                  </button>
                )}
                <button className="icon-btn int-more" title="配置" onClick={() => setOpen(expanded ? null : a.id)}>
                  <ChevronDown size={15} />
                </button>
              </div>
              {expanded && (
                <div className="int-detail">
                  {!preset && <input value={a.name} placeholder="名称" onChange={(e) => patchAgent(a.id, { name: e.target.value })} />}
                  <textarea
                    className="mono"
                    rows={2}
                    value={a.command}
                    placeholder="ACP 模式的启动命令"
                    onChange={(e) => patchAgent(a.id, { command: e.target.value })}
                  />
                  <div className="row end">
                    {preset && (
                      <button className="btn ghost" disabled={a.command === preset.command} onClick={() => patchAgent(a.id, { command: preset.command })}>
                        恢复默认命令
                      </button>
                    )}
                    {(a.installed || !preset) && (
                      <button className="btn ghost" onClick={() => uninstall(a)}>
                        {preset ? '卸载' : '删除'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <button className="int-add" onClick={addAgent}>
          ＋ 添加自定义 Agent
        </button>
      </div>
      <p className="note">需先在终端完成对应 Agent 的登录；预置 Agent 通过 npx 安装，首次需下载。</p>
    </>
  )
}

function WritingSettings({ writing, onChange }: { writing: AppSettings['writing']; onChange(patch: Partial<AppSettings['writing']>): void }) {
  const [open, setOpen] = useState<string | null>(null)
  const patchStyle = (id: string, patch: { name?: string; description?: string }) =>
    onChange({ styles: writing.styles.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const addStyle = () => {
    const id = `style-${Date.now().toString(36)}`
    onChange({ styles: [...writing.styles, { id, name: '我的风格', description: '' }], defaultStyleId: id })
    setOpen(id)
  }
  const removeStyle = (id: string) => {
    const styles = writing.styles.filter((s) => s.id !== id)
    onChange({ styles, defaultStyleId: writing.defaultStyleId === id ? styles[0]?.id || '' : writing.defaultStyleId })
  }

  return (
    <>
      <h4 className="settings-section">默认风格</h4>
      <div className="style-list">
        {writing.styles.map((s) => {
          const preset = WRITING_STYLE_PRESETS.find((p) => p.id === s.id)
          const expanded = open === s.id
          return (
            <div key={s.id} className={`style-item${s.id === writing.defaultStyleId ? ' active' : ''}`}>
              <div className="style-row" onClick={() => onChange({ defaultStyleId: s.id })}>
                <span className="style-radio" />
                <span className="style-text">
                  <b>{s.name}</b>
                  <small>{s.description || '尚未填写风格描述'}</small>
                </span>
                <button
                  className="icon-btn sm"
                  title="编辑"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(expanded ? null : s.id)
                  }}
                >
                  <PenLine size={13} />
                </button>
              </div>
              {expanded && (
                <div className="style-edit">
                  <input value={s.name} placeholder="风格名称" onChange={(e) => patchStyle(s.id, { name: e.target.value })} />
                  <textarea
                    rows={2}
                    value={s.description}
                    placeholder="描述语气、句式、结构等，AI 写作时会参考"
                    onChange={(e) => patchStyle(s.id, { description: e.target.value })}
                  />
                  <div className="row end">
                    {preset ? (
                      <button className="btn ghost" disabled={s.description === preset.description && s.name === preset.name} onClick={() => patchStyle(s.id, preset)}>
                        恢复默认
                      </button>
                    ) : (
                      <button className="btn ghost" disabled={writing.styles.length <= 1} onClick={() => removeStyle(s.id)}>
                        <Trash2 size={13} /> 删除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <button className="int-add" onClick={addStyle}>
          ＋ 添加风格
        </button>
      </div>
      <Group title="生成要求">
        <Row label="篇幅">
          <Segmented
            value={writing.length}
            options={WRITING_LENGTHS.map((l) => [l.key, l.label] as const)}
            onChange={(length) => onChange({ length })}
          />
        </Row>
        <Row label="目标读者">
          <input className="set-input" value={writing.audience} placeholder="如：职场新人、独立开发者" onChange={(e) => onChange({ audience: e.target.value })} />
        </Row>
        <Row label="补充要求" stack>
          <textarea
            rows={3}
            value={writing.extra}
            placeholder="如：第一人称；少用「赋能」等词；结尾引导读者留言"
            onChange={(e) => onChange({ extra: e.target.value })}
          />
        </Row>
      </Group>
      <p className="note">在 AI 助手中点击「写文章」，输入话题即可按这里的设置生成大纲。</p>
    </>
  )
}
