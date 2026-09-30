import { memo, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Bookmark, CaseSensitive, ChevronDown, ClipboardPlus, Ellipsis, Hash, History, Pointer, Search, StickyNote, TriangleAlert, WholeWord, X } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import { actions, selectActiveConsultation, useApp } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { formatKeys, runCommand } from '../../commands/registry'
import { RUBRIC_MIME } from '../clipboard/logic'
import { indexAt, useVariableVirtual, useVirtualWindow } from './virtual'
import type { VariableVirtual } from './virtual'
import { crumbCollapseOrder, crumbFoldCount, crumbSegments, rubricLabel } from './logic'
import { matchChapters } from './take'
import { TakeBar, replayKey } from './TakeBar'
import { clipboardMembership, openFind, recentOf, recordRecent, remedyMenuItems, rubricMenu, takeRefs } from './ops'
import { cycleDisplay } from './commands'
import { selectRubric, useBookKeys } from './useBookKeys'
import { NEAR_ROWS, estimateRow, layoutSizes, remedyChars } from './estimate'
import type { EstimateParams } from './estimate'
import { remedyMarkup } from './remedies'
import { onRemedyMenuRequest, setHighlight, useHighlight } from './highlight'
import './repertory.css'

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
      <div className="rv-head"><span className="rv-head-in rv-loading-label">Loading {title}…</span></div>
      <div className="rv-skel">
        {Array.from({ length: 14 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${40 + ((i * 37) % 55)}%`, marginLeft: (i % 4) * 16 }} />)}
      </div>
    </div>
  )
}

type Clip = { n: number; color: string; name: string }

interface RowProps {
  rep: Repertory
  catalog: Catalog
  i: number
  k: number
  /** Rubrics in the chapter listbox (aria-setsize). */
  setSize: number
  current: boolean
  showRemedies: boolean
  names: boolean
  minGrade: number
  clips: Clip[] | undefined
  bookmarked: boolean
  note: string | undefined
  measure: (el: HTMLElement | null) => (() => void) | undefined
  /** Known height of row k (measured, else estimated): the placeholder size of a long row skipped off screen. */
  sizeOf: (k: number) => number
}

/** Rows showing at least this many remedies skip rendering while off screen (content-visibility). */
const LONG_REMEDIES = 60

/**
 * One rubric of the book. Rows sit in normal flow inside the virtualiser's window, so they carry no
 * position and do not re-render when the layout settles; the remedy list is cached static markup.
 */
const RubricRow = memo(function RubricRow({ rep, catalog, i, k, setSize, current, showRemedies, names, minGrade, clips, bookmarked, note, measure, sizeOf }: RowProps) {
  const depth = rep.depth(i)
  const total = rep.remedyCount(i)
  const list = total && (showRemedies || minGrade > 1) ? remedyMarkup(rep, catalog, i, names, minGrade) : null
  const hidden = list ? total - list.shown : 0
  // a long remedy block is laid out and painted only near the viewport; off screen it keeps its last
  // rendered (else estimated) height, so the scroll range does not change
  const long = showRemedies && !!list && list.shown >= LONG_REMEDIES
  const cls = `rv-row${depth === 0 ? ' rv-chapter' : depth === 1 ? ' rv-main' : ''}${current ? ' rv-current' : ''}${long ? ' rv-long' : ''}`
  // the accessible name is short: arrowing through the book reads the rubric, not its remedy list
  const label = rubricLabel(rep.lineage(i).map(r => rep.text(r)), total, {
    clipboards: clips?.map(c => c.n), bookmarked, note: !!note,
  })
  return (
    <div
      ref={measure}
      className={cls}
      data-vindex={k}
      data-rubric={i}
      role="option"
      aria-selected={current}
      aria-label={label}
      aria-posinset={k + 1}
      aria-setsize={setSize}
      id={`rv-r${i}`}
      style={long ? { containIntrinsicSize: `auto ${Math.round(sizeOf(k)) || 24}px` } : undefined}
      draggable
    >
      <span className="rv-gutter" aria-hidden="true">
        {current && <Pointer className="rv-hand" size={13} />}
        {bookmarked && <Bookmark className="rv-mark-bm" size={11} />}
        {note && <StickyNote className="rv-mark-note" size={11} />}
      </span>
      <div className="rv-body" style={{ paddingLeft: Math.max(0, depth - 1) * 18 }}>
        {clips?.map(c => <span key={c.n} className="rv-clip" style={{ ['--chip' as string]: c.color }} title={`Taken into clipboard ${c.n}: ${c.name}`}>{c.n}</span>)}
        <span className="rv-text">{rep.text(i)}</span>
        {depth > 0 && (total > 0
          ? <span className="rv-count" title={`${total} remedies`}>{total}</span>
          // count display: a rubric without remedies of its own still gets its (muted) badge, so the counts line up
          : !showRemedies && <span className="rv-count rv-count-zero" title="No remedies of its own (see its sub-rubrics)">–</span>)}
        {showRemedies && list && list.shown > 0 && (
          <span className={`rv-rems${names ? ' rv-names' : ''}`} dangerouslySetInnerHTML={{ __html: list.html }} />
        )}
        {hidden > 0 && <span className="rv-hidden" title={`${hidden} remedies below grade ${minGrade} hidden`}>+{hidden}</span>}
        {note && <div className="rv-note">{note}</div>}
      </div>
    </div>
  )
})

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
      <span className="rv-tip-hint">Click to highlight · double-click to open</span>
    </div>
  )
}

interface BookRowsProps {
  v: VariableVirtual
  rep: Repertory
  catalog: Catalog
  start: number
  count: number
  rubric: number
  showRemedies: boolean
  names: boolean
  minGrade: number
  membership: Map<string, Clip[]>
  bookmarked: Set<string>
  notes: Record<string, string>
}

/** The rendered rows: re-renders alone when scrolling changes the range, the view around it does not. */
const BookRows = memo(function BookRows({ v, rep, catalog, start, count, rubric, showRemedies, names, minGrade, membership, bookmarked, notes }: BookRowsProps) {
  const { start: from, end } = useVirtualWindow(v)
  const rows = []
  for (let k = from; k < end; k++) {
    const i = start + k
    const ref = rep.ref(i)
    rows.push(
      <RubricRow
        key={i} rep={rep} catalog={catalog} i={i} k={k} setSize={count} current={i === rubric}
        showRemedies={showRemedies} names={names} minGrade={minGrade}
        clips={membership.get(ref)} bookmarked={bookmarked.has(ref)} note={notes[ref]} measure={v.measure} sizeOf={v.sizeOf}
      />,
    )
  }
  return <>{rows}</>
})

const DISPLAY_MODES = [
  { mode: 'count', label: 'Count', title: 'Remedy count only', Icon: Hash },
  { mode: 'remedies', label: 'Abbrev', title: 'Remedy abbreviations', Icon: CaseSensitive },
  { mode: 'names', label: 'Names', title: 'Full remedy names', Icon: WholeWord },
] as const

const GRADE_LABEL = ['', 'grade 1 (plain)', 'grade 2 (italic)', 'grade 3 (bold)', 'grade 4 (bold capitals)']

function BookView({ tab, rep }: { tab: RepertoryTab; rep: Repertory }) {
  const catalog = useCatalog()
  const settings = useApp(s => s.settings)
  const consultation = useApp(selectActiveConsultation)
  const bookmarks = useApp(s => s.bookmarks)
  const notes = useApp(s => s.rubricNotes)
  const info = rep.info

  const showRemedies = tab.display !== 'count'
  const names = settings.remedyStyle === 'name'
  const minGrade = settings.minGradeShown
  const rubric = Math.max(0, Math.min(rep.size - 1, tab.rubric))
  const chapterRoot = rep.chapterRoot(rubric)
  const start = chapterRoot
  const count = rep.subtreeEndOf(chapterRoot) - chapterRoot

  const membership = useMemo(() => clipboardMembership(consultation), [consultation])
  const bookmarked = useMemo(() => new Set(bookmarks.map(b => b.ref)), [bookmarks])

  const highlight = useHighlight(tab.id)
  const [takeBar, setTakeBar] = useState<string | null>(null)
  const [chooser, setChooser] = useState<string | null>(null)
  // the remedy tooltip keeps its own state: hovering remedies re-renders the tooltip, not the book
  const tipRef = useRef<TipApi>(null)
  const setTip = (t: TipState | null) => tipRef.current?.set(t)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()
  // the symptom path follows the rubric deferred (a key press renders the book first) and, memoised
  // with a stable menu opener, re-renders only when the rubric does
  const crumbRubric = useDeferredValue(rubric)
  const cmRef = useRef(cm)
  useLayoutEffect(() => { cmRef.current = cm })
  /** Opens a menu at an element (the crumbs and the Take button): stable, so those stay memoised. */
  const onCrumbMenu = useCallback((el: HTMLElement, items: MenuItem[]) => cmRef.current.openAt(el, items), [])

  // row height estimates: O(1) per row from per-rubric character counts built once per repertory;
  // measured heights are kept per layout outside the component (see estimate.ts)
  const fs = Math.round(13 * settings.fontScale) * (settings.density === 'comfortable' ? 14 / 13 : 1)
  const lineH = Math.round(fs * 1.5)
  const rc = remedyChars(rep, catalog)
  /** Rubrics of this repertory with a note (a note adds a line to the row). */
  const noteRows = useMemo(() => {
    const out = new Set<number>()
    const prefix = `${rep.abbrev}:`
    for (const ref in notes) if (ref.startsWith(prefix) && notes[ref]) out.add(Number(ref.slice(prefix.length)))
    return out
  }, [notes, rep])
  const focusK = rubric - start
  const params: EstimateParams = { showRemedies, names, minGrade, fs, lineH, width: 0 }
  const estimate = (k: number, width: number) => {
    const p = params
    p.width = width
    const i = start + k
    return estimateRow(rep, rc, i, p, Math.abs(k - focusK) <= NEAR_ROWS, noteRows.has(i))
  }

  const contentKey = `${tab.repertory}:${start}:${count}`
  const mode = !showRemedies ? 'count' : names ? 'names' : 'abbrev'
  const resetKey = `${contentKey}:${mode}:${minGrade}:${lineH}`
  const v = useVariableVirtual(scrollRef, count, estimate, resetKey, {
    focus: rubric - start, contentKey,
    sizesFor: wb => layoutSizes(`${resetKey}:${settings.density}:${wb}`, count),
  })

  // keep the current rubric in view; once on screen it stays pinned while row heights settle
  const lastRubric = useRef<number | null>(null)
  useEffect(() => {
    const k = rubric - start
    const prev = lastRubric.current
    lastRubric.current = rubric
    if (!scrollRef.current) return
    if (prev == null) v.scrollToIndex(k, 'center')
    else if (!v.isVisible(k)) v.scrollToIndex(k, Math.abs(rubric - prev) <= 2 ? 'auto' : 'center')
    else v.anchor(k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubric, start, resetKey])

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

  // the take bar takes room at the bottom of the book: keep the rubric being taken in view
  useEffect(() => { if (takeBar != null) v.scrollToIndex(rubric - start) }, [takeBar != null]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const rowEl = (i: number) => scrollRef.current?.querySelector<HTMLElement>(`[data-rubric="${i}"]`) ?? null

  const onKeyDown = useBookKeys(tab, rep, v, {
    scrollRef, start, count, lineH,
    openTakeBar: setTakeBar,
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

  const onClick = (e: ReactMouseEvent) => {
    const remEl = (e.target as HTMLElement).closest<HTMLElement>('.rv-rem')
    const i = rowOf(e.target)
    if (i >= 0) select(i)
    if (remEl) setHighlight(tab.id, Number(remEl.dataset.rid))
    scrollRef.current?.focus({ preventScroll: true })
  }
  const onDoubleClick = (e: ReactMouseEvent) => {
    const remEl = (e.target as HTMLElement).closest<HTMLElement>('.rv-rem')
    if (remEl) { window.getSelection()?.removeAllRanges(); actions.openTab({ kind: 'remedy', remedyId: Number(remEl.dataset.rid) }); return }
    const i = rowOf(e.target)
    if (i >= 0 && rep.childCountOf(i)) select(i + 1, true)
  }
  const onContextMenu = (e: ReactMouseEvent) => {
    const i = rowOf(e.target)
    if (i < 0) return
    select(i)
    cm.open(e, rubricMenu(rep.ref(i)))
  }
  const onMouseOver = (e: ReactMouseEvent) => {
    const remEl = (e.target as HTMLElement).closest<HTMLElement>('.rv-rem')
    if (!remEl) { setTip(null); return }
    const r = remEl.getBoundingClientRect()
    setTip({ x: r.left, y: r.bottom, id: Number(remEl.dataset.rid), grade: Number(remEl.dataset.grade) })
  }
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
    for (let i = start; i < start + count; i++) if (rep.gradeOf(i, highlight)) n++
    return n
  }, [highlight, start, count, rep])

  const displayMode = !showRemedies ? 'count' : names ? 'names' : 'remedies'
  const tabId = tab.id
  const setDisplay = useCallback((m: 'count' | 'remedies' | 'names') => {
    if (m === 'count') actions.updateTab<RepertoryTab>(tabId, { display: 'count' })
    else { actions.updateTab<RepertoryTab>(tabId, { display: 'remedies' }); actions.setSettings({ remedyStyle: m === 'names' ? 'name' : 'abbrev' }) }
  }, [tabId])

  return (
    <div className="rv" ref={rootRef} onKeyDown={onKeyDown}>
      <div className="rv-head">
        <div className="rv-head-in">
        <Crumbs rep={rep} rubric={crumbRubric} onMenu={onCrumbMenu} />
        <div className="rv-tools">
          <button className="icon-btn" title={`Find rubric (${formatKeys('F2')})`} aria-label="Find rubric" onClick={() => openFind(false)}><Search size={14} /></button>
          <DisplaySeg value={displayMode} onChange={setDisplay} />
          <select className="select rv-grade" aria-label="Minimum grade shown" title="Minimum grade shown" value={minGrade} onChange={e => actions.setSettings({ minGradeShown: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>All grades</option>
            <option value={2}>Grade 2+</option>
            <option value={3}>Grade 3+</option>
          </select>
          <TakeButton onMenu={onCrumbMenu} />
        </div>
        </div>
      </div>
      {highlight != null && (
        <div className="rv-hlbar" role="region" aria-label="Remedy highlight">
          <span className="rv-hl-chip">{catalog.remedy(highlight).abbrev}</span>
          <span role="status">{catalog.remedy(highlight).name} appears in <b>{highlightCount}</b> rubric{highlightCount === 1 ? '' : 's'} of {rep.text(chapterRoot)}</span>
          <span className="rv-hl-keys" aria-hidden="true"><kbd className="kbd">{formatKeys('Alt+ArrowDown')}</kbd> next <kbd className="kbd">Esc</kbd> clear</span>
          <button className="btn btn-sm btn-ghost" title={`Next rubric with ${catalog.remedy(highlight).abbrev} (${formatKeys('Alt+ArrowDown')})`} onClick={() => { runCommand('repertory.highlightNext'); scrollRef.current?.focus({ preventScroll: true }) }}>Next</button>
          <button className="btn btn-sm btn-ghost" onClick={() => actions.openTab({ kind: 'remedy', remedyId: highlight })}>Open remedy</button>
          <button className="icon-btn" aria-label="Clear highlight" title="Clear highlight (Esc in the book)" onClick={() => { setHighlight(tab.id, null); scrollRef.current?.focus({ preventScroll: true }) }}><X size={13} /></button>
        </div>
      )}
      <div className="rv-bodywrap">
      <RunningHead rep={rep} v={v} start={start} count={count} onGo={i => { select(i, true); scrollRef.current?.focus({ preventScroll: true }) }} />
      <div
        className="rv-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="listbox"
        aria-label={`${info.title}: ${rep.text(chapterRoot)}`}
        aria-activedescendant={`rv-r${rubric}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onMouseOver={onMouseOver}
        onMouseLeave={() => setTip(null)}
        onDragStart={onDragStart}
      >
        <div className={`rv-canvas${settings.density === 'comfortable' ? ' rv-comfy' : ''}`} ref={v.canvasRef}>
          <div className="rv-win" ref={v.windowRef} data-hl={highlight ?? undefined}>
            <BookRows
              v={v} rep={rep} catalog={catalog} start={start} count={count} rubric={rubric}
              showRemedies={showRemedies} names={names} minGrade={minGrade} membership={membership} bookmarked={bookmarked} notes={notes}
            />
          </div>
        </div>
        {highlight != null && <style>{`.rv-win[data-hl="${highlight}"] .rv-rem[data-rid="${highlight}"] { background: var(--rv-hl-bg); outline: 1px solid var(--rv-hl-ring); }`}</style>}
      </div>
      </div>
      {takeBar != null && (
        <TakeBar
          initial={takeBar}
          path={rep.lineage(rubric).map(r => rep.text(r))}
          onClose={() => { setTakeBar(null); scrollRef.current?.focus({ preventScroll: true }) }}
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
          onClose={() => { setChooser(null); scrollRef.current?.focus({ preventScroll: true }) }}
          onPick={c => { setChooser(null); select(c, true); scrollRef.current?.focus({ preventScroll: true }) }}
        />
      )}
      <div className="rv-foot">
        <span className="rv-foot-keys" aria-hidden="true">
          <kbd className="kbd">+</kbd> take <kbd className="kbd">Space</kbd> display <kbd className="kbd">F2</kbd> find <kbd className="kbd">F3</kbd> find here <kbd className="kbd">a–z</kbd> chapter <kbd className="kbd">⌫</kbd> up
        </span>
        <button className="rv-foot-btn" tabIndex={-1} title="Cycle rubric display (Space)" onClick={() => cycleDisplay()}>{displayMode === 'count' ? 'Remedy count only' : displayMode === 'names' ? 'Full remedy names' : 'Remedy abbreviations'}</button>
      </div>
      {cm.element}
    </div>
  )
}

/** Count / Abbrev / Names: a radiogroup with one tab stop; Left/Right (and Up/Down) move and select. */
/** Memoised with a stable onChange: a document switch does not rebuild its icons. */
const DisplaySeg = memo(function DisplaySeg({ value, onChange }: { value: 'count' | 'remedies' | 'names'; onChange: (m: 'count' | 'remedies' | 'names') => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div className="rv-seg rseg" role="radiogroup" aria-label="Rubric display (Space cycles)">
      {DISPLAY_MODES.map(({ mode, label, title, Icon }, x) => (
        <button
          key={mode} ref={el => { refs.current[x] = el }} role="radio" aria-checked={value === mode} aria-label={label}
          tabIndex={value === mode ? 0 : -1} className={value === mode ? 'on' : ''} title={`${title} (Space cycles)`}
          onClick={() => onChange(mode)}
          onKeyDown={e => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!d || e.altKey || e.ctrlKey || e.metaKey) return
            e.preventDefault(); e.stopPropagation()
            const n = (x + d + DISPLAY_MODES.length) % DISPLAY_MODES.length
            onChange(DISPLAY_MODES[n].mode)
            refs.current[n]?.focus()
          }}
        >
          <Icon size={13} className="rv-seg-icon" aria-hidden="true" /><span className="rv-seg-label">{label}</span>
        </button>
      ))}
    </div>
  )
})

const TakeButton = memo(function TakeButton({ onMenu }: { onMenu: (el: HTMLElement, items: MenuItem[]) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const items: MenuItem[] = [
    { command: 'rubric.add', label: 'Take (intensity 1)' },
    { command: 'rubric.add.w2', label: 'Intensity 2' },
    { command: 'rubric.add.w3', label: 'Intensity 3' },
    { command: 'rubric.add.w4', label: 'Intensity 4' },
    { type: 'separator' },
    { command: 'rubric.takeOptions' },
  ]
  return (
    <div className="rv-take" ref={ref}>
      <button className="btn btn-sm rv-take-main" onClick={() => runCommand('rubric.add')} title="Take rubric into the active clipboard (+ or Insert)">
        <ClipboardPlus size={13} /><span className="rv-take-label">Take</span>
      </button>
      <button className="btn btn-sm rv-take-more" aria-label="Take options" aria-haspopup="menu" onClick={() => ref.current && onMenu(ref.current, items)}><ChevronDown size={13} /></button>
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
 * Symptom path. When it does not fit, crumbs fold into "…" menus in priority order (repertory
 * title, then middle levels, then the chapter); the last two levels always stay whole.
 */
const Crumbs = memo(function Crumbs({ rep, rubric, onMenu }: { rep: Repertory; rubric: number; onMenu: (el: HTMLElement, items: MenuItem[]) => void }) {
  const navRef = useRef<HTMLElement>(null)
  const lineage = rep.lineage(rubric)
  const [width, setWidth] = useState(0)
  /** The crumbs' font (size and family), read once: widths are then measured off-layout on a canvas. */
  const [font, setFont] = useState<{ size: string; family: string } | null>(null)
  const order = crumbCollapseOrder(lineage.length + 1)
  // item 0 is the repertory title, item x > 0 is lineage[x - 1]
  const itemLabel = (x: number) => (x === 0 ? rep.info.title : rep.text(lineage[x - 1]))
  const n = useMemo(() => {
    if (!font || !width) return 0
    const w = (text: string, weight: number) => textWidth(text, `${weight} ${font.size} ${font.family}`)
    const last = lineage.length
    // natural crumb widths: text plus 2 × 5px padding; all but the leaf capped at 260px
    const widths = Array.from({ length: last + 1 }, (_, x) => {
      const t = w(itemLabel(x), x === 0 ? 500 : x === last ? 600 : 400) + 10
      return x === last ? t : Math.min(260, t)
    })
    return crumbFoldCount(widths, order, width - 2, w('›', 400) + 2, 21)
  }, [font, width, rep, rubric]) // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = new Set(order.slice(0, n))
  const settled = n >= order.length

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

  const openItem = (x: number) => (x === 0 ? runCommand('repertory.toc') : actions.openDialog('repertory.find', { repertory: rep.abbrev, from: lineage[x - 1] }))
  const crumbs = [{ label: rep.info.title, ref: null }, ...lineage.map(r => ({ label: rep.text(r), ref: rep.ref(r) }))]
  const parts = crumbSegments(crumbs, hidden).map(seg => {
    const sep = seg.x > 0 && <span className="rv-sep" aria-hidden="true">›</span>
    if (seg.kind === 'fold') {
      const path = seg.items.map(c => c.label).join(' › ')
      return (
        <span key={`f${seg.x}`} className="rv-crumb-wrap rv-crumb-fold">
          {sep}
          <button
            className="rv-crumb rv-crumb-more" aria-haspopup="menu" aria-label={`${seg.items.length} more level${seg.items.length === 1 ? '' : 's'}: ${path}`}
            title={path}
            onClick={e => onMenu(e.currentTarget, [{ type: 'label', label: 'Go to level' }, ...seg.items.map(c => ({ label: c.x === 0 ? `${c.label} (repertories)` : c.label, run: () => openItem(c.x) }))])}
          ><Ellipsis size={13} /></button>
        </span>
      )
    }
    return (
      <span key={seg.x} className={`rv-crumb-wrap${seg.last ? ' rv-crumb-wrap-last' : ''}`}>
        {sep}
        <button
          className={`rv-crumb${seg.x === 0 ? ' rv-crumb-rep' : ''}${seg.last ? ' rv-crumb-last' : ''}`}
          title={seg.x === 0 ? 'Repertories table of contents (Ctrl+1)' : `${seg.label}: find from here (F3)`}
          onClick={() => openItem(seg.x)}
        >{seg.label}</button>
      </span>
    )
  })
  return <nav className={`rv-crumbs${settled ? ' rv-crumbs-fit' : ''}`} ref={navRef} aria-label="Symptom path">{parts}</nav>
})

/**
 * Book running head: where the top of the page is. Shows the parents of the rubric at the top
 * once they have scrolled away, and "(continued)" when that rubric itself started above the page
 * (a chapter heading's or main rubric's long remedy block). It follows the scroll position itself,
 * re-rendering only when the rubric at the top or its "continued" state changes.
 */
function RunningHead({ rep, v, start, count, onGo }: { rep: Repertory; v: { getOffsets: () => Float64Array; subscribe: (fn: () => void) => () => void; getTop: () => number }; start: number; count: number; onGo: (i: number) => void }) {
  const [at, setAt] = useState<{ k: number; continued: boolean } | null>(null)
  const { getOffsets, subscribe, getTop } = v
  // follows the virtualiser's scroll position and layout: no DOM reads
  useLayoutEffect(() => {
    const update = () => {
      const top = getTop(), offsets = getOffsets()
      const next = count <= 0 || top <= 0 ? null : (() => { const k = indexAt(offsets, count, top + 4); return { k, continued: top - offsets[k] > 20 } })()
      setAt(a => (a?.k === next?.k && a?.continued === next?.continued ? a : next))
    }
    update()
    return subscribe(update)
  }, [getOffsets, count, subscribe, getTop])
  if (!at || at.k >= count) return null
  const i = start + at.k
  const line = at.continued ? rep.lineage(i) : rep.lineage(i).slice(0, -1)
  if (!at.continued && (rep.depth(i) < 2 || line.length < 2)) return null
  if (!line.length) return null
  return (
    <div className="rv-runhead" aria-hidden="true">
      {line.map((r, x) => (
        <span key={r}>{x > 0 && '› '}<button tabIndex={-1} onClick={() => onGo(r)}>{rep.text(r)}</button></span>
      ))}
      {at.continued && <span className="rv-runhead-cont">(continued)</span>}
    </div>
  )
}
