import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { actions, useApp } from '../../state/store'
import type { MapsTab } from '../../state/workspace'
import { useFamilies } from '../families/api'
import { useAnalysis } from '../analysis/useAnalysis'
import { analysisTitle } from '../analysis/saved'
import { openAnalysisFor, targetConsultationId } from '../analysis/ops'
import { fullName } from '../patients/panel'
import { elementCells, heat, kingdomRows, MAP_KINDS, MAP_TITLES, periodicPosition } from './model'
import type { ElementCell, KingdomRow, Ranking } from './model'
import { SYMBOLS } from './elements'

/** Choices of how many leading remedies count as the top of the analysis. */
const TOPS = [10, 20, 30, 50, 100]
import './maps.css'

type Ranked = { remedyId: number; rank: number }[]

/** View › Maps: the active case's analysis on the periodic table or across the kingdoms. */
export function MapsView({ tab }: { tab: MapsTab }) {
  const catalog = useCatalog()
  const { index, error, retry } = useFamilies()
  const consultationId = useApp(s => targetConsultationId(s))
  const caseLabel = useApp(s => {
    const c = consultationId ? s.consultations[consultationId] : null
    const p = c ? s.patients[c.patientId] : null
    return c && p ? `${fullName(p)} · ${analysisTitle(c, s.consultations)}` : null
  })
  const { result } = useAnalysis(consultationId)
  const top = TOPS.includes(tab.top ?? 0) ? tab.top! : 30
  const ranking = useMemo<Ranking>(() => new Map((result?.rows ?? []).filter(r => r.rank > 0).map(r => [r.remedyId, r.rank])), [result])
  const cells = useMemo(() => (index ? elementCells(index, ranking) : []), [index, ranking])
  const kingdoms = useMemo(() => (index ? kingdomRows(index, ranking, top) : []), [index, ranking, top])
  const set = (patch: Partial<MapsTab>) => actions.updateTab<MapsTab>(tab.id, patch)

  const selected = tab.map === 'kingdoms' ? kingdoms.find(k => k.id === tab.selected) : cells.find(c => c.id === tab.selected)
  const selectedName = !selected ? null : 'symbol' in selected ? `${selected.name} (${selected.symbol})` : selected.name
  const selectedRanked: Ranked = selected?.ranked ?? []
  const selectedSize = selected ? ('remedies' in selected ? selected.remedies.length : selected.size) : 0

  return (
    <div className="mp-view" data-testid="maps-view">
      <div className="mp-toolbar" role="toolbar" aria-label="Maps toolbar">
        <div className="mp-seg" role="radiogroup" aria-label="Map">
          {MAP_KINDS.map(k => (
            <button key={k} role="radio" aria-checked={tab.map === k} className={`mp-seg-btn${tab.map === k ? ' on' : ''}`} onClick={() => set({ map: k, selected: null })}>{MAP_TITLES[k]}</button>
          ))}
        </div>
        <label className="mp-top">Top
          <select value={top} onChange={e => set({ top: Number(e.target.value) })} aria-label="Remedies counted as top">
            {TOPS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="mp-case" title={caseLabel ?? undefined}>{caseLabel ? `Analysis: ${caseLabel}` : 'No case open: the map shows how many remedies each place holds'}</span>
      </div>
      {error ? (
        <div className="mp-msg" role="alert"><TriangleAlert size={18} aria-hidden="true" /> The classification could not be loaded. <button className="btn" onClick={retry}><RotateCw size={13} aria-hidden="true" /> Retry</button></div>
      ) : !index ? (
        <div className="mp-msg"><LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading the classification…</div>
      ) : (
        <div className="mp-body">
          <div className="mp-map">
            {tab.map === 'periodic'
              ? <PeriodicTable cells={cells} top={top} ranked={ranking.size > 0} selected={tab.selected ?? null} onSelect={id => set({ selected: id })} />
              : <KingdomList rows={kingdoms} top={top} ranked={ranking.size > 0} selected={tab.selected ?? null} onSelect={id => set({ selected: id })} />}
            <Legend top={top} ranked={ranking.size > 0} />
          </div>
          <aside className="mp-side" aria-label="Remedies of the selection">
            <div className="mp-side-head">{selectedName ?? (tab.map === 'periodic' ? 'Choose an element' : 'Choose a kingdom')}</div>
            {selected && (
              <div className="mp-side-sub">{ranking.size ? `${selectedRanked.length} of ${selectedSize} remedies in the analysis` : `${selectedSize} remedies`}</div>
            )}
            <ol className="mp-side-list">
              {(ranking.size ? selectedRanked : (selected && 'remedies' in selected ? selected.remedies : []).map(id => ({ remedyId: id, rank: 0 }))).slice(0, 300).map(r => {
                const rem = catalog.remedy(r.remedyId)
                return (
                  <li key={r.remedyId}>
                    <button className="mp-rem" title={rem.name} disabled={!consultationId || !r.rank}
                      onClick={() => consultationId && openAnalysisFor(consultationId, r.remedyId)}>
                      {r.rank > 0 && <span className="mp-rank">{r.rank}</span>}
                      <span className="mp-abbrev">{rem.abbrev}</span>
                      <span className="mp-name">{rem.name}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </aside>
        </div>
      )}
    </div>
  )
}

function Legend({ top, ranked }: { top: number; ranked: boolean }) {
  if (!ranked) return <div className="mp-legend">Each place shows the number of its remedies.</div>
  return (
    <div className="mp-legend" aria-label="Legend">
      <span><i className="mp-swatch h3" /> best rank 1–{Math.max(1, Math.round(top / 3))}</span>
      <span><i className="mp-swatch h2" /> within the top {top}</span>
      <span><i className="mp-swatch h1" /> ranked lower</span>
      <span><i className="mp-swatch h0" /> not in the analysis</span>
    </div>
  )
}

/** Arrow keys move between the buttons of a 2-D map by their screen position. */
function moveFocus(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
  if (!dir || !root) return
  const from = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
  if (!from) return
  e.preventDefault()
  const a = from.getBoundingClientRect()
  let best: HTMLElement | null = null, bestD = Infinity
  for (const el of root.querySelectorAll<HTMLElement>('[data-cell]')) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2)
    const along = dx * dir[0] + dy * dir[1]
    if (along <= 1) continue
    const across = Math.abs(dir[0] ? dy : dx)
    const d = along + across * 3
    if (d < bestD) { bestD = d; best = el }
  }
  best?.focus()
}

function useRovingStart(root: React.RefObject<HTMLElement | null>, selected: string | null) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const cells = [...el.querySelectorAll<HTMLElement>('[data-cell]')]
    const stop = cells.find(c => c.dataset.cell === selected) ?? cells[0]
    for (const c of cells) c.tabIndex = c === stop ? 0 : -1
  })
}

function PeriodicTable({ cells, top, ranked, selected, onSelect }: { cells: ElementCell[]; top: number; ranked: boolean; selected: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useRovingStart(ref, selected)
  const byZ = new Map(cells.map(c => [c.z, c]))
  return (
    <div className="mp-pt" ref={ref} role="group" aria-label="Periodic table" onKeyDown={e => moveFocus(e, ref.current)}>
      {SYMBOLS.map((sym, i) => {
        const z = i + 1
        const c = byZ.get(z)
        const pos = cellPos(z)
        if (!c || !c.remedies.length) {
          return <div key={z} className="mp-el empty" style={pos} aria-hidden="true"><span className="mp-z">{z}</span><span className="mp-sym">{sym}</span></div>
        }
        const best = c.ranked[0]?.rank
        const h = ranked ? heat(best, top) : 0
        const label = ranked
          ? `${c.name} (${c.symbol}): ${c.ranked.length ? `${c.ranked.length} remedies in the analysis, best rank ${best}` : 'no remedy in the analysis'}`
          : `${c.name} (${c.symbol}): ${c.remedies.length} remedies`
        return (
          <button key={z} data-cell={c.id} className={`mp-el h${h}${selected === c.id ? ' sel' : ''}`} style={pos} aria-label={label} aria-pressed={selected === c.id} title={label}
            onClick={() => onSelect(c.id)}>
            <span className="mp-z">{z}</span>
            <span className="mp-sym">{c.symbol}</span>
            <span className="mp-n">{ranked ? (best ? `#${best}` : '') : c.remedies.length}</span>
          </button>
        )
      })}
    </div>
  )
}

function cellPos(z: number) {
  // same layout as periodicPosition (model.ts), kept local so missing elements still draw their place
  const p = periodicPositionCached(z)
  return { gridRow: p.row, gridColumn: p.col }
}
const posCache = new Map<number, { row: number; col: number }>()
function periodicPositionCached(z: number) {
  let p = posCache.get(z)
  if (!p) { p = periodicPosition(z) ?? { row: 1, col: 1 }; posCache.set(z, p) }
  return p
}

function KingdomList({ rows, top, ranked, selected, onSelect }: { rows: KingdomRow[]; top: number; ranked: boolean; selected: string | null; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useRovingStart(ref, selected)
  const max = Math.max(1, ...rows.map(r => (ranked ? r.inTop : r.size)))
  return (
    <div className="mp-kd" ref={ref} role="group" aria-label="Kingdoms" onKeyDown={e => moveFocus(e, ref.current)}>
      {rows.map(r => {
        const best = r.ranked[0]?.rank
        const value = ranked ? r.inTop : r.size
        const label = ranked ? `${r.name}: ${r.inTop} in the top ${top}, best rank ${best ?? 'none'}, ${r.ranked.length} of ${r.size} in the analysis` : `${r.name}: ${r.size} remedies`
        return (
          <button key={r.id} data-cell={r.id} className={`mp-k h${ranked ? heat(best, top) : 0}${selected === r.id ? ' sel' : ''}`} aria-label={label} aria-pressed={selected === r.id} onClick={() => onSelect(r.id)}>
            <span className="mp-k-name">{r.name}</span>
            <span className="mp-k-bar"><i style={{ width: `${(100 * value) / max}%` }} /></span>
            <span className="mp-k-val">{ranked ? `${r.inTop} in top ${top}` : `${r.size}`}</span>
            <span className="mp-k-best">{ranked ? (best ? `best #${best}` : 'none ranked') : ''}</span>
          </button>
        )
      })}
    </div>
  )
}
