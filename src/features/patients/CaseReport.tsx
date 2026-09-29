import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import { formatScore, strategyInfo } from '../../engine/analysis'
import type { AnalysisResult } from '../../engine/analysis'
import { useApp } from '../../state/store'
import type { Consultation, Patient } from '../../state/patients'
import { useAnalysis } from '../analysis/useAnalysis'
import { consultationsOf, formatAge, formatDate, formatScoreSigned, ghhosLabel, KIND_LABEL, patientName, SEX_LABEL, symptomCount } from './logic'
import './patients.css'

/** Paper styles, shared by the on-screen preview and the print frame (fixed ink-on-paper colours on purpose). */
export const REPORT_CSS = `
.pt-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; color: #111; font: 10pt/1.45 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.pt-report h1 { font-size: 16pt; margin: 0; letter-spacing: -.01em; }
.pt-report h2 { font-size: 10.5pt; margin: 16pt 0 5pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #222; text-transform: uppercase; letter-spacing: .06em; }
.pt-report h3 { font-size: 9.5pt; margin: 10pt 0 4pt; color: #333; }
.pt-report .pt-rp-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16pt; padding-bottom: 8pt; border-bottom: 3pt solid #111; }
.pt-report .pt-rp-meta { color: #555; font-size: 8.5pt; text-align: right; }
.pt-report .pt-rp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4pt 16pt; margin-top: 8pt; }
.pt-report .pt-rp-grid div { display: grid; }
.pt-report .pt-rp-k { color: #666; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; }
.pt-report .pt-rp-text { white-space: pre-wrap; margin: 0 0 6pt; }
.pt-report table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.pt-report th { text-align: left; font-weight: 600; font-size: 7.5pt; color: #555; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1pt solid #999; padding: 3pt 5pt; }
.pt-report td { border-bottom: .5pt solid #ddd; padding: 3pt 5pt; vertical-align: top; }
.pt-report tr { break-inside: avoid; }
.pt-report h2, .pt-report h3 { break-after: avoid; }
.pt-report .pt-rp-keep { break-inside: avoid; }
.pt-report table.pt-rp-top { display: table; }
.pt-report table.pt-rp-top thead { display: table-header-group; }
.pt-report table.pt-rp-top tbody { display: table-row-group; }
.pt-report table.pt-rp-top tr { display: table-row; }
.pt-report table.pt-rp-top th, .pt-report table.pt-rp-top td { display: table-cell; }
.pt-report .pt-rp-resp { margin: 0 0 6pt; }
.pt-report .pt-rp-score { display: inline-block; min-width: 18pt; padding: 0 4pt; margin-right: 4pt; border: .75pt solid #333; border-radius: 3pt; font-weight: 700; text-align: center; }
.pt-report .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pt-report .pt-rp-w { font-weight: 700; white-space: nowrap; }
.pt-report .pt-rp-flags { font-size: 7.5pt; color: #444; white-space: nowrap; }
.pt-report .pt-rp-rep { color: #777; font-size: 7.5pt; }
.pt-report .pt-rp-path b { font-weight: 700; }
.pt-report .pt-rp-top td:first-child { font-weight: 700; }
.pt-report .pt-rp-abbrev { font-weight: 700; }
.pt-report .pt-rp-bar { display: inline-block; height: 0; border-top: 5pt solid #333; vertical-align: middle; margin-right: 4pt; }
.pt-report .pt-rp-muted { color: #777; }
.pt-report .pt-rp-foot { margin-top: 18pt; padding-top: 5pt; border-top: .5pt solid #bbb; font-size: 7.5pt; color: #777; display: flex; justify-content: space-between; }
.pt-report .pt-rp-grid .pt-rp-tags > div { display: block; }
.pt-report .pt-rp-tags > div > span { display: inline-block; border: .5pt solid #888; border-radius: 6pt; padding: 0 5pt; margin-right: 3pt; font-size: 7.5pt; }
@page { size: A4; margin: 14mm 14mm 16mm; }
`

export interface ReportSymptom { clipboard: string; weight: number; flags: string; chapter: string; path: string; repertory: string; size: number | null }

export function reportSymptoms(c: Consultation, catalog: Catalog): ReportSymptom[] {
  const out: ReportSymptom[] = []
  for (const cb of c.clipboards) {
    for (const s of cb.symptoms) {
      const parts = s.rubrics.map(ref => {
        const r = catalog.resolve(ref)
        if (!r) return { chapter: '', path: ref, repertory: ref.slice(0, ref.lastIndexOf(':')), size: null as number | null }
        const [root, ...below] = r.rep.lineage(r.index)
        return { chapter: r.rep.text(root), path: below.map(i => r.rep.text(i)).join(', '), repertory: r.rep.info.title, size: r.rep.remedyCount(r.index) }
      })
      const flags = [s.eliminatory && 'eliminative', s.exclusive && 'excluding', s.causal && 'causal', s.group && `group ${s.group.toUpperCase()}`, s.rubrics.length > 1 && (s.combine === 'intersection' ? 'combined (and)' : 'combined (or)')].filter(Boolean).join(', ')
      out.push({
        clipboard: cb.name, weight: s.weight, flags,
        chapter: parts[0]?.chapter ?? '', path: parts.map((p, i) => (i ? `${p.chapter}, ` : '') + p.path).join(' + '),
        repertory: parts[0]?.repertory ?? '', size: parts.length === 1 ? parts[0].size : null,
      })
    }
  }
  return out
}

/** The printable document. Pure markup (no hooks), so the same DOM can be copied into the print frame. */
export function CaseReportDoc({ patient, consultation, history, symptoms, result, catalog, printedAt }: {
  patient: Patient; consultation: Consultation; history: Consultation[]; symptoms: ReportSymptom[]; result: AnalysisResult | null; catalog: Catalog; printedAt: Date
}) {
  const top = result?.rows.filter(r => !r.excluded).slice(0, 10) ?? []
  const max = top[0]?.points || 1
  const earlier = history.filter(c => c.id !== consultation.id && c.date <= consultation.date).flatMap(c => c.prescriptions.map(p => ({ c, p })))
  const age = formatAge(patient.birthDate)
  const clipNames = new Set(symptoms.map(s => s.clipboard))
  const repNames = new Set(symptoms.map(s => s.repertory))
  return (
    <article className="pt-report">
      <header className="pt-rp-head">
        <div>
          <div className="pt-rp-k">Case report</div>
          <h1>{patientName(patient)}</h1>
        </div>
        <div className="pt-rp-meta">{consultation.title || 'Consultation'}{(consultation.title || '').toLowerCase().includes(KIND_LABEL[consultation.kind].toLowerCase()) ? '' : ` · ${KIND_LABEL[consultation.kind]}`}<br />{formatDate(consultation.date)}</div>
      </header>
      <section className="pt-rp-grid">
        <div><span className="pt-rp-k">Born</span>{patient.birthDate ? `${formatDate(patient.birthDate)}${age ? ` (${age}${/mo/.test(age) ? '' : ' y'})` : ''}` : '—'}</div>
        <div><span className="pt-rp-k">Sex</span>{patient.sex ? SEX_LABEL[patient.sex] : '—'}</div>
        <div><span className="pt-rp-k">Occupation</span>{patient.occupation || '—'}</div>
        <div><span className="pt-rp-k">Phone</span>{patient.phone || '—'}</div>
        <div><span className="pt-rp-k">Email</span>{patient.email || '—'}</div>
        <div><span className="pt-rp-k">Address</span>{patient.address || '—'}</div>
        {patient.tags.length > 0 && <div className="pt-rp-tags" style={{ gridColumn: '1 / -1' }}><span className="pt-rp-k">Tags</span><div>{patient.tags.map(t => <span key={t}>{t}</span>)}</div></div>}
      </section>

      <h2>Consultation</h2>
      {consultation.complaint && <><h3>Chief complaint</h3><p className="pt-rp-text">{consultation.complaint}</p></>}
      {consultation.notes && <><h3>Case notes</h3><p className="pt-rp-text">{consultation.notes}</p></>}
      {consultation.assessment && <><h3>Assessment</h3><p className="pt-rp-text">{consultation.assessment}</p></>}
      {consultation.response && (consultation.response.score != null || consultation.response.note) && (
        <>
          <h3>Response to previous prescription</h3>
          <p className="pt-rp-resp">
            {consultation.response.score != null && <><span className="pt-rp-score">{formatScoreSigned(consultation.response.score)}</span>{ghhosLabel(consultation.response.score)} (GHHOS){consultation.response.note ? '. ' : ''}</>}
            {consultation.response.note}
          </p>
        </>
      )}
      {!consultation.complaint && !consultation.notes && !consultation.assessment && <p className="pt-rp-muted">No notes recorded.</p>}

      <h2>Symptoms ({symptoms.length}){repNames.size === 1 && <span className="pt-rp-rep" style={{ float: 'right', textTransform: 'none', letterSpacing: 0 }}>{[...repNames][0]}</span>}</h2>
      {symptoms.length ? (
        <table>
          <thead><tr><th>#</th>{clipNames.size > 1 && <th>Clipboard</th>}<th>Int.</th><th>Rubric</th><th className="num">Remedies</th></tr></thead>
          <tbody>
            {symptoms.map((s, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                {clipNames.size > 1 && <td>{s.clipboard}</td>}
                <td className="pt-rp-w">{s.weight === 0 ? 'ignored' : `×${s.weight}`}</td>
                <td className="pt-rp-path"><b>{s.chapter.toUpperCase()}</b>{s.path ? ` - ${s.path}` : ''}{s.flags && <div className="pt-rp-flags">{s.flags}</div>}{repNames.size > 1 && <div className="pt-rp-rep">{s.repertory}</div>}</td>
                <td className="num">{s.size ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="pt-rp-muted">No symptoms on the clipboards of this consultation.</p>}

      <section className="pt-rp-keep">
      <h2>Analysis: top {top.length || 10} remedies</h2>
      {result && top.length ? (
        <>
          <p className="pt-rp-muted" style={{ margin: '0 0 4pt' }}>{strategyInfo(result.strategy).name} · {result.scoredCount} scored symptoms · {result.total} remedies ranked{result.useIntensity ? '' : ' · intensity off'}</p>
          <table className="pt-rp-top">
            <thead><tr><th className="num">Rank</th><th>Remedy</th><th className="num">Score</th><th className="num">Coverage</th><th className="num">Degrees</th><th style={{ width: '28%' }} /></tr></thead>
            <tbody>
              {top.map(r => (
                <tr key={r.remedyId}>
                  <td className="num">{r.rank}</td>
                  <td><span className="pt-rp-abbrev">{catalog.remedy(r.remedyId).abbrev}</span> <span className="pt-rp-muted">{catalog.remedy(r.remedyId).name}</span></td>
                  <td className="num">{formatScore(result.strategy, r)}</td>
                  <td className="num">{r.coverage}/{result.scoredCount}</td>
                  <td className="num">{r.degrees}</td>
                  <td><span className="pt-rp-bar" style={{ width: `${Math.max(2, (r.points / max) * 100)}%` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : <p className="pt-rp-muted">{result ? 'No remedies: add symptoms to analyse this case.' : 'Analysis unavailable.'}</p>}
      </section>

      <h2>Prescriptions</h2>
      {consultation.prescriptions.length ? <RxTable rows={consultation.prescriptions.map(p => ({ p }))} catalog={catalog} /> : <p className="pt-rp-muted">No prescription at this consultation.</p>}
      {earlier.length > 0 && <><h3>Earlier prescriptions</h3><RxTable rows={earlier} catalog={catalog} /></>}

      <footer className="pt-rp-foot"><span>{symptomCount(consultation)} symptoms · {history.length} consultation{history.length === 1 ? '' : 's'} on file</span><span>Printed {printedAt.toLocaleString()} · Radar Opus</span></footer>
    </article>
  )
}

function RxTable({ rows, catalog }: { rows: { p: Consultation['prescriptions'][number]; c?: Consultation }[]; catalog: Catalog }) {
  return (
    <table>
      <thead><tr><th>Date</th><th>Remedy</th><th>Potency</th><th>Dosage</th><th>Note</th></tr></thead>
      <tbody>
        {rows.map(({ p }) => (
          <tr key={p.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.date)}</td>
            <td><span className="pt-rp-abbrev">{catalog.remedy(p.remedyId).abbrev}</span> <span className="pt-rp-muted">{catalog.remedy(p.remedyId).name}</span></td>
            <td className="pt-rp-w">{p.potency}</td>
            <td>{p.dosage}</td>
            <td>{p.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Print an element's markup in an isolated frame (keeps app print styles out of the way). */
export function printElement(el: HTMLElement, title: string) {
  document.querySelector('iframe.pt-print-frame')?.remove()
  const frame = document.createElement('iframe')
  frame.className = 'pt-print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>html,body{margin:0;background:#fff}${REPORT_CSS}</style></head><body>${el.outerHTML}</body></html>`
  frame.onload = () => {
    const w = frame.contentWindow
    if (!w) return
    w.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 0))
    w.focus()
    w.print()
  }
  document.body.appendChild(frame)
}

export function CaseReportDialog({ onClose, consultationId }: { onClose: () => void; consultationId: string }) {
  const catalog = useCatalog()
  const consultation = useApp(s => s.consultations[consultationId] ?? null)
  const patient = useApp(s => (consultation ? s.patients[consultation.patientId] ?? null : null))
  const all = useApp(s => s.consultations)
  const { result, load } = useAnalysis(consultationId)
  const paper = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    scroller.current?.focus()
    return () => prev?.focus?.()
  }, [])
  useEffect(() => { if (!consultation || !patient) onClose() }, [consultation, patient, onClose])
  if (!consultation || !patient) return null
  const history = consultationsOf(all, patient.id)
  const symptoms = reportSymptoms(consultation, catalog)
  const title = `Case report: ${patientName(patient)}, ${consultation.date}`
  const doPrint = () => { const el = paper.current?.querySelector<HTMLElement>('.pt-report'); if (el) printElement(el, title) }
  return createPortal(
    <div
      className="pt-report-overlay" role="dialog" aria-modal="true" aria-label="Case report"
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); e.stopPropagation(); doPrint() }
        if (e.key === 'Tab') {
          // keep focus inside the report: the scrollable paper, Print and Close
          const f = [scroller.current, ...e.currentTarget.querySelectorAll<HTMLElement>('.pt-report-bar button:not([disabled])')].filter((x): x is HTMLElement => !!x)
          const i = f.indexOf(document.activeElement as HTMLElement)
          e.preventDefault()
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus()
          return
        }
        // reading keys scroll the paper wherever focus is in the report
        const sc = scroller.current
        if (sc && e.target !== sc && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const line = 40, page = sc.clientHeight * 0.9
          const by: Record<string, number> = { ArrowDown: line, ArrowUp: -line, PageDown: page, PageUp: -page }
          if (e.key in by) { e.preventDefault(); sc.scrollBy({ top: by[e.key] }) }
          else if (e.key === 'Home') { e.preventDefault(); sc.scrollTop = 0 }
          else if (e.key === 'End') { e.preventDefault(); sc.scrollTop = sc.scrollHeight }
        }
      }}
    >
      <style>{REPORT_CSS}</style>
      <div className="pt-report-bar">
        <strong>Case report</strong>
        <span className="pt-report-sub">{patientName(patient)} · {consultation.title || 'Consultation'} · {formatDate(consultation.date)}</span>
        <span className="grow" />
        {load.status === 'loading' && <span className="pt-report-sub">Loading repertories…</span>}
        <button className="btn btn-primary" title="Print (Ctrl+P)" onClick={doPrint} disabled={load.status === 'loading'}><Printer size={14} />Print…</button>
        <button className="icon-btn" aria-label="Close report" title="Close (Esc)" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="pt-report-scroll" ref={scroller} tabIndex={0} role="region" aria-label="Report preview (arrow keys, Page Up/Down, Home and End scroll)">
        <div className="pt-report-paper" ref={paper}>
          <CaseReportDoc patient={patient} consultation={consultation} history={history} symptoms={symptoms} result={result} catalog={catalog} printedAt={new Date()} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
