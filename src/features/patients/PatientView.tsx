import { useMemo, useRef } from 'react'
import { CalendarPlus, Download, MoreHorizontal, UserX } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { analyze } from '../../engine/analysis'
import { actions, useApp } from '../../state/store'
import type { Consultation } from '../../state/patients'
import type { PatientTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { repertoriesOf, useRepertoriesLoaded } from '../analysis/useAnalysis'
import { sourceFor } from '../analysis/source'
import { ConsultationEditor } from './ConsultationEditor'
import { consultationsOf, formatAge, formatDate, formatScoreSigned, ghhosLabel, initials, KIND_LABEL, patientName, relativeDate, SEX_LABEL, symptomCount } from './logic'
import { PatientDetails } from './PatientDetails'
import * as ops from './ops'
import './patients.css'

export function PatientView({ tab }: { tab: PatientTab }) {
  const patient = useApp(s => s.patients[tab.patientId] ?? null)
  const all = useApp(s => s.consultations)
  const list = useMemo(() => consultationsOf(all, tab.patientId), [all, tab.patientId])
  const cm = useContextMenu()

  if (!patient) {
    return (
      <div className="empty-state">
        <UserX size={28} aria-hidden />
        <strong>This patient no longer exists</strong>
        <span>It was deleted or the workspace was restored from a backup.</span>
        <div className="pt-empty-actions">
          <button className="btn" onClick={ops.openPatients}>Patients list</button>
          <button className="btn" onClick={() => actions.closeTab(tab.id)}>Close tab</button>
        </div>
      </div>
    )
  }

  const section = tab.section ?? 'consultations'
  const shown = list.find(c => c.id === tab.consultationId) ?? list[0] ?? null
  const age = formatAge(patient.birthDate)
  const more: MenuItem[] = [
    { label: 'Duplicate patient', run: () => ops.duplicate(patient.id) },
    { label: 'Export case file…', run: () => void ops.exportCase(patient.id) },
    { label: 'Patient details', run: () => actions.updateTab<PatientTab>(tab.id, { section: 'details' }) },
    { type: 'separator' },
    { label: 'Delete patient…', danger: true, run: () => ops.confirmDeletePatient(patient.id) },
  ]

  return (
    <div className="pt-patient" data-testid="patient-view">
      <header className="pt-head">
        <div className="pt-avatar" aria-hidden>{initials(patient)}</div>
        <div className="pt-head-main">
          <h1 className="pt-head-name">{patientName(patient)}</h1>
          <div className="pt-head-meta">
            {[age && (/mo/.test(age) ? age : `${age} years`), patient.sex && SEX_LABEL[patient.sex], patient.occupation, patient.birthDate && `born ${formatDate(patient.birthDate)}`].filter(Boolean).join(' · ') || 'No personal data yet'}
            {patient.tags.map(t => <span key={t} className="pt-tag sm">{t}</span>)}
          </div>
        </div>
        <div className="pt-head-actions">
          <button className="btn btn-primary" onClick={() => ops.newConsultation(patient.id)} aria-label="New consultation" title="New consultation"><CalendarPlus size={14} /><span className="btn-label">New consultation</span></button>
          <button className="btn" onClick={() => void ops.exportCase(patient.id)} aria-label="Export" title="Export case file (JSON)"><Download size={14} /><span className="btn-label">Export</span></button>
          <button className="icon-btn" aria-label="More patient actions" title="More" onClick={e => cm.openAt(e.currentTarget, more)}><MoreHorizontal size={16} /></button>
        </div>
      </header>
      <div className="pt-seg" role="tablist" aria-label="Patient sections">
        <button role="tab" aria-selected={section === 'consultations'} className={section === 'consultations' ? 'on' : ''} onClick={() => actions.updateTab<PatientTab>(tab.id, { section: 'consultations' })}>
          Consultations <span className="badge">{list.length}</span>
        </button>
        <button role="tab" aria-selected={section === 'details'} className={section === 'details' ? 'on' : ''} onClick={() => actions.updateTab<PatientTab>(tab.id, { section: 'details' })}>
          Details
        </button>
      </div>
      {section === 'details' ? (
        <div className="pt-body-scroll"><PatientDetails key={patient.id} patient={patient} /></div>
      ) : (
        <div className="pt-split">
          <Timeline tab={tab} list={list} selectedId={shown?.id ?? null} onMenu={(e, c) => cm.open(e, timelineMenu(c))} onMenuAt={(el, c) => cm.openAt(el, timelineMenu(c))} />
          {shown ? <ConsultationEditor key={shown.id} consultation={shown} /> : (
            <div className="empty-state">
              <CalendarPlus size={26} aria-hidden />
              <strong>No consultations yet</strong>
              <span>Record the first consultation to start the case: notes, clipboards, analysis and prescriptions.</span>
              <button className="btn btn-primary" onClick={() => ops.newConsultation(patient.id)}>New consultation</button>
            </div>
          )}
        </div>
      )}
      {cm.element}
    </div>
  )
}

function timelineMenu(c: Consultation): MenuItem[] {
  const active = useApp.getState().activeConsultationId === c.id
  return [
    { label: 'Make active case', disabled: active, run: () => ops.makeActive(c.id) },
    { label: 'Open analysis', run: () => actions.openTab({ kind: 'analysis', consultationId: c.id }) },
    { label: 'New follow-up from this', run: () => ops.newFollowUp(c.id) },
    { label: 'Case report…', run: () => ops.openReport(c.id) },
    { type: 'separator' },
    { label: 'Delete consultation…', danger: true, keys: 'Delete', run: () => ops.confirmDeleteConsultation(c.id) },
  ]
}

function Timeline({ tab, list, selectedId, onMenu, onMenuAt }: {
  tab: PatientTab; list: Consultation[]; selectedId: string | null
  onMenu: (e: React.MouseEvent, c: Consultation) => void; onMenuAt: (el: HTMLElement, c: Consultation) => void
}) {
  const catalog = useCatalog()
  const activeId = useApp(s => s.activeConsultationId)
  const ref = useRef<HTMLDivElement>(null)
  const reps = useMemo(() => repertoriesOf(list.flatMap(c => c.clipboards)), [list])
  const load = useRepertoriesLoaded(catalog, reps)
  const tops = useMemo(() => {
    const src = sourceFor(catalog)
    const m = new Map<string, string[]>()
    for (const c of list) {
      if (!symptomCount(c)) continue
      const res = analyze(src, c.clipboards, { ...c.analysis, limit: 3 })
      m.set(c.id, res.rows.filter(r => !r.excluded).slice(0, 3).map(r => catalog.remedy(r.remedyId).abbrev))
    }
    return m
  }, [list, catalog, load.version]) // eslint-disable-line react-hooks/exhaustive-deps
  const index = list.findIndex(c => c.id === selectedId)
  const select = (i: number) => {
    const c = list[Math.max(0, Math.min(list.length - 1, i))]
    if (!c) return
    ops.selectConsultation(tab.id, c.id)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-cid="${c.id}"]`)?.scrollIntoView({ block: 'nearest' }))
  }

  return (
    <div
      ref={ref} className="pt-timeline" role="listbox" aria-label="Consultations" tabIndex={0}
      aria-activedescendant={selectedId ? `pt-c-${selectedId}` : undefined}
      onKeyDown={e => {
        const c = list[index]
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); select(index + 1) }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); select(index - 1) }
        else if (e.key === 'Home') { e.preventDefault(); select(0) }
        else if (e.key === 'End') { e.preventDefault(); select(list.length - 1) }
        else if (e.key === 'Enter' && c) { e.preventDefault(); (document.querySelector('.pt-editor textarea, .pt-editor input') as HTMLElement | null)?.focus() }
        else if (e.key === 'Delete' && c) { e.preventDefault(); ops.confirmDeleteConsultation(c.id) }
        else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && c) {
          e.preventDefault()
          const el = ref.current?.querySelector<HTMLElement>(`[data-cid="${c.id}"]`)
          if (el) onMenuAt(el, c)
        }
      }}
    >
      {list.length === 0 && <div className="pt-card-empty">No consultations</div>}
      {list.map((c, i) => {
        const n = symptomCount(c)
        const top = tops.get(c.id)
        const year = c.date.slice(0, 4)
        return (
          <div key={c.id} className="pt-tl-group">
            {(i === 0 || list[i - 1].date.slice(0, 4) !== year) && <div className="pt-tl-year">{year}</div>}
            <div
              id={`pt-c-${c.id}`} data-cid={c.id} role="option" aria-selected={c.id === selectedId}
              className={`pt-tl-item k-${c.kind}${c.id === selectedId ? ' selected' : ''}`}
              onMouseDown={() => ops.selectConsultation(tab.id, c.id)}
              onDoubleClick={() => ops.makeActive(c.id)}
              onContextMenu={e => { ops.selectConsultation(tab.id, c.id); onMenu(e, c) }}
            >
              <div className="pt-tl-line1">
                <span className="pt-tl-date">{formatDate(c.date)}</span>
                <span className={`pt-kind k-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                {c.id === activeId && <span className="pt-active-pill" title="Active case: the clipboards show this consultation">Active</span>}
              </div>
              <div className="pt-tl-title">{c.title || 'Consultation'}</div>
              <div className="pt-tl-meta">
                <span title="Symptoms on the clipboards">{n} symptom{n === 1 ? '' : 's'}</span>
                {c.response?.score != null && <span className={`pt-tl-resp ${c.response.score > 0 ? 'pos' : c.response.score < 0 ? 'neg' : 'zero'}`} title={`Response to the previous remedy: ${ghhosLabel(c.response.score)}`}>{formatScoreSigned(c.response.score)}</span>}
                {c.prescriptions.length > 0 && <span className="pt-tl-rx" title="Prescribed">{c.prescriptions.map(p => `${catalog.remedy(p.remedyId).abbrev} ${p.potency}`).join(', ')}</span>}
              </div>
              {top && top.length > 0 && <div className="pt-tl-top" title="Top remedies of the analysis">↳ {top.join(' · ')}</div>}
              <div className="pt-tl-rel">{relativeDate(c.date)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
