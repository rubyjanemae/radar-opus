import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'
import { formatScore, strategyInfo } from '../../engine/analysis'

export interface ExportMeta {
  title: string
  clipboardName: (id: string) => string
  remedyAbbrev: (id: number) => string
  remedyName: (id: number) => string
}

/** Short flag string of a column: E eliminative, X excluding, group letter, C causal, 0 ignored. */
export function symptomFlags(s: ResolvedSymptom): string {
  const f: string[] = []
  if (s.role === 'ignored') f.push('0')
  if (s.symptom.eliminatory) f.push('E')
  if (s.symptom.exclusive) f.push('X')
  if (s.symptom.group) f.push(s.symptom.group.toUpperCase())
  if (s.symptom.causal) f.push('C')
  return f.join(' ')
}

export const EXCLUSION_LABEL: Record<NonNullable<AnalysisRow['excluded']>, string> = {
  manual: 'excluded by you',
  filter: 'outside the remedy filter',
  excluding: 'in an excluding symptom',
  eliminative: 'missing an eliminative symptom',
  coverage: 'too few symptoms covered',
}

function cell(v: string | number): string {
  const s = String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The grid as CSV: symptoms as rows, remedies (in rank order) as columns. */
export function analysisCsv(result: AnalysisResult, rows: AnalysisRow[], meta: ExportMeta): string {
  const info = strategyInfo(result.strategy)
  const lines: (string | number)[][] = []
  lines.push(['Analysis', meta.title, 'Strategy', info.name, 'Intensity', result.useIntensity ? 'on' : 'off'])
  lines.push([])
  const pad = ['', '', '', '']
  lines.push(['Symptom', 'Clipboard', 'Intensity', 'Flags', 'Rubric size', ...rows.map(r => meta.remedyAbbrev(r.remedyId))])
  lines.push(['Remedy', ...pad, ...rows.map(r => meta.remedyName(r.remedyId))])
  lines.push(['Rank', ...pad, ...rows.map(r => (r.rank ? r.rank : `(${EXCLUSION_LABEL[r.excluded!]})`))])
  lines.push(['Score', ...pad, ...rows.map(r => formatScore(result.strategy, r))])
  lines.push(['Symptoms covered', ...pad, ...rows.map(r => r.coverage)])
  lines.push(['Sum of degrees', ...pad, ...rows.map(r => r.degrees)])
  result.symptoms.forEach((s, i) => {
    lines.push([s.label, meta.clipboardName(s.clipboardId), s.symptom.weight, symptomFlags(s), s.size, ...rows.map(r => r.grades[i] || '')])
  })
  return lines.map(l => l.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function safeFileName(s: string): string {
  return s.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'analysis'
}

/** Colours for canvas rendering, read from the live CSS variables. */
function palette() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d
  return {
    bg: v('--bg-elev', '#fff'), text: v('--text', '#1c2129'), text3: v('--text-3', '#7a8190'), border: v('--border', '#d3d7de'),
    head: v('--chrome', '#e9ebef'), g: ['', v('--g1', '#3d4450'), v('--g2', '#1c55b8'), v('--g3', '#c2261b'), v('--g4', '#8a1911')],
    font: v('--font-ui', 'system-ui, sans-serif'),
  }
}

/** Same shapes as `.an-mark`: dash, circle, square, square with ring. */
function drawMark(ctx: CanvasRenderingContext2D, g: number, cx: number, cy: number, color: string, bg: string) {
  ctx.fillStyle = color
  if (g === 1) { ctx.globalAlpha *= 0.8; ctx.fillRect(cx - 4, cy - 1.5, 8, 3); return }
  if (g === 2) { ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); return }
  ctx.fillRect(cx - 5, cy - 5, 10, 10)
  if (g === 4) {
    ctx.strokeStyle = bg; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 5.75, cy - 5.75, 11.5, 11.5)
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 7.25, cy - 7.25, 14.5, 14.5)
  }
}

/** Render the grid (all symptoms × given remedies) to a PNG blob. */
export async function analysisPng(result: AnalysisResult, rows: AnalysisRow[], meta: ExportMeta): Promise<Blob> {
  const p = palette()
  const LABEL = 360, COL = 30, ROW = 22, HEAD = 96, TITLE = 36, scale = 2
  const width = LABEL + rows.length * COL + 16
  const height = TITLE + HEAD + result.symptoms.length * ROW + 16
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.scale(scale, scale)
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = p.text
  ctx.font = `600 14px ${p.font}`
  ctx.textBaseline = 'middle'
  ctx.fillText(meta.title, 8, 14)
  ctx.font = `12px ${p.font}`
  ctx.fillStyle = p.text3
  ctx.fillText(`${strategyInfo(result.strategy).name}${result.useIntensity ? '' : ' · intensity off'} · ${result.total} remedies`, 8, 29)

  const top = TITLE
  ctx.fillStyle = p.head
  ctx.fillRect(0, top, width, HEAD)
  rows.forEach((r, j) => {
    const x = LABEL + j * COL
    ctx.save()
    ctx.globalAlpha = r.excluded ? 0.45 : 1
    ctx.fillStyle = p.text3
    ctx.font = `10px ${p.font}`
    ctx.textAlign = 'center'
    ctx.fillText(r.rank ? String(r.rank) : '–', x + COL / 2, top + 8)
    ctx.fillStyle = p.text
    ctx.font = `600 11px ${p.font}`
    ctx.translate(x + COL / 2 + 4, top + 64)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'left'
    ctx.fillText(meta.remedyAbbrev(r.remedyId).slice(0, 9), 0, 0)
    ctx.restore()
    ctx.fillStyle = p.text
    ctx.font = `10px ${p.font}`
    ctx.textAlign = 'center'
    ctx.fillText(formatScore(result.strategy, r), x + COL / 2, top + HEAD - 12)
    ctx.textAlign = 'left'
  })
  result.symptoms.forEach((s, i) => {
    const y = top + HEAD + i * ROW
    ctx.strokeStyle = p.border
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(0, y + ROW); ctx.lineTo(width, y + ROW); ctx.stroke()
    ctx.fillStyle = s.role === 'scored' ? p.text : p.text3
    ctx.font = `11px ${p.font}`
    const w = s.symptom.weight
    const prefix = `${w === 0 ? '0' : '×' + w} ${symptomFlags(s).replace(/^0 ?/, '')}`.trim()
    let label = `${prefix}  ${s.label}`
    while (ctx.measureText(label).width > LABEL - 14 && label.length > 4) label = label.slice(0, -2)
    if (label !== `${prefix}  ${s.label}`) label += '…'
    ctx.fillText(label, 8, y + ROW / 2)
    rows.forEach((r, j) => {
      const g = r.grades[i]
      if (!g) return
      const x = LABEL + j * COL
      ctx.globalAlpha = r.excluded || s.role !== 'scored' ? 0.4 : 1
      drawMark(ctx, g, x + COL / 2, y + ROW / 2, p.g[g], p.bg)
      ctx.globalAlpha = 1
    })
  })
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'))
}
