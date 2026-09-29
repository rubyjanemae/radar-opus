import { BookOpen, Ban, CircleCheck, ExternalLink, GitCompare, X } from 'lucide-react'
import type { Catalog } from '../../data/catalog'
import { COVERAGE_FIRST, explainTerm, formatScore, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow, RubricSource } from '../../engine/analysis'
import { GradeMark } from './AnalysisGrid'
import { exclusionText } from './export'

interface Props {
  result: AnalysisResult
  row: AnalysisRow
  source: RubricSource
  catalog: Catalog
  selectedSymptom: number | null
  onSelectSymptom: (i: number | null) => void
  onClose: () => void
  onOpenRemedy: () => void
  onOpenMM: () => void
  onToggleExclude: () => void
  onCompare: () => void
  manuallyExcluded: boolean
}

const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ''))
const FACTOR_NOTE: Record<string, string> = {
  f: 'small-rubric factor (2 when the rubric has 10 remedies or fewer)',
  R: 'remedy-size factor √(1000 / rubrics of the remedy), clamped 0.5–4',
  κ: 'Kent hierarchy (mind 3, general 2, local 1)',
}

/** Drill-down: how a remedy's score is built, term by term, and which symptoms it misses. */
export function RemedyPanel(p: Props) {
  const { result, row, catalog } = p
  const rem = catalog.remedy(row.remedyId)
  const info = strategyInfo(result.strategy)
  const scored = result.symptoms.map((s, i) => ({ s, i })).filter(x => x.s.role === 'scored')
  const covered = scored.filter(x => row.grades[x.i])
  const missing = scored.filter(x => !row.grades[x.i])
  const other = result.symptoms.map((s, i) => ({ s, i })).filter(x => x.s.role !== 'scored' && row.grades[x.i])
  const terms = covered.map(({ i }) => explainTerm(result, p.source, row, i))
  const factorKeys = new Set(terms.flatMap(t => t.factors.map(f => f.key)))
  const coverageFirst = COVERAGE_FIRST.has(result.strategy)
  const generalised = terms.some(t => t.baseGrade !== null)

  return (
    <aside className="an-panel" aria-label={`Score of ${rem.name}`} data-testid="remedy-panel" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); p.onClose() } }}>
      <header className="an-panel-head">
        <div className="an-panel-title">
          <span className="an-panel-rank">{row.rank ? `#${row.rank}` : 'excluded'}</span>
          <h3>{rem.abbrev}</h3>
          <button className="icon-btn" aria-label="Close details" title="Close (Esc)" onClick={p.onClose}><X size={14} /></button>
        </div>
        <div className="an-panel-name">{rem.name}{rem.altName ? <span className="an-panel-alt"> · {rem.altName.replace(/[{}"]/g, '').split(',')[0]}</span> : null}</div>
        {row.excluded && <div className="an-panel-excl" title={exclusionText(result, row)}><Ban size={12} /><span className="an-ellipsis">Excluded: {exclusionText(result, row)}</span></div>}
        <div className="an-panel-stats">
          <div><span className="an-stat-v">{formatScore(result.strategy, row)}</span><span className="an-stat-k">score</span></div>
          <div><span className="an-stat-v">{row.coverage}/{scored.length}</span><span className="an-stat-k">symptoms</span></div>
          <div><span className="an-stat-v">{row.degrees}</span><span className="an-stat-k">degrees</span></div>
        </div>
        <div className="an-panel-actions">
          <button className="btn btn-sm" onClick={p.onOpenRemedy}><ExternalLink size={12} /> Remedy</button>
          <button className="btn btn-sm" onClick={p.onOpenMM}><BookOpen size={12} /> Materia medica</button>
          <button className="btn btn-sm" onClick={p.onCompare}><GitCompare size={12} /> Compare</button>
          <button className="btn btn-sm" onClick={p.onToggleExclude}>{p.manuallyExcluded ? <><CircleCheck size={12} /> Include</> : <><Ban size={12} /> Exclude</>}</button>
        </div>
      </header>
      <div className="an-panel-body">
        <div className="an-formula" title={info.description}>
          <strong>{info.name}</strong>
          <code>{info.formula}</code>
          {!result.useIntensity && <span className="an-note">Intensity off: every symptom counts ×1.</span>}
        </div>
        <table className="an-terms">
          <caption className="sr-only">Score terms</caption>
          <thead>
            <tr><th scope="col">Symptom</th><th scope="col" className="num">g</th><th scope="col">i × g × factors</th><th scope="col" className="num">pts</th></tr>
          </thead>
          <tbody>
            {covered.map(({ s, i }, k) => {
              const t = terms[k]
              return (
                <tr key={i} className={p.selectedSymptom === i ? 'selected' : ''} onClick={() => p.onSelectSymptom(p.selectedSymptom === i ? null : i)}>
                  <td className="an-term-label" title={s.label}><span>{s.label}</span></td>
                  <td className="num" title={t.baseGrade !== null ? `Generalised: grade ${t.baseGrade || 'absent'} in this rubric, ${t.grade} in ${s.generals.map(r => p.source.label(r)).join(', ')}` : undefined}>
                    <span className={`g${t.grade}`}>{t.grade}</span>{t.baseGrade !== null && <sup className="an-gen" aria-label="generalised">G</sup>} <GradeMark g={t.grade} />
                  </td>
                  <td className="an-term-calc">
                    {t.weight}×{num(t.value)}
                    {t.factors.map(f => <span key={f.key} title={f.label}>×{num(f.value)}<sub>{f.key}</sub></span>)}
                  </td>
                  <td className="num an-term-pts">{num(Math.round(t.points * 100) / 100)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>{coverageFirst ? `Σ w = ${row.weightedCoverage} symptoms, then Σ points` : 'Σ points'}</th>
              <td className="num an-term-pts">{num(Math.round(row.points * 100) / 100)}</td>
            </tr>
          </tfoot>
        </table>
        {(factorKeys.size > 0 || generalised) && (
          <p className="an-legend-note">
            {[...factorKeys].map(k => <span key={k}><sub>{k}</sub> {FACTOR_NOTE[k]}</span>)}
            {generalised && <span><sup>G</sup> grade raised from the linked Generalities rubric</span>}
          </p>
        )}
        <section className="an-missing" aria-label="Missing symptoms">
          <h4>Missing <span className="badge">{missing.length}</span></h4>
          {missing.length === 0 ? <p className="an-muted">Covers every scored symptom.</p> : (
            <ul>
              {missing.map(({ s, i }) => (
                <li key={i}>
                  <button className={`an-link${p.selectedSymptom === i ? ' on' : ''}`} onClick={() => p.onSelectSymptom(p.selectedSymptom === i ? null : i)} title={s.label}>
                    {s.symptom.eliminatory && <span className="an-flag f-e">E</span>}<span className="an-ellipsis">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {other.length > 0 && (
          <section className="an-missing" aria-label="Not scored">
            <h4>Present in unscored symptoms</h4>
            <ul>
              {other.map(({ s, i }) => (
                <li key={i} className="an-muted an-other" title={s.label}><GradeMark g={row.grades[i]} /><span className="an-ellipsis">{s.role === 'excluding' ? 'Excluding: ' : 'Ignored: '}{s.label}</span></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}
