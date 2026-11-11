import type { ExportConfig } from '@shared/types'
import { pageLayout } from '../lib/print'

const cm = (mm: number) => Number((mm / 10).toFixed(2)).toString()

/** 同一缩放系数绘制纸张与四边留白，避免横向纸张或不对称边距失真。 */
export function PageMarginPreview({ config, onChange }: {
  config: ExportConfig
  onChange(patch: Partial<ExportConfig>): void
}) {
  const p = pageLayout(config)
  const scale = Math.min(160 / p.width, 180 / p.height)
  const width = p.width * scale
  const height = p.height * scale
  const x = (184 - width) / 2
  const y = (204 - height) / 2
  const left = x + Math.min(p.width, Math.max(0, p.left)) * scale
  const top = y + Math.min(p.height, Math.max(0, p.top)) * scale
  const contentWidth = p.contentWidth * scale
  const contentHeight = p.contentHeight * scale
  const direction = config.landscape ? '横向' : '纵向'
  const description = `${p.paper.label} ${direction}，纸张 ${cm(p.width)} × ${cm(p.height)} 厘米；上 ${cm(p.top)}、下 ${cm(p.bottom)}、左 ${cm(p.left)}、右 ${cm(p.right)} 厘米`

  return (
    <figure className="page-margin-preview">
      <div className="page-margin-controls">
        {([
          ['marginTop', '上', 'top'],
          ['marginLeft', '左', 'left'],
          ['marginRight', '右', 'right'],
          ['marginBottom', '下', 'bottom']
        ] as const).map(([key, label, side]) => (
          <label key={key} className={`page-margin-field margin-${side}`}>
            <span className="page-margin-input">
              <input className="set-input" type="number" min={0} max={10} step={0.01}
                aria-label={`${label}边距（厘米）`} value={config[key]}
                onChange={(e) => onChange({ [key]: Math.max(0, Number(e.target.value) || 0), marginPreset: 'custom' })} />
              <small>厘米</small>
            </span>
          </label>
        ))}
      <svg className="page-margin-paper" viewBox="0 0 184 204" role="img" aria-label={description}>
        <rect x={x} y={y} width={width} height={height} fill="#eef0f3" stroke="#b8bec8" strokeWidth="1" />
        {p.contentWidth > 0 && p.contentHeight > 0 && <>
          <rect x={left} y={top} width={contentWidth} height={contentHeight} fill="white" stroke={p.valid ? '#8993a2' : '#c95c54'} strokeWidth="1" strokeDasharray="3 3" />
          {Array.from({ length: Math.min(16, Math.floor((contentHeight - 10) / 7)) }, (_, i) => (
            <line key={i} x1={left + 5} y1={top + 7 + i * 7} x2={left + 5 + Math.max(0, contentWidth - 10) * (i % 5 === 4 ? 0.65 : 1)} y2={top + 7 + i * 7} stroke="#d8dce3" strokeWidth={i === 0 ? 2 : 1} />
          ))}
        </>}
      </svg>
      </div>
      <figcaption>
        {p.paper.label} · {direction}
        {!p.valid && <p className="page-margin-invalid" role="status">页边距过大</p>}
      </figcaption>
    </figure>
  )
}
