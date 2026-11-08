import { getCommand, isEnabled, registerCommands, runCommand } from '../commands/registry'
import { actions, selectActiveTab, useApp } from '../state/store'
import type { PatientTab } from '../state/workspace'
import { flushNow } from '../state/persist'
import { currentRefs } from '../features/repertory/ops'
import { chrome } from './chrome'
import { returnFocusFromChrome } from './focus'
import { registerLazyDialog } from './dialogs'
import type { RubricRef } from '../data/types'
import { downloadBlob, pickFile } from '../ui/files'
import { consultationsOldestFirst } from '../features/patients/panel'
import { contextConsultationId } from '../features/patients/ops'

/**
 * Menubar commands of RadarOpus's File, Additions, View, Tools and Help menus that have no home in a
 * feature: each one does what its RadarOpus item does, within what a web page can do.
 */

const st = () => useApp.getState()

/** The patient window menus act on: the active one, else the one opened last. */
function patientTab(): PatientTab | null {
  const s = st()
  const t = selectActiveTab(s)
  if (t?.kind === 'patient') return t
  return [...s.tabs].reverse().find((x): x is PatientTab => x.kind === 'patient') ?? null
}

/** Show the patient window on one of its sections (RadarOpus: Patient administration / Patient consultations). */
function showPatient(section: 'details' | 'consultations') {
  const t = patientTab()
  if (!t) return
  if (st().activeTabId !== t.id) actions.activateTab(t.id)
  actions.updateTab<PatientTab>(t.id, { section })
  returnFocusFromChrome('body')
}

/** The rubric under the cursor whose note Additions › Remove a symptom note deletes. */
function notedRubric() {
  const ref = currentRefs()[0]
  return ref && st().rubricNotes[ref] ? ref : null
}

// ── Tools › Deactivate tooltips: a hovered control's tooltip text is parked in data-ro-title (restored when turned back on)
const PARKED = 'data-ro-title'
function parkTitles(e: Event) {
  if (!chrome.get().tooltipsOff) return
  for (let el = e.target instanceof Element ? e.target : null; el; el = el.parentElement) {
    const t = el.getAttribute('title')
    if (t !== null) { el.setAttribute(PARKED, t); el.removeAttribute('title') }
  }
}
function restoreTitles() {
  for (const el of document.querySelectorAll(`[${PARKED}]`)) {
    if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute(PARKED) ?? '')
    el.removeAttribute(PARKED)
  }
}

/**
 * File › Print preview / Print setup: the browser's print dialog is both, so they open it on what Print
 * prints (the analysis or monograph when one is active, else the page).
 */
const PRINTERS = ['analysis.print', 'mm.print', 'file.print']
const printLike = (id: string, title: string) => ({
  id, title, category: 'File', keywords: 'print preview page setup printer',
  enabled: () => PRINTERS.some(p => { const c = getCommand(p); return !!c && isEnabled(c) }),
  run: () => { const c = PRINTERS.map(getCommand).find(c => c && isEnabled(c)); if (c) runCommand(c.id) },
})

// ── Edit › Open pick list of current field: the field last focused in a document (a menu takes the focus meanwhile)
type PickField = HTMLSelectElement | HTMLInputElement
let lastField: PickField | null = null
const hasPickList = (el: Element | null): el is PickField =>
  el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && (!!el.list || ['date', 'time', 'color', 'month', 'week', 'datetime-local'].includes(el.type)))
function trackField(e: FocusEvent) {
  const t = e.target instanceof Element ? e.target : null
  if (t?.closest('[role="menu"], [role="menubar"], .menu-portal')) return
  lastField = hasPickList(t) && !t.disabled ? t : null
}
const pickField = () => (lastField?.isConnected && !lastField.disabled ? lastField : null)

// ── Edit › Repeat last prescription: the patient's most recent prescription before this consultation's
function lastPrescription(consultationId: string) {
  const s = st()
  const c = s.consultations[consultationId]
  if (!c) return null
  const all = consultationsOldestFirst(s.consultations, c.patientId)
  const before = all.slice(0, Math.max(0, all.findIndex(x => x.id === c.id)))
  for (let i = before.length - 1; i >= 0; i--) {
    const p = before[i].prescriptions[before[i].prescriptions.length - 1]
    if (p) return p
  }
  return null
}

// ── Additions › Export / Import additions: the user's symptom notes, as a file
const ADDITIONS_FORMAT = 'radar-opus-additions'
export function additionsFile(notes: Record<string, string>): string {
  return JSON.stringify({ format: ADDITIONS_FORMAT, version: 1, exportedAt: new Date().toISOString(), symptomNotes: notes }, null, 1)
}
/** The symptom notes of an additions file; null when the file is not one. */
export function parseAdditions(text: string): Record<string, string> | null {
  try {
    const v = JSON.parse(text) as { format?: unknown; symptomNotes?: unknown }
    if (v?.format !== ADDITIONS_FORMAT || !v.symptomNotes || typeof v.symptomNotes !== 'object') return null
    const out: Record<string, string> = {}
    for (const [k, t] of Object.entries(v.symptomNotes as Record<string, unknown>)) if (/^[\w-]+:\d+$/.test(k) && typeof t === 'string' && t.trim()) out[k] = t
    return out
  } catch { return null }
}
async function importAdditions() {
  const f = await pickFile('.json,application/json')
  if (!f) return
  const notes = parseAdditions(await f.text())
  if (!notes) { actions.toast('This file is not an additions file', 'error'); return }
  const before: Record<string, string> = { ...st().rubricNotes }
  const keys = Object.keys(notes) as RubricRef[]
  for (const k of keys) actions.setRubricNote(k, notes[k])
  actions.toast(`${keys.length} symptom note${keys.length === 1 ? '' : 's'} imported`, 'success', {
    label: 'Undo', run: () => { for (const k of keys) actions.setRubricNote(k, before[k] ?? '') },
  })
}

/** A RadarOpus Help menu web page, in a new browser tab. */
const link = (id: string, title: string, url: string) => ({
  id, title, category: 'Help', keywords: `web site link ${url}`,
  run: () => { window.open(url, '_blank', 'noopener,noreferrer') },
})

export function register() {
  if (typeof document !== 'undefined') {
    document.addEventListener('mouseover', parkTitles, true)
    document.addEventListener('focusin', trackField, true)
  }
  registerLazyDialog('view.authors', () => import('../features/workspace/AuthorsDialog'), m => m.AuthorsDialog)
  registerCommands([
    {
      id: 'view.authors', title: 'List of authors and documents', category: 'View', keywords: 'authors documents sources books repertories materia medica',
      run: () => actions.openDialog('view.authors'),
    },
    {
      id: 'edit.pickList', title: 'Open pick list of current field', category: 'Edit', keywords: 'dropdown choices field list',
      enabled: () => !!pickField(),
      run: () => {
        const f = pickField()
        if (!f) return
        f.focus()
        try { f.showPicker() } catch { /* no picker without user activation: the field has the focus, Alt+↓ opens it */ }
      },
    },
    {
      id: 'edit.repeatPrescription', title: 'Repeat last prescription', category: 'Edit', keywords: 'prescription repeat previous remedy potency',
      enabled: () => { const id = contextConsultationId(); return !!id && !!lastPrescription(id) },
      run: () => {
        const id = contextConsultationId()
        const p = id ? lastPrescription(id) : null
        const c = id ? st().consultations[id] : null
        if (!id || !p || !c) return
        actions.addPrescription(id, { remedyId: p.remedyId, potency: p.potency, dosage: p.dosage, date: c.date, note: 'Repeat' })
        actions.toast(`Prescription repeated: ${p.potency}`, 'success', undefined, 2500)
      },
    },
    {
      id: 'additions.export', title: 'Export additions', category: 'Additions', keywords: 'additions symptom notes export file',
      enabled: () => Object.keys(st().rubricNotes).length > 0,
      run: () => downloadBlob(new Blob([additionsFile(st().rubricNotes)], { type: 'application/json' }), `radar-opus-additions-${new Date().toISOString().slice(0, 10)}.json`),
    },
    { id: 'additions.import', title: 'Import additions', category: 'Additions', keywords: 'additions symptom notes import file', run: () => void importAdditions() },
    {
      // case data is saved as it changes; this writes anything still pending at once
      id: 'file.savePatient', title: 'Save patient information', category: 'File', keywords: 'save write store case patient now',
      run: async () => { await flushNow(); actions.toast('Patient information saved', 'success', undefined, 2000) },
    },
    {
      id: 'rubric.removeNote', title: 'Remove a symptom note', category: 'Repertory', keywords: 'delete rubric note additions',
      enabled: () => !!notedRubric(),
      run: () => {
        const ref = notedRubric()
        if (!ref) return
        const text = st().rubricNotes[ref]
        actions.setRubricNote(ref, '')
        actions.toast('Symptom note removed', 'info', { label: 'Undo', run: () => actions.setRubricNote(ref, text) })
      },
    },
    {
      id: 'view.patientAdmin', title: 'Patient administration', category: 'View', keywords: 'patient details demographics',
      enabled: () => !!patientTab(), run: () => showPatient('details'),
    },
    {
      id: 'view.patientConsultations', title: 'Patient consultations', category: 'View', keywords: 'patient consultations visits',
      enabled: () => !!patientTab(), run: () => showPatient('consultations'),
    },
    {
      id: 'tools.tooltips', title: 'Deactivate tooltips', category: 'Tools', keywords: 'tooltips hints hover titles off',
      checked: () => chrome.get().tooltipsOff,
      run: () => {
        const off = !chrome.get().tooltipsOff
        chrome.set({ tooltipsOff: off })
        if (!off) restoreTitles()
      },
    },
    printLike('file.printPreview', 'Print preview'),
    printLike('file.printSetup', 'Print setup'),
    link('help.provings', 'Provings.com', 'https://www.provings.com'),
    link('help.clificol', 'Clificol', 'https://www.clificol.org'),
    link('help.website', 'Visit RadarOpus.com', 'https://www.radaropus.com'),
  ])
}
