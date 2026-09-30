import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeftRight, Ban, ChartBarStacked, ChessKnight, ChevronDown, Download, Ellipsis, Eye, EyeOff, Filter, GitCompare, Grid3x3,
  Highlighter, Info, LayoutGrid, LoaderCircle, Pin, Printer, Search, SlidersHorizontal, TriangleAlert, Weight, X,
} from 'lucide-react'
import { getCommand, runCommand } from '../../commands/registry'
import { STRATEGIES, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import { actions, useApp } from '../../state/store'
import type { AnalysisTab, AnalysisViewMode } from '../../state/workspace'
import { MenuList } from '../../ui/Menu'
import type { MenuCloseReason, MenuItem } from '../../ui/Menu'
import { Splitter } from '../../ui/Splitter'
import { AnalysisGrid } from './AnalysisGrid'
import { hasCustomParams, ParamsDrawer } from './ParamsDrawer'
import { RemedyPanel } from './RemedyPanel'
import * as ops from './ops'
import { useAnalysis } from './useAnalysis'
import { useAutoCollapseClipboard } from './useAutoCollapseClipboard'
import { usePublishStatus } from '../../shell/statusContext'
import { analysisStatusText } from './labels'
import type { LiveAnalysis } from './useAnalysis'
import './analysis.css'

const CARD_CAP = 200

/* Bars and cards load on demand: F8 only pays for the grid. They are prefetched once the grid is idle. */
const loadBars = () => import('./AnalysisBars')
const loadCards = () => import('./AnalysisCards')
const AnalysisBars = lazy(() => loadBars().then(m => ({ default: m.AnalysisBars })))
const GradeLegend = lazy(() => loadBars().then(m => ({ default: m.GradeLegend })))
const AnalysisCards = lazy(() => loadCards().then(m => ({ default: m.AnalysisCards })))
let prefetched = false
function prefetchViews() {
  if (prefetched) return
  prefetched = true
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 800))
  idle(() => { void loadBars().catch(() => { prefetched = false }); void loadCards().catch(() => { prefetched = false }) }, { timeout: 3000 })
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
  const last = useRef<ReactNode>(children)
  if (active) last.current = children
  return <div className={`an-keep${active ? ' on' : ''}`} inert={!active} aria-hidden={!active || undefined}>{last.current}</div>
}

const LIVE = '.an-main > .an-keep.on'
const MAIN_FOCUS = `${LIVE} [data-cell][tabindex="0"], ${LIVE} .an-bar-row[tabindex="0"], ${LIVE} .an-card.selected, ${LIVE} .an-card`

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
  const live = useAnalysis(tab.consultationId)
  const { consultation, result, load, catalog, source } = live
  useAutoCollapseClipboard()
  const view: AnalysisViewMode = tab.view ?? 'grid'
  // displays shown so far stay mounted (KeepAlive)
  const [visited, setVisited] = useState<ReadonlySet<AnalysisViewMode>>(() => new Set([view]))
  if (!visited.has(view)) setVisited(new Set([...visited, view]))
  const [paramsOpen, setParamsOpen] = useState(false)
  useEffect(() => ops.onParamsRequest(id => { if (id === tab.id) setParamsOpen(o => !o) }), [tab.id])
  const [panelW, setPanelW] = useState(readPanelWidth)
  const resizePanel = useCallback((v: number) => { setPanelW(v); savePanelWidth(v) }, [])
  const [revealReq, setReveal] = useState<{ remedyId: number; nonce: number } | null>(null)
  const selectedRemedy = typeof tab.remedy === 'number' ? tab.remedy : null
  // the highlighted symptom lives on the tab too, so the panel and highlight survive tab switches
  const symptom = typeof tab.symptom === 'number' && result && tab.symptom < result.symptoms.length ? tab.symptom : null
  const setSymptom = useCallback((i: number | null) => actions.updateTab<AnalysisTab>(tab.id, { symptom: i }), [tab.id])
  const activeCaseId = useApp(s => s.activeConsultationId)

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
  usePublishStatus(tab.id, consultation && options ? analysisStatusText(options.strategy, result, limit, load.status === 'loading') : null)
  const highlight = useMemo(() => (options?.highlight?.length ? new Set(options.highlight) : null), [options?.highlight])
  const selectedRow = selectedRemedy != null ? rows.find(r => r.remedyId === selectedRemedy) ?? result?.all.find(r => r.remedyId === selectedRemedy) ?? result?.excludedRows.find(r => r.remedyId === selectedRemedy) ?? null : null


  // jump to a remedy: select it, pin it when beyond the limit, scroll to it and focus it
  const tabRef = useRef(tab)
  tabRef.current = tab
  const reveal = useCallback((id: number) => {
    ops.pinAndSelect(tabRef.current, id)
    setReveal({ remedyId: id, nonce: Date.now() })
  }, [])
  useEffect(() => {
    const pending = ops.takeReveal(tab.id)
    if (pending !== undefined) reveal(pending)
    return ops.onReveal((t, id) => { if (t === tab.id) { ops.takeReveal(t); reveal(id) } })
  }, [tab.id, reveal])

  /*
   * Keyboard focus into the result: requested by F8 (ops.requestFocus) and when the display changes
   * while focus is in the analysis (the old view unmounts). The request waits until the result is
   * rendered, including a lazily loaded bars / cards view.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(false)
  const loading = load.status === 'loading'
  const tryFocus = useCallback(() => {
    const root = rootRef.current
    if (!wantFocus.current || !root) return
    const target = root.querySelector<HTMLElement>(MAIN_FOCUS)
    if (target) { wantFocus.current = false; target.focus({ preventScroll: false }); return }
    // nothing to focus in the result (empty state, error): the view itself, so its keys still work
    if (root.querySelector('.an-main > .empty-state, .an-main > .error-state')) { wantFocus.current = false; root.focus() }
  }, [])
  useLayoutEffect(() => {
    if (ops.takeFocus(tab.id)) wantFocus.current = true
    return ops.onFocusRequest(id => { if (id === tab.id && ops.takeFocus(id)) { wantFocus.current = true; tryFocus() } })
  }, [tab.id, tryFocus])
  const prevView = useRef(view)
  if (prevView.current !== view) {
    prevView.current = view
    const a = document.activeElement
    if (!a || a === document.body || rootRef.current?.contains(a)) wantFocus.current = true
  }
  useEffect(() => { if (!loading) tryFocus() })
  /** Move keyboard focus into the result (after a toolbar menu choice or closing the drawer). */
  const focusResult = useCallback(() => { wantFocus.current = true; tryFocus() }, [tryFocus])
  useEffect(() => { if (result && view === 'grid') prefetchViews() }, [result, view])

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
  } else if (!result || !options) {
    body = null
  } else if (!options.clipboardIds.some(id => consultation.clipboards.some(c => c.id === id))) {
    body = (
      <div className="empty-state">
        <strong>No clipboard selected</strong>
        <span>Pick the clipboards to analyse in the toolbar above. Ctrl+click combines several.</span>
        <button className="btn" onClick={() => ops.setOptions({ clipboardIds: consultation.clipboards.map(c => c.id) }, consultation.id)}>Analyse all clipboards</button>
      </div>
    )
  } else if (!result.symptoms.length) {
    body = (
      <div className="empty-state">
        <strong>Nothing to analyse yet</strong>
        <span>The selected clipboards are empty. Take rubrics from a repertory with <span className="kbd">+</span> or <span className="kbd">F6</span>; the analysis updates live.</span>
        <button className="btn" onClick={() => runCommand('view.clipboardsOnly')}>Show clipboards (F7)</button>
      </div>
    )
  } else if (!rows.length) {
    body = (
      <div className="empty-state">
        <strong>No remedy remains</strong>
        <span>{describeEmpty(result)}</span>
        {ops.hasFilter(options) && <button className="btn" onClick={() => ops.clearFilter(consultation.id)}>Clear filters</button>}
      </div>
    )
  } else {
    const grid = (
      <AnalysisGrid
        result={result} rows={rows} catalog={catalog} clipboardColor={clipboardColor}
        selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
        onSelectRemedy={selectRemedy} onSelectSymptom={setSymptom} onOpenRemedy={openRemedy}
        onOpenSymptom={i => openRubric(result.symptoms[i].symptom.rubrics[0])}
        remedyMenu={remedyMenu} symptomMenu={symptomMenu} reveal={revealReq} pinned={pinnedExtra}
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
            result={result} rows={rows.length > CARD_CAP ? [...rows.slice(0, CARD_CAP), ...rows.filter(r => pinnedExtra.has(r.remedyId))] : rows} catalog={catalog} selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
            onSelectRemedy={selectRemedy} onOpenRemedy={openRemedy} remedyMenu={remedyMenu} reveal={revealReq} pinned={pinnedExtra}
          />
          {rows.length > CARD_CAP && <div className="an-muted an-cap">Showing the first {CARD_CAP} of {rows.length} remedies as cards. Use the grid or bars for the rest.</div>}
        </div>
        <OnMount fn={tryFocus} />
      </Suspense>
    )
    const views: [AnalysisViewMode, ReactNode][] = [['grid', grid], ['bars', bars], ['cards', cards]]
    body = views.filter(([v]) => v === view || visited.has(v)).map(([v, el]) => <KeepAlive key={v} active={v === view}>{el}</KeepAlive>)
  }

  return (
    <div
      ref={rootRef}
      className="an-view"
      data-testid="analysis-view"
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape' && (selectedRemedy != null || symptom != null)) { selectRemedy(null); setSymptom(null) }
      }}
    >
      {activeCaseId !== tab.consultationId && <OtherCaseBanner tab={tab} activeCaseId={activeCaseId} />}
      <Toolbar live={live} tab={tab} view={view} limit={limit} onReveal={reveal} paramsOpen={paramsOpen} onToggleParams={() => setParamsOpen(o => !o)} focusResult={focusResult} />
      {paramsOpen && consultation && (
        <ParamsDrawer
          strategy={consultation.analysis.strategy} params={consultation.analysis.params}
          onChange={p => ops.setParams(p, consultation.id)}
          onClose={() => { setParamsOpen(false); focusResult() }}
        />
      )}
      <PillBar live={live} tab={tab} pinned={[...pinnedExtra]} limit={limit} onOpenParams={() => setParamsOpen(true)} />
      {!!result?.notes.length && (
        <div className="an-notes" role="status" data-testid="analysis-notes">
          <Info size={13} aria-hidden="true" />
          <span className="an-notes-text">{result.notes.join(' ')}</span>
        </div>
      )}
      {symptom != null && result?.symptoms[symptom] && (
        <div className="an-symbar" role="status">
          <span>Highlighting remedies in <strong>{result.symptoms[symptom].label}</strong> · {result.symptoms[symptom].size} remedies</span>
          <button className="icon-btn" aria-label="Clear symptom highlight" onClick={() => setSymptom(null)}><X size={13} /></button>
        </div>
      )}
      <div className="an-body" style={{ ['--an-panel-w' as string]: `${panelW}px` }}>
        <div className="an-main" aria-busy={live.stale || undefined}>{body}</div>
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

function openRubric(ref: string | undefined) {
  if (!ref) return
  const i = ref.lastIndexOf(':')
  actions.openTab({ kind: 'repertory', repertory: ref.slice(0, i), rubric: Number(ref.slice(i + 1)), back: [], forward: [] }, { reuse: false })
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

type ToolbarMenu = 'strategy' | 'export' | 'filter' | 'more' | 'clipboards'
const MENU_LABEL: Record<ToolbarMenu, string> = { strategy: 'Analysis method', filter: 'Filters', export: 'Export', more: 'More analysis actions', clipboards: 'Analysed clipboards' }

interface ToolbarProps {
  live: LiveAnalysis
  tab: AnalysisTab
  view: AnalysisViewMode
  limit: number
  onReveal: (id: number) => void
  paramsOpen: boolean
  onToggleParams: () => void
  /** Focus the result (grid, bars or cards): where focus goes after a menu choice. */
  focusResult: () => void
}

function Toolbar({ live, tab, view, limit, onReveal, paramsOpen, onToggleParams, focusResult }: ToolbarProps) {
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
  // the toolbar acts on this tab's case (menus and shortcuts act on the active case; see OtherCaseBanner)
  const cid = consultation.id
  const strategyItems: MenuItem[] = [
    { type: 'label', label: 'Analysis method' },
    ...STRATEGIES.map((s): MenuItem => ({ command: `analysis.strategy.${s.id}`, checked: o.strategy === s.id, disabled: false, run: () => ops.setStrategy(s.id, cid) })),
    { type: 'separator' },
    { command: 'analysis.intensity', checked: o.useIntensity !== false, disabled: false, run: () => ops.toggleIntensity(cid) },
    { command: 'analysis.showExcluded', checked: !!o.showExcluded, disabled: false, run: () => ops.toggleShowExcluded(cid) },
    { type: 'separator' },
    // the drawer takes focus itself, so it runs after the menu's focus hand-off
    { command: 'analysis.params', label: 'Strategy parameters…', checked: paramsOpen, disabled: false, run: () => setTimeout(onToggleParams) },
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
    { type: 'separator' },
    { command: 'analysis.print', disabled: false, run: () => void ops.printAnalysis(cid) },
  ]
  // "More" holds what narrow toolbars fold away: the scoring toggles first, then compare / export / print
  const moreItems: MenuItem[] = [
    { label: 'Use symptom intensity', checked: o.useIntensity !== false, run: () => ops.setOptions({ useIntensity: o.useIntensity === false }, cid) },
    { label: 'Show excluded remedies in position', checked: !!o.showExcluded, run: () => ops.setOptions({ showExcluded: !o.showExcluded }, cid) },
    { type: 'separator' },
    { command: 'analysis.compare', disabled: false, run: () => ops.openCompare(undefined, cid) },
    { type: 'separator' },
    ...exportItems,
  ]
  const onChip = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const next = selected.has(id) ? o.clipboardIds.filter(x => x !== id) : [...o.clipboardIds, id]
      ops.setOptions({ clipboardIds: consultation.clipboards.map(c => c.id).filter(x => next.includes(x)) }, consultation.id)
    } else ops.setOptions({ clipboardIds: [id] }, consultation.id)
  }
  // "All" analyses every non-empty clipboard (every clipboard when all are empty), so it reads pressed when those are selected
  const nonEmpty = consultation.clipboards.filter(c => c.symptoms.length)
  const allSelected = (nonEmpty.length ? nonEmpty : consultation.clipboards).every(c => selected.has(c.id))
  const limitLabel = (n: number) => (n >= 100000 ? 'All' : String(n))
  const analyseAll = () => {
    const ne = consultation.clipboards.filter(c => c.symptoms.length).map(c => c.id)
    ops.setOptions({ clipboardIds: ne.length ? ne : consultation.clipboards.map(c => c.id) }, consultation.id)
  }
  // narrow toolbars: the clipboard chips collapse into this menu (each entry adds or removes its clipboard)
  const clipboardItems: MenuItem[] = [
    ...consultation.clipboards.map((cb, i): MenuItem => ({
      label: `${i + 1} · ${cb.name} (${cb.symptoms.length})`, checked: selected.has(cb.id),
      run: () => {
        const next = selected.has(cb.id) ? o.clipboardIds.filter(x => x !== cb.id) : [...o.clipboardIds, cb.id]
        ops.setOptions({ clipboardIds: consultation.clipboards.map(c => c.id).filter(x => next.includes(x)) }, consultation.id)
      },
    })),
    ...(consultation.clipboards.length > 1 ? [{ type: 'separator' } as const, { label: 'All clipboards', checked: allSelected, run: analyseAll }] : []),
  ]
  const chosen = consultation.clipboards.map((cb, i) => ({ cb, n: i + 1 })).filter(x => selected.has(x.cb.id))
  const chosenLabel = consultation.clipboards.length > 1 && allSelected ? 'All' : chosen.length ? chosen.map(x => x.n).join('+') : 'None'
  const menuItems = { strategy: strategyItems, filter: filterItems, export: exportItems, more: moreItems, clipboards: clipboardItems }

  return (
    <div className="an-toolbar" role="toolbar" aria-label="Analysis toolbar">
      <button className="an-tb-btn an-strategy" {...trigger('strategy')} aria-label={`Analysis method: ${info.name}`} title={`${info.name}: ${info.description}`}>
        <ChessKnight size={15} /><span className="an-strategy-name">{info.short}</span>{hasCustomParams(o) && <SlidersHorizontal size={11} className="an-strategy-custom" aria-label="custom parameters" />}<ChevronDown size={12} />
      </button>
      <div className="an-sep" />
      <button className="an-tb-btn an-cb-menu" {...trigger('clipboards')} aria-label={`Analysed clipboards: ${chosen.map(x => x.cb.name).join(', ') || 'none'}`} title="Analysed clipboards">
        <span className="an-cb-dots" aria-hidden="true">{chosen.slice(0, 4).map(x => <span key={x.cb.id} className="an-chip-dot" style={{ ['--chip' as string]: x.cb.color }} />)}</span>
        <span>{chosenLabel}</span><ChevronDown size={12} />
      </button>
      <div className="an-chipbar" role="group" aria-label="Analysed clipboards (click: only this, Ctrl+click: combine)">
      <ChipScroller>
        {consultation.clipboards.map((cb, i) => (
          <button
            key={cb.id}
            className={`an-chip${selected.has(cb.id) ? ' on' : ''}`}
            aria-pressed={selected.has(cb.id)}
            style={{ ['--chip' as string]: cb.color }}
            title={`${cb.name}: ${cb.symptoms.length} symptoms\nClick: analyse only this · Ctrl+click: add/remove`}
            onClick={e => onChip(cb.id, e)}
          >
            <span className="an-chip-dot" aria-hidden="true" />{i + 1}<span className="an-chip-name">{cb.name.replace(/^Clipboard \d+$/, '')}</span><span className="an-chip-n">{cb.symptoms.length}</span>
          </button>
        ))}
      </ChipScroller>
        {consultation.clipboards.length > 1 && (
          <button className={`an-chip an-chip-all${allSelected ? ' on' : ''}`} aria-pressed={allSelected} title="Analyse all non-empty clipboards" onClick={analyseAll}>All</button>
        )}
      </div>
      <div className="an-sep" />
      <button className="icon-btn an-tb-low" aria-pressed={o.useIntensity !== false} aria-label="Use symptom intensity" title="Use symptom intensity (×1–×4)" onClick={() => ops.setOptions({ useIntensity: o.useIntensity === false }, consultation.id)}><Weight size={15} /></button>
      <button className="icon-btn an-tb-low" aria-pressed={!!o.showExcluded} aria-label="Show excluded remedies in position" title="Show excluded remedies greyed in their position" onClick={() => ops.setOptions({ showExcluded: !o.showExcluded }, consultation.id)}>{o.showExcluded ? <Eye size={15} /> : <EyeOff size={15} />}</button>
      <div className={`an-split${ops.hasFilter(o) ? ' on' : ''}`}>
        <button className="icon-btn" aria-label="Filter remedies" title={familyDialog ? 'Family filter: limit or highlight families' : 'Limit, exclude or highlight remedies'} onClick={() => ops.openFilter(cid)}><Filter size={15} /></button>
        <button className="icon-btn an-split-more" {...trigger('filter')} aria-label="Filter options" title="Filter options"><ChevronDown size={11} /></button>
      </div>
      <RemedyBox result={result} catalog={catalog} onPick={onReveal} />
      <div className="an-spacer" />
      <span className="an-count" aria-live="polite">
        {result ? <><strong>{result.total.toLocaleString()}</strong><span className="an-count-word"> remedies</span></> : '…'}
      </span>
      <select className="an-select" aria-label="Remedies shown" value={limit} onChange={e => ops.setOptions({ limit: Number(e.target.value) }, consultation.id)}>
        {ops.LIMITS.map(n => <option key={n} value={n}>Top {limitLabel(n)}</option>)}
        {!ops.LIMITS.includes(limit) && <option value={limit}>Top {limit}</option>}
      </select>
      <div className="an-seg" role="radiogroup" aria-label="Display">
        {([['grid', Grid3x3, 'Grid'], ['bars', ChartBarStacked, 'Bars'], ['cards', LayoutGrid, 'Cards']] as const).map(([v, Icon, label]) => (
          <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} aria-label={label} title={`${label} (${label[0]})`} onClick={() => actions.updateTab<AnalysisTab>(tab.id, { view: v })}>
            <Icon size={14} /><span className="an-seg-label">{label}</span>
          </button>
        ))}
      </div>
      {/* wide toolbars show these three; narrower ones fold them (and then the scoring toggles) into "More" so the strategy keeps its name */}
      <button className="icon-btn an-tb-wide" aria-label="Compare remedies" title="Compare remedies" onClick={() => ops.openCompare(undefined, cid)}><GitCompare size={15} /></button>
      <button className="icon-btn an-tb-wide" {...trigger('export')} aria-label="Export" title="Export CSV / PNG"><Download size={15} /></button>
      <button className="icon-btn an-tb-wide" aria-label="Print analysis" title="Print (Ctrl+P)" onClick={() => void ops.printAnalysis(cid)}><Printer size={15} /></button>
      <button className="icon-btn an-tb-more" {...trigger('more')} aria-label="More analysis actions" title="More: scoring toggles, compare, export, print"><Ellipsis size={15} /></button>
      {menu && (
        <MenuList items={menuItems[menu.kind]} x={menu.x} y={menu.y} label={MENU_LABEL[menu.kind]} onClose={closeMenu} />
      )}
    </div>
  )
}

/**
 * Horizontally scrolling chip strip: a case can have many clipboards, the strip never grows the toolbar.
 * It snaps to whole chips; the wheel steps one chip; edge fades show there is more. Geometry is read only
 * in scroll / resize callbacks (never during React's commit), batched to one frame.
 */
function ChipScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const left = el.scrollLeft > 0, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
        setEdge(e => (e.left === left && e.right === right ? e : { left, right }))
      })
    }
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      const chip = el.firstElementChild as HTMLElement | null
      el.scrollBy({ left: Math.sign(e.deltaY) * ((chip?.offsetWidth ?? 60) + 3), behavior: 'smooth' })
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const observeChips = () => { for (const c of el.children) ro.observe(c) }
    observeChips()
    // chips come and go with the case's clipboards
    const mo = new MutationObserver(() => { observeChips(); update() })
    mo.observe(el, { childList: true })
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { cancelAnimationFrame(frame); el.removeEventListener('scroll', update); el.removeEventListener('wheel', onWheel); ro.disconnect(); mo.disconnect() }
  }, [])
  return (
    <div ref={ref} className={`an-chips${edge.left ? ' fade-l' : ''}${edge.right ? ' fade-r' : ''}`}>
      {children}
    </div>
  )
}

/** Active filters and pinned columns, below the toolbar so the toolbar keeps a stable height. */
function PillBar({ live, tab, pinned, limit, onOpenParams }: { live: LiveAnalysis; tab: AnalysisTab; pinned: number[]; limit: number; onOpenParams: () => void }) {
  const { consultation, catalog, result } = live
  if (!consultation) return null
  const o = consultation.analysis
  const minGrade = result?.minGrade ?? 1
  const custom = hasCustomParams(o)
  const any = o.remedyFilter || o.highlight?.length || o.excludedRemedies.length || o.minCoverage > 0 || pinned.length || minGrade > 1 || custom
  if (!any) return null
  const set = (patch: Parameters<typeof ops.setOptions>[0]) => ops.setOptions(patch, consultation.id)
  return (
    <div className="an-pillbar" role="group" aria-label="Active filters">
      {minGrade > 1 && (
        <span className="an-pill view" title={`The repertory view shows grade ${minGrade} and higher, so the analysis uses only those grades (View menu)`}>
          <Grid3x3 size={11} /><span className="an-ellipsis">Grades ≥ {minGrade} (view)</span>
          <button aria-label="Show all grades" onClick={() => actions.setSettings({ minGradeShown: 1 })}><X size={11} /></button>
        </span>
      )}
      {custom && (
        <span className="an-pill params">
          <button className="an-pill-text" onClick={onOpenParams} title="Strategy parameters differ from the defaults: open them"><SlidersHorizontal size={11} /> Custom parameters</button>
          <button aria-label="Reset strategy parameters to defaults" onClick={() => ops.setParams(null, consultation.id)}><X size={11} /></button>
        </span>
      )}
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
      {ops.hasFilter(o) && <button className="btn btn-sm btn-ghost an-pill-clear" onClick={() => ops.clearFilter(consultation.id)}>Clear filters</button>}
    </div>
  )
}

/** Type-to-jump box listing every remedy of this analysis (also beyond the limit and excluded ones). */
function RemedyBox({ result, catalog, onPick }: { result: AnalysisResult | null; catalog: LiveAnalysis['catalog']; onPick: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [k, setK] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s || !result) return []
    const starts: AnalysisRow[] = [], contains: AnalysisRow[] = []
    for (const r of result.all.length === result.total ? [...result.all, ...result.excludedRows] : result.all) {
      const rem = catalog.remedy(r.remedyId)
      const a = rem.abbrev.toLowerCase(), n = rem.name.toLowerCase()
      if (a.startsWith(s) || n.startsWith(s)) starts.push(r)
      else if (a.includes(s) || n.includes(s)) contains.push(r)
      if (starts.length >= 12) break
    }
    return [...starts, ...contains].slice(0, 12)
  }, [q, result, catalog])
  const pick = (r: AnalysisRow | undefined) => {
    if (!r) return
    onPick(r.remedyId)
    setQ('')
    setOpen(false)
  }
  return (
    <div className="an-rbox">
      <Search size={13} aria-hidden="true" />
      <input
        ref={ref}
        className="an-rbox-input"
        placeholder="Jump…"
        aria-label="Jump to remedy in analysis"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="an-rbox-list"
        aria-autocomplete="list"
        value={q}
        data-analysis-remedy-box
        onChange={e => { setQ(e.target.value); setOpen(true); setK(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setK(x => Math.min(matches.length - 1, x + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setK(x => Math.max(0, x - 1)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(matches[k]) }
          else if (e.key === 'Escape') { e.stopPropagation(); setQ(''); setOpen(false); ref.current?.blur() }
        }}
      />
      {open && q.trim() && (
        <div className="an-rbox-list" id="an-rbox-list" role="listbox">
          {matches.length === 0 && <div className="an-rbox-empty">Not in this analysis</div>}
          {matches.map((r, i) => {
            const rem = catalog.remedy(r.remedyId)
            return (
              <div key={r.remedyId} role="option" aria-selected={i === k} className={`an-rbox-opt${i === k ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); pick(r) }} onMouseEnter={() => setK(i)}>
                <span className="an-rbox-rank">{r.rank || '–'}</span>
                <strong>{rem.abbrev}</strong>
                <span className="an-muted">{rem.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
