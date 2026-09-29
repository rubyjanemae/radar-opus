import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { Catalog } from '../../data/catalog'
import { formatScore } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'
import type { MenuItem } from '../../ui/Menu'
import { useContextMenu } from '../../ui/Menu'
import { EXCLUSION_LABEL } from './export'

export interface GridProps {
  result: AnalysisResult
  rows: AnalysisRow[]
  catalog: Catalog
  clipboardColor: (id: string) => string
  selectedRemedy: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  onSelectRemedy: (id: number | null) => void
  onSelectSymptom: (i: number | null) => void
  onOpenRemedy?: (id: number) => void
  onOpenSymptom?: (i: number) => void
  remedyMenu?: (row: AnalysisRow) => MenuItem[]
  symptomMenu?: (i: number) => MenuItem[]
  /** Scroll a remedy's column into view when `nonce` changes. */
  reveal?: { remedyId: number; nonce: number } | null
  compact?: boolean
  label?: string
}

const SIZES = {
  normal: { label: 340, col: 32, head: 104, row: 24 },
  compact: { label: 230, col: 30, head: 78, row: 20 },
}

/** Grade mark: bar height (1–4 steps) plus colour, never colour alone. */
export function GradeMark({ g }: { g: number }) {
  if (!g) return null
  return <span className={`an-mark m${g}`} aria-hidden="true" />
}

export function SymptomLabel({ s, color }: { s: ResolvedSymptom; color: string }) {
  const w = s.symptom.weight
  return (
    <>
      <span className="an-swatch" style={{ background: color }} aria-hidden="true" />
      <span className={`an-weight w${w}`} title={w === 0 ? 'Intensity 0: ignored in the analysis' : `Intensity ×${w}`}>{w === 0 ? '0' : `×${w}`}</span>
      {s.symptom.eliminatory && <span className="an-flag f-e" title="Eliminative: only remedies in this symptom remain">E</span>}
      {s.symptom.exclusive && <span className="an-flag f-x" title="Excluding: remedies in this symptom are removed">X</span>}
      {s.symptom.group && <span className="an-flag f-g" title={`Group ${s.symptom.group}`}>{s.symptom.group}</span>}
      {s.symptom.causal && <span className="an-flag f-c" title="Causal">C</span>}
      <span className="an-label-text">{s.label}</span>
      {s.missing && <span className="an-flag f-m" title="Repertory not loaded">?</span>}
      <span className="an-size" title={`${s.size} remedies`}>{s.size}</span>
    </>
  )
}

function useScrollBox(ref: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      setBox(b => (b.left === el.scrollLeft && b.top === el.scrollTop && b.width === el.clientWidth && b.height === el.clientHeight) ? b : { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [ref])
  return box
}

/**
 * Remedy × symptom grid: rows are symptoms, columns ranked remedies. Columns are
 * virtualised (absolute cells, only the visible range plus the focused column render),
 * headers stick to the top and the symptom labels to the left. ARIA grid with a roving
 * focus cell; r = -1 is the header row, c = -1 the label column.
 */
export const AnalysisGrid = memo(function AnalysisGrid(p: GridProps) {
  const { result, rows, catalog } = p
  const base = p.compact ? SIZES.compact : SIZES.normal
  const nr = result.symptoms.length
  const nc = rows.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const colBand = useRef<HTMLDivElement>(null)
  const rowBand = useRef<HTMLDivElement>(null)
  const box = useScrollBox(scrollRef)
  // the label column shrinks in narrow panes so more remedy columns stay visible
  const labelW = box.width && !p.compact ? Math.round(Math.max(200, Math.min(base.label, box.width * 0.4))) : base.label
  const S = useMemo(() => ({ ...base, label: labelW }), [base, labelW])
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const focusWithin = useRef(false)
  const cm = useContextMenu()

  const r0 = Math.min(Math.max(-1, active.r), nr - 1)
  const c0 = Math.min(Math.max(-1, active.c), nc - 1)

  const first = Math.max(0, Math.floor(box.left / S.col) - 3)
  const last = Math.min(nc, Math.ceil((box.left + Math.max(0, box.width - S.label)) / S.col) + 3)
  const cols: number[] = []
  for (let j = first; j < last; j++) cols.push(j)
  if (c0 >= 0 && (c0 < first || c0 >= last)) cols.push(c0)

  const width = S.label + nc * S.col
  const height = S.head + nr * S.row

  const selCol = p.selectedRemedy != null ? rows.findIndex(r => r.remedyId === p.selectedRemedy) : -1
  const selRow = p.selectedRemedy != null ? rows[selCol] ?? null : null
  const symSel = p.selectedSymptom

  const ensureVisible = useCallback((r: number, c: number) => {
    const el = scrollRef.current
    if (!el) return
    if (c >= 0) {
      const x = c * S.col
      const view = el.clientWidth - S.label
      if (x < el.scrollLeft) el.scrollLeft = x
      else if (x + S.col > el.scrollLeft + view) el.scrollLeft = x + S.col - view
    }
    if (r >= 0) {
      const y = r * S.row
      const view = el.clientHeight - S.head
      if (y < el.scrollTop) el.scrollTop = y
      else if (y + S.row > el.scrollTop + view) el.scrollTop = y + S.row - view
    }
  }, [S])

  // move DOM focus to the active cell once it is rendered
  useEffect(() => {
    if (!focusWithin.current) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-cell="${r0}:${c0}"]`)
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  })

  useEffect(() => {
    if (!p.reveal) return
    const c = rows.findIndex(r => r.remedyId === p.reveal!.remedyId)
    if (c < 0) return
    setActive(a => ({ r: a.r, c }))
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, c * S.col - (el.clientWidth - S.label) / 2 + S.col / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reveal?.nonce])

  const move = (r: number, c: number) => {
    const nr2 = Math.max(-1, Math.min(nr - 1, r))
    const nc2 = Math.max(-1, Math.min(nc - 1, c))
    setActive({ r: nr2, c: nc2 })
    ensureVisible(nr2, nc2)
  }

  const activate = (r: number, c: number, open = false) => {
    if (c >= 0) {
      const id = rows[c].remedyId
      if (open && p.onOpenRemedy) p.onOpenRemedy(id)
      else p.onSelectRemedy(p.selectedRemedy === id && r < 0 ? null : id)
    } else if (r >= 0) {
      if (open && p.onOpenSymptom) p.onOpenSymptom(r)
      else p.onSelectSymptom(symSel === r ? null : r)
    }
  }

  const menuFor = (r: number, c: number): MenuItem[] | null => {
    if (c >= 0 && p.remedyMenu) return p.remedyMenu(rows[c])
    if (c < 0 && r >= 0 && p.symptomMenu) return p.symptomMenu(r)
    return null
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const page = Math.max(1, Math.floor(((scrollRef.current?.clientHeight ?? 300) - S.head) / S.row) - 1)
    const mod = e.ctrlKey || e.metaKey
    let handled = true
    switch (e.key) {
      case 'ArrowDown': move(r0 + 1, c0); break
      case 'ArrowUp': move(r0 - 1, c0); break
      case 'ArrowRight': move(r0, c0 + 1); break
      case 'ArrowLeft': move(r0, c0 - 1); break
      case 'Home': move(mod ? -1 : r0, -1); break
      case 'End': move(mod ? nr - 1 : r0, nc - 1); break
      case 'PageDown': move(r0 + page, c0); break
      case 'PageUp': move(r0 - page, c0); break
      case 'Enter': activate(r0, c0, e.shiftKey); break
      case ' ': activate(r0, c0); break
      case 'Escape':
        if (p.selectedRemedy != null || symSel != null) { p.onSelectRemedy(null); p.onSelectSymptom(null) } else handled = false
        break
      case 'F10':
      case 'ContextMenu': {
        if (e.key === 'F10' && !e.shiftKey) { handled = false; break }
        const items = menuFor(r0, c0)
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-cell="${r0}:${c0}"]`)
        if (items && el) cm.openAt(el, items)
        break
      }
      default: handled = false
    }
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const locate = (e: ReactMouseEvent): { r: number; c: number } => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    const vx = e.clientX - rect.left, vy = e.clientY - rect.top
    const c = vx < S.label ? -1 : Math.floor((vx + el.scrollLeft - S.label) / S.col)
    const r = vy < S.head ? -1 : Math.floor((vy + el.scrollTop - S.head) / S.row)
    return { r: r >= nr ? -2 : r, c: c >= nc ? -2 : c }
  }

  const onMouseMove = (e: ReactMouseEvent) => {
    const { r, c } = locate(e)
    if (colBand.current) {
      colBand.current.style.display = c >= 0 && r !== -2 ? 'block' : 'none'
      colBand.current.style.transform = `translateX(${S.label + c * S.col}px)`
    }
    if (rowBand.current) {
      rowBand.current.style.display = r >= 0 && c !== -2 ? 'block' : 'none'
      rowBand.current.style.transform = `translateY(${S.head + r * S.row}px)`
    }
  }
  const onMouseLeave = () => {
    if (colBand.current) colBand.current.style.display = 'none'
    if (rowBand.current) rowBand.current.style.display = 'none'
  }

  const cellProps = (r: number, c: number) => ({
    'data-cell': `${r}:${c}`,
    tabIndex: r === r0 && c === c0 ? 0 : -1,
    onMouseDown: () => setActive({ r, c }),
  })

  const dimCol = (row: AnalysisRow) => symSel != null && !row.grades[symSel]

  return (
    <div
      ref={scrollRef}
      className={`an-grid${p.compact ? ' compact' : ''}`}
      role="grid"
      aria-label={p.label ?? 'Analysis grid'}
      aria-rowcount={nr + 1}
      aria-colcount={nc + 1}
      style={{ ['--an-label' as string]: `${S.label}px`, ['--an-col' as string]: `${S.col}px`, ['--an-head' as string]: `${S.head}px`, ['--an-row' as string]: `${S.row}px` }}
      onKeyDown={onKeyDown}
      onFocus={() => { focusWithin.current = true }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) focusWithin.current = false }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={e => {
        const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
        if (!t) return
        const [r, c] = t.dataset.cell!.split(':').map(Number)
        activate(r, c)
      }}
      onDoubleClick={e => {
        const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
        if (!t) return
        const [r, c] = t.dataset.cell!.split(':').map(Number)
        activate(r, c, true)
      }}
      onContextMenu={e => {
        const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
        if (!t) return
        const [r, c] = t.dataset.cell!.split(':').map(Number)
        const items = menuFor(r, c)
        if (!items) return
        setActive({ r, c })
        cm.open(e, items)
      }}
    >
      <div className="an-grid-inner" style={{ width, height }}>
        {/* header */}
        <div className="an-hrow" role="row" aria-rowindex={1} style={{ width }}>
          <div className="an-corner" role="columnheader" aria-colindex={1} {...cellProps(-1, -1)}>
            <span className="an-corner-sym">{nr} symptom{nr === 1 ? '' : 's'}</span>
            <span className="an-corner-rem">{result.total} remedies ▸</span>
          </div>
          {cols.map(j => {
            const row = rows[j]
            const rem = catalog.remedy(row.remedyId)
            const cls = ['an-hcell']
            if (row.remedyId === p.selectedRemedy) cls.push('selected')
            if (row.excluded) cls.push('excl')
            if (p.highlight?.has(row.remedyId)) cls.push('fam')
            if (symSel != null) cls.push(row.grades[symSel] ? 'hit' : 'dim')
            return (
              <div
                key={row.remedyId}
                className={cls.join(' ')}
                role="columnheader"
                aria-colindex={j + 2}
                aria-selected={row.remedyId === p.selectedRemedy}
                style={{ left: S.label + j * S.col }}
                title={`${row.rank ? `#${row.rank} ` : ''}${rem.name}${row.excluded ? ` (${EXCLUSION_LABEL[row.excluded]})` : ''}\n${row.coverage} symptoms · ${row.degrees} degrees · score ${formatScore(result.strategy, row)}`}
                {...cellProps(-1, j)}
              >
                <span className="an-rank">{row.rank || '–'}</span>
                <span className="an-abbrev">{rem.abbrev}</span>
                <span className="an-score">{formatScore(result.strategy, row)}</span>
              </div>
            )
          })}
        </div>
        {/* body */}
        {result.symptoms.map((s, i) => {
          const cls = ['an-row']
          if (s.role !== 'scored') cls.push(s.role)
          if (symSel === i) cls.push('selected')
          if (selRow && s.role === 'scored' && !selRow.grades[i]) cls.push('miss')
          return (
            <div key={`${s.symptom.id}`} className={cls.join(' ')} role="row" aria-rowindex={i + 2} aria-selected={symSel === i} style={{ top: S.head + i * S.row, width }}>
              <div className="an-label" role="rowheader" aria-colindex={1} title={`${s.label}\n${s.size} remedies${s.role === 'ignored' ? ' · ignored (intensity 0)' : s.role === 'excluding' ? ' · excluding' : ''}`} {...cellProps(i, -1)}>
                <SymptomLabel s={s} color={p.clipboardColor(s.clipboardId)} />
              </div>
              {cols.map(j => {
                const row = rows[j]
                const g = row.grades[i]
                const c = ['an-cell']
                if (row.excluded) c.push('excl')
                if (p.highlight?.has(row.remedyId)) c.push('fam')
                if (dimCol(row)) c.push('dim')
                return (
                  <div
                    key={row.remedyId}
                    className={c.join(' ')}
                    role="gridcell"
                    aria-colindex={j + 2}
                    aria-label={g ? `grade ${g}` : 'absent'}
                    style={{ left: S.label + j * S.col }}
                    {...cellProps(i, j)}
                  >
                    <GradeMark g={g} />
                  </div>
                )
              })}
            </div>
          )
        })}
        {selCol >= 0 && <div className="an-selband" style={{ transform: `translateX(${S.label + selCol * S.col}px)` }} aria-hidden="true" />}
        <div ref={colBand} className="an-xh an-xh-col" aria-hidden="true" />
        <div ref={rowBand} className="an-xh an-xh-row" aria-hidden="true" />
      </div>
      {cm.element}
    </div>
  )
})
