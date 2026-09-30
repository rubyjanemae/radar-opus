import type { Catalog } from '../../data/catalog'
import { parseRef } from '../../data/catalog'
import type { RubricRef } from '../../data/types'
import { resolvePath } from '../../seed/rubrics'
import { actions, selectActiveConsultation, selectActiveTab, useApp } from '../../state/store'
import type { Consultation, Patient } from '../../state/patients'
import type { PatientTab } from '../../state/workspace'
import { downloadBlob, pickFile } from '../../ui/files'
import { create } from 'zustand'
import { buildCaseFile, caseFileName, CaseFileError, findExistingPatient, importCaseFile, parseCaseFile } from './casefile'
import type { CaseFile, ImportMode } from './casefile'
import { consultationsOf, duplicatePatient, followUpFrom, formatDate, nextFollowUpIndex, patientName, today } from './logic'

export const NEW_PATIENT_DIALOG = 'patients.new'
export const CONFIRM_DIALOG = 'patients.confirm'
export const REPORT_DIALOG = 'patients.report'
export const IMPORT_CONFLICT_DIALOG = 'patients.importConflict'

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

/**
 * Show the patients list. Keyboard flow (Mod+3, then type or ↓ and Enter) puts the caret in the
 * search box; `focus: 'table'` focuses the table instead (after a delete, so Ctrl+Z is the app's undo).
 * The request is picked up by the list when it mounts or is shown again (its code may still be
 * loading), or right away when it is already on screen. Switching to the list from the tab strip
 * makes no request, so the list leaves focus to the tab strip.
 */
export function openPatients(opts: { focus?: 'search' | 'table' } = {}) {
  listFocusRequest = { focus: opts.focus ?? 'search', at: Date.now() }
  actions.openTab({ kind: 'patients' })
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const list = document.querySelector<HTMLElement>('.tab-doc[data-active] .pt-list')
    if (list) applyListFocus(list)
  }))
}

/** The pending focus request of openPatients; it lapses after a few seconds (a list that never showed). */
let listFocusRequest: { focus: 'search' | 'table'; at: number } | null = null

/** Focus the list as the pending openPatients request asked (once); called by PatientsView when shown. */
export function applyListFocus(list: HTMLElement) {
  const req = listFocusRequest
  listFocusRequest = null
  if (!req || Date.now() - req.at > 3000) return
  const want = req.focus
  if (document.querySelector('[role="dialog"]')) return
  if (want === 'table') list.querySelector<HTMLElement>('.pt-table')?.focus()
  else if (!list.contains(document.activeElement)) list.querySelector<HTMLElement>('.pt-search-input')?.focus()
}

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
  const name = patientName({ firstName: fields.firstName ?? '', lastName: fields.lastName ?? '' })
  if (startConsultation) {
    // one undo step: undoing removes the patient together with its first consultation
    const { id, cid } = actions.transaction(() => {
      const id = actions.createPatient(fields)
      const cid = actions.createConsultation(id, { title: 'First consultation', kind: 'first', date: today() })
      return { id, cid }
    }, 'New patient')
    openPatient(id, cid, 'consultations')
    actions.toast(`Patient ${name} created; the first consultation is now the active case`, 'success')
    // the title is already filled in: the next thing to record is the complaint
    focusLater('.pt-ed-complaint-input')
    return id
  }
  const id = actions.createPatient(fields)
  openPatient(id, null, 'details')
  actions.toast(`Patient ${name} created`, 'success')
  focusLater('.pt-details input[name="firstName"]')
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
  const fromOwnPage = activePatientTab()?.patientId === patientId
  actions.deletePatient(patientId) // also closes the patient's tabs (undo reopens them)
  // deleted from its own page: land on the list (the table, so Ctrl+Z undoes the delete)
  if (fromOwnPage) openPatients({ focus: 'table' })
  const entry = st().past[st().past.length - 1]
  actions.toast(`Deleted ${patientName(snap.patient)}`, 'info', {
    label: 'Undo',
    run: () => {
      if (st().patients[patientId]) return
      // Nothing happened since: the store undo also restores the closed tabs and the case focus.
      if (st().past[st().past.length - 1] === entry) { actions.undo(); return }
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
  actions.toast(`${first ? 'First consultation' : 'New consultation'} created; it is now the active case`, 'success')
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

/**
 * Focus an element of the active document once it has rendered (the patient page's code may still be
 * loading on first use): tries every frame for about a second, never while a dialog is open.
 */
function focusLater(selector: string) {
  let frames = 0
  const tick = () => {
    const el = document.querySelector('[role="dialog"]') ? null : document.querySelector<HTMLElement>(`.tab-doc[data-active] ${selector}`)
    if (el && frames >= 1) { el.focus(); return }
    if (++frames < 60) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function focusEditorTitle() { focusLater('.pt-ed-title-input') }

/**
 * Pending "add prescription" request, read by the consultation editor's prescription form:
 * `remedyId` prefills the remedy, 'top' asks the form to use the top-ranked remedy of the analysis.
 */
export interface PrescriptionRequest { consultationId: string; remedyId: number | 'top' | null; seq: number }
let prescriptionSeq = 0
export const usePrescriptionRequest = create<{ request: PrescriptionRequest | null }>(() => ({ request: null }))

/** Remedy selected in an analysis of this consultation (the active tab first, then any open analysis tab). */
export function selectedAnalysisRemedy(consultationId: string): number | null {
  const s = st()
  const tabs = [selectActiveTab(s), ...s.tabs]
  for (const t of tabs) if (t?.kind === 'analysis' && t.consultationId === consultationId && typeof t.remedy === 'number') return t.remedy
  return null
}

/**
 * Show a consultation in its patient tab with the new-prescription form in view and focused.
 * The remedy is prefilled with `remedyId`, else the remedy selected in its analysis, else the
 * analysis' top-ranked remedy. Other features may call this (e.g. "Prescribe" from an analysis).
 */
export function openPrescription(consultationId: string, remedyId?: number | null) {
  const c = st().consultations[consultationId]
  if (!c) return
  const remedy = remedyId ?? selectedAnalysisRemedy(consultationId) ?? 'top'
  openPatient(c.patientId, consultationId, 'consultations')
  usePrescriptionRequest.setState({ request: { consultationId, remedyId: remedy, seq: ++prescriptionSeq } })
}

export function makeActive(consultationId: string) {
  const c = st().consultations[consultationId]
  if (!c) return
  actions.setActiveConsultation(consultationId)
  actions.toast(`Active case: ${patientName(st().patients[c.patientId] ?? { firstName: '', lastName: '' })}, ${c.title || 'consultation'} (${formatDate(c.date)})`, 'success')
}

export function confirmDeleteConsultation(consultationId: string) {
  const s = st()
  const c = s.consultations[consultationId]
  if (!c) return
  const n = c.clipboards.reduce((k, cb) => k + cb.symptoms.length, 0)
  const active = s.activeConsultationId === consultationId
  const analysisOpen = s.tabs.some(t => t.kind === 'analysis' && t.consultationId === consultationId)
  const what = `Delete "${c.title || 'Consultation'}" of ${formatDate(c.date)}${n ? ` with ${n} symptom${n === 1 ? '' : 's'}` : ''}${c.prescriptions.length ? ` and ${c.prescriptions.length} prescription${c.prescriptions.length === 1 ? '' : 's'}` : ''}?`
  const notes = [
    active ? 'It is the active case: afterwards no case is active until you choose one.' : '',
    analysisOpen ? 'Its analysis tab will close.' : '',
  ].filter(Boolean)
  actions.openDialog(CONFIRM_DIALOG, {
    title: 'Delete consultation',
    message: [what, ...notes].join(' '),
    confirmLabel: 'Delete consultation',
    danger: true,
    onConfirm: () => deleteConsultation(consultationId),
  })
}

/**
 * Delete a consultation. Deleting the active case leaves no active case (the clipboards say so)
 * rather than silently switching to another consultation; one undo step restores both.
 */
export function deleteConsultation(consultationId: string) {
  const s = st()
  const c = s.consultations[consultationId]
  if (!c) return
  const wasActive = s.activeConsultationId === consultationId
  actions.transaction(() => {
    actions.deleteConsultation(consultationId) // also closes its analysis tab (undo reopens it)
    if (wasActive) actions.setActiveConsultation(null)
  }, 'Delete consultation')
  const entry = st().past[st().past.length - 1]
  for (const t of st().tabs) {
    if (t.kind === 'patient' && t.consultationId === consultationId) actions.updateTab<PatientTab>(t.id, { consultationId: null })
  }
  actions.toast(`Deleted consultation of ${formatDate(c.date)}${wasActive ? '; no case is active now' : ''}`, 'info', {
    label: 'Undo',
    run: () => {
      if (st().consultations[consultationId] || !st().patients[c.patientId]) return
      if (st().past[st().past.length - 1] === entry) { actions.undo(); return }
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

/**
 * Import from text; returns the patient id, or null when the user is asked how to treat a patient
 * already on file (the choice finishes the import). Throws CaseFileError on invalid input.
 */
export async function importCaseText(text: string, mode?: ImportMode): Promise<string | null> {
  const file = parseCaseFile(text)
  const existing = findExistingPatient(file, Object.values(st().patients))
  if (existing && !mode) {
    const have = consultationsOf(st().consultations, existing.patient.id).length
    actions.openDialog(IMPORT_CONFLICT_DIALOG, {
      name: patientName(existing.patient), birthDate: existing.patient.birthDate, sameRecord: existing.by === 'id',
      fileConsultations: file.consultations.length, haveConsultations: have,
      onChoose: (m: ImportMode) => { void finishImport(file, m).catch(reportImportError) },
    })
    return null
  }
  return finishImport(file, mode ?? 'new')
}

function reportImportError(e: unknown) {
  actions.toast(e instanceof CaseFileError ? e.message : `Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
}

async function finishImport(file: CaseFile, mode: ImportMode): Promise<string> {
  await loadRepertoriesOf([...Object.keys(file.rubrics), ...file.consultations.flatMap(c => c.clipboards.flatMap(cb => cb.symptoms.flatMap(s => s.rubrics)))])
  const cat = catalog()
  const res = importCaseFile(file, {
    rubricPath,
    resolve: (rep, path) => { const r = cat.repertory(rep); return r ? resolvePath(r, path) : -1 },
    remedyByAbbrev: ab => cat.remedyByAbbrev.get(ab.toLowerCase())?.id,
    remedyAbbrev: id => cat.remedy(id).abbrev,
    existing: Object.values(st().patients),
    existingConsultations: Object.values(st().consultations),
  }, Date.now(), mode)
  actions.transaction(() => {
    for (const id of res.replaces) actions.deleteConsultation(id)
    actions.insertCaseData(res.mode === 'merge' ? [] : [res.patient], res.consultations)
  }, res.mode === 'replace' ? 'Replace patient from case file' : res.mode === 'merge' ? 'Merge case file' : 'Import case file')
  openPatient(res.patient.id, null)
  const n = res.consultations.length
  const cons = `${n} consultation${n === 1 ? '' : 's'}`
  const notes = [
    res.mode === 'new' && res.duplicateOf ? 'kept as a separate record next to the patient on file' : '',
    res.skipped ? `${res.skipped} consultation${res.skipped === 1 ? ' was' : 's were'} already on file` : '',
    res.remapped ? `${res.remapped} rubric${res.remapped === 1 ? '' : 's'} re-linked` : '',
    res.unresolved ? `${res.unresolved} rubric${res.unresolved === 1 ? '' : 's'} could not be verified` : '',
    ...(file.warnings ?? []),
  ].filter(Boolean)
  const head = res.mode === 'replace' ? `Replaced ${patientName(res.patient)} from the case file (${cons})`
    : res.mode === 'merge' ? `Merged ${cons} into ${patientName(res.patient)}`
    : `Imported ${patientName(res.patient)} (${cons})`
  actions.toast(`${head}${notes.length ? `: ${notes.join('; ')}` : ''}`, res.unresolved || file.warnings?.length ? 'info' : 'success')
  return res.patient.id
}

export async function importCase() {
  const f = await pickFile('.json,application/json')
  if (!f) return
  try { await importCaseText(await f.text()) } catch (e) { reportImportError(e) }
}

// ───────────────────────── report ─────────────────────────

export function openReport(consultationId = contextConsultationId()) {
  if (!consultationId || !st().consultations[consultationId]) { actions.toast('Open a consultation to print its case report.', 'info'); return }
  actions.openDialog(REPORT_DIALOG, { consultationId })
}
