import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Bookmark, CaseSensitive, ChevronDown, ClipboardPlus, Ellipsis, Hash, History, Pointer, Search, StickyNote, TriangleAlert, WholeWord, X } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { Grade } from '../../data/types'
import { actions, selectActiveConsultation, useApp } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { formatKeys, runCommand } from '../../commands/registry'
import { indexAt, useVariableVirtual } from './virtual'
import { crumbCollapseOrder, hiddenRuns, rubricLabel } from './logic'
import { bookAbbrev, describeTake, matchChapters, parseTake } from './take'
import type { TakeOptions } from './take'
import { clipboardMembership, openFind, recordRecent, rubricMenu, takeRefs } from './ops'
import { cycleDisplay } from './commands'
import { selectRubric, useBookKeys } from './useBookKeys'
import './repertory.css'

export const RUBRIC_MIME = 'application/x-rubric-ref'

/** Alphabetical rank of every remedy id (book order of remedies within a rubric). */
const rankCache = new WeakMap<Catalog, Map<number, number>>()
export function remedyRank(catalog: Catalog): Map<number, number> {
  let r = rankCache.get(catalog)
  if (!r) {
    const list = [...catalog.remedies.values()].sort((a, b) => a.abbrev.toLowerCase().localeCompare(b.abbrev.toLowerCase()))
    r = new Map(list.map((x, i) => [x.id, i]))
    rankCache.set(catalog, r)
  }
  return r
}

type RemedyItem = { id: number; grade: Grade }
/** Remedies of each rubric in alphabetical order, sorted once per rubric per repertory. */
const alphaCache = new WeakMap<Repertory, Map<number, RemedyItem[]>>()
export function alphaRemedies(rep: Repertory, catalog: Catalog, i: number): readonly RemedyItem[] {
  let m = alphaCache.get(rep)
  if (!m) { m = new Map(); alphaCache.set(rep, m) }
  let list = m.get(i)
  if (!list) {
    const rank = remedyRank(catalog)
    const out: RemedyItem[] = []
    rep.forEachRemedy(i, (id, grade) => out.push({ id, grade }))
    list = out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    m.set(i, list)
  }
  return list
}

/** Focus follows a pointer activation of the tab: a click on a book's tab puts focus in its rubric list. */
let lastPointerDown = 0
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { lastPointerDown = performance.now() }, true)

export function RepertoryView({ tab }: { tab: RepertoryTab }) {
  // a retry remounts the loader, which starts a fresh load (a failed load is not cached)
  const [attempt, setAttempt] = useState(0)
  return <BookLoader key={attempt} tab={tab} onRetry={() => setAttempt(x => x + 1)} />
}

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
  top: number
  current: boolean
  showRemedies: boolean
  names: boolean
  minGrade: number
  highlight: number | null
  clips: Clip[] | undefined
  bookmarked: boolean
  note: string | undefined
  measure: (el: HTMLElement | null) => (() => void) | undefined
}

const GRADE_WORD = ['', 'grade 1', 'grade 2', 'grade 3', 'grade 4']

const RubricRow = memo(function RubricRow({ rep, catalog, i, k, top, current, showRemedies, names, minGrade, highlight, clips, bookmarked, note, measure }: RowProps) {
  const depth = rep.depth(i)
  const total = rep.remedyCount(i)
  let rems: readonly RemedyItem[] = []
  let hidden = 0
  if (total && (showRemedies || minGrade > 1)) {
    const all = alphaRemedies(rep, catalog, i)
    rems = minGrade > 1 ? all.filter(r => r.grade >= minGrade) : all
    hidden = all.length - rems.length
  }
  const cls = `rv-row${depth === 0 ? ' rv-chapter' : depth === 1 ? ' rv-main' : ''}${current ? ' rv-current' : ''}`
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
      style={{ transform: `translateY(${top}px)` }}
      role="option"
      aria-selected={current}
      aria-label={label}
      id={`rv-r${i}`}
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
        {depth > 0 && total > 0 && <span className="rv-count" title={`${total} remedies`}>{total}</span>}
        {showRemedies && rems.length > 0 && (
          <span className={`rv-rems${names ? ' rv-names' : ''}`}>
            {rems.map((r, x) => {
              const rem = catalog.remedy(r.id)
              return (
                <span key={r.id}>
                  {x > 0 && (names ? ', ' : ' ')}
                  <span className={`rv-rem g${r.grade}${highlight === r.id ? ' rv-hl' : ''}`} data-rid={r.id} data-grade={r.grade}>
                    {names ? rem.name : bookAbbrev(rem.abbrev, r.grade)}
                    <span className="sr-only rv-sr"> {GRADE_WORD[r.grade]}</span>
                  </span>
                </span>
              )
            })}
          </span>
        )}
        {hidden > 0 && <span className="rv-hidden" title={`${hidden} remedies below grade ${minGrade} hidden`}>+{hidden}</span>}
        {note && <div className="rv-note">{note}</div>}
      </div>
    </div>
  )
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

  const [highlight, setHighlight] = useState<number | null>(null)
  const [takeBar, setTakeBar] = useState<string | null>(null)
  const [chooser, setChooser] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; id: number; grade: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()

  // row height estimates (px), cached per layout
  const fs = Math.round(13 * settings.fontScale) * (settings.density === 'comfortable' ? 14 / 13 : 1)
  const lineH = Math.round(fs * 1.5)
  const estCache = useRef<{ key: string; arr: Float32Array }>({ key: '', arr: new Float32Array(0) })
  const estimate = useCallback((k: number, width: number) => {
    const key = `${start}:${count}:${showRemedies}:${names}:${minGrade}:${Math.round(width / 8)}:${lineH}`
    const c = estCache.current
    if (c.key !== key) { c.key = key; c.arr = new Float32Array(count) }
    if (c.arr[k]) return c.arr[k]
    const i = start + k
    const depth = rep.depth(i)
    let h: number
    if (depth === 0) h = lineH * 2 + 10
    else {
      let chars = rep.text(i).length + 5
      if (showRemedies) rep.forEachRemedy(i, (id, g) => { if (g >= minGrade) chars += (names ? catalog.remedy(id).name.length + 2 : catalog.remedy(id).abbrev.length + 2) })
      const avail = Math.max(120, (width || 800) - 60 - Math.max(0, depth - 1) * 18)
      const lines = Math.max(1, Math.ceil((chars * fs * 0.52) / avail))
      h = lines * lineH + 2 + (notes[rep.ref(i)] ? lineH : 0)
    }
    c.arr[k] = h
    return h
  }, [start, count, showRemedies, names, minGrade, lineH, fs, rep, catalog, notes])

  const contentKey = `${tab.repertory}:${start}:${count}`
  const resetKey = `${contentKey}:${showRemedies}:${names}:${minGrade}:${lineH}`
  const v = useVariableVirtual(scrollRef, count, estimate, resetKey, { focus: rubric - start, contentKey })

  // keep the current rubric in view; once on screen it stays pinned while row heights settle
  const lastRubric = useRef<number | null>(null)
  useEffect(() => {
    const k = rubric - start
    const prev = lastRubric.current
    lastRubric.current = rubric
    const el = scrollRef.current
    if (!el) return
    const visible = v.offsets[k] >= el.scrollTop && v.offsets[k + 1] <= el.scrollTop + el.clientHeight
    if (prev == null) v.scrollToIndex(k, 'center')
    else if (!visible) v.scrollToIndex(k, Math.abs(rubric - prev) <= 2 ? 'auto' : 'center')
    else v.anchor(k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubric, start, resetKey])

  // Recent list: a rubric reached by a jump is recorded at once, one the reader dwells on after a second
  const lastBack = useRef(tab.back)
  useEffect(() => {
    const jumped = lastBack.current !== tab.back
    lastBack.current = tab.back
    const ref = rep.ref(rubric)
    if (jumped) { recordRecent(ref, tab.id); return }
    const t = setTimeout(() => recordRecent(ref, tab.id), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubric, rep])

  // the take bar takes room at the bottom of the book: keep the rubric being taken in view
  useEffect(() => { if (takeBar != null) v.scrollToIndex(rubric - start) }, [takeBar != null]) // eslint-disable-line react-hooks/exhaustive-deps

  // focus the book when the tab opens; a click on the tab itself (which focuses the tab once the
  // mouse button is down) also hands focus to the book
  useEffect(() => {
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
    scrollRef, start, count, lineH, highlight,
    clearHighlight: () => setHighlight(null),
    openTakeBar: setTakeBar,
    openChooser: setChooser,
    openMenu: i => { const el = rowEl(i); if (el) cm.openAt(el, rubricMenu(rep.ref(i))) },
  })

  const rowOf = (t: EventTarget | null) => {
    const el = (t as HTMLElement | null)?.closest<HTMLElement>('[data-rubric]')
    return el ? Number(el.dataset.rubric) : -1
  }

  const onClick = (e: ReactMouseEvent) => {
    const remEl = (e.target as HTMLElement).closest<HTMLElement>('.rv-rem')
    const i = rowOf(e.target)
    if (i >= 0) select(i)
    if (remEl) setHighlight(Number(remEl.dataset.rid))
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
    if (!remEl) { if (tip) setTip(null); return }
    const r = remEl.getBoundingClientRect()
    const id = Number(remEl.dataset.rid)
    if (tip?.id === id && Math.abs(tip.y - r.bottom) < 1) return
    setTip({ x: r.left, y: r.bottom, id, grade: Number(remEl.dataset.grade) })
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

  const rows = []
  for (let k = v.start; k < v.end; k++) {
    const i = start + k
    const ref = rep.ref(i)
    rows.push(
      <RubricRow
        key={i} rep={rep} catalog={catalog} i={i} k={k} top={v.offsets[k]} current={i === rubric}
        showRemedies={showRemedies} names={names} minGrade={minGrade} highlight={highlight}
        clips={membership.get(ref)} bookmarked={bookmarked.has(ref)} note={notes[ref]} measure={v.measure}
      />,
    )
  }

  const displayMode = !showRemedies ? 'count' : names ? 'names' : 'remedies'
  const setDisplay = (m: 'count' | 'remedies' | 'names') => {
    if (m === 'count') actions.updateTab<RepertoryTab>(tab.id, { display: 'count' })
    else { actions.updateTab<RepertoryTab>(tab.id, { display: 'remedies' }); actions.setSettings({ remedyStyle: m === 'names' ? 'name' : 'abbrev' }) }
  }

  return (
    <div className="rv" ref={rootRef} onKeyDown={onKeyDown}>
      <div className="rv-head">
        <div className="rv-head-in">
        <Crumbs rep={rep} rubric={rubric} onMenu={(el, items) => cm.openAt(el, items)} />
        <div className="rv-tools">
          <button className="icon-btn" title={`Find rubric (${formatKeys('F2')})`} aria-label="Find rubric" onClick={() => openFind(false)}><Search size={14} /></button>
          <DisplaySeg value={displayMode} onChange={setDisplay} />
          <select className="select rv-grade" aria-label="Minimum grade shown" title="Minimum grade shown" value={minGrade} onChange={e => actions.setSettings({ minGradeShown: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>All grades</option>
            <option value={2}>Grade 2+</option>
            <option value={3}>Grade 3+</option>
          </select>
          <TakeButton onMenu={(el, items) => cm.openAt(el, items)} />
        </div>
        </div>
      </div>
      {highlight != null && (
        <div className="rv-hlbar">
          <span className="rv-hl-chip">{catalog.remedy(highlight).abbrev}</span>
          <span>{catalog.remedy(highlight).name} appears in <b>{highlightCount}</b> rubric{highlightCount === 1 ? '' : 's'} of {rep.text(chapterRoot)}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => actions.openTab({ kind: 'remedy', remedyId: highlight })}>Open remedy</button>
          <button className="icon-btn" aria-label="Clear highlight" onClick={() => setHighlight(null)}><X size={13} /></button>
        </div>
      )}
      <div className="rv-bodywrap">
      <RunningHead rep={rep} offsets={v.offsets} start={start} count={count} scrollEl={v.scrollEl} onGo={i => { select(i, true); scrollRef.current?.focus({ preventScroll: true }) }} />
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
        <div className={`rv-canvas${settings.density === 'comfortable' ? ' rv-comfy' : ''}`} style={{ height: v.total }}>{rows}</div>
      </div>
      </div>
      {takeBar != null && (
        <TakeBar
          initial={takeBar}
          path={rep.lineage(rubric).map(r => rep.text(r))}
          onClose={() => { setTakeBar(null); scrollRef.current?.focus({ preventScroll: true }) }}
          onTake={o => { takeRefs([rep.ref(rubric)], o) }}
        />
      )}
      {tip && (
        <div className="rv-tip" role="tooltip" style={{ left: tip.x, top: tip.y + 4 }}>
          <b>{catalog.remedy(tip.id).name}</b>
          <span>{catalog.remedy(tip.id).abbrev} · <span className={`g${tip.grade}`}>{GRADE_LABEL[tip.grade]}</span></span>
          <span className="rv-tip-hint">Click to highlight · double-click to open</span>
        </div>
      )}
      {chooser != null && (
        <ChapterChooser
          rep={rep}
          recent={tab.recent ?? []}
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
function DisplaySeg({ value, onChange }: { value: 'count' | 'remedies' | 'names'; onChange: (m: 'count' | 'remedies' | 'names') => void }) {
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
}

function TakeButton({ onMenu }: { onMenu: (el: HTMLElement, items: MenuItem[]) => void }) {
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
}

function TakeBar({ initial, path, onClose, onTake }: { initial: string; path: string[]; onClose: () => void; onTake: (o: TakeOptions) => void }) {
  const [value, setValue] = useState(initial)
  const parsed = parseTake(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
  }, [])
  const leaf = path[path.length - 1] ?? ''
  const parents = path.slice(0, -1)
  const status = parsed.ok ? describeTake(parsed.options) : parsed.error
  return (
    <div className="rv-takebar" role="dialog" aria-label="Take rubric">
      <div className="rv-takebar-in">
      <ClipboardPlus size={14} className="rv-takebar-icon" />
      <input
        ref={inputRef}
        className="input rv-takebar-input"
        aria-label="Take command"
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={e => setValue(e.target.value)}
        onBlur={onClose}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
          else if (e.key === 'Enter') {
            e.preventDefault()
            if (parsed.ok) { onClose(); onTake(parsed.options) }
          } else if (e.key === 'Backspace' && value.length <= 1) { e.preventDefault(); onClose() }
        }}
      />
      <span className="rv-takebar-rubric" title={path.join(' › ')}>
        {parents.length > 0 && <span className="rv-takebar-parents">{parents.join(' › ')} ›&nbsp;</span>}
        <b className="rv-takebar-leaf">{leaf}</b>
      </span>
      <span className={`rv-takebar-status${parsed.ok ? '' : ' err'}`} title={status}>{status}</span>
      <span className="rv-takebar-help"><b>+2</b> intensity · <b>&gt;3</b> clipboard · <b>!</b> elim. · <b>x</b> excl. · <b>a</b> group · <b>/s</b> sub-rubrics · <kbd className="kbd">↵</kbd> take · <kbd className="kbd">Esc</kbd></span>
      </div>
    </div>
  )
}

function ChapterChooser({ rep, recent, initial, onClose, onPick }: { rep: Repertory; recent: readonly number[]; initial: string; onClose: () => void; onPick: (i: number) => void }) {
  const [q, setQ] = useState(initial)
  const [active, setActive] = useState(0)
  const all = useMemo(() => rep.chapters.map(c => ({ id: c, name: rep.text(c) })), [rep])
  // chapters of recently read rubrics, most recent first: preferred among equal matches
  const recentChapters = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of recent) { const c = rep.chapterRoot(Math.min(r, rep.size - 1)); if (!m.has(c)) m.set(c, m.size) }
    return m
  }, [recent, rep])
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

/**
 * Symptom path. When it does not fit, crumbs fold into "…" menus in priority order (repertory
 * title, then middle levels, then the chapter); the last two levels always stay whole.
 */
function Crumbs({ rep, rubric, onMenu }: { rep: Repertory; rubric: number; onMenu: (el: HTMLElement, items: MenuItem[]) => void }) {
  const navRef = useRef<HTMLElement>(null)
  const lineage = rep.lineage(rubric)
  const [width, setWidth] = useState(0)
  const key = `${rep.abbrev}:${rubric}:${width}`
  const [fold, setFold] = useState({ key, n: 0 })
  const n = fold.key === key ? fold.n : 0
  const order = crumbCollapseOrder(lineage.length + 1)
  const hidden = new Set(order.slice(0, n))
  const settled = n >= order.length

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(() => setWidth(Math.round(nav.clientWidth)))
    ro.observe(nav)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || n >= order.length) return
    if (nav.scrollWidth > nav.clientWidth + 1) setFold({ key, n: n + 1 })
  }, [key, n, order.length])

  // item 0 is the repertory title, item x > 0 is lineage[x - 1]
  const itemLabel = (x: number) => (x === 0 ? rep.info.title : rep.text(lineage[x - 1]))
  const openItem = (x: number) => (x === 0 ? runCommand('repertory.toc') : actions.openDialog('repertory.find', { repertory: rep.abbrev, from: lineage[x - 1] }))
  const runs = hiddenRuns(lineage.length + 1, hidden)
  const parts: React.ReactNode[] = []
  for (let x = 0; x <= lineage.length; x++) {
    const run = runs.find(r => r[0] === x)
    const sep = x > 0 && <span className="rv-sep" aria-hidden="true">›</span>
    if (run) {
      parts.push(
        <span key={`f${x}`} className="rv-crumb-wrap rv-crumb-fold">
          {sep}
          <button
            className="rv-crumb rv-crumb-more" aria-haspopup="menu" aria-label={`${run.length} more level${run.length === 1 ? '' : 's'}: ${run.map(itemLabel).join(' › ')}`}
            title={run.map(itemLabel).join(' › ')}
            onClick={e => onMenu(e.currentTarget, [{ type: 'label', label: 'Go to level' }, ...run.map(y => ({ label: y === 0 ? `${itemLabel(y)} (repertories)` : itemLabel(y), run: () => openItem(y) }))])}
          ><Ellipsis size={13} /></button>
        </span>,
      )
      x = run[run.length - 1]
      continue
    }
    if (hidden.has(x)) continue
    const last = x === lineage.length
    parts.push(
      <span key={x} className={`rv-crumb-wrap${last ? ' rv-crumb-wrap-last' : ''}`}>
        {sep}
        <button
          className={`rv-crumb${x === 0 ? ' rv-crumb-rep' : ''}${last ? ' rv-crumb-last' : ''}`}
          title={x === 0 ? 'Repertories table of contents (Ctrl+1)' : `${itemLabel(x)}: find from here (F3)`}
          onClick={() => openItem(x)}
        >{itemLabel(x)}</button>
      </span>,
    )
  }
  return <nav className={`rv-crumbs${settled ? ' rv-crumbs-fit' : ''}`} ref={navRef} aria-label="Symptom path">{parts}</nav>
}

/**
 * Book running head: where the top of the page is. Shows the parents of the rubric at the top
 * once they have scrolled away, and "(continued)" when that rubric itself started above the page
 * (a chapter heading's or main rubric's long remedy block). It follows the scroll position itself,
 * re-rendering only when the rubric at the top or its "continued" state changes.
 */
function RunningHead({ rep, offsets, start, count, scrollEl, onGo }: { rep: Repertory; offsets: Float64Array; start: number; count: number; scrollEl: HTMLElement | null; onGo: (i: number) => void }) {
  const [at, setAt] = useState<{ k: number; continued: boolean } | null>(null)
  useLayoutEffect(() => {
    if (!scrollEl) return
    const update = () => {
      const top = scrollEl.scrollTop
      const next = count <= 0 || top <= 0 ? null : (() => { const k = indexAt(offsets, count, top + 4); return { k, continued: top - offsets[k] > 20 } })()
      setAt(a => (a?.k === next?.k && a?.continued === next?.continued ? a : next))
    }
    update()
    scrollEl.addEventListener('scroll', update, { passive: true })
    return () => scrollEl.removeEventListener('scroll', update)
  }, [scrollEl, offsets, count])
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
