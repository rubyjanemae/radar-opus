import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Catalog } from '../../data/catalog'
import { formatScore } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import type { MenuItem } from '../../ui/Menu'
import { useContextMenu } from '../../ui/Menu'
import { EXCLUSION_LABEL } from './export'

interface Props {
  result: AnalysisResult
  rows: AnalysisRow[]
  catalog: Catalog
  selectedRemedy: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  onSelectRemedy: (id: number | null) => void
  onSelectSymptom: (i: number | null) => void
  onOpenRemedy: (id: number) => void
  remedyMenu: (row: AnalysisRow) => MenuItem[]
  reveal?: { remedyId: number; nonce: number } | null
}

const ROW = 26
const OVERSCAN = 6

export function GradeLegend() {
  return (
    <div className="an-legend" aria-label="Grade legend">
      {[1, 2, 3, 4].map(g => (
        <span key={g} className="an-legend-item"><span className={`an-seg-swatch s${g}`} aria-hidden="true">{g}</span><span className={`g${g}`}>{['plain', 'italic', 'bold', 'CAPS'][g - 1]}</span></span>
      ))}
    </div>
  )
}

/** Horizontal score bars, one per remedy, stacked by symptom and coloured + numbered by grade. Virtualised rows. */
export const AnalysisBars = memo(function AnalysisBars(p: Props) {
  const { result, rows, catalog } = p
  const ref = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ top: 0, height: 600 })
  const [active, setActive] = useState(0)
  const focusWithin = useRef(false)
  const cm = useContextMenu()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setVp(v => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }))
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])

  const max = Math.max(1e-9, ...rows.map(r => r.points))
  const a = Math.min(active, rows.length - 1)
  const start = Math.max(0, Math.floor(vp.top / ROW) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((vp.top + vp.height) / ROW) + OVERSCAN)
  const idx: number[] = []
  for (let k = start; k < end; k++) idx.push(k)
  if (a >= 0 && (a < start || a >= end)) idx.push(a)

  const ensure = (k: number) => {
    const el = ref.current
    if (!el) return
    if (k * ROW < el.scrollTop) el.scrollTop = k * ROW
    else if ((k + 1) * ROW > el.scrollTop + el.clientHeight) el.scrollTop = (k + 1) * ROW - el.clientHeight
  }
  const go = (k: number) => { const n = Math.max(0, Math.min(rows.length - 1, k)); setActive(n); ensure(n) }

  useEffect(() => {
    if (!focusWithin.current) return
    const el = ref.current?.querySelector<HTMLElement>(`[data-k="${a}"]`)
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  })

  useEffect(() => {
    if (!p.reveal) return
    const k = rows.findIndex(r => r.remedyId === p.reveal!.remedyId)
    if (k < 0) return
    setActive(k)
    const el = ref.current
    if (el) el.scrollTop = Math.max(0, k * ROW - el.clientHeight / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reveal?.nonce])

  return (
    <div
      ref={ref}
      className="an-bars"
      role="listbox"
      aria-label="Remedy scores"
      onFocus={() => { focusWithin.current = true }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) focusWithin.current = false }}
      onKeyDown={e => {
        const page = Math.max(1, Math.floor((ref.current?.clientHeight ?? 300) / ROW) - 1)
        let handled = true
        if (e.key === 'ArrowDown') go(a + 1)
        else if (e.key === 'ArrowUp') go(a - 1)
        else if (e.key === 'PageDown') go(a + page)
        else if (e.key === 'PageUp') go(a - page)
        else if (e.key === 'Home') go(0)
        else if (e.key === 'End') go(rows.length - 1)
        else if (e.key === 'Enter' && e.shiftKey) p.onOpenRemedy(rows[a].remedyId)
        else if (e.key === 'Enter' || e.key === ' ') p.onSelectRemedy(p.selectedRemedy === rows[a].remedyId ? null : rows[a].remedyId)
        else if (e.key === 'Escape' && (p.selectedRemedy != null || p.selectedSymptom != null)) { p.onSelectRemedy(null); p.onSelectSymptom(null) }
        else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          const el = ref.current?.querySelector<HTMLElement>(`[data-k="${a}"]`)
          if (el) cm.openAt(el, p.remedyMenu(rows[a]))
        } else handled = false
        if (handled) { e.preventDefault(); e.stopPropagation() }
      }}
    >
      <div style={{ height: rows.length * ROW, position: 'relative' }}>
        {idx.map(k => {
          const row = rows[k]
          const rem = catalog.remedy(row.remedyId)
          const cls = ['an-bar-row']
          if (row.remedyId === p.selectedRemedy) cls.push('selected')
          if (row.excluded) cls.push('excl')
          if (p.highlight?.has(row.remedyId)) cls.push('fam')
          if (p.selectedSymptom != null && !row.grades[p.selectedSymptom]) cls.push('dim')
          return (
            <div
              key={row.remedyId}
              data-k={k}
              className={cls.join(' ')}
              role="option"
              aria-selected={row.remedyId === p.selectedRemedy}
              tabIndex={k === a ? 0 : -1}
              style={{ top: k * ROW }}
              title={`${rem.name}${row.excluded ? ` (${EXCLUSION_LABEL[row.excluded]})` : ''}`}
              onMouseDown={() => setActive(k)}
              onClick={() => p.onSelectRemedy(p.selectedRemedy === row.remedyId ? null : row.remedyId)}
              onDoubleClick={() => p.onOpenRemedy(row.remedyId)}
              onContextMenu={e => { setActive(k); cm.open(e, p.remedyMenu(row)) }}
            >
              <span className="an-bar-rank">{row.rank || '–'}</span>
              <span className="an-bar-abbrev">{rem.abbrev}</span>
              <span className="an-bar-track">
                {result.symptoms.map((s, i) => {
                  const pts = row.contributions[i]
                  if (!pts) return null
                  const g = row.grades[i]
                  const sel = p.selectedSymptom === i
                  return (
                    <span
                      key={i}
                      className={`an-bseg s${g}${sel ? ' on' : p.selectedSymptom != null ? ' off' : ''}`}
                      style={{ width: `${(pts / max) * 100}%` }}
                      title={`${s.label}\ngrade ${g} · ${Math.round(pts * 100) / 100} points`}
                      onClick={e => { e.stopPropagation(); p.onSelectSymptom(sel ? null : i) }}
                    >{g}</span>
                  )
                })}
              </span>
              <span className="an-bar-score">{formatScore(result.strategy, row)}</span>
            </div>
          )
        })}
      </div>
      {cm.element}
    </div>
  )
})
