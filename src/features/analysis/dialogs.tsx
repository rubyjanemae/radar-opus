import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Catalog } from '../../data/catalog'
import type { Remedy } from '../../data/types'
import { formatScore } from '../../engine/analysis'
import type { AnalysisRow } from '../../engine/analysis'
import { actions } from '../../state/store'
import { Dialog } from '../../ui/Dialog'
import { GradeMark, GroupMark } from '../../ui/marks'
import { caseChapterCoverage, initialCompare, MAX_COMPARE, sphereOfAction } from './compare'
import { useAnalysis } from './useAnalysis'

/** Search remedies: analysis remedies (by rank) first, then the rest of the catalog. */
export function searchRemedies(catalog: Catalog, q: string, ranked: AnalysisRow[], limit = 50): Remedy[] {
  const s = q.trim().toLowerCase()
  const inAnalysis = ranked.map(r => catalog.remedy(r.remedyId))
  const seen = new Set(inAnalysis.map(r => r.id))
  const pool = [...inAnalysis, ...[...catalog.remedies.values()].filter(r => !seen.has(r.id)).sort((a, b) => a.abbrev.localeCompare(b.abbrev))]
  if (!s) return pool.slice(0, limit)
  const starts: Remedy[] = [], contains: Remedy[] = []
  for (const r of pool) {
    const a = r.abbrev.toLowerCase(), n = r.name.toLowerCase()
    if (a.startsWith(s) || n.startsWith(s)) starts.push(r)
    else if (a.includes(s) || n.includes(s) || (r.altName ?? '').toLowerCase().includes(s)) contains.push(r)
  }
  return [...starts, ...contains].slice(0, limit)
}

function RemedyAdder({ catalog, ranked, exclude, onAdd, disabled, placeholder }: { catalog: Catalog; ranked: AnalysisRow[]; exclude: Set<number>; onAdd: (id: number) => void; disabled?: boolean; placeholder: string }) {
  const [q, setQ] = useState('')
  const [k, setK] = useState(0)
  const [open, setOpen] = useState(false)
  const list = useMemo(() => searchRemedies(catalog, q, ranked, 30).filter(r => !exclude.has(r.id)).slice(0, 10), [catalog, q, ranked, exclude])
  const rankOf = useMemo(() => new Map(ranked.map(r => [r.remedyId, r.rank])), [ranked])
  const add = (r: Remedy | undefined) => { if (r) { onAdd(r.id); setQ(''); setK(0) } }
  return (
    <div className="an-adder">
      <input
        className="input" placeholder={placeholder} aria-label={placeholder} value={q} disabled={disabled}
        role="combobox" aria-expanded={open && list.length > 0} aria-autocomplete="list"
        onChange={e => { setQ(e.target.value); setK(0); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setK(x => Math.min(list.length - 1, x + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setK(x => Math.max(0, x - 1)) }
          else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(list[k]) }
        }}
      />
      {open && q.trim() && (
        <div className="an-rbox-list" role="listbox">
          {list.length === 0 && <div className="an-rbox-empty">No remedy found</div>}
          {list.map((r, i) => (
            <div key={r.id} role="option" aria-selected={i === k} className={`an-rbox-opt${i === k ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); add(r) }} onMouseEnter={() => setK(i)}>
              <span className="an-rbox-rank">{rankOf.get(r.id) || ''}</span><strong>{r.abbrev}</strong><span className="an-muted">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compare 2–10 remedies: case symptoms, case chapters and sphere of action side by side. */
export function CompareDialog({ consultationId, initial, onClose }: { consultationId: string; initial?: number[]; onClose: () => void }) {
  const { result, catalog, source } = useAnalysis(consultationId)
  const [picked, setPicked] = useState<number[] | null>(null)
  const list = picked ?? initialCompare(result, initial)
  const [tab, setTab] = useState<'symptoms' | 'chapters' | 'sphere'>('symptoms')
  const ranked = useMemo(() => result?.all.filter(r => !r.excluded) ?? [], [result])
  const rowOf = useMemo(() => new Map(result?.all.map(r => [r.remedyId, r]) ?? []), [result])
  const reps = useMemo(() => {
    const count = new Map<string, number>()
    for (const s of result?.symptoms ?? []) for (const r of s.symptom.rubrics) { const a = r.slice(0, r.lastIndexOf(':')); count.set(a, (count.get(a) ?? 0) + 1) }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a)
  }, [result])
  const [repChoice, setRepChoice] = useState<string | null>(null)
  const repAbbrev = repChoice ?? reps[0] ?? catalog.repertoryInfos[0]?.abbrev
  const rep = repAbbrev ? catalog.repertory(repAbbrev) : undefined
  const sphere = useMemo(() => (tab === 'sphere' && rep && list.length ? sphereOfAction(rep, list) : null), [tab, rep, list])
  const chapters = useMemo(() => (result && list.length ? caseChapterCoverage(result, list, ref => source.chapter(ref)) : []), [result, list, source])

  const set = (next: number[]) => setPicked(next.slice(0, MAX_COMPARE))
  const scored = result?.symptoms.map((s, i) => ({ s, i })).filter(x => x.s.role === 'scored') ?? []

  return (
    <Dialog title="Compare remedies" onClose={onClose} width={960} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="an-cmp-pick">
        <div className="an-cmp-chips" aria-label="Compared remedies">
          {list.map(id => {
            const rem = catalog.remedy(id)
            const row = rowOf.get(id)
            return (
              <span key={id} className="an-pill big" title={rem.name}>
                <strong>{rem.abbrev}</strong>{row?.rank ? <span className="an-muted">#{row.rank}</span> : null}
                <button aria-label={`Remove ${rem.abbrev}`} onClick={() => set(list.filter(x => x !== id))}><X size={11} /></button>
              </span>
            )
          })}
        </div>
        <RemedyAdder catalog={catalog} ranked={ranked} exclude={new Set(list)} disabled={list.length >= MAX_COMPARE} placeholder={list.length >= MAX_COMPARE ? `Up to ${MAX_COMPARE} remedies` : 'Add remedy…'} onAdd={id => set([...list, id])} />
      </div>
      {list.length < 2 && <p className="an-muted">Pick at least two remedies to compare.</p>}
      {list.length >= 2 && (
        <>
          <div className="an-seg an-cmp-tabs" role="tablist" aria-label="Comparison">
            {([['symptoms', 'Case symptoms'], ['chapters', 'Case chapters'], ['sphere', 'Sphere of action']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          <div className="an-cmp-scroll">
            {tab === 'symptoms' && (
              <table className="an-cmp">
                <thead>
                  <tr><th scope="col">Symptom</th>{list.map(id => <th key={id} scope="col" className="num" title={catalog.remedy(id).name}>{catalog.remedy(id).abbrev}</th>)}</tr>
                </thead>
                <tbody>
                  {scored.map(({ s, i }) => (
                    <tr key={i}>
                      <td className="an-cmp-label" title={s.label}><span className={`an-weight w${s.symptom.weight}`} title={`Intensity ×${s.symptom.weight}`}>×{s.symptom.weight}</span>{s.symptom.group && <GroupMark letter={s.symptom.group} />}{s.label}</td>
                      {list.map(id => {
                        const g = rowOf.get(id)?.grades[i] ?? s.grades.get(id) ?? 0
                        return <td key={id} className="num">{g ? <><GradeMark g={g} /> <span className={`g${g}`}>{g}</span></> : <span className="an-absent" aria-label="absent">–</span>}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><th scope="row">Covered</th>{list.map(id => <td key={id} className="num">{rowOf.get(id)?.coverage ?? 0}/{scored.length}</td>)}</tr>
                  <tr><th scope="row">Score</th>{list.map(id => { const r = rowOf.get(id); return <td key={id} className="num">{r && result ? formatScore(result.strategy, r) : '–'}</td> })}</tr>
                </tfoot>
              </table>
            )}
            {tab === 'chapters' && (
              <table className="an-cmp">
                <thead>
                  <tr><th scope="col">Chapter (case)</th><th scope="col" className="num">Symptoms</th>{list.map(id => <th key={id} scope="col" className="num">{catalog.remedy(id).abbrev}</th>)}</tr>
                </thead>
                <tbody>
                  {chapters.map(c => (
                    <tr key={c.chapter}>
                      <td>{c.chapter}</td><td className="num">{c.total}</td>
                      {list.map((id, k) => (
                        <td key={id} className="num">
                          <span className="an-cov" style={{ ['--p' as string]: `${(c.covered[k] / c.total) * 100}%` }}>{c.covered[k]}/{c.total}</span>
                          <span className="an-muted"> · {c.degrees[k]}°</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'sphere' && (
              <>
                <label className="an-cmp-rep">Repertory{' '}
                  <select className="select" value={repAbbrev} onChange={e => { setRepChoice(e.target.value); void catalog.loadRepertory(e.target.value).then(() => setRepChoice(e.target.value)) }}>
                    {catalog.repertoryInfos.map(r => <option key={r.abbrev} value={r.abbrev}>{r.title}</option>)}
                  </select>
                </label>
                {!sphere ? <p className="an-muted">Loading repertory…</p> : (
                  <table className="an-cmp">
                    <thead>
                      <tr><th scope="col">Chapter</th>{list.map(id => <th key={id} scope="col" className="num">{catalog.remedy(id).abbrev}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sphere.chapters.map((ch, c) => (
                        <tr key={ch}>
                          <td>{ch}</td>
                          {list.map((id, k) => {
                            const n = sphere.counts[k][c]
                            const max = Math.max(1, ...sphere.counts[k])
                            return <td key={id} className="num"><span className="an-cov" style={{ ['--p' as string]: `${(n / max) * 100}%` }}>{n || '–'}</span></td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><th scope="row">Rubrics</th>{list.map((id, k) => <td key={id} className="num">{sphere.totals[k].toLocaleString()}</td>)}</tr>
                    </tfoot>
                  </table>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Dialog>
  )
}

type FilterTab = 'limit' | 'exclude' | 'highlight'

/** Remedy include/exclude/highlight picker (used when no family filter dialog is registered). */
export function RemedyFilterDialog({ consultationId, onClose }: { consultationId: string; onClose: () => void }) {
  const { consultation, result, catalog } = useAnalysis(consultationId)
  const o = consultation?.analysis
  const [tab, setTab] = useState<FilterTab>('limit')
  const [sets, setSets] = useState<Record<FilterTab, Set<number>>>(() => ({
    limit: new Set(o?.remedyFilter ?? []), exclude: new Set(o?.excludedRemedies ?? []), highlight: new Set(o?.highlight ?? []),
  }))
  const [minCov, setMinCov] = useState(o?.minCoverage ?? 0)
  const [q, setQ] = useState('')
  const [onlyAnalysis, setOnlyAnalysis] = useState(true)
  const ranked = useMemo(() => result?.all ?? [], [result])
  const rankOf = useMemo(() => new Map(ranked.map(r => [r.remedyId, r])), [ranked])
  const items = useMemo(() => {
    const all = searchRemedies(catalog, q, ranked, 5000)
    return onlyAnalysis ? all.filter(r => rankOf.has(r.id)) : all
  }, [catalog, q, ranked, onlyAnalysis, rankOf])

  const ROW = 26
  const scrollRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [h, setH] = useState(300)
  useLayoutEffect(() => { if (scrollRef.current) setH(scrollRef.current.clientHeight) }, [])
  const start = Math.max(0, Math.floor(top / ROW) - 5)
  const end = Math.min(items.length, Math.ceil((top + h) / ROW) + 5)

  if (!consultation || !o) return null
  const cur = sets[tab]
  const toggle = (id: number) => setSets(s => { const n = new Set(s[tab]); if (n.has(id)) n.delete(id); else n.add(id); return { ...s, [tab]: n } })
  const apply = () => {
    const limit = [...sets.limit], ex = [...sets.exclude], hl = [...sets.highlight]
    const same = (a: number[] | null | undefined, b: number[]) => !!a && a.length === b.length && a.every(x => b.includes(x))
    actions.setAnalysis(consultationId, {
      remedyFilter: limit.length ? limit : null,
      filterLabel: limit.length ? (same(o.remedyFilter, limit) && o.filterLabel ? o.filterLabel : `${limit.length} remed${limit.length === 1 ? 'y' : 'ies'}`) : null,
      excludedRemedies: ex,
      highlight: hl.length ? hl : null,
      highlightLabel: hl.length ? (same(o.highlight, hl) && o.highlightLabel ? o.highlightLabel : `${hl.length} highlighted`) : null,
      minCoverage: Math.max(0, minCov | 0),
    })
    onClose()
  }
  const labels: Record<FilterTab, string> = { limit: 'Limit to', exclude: 'Exclude', highlight: 'Highlight' }
  const hints: Record<FilterTab, string> = {
    limit: 'Only the checked remedies stay in the analysis. None checked: no limit.',
    exclude: 'Checked remedies are removed (for example remedies already given).',
    highlight: 'Checked remedies are marked in the result without changing scores.',
  }

  return (
    <Dialog
      title="Filter remedies"
      onClose={onClose}
      width={560}
      initialFocus=".an-filter-search"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => { setSets({ limit: new Set(), exclude: new Set(), highlight: new Set() }); setMinCov(0) }}>Clear all</button>
          <span className="an-spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={apply}>Apply</button>
        </>
      }
    >
      <div className="an-seg an-filter-tabs" role="tablist" aria-label="Filter kind">
        {(Object.keys(labels) as FilterTab[]).map(k => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {labels[k]}{sets[k].size ? <span className="badge">{sets[k].size}</span> : null}
          </button>
        ))}
      </div>
      <p className="an-muted an-filter-hint">{hints[tab]}</p>
      <div className="an-filter-row">
        <input className="input an-filter-search" placeholder="Search remedies" aria-label="Search remedies" value={q} onChange={e => { setQ(e.target.value); setTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0 }} />
        <label className="an-check"><input type="checkbox" checked={onlyAnalysis} onChange={e => setOnlyAnalysis(e.target.checked)} /> In this analysis only</label>
      </div>
      <div className="an-filter-list" ref={scrollRef} onScroll={e => setTop(e.currentTarget.scrollTop)} role="group" aria-label={`${labels[tab]} remedies`}>
        {items.length === 0 && <div className="an-rbox-empty">No remedy matches.</div>}
        <div style={{ height: items.length * ROW, position: 'relative' }}>
          {items.slice(start, end).map((r, k) => {
            const row = rankOf.get(r.id)
            return (
              <label key={r.id} className="an-filter-item" style={{ top: (start + k) * ROW }}>
                <input type="checkbox" checked={cur.has(r.id)} onChange={() => toggle(r.id)} />
                <span className="an-rbox-rank">{row?.rank || ''}</span>
                <strong>{r.abbrev}</strong>
                <span className="an-muted an-ellipsis">{r.name}</span>
                {row && result && <span className="an-filter-score">{formatScore(result.strategy, row)}</span>}
              </label>
            )
          })}
        </div>
      </div>
      <div className="an-filter-row">
        <span className="an-muted">{cur.size} checked</span>
        {cur.size > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setSets(s => ({ ...s, [tab]: new Set() }))}>Uncheck all</button>}
        <span className="an-spacer" />
        <label className="an-check">Minimum symptoms covered <input className="input an-num" type="number" min={0} max={99} value={minCov} onChange={e => setMinCov(Number(e.target.value))} /></label>
      </div>
    </Dialog>
  )
}
