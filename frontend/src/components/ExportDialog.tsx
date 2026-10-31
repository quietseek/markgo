import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react'
import type { ExportConfig, ExportFormat, PandocInfo } from '@shared/types'
import { Modal } from './Modal'
import { Group, Row, Segmented, Switch } from './SettingsDialog'
import { toast } from '../lib/toast'

const api = window.markgo

const RELEASES_URL = 'https://github.com/jgm/pandoc/releases/latest'
const INSTALL_URL = 'https://pandoc.org/installing.html'

type OS = 'windows' | 'mac' | 'linux'
const CURRENT_OS: OS = api.platform === 'darwin' ? 'mac' : api.platform === 'windows' ? 'windows' : 'linux'

/** 各平台的安装方法（摘自 https://pandoc.org/installing.html） */
const INSTALL_GUIDE: Record<OS, { label: string; methods: { title: string; desc?: string; cmd?: string; url?: string }[]; pdf: string; pdfCmd?: string }> = {
  windows: {
    label: 'Windows',
    methods: [
      { title: '安装包（推荐）', desc: '下载 .msi 安装程序运行即可，会自动加入 PATH', url: RELEASES_URL },
      { title: 'winget', cmd: 'winget install --source winget --exact --id JohnMacFarlane.Pandoc' },
      { title: 'Chocolatey', cmd: 'choco install pandoc' },
      { title: 'Conda', cmd: 'conda install -c conda-forge pandoc' }
    ],
    pdf: '导出 PDF 还需要 LaTeX，官方推荐 MiKTeX（https://miktex.org）',
    pdfCmd: 'choco install miktex'
  },
  mac: {
    label: 'macOS',
    methods: [
      { title: '安装包（推荐）', desc: '下载 .pkg 安装程序运行即可', url: RELEASES_URL },
      { title: 'Homebrew', cmd: 'brew install pandoc' },
      { title: 'MacPorts', cmd: 'port install pandoc' },
      { title: 'Conda', cmd: 'conda install -c conda-forge pandoc' }
    ],
    pdf: '导出 PDF 还需要 LaTeX，官方推荐 BasicTeX（完整的 MacTeX 约 4 GB）',
    pdfCmd: 'brew install --cask basictex'
  },
  linux: {
    label: 'Linux',
    methods: [
      { title: '发行版软件源', desc: '版本可能较旧', cmd: 'sudo apt install pandoc' },
      { title: 'deb 安装包（推荐，版本最新）', desc: '从发布页下载 pandoc-x.y-1-amd64.deb 后执行', cmd: 'sudo dpkg -i pandoc-*-amd64.deb', url: RELEASES_URL },
      { title: 'Conda', cmd: 'conda install -c conda-forge pandoc' }
    ],
    pdf: '导出 PDF 还需要 LaTeX，官方推荐通过软件源安装 TeX Live（中文文档另需 texlive-lang-chinese）',
    pdfCmd: 'sudo apt install texlive-xetex texlive-lang-chinese'
  }
}

/** 各格式的可选项说明 */
const FORMAT_HINTS: Record<string, string> = {
  pdf: '通过 LaTeX 等 PDF 引擎生成，中文文档默认使用系统中文字体',
  docx: '可指定参考文档，导出的 Word 会沿用其中的标题、正文等样式',
  odt: '可指定参考文档，导出的文档会沿用其中的样式',
  html: '独立的 HTML 文件，公式以 MathML 显示',
  epub: '电子书，可设置封面图片；标题取自 front matter 的 title',
  pptx: '每个一级 / 二级标题生成一页幻灯片'
}

interface Props {
  markdown: string
  docPath: string
  isScratch: boolean
  title: string
  config: ExportConfig
  /** 保存导出配置（导出时 Go 侧读取已保存的配置） */
  onSave(config: ExportConfig): Promise<void>
  onClose(): void
}

export function ExportDialog({ markdown, docPath, isScratch, title, config: initial, onSave, onClose }: Props) {
  // 本地草稿，输入时延迟保存，避免逐字保存的结果先后返回导致输入框跳动
  const [config, setConfig] = useState(initial)
  const latest = useRef(config)
  const timer = useRef<number>(undefined)
  const save = useRef(onSave)
  save.current = onSave
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    await save.current(latest.current)
  }, [])
  const onChange = (patch: Partial<ExportConfig>) => {
    latest.current = { ...latest.current, ...patch }
    setConfig(latest.current)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 400)
  }
  // 关闭时保存尚未保存的修改
  useEffect(
    () => () => {
      if (timer.current !== undefined) flush()
    },
    [flush]
  )
  const [formats, setFormats] = useState<ExportFormat[]>([])
  const [pandoc, setPandoc] = useState<PandocInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [cjkFont, setCjkFont] = useState('')

  const detect = useCallback(async (path: string) => {
    setDetecting(true)
    try {
      setPandoc(await api.export.pandoc(path))
    } finally {
      setDetecting(false)
    }
  }, [])
  useEffect(() => {
    api.export.formats().then(setFormats)
    api.export.defaultCjkFont().then(setCjkFont)
    detect(config.pandocPath)
    // 只在打开时检测一次，修改路径后由「重新检测」触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const format = formats.find((f) => f.id === config.lastFormat) ?? formats[0]

  const run = async () => {
    if (!format) return
    setError('')
    setExporting(true)
    try {
      await flush()
      const res = await api.export.run({ format: format.id, markdown, docPath, title, scratch: isScratch })
      if (res.error) setError(res.error)
      else if (res.path) {
        toast(`已导出 ${format.label}`, 'success')
        onClose()
      }
    } catch (err) {
      setError((err as Error).message ?? String(err))
    } finally {
      setExporting(false)
    }
  }

  const pick = async (kind: Parameters<typeof api.export.pickFile>[0], key: keyof ExportConfig) => {
    const p = await api.export.pickFile(kind)
    if (p) {
      onChange({ [key]: p })
      if (key === 'pandocPath') detect(p)
    }
  }

  const pathInput = (key: 'docxReference' | 'odtReference' | 'htmlCss' | 'epubCover', kind: 'docx' | 'odt' | 'css' | 'image', placeholder: string) => (
    <div className="export-path">
      <input value={config[key]} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={placeholder} spellCheck={false} />
      {config[key] && (
        <button className="icon-btn sm" title="清除" onClick={() => onChange({ [key]: '' })}>
          <X size={13} />
        </button>
      )}
      <button className="btn sm" onClick={() => pick(kind, key)}>
        选择…
      </button>
    </div>
  )

  return (
    <Modal title="导出" width={760} onClose={onClose}>
      {!pandoc ? (
        <div className="modal-body export-loading">
          <Loader2 size={16} className="spin" /> 正在检测 Pandoc…
        </div>
      ) : !pandoc.found ? (
        <PandocGuide
          pandoc={pandoc}
          path={config.pandocPath}
          detecting={detecting}
          onPath={(pandocPath) => onChange({ pandocPath })}
          onPick={() => pick('pandoc', 'pandocPath')}
          onDetect={() => detect(config.pandocPath)}
        />
      ) : (
        <>
          <div className="export-layout">
            <nav className="export-formats">
              {formats.map((f) => (
                <button key={f.id} className={f.id === format?.id ? 'active' : ''} onClick={() => onChange({ lastFormat: f.id })}>
                  <span>{f.label}</span>
                  <small>.{f.ext}</small>
                </button>
              ))}
            </nav>
            <div className="export-options">
              {format && FORMAT_HINTS[format.id] && <p className="export-hint">{FORMAT_HINTS[format.id]}</p>}

              {format?.id === 'pdf' && (
                <Group title="PDF">
                  <Row
                    label="PDF 引擎"
                    desc={pandoc.pdfEngines.length ? `本机可用：${pandoc.pdfEngines.join('、')}` : '未检测到 PDF 引擎，请先安装 LaTeX（见下方说明）或 Typst'}
                  >
                    <select className="select" value={config.pdfEngine} onChange={(e) => onChange({ pdfEngine: e.target.value })}>
                      <option value="">自动{pandoc.pdfEngines[0] ? `（${pandoc.pdfEngines[0]}）` : ''}</option>
                      {['xelatex', 'lualatex', 'pdflatex', 'tectonic', 'typst', 'weasyprint', 'wkhtmltopdf'].map((e) => (
                        <option key={e} value={e}>
                          {e}
                          {pandoc.pdfEngines.includes(e) ? '' : '（未安装）'}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="纸张">
                    <Segmented
                      value={config.paperSize}
                      options={[
                        ['a4', 'A4'],
                        ['letter', 'Letter']
                      ]}
                      onChange={(paperSize) => onChange({ paperSize })}
                    />
                  </Row>
                  <Row label="页边距" desc="如 2.5cm、1in">
                    <input className="set-input narrow" value={config.margin} onChange={(e) => onChange({ margin: e.target.value })} placeholder="2.5cm" />
                  </Row>
                  <Row label="正文字体" desc={`留空时中文文档使用 ${cjkFont || '系统中文字体'}`}>
                    <input className="set-input" value={config.mainFont} onChange={(e) => onChange({ mainFont: e.target.value })} placeholder={cjkFont} />
                  </Row>
                  {!pandoc.pdfEngines.length && (
                    <Row label="安装 PDF 引擎" desc={INSTALL_GUIDE[CURRENT_OS].pdf} stack>
                      {INSTALL_GUIDE[CURRENT_OS].pdfCmd && <CopyCommand cmd={INSTALL_GUIDE[CURRENT_OS].pdfCmd!} />}
                    </Row>
                  )}
                </Group>
              )}
              {format?.id === 'docx' && (
                <Group title="Word">
                  <Row label="参考文档" desc="留空使用 Pandoc 默认样式" stack>
                    {pathInput('docxReference', 'docx', '选择一个 .docx 作为样式模板')}
                  </Row>
                </Group>
              )}
              {format?.id === 'odt' && (
                <Group title="OpenOffice">
                  <Row label="参考文档" desc="留空使用 Pandoc 默认样式" stack>
                    {pathInput('odtReference', 'odt', '选择一个 .odt 作为样式模板')}
                  </Row>
                </Group>
              )}
              {format?.id === 'html' && (
                <Group title="HTML">
                  <Row label="嵌入资源" desc="把图片、样式表嵌入 HTML，生成可单独分享的文件">
                    <Switch checked={config.htmlEmbed} onChange={(htmlEmbed) => onChange({ htmlEmbed })} />
                  </Row>
                  <Row label="样式表" desc="留空使用 Pandoc 默认样式" stack>
                    {pathInput('htmlCss', 'css', '选择 .css 文件')}
                  </Row>
                </Group>
              )}
              {format?.id === 'epub' && (
                <Group title="EPUB">
                  <Row label="封面图片" stack>
                    {pathInput('epubCover', 'image', '选择封面图片')}
                  </Row>
                </Group>
              )}

              <Group title="通用">
                <Row label="生成目录">
                  <Switch checked={config.toc} onChange={(toc) => onChange({ toc })} />
                </Row>
                <Row label="标题编号" desc="为各级标题加上 1、1.1 这样的编号">
                  <Switch checked={config.numberSections} onChange={(numberSections) => onChange({ numberSections })} />
                </Row>
                <Row label="导出后">
                  <Segmented
                    value={config.afterExport}
                    options={[
                      ['none', '不处理'],
                      ['open', '打开文件'],
                      ['reveal', '在文件夹中显示']
                    ]}
                    onChange={(afterExport) => onChange({ afterExport })}
                  />
                </Row>
              </Group>

              <Group title="高级">
                {format && (
                  <Row label={`${format.label} 额外参数`} desc="仅用于此格式的 Pandoc 命令行参数" stack>
                    <input
                      value={config.formatArgs[format.id] ?? ''}
                      onChange={(e) => onChange({ formatArgs: { ...config.formatArgs, [format.id]: e.target.value } })}
                      placeholder="如 --shift-heading-level-by=-1"
                      spellCheck={false}
                    />
                  </Row>
                )}
                <Row label="通用额外参数" desc="所有格式都会附加的参数" stack>
                  <input value={config.extraArgs} onChange={(e) => onChange({ extraArgs: e.target.value })} placeholder="如 --metadata author=张三" spellCheck={false} />
                </Row>
                <Row label="Pandoc" desc={`${pandoc.version ? `版本 ${pandoc.version} · ` : ''}${pandoc.path}`} stack>
                  <div className="export-path">
                    <input
                      value={config.pandocPath}
                      onChange={(e) => onChange({ pandocPath: e.target.value })}
                      onBlur={() => detect(config.pandocPath)}
                      placeholder="留空自动查找"
                      spellCheck={false}
                    />
                    <button className="btn sm" onClick={() => pick('pandoc', 'pandocPath')}>
                      选择…
                    </button>
                  </div>
                </Row>
              </Group>
            </div>
          </div>
          {error && <pre className="export-error">{error}</pre>}
          <div className="modal-footer">
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" disabled={!format || exporting} onClick={run}>
              {exporting ? (
                <>
                  <Loader2 size={14} className="spin" /> 正在导出…
                </>
              ) : (
                `导出 ${format?.label ?? ''}…`
              )}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function PandocGuide({
  pandoc,
  path,
  detecting,
  onPath,
  onPick,
  onDetect
}: {
  pandoc: PandocInfo
  path: string
  detecting: boolean
  onPath(p: string): void
  onPick(): void
  onDetect(): void
}) {
  const [os, setOs] = useState<OS>(CURRENT_OS)
  const guide = INSTALL_GUIDE[os]
  return (
    <>
      <div className="modal-body export-guide">
        <p className="export-guide-lead">
          导出 Word、PDF、EPUB 等格式需要先安装 <b>Pandoc</b>（免费开源的文档转换工具）。安装完成后点击「重新检测」即可。
        </p>
        {pandoc.error && <pre className="export-error">{pandoc.error}</pre>}
        <div className="export-guide-tabs">
          <Segmented value={os} options={(Object.keys(INSTALL_GUIDE) as OS[]).map((k) => [k, INSTALL_GUIDE[k].label] as const)} onChange={(v: OS) => setOs(v)} />
        </div>
        <ol className="export-methods">
          {guide.methods.map((m) => (
            <li key={m.title}>
              <div className="export-method-head">
                <b>{m.title}</b>
                {m.url && (
                  <button className="btn sm" onClick={() => api.shell.openExternal(m.url!)}>
                    <ExternalLink size={13} /> 打开下载页
                  </button>
                )}
              </div>
              {m.desc && <small>{m.desc}</small>}
              {m.cmd && <CopyCommand cmd={m.cmd} />}
            </li>
          ))}
        </ol>
        <p className="export-guide-note">
          {guide.pdf}
          {guide.pdfCmd && <CopyCommand cmd={guide.pdfCmd} />}
        </p>
        <p className="export-guide-note">
          更多安装方式见{' '}
          <a href={INSTALL_URL} onClick={(e) => (e.preventDefault(), api.shell.openExternal(INSTALL_URL))}>
            Pandoc 官方安装说明
          </a>
          。已安装但未检测到？可手动指定 Pandoc 程序的位置：
        </p>
        <div className="export-path">
          <input value={path} onChange={(e) => onPath(e.target.value)} placeholder="留空自动查找" spellCheck={false} />
          <button className="btn sm" onClick={onPick}>
            <FolderOpen size={13} /> 选择…
          </button>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn primary" disabled={detecting} onClick={onDetect}>
          {detecting ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} 重新检测
        </button>
      </div>
    </>
  )
}

function CopyCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="export-cmd">
      <code>{cmd}</code>
      <button
        className="icon-btn sm"
        title="复制命令"
        onClick={async () => {
          await navigator.clipboard.writeText(cmd)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}
