import { BookOpen, Ban, CircleCheck, ExternalLink, GitCompare, Pill, X } from 'lucide-react'
import type { Catalog } from '../../data/catalog'
import { COVERAGE_FIRST, explainTerm, FACTOR_NOTES, formatScore, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow, ResolvedSymptom, RubricSource, TermExplanation } from '../../engine/analysis'
import { GradeMark, GroupMark } from '../../ui/marks'
import { chapterTag, exclusionText, middleEllipsis, splitLabel } from './labels'

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
  onPrescribe: () => void
  manuallyExcluded: boolean
}

const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ''))
/** Points in the narrow column: one decimal below 100, whole numbers above (the title keeps the exact value). */
const pts = (x: number) => (Math.abs(x) >= 100 ? String(Math.round(x)) : num(Math.round(x * 10) / 10))
const FACTOR_NOTE: Record<string, string> = {
  f: 'small-rubric factor (2 when the rubric has 10 remedies or fewer)',
  R: 'remedy-size factor √(1000 / rubrics of the remedy), clamped 0.5–4',
  κ: 'Kent hierarchy (mind 3, general 2, local 1)',
}
/** Characters of a breakdown path before it is shortened in the middle (two lines of the panel). */
const PATH_MAX = 64

/** Symptom label for the breakdown: short chapter tag, the path shortened in the middle, the full text in the title. */
export function TermLabel({ s }: { s: ResolvedSymptom }) {
  const { chapter, path } = splitLabel(s.label)
  return (
    <>
      {s.symptom.group && <GroupMark letter={s.symptom.group} />}
      {chapter && <span className="an-term-ch">{chapterTag(chapter)}</span>}
      {middleEllipsis(path, PATH_MAX)}
    </>
  )
}

/** Full calculation of a term as text, e.g. "2 × 3 × 2 (f) = 12". */
function calcText(t: TermExplanation): string {
  const parts = [`${t.weight} × ${num(t.value)}`, ...t.factors.map(f => `${num(f.value)} (${f.key}: ${f.label})`)]
  const opp = t.opposite ? ` − ${t.opposite.grade} (opposite: ${t.opposite.label})` : ''
  return `intensity × grade value${t.factors.length ? ' × factors' : ''}: ${parts.join(' × ')}${opp} = ${num(Math.round(t.points * 100) / 100)}`
}

/** Drill-down: how a remedy's score is built, term by term, and which symptoms it misses. */
export function RemedyPanel(p: Props) {
  const { result, row, catalog } = p
  const rem = catalog.remedy(row.remedyId)
  const info = strategyInfo(result.strategy)
  const scored = result.symptoms.map((s, i) => ({ s, i })).filter(x => x.s.role === 'scored')
  const covered = scored.filter(x => row.grades[x.i] || row.contributions[x.i])
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
          <button className="btn btn-sm" onClick={p.onPrescribe} title="Prescribe this remedy in the case (new prescription form)"><Pill size={12} /> Prescribe</button>
          <button className="btn btn-sm" onClick={p.onOpenRemedy}><ExternalLink size={12} /> Remedy</button>
          <button className="btn btn-sm" onClick={p.onOpenMM} title="Materia medica"><BookOpen size={12} /> Materia med.</button>
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
          <colgroup><col /><col className="an-terms-g" /><col className="an-terms-ig" /><col className="an-terms-pts" /></colgroup>
          <thead>
            <tr>
              <th scope="col">Symptom</th>
              <th scope="col" className="num"><abbr title="Grade of the remedy in the rubric">G</abbr></th>
              <th scope="col" className="num"><abbr title="Intensity × grade value (strategy factors below the symptom)">I×G</abbr></th>
              <th scope="col" className="num"><abbr title="Points">Pts</abbr></th>
            </tr>
          </thead>
          <tbody>
            {covered.map(({ s, i }, k) => {
              const t = terms[k]
              return (
                <tr key={i} className={p.selectedSymptom === i ? 'selected' : ''} onClick={() => p.onSelectSymptom(p.selectedSymptom === i ? null : i)}>
                  <td className="an-term-label" title={s.label}>
                    <span className="an-term-text"><TermLabel s={s} /></span>
                    {(t.factors.length > 0 || t.opposite) && (
                      <span className="an-term-f">
                        {t.factors.map(f => <span key={f.key} title={f.label}>×{num(f.value)}<sub>{f.key}</sub></span>)}
                        {t.opposite && <span title={`Grade in the opposite rubric ${t.opposite.label}`}>−{t.opposite.grade}<sub>opp</sub></span>}
                      </span>
                    )}
                  </td>
                  <td className="num an-term-g" title={t.baseGrade !== null ? `Generalised: grade ${t.baseGrade || 'absent'} in this rubric, ${t.grade} in ${s.generals.map(r => p.source.label(r)).join(', ')}` : `Grade ${t.grade}`}>
                    <GradeMark g={t.grade} /><span className={`g${t.grade}`}>{t.grade}</span>{t.baseGrade !== null && <sup className="an-gen" aria-label="generalised">G</sup>}
                  </td>
                  <td className="num an-term-calc" title={calcText(t)}>{t.weight}×{num(t.value)}</td>
                  <td className="num an-term-pts" title={num(Math.round(t.points * 10000) / 10000)}>{pts(t.points)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>{coverageFirst ? `Σ w = ${row.weightedCoverage} symptoms, then Σ points` : 'Σ points'}</th>
              <td className="num an-term-pts" title={num(Math.round(row.points * 10000) / 10000)}>{pts(row.points)}</td>
            </tr>
          </tfoot>
        </table>
        {(factorKeys.size > 0 || generalised) && (
          <p className="an-legend-note">
            {[...factorKeys].map(k => <span key={k}><sub>{k}</sub> {FACTOR_NOTE[k] ?? FACTOR_NOTES[k]}</span>)}
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
                    {s.eliminative && <span className="an-flag f-e">E</span>}<span className="an-ellipsis"><TermLabel s={s} /></span>
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
                <li key={i} className="an-muted an-other" title={s.label}><GradeMark g={row.grades[i]} /><span className="an-ellipsis">{s.role === 'excluding' ? 'Excluding: ' : 'Ignored: '}<TermLabel s={s} /></span></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}
