import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { Catalog } from '../../data/catalog'
import { formatScore } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'
import type { MenuItem } from '../../ui/Menu'
import { useContextMenu } from '../../ui/Menu'
import { exclusionText } from './labels'
import { COL_BLOCK, computeViewport, gridLabelWidth } from './gridLayout'
import type { Geom, Viewport } from './gridLayout'
import { GradeMark, GroupMark } from '../../ui/marks'

// re-exported for existing importers; new code imports the marks from ui/marks
export { GradeMark, GroupMark }

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
  /** Remedies appended beyond the limit (drawn after a divider). */
  pinned?: Set<number>
  compact?: boolean
  label?: string
  /** Expected size of the grid's scroll box (the pane it mounts into), read once on mount so the first render draws every visible column. */
  sizeHint?: () => { width: number; height: number } | null
}

/* Compact (dock) columns are as wide as the main grid's, so a score like "16/29" is never clipped. */
const SIZES = {
  normal: { label: 340, col: 36, head: 104, row: 24 },
  compact: { label: 230, col: 36, head: 78, row: 20 },
}
/** Widest the symptom column grows into width the remedy columns leave unused. */
const LABEL_MAX = 900
/** Narrowest the symptom column shrinks to, so symptom names stay readable. */
const LABEL_MIN = 260

/**
 * Score as shown in a 36px column header: the full label when it fits (≤ 5 characters), else only the
 * primary value (the header's title carries the full score).
 */
export function columnScore(full: string, row: Pick<AnalysisRow, 'score'>): string {
  if (full.length <= 5) return full
  const primary = full.includes('/') ? full.slice(0, full.indexOf('/')) : String(Math.round(row.score))
  return primary.length <= 5 ? primary : `${Math.round(row.score / 1000)}k`
}

export function SymptomLabel({ s, color }: { s: ResolvedSymptom; color: string }) {
  const w = s.symptom.weight
  return (
    <>
      <span className="an-swatch" style={{ background: color }} aria-hidden="true" />
      <span className={`an-weight w${w}`} title={w === 0 ? 'Intensity 0: ignored in the analysis' : `Intensity ×${w}`}>{w === 0 ? '0' : `×${w}`}</span>
      {s.eliminative && <span className="an-flag f-e" title={s.eliminativeRule === 'must-cover-strong' ? 'Eliminative (Kent: must cover intensity ≥ 3)' : s.eliminativeRule === 'marked-mental' ? 'Eliminative (Kent: marked mental symptom)' : 'Eliminative: only remedies in this symptom remain'}>E</span>}
      {s.symptom.exclusive && <span className="an-flag f-x" title="Excluding: remedies in this symptom are removed">X</span>}
      {s.symptom.group && <GroupMark letter={s.symptom.group} />}
      {s.symptom.causal && <span className="an-flag f-c" title="Causal">C</span>}
      <span className="an-label-text">{s.label}</span>
      {s.missing && <span className="an-flag f-m" title="Repertory not loaded">?</span>}
      <span className="an-size" title={`${s.size} remedies`}>{s.size}</span>
    </>
  )
}

const sameViewport = (v: Viewport, n: Viewport) => v.width === n.width && v.height === n.height && v.c0 === n.c0 && v.c1 === n.c1 && v.r0 === n.r0
  && v.r1 === n.r1 && v.canRight === n.canRight && v.hiddenRight === n.hiddenRight && v.sbw === n.sbw && v.sbh === n.sbh

/**
 * Visible index ranges of a scroll box. Only indexes (not raw offsets) are state, so scrolling within a
 * block does not re-render. Geometry comes from `geom`, read at event time. `initial` is the expected box
 * size (the pane's), so the first render is already right. Also returns the scroll offsets as of the last
 * scroll event (hover tracking reads them instead of forcing layout).
 */
type ViewportGeom = Omit<Geom, 'label'> & { labelFor: (width: number) => number }
const withLabel = (g: ViewportGeom, width: number): Geom => ({ label: g.labelFor(width), col: g.col, head: g.head, row: g.row, nr: g.nr, nc: g.nc })

function useViewport(ref: React.RefObject<HTMLDivElement | null>, geom: ViewportGeom, initial: { width: number; height: number } | null) {
  const [vp, setVp] = useState<Viewport>(() => (initial && initial.width > 0
    ? computeViewport(withLabel(geom, initial.width), initial.width, initial.height)
    : { width: 0, height: 0, c0: 0, c1: Math.min(geom.nc, 24), r0: 0, r1: Math.min(geom.nr, 40), canRight: false, hiddenRight: 0, sbw: 0, sbh: 0 }))
  const pos = useRef({ x: 0, y: 0 })
  const g = useRef(geom)
  useLayoutEffect(() => { g.current = geom })
  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const x = el.scrollLeft, y = el.scrollTop
    pos.current = { x, y }
    const w = el.clientWidth
    const next = computeViewport(withLabel(g.current, w), w, el.clientHeight, x, y, el.scrollWidth, el.offsetWidth - el.clientWidth, el.offsetHeight - el.clientHeight)
    setVp(v => (sameViewport(v, next) ? v : next))
  }, [ref])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [ref, update])
  // geometry changes (label width, more rows or columns) move the ranges too
  useLayoutEffect(update, [update, geom.labelFor, geom.col, geom.head, geom.row, geom.nr, geom.nc])
  return { vp, pos }
}

/**
 * A column range [from, to) of the grid: columns render in memoised blocks, so horizontal scrolling only
 * mounts new blocks. Body cells of the contiguous range flow in their row (no layer per cell); `abs` marks
 * the focused column kept outside that range, positioned absolutely.
 */
interface Span { from: number; to: number; abs?: boolean }

interface CellsProps extends Span {
  s: ResolvedSymptom
  i: number
  rows: AnalysisRow[]
  catalog: Catalog
  label: number
  col: number
  /** Focusable column when it lies in this block, else null. */
  activeC: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  pinned?: Set<number>
}

interface CellProps {
  className: string
  label: string
  colIndex: number
  cell: string
  left: number | undefined
  focusable: boolean
  gen: boolean
}

/**
 * One grid cell. Memoised on primitive props: moving the cursor (roving tabindex) re-renders only the
 * old and the new cursor cell, not the whole block they sit in.
 */
const Cell = memo(function Cell(c: CellProps) {
  return (
    <div
      className={c.className}
      role="gridcell"
      aria-colindex={c.colIndex}
      aria-label={c.label}
      style={c.left === undefined ? undefined : { left: c.left }}
      data-cell={c.cell}
      tabIndex={c.focusable ? 0 : -1}
    >
      {c.gen && <span className="an-cell-gen" aria-hidden="true">G</span>}
    </div>
  )
})

const RowCells = memo(function RowCells(p: CellsProps) {
  const { s, i, rows } = p
  const out = []
  for (let j = p.from; j < p.to; j++) {
    const row = rows[j]
    const g = row.grades[i]
    // Bönninghausen: grade raised from the linked general rubric
    const gen = g > 0 && s.generals.length > 0 && (s.baseGrades.get(row.remedyId) ?? 0) < g
    // the grade mark is the cell's ::before (k1–k4: size + colour), so an empty or graded cell is a single node
    let c = g ? `an-cell k${g}` : 'an-cell'
    if (p.abs) c += ' abs'
    if (gen) c += ' gen'
    if (row.excluded) c += ' excl'
    if (p.highlight?.has(row.remedyId)) c += ' fam'
    if (p.selectedSymptom != null && !row.grades[p.selectedSymptom]) c += ' dim'
    if (p.pinned?.has(row.remedyId) && !p.pinned.has(rows[j - 1]?.remedyId)) c += ' pin-first'
    out.push(
      <Cell
        key={row.remedyId}
        className={c}
        colIndex={j + 2}
        label={`${p.catalog.remedy(row.remedyId).abbrev}, ${s.label}: ${g ? `grade ${g}${gen ? ' (generalised)' : ''}` : 'absent'}`}
        left={p.abs ? p.label + j * p.col : undefined}
        cell={`${i}:${j}`}
        focusable={p.activeC === j}
        gen={gen}
      />,
    )
  }
  return <>{out}</>
}, sameCells)

/**
 * RowCells re-renders only when a cell it draws would change: a new analysis (an intensity key, another
 * strategy) keeps most cells as they were, so only the columns whose remedy or grade moved are rebuilt.
 */
function sameCells(a: CellsProps, b: CellsProps): boolean {
  if (a.from !== b.from || a.to !== b.to || a.abs !== b.abs || a.i !== b.i || a.label !== b.label || a.col !== b.col || a.activeC !== b.activeC
    || a.selectedSymptom !== b.selectedSymptom || a.highlight !== b.highlight || a.pinned !== b.pinned || a.catalog !== b.catalog) return false
  if (a.rows === b.rows && a.s === b.s) return true
  const sa = a.s, sb = b.s
  if (sa.label !== sb.label || sa.baseGrades !== sb.baseGrades || sa.generals.length !== sb.generals.length) return false
  const i = a.i, sel = a.selectedSymptom
  for (let j = Math.max(0, a.from - 1); j < a.to; j++) {
    const x = a.rows[j], y = b.rows[j]
    if (x === y) continue
    if (!x || !y || x.remedyId !== y.remedyId || x.grades[i] !== y.grades[i] || !x.excluded !== !y.excluded) return false
    if (sel != null && !x.grades[sel] !== !y.grades[sel]) return false
  }
  return true
}

interface RowProps {
  s: ResolvedSymptom
  i: number
  rows: AnalysisRow[]
  spans: Span[]
  catalog: Catalog
  color: string
  label: number
  col: number
  top: number
  width: number
  selected: boolean
  miss: boolean
  /** Column of the focusable cell when it is in this row (-1 = the label), else null. */
  activeC: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  pinned?: Set<number>
}

const inSpan = (c: number | null, sp: Span) => (c !== null && c >= sp.from && c < sp.to ? c : null)

/** One symptom line: sticky label plus the rendered remedy cells. Memoised: scrolling vertically mounts only new rows. */
const GridRow = memo(function GridRow(p: RowProps) {
  const { s, i } = p
  const cls = ['an-row']
  if (i % 2) cls.push('odd')
  if (s.role !== 'scored') cls.push(s.role)
  if (p.selected) cls.push('selected')
  if (p.miss) cls.push('miss')
  return (
    <div className={cls.join(' ')} role="row" aria-rowindex={i + 2} aria-selected={p.selected} style={{ top: p.top, width: p.width }}>
      <div className="an-label" role="rowheader" aria-colindex={1} data-cell={`${i}:-1`} tabIndex={p.activeC === -1 ? 0 : -1}
        title={`${s.label}\n${s.size} remedies${s.role === 'ignored' ? ' · ignored (intensity 0)' : s.role === 'excluding' ? ' · excluding' : ''}`}>
        <SymptomLabel s={s} color={p.color} />
      </div>
      {/* cells flow after the label: this gap stands for the columns scrolled out on the left */}
      {p.spans.length > 0 && !p.spans[0].abs && p.spans[0].from > 0 && <div className="an-gap" style={{ width: p.spans[0].from * p.col }} aria-hidden="true" />}
      {p.spans.map(sp => (
        <RowCells
          key={sp.abs ? `x${sp.from}` : sp.from} from={sp.from} to={sp.to} abs={sp.abs} s={s} i={i} rows={p.rows} catalog={p.catalog} label={p.label} col={p.col}
          activeC={inSpan(p.activeC, sp)} selectedSymptom={p.selectedSymptom} highlight={p.highlight} pinned={p.pinned}
        />
      ))}
    </div>
  )
})

interface HeadCellsProps extends Span {
  result: AnalysisResult
  rows: AnalysisRow[]
  catalog: Catalog
  label: number
  col: number
  /** The selected remedy when its column lies in this block, else null. */
  selectedRemedy: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  pinned?: Set<number>
  activeC: number | null
}

const HeadCells = memo(function HeadCells(p: HeadCellsProps) {
  const { result, rows, catalog } = p
  const symSel = p.selectedSymptom
  const out = []
  for (let j = p.from; j < p.to; j++) {
    const row = rows[j]
    const rem = catalog.remedy(row.remedyId)
    let cls = 'an-hcell'
    if (row.remedyId === p.selectedRemedy) cls += ' selected'
    if (row.excluded) cls += ' excl'
    if (p.highlight?.has(row.remedyId)) cls += ' fam'
    if (symSel != null) cls += row.grades[symSel] ? ' hit' : ' dim'
    const pinned = !!p.pinned?.has(row.remedyId)
    if (pinned) cls += ' pinned'
    if (pinned && !p.pinned!.has(rows[j - 1]?.remedyId)) cls += ' pin-first'
    const score = formatScore(result.strategy, row)
    const shown = columnScore(score, row)
    out.push(
      <div
        key={row.remedyId}
        className={cls}
        role="columnheader"
        aria-colindex={j + 2}
        aria-selected={row.remedyId === p.selectedRemedy}
        style={{ left: p.label + j * p.col }}
        title={`${row.rank ? `#${row.rank} ` : ''}${rem.name}${row.excluded ? ` (${exclusionText(result, row)})` : ''}\n${row.coverage} symptoms · ${row.degrees} degrees · score ${score}`}
        data-cell={`-1:${j}`}
        tabIndex={p.activeC === j ? 0 : -1}
      >
        <span className="an-rank">{row.rank || '–'}</span>
        {pinned && <span className="sr-only">pinned beyond the limit</span>}
        <span className="an-abbrev">{rem.abbrev}</span>
        <span className="an-score">{shown}</span>
      </div>,
    )
  }
  return <>{out}</>
})

interface HeadProps {
  result: AnalysisResult
  rows: AnalysisRow[]
  spans: Span[]
  catalog: Catalog
  label: number
  col: number
  width: number
  selectedRemedy: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  pinned?: Set<number>
  activeC: number | null
}

/** Sticky header row: corner plus one rotated remedy header per rendered column. */
const GridHead = memo(function GridHead(p: HeadProps) {
  const { result, rows } = p
  const nr = result.symptoms.length
  const selIndex = p.selectedRemedy == null ? -1 : rows.findIndex(r => r.remedyId === p.selectedRemedy)
  return (
    <div className="an-hrow" role="row" aria-rowindex={1} style={{ width: p.width }}>
      <div className="an-corner" role="columnheader" aria-colindex={1} data-cell="-1:-1" tabIndex={p.activeC === -1 ? 0 : -1}>
        <span className="an-corner-sym">{nr} symptom{nr === 1 ? '' : 's'}</span>
        <span className="an-corner-rem">{result.total} remedies ▸</span>
      </div>
      {p.spans.map(sp => (
        <HeadCells
          key={sp.abs ? `x${sp.from}` : sp.from} from={sp.from} to={sp.to} result={result} rows={rows} catalog={p.catalog} label={p.label} col={p.col}
          selectedRemedy={inSpan(selIndex, sp) !== null ? p.selectedRemedy : null} selectedSymptom={p.selectedSymptom}
          highlight={p.highlight} pinned={p.pinned} activeC={inSpan(p.activeC, sp)}
        />
      ))}
    </div>
  )
})

/**
 * Remedy × symptom grid: rows are symptoms, columns ranked remedies. Both axes are virtualised
 * (absolute cells; only the visible block range plus the focused row and column render), headers
 * stick to the top and the symptom labels to the left. ARIA grid with a roving focus cell;
 * r = -1 is the header row, c = -1 the label column.
 */
export const AnalysisGrid = memo(function AnalysisGrid(p: GridProps) {
  const { result, rows, catalog } = p
  const base = p.compact ? SIZES.compact : SIZES.normal
  const nr = result.symptoms.length
  const nc = rows.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const colBand = useRef<HTMLDivElement>(null)
  const rowBand = useRef<HTMLDivElement>(null)
  // scroller's box as of the last hover entry: hover tracking reads it (and the scroll offsets) instead of forcing layout
  const boxRect = useRef<DOMRect | null>(null)
  /*
   * The symptom (label) column's width follows the box width: narrow panes shrink it so more remedy columns
   * show, few remedies let it grow into unused width, overflowing columns make it absorb the remainder so
   * the last visible column is whole. Derived, not state: the width and the ranges change in one render.
   */
  const labelFor = useCallback((w: number) => (p.compact
    ? gridLabelWidth(w, nc, { base: base.label, col: base.col, min: base.label, max: base.label })
    : gridLabelWidth(w, nc, { base: base.label, col: base.col, min: LABEL_MIN, max: LABEL_MAX })), [p.compact, nc, base])
  const [initialSize] = useState(() => p.sizeHint?.() ?? null)
  const { vp, pos: scrollPos } = useViewport(scrollRef, { labelFor, col: base.col, head: base.head, row: base.row, nr, nc }, initialSize)
  const labelW = labelFor(vp.width)
  const S = useMemo(() => ({ ...base, label: labelW }), [base, labelW])
  // the hover cross-hair steps aside while scrolling (repainting it every frame costs more than the scroll itself)
  const scrolledAt = useRef(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      scrolledAt.current = performance.now()
      if (colBand.current) colBand.current.style.display = 'none'
      if (rowBand.current) rowBand.current.style.display = 'none'
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => { boxRect.current = null }, [vp.width, vp.height])
  // sideways scrolling comes to rest on whole remedy columns (the label width leaves a whole number of them
  // visible, so the right edge never cuts a column). Done on scrollend: CSS scroll snapping would need snap
  // areas for every column, and the columns are virtualised.
  const colW = S.col
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onEnd = () => {
      const x = el.scrollLeft, max = el.scrollWidth - el.clientWidth
      const r = x % colW
      if (r < 0.5 || colW - r < 0.5 || x >= max - 0.5) return
      const still = document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: Math.min(max, Math.round(x / colW) * colW), behavior: still ? 'instant' : 'smooth' })
    }
    el.addEventListener('scrollend', onEnd)
    return () => el.removeEventListener('scrollend', onEnd)
  }, [colW])
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const focusWithin = useRef(false)
  const cm = useContextMenu()

  const r0 = Math.min(Math.max(-1, active.r), nr - 1)
  const c0 = Math.min(Math.max(-1, active.c), nc - 1)

  // rendered columns: the block range (in blocks) plus the focused column (so focus never lands on an unmounted cell)
  const spans = useMemo(() => {
    const out: Span[] = []
    const end = Math.min(vp.c1, nc)
    for (let j = vp.c0; j < end; j += COL_BLOCK) out.push({ from: j, to: Math.min(end, j + COL_BLOCK) })
    if (c0 >= 0 && (c0 < vp.c0 || c0 >= end)) out.push({ from: c0, to: c0 + 1, abs: true })
    return out
  }, [vp.c0, vp.c1, nc, c0])
  const rowIdx: number[] = []
  for (let i = vp.r0; i < Math.min(vp.r1, nr); i++) rowIdx.push(i)
  if (r0 >= 0 && (r0 < vp.r0 || r0 >= vp.r1)) rowIdx.push(r0)

  const width = S.label + nc * S.col
  const height = S.head + nr * S.row

  const selCol = p.selectedRemedy != null ? rows.findIndex(r => r.remedyId === p.selectedRemedy) : -1
  const selRow = selCol >= 0 ? rows[selCol] : null
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
    setActive({ r: -1, c })
    focusWithin.current = true
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

  /** toggle: click / Space (a second press closes); select: Enter (always shows the remedy); open: Shift+Enter / double click. */
  const activate = (r: number, c: number, how: 'toggle' | 'select' | 'open' = 'toggle') => {
    if (c >= 0) {
      const id = rows[c].remedyId
      if (how === 'open' && p.onOpenRemedy) p.onOpenRemedy(id)
      else if (how === 'toggle') p.onSelectRemedy(p.selectedRemedy === id && r < 0 ? null : id)
      else p.onSelectRemedy(id)
    } else if (r >= 0) {
      if (how === 'open' && p.onOpenSymptom) p.onOpenSymptom(r)
      else if (how === 'toggle') p.onSelectSymptom(symSel === r ? null : r)
      else p.onSelectSymptom(r)
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
      case 'Enter': activate(r0, c0, e.shiftKey ? 'open' : 'select'); break
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
    const rect = boxRect.current ?? (boxRect.current = scrollRef.current!.getBoundingClientRect())
    const vx = e.clientX - rect.left, vy = e.clientY - rect.top
    const c = vx < S.label ? -1 : Math.floor((vx + scrollPos.current.x - S.label) / S.col)
    const r = vy < S.head ? -1 : Math.floor((vy + scrollPos.current.y - S.head) / S.row)
    return { r: r >= nr ? -2 : r, c: c >= nc ? -2 : c }
  }

  const onMouseMove = (e: ReactMouseEvent) => {
    if (performance.now() - scrolledAt.current < 200) return
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

  const cellAt = (e: { target: EventTarget }): { r: number; c: number } | null => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
    if (!t) return null
    const [r, c] = t.dataset.cell!.split(':').map(Number)
    return { r, c }
  }

  return (
    <div className={`an-grid-wrap${p.compact ? ' compact' : ''}`}>
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
        onMouseEnter={() => { boxRect.current = null }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseDown={e => { const at = cellAt(e); if (at) setActive(at) }}
        onClick={e => { const at = cellAt(e); if (at) activate(at.r, at.c) }}
        onDoubleClick={e => { const at = cellAt(e); if (at) activate(at.r, at.c, 'open') }}
        onContextMenu={e => {
          const at = cellAt(e)
          if (!at) return
          const items = menuFor(at.r, at.c)
          if (!items) return
          setActive(at)
          cm.open(e, items)
        }}
      >
        <div className="an-grid-inner" style={{ width, height }}>
          <GridHead
            result={result} rows={rows} spans={spans} catalog={catalog} label={S.label} col={S.col} width={width}
            selectedRemedy={p.selectedRemedy} selectedSymptom={symSel} highlight={p.highlight} pinned={p.pinned}
            activeC={r0 === -1 ? c0 : null}
          />
          {rowIdx.map(i => {
            const s = result.symptoms[i]
            return (
              <GridRow
                key={s.symptom.id} s={s} i={i} rows={rows} spans={spans} catalog={catalog} color={p.clipboardColor(s.clipboardId)}
                label={S.label} col={S.col} top={S.head + i * S.row} width={width}
                selected={symSel === i} miss={!!selRow && s.role === 'scored' && !selRow.grades[i]}
                activeC={r0 === i ? c0 : null} selectedSymptom={symSel} highlight={p.highlight} pinned={p.pinned}
              />
            )
          })}
          {selCol >= 0 && <div className="an-selband" style={{ transform: `translateX(${S.label + selCol * S.col}px)` }} aria-hidden="true" />}
          <div ref={colBand} className="an-xh an-xh-col" aria-hidden="true" />
          <div ref={rowBand} className="an-xh an-xh-row" aria-hidden="true" />
        </div>
        {cm.element}
      </div>
      {vp.canRight && <div className="an-grid-fade" style={{ right: vp.sbw, height: vp.height }} aria-hidden="true" />}
      {vp.hiddenRight > 0 && (
        <div className="an-grid-foot">
          <button
            type="button" className="an-more-cols" tabIndex={-1}
            title="Scroll to the next remedies (in the grid: → or End)"
            onClick={() => {
              const el = scrollRef.current
              if (!el) return
              const page = Math.max(1, Math.floor((el.clientWidth - S.label) / S.col) - 1) * S.col
              el.scrollBy({ left: page, behavior: 'smooth' })
            }}
          >
            {vp.hiddenRight} more {vp.hiddenRight === 1 ? 'remedy' : 'remedies'} ›
          </button>
        </div>
      )}
    </div>
  )
})
