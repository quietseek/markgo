import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, FolderOpen, Loader2, Printer, RefreshCw, X } from 'lucide-react'
import type { ExportConfig, ExportFormat, PandocInfo } from '@shared/types'
import { Modal } from './Modal'
import { Group, Row, Segmented, Switch } from './SettingsDialog'
import { toast } from '../lib/toast'
import { printDocument } from '../lib/print'

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
  docx: '可指定参考文档，导出的 Word 会沿用其中的标题、正文等样式',
  odt: '可指定参考文档，导出的文档会沿用其中的样式',
  html: '独立的 HTML 文件，公式以 MathML 显示',
  epub: '电子书，可设置封面图片；标题取自 front matter 的 title',
  pptx: '每个一级 / 二级标题生成一页幻灯片'
}

/** 常用纸张（键与 Go 侧 export.PaperSizes 一致） */
const PAPER_SIZES: [ExportConfig['paperSize'], string][] = [
  ['a4', 'A4（210 × 297 mm）'],
  ['a3', 'A3（297 × 420 mm）'],
  ['a5', 'A5（148 × 210 mm）'],
  ['b5', 'B5（176 × 250 mm）'],
  ['b4', 'B4（250 × 353 mm）'],
  ['letter', 'Letter（8.5 × 11 in）'],
  ['legal', 'Legal（8.5 × 14 in）']
]

interface Props {
  markdown: string
  docPath: string
  isScratch: boolean
  title: string
  config: ExportConfig
  /** 保存导出配置（导出时 Go 侧读取已保存的配置） */
  onSave(config: ExportConfig): Promise<void>
  /** 导出带排版主题的 HTML（不经过 Pandoc） */
  onStyledHtml(): void
  onClose(): void
}

export function ExportDialog({ markdown, docPath, isScratch, title, config: initial, onSave, onStyledHtml, onClose }: Props) {
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
  const hasEngine = !!pandoc?.found && pandoc.pdfEngines.length > 0
  // PDF 是否通过系统打印对话框生成（无需安装 Pandoc 与 LaTeX）
  const printPdf = format?.id === 'pdf' && (config.pdfMode === 'print' || (config.pdfMode === 'auto' && !hasEngine))

  const print = async () => {
    await flush()
    onClose()
    // 等对话框关闭、页面重绘后再打开打印对话框
    window.setTimeout(() => {
      printDocument({ title, paperSize: latest.current.paperSize, landscape: latest.current.landscape, margin: latest.current.margin }).catch((err) =>
        toast(`无法打印：${(err as Error).message ?? err}`, 'error')
      )
    }, 200)
  }

  const run = async () => {
    if (!format) return
    if (printPdf) return print()
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
          onPrint={() => {
            onChange({ lastFormat: 'pdf' })
            print()
          }}
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
              <ExportOptions
                config={config}
                onChange={onChange}
                pandoc={pandoc}
                format={format}
                printPdf={printPdf}
                cjkFont={cjkFont}
                onPick={pick}
              />
              <Group title="Pandoc">
                <Row label="程序位置" desc={`${pandoc.version ? `版本 ${pandoc.version} · ` : ''}${pandoc.path}`} stack>
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
            <button className="btn ghost export-print-btn" title="按当前排版主题导出 HTML，适合发布到网页，无需 Pandoc" onClick={onStyledHtml}>
              导出排版 HTML…
            </button>
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" disabled={!format || exporting} onClick={run}>
              {exporting ? (
                <>
                  <Loader2 size={14} className="spin" /> 正在导出…
                </>
              ) : (
                printPdf ? '打印为 PDF…' : `导出 ${format?.label ?? ''}…`
              )}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

type PickKind = 'docx' | 'odt' | 'css' | 'image' | 'pandoc'

/** 导出选项：导出对话框与「设置 → 导出」共用；format 为要显示其专属选项的格式 */
export function ExportOptions({
  config,
  onChange,
  pandoc,
  format,
  printPdf,
  cjkFont,
  onPick
}: {
  config: ExportConfig
  onChange(patch: Partial<ExportConfig>): void
  pandoc: PandocInfo | null
  format: ExportFormat | undefined
  printPdf: boolean
  cjkFont: string
  onPick(kind: PickKind, key: keyof ExportConfig): void
}) {
  const engines = pandoc?.pdfEngines ?? []
  const hasEngine = !!pandoc?.found && engines.length > 0
  const pathInput = (key: 'docxReference' | 'odtReference' | 'htmlCss' | 'epubCover', kind: 'docx' | 'odt' | 'css' | 'image', placeholder: string) => (
    <div className="export-path">
      <input value={config[key]} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={placeholder} spellCheck={false} />
      {config[key] && (
        <button className="icon-btn sm" title="清除" onClick={() => onChange({ [key]: '' })}>
          <X size={13} />
        </button>
      )}
      <button className="btn sm" onClick={() => onPick(kind, key)}>
        选择…
      </button>
    </div>
  )
  return (
    <>
    {format && FORMAT_HINTS[format.id] && <p className="export-hint">{FORMAT_HINTS[format.id]}</p>}

    {format?.id === 'pdf' && (
      <Group title="PDF">
        <Row
          label="生成方式"
          desc={
            printPdf
              ? '按编辑区当前的样式排版，在系统打印对话框中选择「存储为 PDF」/「Microsoft Print to PDF」保存，无需安装其他软件'
              : '通过 Pandoc 与 PDF 引擎生成，排版由 LaTeX 等引擎决定'
          }
        >
          <Segmented
            value={config.pdfMode}
            options={[
              ['auto', '自动'],
              ['print', '打印为 PDF'],
              ['pandoc', 'Pandoc']
            ]}
            onChange={(pdfMode) => onChange({ pdfMode })}
          />
        </Row>
        {config.pdfMode === 'auto' && (
          <Row label="当前使用" desc={hasEngine ? `检测到 PDF 引擎 ${engines[0]}，使用 Pandoc 生成` : '未检测到 LaTeX 等 PDF 引擎，使用打印为 PDF'}>
            <span className="export-mode-tag">{printPdf ? '打印为 PDF' : 'Pandoc'}</span>
          </Row>
        )}
        {!printPdf && (
          <Row
            label="PDF 引擎"
            desc={engines.length ? `本机可用：${engines.join('、')}` : '未检测到 PDF 引擎，请先安装 LaTeX（见下方说明）或 Typst'}
          >
            <select className="select" value={config.pdfEngine} onChange={(e) => onChange({ pdfEngine: e.target.value })}>
              <option value="">自动{engines[0] ? `（${engines[0]}）` : ''}</option>
              {['xelatex', 'lualatex', 'pdflatex', 'tectonic', 'typst', 'weasyprint', 'wkhtmltopdf'].map((e) => (
                <option key={e} value={e}>
                  {e}
                  {engines.includes(e) ? '' : '（未安装）'}
                </option>
              ))}
            </select>
          </Row>
        )}
        <Row label="纸张">
          <select className="select" value={config.paperSize} onChange={(e) => onChange({ paperSize: e.target.value as ExportConfig['paperSize'] })}>
            {PAPER_SIZES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="方向">
          <Segmented
            value={config.landscape ? 'landscape' : 'portrait'}
            options={[
              ['portrait', '纵向'],
              ['landscape', '横向']
            ]}
            onChange={(v) => onChange({ landscape: v === 'landscape' })}
          />
        </Row>
        <Row label="页边距" desc="如 2.5cm、20mm、1in">
          <input className="set-input narrow" value={config.margin} onChange={(e) => onChange({ margin: e.target.value })} placeholder="2.5cm" />
        </Row>
        {!printPdf && (
          <Row label="正文字体" desc={`留空时中文文档使用 ${cjkFont || '系统中文字体'}`}>
            <input className="set-input" value={config.mainFont} onChange={(e) => onChange({ mainFont: e.target.value })} placeholder={cjkFont} />
          </Row>
        )}
        {config.pdfMode === 'pandoc' && !engines.length && (
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

    {printPdf && <p className="export-hint">打印为 PDF 使用编辑区的样式，下方的目录、标题编号与 Pandoc 参数不适用。</p>}
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
      </Group>
    </>
  )
}

/** 「设置 → 导出」：选择格式查看其选项，以及 Pandoc 的检测与位置 */
export function ExportSettings({ config, onChange }: { config: ExportConfig; onChange(patch: Partial<ExportConfig>): void }) {
  const [formats, setFormats] = useState<ExportFormat[]>([])
  const [pandoc, setPandoc] = useState<PandocInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [cjkFont, setCjkFont] = useState('')
  const [formatId, setFormatId] = useState(config.lastFormat)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const format = formats.find((f) => f.id === formatId) ?? formats[0]
  const hasEngine = !!pandoc?.found && pandoc.pdfEngines.length > 0
  const printPdf = format?.id === 'pdf' && (config.pdfMode === 'print' || (config.pdfMode === 'auto' && !hasEngine))
  const pick = async (kind: PickKind, key: keyof ExportConfig) => {
    const p = await api.export.pickFile(kind)
    if (p) {
      onChange({ [key]: p })
      if (key === 'pandocPath') detect(p)
    }
  }

  return (
    <>
      <Group title="Pandoc">
        <Row
          label="状态"
          desc={
            !pandoc
              ? '正在检测…'
              : pandoc.found
                ? `已安装 Pandoc ${pandoc.version}${pandoc.pdfEngines.length ? ` · PDF 引擎：${pandoc.pdfEngines.join('、')}` : ' · 未检测到 PDF 引擎，PDF 将打印生成'}`
                : pandoc.error || '未检测到 Pandoc：导出 Word、EPUB 等格式需先安装（导出时会显示安装方法），PDF 可直接打印生成'
          }
        >
          <button className="btn sm" disabled={detecting} onClick={() => detect(config.pandocPath)}>
            {detecting ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} 重新检测
          </button>
        </Row>
        <Row label="程序位置" desc={pandoc?.found ? pandoc.path : '留空时自动查找'} stack>
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
      <Group title="格式选项">
        <Row label="查看格式" desc="各格式的选项分别保存，导出时使用">
          <select className="select" value={format?.id ?? ''} onChange={(e) => setFormatId(e.target.value)}>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}（.{f.ext}）
              </option>
            ))}
          </select>
        </Row>
      </Group>
      <ExportOptions config={config} onChange={onChange} pandoc={pandoc} format={format} printPdf={printPdf} cjkFont={cjkFont} onPick={pick} />
    </>
  )
}

function PandocGuide({
  pandoc,
  path,
  detecting,
  onPath,
  onPick,
  onDetect,
  onPrint
}: {
  pandoc: PandocInfo
  path: string
  detecting: boolean
  onPath(p: string): void
  onPick(): void
  onDetect(): void
  onPrint(): void
}) {
  const [os, setOs] = useState<OS>(CURRENT_OS)
  const guide = INSTALL_GUIDE[os]
  return (
    <>
      <div className="modal-body export-guide">
        <p className="export-guide-lead">
          导出 Word、EPUB 等格式需要先安装 <b>Pandoc</b>（免费开源的文档转换工具），安装完成后点击「重新检测」即可。只需要 PDF 的话，可以不安装，点击左下角「直接打印为 PDF」。
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
        <button className="btn export-print-btn" title="不安装 Pandoc：按编辑区的样式打印，在系统打印对话框中存储为 PDF" onClick={onPrint}>
          <Printer size={14} /> 直接打印为 PDF…
        </button>
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
