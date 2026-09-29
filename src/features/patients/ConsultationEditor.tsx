import { useRef, useState } from 'react'
import { BarChart3, CheckCircle2, CopyPlus, FileText, Pill, Plus, Target, Trash2, X } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { formatScore } from '../../engine/analysis'
import { actions, useApp } from '../../state/store'
import type { Consultation } from '../../state/patients'
import { useAnalysis } from '../analysis/useAnalysis'
import { sourceFor } from '../analysis/source'
import { formatDate, KIND_LABEL, symptomCount } from './logic'
import { RemedyInput } from './RemedyInput'
import { useDraft } from './useDraft'
import * as ops from './ops'

export const POTENCIES = ['6C', '12C', '30C', '200C', '1M', '10M', '50M', 'CM', 'LM1', 'LM2', 'LM3', 'LM4', 'LM5', 'LM6', '6X', '12X', 'Q']

function TextField({ value, onCommit, label, className, multiline, rows, placeholder }: {
  value: string; onCommit: (v: string) => void; label: string; className?: string; multiline?: boolean; rows?: number; placeholder?: string
}) {
  const { draft, setDraft, flush } = useDraft(value, onCommit)
  return (
    <label className={`field pt-field ${className ?? ''}`}>
      <span>{label}</span>
      {multiline
        ? <textarea className="textarea" rows={rows ?? 4} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={flush} />
        : <input className={`input ${className ? `${className}-input` : ''}`} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={flush} onKeyDown={e => { if (e.key === 'Enter') flush() }} />}
    </label>
  )
}

export function ConsultationEditor({ consultation: c }: { consultation: Consultation }) {
  const catalog = useCatalog()
  const isActive = useApp(s => s.activeConsultationId === c.id)
  const update = (patch: Partial<Consultation>) => actions.updateConsultation(c.id, patch)
  const n = symptomCount(c)

  return (
    <div className="pt-editor" data-testid="consultation-editor">
      <div className="pt-ed-actions">
        <button className={`btn${isActive ? ' pt-is-active' : ''}`} onClick={() => ops.makeActive(c.id)} disabled={isActive} title="Clipboards and analysis work on the active case">
          {isActive ? <><CheckCircle2 size={14} />Active case</> : <><Target size={14} />Make active case</>}
        </button>
        <button className="btn" onClick={() => actions.openTab({ kind: 'analysis', consultationId: c.id })} title="Open the analysis of this consultation (F8 for the active case)"><BarChart3 size={14} />Open analysis</button>
        <button className="btn" onClick={() => ops.newFollowUp(c.id)} title="New consultation with a copy of these clipboards"><CopyPlus size={14} />New follow-up</button>
        <button className="btn" onClick={() => ops.openReport(c.id)}><FileText size={14} />Case report</button>
        <span className="grow" />
        <button className="btn btn-ghost btn-danger" onClick={() => ops.confirmDeleteConsultation(c.id)}><Trash2 size={14} />Delete</button>
      </div>

      <div className="pt-ed-scroll">
        <div className="pt-ed-row">
          <TextField key={`t${c.id}`} label="Title" className="pt-ed-title" value={c.title} onCommit={v => update({ title: v })} placeholder="Consultation title" />
          <label className="field pt-field pt-ed-date">
            <span>Date</span>
            <input type="date" className="input" value={c.date} onChange={e => { if (e.target.value) update({ date: e.target.value }) }} />
          </label>
          <label className="field pt-field pt-ed-kind">
            <span>Kind</span>
            <select className="select" value={c.kind} onChange={e => update({ kind: e.target.value as Consultation['kind'] })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        <TextField key={`c${c.id}`} label="Chief complaint" value={c.complaint} onCommit={v => update({ complaint: v })} placeholder="Main complaint in the patient's words" />
        <TextField key={`n${c.id}`} label="Case notes" className="pt-ed-notes" multiline rows={12} value={c.notes} onCommit={v => update({ notes: v })} placeholder="History, modalities, mentals, generals, particulars, observations…" />
        <TextField key={`a${c.id}`} label="Assessment" multiline rows={3} value={c.assessment} onCommit={v => update({ assessment: v })} placeholder="Analysis of the case, differential, plan" />

        <Prescriptions consultation={c} />

        <div className="pt-cards">
          <section className="pt-card">
            <header className="pt-card-head">Symptoms <span className="badge">{n}</span></header>
            <SymptomList consultation={c} />
          </section>
          <section className="pt-card">
            <header className="pt-card-head">Top remedies</header>
            <TopRemedies consultationId={c.id} />
          </section>
        </div>
        <div className="pt-ed-foot">Created {new Date(c.createdAt).toLocaleString()} · saved {new Date(c.updatedAt).toLocaleString()} · {catalog.repertoryInfos.length} repertories installed</div>
      </div>
    </div>
  )
}

function SymptomList({ consultation: c }: { consultation: Consultation }) {
  const catalog = useCatalog()
  const src = sourceFor(catalog)
  const [expanded, setExpanded] = useState(false)
  const all = c.clipboards.flatMap(cb => cb.symptoms.map(s => ({ cb, s })))
  if (!all.length) {
    return (
      <div className="pt-card-empty">
        No symptoms yet. {c.id === useApp.getState().activeConsultationId ? 'Take rubrics from the repertory (F6) onto the clipboard.' : 'Make this the active case, then take rubrics from the repertory.'}
      </div>
    )
  }
  const shown = expanded ? all : all.slice(0, 8)
  return (
    <>
      <ul className="pt-sym-list">
        {shown.map(({ cb, s }) => (
          <li key={s.id} title={cb.name}>
            <span className="pt-sym-dot" style={{ background: cb.color }} aria-hidden />
            <span className={`pt-sym-w${s.weight === 0 ? ' off' : ''}`}>{s.weight === 0 ? '0' : `×${s.weight}`}</span>
            <span className="pt-sym-label">{s.rubrics.map(r => src.label(r)).join(' + ')}</span>
            {(s.eliminatory || s.exclusive || s.causal || s.group) && (
              <span className="pt-sym-flags">{[s.eliminatory && 'E', s.exclusive && 'X', s.causal && 'C', s.group?.toUpperCase()].filter(Boolean).join(' ')}</span>
            )}
          </li>
        ))}
      </ul>
      {all.length > 8 && <button className="btn btn-ghost btn-sm pt-more" onClick={() => setExpanded(x => !x)}>{expanded ? 'Show fewer' : `Show all ${all.length}`}</button>}
    </>
  )
}

function TopRemedies({ consultationId }: { consultationId: string }) {
  const { result, load, catalog } = useAnalysis(consultationId)
  if (load.status === 'loading') return <div className="pt-card-empty"><span className="skeleton" style={{ display: 'block', height: 60 }} /></div>
  if (load.status === 'error') return <div className="pt-card-empty">Could not load {load.failed.join(', ')}. <button className="btn btn-sm" onClick={load.retry}>Retry</button></div>
  const top = result?.rows.filter(r => !r.excluded).slice(0, 5) ?? []
  if (!result || !top.length) return <div className="pt-card-empty">No analysis yet: add symptoms to see the leading remedies.</div>
  const max = top[0].points || 1
  return (
    <ol className="pt-top">
      {top.map(r => (
        <li key={r.remedyId}>
          <span className="pt-top-rank">{r.rank}</span>
          <span className="pt-top-abbrev" title={catalog.remedy(r.remedyId).name}>{catalog.remedy(r.remedyId).abbrev}</span>
          <span className="pt-top-bar"><span style={{ width: `${Math.max(3, (r.points / max) * 100)}%` }} /></span>
          <span className="pt-top-score">{formatScore(result.strategy, r)}</span>
        </li>
      ))}
    </ol>
  )
}

function Prescriptions({ consultation: c }: { consultation: Consultation }) {
  const catalog = useCatalog()
  const [remedy, setRemedy] = useState<number | null>(null)
  const [potency, setPotency] = useState('30C')
  const [dosage, setDosage] = useState('')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const remedyRef = useRef<HTMLInputElement>(null)
  const canAdd = remedy !== null && potency.trim() !== ''
  const add = () => {
    if (!canAdd) { if (remedy === null) remedyRef.current?.focus(); return }
    actions.addPrescription(c.id, { remedyId: remedy!, potency: potency.trim(), dosage: dosage.trim(), date: date || c.date, note: note.trim() })
    setRemedy(null); setDosage(''); setNote(''); setDate('')
    remedyRef.current?.focus()
  }
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); add() } }
  return (
    <section className="pt-rx" aria-label="Prescriptions">
      <header className="pt-rx-head"><Pill size={14} aria-hidden />Prescriptions <span className="badge">{c.prescriptions.length}</span></header>
      <table className="pt-rx-table">
        <thead><tr><th>Remedy</th><th>Potency</th><th>Dosage</th><th>Date</th><th>Note</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {c.prescriptions.map(p => (
            <tr key={p.id}>
              <td><b>{catalog.remedy(p.remedyId).abbrev}</b> <span className="pt-dim">{catalog.remedy(p.remedyId).name}</span></td>
              <td className="pt-rx-pot">{p.potency}</td>
              <td>{p.dosage}</td>
              <td className="pt-nowrap">{formatDate(p.date)}</td>
              <td>{p.note}</td>
              <td><button className="icon-btn" aria-label={`Remove ${catalog.remedy(p.remedyId).abbrev} ${p.potency}`} title="Remove prescription" onClick={() => actions.removePrescription(c.id, p.id)}><X size={13} /></button></td>
            </tr>
          ))}
          <tr className="pt-rx-add">
            <td><RemedyInput ref={remedyRef} value={remedy} onChange={setRemedy} onEnter={add} /></td>
            <td>
              <input className="input pt-rx-pot-input" aria-label="Potency" list="pt-potencies" value={potency} onChange={e => setPotency(e.target.value)} onKeyDown={onEnter} />
              <datalist id="pt-potencies">{POTENCIES.map(p => <option key={p} value={p} />)}</datalist>
            </td>
            <td><input className="input" aria-label="Dosage" placeholder="e.g. single dose" value={dosage} onChange={e => setDosage(e.target.value)} onKeyDown={onEnter} /></td>
            <td><input className="input" type="date" aria-label="Prescription date" value={date || c.date} onChange={e => setDate(e.target.value)} onKeyDown={onEnter} /></td>
            <td><input className="input" aria-label="Prescription note" placeholder="Note" value={note} onChange={e => setNote(e.target.value)} onKeyDown={onEnter} /></td>
            <td><button className="icon-btn pt-rx-add-btn" aria-label="Add prescription" title="Add prescription (Enter)" disabled={!canAdd} onClick={add}><Plus size={14} /></button></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
