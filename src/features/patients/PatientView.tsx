import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { UserX } from 'lucide-react'
import { runCommand } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import type { Consultation, Patient } from '../../state/patients'
import type { PatientTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { HelpGlyph } from '../toc/glyphs'
import { ResponseCard, TextField, Prescriptions } from './ConsultationEditor'
import { consultationsOf, KIND_LABEL } from './logic'
import { ageYmd, consultationsOldestFirst, ddmmyyyy } from './panel'
import { PatientDetails } from './PatientDetails'
import { RichTextEditor } from './RichTextEditor'
import type { RichTextHandle } from './RichTextEditor'
import {
  AdminTabGlyph, BalanceGlyph, CaduceusGlyph, ConsultTabGlyph, DoubleChevronGlyph, FlaskGlyph, FreeFieldsGlyph, GridGlyph, JarGlyph,
  NewConsultGlyph, PencilGlyph, SaveGlyph, SyringeGlyph,
} from './glyphs'
import * as ops from './ops'
import './patients.css'
import './patient-view.css'

/**
 * The patient (case) tab, after RadarOpus: the "Administrative" and "Consultations" sub-tabs; the
 * consultation toolbar; the "Last consultation (n) on the … at age …" line with the consultation
 * chooser; the rich-text consultation editor on its page; prescriptions and free fields on demand.
 */

/** Toolbar toggles that outlive a tab switch (the view unmounts when another tab is shown). */
const remembered = { editing: true, prescriptions: false, freeFields: false }

export function PatientView({ tab }: { tab: PatientTab }) {
  const patient = useApp(s => s.patients[tab.patientId] ?? null)

  if (!patient) {
    return (
      <div className="empty-state">
        <UserX size={28} aria-hidden />
        <strong>This patient no longer exists</strong>
        <span>It was deleted or the workspace was restored from a backup.</span>
        <div className="pt-empty-actions">
          <button className="btn" onClick={() => ops.openPatients()}>Patients list</button>
          <button className="btn" onClick={() => actions.closeTab(tab.id)}>Close tab</button>
        </div>
      </div>
    )
  }

  const section = tab.section ?? 'consultations'
  const show = (s: 'consultations' | 'details') => actions.updateTab<PatientTab>(tab.id, { section: s })
  const tabs = [['details', 'Administrative', <AdminTabGlyph key="a" />], ['consultations', 'Consultations', <ConsultTabGlyph key="c" />]] as const
  return (
    <div className="pv" data-testid="patient-view">
      <div className="pv-subtabs" role="tablist" aria-label="Patient sections"
        onKeyDown={e => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const next = section === 'details' ? 'consultations' : 'details'
          show(next)
          requestAnimationFrame(() => document.getElementById(`pv-subtab-${tab.id}-${next}`)?.focus())
        }}>
        {tabs.map(([key, label, icon]) => (
          <button key={key} id={`pv-subtab-${tab.id}-${key}`} role="tab" aria-selected={section === key} tabIndex={section === key ? 0 : -1}
            className={`pv-subtab${section === key ? ' on' : ''}`} onClick={() => show(key)}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>
      <div className="pv-body" role="tabpanel" aria-label={section === 'details' ? 'Administrative' : 'Consultations'}>
        {section === 'details'
          ? <div className="pv-admin"><PatientDetails key={patient.id} patient={patient} /></div>
          : <Consultations tab={tab} patient={patient} />}
      </div>
    </div>
  )
}

function Consultations({ tab, patient }: { tab: PatientTab; patient: Patient }) {
  const all = useApp(s => s.consultations)
  const activeId = useApp(s => s.activeConsultationId)
  const newest = useMemo(() => consultationsOf(all, patient.id), [all, patient.id])
  const oldest = useMemo(() => consultationsOldestFirst(all, patient.id), [all, patient.id])
  const shown: Consultation | null = newest.find(c => c.id === tab.consultationId) ?? newest[0] ?? null
  const number = shown ? oldest.findIndex(c => c.id === shown.id) + 1 : 0
  const [editing, setEditing] = useState(remembered.editing)
  const [showRx, setShowRx] = useState(remembered.prescriptions)
  const [free, setFree] = useState(remembered.freeFields)
  // RadarOpus draws Save dull until the text has unsaved changes
  const [unsaved, setUnsaved] = useState(false)
  useEffect(() => { remembered.editing = editing; remembered.prescriptions = showRx; remembered.freeFields = free }, [editing, showRx, free])
  const editor = useRef<RichTextHandle>(null)
  const chooser = useContextMenu()
  // "Add prescription" (ops.openPrescription) needs the prescriptions form on screen
  const rxRequest = ops.usePrescriptionRequest(s => (shown && s.request?.consultationId === shown.id ? s.request : null))
  if (rxRequest && !showRx) setShowRx(true)

  const isActive = !!shown && shown.id === activeId
  const save = useCallback(() => {
    editor.current?.flush()
    actions.toast('Patient information saved', 'success')
  }, [])
  const chooseItems = (): MenuItem[] => [
    ...newest.map(c => {
      const n = oldest.findIndex(o => o.id === c.id) + 1
      return { label: `(${n}) ${ddmmyyyy(c.date)}  ${c.title || KIND_LABEL[c.kind]}`, checked: c.id === shown?.id, run: () => ops.selectConsultation(tab.id, c.id) }
    }),
    ...(shown ? [
      { type: 'separator' } as const,
      { label: 'New follow-up from this consultation', run: () => ops.newFollowUp(shown.id) },
      { label: 'Delete this consultation…', danger: true, run: () => ops.confirmDeleteConsultation(shown.id) },
    ] : []),
  ]
  const at = shown ? ageAt(patient.birthDate, shown.date) : ''

  return (
    <div className="pv-cons">
      <div className="pv-tb" role="toolbar" aria-label="Consultation">
        <TbButton title="Save patient information" className={unsaved ? 'pv-save-dirty' : 'pv-save'} onClick={save} disabled={!shown}><SaveGlyph /></TbButton>
        <TbButton title="Edit the consultation text" pressed={editing} onClick={() => setEditing(e => !e)} disabled={!shown}><PencilGlyph /></TbButton>
        <TbButton title="Prescriptions of this consultation" pressed={showRx} onClick={() => setShowRx(v => !v)} disabled={!shown}><JarGlyph /></TbButton>
        <TbButton title={isActive ? 'Active case: the clipboards and analysis work on this consultation' : 'Make this consultation the active case'}
          onClick={() => { if (shown) ops.makeActive(shown.id) }} disabled={!shown}><CaduceusGlyph /></TbButton>
        <TbButton title="Open the analysis of this consultation" onClick={() => shown && actions.openTab({ kind: 'analysis', consultationId: shown.id })} disabled={!shown}><BalanceGlyph /></TbButton>
        <TbButton title="Case report" onClick={() => shown && ops.openReport(shown.id)} disabled={!shown}><GridGlyph /></TbButton>
        <span className="pv-tb-sep" aria-hidden="true" />
        <button className="pv-tbtn pv-tbtn-label" title="Create a new consultation" onClick={() => ops.newConsultation(patient.id)}>
          <NewConsultGlyph /><span>New consultation</span>
        </button>
        <span className="pv-grow" />
        <TbButton title="Prescribe a remedy" onClick={() => { if (shown) { setShowRx(true); ops.openPrescription(shown.id) } }} disabled={!shown}><SyringeGlyph /></TbButton>
        <TbButton title="New follow-up with a copy of the clipboards" onClick={() => shown && ops.newFollowUp(shown.id)} disabled={!shown}><FlaskGlyph /></TbButton>
        <button className={`pv-tbtn pv-tbtn-label${free ? ' on' : ''}`} aria-pressed={free} title="Consultation free fields: title, date, kind, complaint, assessment"
          onClick={() => setFree(v => !v)} disabled={!shown}>
          <FreeFieldsGlyph /><span>Consultation free fields</span>
        </button>
        <button className="pv-help" title="Keyboard shortcuts (F1)" aria-label="Keyboard shortcuts" onClick={() => runCommand('help.shortcuts')}><HelpGlyph /></button>
      </div>

      {shown ? (
        <>
          <div className="pv-line">
            <b>{shown.id === newest[0]?.id ? 'Last consultation' : 'Consultation'} ({number})</b>
            <button className="pv-choose" aria-haspopup="menu" aria-expanded={chooser.isOpen} title="Choose another consultation" aria-label="Choose another consultation"
              onClick={e => chooser.openAt(e.currentTarget, chooseItems())}
              onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); chooser.openAt(e.currentTarget, chooseItems()) } }}>
              <DoubleChevronGlyph />
            </button>
            <span>on the {ddmmyyyy(shown.date)}{at && <> at age {at}</>}</span>
          </div>
          <RichTextEditor ref={editor} key={shown.id} consultation={shown} editable={editing} onDirty={setUnsaved}>
            {free && (
              <section className="pv-free" aria-label="Consultation free fields">
                <div className="pv-free-row">
                  <TextField key={`t${shown.id}`} label="Title" className="pt-ed-title" value={shown.title} onCommit={v => actions.updateConsultation(shown.id, { title: v })} placeholder="Consultation title" />
                  <label className="field pt-field pt-ed-date">
                    <span>Date</span>
                    <input type="date" className="input" value={shown.date} onChange={e => { if (e.target.value) actions.updateConsultation(shown.id, { date: e.target.value }) }} />
                  </label>
                  <label className="field pt-field pt-ed-kind">
                    <span>Kind</span>
                    <select className="select" value={shown.kind} onChange={e => actions.updateConsultation(shown.id, { kind: e.target.value as Consultation['kind'] })}>
                      {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                </div>
                <TextField key={`c${shown.id}`} label="Chief complaint" className="pt-ed-complaint" value={shown.complaint} onCommit={v => actions.updateConsultation(shown.id, { complaint: v })} placeholder="Main complaint in the patient's words" />
                <TextField key={`a${shown.id}`} label="Assessment" multiline rows={3} value={shown.assessment} onCommit={v => actions.updateConsultation(shown.id, { assessment: v })} placeholder="Analysis of the case, differential, plan" />
                <ResponseCard consultation={shown} />
              </section>
            )}
            {showRx && <div className="pv-rx"><Prescriptions consultation={shown} /></div>}
          </RichTextEditor>
          {chooser.element}
        </>
      ) : (
        <div className="pv-none">
          <p>{patient.firstName || patient.lastName ? `${[patient.firstName, patient.lastName].filter(Boolean).join(' ')} has no consultations yet.` : 'No consultations yet.'}</p>
          <button className="btn" onClick={() => ops.newConsultation(patient.id)}>Create a new consultation</button>
        </div>
      )}
    </div>
  )
}

function TbButton({ title, pressed, disabled, onClick, children, className }: { title: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button className={`pv-tbtn${pressed ? ' on' : ''}${className ? ` ${className}` : ''}`} title={title} aria-label={title} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

/** Age (years.months.days) on the consultation date. */
function ageAt(birthDate: string | null, date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return ''
  return ageYmd(birthDate, new Date(+m[1], +m[2] - 1, +m[3], 12).getTime())
}
