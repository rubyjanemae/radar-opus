import { memo, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  AlertCircle, BarChart3, ChevronDown, CircleHelp, ClipboardPlus, Download, ExternalLink, FolderSearch, History, ListTree, Loader2, Pill,
  Search, TextSearch, X,
} from 'lucide-react'
import { formatKeys, isMac, runCommand } from '../../commands/registry'
import { useCatalog } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { RubricRef } from '../../data/types'
import type { Weight } from '../../engine/model'
import { actions, useApp } from '../../state/store'
import type { SearchTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { copyRubric, ensureClipboard, goToRef, openTakeOptions, takeRefs, takeToast, toggleBookmark } from '../repertory/ops'
import { DEFAULT_TAKE, bookAbbrev } from '../repertory/take'
import type { TakeOptions } from '../repertory/take'
import { useFixedVirtual } from '../repertory/virtual'
import { SearchAborted, cachedHighlighter, remedyFrequencySliced, searchSliced } from './engine'
import type { RemedyFrequency, SearchResult } from './engine'
import { TakeBar, replayKey } from '../repertory/TakeBar'
import '../repertory/repertory.css'
import { describeQuery } from './query'
import { GradeBar, RemedyPicker, gradeBreakdown, RubricPath, titleIfTruncated } from './components'
import { prepare, readyTargets, remedyResolver, selection, tabRepertories, tabRubrics, useSearchSel } from './ops'
import { filterByRemedy, firstHit, hitRows, refsBetween, remedyRows, rowRef, stepCursor, textRows } from './rows'
import type { HeadRow, HitRow, Row } from './rows'
import { useWidth } from '../mm/useWidth'
import { RUBRIC_MIME } from '../clipboard/logic'
import './search.css'

export function SearchView({ tab }: { tab: SearchTab }) {
  const catalog = useCatalog()
  const mode = tab.mode ?? 'text'
  const scope = tab.scope ?? 'repertory'
  const [version, setVersion] = useState(0)
  // a load error belongs to the load it came from; a new scope/mode/attempt hides it (derived, no effect reset)
  const [loadErr, setLoadErr] = useState<{ key: string, msg: string } | null>(null)
  // bumped by Retry so the prepare() effect runs again and re-requests the failed repertory
  const [attempt, setAttempt] = useState(0)
  const repKey = tabRepertories(tab).join(',')
  const loadKey = `${repKey}|${scope}|${mode}|${attempt}`
  const loadError = loadErr?.key === loadKey ? loadErr.msg : null
  const renderedPending = useRef(false)

  // make sure every repertory in scope is loaded and indexed
  useEffect(() => {
    let alive = true
    const { pending } = readyTargets(tab)
    // The background warm-up may have finished the index between render and this effect: re-read the targets.
    if (!pending.length) { if (renderedPending.current) setVersion(v => v + 1); return }
    // results for the newly indexed repertories render in a transition (typing keeps priority)
    prepare(pending, mode).then(() => { if (alive) startTransition(() => setVersion(v => v + 1)) }, e => alive && setLoadErr({ key: loadKey, msg: e instanceof Error ? e.message : String(e) }))
    return () => { alive = false }
  }, [repKey, scope, mode, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<SearchTab>) => actions.updateTab<SearchTab>(tab.id, patch)
  const { targets, pending } = useMemo(() => readyTargets(tab), [repKey, scope, mode, tab.chapter, version]) // eslint-disable-line react-hooks/exhaustive-deps
  renderedPending.current = pending.length > 0

  return (
    <div className="srch" data-mode={mode}>
      <div className="srch-top">
        <div className="srch-modes" role="tablist" aria-label="Search type">
          <button role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'on' : ''} onClick={() => update({ mode: 'text' })} title={`Word search (${formatKeys('F4')})`}>
            <TextSearch size={14} /> Words
          </button>
          <button role="tab" aria-selected={mode === 'remedy'} className={mode === 'remedy' ? 'on' : ''} onClick={() => update({ mode: 'remedy' })} title={`Remedy search (${formatKeys('F5')})`}>
            <Pill size={14} /> Remedy
          </button>
        </div>
        {mode === 'text' ? <TextQueryBar tab={tab} /> : <RemedyQueryBar tab={tab} />}
      </div>
      <ScopeBar tab={tab} />
      {loadError ? (
        <div className="error-state"><h3>Could not load a repertory</h3><pre>{loadError}</pre><button className="btn" onClick={() => { setLoadErr(null); setAttempt(a => a + 1); setVersion(v => v + 1) }}>Retry</button></div>
      ) : pending.length && !targets.length ? (
        <div className="empty-state"><Loader2 className="spin" size={18} /><strong>Preparing search</strong>Loading and indexing {pending.map(a => catalog.repertoryInfos.find(r => r.abbrev === a)?.title ?? a).join(', ')}…</div>
      ) : mode === 'text' ? <TextResults tab={tab} targets={targets} pendingCount={pending.length} version={version} /> : <RemedyResults tab={tab} targets={targets} version={version} />}
    </div>
  )
}

// ───────────────────────── query bars ─────────────────────────

function TextQueryBar({ tab }: { tab: SearchTab }) {
  const recent = useApp(s => s.recentSearches)
  const [help, setHelp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="srch-qbar">
      <div className="srch-qwrap">
        <Search size={15} className="srch-qicon" aria-hidden />
        <input
          ref={inputRef}
          data-search-input
          className="srch-q"
          aria-label="Search query"
          placeholder="Words in rubric paths: fear night | anxiety ! dogs, “phrase”, prefix*, #lach"
          value={tab.query}
          list={`srch-recent-${tab.id}`}
          spellCheck={false}
          autoComplete="off"
          autoFocus={!tab.query}
          onChange={e => actions.updateTab<SearchTab>(tab.id, { query: e.target.value })}
          onBlur={() => actions.addRecentSearch(tab.query)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.altKey) {
              // run the search (it runs as you type; Enter waits for the current query) and move to the first result
              e.preventDefault()
              actions.addRecentSearch(tab.query)
              if (tab.query.trim()) requestResultsFocus(tab.id, true)
            } else if (e.key === 'ArrowDown') {
              if (tab.query.trim()) { e.preventDefault(); requestResultsFocus(tab.id, false) }
            } else if (e.key === 'Escape' && tab.query) { e.preventDefault(); e.stopPropagation(); actions.updateTab<SearchTab>(tab.id, { query: '' }) }
          }}
        />
        <datalist id={`srch-recent-${tab.id}`}>{recent.map(r => <option key={r} value={r} />)}</datalist>
        {tab.query && <button className="icon-btn srch-qclear" aria-label="Clear query" onClick={() => { actions.updateTab<SearchTab>(tab.id, { query: '' }); inputRef.current?.focus() }}><X size={13} /></button>}
      </div>
      <button className="icon-btn" aria-label="Query syntax" aria-pressed={help} aria-expanded={help} title="Query syntax" onClick={() => setHelp(h => !h)}><CircleHelp size={15} /></button>
      {help && <SyntaxHelp onClose={() => { setHelp(false); inputRef.current?.focus() }} />}
    </div>
  )
}

function SyntaxHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['fear night', 'both words (AND; also “fear & night”)'],
    ['fear | anxiety', 'either word (OR)'],
    ['dream cats ! dogs', 'without a word (NOT; also -dogs)'],
    ['"as if"  "night agg"', 'phrase: consecutive words in this order'],
    ['worse  better', 'modalities: same as agg. / amel.'],
    ['burn*  *ache  *rehe*', 'wildcards: starts with, ends with, contains'],
    ['(fear | anxiety) alone', 'grouping'],
    ['#lach  #lach:3', 'rubrics containing a remedy (minimum grade)'],
  ]
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!ref.current?.contains(t) && !t.closest('[aria-label="Query syntax"]')) closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current() } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [])
  return (
    <div className="srch-help" role="note" aria-label="Query syntax help" ref={ref}>
      <div className="srch-help-head"><b>Query syntax</b><button className="icon-btn" aria-label="Close syntax help" onClick={onClose}><X size={13} /></button></div>
      <table><tbody>{rows.map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}</tbody></table>
      <p>Words match anywhere in the rubric path (chapter, rubric and sub-rubrics), ignoring case and accents. A word without * also finds its inflections: <i>fear</i> finds <i>fears</i> and <i>feared</i>.</p>
      <p>A phrase reads the path as one line, so <i>"fear night"</i> finds <i>Mind, fear, night</i>. Repertories put the modality last (<i>night, agg.</i>), so search <i>night worse</i> rather than <i>"worse at night"</i>.</p>
    </div>
  )
}

function RemedyQueryBar({ tab }: { tab: SearchTab }) {
  const update = (patch: Partial<SearchTab>) => actions.updateTab<SearchTab>(tab.id, patch)
  return (
    <div className="srch-qbar srch-rbar">
      <RemedyPicker value={tab.remedyId ?? null} onChange={id => update({ remedyId: id })} autoFocus={tab.remedyId == null} id={`srch-rp-${tab.id}`} />
      {/* keeps the field the same width as the word query, which has the syntax-help button here */}
      <span className="srch-qbar-spacer" aria-hidden />
    </div>
  )
}

function RemedyFilters({ tab }: { tab: SearchTab }) {
  const update = (patch: Partial<SearchTab>) => actions.updateTab<SearchTab>(tab.id, patch)
  return (
    <>
      <span className="srch-vsep" />
      <label className="srch-field">
        <span>Grade</span>
        <select className="select" value={tab.minGrade ?? 1} onChange={e => update({ minGrade: Number(e.target.value) })} aria-label="Minimum grade">
          <option value={1}>all (1–4)</option>
          <option value={2}>2 and higher</option>
          <option value={3}>3 and higher</option>
          <option value={4}>4 only</option>
        </select>
      </label>
      <label className="srch-field">
        <span>Max rubric size</span>
        <input className="input srch-num" type="number" min={0} step={1} value={tab.maxSize || ''} placeholder="any" aria-label="Maximum rubric size"
          onChange={e => update({ maxSize: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
      </label>
      <label className="srch-field" title="Only rubrics with at most this many other remedies of the same or a higher grade">
        <span>Max co-remedies</span>
        <input className="input srch-num" type="number" min={0} step={1} value={(tab.maxCo ?? -1) < 0 ? '' : tab.maxCo} placeholder="any" aria-label="Maximum co-remedies"
          onChange={e => update({ maxCo: e.target.value === '' ? -1 : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
      </label>
    </>
  )
}

function ScopeBar({ tab }: { tab: SearchTab }) {
  const catalog = useCatalog()
  const scope = tab.scope ?? 'repertory'
  const rep = catalog.repertory(tab.repertories[0] ?? '')
  const update = (patch: Partial<SearchTab>) => actions.updateTab<SearchTab>(tab.id, patch)
  const chapterRoot = rep && tab.chapter != null && tab.chapter < rep.size ? rep.chapterRoot(tab.chapter) : rep?.chapters[0] ?? 0
  return (
    <div className="srch-scope">
      <FolderSearch size={14} aria-hidden />
      <label className="srch-field">
        <span>Search in</span>
        <select className="select" aria-label="Search scope" value={scope} onChange={e => update({ scope: e.target.value as SearchTab['scope'], chapter: e.target.value === 'chapter' ? chapterRoot : tab.chapter })}>
          <option value="repertory">One repertory</option>
          <option value="chapter">One chapter</option>
          <option value="all">All repertories</option>
        </select>
      </label>
      {scope !== 'all' && (
        <select className="select" aria-label="Repertory" value={tab.repertories[0] ?? ''} onChange={e => update({ repertories: [e.target.value], chapter: undefined })}>
          {catalog.repertoryInfos.map(r => <option key={r.abbrev} value={r.abbrev}>{r.title}</option>)}
        </select>
      )}
      {scope === 'chapter' && rep && (
        <select className="select" aria-label="Chapter" value={chapterRoot} onChange={e => update({ chapter: Number(e.target.value) })}>
          {rep.chapters.map(c => <option key={c} value={c}>{rep.text(c)}</option>)}
        </select>
      )}
      {tab.mode === 'remedy' && <RemedyFilters tab={tab} />}
      {(tab.mode ?? 'text') === 'text' && (
        <label className="srch-check" title="Hide rubrics whose parent rubric also matches">
          <input type="checkbox" checked={!!tab.collapse} onChange={e => update({ collapse: e.target.checked })} /> Hide sub-rubrics of matches
        </label>
      )}
    </div>
  )
}

// ───────────────────────── results ─────────────────────────

type Targets = ReturnType<typeof readyTargets>['targets']

function TextResults({ tab, targets, pendingCount, version }: { tab: SearchTab; targets: Targets; pendingCount: number; version: number }) {
  const recent = useApp(s => s.recentSearches)
  // The search runs in ~8 ms slices (searchSliced) so typing never waits for it; a newer query
  // aborts the one in flight. The rows shown meanwhile are the previous query's, marked busy.
  const input: TextJob = { query: tab.query, targets, collapse: !!tab.collapse, version }
  const [done, setDone] = useState<{ job: TextJob; result: SearchResult } | null>(null)
  useEffect(() => {
    const job: TextJob = { query: tab.query, targets, collapse: !!tab.collapse, version }
    if (!job.query.trim()) return
    const ac = new AbortController()
    searchSliced(job.query, job.targets, { collapse: job.collapse, resolveRemedy: remedyResolver }, ac.signal).then(
      result => { if (!ac.signal.aborted) startTransition(() => setDone({ job, result })) },
      e => { if (!(e instanceof SearchAborted)) throw e },
    )
    return () => ac.abort()
  }, [tab.query, targets, tab.collapse, version])
  const current = !!done && sameJob(done.job, input)
  const result = done?.result ?? null
  const hl = useMemo(() => (result?.parsed.positive.length ? cachedHighlighter(result.parsed) : null), [result])
  const rows = useMemo(() => (result ? textRows(result.hits) : NO_ROWS), [result])

  // Enter / ↓ in the query box: focus the first result once the results are those of the typed query
  const [focusReq, setFocusReq] = useState<{ n: number; first: boolean } | null>(null)
  useEffect(() => onResultsFocusRequest(tab.id, first => setFocusReq(r => ({ n: (r?.n ?? 0) + 1, first }))), [tab.id])
  const [focusToken, setFocusToken] = useState<{ n: number; first: boolean } | null>(null)
  if (focusReq && current && focusToken?.n !== focusReq.n) setFocusToken(focusReq)

  if (!tab.query.trim()) {
    return (
      <div className="srch-empty">
        <TextSearch size={28} strokeWidth={1.5} />
        <strong>Search rubrics by words</strong>
        <span>Type words from a symptom. Results update as you type; <kbd className="kbd">↵</kbd> moves to the list.</span>
        {recent.length > 0 && (
          <div className="srch-recent" role="list" aria-label="Recent searches">
            <div className="srch-recent-head"><History size={13} /> Recent searches <button className="btn btn-ghost btn-sm" onClick={() => runCommand('search.clearRecent')}>Clear</button></div>
            {recent.slice(0, 10).map(r => (
              <button key={r} role="listitem" className="srch-recent-item" onClick={() => actions.updateTab<SearchTab>(tab.id, { query: r })}>{r}</button>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (!result) return <div className="srch-empty" role="status"><Loader2 className="spin" size={18} /><span>Searching…</span></div>
  return (
    <ResultsBody
      tab={tab}
      rows={rows}
      hitCount={result.total}
      hl={hl}
      busy={!current}
      focusToken={focusToken}
      status={
        <>
          {result.error ? <span className="srch-err"><AlertCircle size={13} /> {result.error}</span> : <span className="srch-desc">{describeQuery(result.parsed)}</span>}
          {pendingCount > 0 && <span className="srch-pend"><Loader2 size={12} className="spin" /> indexing {pendingCount} more…</span>}
        </>
      }
      ms={result.ms}
      multiRep={targets.length > 1}
      emptyText={result.error ? 'Fix the query to see results.' : `No rubric matches “${(done?.job.query ?? tab.query).trim()}”.`}
    />
  )
}

interface RemedyJob { remedyId: number; minGrade?: number; maxSize?: number; maxCo?: number; targets: Targets; version: number }

interface TextJob { query: string; targets: Targets; collapse: boolean; version: number }
const sameJob = (a: TextJob, b: TextJob) => a.query === b.query && a.targets === b.targets && a.collapse === b.collapse && a.version === b.version
const NO_ROWS: Row[] = []

/** Query box → results list: "focus the results (first row) when they are up to date". */
const focusListeners = new Map<string, (first: boolean) => void>()
function requestResultsFocus(tabId: string, first: boolean) { focusListeners.get(tabId)?.(first) }
function onResultsFocusRequest(tabId: string, fn: (first: boolean) => void) {
  focusListeners.set(tabId, fn)
  return () => { if (focusListeners.get(tabId) === fn) focusListeners.delete(tabId) }
}

function RemedyResults({ tab, targets, version }: { tab: SearchTab; targets: Targets; version: number }) {
  const catalog = useCatalog()
  const job = useMemo<RemedyJob | null>(
    () => (tab.remedyId == null ? null : { remedyId: tab.remedyId, minGrade: tab.minGrade, maxSize: tab.maxSize, maxCo: tab.maxCo, targets, version }),
    [tab.remedyId, tab.minGrade, tab.maxSize, tab.maxCo, targets, version],
  )
  // The tab paints first (picker, filters, "finding rubrics"); the rubrics are then gathered in a
  // task after the paint from the remedy's slice of the cached remedy index, so opening (F5, "Find
  // rubrics") and changing a filter never block input. Timing happens there, not during render.
  const [done, setDone] = useState<{ job: RemedyJob; rows: Row[]; count: number; ms: number } | null>(null)
  useEffect(() => {
    if (!job) return
    let alive = true
    const id = setTimeout(() => {
      const t0 = performance.now()
      const { rows, count } = remedyRows(job.targets, job.remedyId, job)
      const ms = performance.now() - t0
      if (alive) startTransition(() => setDone({ job, rows, count, ms }))
    }, 0)
    return () => { alive = false; clearTimeout(id) }
  }, [job])
  const result = done

  if (tab.remedyId == null) {
    return (
      <div className="srch-empty">
        <Pill size={28} strokeWidth={1.5} />
        <strong>Find the rubrics of a remedy</strong>
        <span>Pick a remedy above, then narrow by grade, rubric size and the number of co-remedies of the same or a higher grade.</span>
      </div>
    )
  }
  const r = catalog.remedy(tab.remedyId)
  if (!result || result.job.remedyId !== tab.remedyId) {
    return <div className="srch-empty" role="status"><Loader2 className="spin" size={18} /><span>Finding the rubrics of {r.abbrev}…</span></div>
  }
  return (
    <ResultsBody
      tab={tab}
      rows={result.rows}
      hitCount={result.count}
      hl={null}
      ms={result.ms}
      busy={result.job !== job}
      multiRep={targets.length > 1}
      status={<span className="srch-desc"><b>{r.abbrev}</b> {r.name}{(tab.minGrade ?? 1) > 1 ? ` · grade ≥ ${tab.minGrade}` : ''}{tab.maxSize ? ` · ≤ ${tab.maxSize} remedies` : ''}{(tab.maxCo ?? -1) >= 0 ? ` · ≤ ${tab.maxCo} co-remedies` : ''}</span>}
      emptyText={`No rubric of ${r.abbrev} passes these filters.`}
    />
  )
}

interface BodyProps {
  tab: SearchTab
  rows: Row[]
  hitCount: number
  hl: ((n: string) => boolean) | null
  status: React.ReactNode
  ms: number
  /** A newer query or filter is being computed (the rows shown are the previous ones). */
  busy?: boolean
  /** Changes when the query box asks for the list: focus it (on the first result when `first`). */
  focusToken?: { n: number; first: boolean } | null
  multiRep: boolean
  emptyText: string
}

/** Results of one search: selection, cursor, keyboard, take/open actions and the summary. */
function ResultsBody({ tab, rows: allRows, hitCount, hl, status, ms, busy, focusToken, multiRep, emptyText }: BodyProps) {
  const [showRemedies, setShowRemedies] = useState(false)
  // the summary shows by default only when the results keep a readable width; a click overrides
  const [summaryPref, setSummaryPref] = useState<boolean | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [bodyWidth, bodyWidthRef] = useWidth(bodyRef)
  const roomy = bodyWidth === 0 || bodyWidth >= SUMMARY_AUTO_MIN
  const showSummary = summaryPref ?? roomy
  const [remFilter, setRemFilter] = useState<number | null>(null)
  // new results clear the remedy filter (adjusted during render, not in an effect)
  const [remFor, setRemFor] = useState(allRows)
  if (remFor !== allRows) { setRemFor(allRows); setRemFilter(null) }
  const catalog = useCatalog()
  const selected = useSearchSel(s => s.selected[tab.id]) ?? EMPTY
  const selSet = useMemo(() => new Set(selected), [selected])
  const menu = useContextMenu()

  // filter by a remedy picked in the summary
  const rows = useMemo(() => filterByRemedy(allRows, remFilter) as Row[], [allRows, remFilter])
  const hits = useMemo(() => hitRows(rows), [rows])

  // prune selection to what is still listed
  useEffect(() => {
    const cur = selection.get(tab.id)
    if (!cur.length) return
    const listed = new Set(hitRows(allRows).map(rowRef))
    const keep = cur.filter(r => listed.has(r))
    if (keep.length !== cur.length) selection.set(tab.id, keep)
  }, [allRows, tab.id])

  const ROW = showRemedies ? 44 : 26
  const listRef = useRef<HTMLDivElement>(null)
  const v = useFixedVirtual(listRef, rows.length, ROW, 8, { deferScroll: true })
  const [cursor, setCursor] = useState(() => firstHit(rows))
  // new rows put the cursor on the first hit (adjusted during render, not in an effect)
  const [cursorFor, setCursorFor] = useState(rows)
  if (cursorFor !== rows) { setCursorFor(rows); setCursor(firstHit(rows)) }
  const cur = Math.min(cursor, Math.max(0, rows.length - 1))
  useEffect(() => {
    const r = rows[cur]
    selection.focus(tab.id, r?.t === 'hit' ? rowRef(r) : null)
  }, [rows, cur, tab.id])
  useEffect(() => () => selection.focus(tab.id, null), [tab.id])
  useEffect(() => { v.scrollToIndex(cur) }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  // Enter in the query box: the cursor goes to the first result and the list takes the focus
  useEffect(() => {
    if (!focusToken) return
    if (focusToken.first) setCursor(firstHit(rows))
    listRef.current?.focus()
  }, [focusToken]) // eslint-disable-line react-hooks/exhaustive-deps
  // the `+` take bar (as in the book): open with the key that started the command
  const [takeBar, setTakeBar] = useState<string | null>(null)

  const curHit = rows[cur]?.t === 'hit' ? rows[cur] as HitRow : null
  const targetRefs = (): RubricRef[] => selected.length ? selected : (curHit ? [rowRef(curHit)] : [])
  const open = (r: Row | undefined, newTab = false) => {
    if (!r || r.t !== 'hit') return
    if (tab.mode !== 'remedy') actions.addRecentSearch(tab.query)
    void goToRef(rowRef(r), { newTab })
  }
  const take = (weight: Weight, refs = targetRefs()) => { if (refs.length) takeRefs(refs, { ...DEFAULT_TAKE, weight }) }
  const takeCombined = (refs = targetRefs()) => {
    if (refs.length < 2) return take(1, refs)
    const label = tab.mode === 'remedy' ? `${catalog.remedy(tab.remedyId ?? 0).abbrev}: ${refs.length} rubrics` : `${tab.query.trim()} (${refs.length} rubrics)`
    // creating the clipboard (if none) and adding the symptom are one undo step
    const run = () => {
      const cb = ensureClipboard(null)
      return cb && actions.addSymptom(cb.id, { rubrics: refs, combine: 'union', label }) ? cb : null
    }
    const pastBefore = useApp.getState().past
    const cb = actions.transaction(run, 'Take combined symptom')
    if (!cb) return
    // the standard take toast (merges with fast takes); Undo only while this take is still the latest change
    const entry = useApp.getState().past !== pastBefore ? useApp.getState().past[useApp.getState().past.length - 1] : null
    const undo = () => { const past = useApp.getState().past; if (entry && past[past.length - 1] === entry) actions.undo() }
    takeToast({ count: 1, target: cb.name, last: `${label}, combined` }, `Taken ${refs.length} rubrics as one combined symptom → ${cb.name}`, undo)
  }
  const move = (target: number) => setCursor(stepCursor(rows, cur, target))
  const selectAlso = (refs: RubricRef[]) => selection.set(tab.id, [...new Set([...selected, ...refs])])

  const rowMenu = (r: HitRow): MenuItem[] => {
    const ref = rowRef(r)
    const refs = selSet.has(ref) ? selected : [ref]
    const n = refs.length
    const what = n > 1 ? `${n} selected rubrics` : 'rubric'
    return [
      { label: 'Open in repertory', keys: 'Enter', run: () => open(r) },
      { label: 'Open in new tab', keys: 'Mod+Enter', run: () => open(r, true) },
      { type: 'separator' },
      { label: `Take ${what}`, keys: 'Insert', run: () => take(1, refs) },
      { label: 'Take with intensity', submenu: ([2, 3, 4] as Weight[]).map(w => ({ label: `Intensity ${w}`, run: () => take(w, refs) })) },
      { label: 'Take with options…', keys: 'F6', run: () => openTakeOptions(refs) },
      { label: 'Take as one combined symptom', disabled: n < 2, run: () => takeCombined(refs) },
      { type: 'separator' },
      { label: selSet.has(ref) ? 'Deselect' : 'Select', keys: 'Space', run: () => selection.toggle(tab.id, ref) },
      { label: 'Copy rubric with remedies', run: () => void copyRubric(ref, true) },
      { label: 'Copy rubric text', run: () => void copyRubric(ref, false) },
      { label: 'Bookmark', run: () => toggleBookmark(ref) },
    ]
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const mod = isMac ? e.metaKey : e.ctrlKey
    const r = rows[cur]
    let handled = true
    if (e.key === 'ArrowDown') { const k = stepCursor(rows, cur, cur + 1); setCursor(k); if (e.shiftKey) selectAlso(refsBetween(rows, cur, k)) }
    else if (e.key === 'ArrowUp') {
      if (cur <= firstHit(rows)) (e.currentTarget.closest('.srch') as HTMLElement | null)?.querySelector<HTMLElement>('[data-search-input]')?.focus()
      else { const k = stepCursor(rows, cur, cur - 1); setCursor(k); if (e.shiftKey) selectAlso(refsBetween(rows, cur, k)) }
    }
    else if (e.key === 'PageDown') move(cur + v.pageSize)
    else if (e.key === 'PageUp') move(cur - v.pageSize)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(rows.length - 1)
    else if (e.key === ' ') { if (r?.t === 'hit') selection.toggle(tab.id, rowRef(r)) }
    else if ((e.key === '+' || e.key === '=') && !mod && !e.altKey) { if (targetRefs().length) setTakeBar(e.key) }
    else if (e.key === 'Enter') open(r, mod)
    else if (e.key === 'Backspace' && !mod && !e.altKey) {
      // back to the query, to refine it (the caret goes to the end)
      const q = (e.currentTarget.closest('.srch') as HTMLElement | null)?.querySelector<HTMLInputElement>('input[data-search-input]')
      if (q) { q.focus(); const n = q.value.length; q.setSelectionRange?.(n, n) }
    }
    else if (e.key === 'F3' && !mod && !e.altKey && !e.shiftKey) {
      // find from the rubric under the cursor, in its repertory (as F3 in the book)
      if (r?.t === 'hit') actions.openDialog('repertory.find', { repertory: r.rep.abbrev, from: r.index, current: r.index })
    }
    else if (mod && e.key.toLowerCase() === 'a') selection.set(tab.id, hits.map(rowRef))
    else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      const el = listRef.current?.querySelector<HTMLElement>('.srch-row.cursor')
      if (el && r?.t === 'hit') menu.openAt(el, rowMenu(r))
    }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }
  const onRowClick = (e: ReactMouseEvent, k: number) => {
    const r = rows[k]
    if (r.t !== 'hit') return
    const mod = isMac ? e.metaKey : e.ctrlKey
    // the tick box toggles like Ctrl+click
    const onBox = (e.target as HTMLElement).closest('.srch-cb')
    if (e.shiftKey) selectAlso(refsBetween(rows, cur, k))
    else if (mod || onBox) selection.toggle(tab.id, rowRef(r))
    setCursor(k)
  }

  const allSelected = hits.length > 0 && hits.every(h => selSet.has(rowRef(h)))
  const someSelected = selected.length > 0
  const countText = `${hits.length.toLocaleString()}${remFilter != null && hits.length !== hitCount ? ` of ${hitCount.toLocaleString()}` : ''} rubric${hitCount === 1 ? '' : 's'}`

  return (
    <div className={`srch-body${bodyWidth && bodyWidth < 640 ? ' narrow' : ''}`} ref={bodyWidthRef}>
      <div className="srch-main">
        <div className="srch-bar-row">
          <input
            type="checkbox"
            aria-label={allSelected ? 'Deselect all results' : 'Select all results'}
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={() => selection.set(tab.id, allSelected ? [] : hits.map(rowRef))}
            disabled={!hits.length}
          />
          <span className="srch-total">
            <b>{hits.length.toLocaleString()}</b>{remFilter != null && hits.length !== hitCount ? ` of ${hitCount.toLocaleString()}` : ''} rubric{hitCount === 1 ? '' : 's'}
            {someSelected && <> · <b>{selected.length}</b> selected</>}
            <span className="srch-ms">{busy ? <Loader2 size={11} className="spin" aria-label="Updating" /> : `${ms < 1 ? '<1' : ms.toFixed(0)} ms`}</span>
          </span>
          {/* announced politely once the results settle: the count, or that nothing matched */}
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{busy ? '' : rows.length ? countText : emptyText}</span>
          <span className="srch-status">{status}</span>
          {remFilter != null && (
            <button className="srch-chip" onClick={() => setRemFilter(null)} title="Remove remedy filter">
              with {catalog.remedy(remFilter).abbrev} <X size={11} />
            </button>
          )}
          <div className="srch-actions">
            <TakeButton count={targetRefs().length} selected={someSelected} onTake={w => take(w)} onOptions={() => openTakeOptions(targetRefs())} onCombined={() => takeCombined()} />
            <button className="btn btn-sm srch-open" disabled={!curHit} onClick={() => open(rows[cur])} aria-label="Open" title="Open the focused rubric in the repertory (Enter)"><ExternalLink size={12} /><span className="srch-open-label">Open</span></button>
            <button className="icon-btn" aria-label="Show remedies" title="Show remedies under each rubric" aria-pressed={showRemedies} onClick={() => setShowRemedies(s => !s)}><Pill size={14} /></button>
            <button className="icon-btn" aria-label="Result summary" title="Remedy summary chart" aria-pressed={showSummary} onClick={() => setSummaryPref(!showSummary)}><BarChart3 size={14} /></button>
            <button className="icon-btn" aria-label="Export CSV" title="Export results as CSV" disabled={!allRows.length} onClick={() => runCommand('search.export')}><Download size={14} /></button>
          </div>
        </div>
        {rows.length === 0
          ? <div className="srch-empty small"><Search size={20} strokeWidth={1.5} /><span>{emptyText}</span></div>
          : (
            <ResultList
              listRef={listRef} tab={tab} rows={rows} cursor={cur} selSet={selSet} selected={selected} rowHeight={ROW} v={v} hl={hl}
              multiRep={multiRep} showRemedies={showRemedies} remFilter={remFilter}
              onKeyDown={onKeyDown} onRowClick={onRowClick} onCursor={setCursor} onOpen={r => open(r)}
              onMenu={(e, k, r) => { setCursor(k); menu.open(e, rowMenu(r)) }}
            />
          )}
        {takeBar != null && (() => {
          const refs = targetRefs()
          const path = refs.length === 1 && curHit && !selected.length ? curHit.rep.lineage(curHit.index).map(i => curHit.rep.text(i)) : [`${refs.length} selected rubric${refs.length === 1 ? '' : 's'}`]
          return (
            <TakeBar
              initial={takeBar}
              path={path}
              onClose={() => { setTakeBar(null); listRef.current?.focus({ preventScroll: true }) }}
              onTake={(o: TakeOptions) => { if (refs.length) takeRefs(refs, o) }}
              onPass={e => { const el = listRef.current; if (el) replayKey(e, el) }}
            />
          )
        })()}
      </div>
      {showSummary && allRows.length > 0 && (
        <Summary tab={tab} hits={hits} remFilter={remFilter} onFilter={setRemFilter} rowsForChapters={tab.mode === 'remedy' ? rows : null} onJump={k => { setCursor(k + 1); listRef.current?.focus() }} />
      )}
      {menu.element}
    </div>
  )
}

/**
 * The virtualised result listbox. Presentational: rows, cursor and selection come in, gestures go
 * out. Options hold no interactive controls (the tick box is a picture; the row handles clicks).
 */
function ResultList({ listRef, tab, rows, cursor, selSet, selected, rowHeight, v, hl, multiRep, showRemedies, remFilter, onKeyDown, onRowClick, onCursor, onOpen, onMenu }: {
  listRef: React.RefObject<HTMLDivElement | null>
  tab: SearchTab
  rows: Row[]
  cursor: number
  selSet: Set<RubricRef>
  selected: RubricRef[]
  rowHeight: number
  v: ReturnType<typeof useFixedVirtual>
  hl: ((n: string) => boolean) | null
  multiRep: boolean
  showRemedies: boolean
  remFilter: number | null
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void
  onRowClick: (e: ReactMouseEvent, k: number) => void
  onCursor: (k: number) => void
  onOpen: (r: HitRow) => void
  onMenu: (e: ReactMouseEvent, k: number, r: HitRow) => void
}) {
  const ROW = rowHeight
  // position of each rubric row among all rubric rows (chapter headings are not options), for aria-posinset/-setsize
  const pos = useMemo(() => {
    const out = new Int32Array(rows.length)
    let n = 0
    for (let k = 0; k < rows.length; k++) if (rows[k].t === 'hit') out[k] = ++n
    return { at: out, size: n }
  }, [rows])
  // one handler object for every row (its fields always call the latest callbacks), so a row
  // re-renders only when what it shows changes: scrolling or moving the cursor re-renders two rows
  const latest = useRef({ selected, onRowClick, onCursor, onOpen, onMenu })
  latest.current = { selected, onRowClick, onCursor, onOpen, onMenu }
  const on = useMemo<RowHandlers>(() => ({
    selected: () => latest.current.selected,
    click: (e, k) => latest.current.onRowClick(e, k),
    cursor: k => latest.current.onCursor(k),
    open: r => latest.current.onOpen(r),
    menu: (e, k, r) => latest.current.onMenu(e, k, r),
  }), [])
  const items = []
  for (let k = v.start; k < v.end; k++) {
    const r = rows[k]
    if (r.t === 'head') {
      items.push(
        <div key={`h${k}`} className="srch-row srch-head" style={{ top: k * ROW, height: ROW }} role="presentation">
          <ListTree size={13} /> <b>{r.rep.text(r.root)}</b>{multiRep && <span className="srch-repbadge">{r.rep.info.title}</span>}<span className="srch-headcount">{r.count}</span>
        </div>,
      )
      continue
    }
    const ref = rowRef(r)
    items.push(
      <ResultRow
        key={ref}
        r={r}
        k={k}
        id={`srch-${tab.id}-${k}`}
        top={k * ROW}
        height={ROW}
        cursor={k === cursor}
        checked={selSet.has(ref)}
        posinset={pos.at[k]}
        setsize={pos.size}
        hl={hl}
        multiRep={multiRep}
        showRemedies={showRemedies}
        remedyMode={tab.mode === 'remedy'}
        remedyId={tab.remedyId ?? null}
        highlight={remFilter ?? tab.remedyId ?? null}
        on={on}
      />,
    )
  }
  return (
    <div
      ref={listRef}
      className="srch-results"
      tabIndex={0}
      role="listbox"
      aria-multiselectable="true"
      aria-label="Search results"
      aria-activedescendant={rows[cursor] ? `srch-${tab.id}-${cursor}` : undefined}
      onKeyDown={onKeyDown}
    >
      <div style={{ height: v.total, position: 'relative' }}>{items}</div>
    </div>
  )
}

interface RowHandlers {
  selected: () => RubricRef[]
  click: (e: ReactMouseEvent, k: number) => void
  cursor: (k: number) => void
  open: (r: HitRow) => void
  menu: (e: ReactMouseEvent, k: number, r: HitRow) => void
}

/**
 * One result option, memoised: its props are the row (stable for a result set), position, state
 * flags, the per-query highlighter (cached per parsed query) and one stable handler object.
 */
const ResultRow = memo(function ResultRow({ r, k, id, top, height, cursor, checked, posinset, setsize, hl, multiRep, showRemedies, remedyMode, remedyId, highlight, on }: {
  r: HitRow; k: number; id: string; top: number; height: number; cursor: boolean; checked: boolean; posinset: number; setsize: number
  hl: ((n: string) => boolean) | null; multiRep: boolean; showRemedies: boolean; remedyMode: boolean; remedyId: number | null; highlight: number | null; on: RowHandlers
}) {
  const catalog = useCatalog()
  const ref = rowRef(r)
  const parts = r.rep.lineage(r.index).map(i => r.rep.text(i))
  return (
    <div
      id={id}
      role="option"
      aria-selected={checked}
      aria-posinset={posinset}
      aria-setsize={setsize}
      className={`srch-row${cursor ? ' cursor' : ''}${checked ? ' checked' : ''}`}
      style={{ top, height }}
      draggable
      onDragStart={e => {
        const refs = checked ? on.selected() : [ref]
        e.dataTransfer.setData(RUBRIC_MIME, refs.join(' '))
        e.dataTransfer.setData('text/plain', refs.map(x => { const [a, i] = [x.slice(0, x.lastIndexOf(':')), Number(x.slice(x.lastIndexOf(':') + 1))]; const rp = catalog.repertory(a); return rp ? rp.path(i) : x }).join('\n'))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onMouseDown={e => { if (e.button === 0) on.cursor(k) }}
      onClick={e => on.click(e, k)}
      onDoubleClick={e => { if (!(e.target as HTMLElement).closest('.srch-cb')) on.open(r) }}
      onContextMenu={e => on.menu(e, k, r)}
    >
      <div className="srch-line">
        <span className={`srch-cb${checked ? ' on' : ''}`} aria-hidden="true" title={checked ? 'Deselect (Space)' : 'Select (Space)'} />
        <span className="srch-path" onMouseEnter={titleIfTruncated(() => r.rep.path(r.index, ', ') + (multiRep ? ` (${r.rep.info.title})` : ''))}>
          {r.grade && parts.length > 1 ? <RubricPath parts={parts} hit={hl} skip={1} /> : r.grade ? <i className="srch-whole">{parts[0]} (whole chapter)</i> : <RubricPath parts={parts} hit={hl} />}
        </span>
        {r.grade && <span className={`srch-grade g${r.grade}`} title={`Grade ${r.grade}`}>{bookAbbrev(catalog.remedy(remedyId ?? 0).abbrev, r.grade)}</span>}
        {r.co != null && remedyMode && <span className="srch-co" title="Other remedies of the same or a higher grade">+{r.co}</span>}
        {multiRep && !r.grade && <span className="srch-repbadge">{r.rep.info.abbrev}</span>}
        <span className="srch-count" title="Remedies in this rubric">{r.rep.remedyCount(r.index)}</span>
      </div>
      {showRemedies && <RemedyLine rep={r.rep} index={r.index} highlight={highlight} />}
    </div>
  )
})

const EMPTY: RubricRef[] = []
/** Below this body width the summary starts hidden, so rubric paths stay readable. */
const SUMMARY_AUTO_MIN = 760
/** The summary is counted after the results have been stable this long. */
const SUMMARY_DELAY_MS = 250

function RemedyLine({ rep, index, highlight }: { rep: Repertory; index: number; highlight: number | null }) {
  const catalog = useCatalog()
  const list = rep.remedies(index).map(e => ({ ...e, abbrev: catalog.remedy(e.remedyId).abbrev }))
    .sort((a, b) => b.grade - a.grade || a.abbrev.localeCompare(b.abbrev))
  return (
    <div className="srch-rems">
      {list.length === 0 ? <span className="srch-norem">no remedies</span> : list.map(e => (
        <span key={e.remedyId} className={`g${e.grade}${e.remedyId === highlight ? ' srch-remhl' : ''}`}>{bookAbbrev(e.abbrev, e.grade)}</span>
      ))}
    </div>
  )
}

function TakeButton({ count, selected, onTake, onOptions, onCombined }: { count: number; selected: boolean; onTake: (w: Weight) => void; onOptions: () => void; onCombined: () => void }) {
  const menu = useContextMenu()
  const items: MenuItem[] = [
    ...([1, 2, 3, 4] as Weight[]).map(w => ({ label: `Take with intensity ${w}`, run: () => onTake(w) })),
    { type: 'separator' },
    { label: 'Take with options…', keys: 'F6', run: onOptions },
    { label: 'Take as one combined symptom', disabled: count < 2, run: onCombined },
  ]
  return (
    <div className="srch-take">
      <button className="btn btn-sm btn-primary" disabled={!count} onClick={() => onTake(1)} title={selected ? `Take the ${count} selected rubrics into the active clipboard (Insert)` : 'Take the focused rubric into the active clipboard (Insert)'}>
        <ClipboardPlus size={12} /> {selected ? `Take ${count}` : 'Take'}
      </button>
      <button className="btn btn-sm btn-primary srch-take-more" disabled={!count} aria-label="More take options" onClick={e => menu.openAt(e.currentTarget, items)}><ChevronDown size={12} /></button>
      {menu.element}
    </div>
  )
}

// ───────────────────────── summary ─────────────────────────

function Summary({ tab, hits, remFilter, onFilter, rowsForChapters, onJump }: {
  tab: SearchTab
  hits: HitRow[]
  remFilter: number | null
  onFilter: (id: number | null) => void
  rowsForChapters: Row[] | null
  onJump: (rowIndex: number) => void
}) {
  const catalog = useCatalog()
  const tabs = useApp(s => s.tabs)
  const otherSearches = tabs.filter((t): t is SearchTab => t.kind === 'search' && t.id !== tab.id)
  const [view, setView] = useState<'remedies' | 'compare' | 'chapters'>(rowsForChapters ? 'chapters' : 'remedies')
  // counted once the results settle (a 250 ms pause), in slices: typing never waits for the summary
  const [freqFor, setFreqFor] = useState<{ hits: HitRow[]; freq: { top: RemedyFrequency[]; distinct: number } } | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    const id = setTimeout(() => {
      remedyFrequencySliced(hits, 25, ac.signal).then(
        freq => { if (!ac.signal.aborted) startTransition(() => setFreqFor({ hits, freq })) },
        e => { if (!(e instanceof SearchAborted)) throw e },
      )
    }, SUMMARY_DELAY_MS)
    return () => { clearTimeout(id); ac.abort() }
  }, [hits])
  const freq = freqFor?.freq ?? null
  const freqStale = freqFor?.hits !== hits
  const compareKey = otherSearches.map(t => `${t.id}${t.query}${t.remedyId}${t.scope}${t.chapter}${t.collapse}${t.minGrade}${t.maxSize}${t.maxCo}`).join('|')
  const compare = useMemo(() => (view === 'compare' ? compareSearches([tab, ...otherSearches], catalog) : null), [view, tab, compareKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const max = freq?.top[0]?.count ?? 1

  return (
    <aside className="srch-sum" aria-label="Result summary">
      <div className="srch-sum-tabs" role="tablist">
        {rowsForChapters && <button role="tab" aria-selected={view === 'chapters'} className={view === 'chapters' ? 'on' : ''} onClick={() => setView('chapters')}>Chapters</button>}
        <button role="tab" aria-selected={view === 'remedies'} className={view === 'remedies' ? 'on' : ''} onClick={() => setView('remedies')}>{rowsForChapters ? 'Co-remedies' : 'Remedies'}</button>
        {otherSearches.length > 0 && <button role="tab" aria-selected={view === 'compare'} className={view === 'compare' ? 'on' : ''} onClick={() => setView('compare')} title={`Compare remedies across the ${otherSearches.length + 1} open search tabs`}>Compare ({otherSearches.length + 1})</button>}
      </div>
      {view === 'remedies' && (
        <>
          <p className="srch-sum-note" aria-busy={freqStale}>
            {freq ? <>Occurrences in {freqFor!.hits.length.toLocaleString()} rubric{freqFor!.hits.length === 1 ? '' : 's'} · {freq.distinct.toLocaleString()} remedies. Click a bar to filter.</> : <>Counting remedies…</>}
            {freq && freqStale && <Loader2 size={11} className="spin srch-sum-busy" aria-label="Updating" />}
          </p>
          <ol className={`srch-bars${freqStale ? ' stale' : ''}`}>
            {(freq?.top ?? []).filter(f => !rowsForChapters || f.remedyId !== tab.remedyId).map(f => (
              <FreqRow key={f.remedyId} f={f} max={max} active={remFilter === f.remedyId} onClick={() => onFilter(remFilter === f.remedyId ? null : f.remedyId)} onOpen={() => actions.openTab({ kind: 'remedy', remedyId: f.remedyId })} />
            ))}
          </ol>
          <GradeLegend />
        </>
      )}
      {view === 'chapters' && rowsForChapters && (
        <>
          <p className="srch-sum-note">Rubrics of {catalog.remedy(tab.remedyId ?? 0).abbrev} per chapter. Click to jump.</p>
          <ol className="srch-bars srch-chapbars">
            {(() => {
              const heads = rowsForChapters.map((r, k) => ({ r, k })).filter((x): x is { r: HeadRow; k: number } => x.r.t === 'head')
              const m = Math.max(1, ...heads.map(h => h.r.count))
              const multi = new Set(heads.map(h => h.r.rep)).size > 1
              const out: React.ReactNode[] = []
              heads.forEach(({ r, k }, j) => {
                if (multi && (j === 0 || heads[j - 1].r.rep !== r.rep)) {
                  const n = heads.reduce((a, h) => a + (h.r.rep === r.rep ? h.r.count : 0), 0)
                  out.push(<li key={`g${r.rep.abbrev}`} className="srch-bargroup"><span>{r.rep.info.title}</span><span>{n.toLocaleString()}</span></li>)
                }
                out.push(
                  <li key={`${r.rep.abbrev}${r.root}`}>
                    <button className="srch-barrow" onClick={() => onJump(k)} title={`${r.rep.text(r.root)} (${r.rep.info.title}): ${r.count} rubrics`}>
                      <span className="srch-barlabel">{r.rep.text(r.root)}</span>
                      <span className="srch-bartrack"><span className="srch-bar plain" style={{ width: `${Math.max(2, (r.count / m) * 100)}%` }} /></span>
                      <span className="srch-barnum">{r.count}</span>
                    </button>
                  </li>,
                )
              })
              return out
            })()}
          </ol>
        </>
      )}
      {view === 'compare' && compare && (
        <>
          <p className="srch-sum-note">Remedies found in the most of your {compare.searches.length} open searches. Bars show the share of each search’s rubrics that contain the remedy.</p>
          <ol className="srch-legend-searches">
            {compare.searches.map((s, i) => <li key={s.id}><span className={`srch-dot d${i % 6}`} />{s.label}</li>)}
          </ol>
          <ol className="srch-bars">
            {compare.rows.map(r => (
              <li key={r.remedyId}>
                <button className={`srch-barrow${remFilter === r.remedyId ? ' on' : ''}`} onClick={() => onFilter(remFilter === r.remedyId ? null : r.remedyId)} onDoubleClick={() => actions.openTab({ kind: 'remedy', remedyId: r.remedyId })}
                  title={`${catalog.remedy(r.remedyId).name}: in ${r.inSearches} of ${compare.searches.length} searches, ${r.total} rubrics`}>
                  <span className="srch-barlabel">{catalog.remedy(r.remedyId).abbrev}</span>
                  <span className="srch-multibar">
                    {r.per.map((n, i) => {
                      const size = compare.searches[i].items.length
                      return <span key={i} className={`srch-mb d${i % 6}`} style={{ width: `${size ? Math.max(n ? 3 : 0, (n / size) * 100) : 0}%` }} title={`${compare.searches[i].label}: ${n} of ${size} rubrics`} />
                    })}
                  </span>
                  <span className="srch-barnum">{r.inSearches}/{compare.searches.length}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  )
}

function FreqRow({ f, max, active, onClick, onOpen }: { f: RemedyFrequency; max: number; active: boolean; onClick: () => void; onOpen: () => void }) {
  const catalog = useCatalog()
  const r = catalog.remedy(f.remedyId)
  return (
    <li>
      <button className={`srch-barrow${active ? ' on' : ''}`} onClick={onClick} onDoubleClick={onOpen} aria-pressed={active}
        aria-label={`${r.abbrev} ${f.count}: ${gradeBreakdown(f.byGrade)}`}
        title={`${r.name}: ${f.count} rubrics (grade 4: ${f.byGrade[3]}, 3: ${f.byGrade[2]}, 2: ${f.byGrade[1]}, 1: ${f.byGrade[0]}). Double-click for remedy info.`}>
        <span className="srch-barlabel">{r.abbrev}</span>
        <span className="srch-bartrack"><GradeBar byGrade={f.byGrade} max={max} /></span>
        <span className="srch-barnum">{f.count}</span>
        <span className="srch-barbreak" aria-hidden>{gradeBreakdown(f.byGrade)}</span>
      </button>
    </li>
  )
}

function GradeLegend() {
  return (
    <div className="srch-legend" aria-label="Grade legend">
      {[4, 3, 2, 1].map(g => <span key={g}><span className={`srch-bar-seg sb${g}`}><span className="srch-seg-n">{g}</span></span> grade {g}</span>)}
    </div>
  )
}

function compareSearches(tabs: SearchTab[], catalog: Catalog) {
  const searches = tabs.map(t => ({ id: t.id, label: t.mode === 'remedy' ? `rubrics of ${t.remedyId != null ? catalog.remedy(t.remedyId).abbrev : '—'}` : (t.query.trim() || '(empty)'), items: tabRubrics(t) }))
  const map = new Map<number, { remedyId: number; per: number[]; total: number; inSearches: number; share: number }>()
  searches.forEach((s, si) => {
    for (const { rep, index } of s.items) {
      rep.forEachRemedy(index, id => {
        let e = map.get(id)
        if (!e) { e = { remedyId: id, per: searches.map(() => 0), total: 0, inSearches: 0, share: 0 }; map.set(id, e) }
        if (!e.per[si]) e.inSearches++
        e.per[si]++
        e.total++
      })
    }
  })
  // share: mean fraction of each search's rubrics that contain the remedy, so large searches do not dominate
  for (const e of map.values()) e.share = e.per.reduce((a, n, i) => a + (searches[i].items.length ? n / searches[i].items.length : 0), 0) / searches.length
  const rows = [...map.values()].sort((a, b) => b.inSearches - a.inSearches || b.share - a.share).slice(0, 25)
  return { searches, rows }
}
