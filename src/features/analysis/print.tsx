import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { formatScore, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import { GradeMark } from './AnalysisGrid'
import { symptomFlags } from './export'
import type { ExportMeta } from './export'
import './analysis.css'

/** Remedy columns per printed table (landscape A4 fits about 30). */
const PER_PAGE = 30

function PrintableAnalysis({ result, rows, meta }: { result: AnalysisResult; rows: AnalysisRow[]; meta: ExportMeta }) {
  const chunks: AnalysisRow[][] = []
  for (let k = 0; k < rows.length; k += PER_PAGE) chunks.push(rows.slice(k, k + PER_PAGE))
  const info = strategyInfo(result.strategy)
  return (
    <div className="an-print">
      <header>
        <h1>{meta.title}</h1>
        <p>{info.name} ({info.formula}){result.useIntensity ? '' : ' · intensity off'} · {result.total} remedies · {result.scoredCount} scored symptoms · printed {new Date().toLocaleString()}</p>
      </header>
      {chunks.map((chunk, n) => (
        <table key={n} className="an-print-table">
          <thead>
            <tr>
              <th className="an-print-sym">Symptom{chunks.length > 1 ? ` (remedies ${n * PER_PAGE + 1}–${n * PER_PAGE + chunk.length})` : ''}</th>
              {chunk.map(r => (
                <th key={r.remedyId} className={r.excluded ? 'excl' : ''}>
                  <div className="an-print-rank">{r.rank || '–'}</div>
                  <div className="an-print-abbrev">{meta.remedyAbbrev(r.remedyId)}</div>
                  <div className="an-print-score">{formatScore(result.strategy, r)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.symptoms.map((s, i) => (
              <tr key={i} className={s.role !== 'scored' ? 'off' : ''}>
                <td className="an-print-sym">
                  <span className="an-print-w">{s.symptom.weight === 0 ? '0' : `×${s.symptom.weight}`}</span>
                  {symptomFlags(s).replace(/^0 ?/, '') && <span className="an-print-f">{symptomFlags(s).replace(/^0 ?/, '')}</span>}
                  {s.label}
                </td>
                {chunk.map(r => <td key={r.remedyId}>{r.grades[i] ? <><GradeMark g={r.grades[i]} /><span className={`g${r.grades[i]}`}>{r.grades[i]}</span></> : ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}

/** Render a print-only copy of the full grid, open the print dialog, then clean up. */
export function printResult({ result, rows, meta }: { result: AnalysisResult; rows: AnalysisRow[]; meta: ExportMeta }) {
  document.querySelector('.an-print-root')?.remove()
  const host = document.createElement('div')
  host.className = 'an-print-root'
  document.body.appendChild(host)
  // hide the app only while this print runs, so a browser-menu print still prints the page
  document.body.classList.add('an-printing')
  const root = createRoot(host)
  flushSync(() => root.render(<PrintableAnalysis result={result} rows={rows} meta={meta} />))
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    window.removeEventListener('afterprint', cleanup)
    document.body.classList.remove('an-printing')
    setTimeout(() => { root.unmount(); host.remove() }, 0)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // window.print() blocks in most browsers; if it did not, afterprint cleans up later.
  setTimeout(() => { if (!matchMedia('print').matches) cleanup() }, 1000)
}
