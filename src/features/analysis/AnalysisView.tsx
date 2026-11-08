import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowLeftRight, Ban, CircleHelp, Filter,
  Highlighter, Info, LoaderCircle, Pin, SlidersHorizontal, TriangleAlert, X,
} from 'lucide-react'
import { getCommand, runCommand } from '../../commands/registry'
import { RO_METHODS, STRATEGIES, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import { actions, DEFAULT_ANALYSIS, useApp } from '../../state/store'
import { SETTINGS_DIALOG } from '../workspace/commands'
import type { AnalysisTab, AnalysisViewMode, RepertoryTab } from '../../state/workspace'
import { MenuList } from '../../ui/Menu'
import type { MenuCloseReason, MenuItem } from '../../ui/Menu'
import { Splitter } from '../../ui/Splitter'
import { AnalysisGrid } from './AnalysisGrid'
import { TreeIcon } from './TreeIcon'
import { BarListIcon, DoubleGearIcon, KingIcon, SwapPolarityIcon, WindowsIcon, YinYangIcon } from './ToolbarIcons'
import { MapsIcon } from '../../shell/toolbarIcons'
import type { StrategyId } from '../../engine/model'
import { hasCustomParams, hasParams, ParamsDrawer } from './ParamsDrawer'
import { columnAbbrev } from './paneLabel'
import { RemedyPanel } from './RemedyPanel'
import * as ops from './ops'
import { useAnalysis } from './useAnalysis'
import { useAutoCollapseClipboard } from './useAutoCollapseClipboard'
import type { LiveAnalysis } from './useAnalysis'
import './analysis.css'

/*
 * Bars and cards load on demand: F8 only pays for the grid. They are prefetched once a result is shown.
 * When the module is already here, the lazy component resolves synchronously (a thenable that calls back
 * at once): a lazy component whose factory returns a promise suspends on its first render even for a
 * loaded module, and React then holds the fallback for its reveal throttle (~300 ms) on the first switch.
 */
let barsModule: typeof import('./AnalysisBars') | null = null
let cardsModule: typeof import('./AnalysisCards') | null = null
const loadBars = () => import('./AnalysisBars').then(m => (barsModule = m))
const loadCards = () => import('./AnalysisCards').then(m => (cardsModule = m))
/** A thenable already resolved to `value`: React.lazy reads it without suspending. */
function resolved<T>(value: T): PromiseLike<T> {
  return { then: <R1 = T, R2 = never>(ok?: ((v: T) => R1 | PromiseLike<R1>) | null) => resolved((ok ? ok(value) : value) as R1) as unknown as PromiseLike<R1 | R2> }
}
const AnalysisBars = lazy(() => (barsModule ? resolved({ default: barsModule.AnalysisBars }) : loadBars().then(m => ({ default: m.AnalysisBars }))) as Promise<{ default: typeof import('./AnalysisBars').AnalysisBars }>)
const GradeLegend = lazy(() => (barsModule ? resolved({ default: barsModule.GradeLegend }) : loadBars().then(m => ({ default: m.GradeLegend }))) as Promise<{ default: typeof import('./AnalysisBars').GradeLegend }>)
const AnalysisCards = lazy(() => (cardsModule ? resolved({ default: cardsModule.AnalysisCards }) : loadCards().then(m => ({ default: m.AnalysisCards }))) as Promise<{ default: typeof import('./AnalysisCards').AnalysisCards }>)
let prefetched = false
/** Bars and cards prefetched; resolves once both modules are evaluated (switching to them then never suspends). */
function prefetchViews(): Promise<void> {
  if (barsModule && cardsModule) return Promise.resolve()
  if (prefetched) return Promise.all([loadBars(), loadCards()]).then(() => {})
  prefetched = true
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 800))
  return new Promise<void>((done, fail) => idle(() => {
    Promise.all([loadBars(), loadCards()]).then(() => done(), e => { prefetched = false; fail(e) })
  }, { timeout: 3000 }))
}

/** Runs `fn` after its Suspense boundary committed (a lazily loaded view is in the DOM). */
function OnMount({ fn }: { fn: () => void }) {
  useEffect(() => { fn() }, [fn])
  return null
}

/**
 * Keeps a display (grid, bars, cards) mounted once it has been shown, so switching back is instant.
 * While hidden it holds its last element: React skips an identical element, so a hidden view does not
 * re-render when the result changes; it catches up when it is shown again. Hidden views stay laid out
 * (visibility, not display) so their scroll position survives, and are inert.
 */
function KeepAlive({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className={`an-keep${active ? ' on' : ''}`} inert={!active} aria-hidden={!active || undefined}><Frozen active={active}>{children}</Frozen></div>
}
/** Renders its children while active; while inactive memo skips it, so it keeps what it last rendered. */
const Frozen = memo(function Frozen({ children }: { active: boolean; children: ReactNode }) {
  return children
}, (_prev, next) => !next.active)

const NO_ROWS: AnalysisRow[] = []
const LIVE = '.an-main > .an-keep.on'
const MAIN_FOCUS = `${LIVE} [data-cell][tabindex="0"], ${LIVE} .an-bar-row[tabindex="0"], ${LIVE} .an-card[tabindex="0"]`

/* Drill-down panel width (resizable; remembered per browser). */
const PANEL_KEY = 'radar.analysis.panelWidth'
const PANEL_MIN = 320, PANEL_MAX = 640, PANEL_DEFAULT = 400
function readPanelWidth(): number {
  try { const v = Number(localStorage.getItem(PANEL_KEY)); return v >= PANEL_MIN && v <= PANEL_MAX ? v : PANEL_DEFAULT } catch { return PANEL_DEFAULT }
}
function savePanelWidth(v: number) {
  try { localStorage.setItem(PANEL_KEY, String(v)) } catch { /* private mode: the width lasts for this session */ }
}

export function AnalysisView({ tab }: { tab: AnalysisTab }) {
  const live = useAnalysis(tab.consultationId, { deferFirst: true })
  const { consultation, result, load, catalog, source } = live
  useAutoCollapseClipboard()
  // Analysis › Show current analysis with symptoms only (F7): the grid's symptom pane, no remedy columns
  const symptomsOnly = !!tab.symptomsOnly
  const view: AnalysisViewMode = symptomsOnly ? 'grid' : tab.view ?? 'grid'
  /*
   * The display shown follows the toolbar's choice in a transition: the segmented control answers at once,
   * and mounting a display for the first time renders time-sliced (like the first grid) while the old one
   * stays up. Displays shown so far stay mounted (KeepAlive), so switching back is only a visibility change.
   */
  const shownView = useDeferredValue(view)
  const [visited, setVisited] = useState<ReadonlySet<AnalysisViewMode>>(() => new Set([shownView]))
  if (!visited.has(shownView)) setVisited(new Set([...visited, shownView]))
  const [paramsOpen, setParamsOpen] = useState(false)
  useEffect(() => ops.onParamsRequest(id => { if (id === tab.id) setParamsOpen(o => !o) }), [tab.id])
  const [panelW, setPanelW] = useState(readPanelWidth)
  const resizePanel = useCallback((v: number) => { setPanelW(v); savePanelWidth(v) }, [])
  // a reveal requested before this tab mounted (F8 from the remedy box / remedy view) is shown on mount
  const [revealReq, setReveal] = useState<{ remedyId: number; nonce: number } | null>(() => {
    const id = ops.peekReveal(tab.id)
    return id === undefined ? null : { remedyId: id, nonce: 0 }
  })
  const selectedRemedy = typeof tab.remedy === 'number' ? tab.remedy : null
  // the highlighted symptom lives on the tab too, so the panel and highlight survive tab switches
  const symptom = typeof tab.symptom === 'number' && result && tab.symptom < result.symptoms.length ? tab.symptom : null
  const setSymptom = useCallback((i: number | null) => actions.updateTab<AnalysisTab>(tab.id, { symptom: i }), [tab.id])
  const activeCaseId = useApp(s => s.activeConsultationId)
  // clipboards folded in the symptom pane, and the remedies matching "Search remedy" (view state of this tab)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const toggleClipboard = useCallback((id: string) => setCollapsed(c => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n }), [])
  // symptoms whose detail line is open (the grey triangle of a symptom row)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const toggleSymptom = useCallback((id: string) => setExpanded(c => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n }), [])
  const [found, setFound] = useState<ReadonlySet<number> | null>(null)

  const selectRemedy = useCallback((id: number | null) => actions.updateTab<AnalysisTab>(tab.id, { remedy: id }), [tab.id])
  const openRemedy = useCallback((id: number) => ops.openRemedyTab(id), [])

  const options = consultation?.analysis
  const limit = options?.limit ?? 30
  // ranked rows within the limit, then pinned remedies (remedy-box jumps beyond the limit)
  const { rows, pinnedExtra } = useMemo(() => {
    const base = result?.rows ?? []
    const pins = tab.pinnedRemedies ?? []
    if (!result || !pins.length) return { rows: base, pinnedExtra: new Set<number>() }
    const shown = new Set(base.map(r => r.remedyId))
    const extra: AnalysisRow[] = []
    for (const id of pins) {
      if (shown.has(id)) continue
      const row = result.all.find(r => r.remedyId === id) ?? result.excludedRows.find(r => r.remedyId === id)
      if (row) { extra.push(row); shown.add(id) }
    }
    return { rows: extra.length ? [...base, ...extra] : base, pinnedExtra: new Set(extra.map(r => r.remedyId)) }
  }, [result, tab.pinnedRemedies])
  const highlighted = options?.highlight
  const highlight = useMemo(() => (highlighted?.length ? new Set(highlighted) : null), [highlighted])
  const selectedRow = symptomsOnly ? null : selectedRemedy != null ? rows.find(r => r.remedyId === selectedRemedy) ?? result?.all.find(r => r.remedyId === selectedRemedy) ?? result?.excludedRows.find(r => r.remedyId === selectedRemedy) ?? null : null


  // jump to a remedy: select it, pin it when beyond the limit, scroll to it and focus it
  const tabRef = useRef(tab)
  useLayoutEffect(() => { tabRef.current = tab })
  const reveal = useCallback((id: number) => {
    ops.pinAndSelect(tabRef.current, id)
    setReveal({ remedyId: id, nonce: Date.now() })
  }, [])
  useEffect(() => {
    // the pending reveal is already in revealReq (initial state): pin and select it in the tab
    const pending = ops.takeReveal(tab.id)
    if (pending !== undefined) ops.pinAndSelect(tabRef.current, pending)
    return ops.onReveal((t, id) => { if (t === tab.id) { ops.takeReveal(t); reveal(id) } })
  }, [tab.id, reveal])

  /*
   * Keyboard focus into the result: requested by F8 (ops.requestFocus) and when the display changes
   * while focus is in the analysis (the old view unmounts). The request waits until the result is
   * rendered, including a lazily loaded bars / cards view.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  // the result pane: the grid reads its size once on mount, so its first render already fills the pane
  const mainRef = useRef<HTMLDivElement>(null)
  const measureMain = useCallback(() => {
    const el = mainRef.current
    return el ? { width: el.clientWidth, height: el.clientHeight } : null
  }, [])
  const wantFocus = useRef(false)
  const loading = load.status === 'loading'
  const tryFocus = useCallback(() => {
    const root = rootRef.current
    if (!wantFocus.current || !root) return
    const target = root.querySelector<HTMLElement>(MAIN_FOCUS)
    if (target) { wantFocus.current = false; target.focus({ preventScroll: false }); return }
    // nothing to focus in the result (empty state, error): its action button, else the view itself, so its keys still work
    const msg = root.querySelector<HTMLElement>('.an-main > .empty-state, .an-main > .error-state')
    if (msg) { wantFocus.current = false; (msg.querySelector<HTMLElement>('button') ?? root).focus() }
  }, [])
  useLayoutEffect(() => {
    if (ops.takeFocus(tab.id)) wantFocus.current = true
    return ops.onFocusRequest(id => { if (id === tab.id && ops.takeFocus(id)) { wantFocus.current = true; tryFocus() } })
  }, [tab.id, tryFocus])
  // the display changed while focus was in the analysis (or nowhere): focus follows into the new view
  const prevView = useRef(shownView)
  useLayoutEffect(() => {
    if (prevView.current === shownView) return
    prevView.current = shownView
    const a = document.activeElement
    if (!a || a === document.body || rootRef.current?.contains(a)) wantFocus.current = true
  }, [shownView])
  useEffect(() => { if (!loading) tryFocus() })
  /** Move keyboard focus into the result (after a toolbar menu choice or closing the drawer). */
  const focusResult = useCallback(() => { wantFocus.current = true; tryFocus() }, [tryFocus])
  // data-views="ready" on the view once the other displays are loaded (a switch to them is then immediate)
  const [viewsReady, setViewsReady] = useState(() => !!(barsModule && cardsModule))
  const hasResult = !!result
  useEffect(() => {
    if (!hasResult || viewsReady) return
    let live = true
    prefetchViews().then(() => { if (live) setViewsReady(true) }, () => {})
    return () => { live = false }
  }, [hasResult, viewsReady])

  const remedyMenu = useCallback((row: AnalysisRow): MenuItem[] => {
    const excluded = options?.excludedRemedies.includes(row.remedyId) ?? false
    return [
      { label: 'Show score details', run: () => selectRemedy(row.remedyId) },
      { label: 'Prescribe…', run: () => ops.prescribe(row.remedyId, tab.consultationId) },
      { label: 'Open remedy', run: () => ops.openRemedyTab(row.remedyId) },
      { label: 'Materia medica', run: () => ops.openMateriaMedica(row.remedyId) },
      { type: 'separator' },
      { label: excluded ? 'Include remedy again' : 'Exclude remedy', run: () => ops.toggleExcluded(row.remedyId, tab.consultationId) },
      { label: 'Compare with top remedies…', run: () => ops.openCompare([row.remedyId, ...rows.filter(r => r.remedyId !== row.remedyId && !r.excluded).slice(0, 3).map(r => r.remedyId)], tab.consultationId) },
      ...(pinnedExtra.has(row.remedyId) ? [{ type: 'separator' } as const, { label: 'Unpin column', run: () => ops.unpin(tabRef.current, row.remedyId) }] : []),
    ]
  }, [options?.excludedRemedies, rows, selectRemedy, tab.consultationId, pinnedExtra])

  // intensity keys and Delete in the symptom pane edit the clipboard (undoable, Edit › Undo / ⌘Z)
  const setWeight = useCallback((i: number, w: 0 | 1 | 2 | 3 | 4) => {
    const s = result?.symptoms[i]
    if (!s) return
    for (const m of s.members) if (m.weight !== w) actions.updateSymptom(s.clipboardId, m.id, { weight: w })
  }, [result])
  const removeSymptom = useCallback((i: number) => {
    const s = result?.symptoms[i]
    if (!s) return
    if (symptom != null) setSymptom(null)
    actions.removeSymptoms(s.clipboardId, s.members.map(m => m.id))
  }, [result, symptom, setSymptom])

  const symptomMenu = useCallback((i: number): MenuItem[] => {
    const s = result?.symptoms[i]
    if (!s) return []
    return [
      { label: symptom === i ? 'Clear highlight' : 'Highlight remedies in this symptom', run: () => setSymptom(symptom === i ? null : i) },
      { label: 'Open rubric in repertory', run: () => openRubric(s.symptom.rubrics[0]) },
    ]
  }, [result, symptom, setSymptom])

  if (!consultation) {
    return (
      <div className="an-view">
        <div className="empty-state">
          <strong>This case no longer exists</strong>
          <span>The consultation behind this analysis was deleted.</span>
          <button className="btn" onClick={() => actions.closeTab(tab.id)}>Close tab</button>
        </div>
      </div>
    )
  }

  const clipboardColor = (id: string) => consultation.clipboards.find(c => c.id === id)?.color ?? 'var(--border)'
  const clipboardInfo = (id: string) => {
    const k = consultation.clipboards.findIndex(c => c.id === id)
    return { name: consultation.clipboards[k]?.name ?? 'Clipboard', n: k + 1 }
  }
  const removeClipboard = (id: string) => {
    // its header row (and maybe the whole grid) unmounts: keep keyboard focus inside the analysis
    const a = document.activeElement
    if (!a || a === document.body || rootRef.current?.contains(a)) wantFocus.current = true
    ops.setOptions({ clipboardIds: consultation.analysis.clipboardIds.filter(x => x !== id) }, consultation.id)
  }

  let body: React.ReactNode
  if (load.status === 'error') {
    body = (
      <div className="error-state" role="alert">
        <h3><TriangleAlert size={14} /> Could not load {load.failed.join(', ')}</h3>
        <pre>The repertory data needed for this analysis failed to load.</pre>
        <button className="btn" onClick={load.retry}>Retry</button>
      </div>
    )
  } else if (load.status === 'loading') {
    body = (
      <div className="an-loading" aria-busy="true">
        <div className="an-loading-msg"><LoaderCircle size={14} className="spin" /> Loading {load.pending.map(a => catalog.repertoryInfos.find(r => r.abbrev === a)?.title ?? a).join(', ')}…</div>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton an-skel" style={{ width: `${90 - i * 6}%` }} />)}
      </div>
    )
  } else if (live.computing) {
    // the message fades in after 300 ms (CSS), so a fast first render never flashes it
    body = (
      <div className="an-loading an-computing" aria-busy="true" data-testid="analysis-computing">
        <div className="an-loading-msg" role="status"><LoaderCircle size={14} className="spin" /> Computing {catalog.remedies.size.toLocaleString()} remedies…</div>
      </div>
    )
  } else if (!result || !options) {
    body = null
  } else if (!(live.options ?? options).clipboardIds.some(id => consultation.clipboards.some(c => c.id === id))) {
    body = (
      <div className="empty-state">
        <strong>No clipboard selected</strong>
        <span>Choose the clipboards to analyse with the clipboard menu in the toolbar above.</span>
        <button className="btn" onClick={() => ops.setOptions({ clipboardIds: consultation.clipboards.map(c => c.id) }, consultation.id)}>Analyse all clipboards</button>
      </div>
    )
  } else if (!result.symptoms.length) {
    body = (
      <div className="empty-state">
        <strong>Nothing to analyse yet</strong>
        <span>The selected clipboards are empty. Take rubrics from a repertory with <span className="kbd">+</span> or <span className="kbd">F6</span>; the analysis updates live.</span>
        <button className="btn" onClick={() => { actions.setLayout({ showClipboard: true }); runCommand('view.clipboardsOnly') }}>Show clipboard pane</button>
      </div>
    )
  } else {
    /*
     * No remedy left (every symptom at intensity 0, filters): the symptom pane stays, so its keys (0–4,
     * Delete) still reach the symptoms; the remedy pane says why it is empty.
     */
    const none = !rows.length && !symptomsOnly && (
      <div className="an-none" role="status">
        <strong>No remedy remains</strong>
        <span>{describeEmpty(result)}</span>
        {ops.hasFilter(options) && <button className="btn" onClick={() => ops.clearFilter(consultation.id)}>Clear filters</button>}
      </div>
    )
    const grid = (
      <AnalysisGrid
        result={result} rows={symptomsOnly ? NO_ROWS : rows} catalog={catalog} clipboardColor={clipboardColor}
        selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
        onSelectRemedy={selectRemedy} onSelectSymptom={setSymptom} onOpenRemedy={openRemedy}
        onOpenSymptom={i => openRubric(result.symptoms[i].symptom.rubrics[0])}
        remedyMenu={remedyMenu} symptomMenu={symptomMenu} reveal={revealReq} pinned={pinnedExtra} sizeHint={measureMain}
        clipboardInfo={clipboardInfo} collapsed={collapsed} onToggleClipboard={toggleClipboard} onRemoveClipboard={removeClipboard} found={found}
        expanded={expanded} onToggleSymptom={toggleSymptom}
        onSetWeight={setWeight} onRemoveSymptom={removeSymptom} symptomsOnly={symptomsOnly}
      />
    )
    // keyed per view: each lazily loaded view gets its own boundary and OnMount
    const bars = (
      <Suspense key="bars" fallback={<ViewLoading />}>
        <div className="an-bars-wrap">
          <div className="an-bars-head"><GradeLegend /><span className="an-muted">Bar length: points per symptom · click a segment to highlight its symptom</span></div>
          <AnalysisBars
            result={result} rows={rows} catalog={catalog} selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
            onSelectRemedy={selectRemedy} onSelectSymptom={setSymptom} onOpenRemedy={openRemedy} remedyMenu={remedyMenu} reveal={revealReq} pinned={pinnedExtra}
          />
        </div>
        <OnMount fn={tryFocus} />
      </Suspense>
    )
    const cards = (
      <Suspense key="cards" fallback={<ViewLoading />}>
        <div className="an-cards-wrap">
          <AnalysisCards
            result={result} rows={rows} catalog={catalog} selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
            onSelectRemedy={selectRemedy} onOpenRemedy={openRemedy} remedyMenu={remedyMenu} reveal={revealReq} pinned={pinnedExtra} sizeHint={measureMain}
          />
        </div>
        <OnMount fn={tryFocus} />
      </Suspense>
    )
    const views: [AnalysisViewMode, ReactNode][] = [['grid', grid], ['bars', bars], ['cards', cards]]
    body = [...views.filter(([v]) => v === shownView || visited.has(v)).map(([v, el]) => <KeepAlive key={v} active={v === shownView}>{el}</KeepAlive>), none && <div key="none" className="an-none-wrap">{none}</div>]
  }

  return (
    <div
      ref={rootRef}
      className="an-view"
      data-testid="analysis-view"
      data-views={viewsReady ? 'ready' : undefined}
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape' && (selectedRemedy != null || symptom != null)) { selectRemedy(null); setSymptom(null) }
      }}
    >
      {activeCaseId !== tab.consultationId && <OtherCaseBanner tab={tab} activeCaseId={activeCaseId} />}
      <Toolbar live={live} tab={tab} view={view} limit={limit} onReveal={reveal} onFound={setFound} paramsOpen={paramsOpen} onToggleParams={() => setParamsOpen(o => !o)} focusResult={focusResult} />
      {paramsOpen && consultation && (
        <ParamsDrawer
          strategy={consultation.analysis.strategy} params={consultation.analysis.params}
          onChange={p => ops.setParams(p, consultation.id)}
          onClose={() => { setParamsOpen(false); focusResult() }}
        />
      )}
      {!!result?.notes.length && (
        <div className="an-notes" role="status" data-testid="analysis-notes">
          <Info size={13} aria-hidden="true" />
          <span className="an-notes-text">{result.notes.join(' ')}</span>
        </div>
      )}
      {/* the highlighted symptom is shown in place (its row band, the dimmed columns); said to screen readers only */}
      <div className="sr-only" role="status">{symptom != null && result?.symptoms[symptom] ? `Highlighting remedies in ${result.symptoms[symptom].label}: ${result.symptoms[symptom].size} remedies` : ''}</div>
      <div className="an-body" style={{ ['--an-panel-w' as string]: `${panelW}px` }}>
        <div ref={mainRef} className="an-main" aria-busy={live.stale || undefined}>{body}</div>
        {selectedRow && result && (
          <Splitter orientation="vertical" value={panelW} min={PANEL_MIN} max={PANEL_MAX} direction={-1} onChange={resizePanel} label="Resize score details" onReset={() => resizePanel(PANEL_DEFAULT)} />
        )}
        {selectedRow && result && (
          <RemedyPanel
            result={result} row={selectedRow} source={source} catalog={catalog} selectedSymptom={symptom} onSelectSymptom={setSymptom}
            onClose={() => selectRemedy(null)}
            onOpenRemedy={() => ops.openRemedyTab(selectedRow.remedyId)}
            onOpenMM={() => ops.openMateriaMedica(selectedRow.remedyId)}
            onToggleExclude={() => ops.toggleExcluded(selectedRow.remedyId, consultation.id)}
            onPrescribe={() => ops.prescribe(selectedRow.remedyId, consultation.id)}
            onCompare={() => ops.openCompare([selectedRow.remedyId, ...rows.filter(r => r.remedyId !== selectedRow.remedyId && !r.excluded).slice(0, 3).map(r => r.remedyId)], consultation.id)}
            manuallyExcluded={options?.excludedRemedies.includes(selectedRow.remedyId) ?? false}
          />
        )}
      </div>
      <Footer live={live} tab={tab} pinned={[...pinnedExtra]} limit={limit} shown={result ? result.rows.filter(r => !r.excluded).length : 0} onOpenParams={() => setParamsOpen(true)} />
    </div>
  )
}

function ViewLoading() {
  return <div className="an-loading" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton an-skel" style={{ width: `${90 - i * 8}%` }} />)}</div>
}

function caseLabel(s: ReturnType<typeof useApp.getState>, id: string | null): string | null {
  const c = id ? s.consultations[id] : null
  if (!c) return null
  const p = s.patients[c.patientId]
  return `${p ? `${p.lastName}${p.firstName ? `, ${p.firstName}` : ''}` : 'Case'} · ${c.title || 'Consultation'} (${c.date})`
}

/** Shown when this tab analyses a case other than the active one: commands (F8, menus) act on the active case. */
function OtherCaseBanner({ tab, activeCaseId }: { tab: AnalysisTab; activeCaseId: string | null }) {
  const mine = useApp(s => caseLabel(s, tab.consultationId))
  const active = useApp(s => caseLabel(s, activeCaseId))
  const label = { mine, active }
  return (
    <div className="an-other-case" role="status" data-testid="analysis-other-case">
      <Info size={13} aria-hidden="true" />
      <span className="an-ellipsis" title={label.active ? `Menus and F8 act on the active case: ${label.active}` : undefined}>
        This analysis shows <strong>{label.mine}</strong>{label.active ? <>, not the active case <strong>{label.active}</strong></> : ' (no case is active)'}.
      </span>
      {label.active && (
        <button className="btn btn-sm" onClick={() => ops.switchToActiveCase(tab)}><ArrowLeftRight size={12} /> Switch to active case</button>
      )}
      <button className="btn btn-sm btn-ghost" onClick={() => actions.setActiveConsultation(tab.consultationId)} title="Make the case of this analysis the active case">Make this case active</button>
    </div>
  )
}

/** Shows a symptom's rubric in the book: the tab already showing that repertory goes to it (RadarOpus keeps one tab per book). */
function openRubric(ref: string | undefined) {
  if (!ref) return
  const i = ref.lastIndexOf(':')
  const repertory = ref.slice(0, i), rubric = Number(ref.slice(i + 1))
  const open = useApp.getState().tabs.find((t): t is RepertoryTab => t.kind === 'repertory' && t.repertory === repertory)
  if (open) { actions.activateTab(open.id); actions.navigateRubric(open.id, rubric); return }
  actions.openTab({ kind: 'repertory', repertory, rubric, back: [], forward: [] }, { reuse: false })
}

function describeEmpty(r: AnalysisResult): string {
  const c = r.excludedCounts
  const parts: string[] = []
  if (c.eliminative) parts.push(`${c.eliminative} removed by eliminative symptoms`)
  if (c.exclusive) parts.push(`${c.exclusive} by excluding symptoms`)
  if (c['family-limit']) parts.push(`${c['family-limit']} outside the remedy filter`)
  if (c.manual) parts.push(`${c.manual} excluded by you`)
  if (c.coverage) parts.push(`${c.coverage} cover too few symptoms`)
  if (!r.scoredCount) return 'Every symptom is at intensity 0 or excluding, so nothing is scored.'
  return parts.length ? `${parts.join(', ')}.` : 'No remedy appears in the scored symptoms.'
}

/** Toolbar glyph size (RadarOpus's analysis icons are about 18pt). */
const ICON = 19

type ToolbarMenu = 'layout' | 'strategy' | 'filter' | 'maps' | 'polarity'
const MENU_LABEL: Record<ToolbarMenu, string> = { layout: 'Display', strategy: 'Analysis method', filter: 'Remedy filters', maps: 'Maps', polarity: 'Polarity' }

/** The method each case used before the polarity switch: the swap button and the Polarity menu go back to it. */
const beforePolarity = new Map<string, StrategyId>()
function togglePolarity(cid: string, current: StrategyId) {
  if (current !== 'polarity') { beforePolarity.set(cid, current); ops.setStrategy('polarity', cid); return }
  const back = beforePolarity.get(cid) ?? useApp.getState().settings.defaultStrategy
  ops.setStrategy(back === 'polarity' ? DEFAULT_ANALYSIS.strategy : back, cid)
}

/** "Limit the analysis to a view": the grades this analysis scores with (options.viewGrade; the book's own view is separate). */
const VIEWS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Full repertory' },
  { value: 2, label: 'Grades 2 to 4' },
  { value: 3, label: 'Grades 3 and 4' },
]

interface ToolbarProps {
  live: LiveAnalysis
  tab: AnalysisTab
  view: AnalysisViewMode
  limit: number
  onReveal: (id: number) => void
  onFound: (ids: ReadonlySet<number> | null) => void
  paramsOpen: boolean
  onToggleParams: () => void
  /** Focus the result (grid, bars or cards): where focus goes after a menu choice. */
  focusResult: () => void
}

/**
 * The analysis window's sub-toolbar (RadarOpus layout): icon menu buttons for the display, the method,
 * the remedy filters and the analysed clipboards; the scoring toggles; compare and export; then
 * "Limit the analysis to a view:", "Search remedy:", the parameters gear and help.
 */
function Toolbar({ live, tab, view, limit, onReveal, onFound, paramsOpen, onToggleParams, focusResult }: ToolbarProps) {
  const { consultation, result, catalog } = live
  const [menu, setMenu] = useState<{ kind: ToolbarMenu; x: number; y: number } | null>(null)
  const triggers = useRef<Partial<Record<ToolbarMenu, HTMLButtonElement | null>>>({})
  const closeMenu = useCallback((reason?: MenuCloseReason) => {
    const kind = menu?.kind
    setMenu(null)
    // keyboard closes return to the menu button; a choice continues in the result; a click elsewhere keeps its own focus
    if (reason === 'select') focusResult()
    else if ((reason === 'escape' || reason === 'tab') && kind) triggers.current[kind]?.focus()
  }, [menu?.kind, focusResult])
  if (!consultation) return null
  const o = consultation.analysis
  const info = strategyInfo(o.strategy)
  const selected = new Set(o.clipboardIds)
  const toggleMenu = (kind: ToolbarMenu) => {
    if (menu?.kind === kind) { setMenu(null); return }
    const r = triggers.current[kind]!.getBoundingClientRect()
    setMenu({ kind, x: r.left, y: r.bottom + 2 })
  }
  const trigger = (kind: ToolbarMenu) => ({
    ref: (el: HTMLButtonElement | null) => { triggers.current[kind] = el },
    'aria-haspopup': 'menu' as const,
    'aria-expanded': menu?.kind === kind,
    onClick: () => toggleMenu(kind),
  })
  /*
   * role=toolbar: Left/Right (Home/End) move between its controls from a button; the select and the search field
   * keep their own arrow keys. Down on a menu button opens its menu. Keys in an open menu (a portal) are the menu's.
   */
  const onToolbarKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (!e.currentTarget.contains(t) || t.tagName !== 'BUTTON' || e.altKey || e.ctrlKey || e.metaKey) return
    const kind = (Object.keys(triggers.current) as ToolbarMenu[]).find(k => triggers.current[k] === t)
    if (e.key === 'ArrowDown' && kind) { e.preventDefault(); if (menu?.kind !== kind) toggleMenu(kind); return }
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')]
      .filter(el => el.getClientRects().length)
    const i = all.indexOf(t)
    const to = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i - 1 + all.length) % all.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1
    if (i < 0 || to < 0) return
    e.preventDefault()
    all[to].focus()
  }
  // the toolbar acts on this tab's case (menus and shortcuts act on the active case; see OtherCaseBanner)
  const cid = consultation.id
  const limitLabel = (n: number) => (n >= 100000 ? 'All remedies' : `Top ${n}`)
  const layoutItems: MenuItem[] = [
    { type: 'label', label: 'Display' },
    ...([['grid', 'Grid'], ['bars', 'Bars'], ['cards', 'Remedy cards']] as const).map(([v, label]): MenuItem => ({
      label, keys: v[0].toUpperCase(), checked: !tab.symptomsOnly && view === v, run: () => actions.updateTab<AnalysisTab>(tab.id, { view: v, symptomsOnly: false }),
    })),
    { label: 'Symptoms only', checked: !!tab.symptomsOnly, run: () => actions.updateTab<AnalysisTab>(tab.id, { symptomsOnly: !tab.symptomsOnly }) },
    { type: 'separator' },
    { type: 'label', label: 'Remedies shown' },
    ...[...ops.LIMITS, ...(ops.LIMITS.includes(limit) ? [] : [limit])].map((n): MenuItem => ({
      label: limitLabel(n), checked: limit === n, run: () => ops.setOptions({ limit: n }, cid),
    })),
  ]
  const strategyItems: MenuItem[] = [
    { type: 'label', label: 'Analysis method' },
    // RadarOpus's methods (as in Analysis › Select your default analysis method), then the engine's further ones
    ...STRATEGIES.flatMap((s, i): MenuItem[] => [
      ...(i === RO_METHODS.length ? [{ type: 'separator' } as const] : []),
      { command: `analysis.strategy.${s.id}`, checked: o.strategy === s.id, disabled: false, run: () => ops.setStrategy(s.id, cid) },
    ]),
    { type: 'separator' },
    { command: 'analysis.intensity', checked: o.useIntensity !== false, disabled: false, run: () => ops.toggleIntensity(cid) },
    { command: 'analysis.showExcluded', checked: !!o.showExcluded, disabled: false, run: () => ops.toggleShowExcluded(cid) },
    // the drawer takes focus itself, so it runs after the menu's focus hand-off; only methods with parameters offer it
    ...(hasParams(o.strategy) ? [
      { type: 'separator' } as const,
      { command: 'analysis.params', label: 'Strategy parameters…', checked: paramsOpen, disabled: false, run: () => setTimeout(onToggleParams) } as MenuItem,
    ] : []),
  ]
  const familyDialog = ops.familyFilterDialog()
  const filterItems: MenuItem[] = [
    ...(familyDialog && getCommand('families.filter') ? [{ command: 'families.filter', disabled: false, run: () => ops.openFilter(cid) } as MenuItem] : []),
    { command: 'analysis.remedies', disabled: false, run: () => ops.openRemedyFilter(cid) },
    { type: 'separator' },
    { command: 'analysis.clearFilter', disabled: !ops.hasFilter(o), run: () => ops.clearFilter(cid) },
  ]
  const exportItems: MenuItem[] = [
    { command: 'analysis.exportCsv', disabled: false, run: () => void ops.exportCsv(cid) },
    { command: 'analysis.exportPng', disabled: false, run: () => void ops.exportPng(cid) },
    { command: 'analysis.print', disabled: false, run: () => void ops.printAnalysis(cid) },
  ]
  // Maps ▾ (as the main toolbar's): this analysis on the periodic table or across the kingdoms
  const mapsItems: MenuItem[] = [
    { command: 'maps.periodic', label: 'Periodic table' },
    { command: 'maps.kingdoms', label: 'Kingdoms' },
  ]
  // the yin-yang ▾: the polarity analysis (Frei) and its options
  const polar = o.strategy === 'polarity'
  const nonPolar = !!o.params?.polarity?.includeNonPolar
  const polarityItems: MenuItem[] = [
    { type: 'label', label: 'Polarity' },
    { label: 'Polarity analysis', checked: polar, run: () => togglePolarity(cid, o.strategy) },
    { label: 'Include non-polar symptoms', checked: nonPolar, disabled: !polar, run: () => ops.setParams({ ...o.params, polarity: { ...o.params?.polarity, includeNonPolar: !nonPolar } }, cid) },
    { label: 'Show contraindicated remedies in position', checked: !!o.showExcluded, run: () => ops.toggleShowExcluded(cid) },
    ...(polar ? [{ type: 'separator' } as const, { label: 'Polarity parameters…', checked: paramsOpen, run: () => setTimeout(onToggleParams) } as MenuItem] : []),
  ]
  // "All" analyses every non-empty clipboard (every clipboard when all are empty)
  const nonEmpty = consultation.clipboards.filter(c => c.symptoms.length)
  const allSelected = (nonEmpty.length ? nonEmpty : consultation.clipboards).every(c => selected.has(c.id))
  const analyseAll = () => {
    const ne = nonEmpty.map(c => c.id)
    ops.setOptions({ clipboardIds: ne.length ? ne : consultation.clipboards.map(c => c.id) }, cid)
  }
  const clipboardItems: MenuItem[] = [
    { type: 'label', label: 'Analysed clipboards' },
    ...consultation.clipboards.map((cb, i): MenuItem => ({
      label: `${i + 1}. ${cb.name} (${cb.symptoms.length})`, checked: selected.has(cb.id),
      run: () => {
        const next = selected.has(cb.id) ? o.clipboardIds.filter(x => x !== cb.id) : [...o.clipboardIds, cb.id]
        ops.setOptions({ clipboardIds: consultation.clipboards.map(c => c.id).filter(x => next.includes(x)) }, cid)
      },
    })),
    ...(consultation.clipboards.length > 1 ? [{ type: 'separator' } as const, { label: 'All clipboards', checked: allSelected, run: analyseAll }] : []),
  ]
  // the display menu also holds what RadarOpus puts elsewhere (the rail's clipboard checks, File › Print): the analysed clipboards, compare, export
  const displayItems: MenuItem[] = [
    ...layoutItems,
    { type: 'separator' }, ...clipboardItems,
    { type: 'separator' }, { label: 'Compare remedies…', run: () => ops.openCompare(undefined, cid) },
    { type: 'separator' }, ...exportItems,
  ]
  const menuItems = { layout: displayItems, strategy: strategyItems, filter: filterItems, maps: mapsItems, polarity: polarityItems }
  const bars = !tab.symptomsOnly && view === 'bars'
  const back = strategyInfo(beforePolarity.get(cid) ?? useApp.getState().settings.defaultStrategy).name

  return (
    <div className="an-toolbar" role="toolbar" aria-label="Analysis toolbar" onKeyDown={onToolbarKey}>
      {/*
        RadarOpus slots and order: display, method, families, maps and polarity menus, a separator, the
        analysis ⇄ polarity switch and the bar list (Bars display), at RadarOpus's positions and pitch.
      */}
      <button className="an-tb-btn an-menu-btn" {...trigger('layout')} aria-label="Display and remedies shown" title={`Display: ${view} · ${limitLabel(limit)}`}>
        <WindowsIcon size={ICON} /><span className="an-caret" aria-hidden="true" />
      </button>
      <button className="an-tb-btn an-menu-btn an-strategy" {...trigger('strategy')} aria-label={`Analysis method: ${info.name}`} title={`${info.name}: ${info.description}`}>
        <KingIcon size={ICON} /><span className="an-caret" aria-hidden="true" />
      </button>
      <button className={`an-tb-btn an-menu-btn an-ic-tree${ops.hasFilter(o) ? ' on' : ''}`} {...trigger('filter')} aria-label="Remedy filters" title={familyDialog ? 'Families: limit or highlight families, include or exclude remedies' : 'Limit, exclude or highlight remedies'}>
        <TreeIcon size={ICON + 6} /><span className="an-caret" aria-hidden="true" />
      </button>
      <button className="an-tb-btn an-menu-btn an-ic-maps" {...trigger('maps')} aria-label="Maps" title="Maps: show this analysis on the periodic table or across the kingdoms">
        <MapsIcon size={ICON + 1} /><span className="an-caret" aria-hidden="true" />
      </button>
      <button className={`an-tb-btn an-menu-btn an-ic-polarity${polar ? ' on' : ''}`} {...trigger('polarity')} aria-label="Polarity" title="Polarity analysis and its options">
        <YinYangIcon size={ICON} /><span className="an-caret mid" aria-hidden="true" />
      </button>
      <div className="an-sep" />
      <button className="an-tb-btn an-tb-wide an-toggle" aria-pressed={polar} aria-label="Switch between the analysis and the polarity analysis" title={polar ? `Back to ${back}` : 'Switch to the polarity analysis'} onClick={() => togglePolarity(cid, o.strategy)}><SwapPolarityIcon size={ICON + 1} /></button>
      <button className="an-tb-btn an-toggle" aria-pressed={bars} aria-label="Show the analysis as bars" title={bars ? 'Show the grid' : 'Show the analysis as bars (B)'} onClick={() => actions.updateTab<AnalysisTab>(tab.id, { view: bars ? 'grid' : 'bars', symptomsOnly: false })}><BarListIcon size={ICON} /></button>
      <label className="an-tb-field an-viewlimit">
        <span className="an-tb-label">Limit the analysis to a view:</span>
        <span className="an-select-wrap">
          <select className="an-select" aria-label="Limit the analysis to a view" value={o.viewGrade ?? 1} onChange={e => { const g = Number(e.target.value) as 1 | 2 | 3; ops.setOptions({ viewGrade: g === 1 ? undefined : g }, cid) }}>
            {VIEWS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </span>
      </label>
      <div className="an-sep an-sep-search" />
      <SearchRemedy result={result} catalog={catalog} onPick={onReveal} onFound={onFound} onDone={focusResult} />
      <div className="an-spacer" />
      {/* the gear: the method's parameters when it has any, otherwise the analysis settings (default method, result limit) */}
      {hasParams(o.strategy)
        ? <button className="an-tb-btn an-round" aria-pressed={paramsOpen} aria-label="Strategy parameters" title={`${info.name}: parameters`} onClick={onToggleParams}><DoubleGearIcon size={18} /></button>
        : <button className="an-tb-btn an-round" aria-haspopup="dialog" aria-label="Analysis settings" title="Analysis settings" onClick={() => actions.openDialog(SETTINGS_DIALOG, { tab: 'analysis' })}><DoubleGearIcon size={18} /></button>}
      <button className="an-tb-btn an-round" aria-label="Keyboard shortcuts" title="Help: keyboard shortcuts (F1)" onClick={() => runCommand('help.shortcuts')}><CircleHelp size={18} /></button>
      {menu && (
        <MenuList items={menuItems[menu.kind]} x={menu.x} y={menu.y} label={MENU_LABEL[menu.kind]} onClose={closeMenu} />
      )}
    </div>
  )
}

/**
 * The four status boxes under the analysis (RadarOpus): "N symptom(s) / M remedies", the method, the
 * limitation (repertory view) and the remedy filter. Active limits show as pills with a remove button.
 */
function Footer({ live, tab, pinned, limit, shown, onOpenParams }: { live: LiveAnalysis; tab: AnalysisTab; pinned: number[]; limit: number; shown: number; onOpenParams: () => void }) {
  const { consultation, catalog, result } = live
  if (!consultation) return null
  const o = consultation.analysis
  const minGrade = result?.minGrade ?? 1
  const viewLabel = VIEWS.find(v => v.value === minGrade)?.label ?? `Grades ${minGrade} and higher`
  const custom = hasCustomParams(o)
  const set = (patch: Parameters<typeof ops.setOptions>[0]) => ops.setOptions(patch, consultation.id)
  const nSym = result?.symptoms.length ?? 0
  const filters = !!(o.remedyFilter || o.highlight?.length || o.excludedRemedies.length || o.minCoverage > 0 || pinned.length)
  const info = strategyInfo(o.strategy)
  return (
    <div className="an-footer" role="group" aria-label="Analysis status">
      <div className="an-fbox an-count" aria-live="polite">
        {result ? <><strong>{nSym}</strong> symptom(s) / <strong>{result.total.toLocaleString()}</strong> remedies{shown < result.total && <span className="an-muted" title={`The grid shows the top ${limit} (Display menu: Remedies shown)`}> · top {shown} shown</span>}</> : 'Loading…'}
      </div>
      <div className="an-fbox an-fstrategy" title={`${info.name}: ${info.formula}`}>
        <span className="an-ellipsis">{info.name}</span>
        {custom && (
          <span className="an-pill params">
            <button className="an-pill-text" onClick={onOpenParams} title="Strategy parameters differ from the defaults: open them"><SlidersHorizontal size={11} /> Custom parameters</button>
            <button aria-label="Reset strategy parameters to defaults" onClick={() => ops.setParams(null, consultation.id)}><X size={11} /></button>
          </span>
        )}
      </div>
      <div className="an-fbox an-flimit">
        {minGrade > 1 ? (
          <span className="an-pill view" title={`The analysis is limited to a view: it scores grade ${minGrade} and higher only`}>
            <span className="an-ellipsis">{viewLabel}</span>
            <button aria-label="Remove the view limitation" onClick={() => set({ viewGrade: undefined })}><X size={11} /></button>
          </span>
        ) : <span>No limitation</span>}
      </div>
      <div className="an-fbox an-pillbar">
        {!filters && <span>All remedies</span>}
        {o.remedyFilter && (
          <span className="an-pill" title={`${o.remedyFilter.length} remedies`}>
            <Filter size={11} /><span className="an-ellipsis">Limited: {o.filterLabel ?? `${o.remedyFilter.length} remedies`}</span>
            <button aria-label="Remove remedy limit" onClick={() => set({ remedyFilter: null, filterLabel: null })}><X size={11} /></button>
          </span>
        )}
        {!!o.highlight?.length && (
          <span className="an-pill fam" title={`${o.highlight.length} remedies highlighted`}>
            <Highlighter size={11} /><span className="an-ellipsis">{o.highlightLabel ?? `${o.highlight.length} highlighted`}</span>
            <button aria-label="Remove highlight" onClick={() => set({ highlight: null, highlightLabel: null })}><X size={11} /></button>
          </span>
        )}
        {o.excludedRemedies.length > 0 && (
          <span className="an-pill" title={o.excludedRemedies.map(id => catalog.remedy(id).abbrev).join(', ')}>
            <Ban size={11} />{o.excludedRemedies.length} excluded
            <button aria-label="Include all excluded remedies" onClick={() => set({ excludedRemedies: [] })}><X size={11} /></button>
          </span>
        )}
        {o.minCoverage > 0 && (
          <span className="an-pill">≥ {o.minCoverage} symptoms
            <button aria-label="Remove minimum coverage" onClick={() => set({ minCoverage: 0 })}><X size={11} /></button>
          </span>
        )}
        {pinned.map(id => (
          <span key={id} className="an-pill pin" title={`${catalog.remedy(id).name} ranks beyond the top ${limit}; shown as an extra column`}>
            <Pin size={11} />{catalog.remedy(id).abbrev}
            <button aria-label={`Unpin ${catalog.remedy(id).abbrev}`} onClick={() => ops.unpin(tab, id)}><X size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * "Search remedy:" every remedy of this analysis (also beyond the limit and excluded ones). Typing marks
 * the matching columns and scrolls the first into view; the list below jumps to one (Enter or click).
 */
function SearchRemedy({ result, catalog, onPick, onFound, onDone }: {
  result: AnalysisResult | null; catalog: LiveAnalysis['catalog']; onPick: (id: number) => void; onFound: (ids: ReadonlySet<number> | null) => void
  /** Escape: the field is cleared and the keyboard goes back to the result. */
  onDone: () => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [k, setK] = useState(-1)
  const ref = useRef<HTMLInputElement>(null)
  const { matches, all } = useMemo(() => {
    // the columns print "calc.": a typed final dot still matches "Calc"
    const s = q.trim().toLowerCase().replace(/\.$/, '')
    if (!s || !result) return { matches: [] as AnalysisRow[], all: null }
    // RadarOpus completes on the abbreviation's start only ("pu" → "puls."), in rank order
    const starts: AnalysisRow[] = []
    for (const r of result.all.length === result.total ? [...result.all, ...result.excludedRows] : result.all) {
      if (catalog.remedy(r.remedyId).abbrev.toLowerCase().startsWith(s)) starts.push(r)
    }
    // the columns marked are the list's matches: the column scrolled into view is the list's first entry
    return { matches: starts.slice(0, 12), all: starts.length ? new Set(starts.map(r => r.remedyId)) : null }
  }, [q, result, catalog])
  useEffect(() => { onFound(all) }, [all, onFound])
  const pick = (r: AnalysisRow | undefined) => {
    if (!r) return
    onPick(r.remedyId)
    setQ('')
    setOpen(false)
  }
  return (
    <label className="an-tb-field an-rbox">
      <span className="an-tb-label">Search remedy:</span>
      <span className="an-rbox-wrap">
        <input
          ref={ref}
          className="an-rbox-input"
          aria-label="Search remedy"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls="an-rbox-list"
          aria-autocomplete="list"
          value={q}
          data-analysis-remedy-box
          onChange={e => { setQ(e.target.value); setOpen(true); setK(-1) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setK(x => Math.min(matches.length - 1, x + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setK(x => Math.max(0, x - 1)) }
            // like a native completer nothing is highlighted until an arrow key; Enter takes the first entry
            else if (e.key === 'Enter') { e.preventDefault(); pick(matches[Math.max(0, k)]) }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQ(''); setOpen(false); onDone() }
          }}
        />
        {open && q.trim() && matches.length > 0 && (
          <div className="an-rbox-list an-rbox-plain" id="an-rbox-list" role="listbox">
            {matches.map((r, i) => {
              const rem = catalog.remedy(r.remedyId)
              return (
                <div
                  key={r.remedyId} role="option" aria-selected={i === k} aria-label={`${columnAbbrev(rem.abbrev)} ${rem.name}${r.rank ? `, rank ${r.rank}` : ''}`}
                  title={rem.name} className={`an-rbox-opt${i === k ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); pick(r) }} onMouseEnter={() => setK(i)}
                >
                  {columnAbbrev(rem.abbrev)}
                </div>
              )
            })}
          </div>
        )}
      </span>
    </label>
  )
}
