import { memo, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { Bookmark, Ellipsis, History, StickyNote, TriangleAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import { actions, selectActiveConsultation, useApp } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { formatKeys, runCommand } from '../../commands/registry'
import { RUBRIC_MIME } from '../clipboard/logic'
import { ChapterIcon } from '../toc/chapterIcons'
import { useColumnBook, useColumnWindow } from './columns'
import type { ColumnBook } from './columns'
import { crumbCollapseOrder, crumbFoldCount, crumbSegments, rubricLabel, rubricName, seeTarget, splitSee } from './logic'
import { matchChapters } from './take'
import { TakeBar, replayKey } from './TakeBar'
import { clipboardMembership, openFind, openRepertory, recentOf, recordRecent, remedyMenuItems, rubricMenu, takeRefs } from './ops'
import { selectRubric, useBookKeys } from './useBookKeys'
import { BOOK, NEAR_ROWS, estimateRow, layoutSizes, lineIndent, lineTrim, remedyChars } from './estimate'
import type { EstimateParams } from './estimate'
import { remedyMarkup } from './remedies'
import { onRemedyMenuRequest, setHighlight, useHighlight } from './highlight'
import { onRevealTop, takeRevealTop } from './revealTop'
import { VScrollBar } from './VScrollBar'
import { BinocularsIcon, ClipboardIcon, GearsIcon, GlobeIcon, HelpIcon, JarIcon, JarPlusIcon, MenuTriangle, PagePlusIcon, PersonIcon, PieIcon, TagsIcon } from './bookIcons'
import type { BookIconProps } from './bookIcons'
import { useOpenChapterRems } from './chapterRems'
import './repertory.css'
import './book.css'

/** Focus follows a pointer activation of the tab: a click on a book's tab puts focus in its rubric list. */
let lastPointerDown = 0
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { lastPointerDown = performance.now() }, true)

/** Memoised on the tab object: the tab host re-rendering (switching documents) leaves an unchanged book alone. */
export const RepertoryView = memo(function RepertoryView({ tab }: { tab: RepertoryTab }) {
  // a retry remounts the loader, which starts a fresh load (a failed load is not cached)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(x => x + 1), [])
  return <BookLoader key={attempt} tab={tab} onRetry={retry} />
})

function BookLoader({ tab, onRetry }: { tab: RepertoryTab; onRetry: () => void }) {
  const { rep, error } = useRepertory(tab.repertory)
  const catalog = useCatalog()
  const title = catalog.repertoryInfos.find(r => r.abbrev === tab.repertory)?.title ?? tab.repertory
  const retryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (error && !useApp.getState().dialog) retryRef.current?.focus({ preventScroll: true }) }, [error])
  if (error) {
    return (
      <div className="error-state rv-error" role="alert">
        <h3><TriangleAlert size={15} /> Could not open {title}</h3>
        <pre>{error.message}</pre>
        <button ref={retryRef} className="btn" onClick={onRetry}>Retry</button>
      </div>
    )
  }
  if (!rep) return <BookSkeleton title={title} />
  return <BookView tab={tab} rep={rep} />
}

function BookSkeleton({ title }: { title: string }) {
  return (
    <div className="rv rv-loading" role="status" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="rv-tools"><span className="rv-loading-label">Loading {title}…</span></div>
      <div className="rv-skel">
        {Array.from({ length: 14 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${40 + ((i * 37) % 55)}%`, marginLeft: (i % 4) * 16 }} />)}
      </div>
    </div>
  )
}

type Clip = { n: number; color: string; name: string }

/** Level marker before a sub-rubric, as printed: "-" for level 2, "." for 3, ".." for 4 and so on. */
export function levelPrefix(depth: number): string {
  return depth <= 1 ? '' : depth === 2 ? '-' : '.'.repeat(depth - 2)
}

interface RowProps {
  rep: Repertory
  catalog: Catalog
  i: number
  /** Rubrics in the book (aria-setsize). */
  setSize: number
  current: boolean
  showRemedies: boolean
  names: boolean
  minGrade: number
  /** Print the "(n)" remedy count after the rubric name. */
  counts: boolean
  /** A chapter heading: its own remedies are unfolded under the band. */
  chOpen: boolean
  /** Print the note under the rubric (the gutter marks it either way). */
  showNote: boolean
  clips: Clip[] | undefined
  bookmarked: boolean
  note: string | undefined
  measure: (el: HTMLElement | null) => (() => void) | undefined
  /** Chapter picture size (px): it grows with the zoom, as RadarOpus's does. */
  pic: number
  /** The part of a rubric that runs over from column 1 into column 2: presentational. */
  cont?: boolean
}

/**
 * One rubric block of the book: a chapter heading (icon and name), or a rubric line in book
 * typography: level-1 names bold blue capitals, sub-levels indented with "-", ".", ".." markers,
 * ":" and the "(n)" remedy count, then the remedies flowing on (grade by colour, italics, bold and
 * capitals), wrapped lines hanging at the rubric's own indent (its level marker). Blocks are whole lines of the book line
 * height, so a column can break between lines. The remedy list is cached static markup.
 */
const RubricRow = memo(function RubricRow({ rep, catalog, i, setSize, current, showRemedies, names, minGrade, counts, chOpen, showNote, clips, bookmarked, note, measure, pic, cont }: RowProps) {
  const depth = rep.depth(i)
  const total = rep.remedyCount(i)
  const see = depth > 0 ? splitSee(rep.text(i)) : null
  // a reference whose target the data does not hold is printed plain grey: it cannot be followed
  const deadSee = !!see && seeTarget(rep, i) < 0
  const list = total && (showRemedies || minGrade > 1) ? remedyMarkup(rep, catalog, i, names, minGrade) : null
  const hidden = list ? total - list.shown : 0
  const cls = `rv-blk ${cont ? 'rv-cont' : 'rv-row'} rv-d${Math.min(depth, 5)}${depth === 0 ? ' rv-chapter' : depth === 1 ? ' rv-main' : ''}${current ? ' rv-current' : ''}`
  const chips = clips?.map(c => <span key={c.n} className="rv-clip" style={{ ['--chip' as string]: c.color }} title={`Taken into clipboard ${c.n}: ${c.name}`}>{c.n}</span>)
  const a11y = cont
    ? { 'aria-hidden': true as const }
    : {
        role: 'option', id: `rv-r${i}`, 'aria-selected': current, 'aria-posinset': i + 1, 'aria-setsize': setSize, draggable: true,
        // the accessible name is short: arrowing through the book reads the rubric, not its remedy list
        'aria-label': rubricLabel(rep.lineage(i).map(r => rubricName(rep.text(r))), total, { clipboards: clips?.map(c => c.n), bookmarked, note: !!note }),
      }
  // built only for the rows rendered as elements (chapter headings, lines with clipboard chips)
  const remedies = (withCount = true) => (
    <>
      {withCount && total > 0 && counts && <>{' '}<span className="rv-count" title={`${total} remedies`}>({total})</span></>}
      {showRemedies && list && list.shown > 0 && <>{' '}<span className={`rv-rems${names ? ' rv-names' : ''}`} dangerouslySetInnerHTML={{ __html: list.html }} /></>}
      {hidden > 0 && <span className="rv-hidden" title={`${hidden} remedies below grade ${minGrade} hidden`}>+{hidden}</span>}
    </>
  )
  // the common row (no marks, not selected) as one element of static markup: scrolling mounts many
  // rows a frame, and each React element costs (most of all in development)
  if (depth > 0 && !chips?.length && !note && (cont || (!current && !bookmarked))) {
    const ind = lineIndent(depth)
    const pad = depth > 1 ? ` style="padding-left:${zpx(ind.pad)}${ind.first ? `;text-indent:${zpx(ind.first)}` : ''}"` : ''
    const html = `<div class="rv-line"${pad}>${lineMarkup(rep.text(i), depth, total, showRemedies ? list : null, names, hidden, minGrade, deadSee, counts)}</div>`
    return <div key="f" ref={measure} className={cls} data-vindex={i} data-rubric={i} {...a11y} dangerouslySetInnerHTML={{ __html: html }} />
  }
  return (
    <div key="s" ref={measure} className={cls} data-vindex={i} data-rubric={i} {...a11y}>
      {!cont && (
        <span className="rv-gutter" aria-hidden="true">
          {current && <HandMark />}
          {bookmarked && <Bookmark className="rv-mark-bm" size={10} />}
          {note && <StickyNote className="rv-mark-note" size={10} />}
        </span>
      )}
      {depth === 0 ? (
        <>
          <div className="rv-chhead">
            <ChapterIcon name={rep.text(i)} size={pic} className="rv-chicon" />
            {chips}<span className="rv-text">{rep.text(i)}</span>
          </div>
          {/* RadarOpus prints only the picture and the name at chapter level: a heading's own remedies
              (OOREP data) stay folded away, shown on demand from the context menu or its Remedies submenu */}
          {total > 0 && chOpen && <div className="rv-line rv-chline">{remedies()}</div>}
        </>
      ) : !chips?.length ? (
        // the common case as one string of markup: a few elements per row instead of a dozen keeps
        // mounting rows cheap while the book scrolls (rows move between the columns as it does)
        <div
          key="h" className="rv-line" style={depth > 1 ? lineStyle(depth) : undefined}
          dangerouslySetInnerHTML={{ __html: lineMarkup(rep.text(i), depth, total, showRemedies ? list : null, names, hidden, minGrade, deadSee, counts) }}
        />
      ) : (
        <div key="j" className="rv-line" style={depth > 1 ? lineStyle(depth) : undefined}>
          {chips}
          {depth > 1 && <span className="rv-pre">{levelPrefix(depth)} </span>}
          <span className="rv-text">{see ? see.name : rep.text(i)}</span>{total > 0 && <span className="rv-colon">:</span>}
          {see && <>{' '}<span className={`rv-see${deadSee ? ' rv-see-dead' : ''}`} title={deadSee ? DEAD_SEE : see.target}>{see.see}</span></>}
          {remedies()}
        </div>
      )}
      {note && showNote && <div className="rv-note">{note}</div>}
    </div>
  )
})

/** Inline indent of a rubric line (see lineIndent). */
function lineStyle(depth: number) {
  const ind = lineIndent(depth)
  return ind.first ? { paddingLeft: zpx(ind.pad), textIndent: zpx(ind.first) } : { paddingLeft: zpx(ind.pad) }
}

/** The chapter heading's picture: 55 px (RadarOpus's 52 pt tile at the reference 1470x895 frame), and
 * RadarOpus barely grows it with the zoom (one px a step) while the text and insets scale fully. */
const chapterPic = (zoom: number) => Math.round(55 * (1 + (zoom - 1) * 0.25))
/** A book inset (px at zoom 1) scaled with the zoom: insets and indents grow with the text (--rb-z). */
const zpx = (px: number) => `calc(${px}px * var(--rb-z, 1))`

/** Tooltip of a "(see …)" reference that cannot be followed. */
export const DEAD_SEE = 'Reference target not in this repertory'

const escHtml = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A rubric line as markup (the same elements RubricRow renders for a line with clipboard chips). */
function lineMarkup(text: string, depth: number, total: number, list: { html: string; shown: number } | null, names: boolean, hidden: number, minGrade: number, deadSee = false, counts = true): string {
  let h = depth > 1 ? `<span class="rv-pre">${levelPrefix(depth)} </span>` : ''
  const see = splitSee(text)
  h += `<span class="rv-text">${escHtml(see ? see.name : text)}</span>`
  if (total > 0) h += '<span class="rv-colon">:</span>'
  // a "(see …)" reference follows the name (and its colon), as RadarOpus prints "ABANDONED (See ... )"
  if (see) h += deadSee ? ` <span class="rv-see rv-see-dead" title="${DEAD_SEE}">${escHtml(see.see)}</span>` : ` <span class="rv-see" title="${escHtml(see.target)}">${escHtml(see.see)}</span>`
  if (total > 0 && counts) h += ` <span class="rv-count" title="${total} remedies">(${total})</span>`
  if (list && list.shown > 0) h += ` <span class="rv-rems${names ? ' rv-names' : ''}">${list.html}</span>`
  if (hidden > 0) h += `<span class="rv-hidden" title="${hidden} remedies below grade ${minGrade} hidden">+${hidden}</span>`
  return h
}

/** Selection marker in the gutter: a cuffed hand pointing right at the selected rubric (original drawing). */
function HandMark() {
  return (
    <svg className="rv-hand" width="30" height="16" viewBox="0 0 26 14" aria-hidden="true">
      <rect className="rv-hand-cuff" x="0.5" y="2.5" width="5" height="9.5" rx="1" />
      <path
        className="rv-hand-palm"
        d="M5.5 3.5 C7.5 2.6 9.5 2.5 12 2.5 H23.6 a1.65 1.65 0 0 1 0 3.3 H14.5 c0.9 0.4 1.2 1 1.2 1.6 c0 0.9 -0.6 1.5 -1.5 1.6 c0.6 0.4 0.8 0.9 0.6 1.5 c-0.2 0.7 -0.8 1 -1.5 1.1 c0.3 0.3 0.4 0.7 0.2 1.1 c-0.2 0.5 -0.7 0.7 -1.3 0.7 H8.5 C7.2 13.4 6.2 12.9 5.5 12 Z"
      />
      <path className="rv-hand-fold" d="M11.8 7.4 H14.2 M11.6 9.6 H13.6" />
    </svg>
  )
}

interface TipState { x: number; y: number; id: number; grade: number }
interface TipApi { set: (t: TipState | null) => void }

/** Remedy tooltip over the book: owns its state so hover never re-renders the view or its rows. */
function RemedyTip({ ref, catalog }: { ref: React.Ref<TipApi>; catalog: Catalog }) {
  const [tip, setTip] = useState<TipState | null>(null)
  useImperativeHandle(ref, () => ({
    set: t => setTip(prev => (prev === t || (prev && t && prev.id === t.id && Math.abs(prev.y - t.y) < 1 && Math.abs(prev.x - t.x) < 1) ? prev : t)),
  }), [])
  if (!tip) return null
  const rem = catalog.remedy(tip.id)
  return (
    <div className="rv-tip" role="tooltip" style={{ left: tip.x, top: tip.y + 4 }}>
      <b>{rem.name}</b>
      <span>{rem.abbrev} · <span className={`g${tip.grade}`}>{GRADE_LABEL[tip.grade]}</span></span>
      <span className="rv-tip-hint">Double-click to open</span>
    </div>
  )
}

interface BookColumnsProps {
  book: ColumnBook
  rep: Repertory
  catalog: Catalog
  rubric: number
  showRemedies: boolean
  names: boolean
  minGrade: number
  counts: boolean
  openCh: ReadonlySet<string>
  showNotes: boolean
  membership: Map<string, Clip[]>
  bookmarked: Set<string>
  notes: Record<string, string>
  highlight: number | null
  pic: number
}

/** The two columns and the rule between them: re-renders alone when scrolling changes the rows shown. */
const BookColumns = memo(function BookColumns({ book, rep, catalog, rubric, showRemedies, names, minGrade, counts, openCh, showNotes, membership, bookmarked, notes, highlight, pic }: BookColumnsProps) {
  const r = useColumnWindow(book)
  // row elements are kept while their inputs hold: scrolling re-renders the columns many times, and an
  // element React has seen before is skipped without even comparing its props
  const cache = useRef<{ deps: readonly unknown[]; rubric: number; els: Map<number, ReactElement> } | null>(null)
  const deps = [rep, catalog, showRemedies, names, minGrade, counts, openCh, showNotes, membership, bookmarked, notes, book.measure, pic] as const
  let c = cache.current
  if (!c || c.els.size > 3000 || deps.some((d, k) => d !== c!.deps[k])) c = cache.current = { deps, rubric, els: new Map() }
  if (c.rubric !== rubric) {
    for (const k of [c.rubric, rubric]) { c.els.delete(k * 2); c.els.delete(k * 2 + 1) }
    c.rubric = rubric
  }
  const els = c.els
  const row = (i: number, cont: boolean) => {
    let el = els.get(i * 2 + (cont ? 1 : 0))
    if (el) return el
    const ref = rep.ref(i)
    el = (
      <RubricRow
        key={i} rep={rep} catalog={catalog} i={i} setSize={rep.size} current={i === rubric} cont={cont}
        showRemedies={showRemedies} names={names} minGrade={minGrade} counts={counts} chOpen={rep.depth(i) === 0 && openCh.has(ref)} showNote={showNotes}
        clips={membership.get(ref)} bookmarked={bookmarked.has(ref)} note={notes[ref]} measure={book.measure} pic={pic}
      />
    )
    els.set(i * 2 + (cont ? 1 : 0), el)
    return el
  }
  const col1 = [], col2 = []
  for (let i = r.start; i < r.c1End; i++) col1.push(row(i, false))
  // a rubric across the split is shown in both columns: column 2 holds its presentational continuation
  for (let i = r.c2Start; i < r.end; i++) col2.push(row(i, i < r.c1End))
  return (
    <div className="rv-cols" ref={book.refs.sticky} data-hl={highlight ?? undefined}>
      <div className="rv-col rv-col1"><div className="rv-clip1" ref={book.refs.clip}><div className="rv-colwin" ref={book.refs.win1}>{col1}</div></div></div>
      <div className="rv-rule" aria-hidden="true" />
      <div className="rv-col rv-col2"><div className="rv-colwin" ref={book.refs.win2}>{col2}</div></div>
    </div>
  )
})

/** Height the take bar overlays at the bottom of the book (one slim line), px. */
const TAKEBAR_H = 28

const GRADE_LABEL = ['', 'grade 1 (plain)', 'grade 2 (italic)', 'grade 3 (bold capitals)', 'grade 4 (bold capitals)']

/**
 * Scroll positions per tab and rubric, for Back/Forward (kept for the session): how far below the
 * top of the page the rubric stood, so a restore stays right when rows above it were re-measured.
 */
const scrollMemos = new Map<string, Map<number, number>>()
function scrollMemo(tabId: string) {
  let m = scrollMemos.get(tabId)
  if (!m) { m = new Map(); scrollMemos.set(tabId, m) }
  return m
}
function remember(m: Map<number, number>, rubric: number, top: number) {
  m.delete(rubric)
  m.set(rubric, top)
  if (m.size > 300) m.delete(m.keys().next().value!)
}

/** Whether row k starts on the page (column 1 or 2) and its first line is visible. */
function startsOnPage(book: ColumnBook, k: number): boolean {
  const o = book.getOffsets(), top = book.getTop()
  return o[k] >= top - 0.5 && k <= book.page().last
}

/** Views of the book (the Views dropdown): the rubric display modes the book supports. */
const VIEWS = [
  { value: 'full', label: 'Full repertory' },
  { value: 'names', label: 'Full repertory, remedy names' },
  { value: 'rubrics', label: 'Rubrics only' },
] as const
type ViewMode = (typeof VIEWS)[number]['value']

function BookView({ tab, rep }: { tab: RepertoryTab; rep: Repertory }) {
  const catalog = useCatalog()
  const settings = useApp(s => s.settings)
  const consultation = useApp(selectActiveConsultation)
  const bookmarks = useApp(s => s.bookmarks)
  const notes = useApp(s => s.rubricNotes)
  // notes print under their rubric unless the toggle hides them (the gutter mark stays)
  const showNotes = useApp(s => s.settings.showRubricNotes)
  const counts = useApp(s => s.settings.showRemedyCounts)
  const openCh = useOpenChapterRems()
  const info = rep.info

  const showRemedies = tab.display !== 'count'
  const names = settings.remedyStyle === 'name'
  const minGrade = settings.minGradeShown
  const rubric = Math.max(0, Math.min(rep.size - 1, tab.rubric))
  const chapterRoot = rep.chapterRoot(rubric)
  const chapterCount = rep.subtreeEndOf(chapterRoot) - chapterRoot

  const membership = useMemo(() => clipboardMembership(consultation), [consultation])
  const bookmarked = useMemo(() => new Set(bookmarks.map(b => b.ref)), [bookmarks])

  const highlight = useHighlight(tab.id)
  const [takeBar, setTakeBar] = useState<string | null>(null)
  /** The take bar overlays the bottom of the book, or its top when the rubric being taken stands under the bottom. */
  const [takeTop, setTakeTop] = useState<number | null>(null)
  const [chooser, setChooser] = useState<string | null>(null)
  // the remedy tooltip keeps its own state: hovering remedies re-renders the tooltip, not the book
  const tipRef = useRef<TipApi>(null)
  const setTip = (t: TipState | null) => tipRef.current?.set(t)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()
  // the symptom path follows the rubric deferred (a key press renders the book first) and, memoised
  // with a stable menu opener, re-renders only when the rubric does
  const crumbRubric = useDeferredValue(rubric)
  const cmRef = useRef(cm)
  useLayoutEffect(() => { cmRef.current = cm })
  /** Opens a menu at an element (toolbar buttons, folded crumbs): stable, so those stay memoised. */
  const onMenu = useCallback((el: HTMLElement, items: MenuItem[]) => cmRef.current.openAt(el, items), [])

  // book typography: Verdana 14px on 20px lines at zoom 1 (RadarOpus at 1470pt); each zoom step
  // (0.1 font scale) grows the text and its line by 1px, as RadarOpus's Zoom in does
  const fs = Math.round((14 + (settings.fontScale - 1) * 10) * 2) / 2
  const lineH = Math.round(fs + 6) + (settings.density === 'comfortable' ? 2 : 0)
  // the chapter heading band grows 5px per zoom step (RadarOpus: 76.5pt at 100%, 81.5pt one step in)
  const head = BOOK.head + Math.round(Math.max(0, fs - 14) * 5)
  // RadarOpus's Zoom in grows the whole page, not the text alone: the chapter picture, the path
  // icon, the column insets and level indents scale with the font (z = 1 at 14px)
  const zoom = fs / 14
  const rc = remedyChars(rep, catalog)
  /** Rubrics of this repertory with a note (a note adds a line to the block). */
  const noteRows = useMemo(() => {
    const out = new Set<number>()
    const prefix = `${rep.abbrev}:`
    if (showNotes) for (const ref in notes) if (ref.startsWith(prefix) && notes[ref]) out.add(Number(ref.slice(prefix.length)))
    return out
  }, [notes, rep, showNotes])
  const params: EstimateParams = { showRemedies, names, minGrade, fs, lineH, width: 0 }
  const estimate = (i: number, width: number) => {
    const p = params
    p.width = width
    const h = estimateRow(rep, rc, i, p, Math.abs(i - rubric) <= NEAR_ROWS, noteRows.has(i))
    if (rep.depth(i) !== 0) return h
    // a chapter heading's own remedies are folded away unless unfolded
    return openCh.has(rep.ref(i)) ? h - BOOK.head + head : head + (noteRows.has(i) ? lineH : 0)
  }
  const trim = lineTrim(lineH)
  // the line grid of a block starts `trim.top` above it (its first line box is pulled up)
  const headOf = useCallback((i: number) => (rep.depth(i) === 0 ? head : 0) - lineTrim(lineH).top, [rep, head, lineH])

  const contentKey = tab.repertory
  const mode = !showRemedies ? 'count' : names ? 'names' : 'abbrev'
  const resetKey = `${contentKey}:${mode}:${minGrade}:${lineH}:${fs}:${counts ? 'n' : ''}`
  const book = useColumnBook(scrollRef, rep.size, estimate, resetKey, {
    focus: rubric, contentKey, lineH, headOf, rule: 1,
    // a jump keeps a sliver of the line before the target, a chapter's heading band too (RadarOpus)
    topGap: Math.round(lineH * 0.4),
    sizesFor: wb => layoutSizes(`book:${resetKey}:${settings.density}:${wb}`, rep.size),
  })

  // keep the current rubric on the page: a jump (Find, a chapter, a reference) puts it at the top of
  // column 1, Back/Forward return to where the page was, stepping scrolls just enough
  const pos = useRef<{ rubric: number; back: number[]; forward: number[] } | null>(null)
  /** The rubric a click (or right-click) just selected: the page stays put under the pointer. */
  const pointerPick = useRef(-1)
  useLayoutEffect(() => {
    const picked = pointerPick.current
    pointerPick.current = -1
    const prev = pos.current
    pos.current = { rubric, back: tab.back, forward: tab.forward }
    const memo = scrollMemo(tab.id)
    if (!prev) {
      const d = memo.get(rubric)
      if (d != null) book.scrollToTop(book.getOffsets()[rubric] - d, rubric)
      if (d == null || !startsOnPage(book, rubric)) book.reveal(rubric, 'top')
      return
    }
    if (prev.rubric === rubric) return
    remember(memo, prev.rubric, book.getOffsets()[prev.rubric] - book.getTop())
    // a click selects, it never scrolls: a double-click's second click lands where the first did
    if (picked === rubric) { book.scrollToTop(book.getTop(), rubric); return }
    // the Navigation window's Go to always lands at the top of column 1
    if (takeRevealTop(rep.ref(rubric))) { book.reveal(rubric, 'top'); return }
    const backed = tab.forward !== prev.forward && tab.forward[0] === prev.rubric && prev.back[prev.back.length - 1] === rubric
    const forwarded = tab.back !== prev.back && prev.forward[0] === rubric && tab.forward.length === prev.forward.length - 1
    const jumped = !backed && !forwarded && tab.back !== prev.back
    const d = backed || forwarded ? memo.get(rubric) : undefined
    if (d != null) {
      book.scrollToTop(book.getOffsets()[rubric] - d, rubric)
      // the remembered page must show the rubric (the reader may have wheeled it away before leaving)
      if (!startsOnPage(book, rubric)) book.reveal(rubric, 'top')
    } else if ((backed || forwarded || jumped) && !book.isVisible(rubric)) book.reveal(rubric, 'top')
    // stepping (arrows) leaves the page alone while the rubric's first line is on it
    else book.reveal(rubric, 'step')
  }, [rubric, tab.back, tab.forward]) // eslint-disable-line react-hooks/exhaustive-deps
  // ... also when the rubric is the one already selected (no navigation happens then)
  useEffect(() => onRevealTop(ref => {
    const at = pos.current?.rubric
    if (at == null || rep.ref(at) !== ref || useApp.getState().activeTabId !== tab.id) return false
    book.reveal(at, 'top')
    return true
  }))

  // Recent list: a rubric reached by a jump is recorded at once, one the reader dwells on after a second
  const lastBack = useRef(tab.back)
  useEffect(() => {
    const jumped = lastBack.current !== tab.back
    lastBack.current = tab.back
    const ref = rep.ref(rubric)
    if (jumped) { recordRecent(ref); return }
    const t = setTimeout(() => recordRecent(ref), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubric, rep])

  // focus the book when the tab opens; a click on the tab itself (which focuses the tab once the
  // mouse button is down) also hands focus to the book
  useEffect(() => {
    // a focused document tab keeps focus (arrowing through the tab strip); the shell hands focus to the
    // book when a tab is clicked or opened by a command
    if ((document.activeElement as HTMLElement | null)?.getAttribute('role') === 'tab') return
    const focusBook = () => { if (!useApp.getState().dialog) scrollRef.current?.focus({ preventScroll: true }) }
    focusBook()
    if (performance.now() - lastPointerDown > 1000) return
    const raf = requestAnimationFrame(() => {
      if ((document.activeElement as HTMLElement | null)?.closest('[role="tablist"]')) focusBook()
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const select = (i: number, history = false) => selectRubric(tab, rep, i, history)
  const rowEl = (i: number) => scrollRef.current?.querySelector<HTMLElement>(`.rv-row[data-rubric="${i}"]`) ?? null
  const focusBook = () => scrollRef.current?.focus({ preventScroll: true })

  const onKeyDown = useBookKeys(tab, rep, book, {
    scrollRef, start: chapterRoot, count: chapterCount,
    openTakeBar: initial => {
      const row = rowEl(rubric)?.getBoundingClientRect(), box = scrollRef.current?.getBoundingClientRect()
      setTakeTop(row && box && row.top + lineH > box.bottom - TAKEBAR_H ? scrollRef.current!.offsetTop : null)
      setTakeBar(initial)
    },
    openChooser: setChooser,
    openMenu: i => { const el = rowEl(i); if (el) cm.openAt(el, rubricMenu(rep.ref(i))) },
  })

  // Alt+R: the current rubric's remedies as a menu at its row (highlight in book, open remedy)
  const openRemedyMenu = useRef(() => {})
  openRemedyMenu.current = () => {
    const el = rowEl(rubric)
    const items = remedyMenuItems(rep.ref(rubric))
    if (el && items.length) cm.openAt(el, [{ type: 'label', label: `Remedies of ${rep.text(rubric)}` }, ...items])
  }
  useEffect(() => onRemedyMenuRequest(tab.id, () => openRemedyMenu.current()), [tab.id])

  const rowOf = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest<HTMLElement>('[data-rubric]')
    return el ? Number(el.dataset.rubric) : -1
  }

  // a single click selects the rubric (on any of its lines); it never navigates
  const onClick = (e: ReactMouseEvent) => {
    const i = rowOf(e.target)
    if (i >= 0) { pointerPick.current = i; select(i) }
    focusBook()
  }
  const onDoubleClick = (e: ReactMouseEvent) => {
    const remEl = (e.target as HTMLElement).closest<HTMLElement>('.rv-rem')
    if (remEl) { window.getSelection()?.removeAllRanges(); actions.openTab({ kind: 'remedy', remedyId: Number(remEl.dataset.rid) }) }
  }
  const onContextMenu = (e: ReactMouseEvent) => {
    const i = rowOf(e.target)
    if (i < 0) return
    pointerPick.current = i
    select(i)
    cm.open(e, rubricMenu(rep.ref(i)))
  }
  // the remedy tooltip follows real pointer movement only: the browser's own mouse events when the
  // page scrolls under a still pointer (arrowing, a jump) or rows re-render there never show it
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
    const p = lastPointer.current
    if (p && p.x === e.clientX && p.y === e.clientY) return
    lastPointer.current = { x: e.clientX, y: e.clientY }
    // hover styling only follows the pointer moving: the page moving under a still pointer drops it
    const book = scrollRef.current
    if (book && !book.hasAttribute('data-pointer')) book.setAttribute('data-pointer', '')
    const remEl = (e.target as HTMLElement).closest<HTMLElement>('.rv-rem')
    if (!remEl) { setTip(null); return }
    const r = remEl.getBoundingClientRect()
    setTip({ x: r.left, y: r.bottom, id: Number(remEl.dataset.rid), grade: Number(remEl.dataset.grade) })
  }
  // a key press or the page moving hides it (it would stand over text that is no longer under it)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const hide = () => { tipRef.current?.set(null); el.removeAttribute('data-pointer') }
    el.addEventListener('scroll', hide, { passive: true })
    el.addEventListener('keydown', hide, true)
    return () => { el.removeEventListener('scroll', hide); el.removeEventListener('keydown', hide, true) }
  }, [])
  const onDragStart = (e: React.DragEvent) => {
    const i = rowOf(e.target)
    if (i < 0) return
    e.dataTransfer.setData(RUBRIC_MIME, rep.ref(i))
    e.dataTransfer.setData('text/plain', rep.path(i))
    e.dataTransfer.effectAllowed = 'copy'
    setTip(null)
  }

  const highlightCount = useMemo(() => {
    if (highlight == null) return 0
    let n = 0
    for (let i = chapterRoot; i < chapterRoot + chapterCount; i++) if (rep.gradeOf(i, highlight)) n++
    return n
  }, [highlight, chapterRoot, chapterCount, rep])

  const view: ViewMode = !showRemedies ? 'rubrics' : names ? 'names' : 'full'
  const tabId = tab.id
  const setView = useCallback((m: ViewMode) => {
    if (m === 'rubrics') actions.updateTab<RepertoryTab>(tabId, { display: 'count' })
    else { actions.updateTab<RepertoryTab>(tabId, { display: 'remedies' }); actions.setSettings({ remedyStyle: m === 'names' ? 'name' : 'abbrev' }) }
  }, [tabId])
  // a click on the sub-toolbar or the path strip leaves (or puts) focus in the book: its buttons act
  // without taking focus, so menus and dialogs they open hand it back to the book, and the keys go on working
  const keepBookFocus = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement
    if (e.button !== 0 || !t.closest('.rv-tools, .rv-path, .rv-sb') || t.closest('select, input, textarea')) return
    e.preventDefault()
    if (!scrollRef.current?.contains(document.activeElement)) focusBook()
  }
  const ref = rep.ref(rubric)
  const onGo = useCallback((i: number) => { selectRubric(tab, rep, i, true); scrollRef.current?.focus({ preventScroll: true }) }, [tab, rep])

  return (
    <div className="rv" onKeyDown={onKeyDown} onMouseDown={keepBookFocus} style={{ ['--rb-fs' as string]: `${fs}px`, ['--rb-z' as string]: zoom, ['--rb-lh' as string]: `${lineH}px`, ['--rb-head' as string]: `${head}px`, ['--rb-trim-t' as string]: `${trim.top}px`, ['--rb-trim-b' as string]: `${trim.bottom}px` }}>
      <BookTools
        view={view} onView={setView} minGrade={minGrade} onMenu={onMenu} repertory={tab.repertory}
        bookmarked={bookmarked.has(ref)} counts={counts} showNotes={showNotes} onDone={focusBook}
      />
      <Crumbs rep={rep} rubric={crumbRubric} onMenu={onMenu} onGo={onGo} icon={Math.round(26 * zoom)} />
      {highlight != null && (
        <div className="rv-hlbar" role="region" aria-label="Remedy highlight">
          <span className="rv-hl-chip">{catalog.remedy(highlight).abbrev}</span>
          <span role="status">{catalog.remedy(highlight).name} appears in <b>{highlightCount}</b> rubric{highlightCount === 1 ? '' : 's'} of {rep.text(chapterRoot)}</span>
          <span className="rv-hl-keys" aria-hidden="true"><kbd className="kbd">{formatKeys('Alt+ArrowDown')}</kbd> next <kbd className="kbd">Esc</kbd> clear</span>
          <button className="btn btn-sm btn-ghost" title={`Next rubric with ${catalog.remedy(highlight).abbrev} (${formatKeys('Alt+ArrowDown')})`} onClick={() => { runCommand('repertory.highlightNext'); focusBook() }}>Next</button>
          <button className="btn btn-sm btn-ghost" onClick={() => actions.openTab({ kind: 'remedy', remedyId: highlight })}>Open remedy</button>
          <button className="icon-btn" aria-label="Clear highlight" title="Clear highlight (Esc in the book)" onClick={() => { setHighlight(tab.id, null); focusBook() }}><X size={13} /></button>
        </div>
      )}
      <div className="rv-body">
      <div
        className="rv-scroll rv-book"
        ref={scrollRef}
        tabIndex={0}
        role="listbox"
        aria-label={`${info.title}: ${rep.text(chapterRoot)}`}
        aria-activedescendant={`rv-r${rubric}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { lastPointer.current = null; setTip(null); scrollRef.current?.removeAttribute('data-pointer') }}
        onDragStart={onDragStart}
      >
        <BookColumns
          book={book} rep={rep} catalog={catalog} rubric={rubric} highlight={highlight}
          showRemedies={showRemedies} names={names} minGrade={minGrade} counts={counts} openCh={openCh} showNotes={showNotes} membership={membership} bookmarked={bookmarked} notes={notes} pic={chapterPic(zoom)}
        />
        <div className="rv-spacer" ref={book.refs.spacer} />
        {highlight != null && <style>{`.rv-cols[data-hl="${highlight}"] .rv-rem[data-rid="${highlight}"] { background: var(--rv-hl-bg); outline: 1px solid var(--rv-hl-ring); }`}</style>}
      </div>
      <VScrollBar target={scrollRef} step={lineH * 3} deps={resetKey} extent={book.extent} className="rv-sb" />
      </div>
      {takeBar != null && (
        <TakeBar
          initial={takeBar} top={takeTop}
          path={rep.lineage(rubric).map(r => rep.text(r))}
          onClose={() => { setTakeBar(null); focusBook() }}
          onTake={o => { takeRefs([rep.ref(rubric)], o) }}
          onPass={e => { const el = scrollRef.current; if (el) replayKey(e, el) }}
        />
      )}
      <RemedyTip ref={tipRef} catalog={catalog} />
      {chooser != null && (
        <ChapterChooser
          rep={rep}
          legacyRecent={tab.recent}
          initial={chooser}
          onClose={() => { setChooser(null); focusBook() }}
          onPick={c => { setChooser(null); select(c, true); focusBook() }}
        />
      )}
      {cm.element}
    </div>
  )
}

/** A sub-toolbar button: an icon (with a ▾ when it opens a menu); `pressed` makes it a toggle. */
function ToolButton({ icon: Icon, label, title, onClick, pressed, menu, className }: {
  icon: LucideIcon | ComponentType<BookIconProps>; label: string; title?: string; onClick: (el: HTMLButtonElement) => void; pressed?: boolean; menu?: boolean; className?: string
}) {
  return (
    <button
      type="button" className={`rv-tb${menu ? ' rv-tb-menu' : ''}${pressed ? ' on' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label} title={title ?? label} aria-pressed={pressed} aria-haspopup={menu ? 'menu' : undefined}
      onClick={e => onClick(e.currentTarget)}
    >
      <Icon size={26} strokeWidth={1.4} aria-hidden="true" />
      {menu && <MenuTriangle className="rv-tb-caret" />}
    </button>
  )
}

const GRADE_VIEWS = [
  { g: 1, label: 'All grades' },
  { g: 2, label: 'Grades 2 to 4' },
  { g: 3, label: 'Grades 3 and 4' },
] as const

/**
 * The document's sub-toolbar: find, take (clipboard menu), the Views dropdown, the grade filter,
 * then toggles for the book display and the current rubric's bookmark and note, settings and help.
 * Memoised with stable callbacks: moving through the book does not rebuild it.
 */
const BookTools = memo(function BookTools({ view, onView, minGrade, onMenu, repertory, bookmarked, counts, showNotes, onDone }: {
  view: ViewMode; onView: (m: ViewMode) => void; minGrade: number; onMenu: (el: HTMLElement, items: MenuItem[]) => void; repertory: string
  bookmarked: boolean; counts: boolean; showNotes: boolean; onDone: () => void
}) {
  const take: MenuItem[] = [
    { command: 'rubric.add', label: 'Take with intensity 1 (+1)' },
    { command: 'rubric.add.w2', label: 'Take with intensity 2 (+2)' },
    { command: 'rubric.add.w3', label: 'Take with intensity 3 (+3)' },
    { command: 'rubric.add.w4', label: 'Take with intensity 4 (+4)' },
    { type: 'separator' },
    { command: 'rubric.takeOptions', label: 'Take and specify the options' },
  ]
  const grades: MenuItem[] = [
    { type: 'label', label: 'Remedies shown' },
    ...GRADE_VIEWS.map(({ g, label }) => ({ label, checked: minGrade === g, run: () => actions.setSettings({ minGradeShown: g }) })),
  ]
  const catalog = useCatalog()
  // the globe: the repertories (each in its language) to read in, the current one ticked
  const books: MenuItem[] = [
    { type: 'label', label: 'Repertory' },
    ...catalog.repertoryInfos.map(r => ({
      label: `${r.title}${r.lang ? ` (${r.lang.toUpperCase()})` : ''}`, checked: r.abbrev === repertory,
      run: () => { if (r.abbrev !== repertory) void openRepertory(r.abbrev) },
    })),
  ]
  const run = (id: string) => { runCommand(id); onDone() }
  const display: MenuItem[] = [
    { type: 'label', label: 'Book display' },
    { label: 'Show remedies', checked: view !== 'rubrics', run: () => { onView(view === 'rubrics' ? 'full' : 'rubrics'); onDone() } },
    { label: 'Full remedy names', checked: view === 'names', run: () => { onView(view === 'names' ? 'full' : 'names'); onDone() } },
    { label: 'Remedy counts', checked: counts, run: () => { actions.setSettings({ showRemedyCounts: !counts }); onDone() } },
    { label: 'Show rubric notes', checked: showNotes, run: () => { actions.setSettings({ showRubricNotes: !showNotes }); onDone() } },
  ]
  return (
    <div className="rv-tools" role="toolbar" aria-label="Repertory tools">
      <ToolButton icon={BinocularsIcon} label="Find a rubric" title={`Find a rubric (${formatKeys('F2')})`} onClick={() => openFind(false)} />
      <ToolButton icon={ClipboardIcon} label="Take" title="Take the rubric into the clipboard" menu className="rv-tb-take" onClick={el => onMenu(el, take)} />
      <label className="rv-views-label" htmlFor="rv-views">Views:</label>
      <span className="rv-views-wrap">
        <select
          id="rv-views" className="rv-views" aria-label="Views" title="Rubric display (Space cycles)" value={view}
          onChange={e => { onView(e.target.value as ViewMode); onDone() }}
        >
          {VIEWS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </span>
      <span className="rv-tsep" aria-hidden="true" />
      {books.length > 2 && <ToolButton icon={GlobeIcon} label="Repertory and language" title="Repertory and language" onClick={el => onMenu(el, books)} />}
      <ToolButton
        icon={PieIcon} label="Minimum grade shown" menu pressed={minGrade > 1}
        title={`Remedies shown: ${GRADE_VIEWS.find(x => x.g === minGrade)?.label ?? 'All grades'}`} onClick={el => onMenu(el, grades)}
      />
      <span className="rv-tfill" />
      <div className="rv-toggles" role="group" aria-label="Book display and settings">
        <ToolButton icon={JarIcon} label="Show remedies" pressed={view !== 'rubrics'} onClick={() => { onView(view === 'rubrics' ? 'full' : 'rubrics'); onDone() }} />
        <ToolButton icon={PersonIcon} label="Full remedy names" pressed={view === 'names'} onClick={() => { onView(view === 'names' ? 'full' : 'names'); onDone() }} />
        {/* the middle toggle carries a ▾ as in RadarOpus: its caret opens the book display options */}
        <span className={`rv-tb-split${counts ? ' on' : ''}`}>
          <ToolButton icon={TagsIcon} label="Remedy counts" title="Remedy counts after the rubric names" pressed={counts} onClick={() => { actions.setSettings({ showRemedyCounts: !counts }); onDone() }} />
          <button
            type="button" className="rv-tb-split-caret" aria-label="Book display options" title="Book display options" aria-haspopup="menu"
            onClick={e => onMenu(e.currentTarget.parentElement ?? e.currentTarget, display)}
          ><MenuTriangle /></button>
        </span>
        <ToolButton icon={PagePlusIcon} label="Show rubric notes" title={`Show rubric notes in the book (add one: ${formatKeys('Mod+Shift+M')})`} pressed={showNotes} onClick={() => { actions.setSettings({ showRubricNotes: !showNotes }); onDone() }} />
        <ToolButton icon={JarPlusIcon} label="Bookmark rubric" title={`Bookmark rubric (${formatKeys('Mod+D')})`} pressed={bookmarked} onClick={() => run('rubric.bookmark')} />
        <ToolButton icon={GearsIcon} label="Settings" title={`Settings… (${formatKeys('Mod+,')})`} onClick={() => runCommand('app.settings')} />
        <ToolButton icon={HelpIcon} label="Keyboard shortcuts" title={`Keyboard shortcuts (${formatKeys('F1')})`} onClick={() => runCommand('help.shortcuts')} />
      </div>
    </div>
  )
})

function ChapterChooser({ rep, legacyRecent, initial, onClose, onPick }: { rep: Repertory; legacyRecent?: readonly number[]; initial: string; onClose: () => void; onPick: (i: number) => void }) {
  const [q, setQ] = useState(initial)
  const [active, setActive] = useState(0)
  const all = useMemo(() => rep.chapters.map(c => ({ id: c, name: rep.text(c) })), [rep])
  // chapters of recently read rubrics, most recent first: preferred among equal matches
  const recentRubrics = useApp(s => s.recentRubrics)
  const recentChapters = useMemo(() => {
    const recent = recentOf(recentRubrics, rep.abbrev, legacyRecent)
    const m = new Map<number, number>()
    for (const r of recent) { const c = rep.chapterRoot(Math.min(r, rep.size - 1)); if (!m.has(c)) m.set(c, m.size) }
    return m
  }, [recentRubrics, legacyRecent, rep])
  const list = matchChapters(all, q, c => recentChapters.get(c.id) ?? -1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, [])
  useEffect(() => { listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [active])
  const cur = Math.min(active, list.length - 1)
  return (
    <div className="rv-chooser" role="dialog" aria-label="Go to chapter">
      <input
        ref={inputRef}
        className="input"
        aria-label="Chapter"
        value={q}
        role="combobox"
        aria-expanded="true"
        aria-controls="rv-chooser-list"
        aria-activedescendant={list[cur] ? `rv-ch-${list[cur].id}` : undefined}
        onChange={e => { setQ(e.target.value); setActive(0) }}
        onBlur={onClose}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Escape' || (e.key === 'Backspace' && !q)) { e.preventDefault(); onClose() }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(list.length - 1, cur + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, cur - 1)) }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (list[cur]) onPick(list[cur].id) }
        }}
      />
      <div className="rv-chooser-list" id="rv-chooser-list" role="listbox" ref={listRef}>
        {list.length === 0 && <div className="rv-chooser-empty">No chapter matches “{q}”</div>}
        {list.map((c, x) => (
          <div
            key={c.id} id={`rv-ch-${c.id}`} role="option" aria-selected={x === cur}
            className={`rv-chooser-item${x === cur ? ' active' : ''}`}
            onMouseDown={e => { e.preventDefault(); onPick(c.id) }}
            onMouseEnter={() => setActive(x)}
          >
            <span className="rv-chooser-name">{c.name}</span>
            {recentChapters.has(c.id) && <History size={11} className="rv-chooser-recent" aria-label="recently used" />}
            <span className="rv-chooser-n" title="Rubrics in this chapter">{(rep.subtreeEndOf(c.id) - c.id - 1).toLocaleString()} rubrics</span>
          </div>
        ))}
      </div>
    </div>
  )
}

let measureCtx: CanvasRenderingContext2D | null | undefined
/** Width of a text in a CSS font, measured on a canvas (no layout). */
function textWidth(text: string, font: string): number {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = font
  return measureCtx.measureText(text).width
}


/**
 * Symptom path of the selected rubric under the toolbar: the chapter icon, then "MIND - ABRUPT -
 * harsh" (chapter and main rubric in capitals). A level selects that rubric. When the path does
 * not fit, middle levels and then the chapter fold into "…" menus; the last two levels stay whole.
 */
const Crumbs = memo(function Crumbs({ rep, rubric, onMenu, onGo, icon }: { rep: Repertory; rubric: number; onMenu: (el: HTMLElement, items: MenuItem[]) => void; onGo: (i: number) => void; icon: number }) {
  const navRef = useRef<HTMLElement>(null)
  const lineage = rep.lineage(rubric)
  const [width, setWidth] = useState(0)
  /** The crumbs' font (size and family), read once: widths are then measured off-layout on a canvas. */
  const [font, setFont] = useState<{ size: string; family: string } | null>(null)
  // fold order over the levels alone: the middle levels first, then the chapter
  const order = crumbCollapseOrder(lineage.length + 1).filter(x => x > 0).map(x => x - 1)
  const label = (x: number) => { const t = rubricName(rep.text(lineage[x])); return x <= 1 ? t.toLocaleUpperCase() : t }
  const n = useMemo(() => {
    if (!font || !width) return 0
    const w = (text: string) => textWidth(text, `400 ${font.size} ${font.family}`)
    const widths = lineage.map((_, x) => w(label(x)) + 1)
    return crumbFoldCount(widths, order, width - 2, w(' - '), 24)
  }, [font, width, rep, rubric]) // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = new Set(order.slice(0, n))

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const cs = getComputedStyle(nav)
    setFont({ size: cs.fontSize, family: cs.fontFamily })
    // ResizeObserver callbacks run after layout: reading the width there costs nothing
    const ro = new ResizeObserver(() => setWidth(Math.round(nav.clientWidth)))
    ro.observe(nav)
    return () => ro.disconnect()
  }, [])

  const crumbs = lineage.map(r => ({ label: rubricName(rep.text(r)), ref: rep.ref(r) }))
  const parts = crumbSegments(crumbs, hidden).map(seg => {
    const sep = seg.x > 0 && <span className="rv-sep" aria-hidden="true"> - </span>
    if (seg.kind === 'fold') {
      const path = seg.items.map(c => c.label).join(' - ')
      return (
        <span key={`f${seg.x}`} className="rv-crumb-wrap rv-crumb-fold">
          {sep}
          <button
            className="rv-crumb rv-crumb-more" aria-haspopup="menu" aria-label={`${seg.items.length} more level${seg.items.length === 1 ? '' : 's'}: ${path}`}
            title={path}
            onClick={e => onMenu(e.currentTarget, [{ type: 'label', label: 'Go to level' }, ...seg.items.map(c => ({ label: c.label, run: () => onGo(lineage[c.x]) }))])}
          ><Ellipsis size={13} /></button>
        </span>
      )
    }
    return (
      <span key={seg.x} className={`rv-crumb-wrap${seg.last ? ' rv-crumb-wrap-last' : ''}`}>
        {sep}
        <button
          className={`rv-crumb${seg.x <= 1 ? ' rv-crumb-caps' : ''}${seg.last ? ' rv-crumb-last' : ''}`}
          title={seg.last ? crumbs.map(c => c.label).join(' - ') : `Go to ${seg.label}`}
          onClick={() => onGo(lineage[seg.x])}
        >{seg.label}</button>
      </span>
    )
  })
  return (
    <div className="rv-path">
      <ChapterIcon name={rep.text(lineage[0])} size={icon} className="rv-path-icon" />
      <nav className={`rv-crumbs${n >= order.length ? ' rv-crumbs-fit' : ''}`} ref={navRef} aria-label="Symptom path">{parts}</nav>
    </div>
  )
})
