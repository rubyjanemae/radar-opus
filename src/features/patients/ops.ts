import type { Catalog } from '../../data/catalog'
import { parseRef } from '../../data/catalog'
import type { RubricRef } from '../../data/types'
import { resolvePath } from '../../seed/rubrics'
import { actions, selectActiveConsultation, selectActiveTab, useApp } from '../../state/store'
import type { Consultation, Patient } from '../../state/patients'
import type { PatientTab } from '../../state/workspace'
import { downloadBlob, pickFile } from '../../ui/files'
import { buildCaseFile, caseFileName, CaseFileError, importCaseFile, parseCaseFile } from './casefile'
import { consultationsOf, duplicatePatient, followUpFrom, nextFollowUpIndex, patientName, today } from './logic'

export const NEW_PATIENT_DIALOG = 'patients.new'
export const CONFIRM_DIALOG = 'patients.confirm'
export const REPORT_DIALOG = 'patients.report'

let catalogRef: Catalog | null = null
export function setCatalog(c: Catalog) { catalogRef = c }
export function catalog(): Catalog {
  if (!catalogRef) throw new Error('Patients feature not registered')
  return catalogRef
}

const st = () => useApp.getState()

/** Patient selected in the patients list (set by PatientsView), used as command context there. */
let listSelection: string | null = null
export function setListSelection(id: string | null) { listSelection = id }

export function activePatientTab(): PatientTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'patient' ? t : null
}

/** The patient commands act on: open patient tab, then the list selection, then the active case. */
export function contextPatientId(): string | null {
  const s = st()
  const t = selectActiveTab(s)
  if (t?.kind === 'patient' && s.patients[t.patientId]) return t.patientId
  if (t?.kind === 'patients' && listSelection && s.patients[listSelection]) return listSelection
  const c = selectActiveConsultation(s)
  return c && s.patients[c.patientId] ? c.patientId : null
}

/** Consultation shown in the open patient tab (explicit or latest). */
export function shownConsultationId(tab: PatientTab): string | null {
  const s = st()
  if (tab.consultationId && s.consultations[tab.consultationId]?.patientId === tab.patientId) return tab.consultationId
  return consultationsOf(s.consultations, tab.patientId)[0]?.id ?? null
}

/** Consultation commands act on: the one shown in the patient tab, else the active case. */
export function contextConsultationId(): string | null {
  const t = activePatientTab()
  if (t) return shownConsultationId(t)
  return st().activeConsultationId && st().consultations[st().activeConsultationId!] ? st().activeConsultationId : null
}

// ───────────────────────── navigation ─────────────────────────

export function openPatients() { actions.openTab({ kind: 'patients' }) }

export function openPatient(patientId: string, consultationId?: string | null, section?: PatientTab['section']) {
  actions.openTab({ kind: 'patient', patientId })
  const t = activePatientTab()
  if (t && (consultationId !== undefined || section)) {
    actions.updateTab<PatientTab>(t.id, { ...(consultationId !== undefined ? { consultationId } : {}), ...(section ? { section } : {}) })
  }
}

export function selectConsultation(tabId: string, consultationId: string) {
  actions.updateTab<PatientTab>(tabId, { consultationId, section: 'consultations' })
}

// ───────────────────────── patients ─────────────────────────

export function newPatient() { actions.openDialog(NEW_PATIENT_DIALOG) }

export function createPatient(fields: Partial<Patient>, startConsultation: boolean): string {
  const id = actions.createPatient(fields)
  if (startConsultation) {
    const cid = actions.createConsultation(id, { title: 'First consultation', kind: 'first', date: today() })
    openPatient(id, cid, 'consultations')
  } else openPatient(id, null, 'details')
  actions.toast(`Patient ${patientName({ firstName: fields.firstName ?? '', lastName: fields.lastName ?? '' })} created`, 'success')
  return id
}

function snapshot(patientId: string): { patient: Patient; consultations: Consultation[] } | null {
  const s = st()
  const patient = s.patients[patientId]
  return patient ? { patient, consultations: consultationsOf(s.consultations, patientId) } : null
}

export function confirmDeletePatient(patientId: string) {
  const snap = snapshot(patientId)
  if (!snap) return
  const n = snap.consultations.length
  actions.openDialog(CONFIRM_DIALOG, {
    title: 'Delete patient',
    message: `Delete ${patientName(snap.patient)} and ${n === 1 ? 'the only consultation' : `all ${n} consultations`}? Clipboards, analyses and prescriptions are removed too.`,
    confirmLabel: 'Delete patient',
    danger: true,
    onConfirm: () => deletePatient(patientId),
  })
}

export function deletePatient(patientId: string) {
  const snap = snapshot(patientId)
  if (!snap) return
  const s = st()
  const wasActive = s.activeConsultationId ? s.consultations[s.activeConsultationId]?.patientId === patientId : false
  const activeId = s.activeConsultationId
  actions.deletePatient(patientId)
  for (const t of st().tabs) {
    if ((t.kind === 'patient' && t.patientId === patientId) || (t.kind === 'analysis' && snap.consultations.some(c => c.id === t.consultationId))) actions.closeTab(t.id)
  }
  actions.toast(`Deleted ${patientName(snap.patient)}`, 'info', {
    label: 'Undo',
    run: () => {
      if (st().patients[patientId]) return
      actions.insertCaseData([snap.patient], snap.consultations)
      if (wasActive && activeId) actions.setActiveConsultation(activeId)
    },
  })
}

export function duplicate(patientId: string) {
  const snap = snapshot(patientId)
  if (!snap) return
  const copy = duplicatePatient(snap.patient, snap.consultations)
  actions.insertCaseData([copy.patient], copy.consultations)
  openPatient(copy.patient.id)
  actions.toast(`Duplicated as ${patientName(copy.patient)}`, 'success')
}

// ───────────────────────── consultations ─────────────────────────

/** Blank consultation for a patient ("First visit" if it is the first). */
export function newConsultation(patientId = contextPatientId()) {
  if (!patientId) { newPatient(); return }
  const list = consultationsOf(st().consultations, patientId)
  const first = list.length === 0
  const cid = actions.createConsultation(patientId, {
    date: today(), kind: first ? 'first' : 'follow-up', title: first ? 'First consultation' : `Follow-up ${nextFollowUpIndex(list)}`,
  })
  openPatient(patientId, cid, 'consultations')
  focusEditorTitle()
}

/** Follow-up of a consultation: copies its clipboards and complaint; becomes the active case. */
export function newFollowUp(fromId = contextConsultationId()) {
  const prev = fromId ? st().consultations[fromId] : null
  if (!prev) return
  const list = consultationsOf(st().consultations, prev.patientId)
  const cid = actions.createConsultation(prev.patientId, followUpFrom(prev, today(), nextFollowUpIndex(list)))
  openPatient(prev.patientId, cid, 'consultations')
  actions.toast('Follow-up created with the previous clipboards; it is now the active case', 'success')
  focusEditorTitle()
}

function focusEditorTitle() {
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.pt-ed-title-input')?.focus()))
}

/** Show a consultation in its patient tab and put the caret in the new-prescription row. */
export function focusPrescription(consultationId: string) {
  const c = st().consultations[consultationId]
  if (!c) return
  openPatient(c.patientId, consultationId, 'consultations')
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>('.pt-rx-add .pt-combo-input')
    el?.scrollIntoView({ block: 'nearest' })
    el?.focus()
  }))
}

export function makeActive(consultationId: string) {
  const c = st().consultations[consultationId]
  if (!c) return
  actions.setActiveConsultation(consultationId)
  actions.toast(`Active case: ${patientName(st().patients[c.patientId] ?? { firstName: '', lastName: '' })}, ${c.title || 'consultation'} (${c.date})`, 'success')
}

export function confirmDeleteConsultation(consultationId: string) {
  const c = st().consultations[consultationId]
  if (!c) return
  const n = c.clipboards.reduce((k, cb) => k + cb.symptoms.length, 0)
  actions.openDialog(CONFIRM_DIALOG, {
    title: 'Delete consultation',
    message: `Delete "${c.title || 'Consultation'}" of ${c.date}${n ? ` with ${n} symptom${n === 1 ? '' : 's'}` : ''}${c.prescriptions.length ? ` and ${c.prescriptions.length} prescription${c.prescriptions.length === 1 ? '' : 's'}` : ''}?`,
    confirmLabel: 'Delete consultation',
    danger: true,
    onConfirm: () => deleteConsultation(consultationId),
  })
}

export function deleteConsultation(consultationId: string) {
  const s = st()
  const c = s.consultations[consultationId]
  if (!c) return
  const wasActive = s.activeConsultationId === consultationId
  actions.deleteConsultation(consultationId)
  for (const t of st().tabs) {
    if (t.kind === 'analysis' && t.consultationId === consultationId) actions.closeTab(t.id)
    if (t.kind === 'patient' && t.consultationId === consultationId) actions.updateTab<PatientTab>(t.id, { consultationId: null })
  }
  actions.toast(`Deleted consultation of ${c.date}`, 'info', {
    label: 'Undo',
    run: () => {
      if (st().consultations[consultationId] || !st().patients[c.patientId]) return
      actions.insertCaseData([], [c])
      if (wasActive) actions.setActiveConsultation(consultationId)
    },
  })
}

// ───────────────────────── case files ─────────────────────────

export function rubricPath(ref: RubricRef): string | null {
  const r = catalog().resolve(ref)
  return r ? r.rep.path(r.index, ', ') : null
}

async function loadRepertoriesOf(refs: Iterable<RubricRef>) {
  const reps = new Set<string>()
  for (const r of refs) reps.add(parseRef(r).repertory)
  const known = new Set(catalog().repertoryInfos.map(i => i.abbrev))
  await Promise.all([...reps].filter(r => known.has(r)).map(r => catalog().loadRepertory(r).catch(() => null)))
}

export async function exportCase(patientId = contextPatientId()) {
  const snap = patientId ? snapshot(patientId) : null
  if (!snap) { actions.toast('Open or select a patient to export a case file.', 'info'); return }
  await loadRepertoriesOf(snap.consultations.flatMap(c => c.clipboards.flatMap(cb => cb.symptoms.flatMap(s => s.rubrics))))
  const file = buildCaseFile(snap.patient, snap.consultations, { rubricPath, remedyAbbrev: id => catalog().remedy(id).abbrev })
  downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), caseFileName(snap.patient))
  actions.toast(`Exported case file for ${patientName(snap.patient)}`, 'success')
}

/** Import from text; returns the new patient id (throws CaseFileError on invalid input). */
export async function importCaseText(text: string): Promise<string> {
  const file = parseCaseFile(text)
  await loadRepertoriesOf([...Object.keys(file.rubrics), ...file.consultations.flatMap(c => c.clipboards.flatMap(cb => cb.symptoms.flatMap(s => s.rubrics)))])
  const cat = catalog()
  const res = importCaseFile(file, {
    rubricPath,
    resolve: (rep, path) => { const r = cat.repertory(rep); return r ? resolvePath(r, path) : -1 },
    remedyByAbbrev: ab => cat.remedyByAbbrev.get(ab.toLowerCase())?.id,
    remedyAbbrev: id => cat.remedy(id).abbrev,
    existing: Object.values(st().patients),
  })
  actions.insertCaseData([res.patient], res.consultations)
  openPatient(res.patient.id)
  const notes = [
    res.duplicateOf ? 'a patient with the same name existed, imported as a separate record' : '',
    res.remapped ? `${res.remapped} rubric${res.remapped === 1 ? '' : 's'} re-linked` : '',
    res.unresolved ? `${res.unresolved} rubric${res.unresolved === 1 ? '' : 's'} could not be verified` : '',
  ].filter(Boolean)
  actions.toast(`Imported ${patientName(res.patient)} (${res.consultations.length} consultation${res.consultations.length === 1 ? '' : 's'})${notes.length ? `: ${notes.join('; ')}` : ''}`, res.unresolved ? 'info' : 'success')
  return res.patient.id
}

export async function importCase() {
  const f = await pickFile('.json,application/json')
  if (!f) return
  try { await importCaseText(await f.text()) } catch (e) {
    actions.toast(e instanceof CaseFileError ? e.message : `Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
  }
}

// ───────────────────────── report ─────────────────────────

export function openReport(consultationId = contextConsultationId()) {
  if (!consultationId || !st().consultations[consultationId]) { actions.toast('Open a consultation to print its case report.', 'info'); return }
  actions.openDialog(REPORT_DIALOG, { consultationId })
}
