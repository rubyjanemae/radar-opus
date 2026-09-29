import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  Ban, ChartBarStacked, ChessKnight, ChevronDown, Download, Eye, EyeOff, Filter, GitCompare, Grid3x3,
  Highlighter, LayoutGrid, LoaderCircle, Printer, Search, TriangleAlert, Weight, X,
} from 'lucide-react'
import { runCommand } from '../../commands/registry'
import { STRATEGIES, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import { actions } from '../../state/store'
import type { AnalysisTab, AnalysisViewMode } from '../../state/workspace'
import { MenuList } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { AnalysisBars, GradeLegend } from './AnalysisBars'
import { AnalysisCards } from './AnalysisCards'
import { AnalysisGrid } from './AnalysisGrid'
import { RemedyPanel } from './RemedyPanel'
import * as ops from './ops'
import { useAnalysis } from './useAnalysis'
import type { LiveAnalysis } from './useAnalysis'
import './analysis.css'

const CARD_CAP = 200

export function AnalysisView({ tab }: { tab: AnalysisTab }) {
  const live = useAnalysis(tab.consultationId)
  const { consultation, result, load, catalog, source } = live
  const view: AnalysisViewMode = tab.view ?? 'grid'
  const [symptom, setSymptom] = useState<number | null>(null)
  const [reveal, setReveal] = useState<{ remedyId: number; nonce: number } | null>(null)
  const selectedRemedy = tab.remedy ?? null

  const selectRemedy = useCallback((id: number | null) => actions.updateTab<AnalysisTab>(tab.id, { remedy: id }), [tab.id])
  const openRemedy = useCallback((id: number) => ops.openRemedyTab(id), [])

  const options = consultation?.analysis
  const limit = options?.limit ?? 30
  const rows = result?.rows ?? []
  const highlight = useMemo(() => (options?.highlight?.length ? new Set(options.highlight) : null), [options?.highlight])
  const selectedRow = selectedRemedy != null ? result?.all.find(r => r.remedyId === selectedRemedy) ?? null : null

  useEffect(() => { if (result && symptom != null && symptom >= result.symptoms.length) setSymptom(null) }, [result, symptom])

  const remedyMenu = useCallback((row: AnalysisRow): MenuItem[] => {
    const excluded = options?.excludedRemedies.includes(row.remedyId) ?? false
    return [
      { label: 'Show score details', run: () => selectRemedy(row.remedyId) },
      { label: 'Open remedy', run: () => ops.openRemedyTab(row.remedyId) },
      { label: 'Materia medica', run: () => ops.openMateriaMedica(row.remedyId) },
      { type: 'separator' },
      { label: excluded ? 'Include remedy again' : 'Exclude remedy', run: () => ops.toggleExcluded(row.remedyId, tab.consultationId) },
      { label: 'Compare with top remedies…', run: () => ops.openCompare([row.remedyId, ...rows.filter(r => r.remedyId !== row.remedyId && !r.excluded).slice(0, 3).map(r => r.remedyId)]) },
    ]
  }, [options?.excludedRemedies, rows, selectRemedy, tab.consultationId])

  const symptomMenu = useCallback((i: number): MenuItem[] => {
    const s = result?.symptoms[i]
    if (!s) return []
    return [
      { label: symptom === i ? 'Clear highlight' : 'Highlight remedies in this symptom', run: () => setSymptom(symptom === i ? null : i) },
      { label: 'Open rubric in repertory', run: () => openRubric(s.symptom.rubrics[0]) },
    ]
  }, [result, symptom])

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
        {ops.hasFilter(options) && <button className="btn" onClick={() => ops.clearFilter()}>Clear filters</button>}
      </div>
    )
  } else if (view === 'grid') {
    body = (
      <AnalysisGrid
        result={result} rows={rows} catalog={catalog} clipboardColor={clipboardColor}
        selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
        onSelectRemedy={selectRemedy} onSelectSymptom={setSymptom} onOpenRemedy={openRemedy}
        onOpenSymptom={i => openRubric(result.symptoms[i].symptom.rubrics[0])}
        remedyMenu={remedyMenu} symptomMenu={symptomMenu} reveal={reveal}
      />
    )
  } else if (view === 'bars') {
    body = (
      <div className="an-bars-wrap">
        <div className="an-bars-head"><GradeLegend /><span className="an-muted">Bar length: points per symptom · click a segment to highlight its symptom</span></div>
        <AnalysisBars
          result={result} rows={rows} catalog={catalog} selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
          onSelectRemedy={selectRemedy} onSelectSymptom={setSymptom} onOpenRemedy={openRemedy} remedyMenu={remedyMenu} reveal={reveal}
        />
      </div>
    )
  } else {
    body = (
      <div className="an-cards-wrap">
        <AnalysisCards
          result={result} rows={rows.slice(0, CARD_CAP)} catalog={catalog} selectedRemedy={selectedRemedy} selectedSymptom={symptom} highlight={highlight}
          onSelectRemedy={selectRemedy} onOpenRemedy={openRemedy} remedyMenu={remedyMenu} reveal={reveal}
        />
        {rows.length > CARD_CAP && <div className="an-muted an-cap">Showing the first {CARD_CAP} of {rows.length} remedies as cards. Use the grid or bars for the rest.</div>}
      </div>
    )
  }

  return (
    <div
      className="an-view"
      data-testid="analysis-view"
      onKeyDown={e => {
        if (e.key === 'Escape' && (selectedRemedy != null || symptom != null)) { selectRemedy(null); setSymptom(null) }
      }}
    >
      <Toolbar live={live} tab={tab} view={view} limit={limit} onReveal={id => { selectRemedy(id); setReveal({ remedyId: id, nonce: Date.now() }) }} />
      {symptom != null && result?.symptoms[symptom] && (
        <div className="an-symbar" role="status">
          <span>Highlighting remedies in <strong>{result.symptoms[symptom].label}</strong> · {result.symptoms[symptom].size} remedies</span>
          <button className="icon-btn" aria-label="Clear symptom highlight" onClick={() => setSymptom(null)}><X size={13} /></button>
        </div>
      )}
      <div className="an-body">
        <div className="an-main">{body}</div>
        {selectedRow && result && (
          <RemedyPanel
            result={result} row={selectedRow} source={source} catalog={catalog} selectedSymptom={symptom} onSelectSymptom={setSymptom}
            onClose={() => selectRemedy(null)}
            onOpenRemedy={() => ops.openRemedyTab(selectedRow.remedyId)}
            onOpenMM={() => ops.openMateriaMedica(selectedRow.remedyId)}
            onToggleExclude={() => ops.toggleExcluded(selectedRow.remedyId, consultation.id)}
            onCompare={() => ops.openCompare([selectedRow.remedyId, ...rows.filter(r => r.remedyId !== selectedRow.remedyId && !r.excluded).slice(0, 3).map(r => r.remedyId)])}
            manuallyExcluded={options?.excludedRemedies.includes(selectedRow.remedyId) ?? false}
          />
        )}
      </div>
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
  if (c.excluding) parts.push(`${c.excluding} by excluding symptoms`)
  if (c.filter) parts.push(`${c.filter} outside the remedy filter`)
  if (c.manual) parts.push(`${c.manual} excluded by you`)
  if (c.coverage) parts.push(`${c.coverage} cover too few symptoms`)
  if (!r.scoredCount) return 'Every symptom is at intensity 0 or excluding, so nothing is scored.'
  return parts.length ? `${parts.join(', ')}.` : 'No remedy appears in the scored symptoms.'
}

function Toolbar({ live, tab, view, limit, onReveal }: { live: LiveAnalysis; tab: AnalysisTab; view: AnalysisViewMode; limit: number; onReveal: (id: number) => void }) {
  const { consultation, result, catalog } = live
  const [menu, setMenu] = useState<{ kind: 'strategy' | 'export'; x: number; y: number } | null>(null)
  if (!consultation) return null
  const o = consultation.analysis
  const info = strategyInfo(o.strategy)
  const selected = new Set(o.clipboardIds)
  const openMenu = (kind: 'strategy' | 'export', e: ReactMouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ kind, x: r.left, y: r.bottom + 2 })
  }
  const strategyItems: MenuItem[] = [
    { type: 'label', label: 'Analysis method' },
    ...STRATEGIES.map(s => ({ command: `analysis.strategy.${s.id}` })),
    { type: 'separator' },
    { command: 'analysis.intensity' },
    { command: 'analysis.showExcluded' },
  ]
  const exportItems: MenuItem[] = [{ command: 'analysis.exportCsv' }, { command: 'analysis.exportPng' }, { type: 'separator' }, { command: 'analysis.print' }]
  const onChip = (id: string, e: ReactMouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const next = selected.has(id) ? o.clipboardIds.filter(x => x !== id) : [...o.clipboardIds, id]
      ops.setOptions({ clipboardIds: consultation.clipboards.map(c => c.id).filter(x => next.includes(x)) }, consultation.id)
    } else ops.setOptions({ clipboardIds: [id] }, consultation.id)
  }
  const allSelected = consultation.clipboards.every(c => selected.has(c.id))
  const limitLabel = (n: number) => (n >= 100000 ? 'All' : String(n))

  return (
    <div className="an-toolbar" role="toolbar" aria-label="Analysis toolbar">
      <button className="an-tb-btn an-strategy" aria-haspopup="menu" aria-label={`Analysis method: ${info.name}`} title={`${info.name}: ${info.description}`} onClick={e => openMenu('strategy', e)}>
        <ChessKnight size={15} /><span>{info.short}</span><ChevronDown size={12} />
      </button>
      <div className="an-sep" />
      <div className="an-chips" role="group" aria-label="Analysed clipboards (click: only this, Ctrl+click: combine)">
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
        {consultation.clipboards.length > 1 && (
          <button className={`an-chip${allSelected ? ' on' : ''}`} aria-pressed={allSelected} title="Analyse all non-empty clipboards" onClick={() => {
            const ne = consultation.clipboards.filter(c => c.symptoms.length).map(c => c.id)
            ops.setOptions({ clipboardIds: ne.length ? ne : consultation.clipboards.map(c => c.id) }, consultation.id)
          }}>All</button>
        )}
      </div>
      <div className="an-sep" />
      <button className="icon-btn" aria-pressed={o.useIntensity !== false} aria-label="Use symptom intensity" title="Use symptom intensity (×1–×4)" onClick={() => ops.setOptions({ useIntensity: o.useIntensity === false }, consultation.id)}><Weight size={15} /></button>
      <button className="icon-btn" aria-pressed={!!o.showExcluded} aria-label="Show excluded remedies in position" title="Show excluded remedies greyed in their position" onClick={() => ops.setOptions({ showExcluded: !o.showExcluded }, consultation.id)}>{o.showExcluded ? <Eye size={15} /> : <EyeOff size={15} />}</button>
      <button className="icon-btn" aria-label="Filter remedies" title="Limit, exclude or highlight remedies" onClick={() => runCommand('analysis.filter')}><Filter size={15} /></button>
      {o.remedyFilter && (
        <span className="an-pill" title={`${o.remedyFilter.length} remedies`}>
          <Filter size={11} />Limited: {o.filterLabel ?? `${o.remedyFilter.length} remedies`}
          <button aria-label="Remove remedy limit" onClick={() => ops.setOptions({ remedyFilter: null, filterLabel: null }, consultation.id)}><X size={11} /></button>
        </span>
      )}
      {!!o.highlight?.length && (
        <span className="an-pill fam">
          <Highlighter size={11} />{o.highlightLabel ?? `${o.highlight.length} highlighted`}
          <button aria-label="Remove highlight" onClick={() => ops.setOptions({ highlight: null, highlightLabel: null }, consultation.id)}><X size={11} /></button>
        </span>
      )}
      {o.excludedRemedies.length > 0 && (
        <span className="an-pill" title={o.excludedRemedies.map(id => catalog.remedy(id).abbrev).join(', ')}>
          <Ban size={11} />{o.excludedRemedies.length} excluded
          <button aria-label="Include all excluded remedies" onClick={() => ops.setOptions({ excludedRemedies: [] }, consultation.id)}><X size={11} /></button>
        </span>
      )}
      {o.minCoverage > 0 && (
        <span className="an-pill">≥ {o.minCoverage} symptoms
          <button aria-label="Remove minimum coverage" onClick={() => ops.setOptions({ minCoverage: 0 }, consultation.id)}><X size={11} /></button>
        </span>
      )}
      <RemedyBox result={result} catalog={catalog} onPick={onReveal} />
      <div className="an-spacer" />
      <span className="an-count" aria-live="polite">
        {result ? <><strong>{result.total.toLocaleString()}</strong> remedies</> : '…'}
      </span>
      <select className="an-select" aria-label="Remedies shown" value={limit} onChange={e => ops.setOptions({ limit: Number(e.target.value) }, consultation.id)}>
        {ops.LIMITS.map(n => <option key={n} value={n}>Top {limitLabel(n)}</option>)}
        {!ops.LIMITS.includes(limit) && <option value={limit}>Top {limit}</option>}
      </select>
      <div className="an-seg" role="radiogroup" aria-label="Display">
        {([['grid', Grid3x3, 'Grid'], ['bars', ChartBarStacked, 'Bars'], ['cards', LayoutGrid, 'Cards']] as const).map(([v, Icon, label]) => (
          <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} title={`${label} (${label[0]})`} onClick={() => actions.updateTab<AnalysisTab>(tab.id, { view: v })}>
            <Icon size={14} /><span>{label}</span>
          </button>
        ))}
      </div>
      <button className="icon-btn" aria-label="Compare remedies" title="Compare remedies" onClick={() => runCommand('analysis.compare')}><GitCompare size={15} /></button>
      <button className="icon-btn" aria-label="Export" aria-haspopup="menu" title="Export CSV / PNG" onClick={e => openMenu('export', e)}><Download size={15} /></button>
      <button className="icon-btn" aria-label="Print analysis" title="Print (Ctrl+P)" onClick={() => runCommand('analysis.print')}><Printer size={15} /></button>
      {menu && (
        <MenuList
          items={menu.kind === 'strategy' ? strategyItems : exportItems}
          x={menu.x}
          y={menu.y}
          label={menu.kind === 'strategy' ? 'Analysis method' : 'Export'}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

/** Type-to-jump box listing only the remedies in this analysis. */
function RemedyBox({ result, catalog, onPick }: { result: AnalysisResult | null; catalog: LiveAnalysis['catalog']; onPick: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [k, setK] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s || !result) return []
    const starts: AnalysisRow[] = [], contains: AnalysisRow[] = []
    for (const r of result.all) {
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
        placeholder="Jump to remedy"
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
