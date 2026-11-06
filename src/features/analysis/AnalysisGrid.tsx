import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { Catalog } from '../../data/catalog'
import { formatScore } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'
import type { MenuItem } from '../../ui/Menu'
import { useContextMenu } from '../../ui/Menu'
import { exclusionText } from './labels'
import { COL_BLOCK, computeViewport, fitScore, gridLabelWidth, gridLines } from './gridLayout'
import type { Geom, GridLine, Viewport } from './gridLayout'
import { GradeMark, GroupMark } from '../../ui/marks'
import { columnAbbrev, paneDetail, paneLabel, paneSymptomName } from './paneLabel'
import { setCopyCursor } from './copyItem'
import type { CopyItem } from './copyItem'
import { rubricPlainText } from '../repertory/take'

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
  /** Main grid: name and number of a clipboard, for its header bar in the symptom pane. */
  clipboardInfo?: (id: string) => { name: string; n: number }
  /** Clipboards whose symptom lines are folded away (main grid). */
  collapsed?: ReadonlySet<string>
  onToggleClipboard?: (id: string) => void
  /** The header bar's close box: takes the clipboard out of the analysis. */
  onRemoveClipboard?: (id: string) => void
  /** Remedies matching the "Search remedy" field: their columns are marked and the first is scrolled into view. */
  found?: ReadonlySet<number> | null
  /** Main grid: symptoms (ids) whose detail line is shown under them (the row's disclosure triangle). */
  expanded?: ReadonlySet<string>
  onToggleSymptom?: (id: string) => void
  /** Main grid: digits 0–4 on a symptom line set its intensity. */
  onSetWeight?: (i: number, weight: 0 | 1 | 2 | 3 | 4) => void
  /** Main grid: Delete / Backspace on a symptom's label removes it from its clipboard (undoable). */
  onRemoveSymptom?: (i: number) => void
  /** Analysis › Show current analysis with symptoms only (F7): no remedy columns; the symptom pane takes the width. */
  symptomsOnly?: boolean
}

/* Compact (dock) columns are as wide as the main grid's, so a score like "16/29" is never clipped. */
/*
 * Main grid: the RadarOpus layout. A ~330px symptom pane, 25px remedy columns, 19px lines; the header has
 * the rotated abbreviations (ABBREV_H) over a rank row and one or two score rows (SCORE_ROW each).
 */
const SIZES = {
  normal: { label: 334, col: 25, head: 0, row: 19 },
  compact: { label: 230, col: 36, head: 78, row: 20 },
}
const ABBREV_H = 66
const SCORE_ROW = 17
/** The header's bottom rule is 2px (RadarOpus): the head grows by the second pixel. */
const HEAD_RULE = 1
/** Room after the last column for its rotated abbreviation, which leans right past its own column. */
const ABBREV_PAD = 56
/** Fixed-size scrollbar thumb (RadarOpus draws a small thumb whatever the number of remedies). */
const THUMB_W = 27
/** Narrowest the symptom pane shrinks to in a narrow window. */
const LABEL_MIN = 200
/** The symptom pane keeps its width while at least this many remedy columns still fit beside it. */
const MIN_COLS = 8

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

/**
 * A symptom line of the main grid's symptom pane: a grey disclosure triangle (shows the symptom's detail
 * line), "1. MIND - ABRUPT" … "(43) 1" (rubric size, intensity).
 */
function PaneSymptom({ s, n, text, open }: { s: ResolvedSymptom; n: number; text: string; open: boolean }) {
  const w = s.symptom.weight
  return (
    <>
      <span className={`an-sdisc${open ? ' open' : ''}`} data-disc="" title={open ? 'Hide details' : 'Show details'} aria-hidden="true" />
      <span className="an-sym-n">{n}.</span>
      {s.eliminative && <span className="an-flag f-e" title={s.eliminativeRule === 'must-cover-strong' ? 'Eliminative (Kent: must cover intensity ≥ 3)' : s.eliminativeRule === 'marked-mental' ? 'Eliminative (Kent: marked mental symptom)' : 'Eliminative: only remedies in this symptom remain'}>E</span>}
      {s.symptom.exclusive && <span className="an-flag f-x" title="Excluding: remedies in this symptom are removed">X</span>}
      {s.symptom.group && <GroupMark letter={s.symptom.group} />}
      {s.symptom.causal && <span className="an-flag f-c" title="Causal">C</span>}
      <span className="an-label-text">{text}</span>
      {s.missing && <span className="an-flag f-m" title="Repertory not loaded">?</span>}
      <span className="an-size" title={`${s.size} remedies`}>{s.size}</span>
      <span className={`an-weight w${w}`} title={w === 0 ? 'Intensity 0: ignored in the analysis' : `Intensity ${w}`}>{w}</span>
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
  /** Grid line of this symptom (differs from `i` when clipboard header lines are drawn). */
  r: number
  rows: AnalysisRow[]
  catalog: Catalog
  label: number
  col: number
  /** Focusable column when it lies in this block, else null. */
  activeC: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  pinned?: Set<number>
  /** Main grid: the symptom's pane text, so a cell's name reads like its row header ("MIND - ABRUPT"). */
  text?: string
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
        label={`${p.catalog.remedy(row.remedyId).abbrev}, ${p.text ?? s.label}: ${g ? `grade ${g}${gen ? ' (generalised)' : ''}` : 'absent'}`}
        left={p.abs ? p.label + j * p.col : undefined}
        cell={`${p.r}:${j}`}
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
  if (a.from !== b.from || a.to !== b.to || a.abs !== b.abs || a.i !== b.i || a.r !== b.r || a.label !== b.label || a.col !== b.col || a.activeC !== b.activeC
    || a.selectedSymptom !== b.selectedSymptom || a.highlight !== b.highlight || a.pinned !== b.pinned || a.catalog !== b.catalog || a.text !== b.text) return false
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
  r: number
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
  /** Main grid: the symptom's number within its clipboard (drawn in the RadarOpus pane style). */
  n?: number
  /** Main grid: the pane text ("MIND - ABRUPT") and whether the detail line is open. */
  text?: string
  open?: boolean
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
    <div className={cls.join(' ')} role="row" aria-rowindex={p.r + 2} aria-selected={p.selected} style={{ top: p.top, width: p.width }}>
      <div className="an-label" role="rowheader" aria-colindex={1} data-cell={`${p.r}:-1`} tabIndex={p.activeC === -1 ? 0 : -1}
        aria-expanded={p.n !== undefined ? !!p.open : undefined}
        aria-label={p.n !== undefined ? paneSymptomName(s, p.n, p.text ?? s.label) : undefined}
        title={`${p.text ?? s.label}\n${s.size} remedies${s.role === 'ignored' ? ' · ignored (intensity 0)' : s.role === 'excluding' ? ' · excluding' : ''}`}>
        {p.n !== undefined ? <PaneSymptom s={s} n={p.n} text={p.text ?? s.label} open={!!p.open} /> : <SymptomLabel s={s} color={p.color} />}
      </div>
      {/* cells flow after the label: this gap stands for the columns scrolled out on the left */}
      {p.spans.length > 0 && !p.spans[0].abs && p.spans[0].from > 0 && <div className="an-gap" style={{ width: p.spans[0].from * p.col }} aria-hidden="true" />}
      {p.spans.map(sp => (
        <RowCells
          key={sp.abs ? `x${sp.from}` : sp.from} from={sp.from} to={sp.to} abs={sp.abs} s={s} i={i} r={p.r} rows={p.rows} catalog={p.catalog} label={p.label} col={p.col}
          activeC={inSpan(p.activeC, sp)} selectedSymptom={p.selectedSymptom} highlight={p.highlight} pinned={p.pinned} text={p.text}
        />
      ))}
    </div>
  )
})

interface ClipRowProps {
  r: number
  id: string
  name: string
  n: number
  count: number
  collapsed: boolean
  top: number
  width: number
  focusable: boolean
  onToggle?: (id: string) => void
  onRemove?: (id: string) => void
}

/** A clipboard's header line: salmon bar "1. Clipboard 1" with a disclosure triangle and a close box. */
const ClipRow = memo(function ClipRow(p: ClipRowProps) {
  const label = `${p.n}. ${p.name}`
  return (
    <div className="an-row an-cbrow" role="row" aria-rowindex={p.r + 2} style={{ top: p.top, width: p.width }}>
      <div
        className="an-label an-cbcell" role="rowheader" aria-colindex={1} data-cell={`${p.r}:-1`} tabIndex={p.focusable ? 0 : -1}
        aria-expanded={!p.collapsed} aria-label={`${label}, ${p.count} symptom${p.count === 1 ? '' : 's'}`}
        title={`${label}: ${p.count} symptom${p.count === 1 ? '' : 's'}\nClick or Space: ${p.collapsed ? 'show' : 'hide'} its symptoms`}
      >
        <span className="an-cbbar">
          <span className={`an-disc${p.collapsed ? '' : ' open'}`} aria-hidden="true" />
          <span className="an-cbname">{label}</span>
          {p.onRemove && (
            <button
              type="button" className="an-cbclose" tabIndex={-1} aria-label={`Remove ${p.name} from the analysis`} title={`Remove ${p.name} from the analysis`}
              onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); p.onRemove!(p.id) }}
            />
          )}
        </span>
      </div>
    </div>
  )
})

/** The detail line under an expanded symptom: its repertory, size, intensity and qualifiers. */
const InfoRow = memo(function InfoRow(p: { r: number; text: string; top: number; width: number; focusable: boolean }) {
  return (
    <div className="an-row an-inforow" role="row" aria-rowindex={p.r + 2} style={{ top: p.top, width: p.width }}>
      <div className="an-label an-infocell" role="rowheader" aria-colindex={1} data-cell={`${p.r}:-1`} tabIndex={p.focusable ? 0 : -1} title={p.text}>
        <span className="an-label-text">{p.text}</span>
      </div>
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
  /** Main grid: RadarOpus header (rotated abbreviation, rank row, score row(s) of at most four characters). */
  ro?: boolean
  found?: ReadonlySet<number> | null
}

const HeadCells = memo(function HeadCells(p: HeadCellsProps) {
  const { result, rows, catalog } = p
  const symSel = p.selectedSymptom
  const out = []
  for (let j = p.from; j < p.to; j++) {
    const row = rows[j]
    const rem = catalog.remedy(row.remedyId)
    let cls = j === 0 ? 'an-hcell first' : 'an-hcell'
    if (row.remedyId === p.selectedRemedy) cls += ' selected'
    if (row.excluded) cls += ' excl'
    if (p.highlight?.has(row.remedyId)) cls += ' fam'
    if (symSel != null) cls += row.grades[symSel] ? ' hit' : ' dim'
    const pinned = !!p.pinned?.has(row.remedyId)
    if (pinned) cls += ' pinned'
    if (pinned && !p.pinned!.has(rows[j - 1]?.remedyId)) cls += ' pin-first'
    if (p.found?.has(row.remedyId)) cls += ' found'
    const score = formatScore(result.strategy, row)
    const shown = p.ro ? '' : columnScore(score, row)
    const [s1, s2] = p.ro ? score.split('/') : []
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
        {p.ro ? (
          <>
            <span className="an-abbrev">{columnAbbrev(rem.abbrev)}</span>
            {pinned && <span className="sr-only">pinned beyond the limit</span>}
            <span className="an-rank">{row.rank || '–'}</span>
            <span className={`an-score${fitScore(s1).length > 3 ? ' n4' : ''}`}>{fitScore(s1)}</span>
            {s2 !== undefined && <span className={`an-score2${fitScore(s2).length > 3 ? ' n4' : ''}`}>{fitScore(s2)}</span>}
          </>
        ) : (
          <>
            <span className="an-rank">{row.rank || '–'}</span>
            {pinned && <span className="sr-only">pinned beyond the limit</span>}
            <span className="an-abbrev">{rem.abbrev}</span>
            <span className="an-score">{shown}</span>
          </>
        )}
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
  ro?: boolean
  found?: ReadonlySet<number> | null
}

/** Sticky header row: corner plus one rotated remedy header per rendered column. */
const GridHead = memo(function GridHead(p: HeadProps) {
  const { result, rows } = p
  const nr = result.symptoms.length
  const selIndex = p.selectedRemedy == null ? -1 : rows.findIndex(r => r.remedyId === p.selectedRemedy)
  return (
    <div className="an-hrow" role="row" aria-rowindex={1} style={{ width: p.width }}>
      {p.ro ? (
        // an empty corner, as in RadarOpus: the rows it heads are rank and score (said to screen readers)
        <div className="an-corner" role="columnheader" aria-colindex={1} data-cell="-1:-1" tabIndex={p.activeC === -1 ? 0 : -1}
          aria-label={`${nr} symptom${nr === 1 ? '' : 's'}, ${result.total} remedies. Column headers: rank, then score${rows[0] && formatScore(result.strategy, rows[0]).includes('/') ? 's' : ''}`} />
      ) : (
        <div className="an-corner" role="columnheader" aria-colindex={1} data-cell="-1:-1" tabIndex={p.activeC === -1 ? 0 : -1}>
          <span className="an-corner-sym">{nr} symptom{nr === 1 ? '' : 's'}</span>
          <span className="an-corner-rem">{result.total} remedies ▸</span>
        </div>
      )}
      {p.spans.map(sp => (
        <HeadCells
          key={sp.abs ? `x${sp.from}` : sp.from} from={sp.from} to={sp.to} result={result} rows={rows} catalog={p.catalog} label={p.label} col={p.col}
          selectedRemedy={inSpan(selIndex, sp) !== null ? p.selectedRemedy : null} selectedSymptom={p.selectedSymptom}
          highlight={p.highlight} pinned={p.pinned} activeC={inSpan(p.activeC, sp)} ro={p.ro} found={p.found}
        />
      ))}
    </div>
  )
})

/**
 * The remedy pane's horizontal scrollbar (main grid): arrow buttons step one remedy column, the track pages,
 * the thumb drags. Drawn, not native, so it always shows (as in RadarOpus) and never runs under the symptom
 * pane. It only mirrors the grid's scrollLeft; the keyboard scrolls the grid itself (arrows, Home, End).
 */
function RemedyScrollbar({ grid, col, label, nc, dragging, onRelease }: {
  grid: React.RefObject<HTMLDivElement | null>; col: number; label: number; nc: number
  /** True while the thumb is held (the grid does not snap to columns meanwhile). */
  dragging: React.RefObject<boolean>
  /** After a drag or a click: the grid snaps to whole columns. */
  onRelease: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)
  const geom = useCallback(() => {
    const el = grid.current, tr = track.current
    if (!el || !tr) return null
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    const view = Math.max(1, el.clientWidth - label)
    const tw = tr.clientWidth
    const w = Math.min(tw, THUMB_W)
    return { el, max, view, tw, w }
  }, [grid, label])
  const update = useCallback(() => {
    const g = geom(), t = thumb.current
    if (!g || !t) return
    t.style.width = `${g.w}px`
    t.style.transform = `translateX(${g.max > 0 ? ((g.tw - g.w) * g.el.scrollLeft) / g.max : 0}px)`
  }, [geom])
  useLayoutEffect(() => {
    const el = grid.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (track.current) ro.observe(track.current)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [grid, update])
  useLayoutEffect(update, [update, nc, col])
  const by = (dx: number) => { const el = grid.current; if (el) el.scrollLeft += dx }
  // a held arrow or track keeps scrolling (after a short delay), like a native scrollbar
  const repeat = (e: React.PointerEvent, step: () => void) => {
    if (e.button !== 0) return
    e.preventDefault()
    step()
    let timer = setTimeout(function tick() { step(); timer = setTimeout(tick, 60) }, 350)
    const stop = () => { clearTimeout(timer); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); onRelease() }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
  const onThumb = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geom()
    if (!g || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX, s0 = g.el.scrollLeft, k = g.max / Math.max(1, g.tw - g.w)
    dragging.current = true
    const move = (m: PointerEvent) => { g.el.scrollLeft = s0 + (m.clientX - x0) * k }
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      onRelease()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const onTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = geom(), t = thumb.current
    if (!g || !t || e.target !== e.currentTarget) return
    const right = e.clientX > t.getBoundingClientRect().left
    repeat(e, () => {
      const r = t.getBoundingClientRect()
      if (right ? e.clientX > r.right : e.clientX < r.left) by((right ? 1 : -1) * Math.max(col, g.view - col))
    })
  }
  return (
    <div className="an-hbar" aria-hidden="true" data-testid="analysis-hscroll">
      <button type="button" className="an-hbar-btn left" tabIndex={-1} title="Previous remedy" onPointerDown={e => repeat(e, () => by(-col))} />
      <div ref={track} className="an-hbar-track" onPointerDown={onTrack}>
        <div ref={thumb} className="an-hbar-thumb" onPointerDown={onThumb} />
      </div>
      <button type="button" className="an-hbar-btn right" tabIndex={-1} title="Next remedy" onPointerDown={e => repeat(e, () => by(col))} />
    </div>
  )
}

/**
 * Remedy × symptom grid: rows are symptoms, columns ranked remedies. Both axes are virtualised
 * (absolute cells; only the visible block range plus the focused row and column render), headers
 * stick to the top and the symptom labels to the left. ARIA grid with a roving focus cell;
 * r = -1 is the header row, c = -1 the label column.
 */
export const AnalysisGrid = memo(function AnalysisGrid(p: GridProps) {
  const { result, rows, catalog } = p
  const ro = !p.compact
  const pair = !!rows[0] && formatScore(result.strategy, rows[0]).includes('/')
  const base = useMemo(() => (p.compact ? SIZES.compact : { ...SIZES.normal, head: ABBREV_H + SCORE_ROW * (pair ? 3 : 2) + HEAD_RULE }), [p.compact, pair])
  const lines = useMemo(() => gridLines(result.symptoms, ro, p.collapsed, p.expanded), [result.symptoms, ro, p.collapsed, p.expanded])
  const nr = lines.length
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
  const labelFor = useCallback((w: number) => (p.symptomsOnly && w ? Math.max(base.label, w) : p.compact
    ? gridLabelWidth(w, nc, { base: base.label, col: base.col, min: base.label, max: base.label })
    // the RadarOpus symptom pane keeps its width; only narrow windows shrink it
    : (w ? Math.round(Math.max(LABEL_MIN, Math.min(base.label, w - MIN_COLS * base.col))) : base.label)), [p.compact, p.symptomsOnly, nc, base])
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
  /*
   * Main grid: the horizontal scrollbar runs under the remedy pane only (RadarOpus), not under the symptoms.
   * The grid hides its own horizontal scrollbar; RemedyScrollbar below draws one over the remedy columns,
   * and sideways wheel / trackpad movement over the grid scrolls it.
   */
  const barDriven = useRef(false)
  /* keyboard moves and jumps scroll exactly to their column: snapping them would cut that column again */
  const keyScrolled = useRef(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!ro || !el) return
    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0)
      if (!dx || (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY))) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      e.preventDefault()
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + dx * (e.deltaMode === 1 ? 16 : 1)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ro])
  const snap = useCallback(() => {
    const el = scrollRef.current
    if (!el || barDriven.current || performance.now() - keyScrolled.current < 400) return
    const x = el.scrollLeft, max = el.scrollWidth - el.clientWidth
    const r = x % colW
    if (r < 0.5 || colW - r < 0.5 || x >= max - 0.5) return
    const still = document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: Math.min(max, Math.round(x / colW) * colW), behavior: still ? 'instant' : 'smooth' })
  }, [colW])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scrollend', snap)
    return () => el.removeEventListener('scrollend', snap)
  }, [snap])
  // the first symptom (not its clipboard's header bar) holds the focus at first
  const [active, setActive] = useState<{ r: number; c: number }>(() => ({ r: lines[0]?.kind === 'clip' && lines.length > 1 ? 1 : 0, c: 0 }))
  const focusWithin = useRef(false)
  /**
   * The grid carries the class "an-keyed" once a key has moved or acted inside it: only then is the focused cell outlined
   * (RadarOpus draws no ring on opening). Set on the element directly: a re-render here would disturb the key's own scrolling.
   */
  const setKbd = (on: boolean) => scrollRef.current?.classList.toggle('an-keyed', on)
  // Tab / Shift+Tab into the grid is keyboard entry too: the ring shows at once (F8 and a click still show none)
  const tabAt = useRef(-Infinity)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab') tabAt.current = performance.now() }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  /*
   * Hiding the tab (React Activity, display:none) fires no blur, so the ring would come back on the next F8:
   * hidden mode runs this cleanup, which drops the ring state as leaving by blur would.
   */
  useEffect(() => {
    const el = scrollRef.current
    return () => { el?.classList.remove('an-keyed') }
  }, [])
  const cm = useContextMenu()
  /** The ring was showing when focus left for a context menu: it shows again when the menu hands focus back. */
  const keyedAtMenu = useRef(false)
  const fromMenu = (t: EventTarget | null) => !!(t instanceof Element && t.closest('.menu-list'))

  const r0 = Math.min(Math.max(-1, active.r), nr - 1)
  const c0 = Math.min(Math.max(-1, active.c), nc - 1)
  // a clipboard header or detail line has no remedy cells: the focus sits on its label (and keeps its column for the next move)
  const fc = lines[r0]?.kind === 'sym' || !lines[r0] ? c0 : -1

  // Edit › Copy acts on the item under the cursor (main grid only; the dock has no Edit menu target)
  const cursorItem = useRef<() => CopyItem | null>(() => null)
  cursorItem.current = () => {
    const remedyItem = (row: AnalysisRow | undefined): CopyItem | null => {
      if (!row) return null
      const m = catalog.remedy(row.remedyId)
      return { full: `${m.name} (${columnAbbrev(m.abbrev)})`, text: null, what: `Copied ${m.name}` }
    }
    const symText = (i: number) => paneLabel(catalog, result.symptoms[i])
    const symFull = (i: number) => rubricPlainText(symText(i), rows.filter(x => x.grades[i] > 0).map(x => ({ abbrev: catalog.remedy(x.remedyId).abbrev, grade: x.grades[i] })))
    if (r0 === -1) return c0 >= 0 ? remedyItem(rows[c0]) : null
    const line = lines[r0]
    if (!line) return null
    if (line.kind === 'clip') {
      const ii = result.symptoms.flatMap((x, i) => (x.clipboardId === line.clipboardId ? [i] : []))
      const name = p.clipboardInfo?.(line.clipboardId).name ?? 'Clipboard'
      return { full: [name, ...ii.map(symFull)].join('\n'), text: ii.map(symText).join('\n'), what: `Copied ${name}` }
    }
    if (line.kind === 'info') return { full: paneDetail(catalog, result.symptoms[line.i]), text: symText(line.i), what: 'Copied symptom details' }
    if (fc >= 0) {
      const it = remedyItem(rows[fc])
      return it && { ...it, text: symText(line.i) }
    }
    const n = rows.filter(x => x.grades[line.i] > 0).length
    return { full: symFull(line.i), text: symText(line.i), what: `Copied symptom with ${n} remed${n === 1 ? 'y' : 'ies'}` }
  }
  useEffect(() => {
    if (!ro) return
    return setCopyCursor(() => scrollRef.current, () => cursorItem.current())
  }, [ro])

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

  /*
   * The main grid leaves room after the last column for its rotated abbreviation, rounded up so the
   * furthest scroll position is a whole number of columns (the first visible column is never cut).
   */
  const view = Math.max(0, vp.width - S.label)
  const over = nc * S.col + ABBREV_PAD - view
  const width = p.symptomsOnly ? S.label : S.label + nc * S.col + (ro ? ABBREV_PAD + (view > 0 && over > 0 ? (S.col - (over % S.col)) % S.col : 0) : 0)
  const height = S.head + nr * S.row

  const selCol = p.selectedRemedy != null ? rows.findIndex(r => r.remedyId === p.selectedRemedy) : -1
  const selRow = selCol >= 0 ? rows[selCol] : null
  const symSel = p.selectedSymptom
  /** Symptom index of a line, or null for a clipboard header. */
  const symOf = (r: number): number | null => { const l = lines[r]; return l?.kind === 'sym' ? l.i : null }

  const ensureVisible = useCallback((r: number, c: number) => {
    const el = scrollRef.current
    if (!el) return
    keyScrolled.current = performance.now()
    if (c >= 0) {
      const x = c * S.col
      const view = el.clientWidth - S.label
      if (x < el.scrollLeft) el.scrollLeft = x
      // whole columns: the first visible column is never cut by the symptom pane
      else if (x + S.col > el.scrollLeft + view) el.scrollLeft = Math.ceil((x + S.col - view) / S.col) * S.col
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
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-cell="${r0}:${fc}"]`)
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  })

  useEffect(() => {
    if (!p.reveal) return
    const c = rows.findIndex(r => r.remedyId === p.reveal!.remedyId)
    if (c < 0) return
    setActive({ r: -1, c })
    focusWithin.current = true
    const el = scrollRef.current
    keyScrolled.current = performance.now()
    if (el) el.scrollLeft = Math.max(0, Math.round((c * S.col - (el.clientWidth - S.label) / 2 + S.col / 2) / S.col) * S.col)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reveal?.nonce])

  // the first remedy matching the search field comes into view (focus stays in the field)
  useEffect(() => {
    if (!p.found?.size) return
    const c = rows.findIndex(r => p.found!.has(r.remedyId))
    const el = scrollRef.current
    if (c < 0 || !el) return
    const x = c * S.col, view = el.clientWidth - S.label
    keyScrolled.current = performance.now()
    if (x < el.scrollLeft || x + S.col > el.scrollLeft + view) el.scrollLeft = Math.max(0, Math.round((x - view / 2 + S.col / 2) / S.col) * S.col)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.found])

  const move = (r: number, c: number) => {
    const nr2 = Math.max(-1, Math.min(nr - 1, r))
    const nc2 = Math.max(-1, Math.min(nc - 1, c))
    setActive({ r: nr2, c: nc2 })
    ensureVisible(nr2, nc2)
  }

  /** toggle: click / Space (a second press closes); select: Enter (always shows the remedy); open: Shift+Enter / double click. */
  const activate = (r: number, c: number, how: 'toggle' | 'select' | 'open' = 'toggle') => {
    const line = lines[r]
    if (line?.kind === 'clip') { p.onToggleClipboard?.(line.clipboardId); return }
    if (line?.kind === 'info') { p.onToggleSymptom?.(result.symptoms[line.i].symptom.id); return }
    const i = symOf(r)
    if (c >= 0) {
      const id = rows[c].remedyId
      if (how === 'open' && p.onOpenRemedy) p.onOpenRemedy(id)
      else if (how === 'toggle') p.onSelectRemedy(p.selectedRemedy === id && r < 0 ? null : id)
      else p.onSelectRemedy(id)
    } else if (i !== null) {
      if (how === 'open' && p.onOpenSymptom) p.onOpenSymptom(i)
      else if (how === 'toggle') p.onSelectSymptom(symSel === i ? null : i)
      else p.onSelectSymptom(i)
    }
  }

  const menuFor = (r: number, c: number): MenuItem[] | null => {
    const line = lines[r]
    if (line?.kind === 'clip') {
      const id = line.clipboardId
      return [
        { label: line.collapsed ? 'Show its symptoms' : 'Hide its symptoms', run: () => p.onToggleClipboard?.(id) },
        ...(p.onRemoveClipboard ? [{ label: 'Remove from the analysis', run: () => p.onRemoveClipboard!(id) } as MenuItem] : []),
      ]
    }
    if (line?.kind === 'info') return p.onToggleSymptom ? [{ label: 'Hide details', run: () => p.onToggleSymptom!(result.symptoms[line.i].symptom.id) }] : null
    if (c >= 0 && p.remedyMenu) return p.remedyMenu(rows[c])
    const i = symOf(r)
    if (c < 0 && i !== null) {
      const id = result.symptoms[i].symptom.id
      const details: MenuItem[] = ro && p.onToggleSymptom ? [{ label: p.expanded?.has(id) ? 'Hide details' : 'Show details', run: () => p.onToggleSymptom!(id) }] : []
      const w = result.symptoms[i].symptom.weight
      const edit: MenuItem[] = [
        ...(p.onSetWeight ? [{
          label: 'Intensity', submenu: ([0, 1, 2, 3, 4] as const).map((k): MenuItem => ({ label: k === 0 ? '0 (ignore)' : String(k), keys: String(k), checked: w === k, run: () => p.onSetWeight!(i, k) })),
        } as MenuItem] : []),
        ...(p.onRemoveSymptom ? [{ label: 'Remove symptom', keys: 'Del', danger: true, run: () => p.onRemoveSymptom!(i) } as MenuItem] : []),
      ]
      const rest = p.symptomMenu?.(i) ?? []
      const groups = [details, edit, rest].filter(g => g.length)
      return groups.length ? groups.flatMap((g, k) => (k ? [{ type: 'separator' } as const, ...g] : g)) : null
    }
    return null
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // keys typed in an open context menu are the menu's alone (it is rendered outside the grid; this guards any other portal)
    if (!e.currentTarget.contains(e.target as Node)) return
    const page = Math.max(1, Math.floor(((scrollRef.current?.clientHeight ?? 300) - S.head) / S.row) - 1)
    const mod = e.ctrlKey || e.metaKey
    let handled = true
    switch (e.key) {
      case 'ArrowDown': move(r0 + 1, c0); break
      case 'ArrowUp': move(r0 - 1, c0); break
      case 'ArrowRight': move(r0, c0 + 1); break
      case 'ArrowLeft': move(r0, c0 - 1); break
      case 'Home':
        move(mod ? -1 : r0, -1)
        // the label column is always in view: Home also brings the first remedy columns back
        if (scrollRef.current) { keyScrolled.current = performance.now(); scrollRef.current.scrollLeft = 0 }
        break
      case 'End':
        move(mod ? nr - 1 : r0, nc - 1)
        // the main grid scrolls to its end, so the last column's leaning abbreviation shows in full
        if (ro && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
        break
      case 'PageDown': move(r0 + page, c0); break
      // from a line, PageUp stops at the first line; only from there does it reach the column headers
      case 'PageUp': move(r0 > 0 ? Math.max(0, r0 - page) : r0 - page, c0); break
      case 'Enter': activate(r0, fc, e.shiftKey ? 'open' : 'select'); break
      case '0': case '1': case '2': case '3': case '4': {
        // a symptom line (its label or any of its cells): the digit sets the symptom's intensity
        const i = symOf(r0)
        if (i === null || !p.onSetWeight || mod || e.altKey) { handled = false; break }
        p.onSetWeight(i, Number(e.key) as 0 | 1 | 2 | 3 | 4)
        break
      }
      case 'Delete': case 'Backspace': {
        const i = symOf(r0)
        if (i === null || fc !== -1 || !p.onRemoveSymptom || mod) { handled = false; break }
        p.onRemoveSymptom(i)
        break
      }
      case ' ': activate(r0, fc); break
      case 'Escape':
        if (p.selectedRemedy != null || symSel != null) { p.onSelectRemedy(null); p.onSelectSymptom(null) } else handled = false
        break
      case 'F10':
      case 'ContextMenu': {
        if (e.key === 'F10' && !e.shiftKey) { handled = false; break }
        const items = menuFor(r0, fc)
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-cell="${r0}:${fc}"]`)
        if (items && el) cm.openAt(el, items)
        break
      }
      default: handled = false
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); setKbd(true) }
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
    <div className={`an-grid-wrap${p.compact ? ' compact' : ' ro'}`}>
      <div
        ref={scrollRef}
        className={`an-grid${p.compact ? ' compact' : ' ro'}`}
        role="grid"
        aria-label={p.label ?? 'Analysis grid'}
        aria-rowcount={nr + 1}
        aria-colcount={nc + 1}
        style={{ ['--an-label' as string]: `${S.label}px`, ['--an-col' as string]: `${S.col}px`, ['--an-head' as string]: `${S.head}px`, ['--an-row' as string]: `${S.row}px` }}
        onKeyDown={onKeyDown}
        onFocus={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (performance.now() - tabAt.current < 500 || (keyedAtMenu.current && fromMenu(e.relatedTarget))) setKbd(true)
            keyedAtMenu.current = false
          }
          focusWithin.current = true
          // focus placed from outside (a test, assistive technology, the view's focus hand-off) moves the cursor with it
          const at = cellAt(e)
          if (at && (at.r !== r0 || at.c !== fc)) setActive(lines[at.r] && lines[at.r].kind !== 'sym' ? { r: at.r, c: c0 } : at)
        }}
        onBlur={e => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          keyedAtMenu.current = fromMenu(e.relatedTarget) && e.currentTarget.classList.contains('an-keyed')
          focusWithin.current = false
          setKbd(false)
        }}
        onMouseEnter={() => { boxRect.current = null }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseDown={e => { const at = cellAt(e); if (at) setActive(at); setKbd(false) }}
        onClick={e => {
          const at = cellAt(e)
          if (!at) return
          // the symptom's disclosure triangle opens or closes its detail line
          const line = lines[at.r]
          if (line?.kind === 'sym' && (e.target as HTMLElement).closest('[data-disc]')) { p.onToggleSymptom?.(result.symptoms[line.i].symptom.id); return }
          activate(at.r, at.c)
        }}
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
            activeC={r0 === -1 ? c0 : null} ro={ro} found={p.found}
          />
          {rowIdx.map(r => {
            const line: GridLine = lines[r]
            if (line.kind === 'clip') {
              const info = p.clipboardInfo?.(line.clipboardId) ?? { name: 'Clipboard', n: 0 }
              return (
                <ClipRow
                  key={`cb:${line.clipboardId}`} r={r} id={line.clipboardId} name={info.name} n={info.n} count={line.count} collapsed={line.collapsed}
                  top={S.head + r * S.row} width={width} focusable={r0 === r} onToggle={p.onToggleClipboard} onRemove={p.onRemoveClipboard}
                />
              )
            }
            const i = line.i
            const s = result.symptoms[i]
            if (line.kind === 'info') {
              return <InfoRow key={`info:${s.symptom.id}`} r={r} text={paneDetail(catalog, s)} top={S.head + r * S.row} width={width} focusable={r0 === r} />
            }
            return (
              <GridRow
                key={s.symptom.id} s={s} i={i} r={r} rows={rows} spans={spans} catalog={catalog} color={p.clipboardColor(s.clipboardId)}
                label={S.label} col={S.col} top={S.head + r * S.row} width={width}
                selected={symSel === i} miss={!!selRow && s.role === 'scored' && !selRow.grades[i]}
                activeC={r0 === r ? c0 : null} selectedSymptom={symSel} highlight={p.highlight} pinned={p.pinned} n={ro ? line.n : undefined}
                text={ro ? paneLabel(catalog, s) : undefined} open={ro ? !!p.expanded?.has(s.symptom.id) : undefined}
              />
            )
          })}
          {selCol >= 0 && <div className="an-selband" style={{ transform: `translateX(${S.label + selCol * S.col}px)` }} aria-hidden="true" />}
          <div ref={colBand} className="an-xh an-xh-col" aria-hidden="true" />
          <div ref={rowBand} className="an-xh an-xh-row" aria-hidden="true" />
        </div>
      </div>
      {/* outside the grid element: the menu's keys, focus and clicks must not reach the grid's handlers */}
      {cm.element}
      {ro && !p.symptomsOnly && (
        <div className="an-hbar-row" style={{ ['--an-label' as string]: `${S.label}px`, paddingRight: vp.sbw }}>
          <div className="an-hbar-pad" aria-hidden="true" />
          <RemedyScrollbar grid={scrollRef} col={S.col} label={S.label} nc={nc} dragging={barDriven} onRelease={snap} />
        </div>
      )}
      {!ro && vp.canRight && <div className="an-grid-fade" style={{ right: vp.sbw, height: vp.height }} aria-hidden="true" />}
      {!ro && vp.hiddenRight > 0 && (
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
