import { create } from 'zustand'
import type { RubricRef } from '../data/types'
import type { AnalysisOptions, Clipboard, Symptom, Weight } from '../engine/model'
import { uid } from './ids'
import type { Consultation, Patient, Prescription } from './patients'
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS } from './workspace'
import type { Bookmark, Layout, NewTab, Settings, Tab } from './workspace'

export const CLIPBOARD_COLORS = ['#2f6fdb', '#d9534f', '#2e9e5b', '#e0a100', '#8e44ad', '#16a2b8', '#e8680c', '#6c757d', '#c2185b', '#5d4037', '#00897b', '#7cb342']
export const MAX_CLIPBOARDS = 12

export const DEFAULT_ANALYSIS: AnalysisOptions = {
  strategy: 'sum-symptoms-degrees',
  clipboardIds: [],
  remedyFilter: null,
  excludedRemedies: [],
  minCoverage: 0,
  limit: 30,
}

export function newClipboard(index: number): Clipboard {
  return { id: uid('cb'), name: `Clipboard ${index + 1}`, color: CLIPBOARD_COLORS[index % CLIPBOARD_COLORS.length], symptoms: [] }
}

export function newConsultation(patientId: string, title = 'Consultation'): Consultation {
  const cb = newClipboard(0)
  const now = Date.now()
  return {
    id: uid('c'), patientId, date: new Date(now).toISOString().slice(0, 10), title, kind: 'first',
    complaint: '', notes: '', assessment: '', clipboards: [cb],
    analysis: { ...DEFAULT_ANALYSIS, clipboardIds: [cb.id] }, prescriptions: [], createdAt: now, updatedAt: now,
  }
}

/** The part of state that undo/redo covers (case data). */
export interface CaseData {
  patients: Record<string, Patient>
  consultations: Record<string, Consultation>
}

export interface Toast { id: string; text: string; tone: 'info' | 'success' | 'error'; action?: { label: string; run: () => void } }

export interface AppState extends CaseData {
  hydrated: boolean
  // workspace
  tabs: Tab[]
  activeTabId: string | null
  layout: Layout
  settings: Settings
  bookmarks: Bookmark[]
  rubricNotes: Record<RubricRef, string>
  recentSearches: string[]
  // case focus
  activeConsultationId: string | null
  activeClipboardId: string | null
  selectedSymptomIds: string[]
  // transient UI
  commandPaletteOpen: boolean
  /** Open modal, rendered by shell/DialogHost from the dialog registry. */
  dialog: { kind: string; props?: Record<string, unknown> } | null
  toasts: Toast[]
  // undo
  past: CaseData[]
  future: CaseData[]
}

type Set = (fn: (s: AppState) => Partial<AppState>) => void

const UNDO_LIMIT = 200

/** Apply a case-data mutation and record the previous snapshot for undo. */
function mutateCase(set: Set, fn: (s: AppState) => Partial<CaseData> | null) {
  set(s => {
    const patch = fn(s)
    if (!patch) return {}
    const prev: CaseData = { patients: s.patients, consultations: s.consultations }
    return { ...patch, past: [...s.past.slice(-UNDO_LIMIT + 1), prev], future: [] }
  })
}

function updateConsultation(s: AppState, id: string | null, fn: (c: Consultation) => Consultation | null): Partial<CaseData> | null {
  if (!id) return null
  const c = s.consultations[id]
  if (!c) return null
  const next = fn(c)
  if (!next || next === c) return null
  return { consultations: { ...s.consultations, [id]: { ...next, updatedAt: Date.now() } } }
}

function updateClipboard(s: AppState, clipboardId: string, fn: (cb: Clipboard) => Clipboard): Partial<CaseData> | null {
  const cid = findConsultationOfClipboard(s, clipboardId)
  return updateConsultation(s, cid, c => ({ ...c, clipboards: c.clipboards.map(cb => cb.id === clipboardId ? fn(cb) : cb) }))
}

export function findConsultationOfClipboard(s: Pick<AppState, 'consultations'>, clipboardId: string): string | null {
  for (const c of Object.values(s.consultations)) if (c.clipboards.some(cb => cb.id === clipboardId)) return c.id
  return null
}

export const useApp = create<AppState>(() => ({
  hydrated: false,
  patients: {},
  consultations: {},
  tabs: [],
  activeTabId: null,
  layout: DEFAULT_LAYOUT,
  settings: DEFAULT_SETTINGS,
  bookmarks: [],
  rubricNotes: {},
  recentSearches: [],
  activeConsultationId: null,
  activeClipboardId: null,
  selectedSymptomIds: [],
  commandPaletteOpen: false,
  dialog: null,
  toasts: [],
  past: [],
  future: [],
}))

const set: Set = fn => useApp.setState(fn)
const get = () => useApp.getState()

// ───────────────────────── selectors ─────────────────────────

export const selectActiveConsultation = (s: AppState) => (s.activeConsultationId ? s.consultations[s.activeConsultationId] ?? null : null)
export const selectActiveClipboard = (s: AppState) => {
  const c = selectActiveConsultation(s)
  return c?.clipboards.find(cb => cb.id === s.activeClipboardId) ?? c?.clipboards[0] ?? null
}
export const selectActiveTab = (s: AppState) => s.tabs.find(t => t.id === s.activeTabId) ?? null

// ───────────────────────── actions ─────────────────────────

export const actions = {
  // undo / redo
  undo() {
    set(s => {
      const prev = s.past[s.past.length - 1]
      if (!prev) return {}
      return { ...prev, past: s.past.slice(0, -1), future: [{ patients: s.patients, consultations: s.consultations }, ...s.future] }
    })
  },
  redo() {
    set(s => {
      const next = s.future[0]
      if (!next) return {}
      return { ...next, future: s.future.slice(1), past: [...s.past, { patients: s.patients, consultations: s.consultations }] }
    })
  },

  // toasts
  toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) {
    const t: Toast = { id: uid('t'), text, tone, action }
    set(s => ({ toasts: [...s.toasts.slice(-3), t] }))
    setTimeout(() => actions.dismissToast(t.id), action ? 6000 : 3000)
  },
  dismissToast(id: string) { set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })) },

  // tabs
  openTab(tab: NewTab, opts: { reuse?: boolean } = { reuse: true }) {
    set(s => {
      if (opts.reuse) {
        const existing = s.tabs.find(t => sameTarget(t, tab as Tab))
        if (existing) return { activeTabId: existing.id }
      }
      const t = { ...tab, id: tab.id ?? uid('tab') } as Tab
      const idx = s.tabs.findIndex(x => x.id === s.activeTabId)
      const tabs = [...s.tabs]
      tabs.splice(idx < 0 ? tabs.length : idx + 1, 0, t)
      return { tabs, activeTabId: t.id }
    })
  },
  closeTab(id: string) {
    set(s => {
      const i = s.tabs.findIndex(t => t.id === id)
      if (i < 0 || s.tabs[i].pinned) return {}
      const tabs = s.tabs.filter(t => t.id !== id)
      const activeTabId = s.activeTabId === id ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    })
  },
  closeOtherTabs(id: string) { set(s => ({ tabs: s.tabs.filter(t => t.id === id || t.pinned), activeTabId: id })) },
  activateTab(id: string) { set(() => ({ activeTabId: id })) },
  cycleTab(delta: number) {
    set(s => {
      if (!s.tabs.length) return {}
      const i = s.tabs.findIndex(t => t.id === s.activeTabId)
      return { activeTabId: s.tabs[(i + delta + s.tabs.length) % s.tabs.length].id }
    })
  },
  moveTab(id: string, toIndex: number) {
    set(s => {
      const tabs = [...s.tabs]
      const i = tabs.findIndex(t => t.id === id)
      if (i < 0) return {}
      const [t] = tabs.splice(i, 1)
      tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, t)
      return { tabs }
    })
  },
  togglePinTab(id: string) { set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t) })) },
  updateTab<T extends Tab>(id: string, patch: Partial<T>) {
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? ({ ...t, ...patch } as Tab) : t) }))
  },

  /** Navigate a repertory tab to a rubric, recording history. */
  navigateRubric(tabId: string, rubric: number) {
    set(s => ({
      tabs: s.tabs.map(t => {
        if (t.id !== tabId || t.kind !== 'repertory' || t.rubric === rubric) return t
        return { ...t, rubric, back: [...t.back.slice(-99), t.rubric], forward: [] }
      }),
    }))
  },
  historyBack(tabId: string) {
    set(s => ({
      tabs: s.tabs.map(t => {
        if (t.id !== tabId || t.kind !== 'repertory' || !t.back.length) return t
        return { ...t, rubric: t.back[t.back.length - 1], back: t.back.slice(0, -1), forward: [t.rubric, ...t.forward] }
      }),
    }))
  },
  historyForward(tabId: string) {
    set(s => ({
      tabs: s.tabs.map(t => {
        if (t.id !== tabId || t.kind !== 'repertory' || !t.forward.length) return t
        return { ...t, rubric: t.forward[0], forward: t.forward.slice(1), back: [...t.back, t.rubric] }
      }),
    }))
  },

  // layout & settings
  setLayout(patch: Partial<Layout>) { set(s => ({ layout: { ...s.layout, ...patch } })) },
  setSettings(patch: Partial<Settings>) { set(s => ({ settings: { ...s.settings, ...patch } })) },
  setCommandPalette(open: boolean) { set(() => ({ commandPaletteOpen: open })) },
  openDialog(kind: string, props?: Record<string, unknown>) { set(() => ({ dialog: { kind, props }, commandPaletteOpen: false })) },
  closeDialog() { set(() => ({ dialog: null })) },
  addRecentSearch(q: string) {
    const t = q.trim()
    if (t) set(s => ({ recentSearches: [t, ...s.recentSearches.filter(x => x !== t)].slice(0, 20) }))
  },

  // bookmarks & notes
  addBookmark(ref: RubricRef, label: string, folder = 'General') {
    set(s => s.bookmarks.some(b => b.ref === ref) ? {} : { bookmarks: [...s.bookmarks, { id: uid('bm'), ref, label, folder, createdAt: Date.now() }] })
  },
  removeBookmark(id: string) { set(s => ({ bookmarks: s.bookmarks.filter(b => b.id !== id) })) },
  updateBookmark(id: string, patch: Partial<Bookmark>) { set(s => ({ bookmarks: s.bookmarks.map(b => b.id === id ? { ...b, ...patch } : b) })) },
  setRubricNote(ref: RubricRef, text: string) {
    set(s => {
      const rubricNotes = { ...s.rubricNotes }
      if (text.trim()) rubricNotes[ref] = text
      else delete rubricNotes[ref]
      return { rubricNotes }
    })
  },

  // patients
  createPatient(p: Partial<Patient> = {}): string {
    const now = Date.now()
    const patient: Patient = {
      id: uid('p'), firstName: '', lastName: '', birthDate: null, sex: null, email: '', phone: '', address: '',
      occupation: '', notes: '', tags: [], createdAt: now, updatedAt: now, ...p,
    }
    mutateCase(set, s => ({ patients: { ...s.patients, [patient.id]: patient } }))
    return patient.id
  },
  updatePatient(id: string, patch: Partial<Patient>) {
    mutateCase(set, s => s.patients[id] ? { patients: { ...s.patients, [id]: { ...s.patients[id], ...patch, updatedAt: Date.now() } } } : null)
  },
  deletePatient(id: string) {
    mutateCase(set, s => {
      if (!s.patients[id]) return null
      const patients = { ...s.patients }
      delete patients[id]
      const consultations = Object.fromEntries(Object.entries(s.consultations).filter(([, c]) => c.patientId !== id))
      return { patients, consultations }
    })
    set(s => s.activeConsultationId && !s.consultations[s.activeConsultationId] ? { activeConsultationId: null, activeClipboardId: null } : {})
  },
  /** Insert (or replace) whole patients and consultations in one undo step (import, duplicate, restore). */
  insertCaseData(patients: Patient[], consultations: Consultation[]) {
    if (!patients.length && !consultations.length) return
    mutateCase(set, s => ({
      patients: { ...s.patients, ...Object.fromEntries(patients.map(p => [p.id, p])) },
      consultations: { ...s.consultations, ...Object.fromEntries(consultations.map(c => [c.id, c])) },
    }))
  },

  // consultations
  createConsultation(patientId: string, patch: Partial<Consultation> = {}): string {
    const c = { ...newConsultation(patientId), ...patch }
    mutateCase(set, s => ({ consultations: { ...s.consultations, [c.id]: c } }))
    actions.setActiveConsultation(c.id)
    return c.id
  },
  updateConsultation(id: string, patch: Partial<Consultation>) {
    mutateCase(set, s => updateConsultation(s, id, c => ({ ...c, ...patch })))
  },
  deleteConsultation(id: string) {
    mutateCase(set, s => {
      if (!s.consultations[id]) return null
      const consultations = { ...s.consultations }
      delete consultations[id]
      return { consultations }
    })
    set(s => s.activeConsultationId === id ? { activeConsultationId: null, activeClipboardId: null } : {})
  },
  setActiveConsultation(id: string | null) {
    set(s => ({ activeConsultationId: id, activeClipboardId: id ? s.consultations[id]?.clipboards[0]?.id ?? null : null, selectedSymptomIds: [] }))
  },

  // clipboards
  setActiveClipboard(id: string) { set(() => ({ activeClipboardId: id, selectedSymptomIds: [] })) },
  addClipboard(): string | null {
    const s = get()
    const c = selectActiveConsultation(s)
    if (!c || c.clipboards.length >= MAX_CLIPBOARDS) return null
    const cb = newClipboard(c.clipboards.length)
    mutateCase(set, st => updateConsultation(st, c.id, x => ({ ...x, clipboards: [...x.clipboards, cb], analysis: { ...x.analysis, clipboardIds: [...x.analysis.clipboardIds, cb.id] } })))
    set(() => ({ activeClipboardId: cb.id }))
    return cb.id
  },
  renameClipboard(id: string, name: string) { mutateCase(set, s => updateClipboard(s, id, cb => ({ ...cb, name }))) },
  recolorClipboard(id: string, color: string) { mutateCase(set, s => updateClipboard(s, id, cb => cb.color === color ? cb : ({ ...cb, color }))) },
  clearClipboard(id: string) { mutateCase(set, s => updateClipboard(s, id, cb => ({ ...cb, symptoms: [] }))) },
  deleteClipboard(id: string) {
    mutateCase(set, s => updateConsultation(s, findConsultationOfClipboard(s, id), c => c.clipboards.length <= 1 ? null : ({
      ...c, clipboards: c.clipboards.filter(cb => cb.id !== id), analysis: { ...c.analysis, clipboardIds: c.analysis.clipboardIds.filter(x => x !== id) },
    })))
    set(s => s.activeClipboardId === id ? { activeClipboardId: selectActiveConsultation(s)?.clipboards[0]?.id ?? null } : {})
  },

  // symptoms
  /** Add rubrics to a clipboard (active one by default); skips rubrics already there. Returns number added. */
  addRubrics(refs: RubricRef[], opts: { clipboardId?: string; weight?: Weight } = {}): number {
    const s = get()
    const cbId = opts.clipboardId ?? selectActiveClipboard(s)?.id
    if (!cbId) return 0
    let added = 0
    mutateCase(set, st => updateClipboard(st, cbId, cb => {
      const have = new Set(cb.symptoms.flatMap(x => x.rubrics.length === 1 ? x.rubrics : []))
      const fresh: Symptom[] = refs.filter(r => !have.has(r)).map(r => ({
        id: uid('s'), rubrics: [r], combine: 'union', weight: opts.weight ?? 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: Date.now(),
      }))
      added = fresh.length
      return fresh.length ? { ...cb, symptoms: [...cb.symptoms, ...fresh] } : cb
    }))
    return added
  },
  /** Add one fully specified symptom (take with options, combined sub-rubrics) in one undo step. Returns its id. */
  addSymptom(clipboardId: string, fields: Partial<Omit<Symptom, 'id' | 'addedAt'>> & { rubrics: RubricRef[] }): string | null {
    const sym: Symptom = { combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, ...fields, id: uid('s'), addedAt: Date.now() }
    let ok = false
    mutateCase(set, st => updateClipboard(st, clipboardId, cb => { ok = true; return { ...cb, symptoms: [...cb.symptoms, sym] } }))
    return ok ? sym.id : null
  },
  updateSymptom(clipboardId: string, symptomId: string, patch: Partial<Symptom>) {
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => ({ ...cb, symptoms: cb.symptoms.map(x => x.id === symptomId ? { ...x, ...patch } : x) })))
  },
  removeSymptoms(clipboardId: string, symptomIds: string[]) {
    const ids = new Set(symptomIds)
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => ({ ...cb, symptoms: cb.symptoms.filter(x => !ids.has(x.id)) })))
    set(s => ({ selectedSymptomIds: s.selectedSymptomIds.filter(x => !ids.has(x)) }))
  },
  moveSymptom(clipboardId: string, symptomId: string, toIndex: number) {
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => {
      const list = [...cb.symptoms]
      const i = list.findIndex(x => x.id === symptomId)
      if (i < 0) return cb
      const [x] = list.splice(i, 1)
      list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, x)
      return { ...cb, symptoms: list }
    }))
  },
  /** Move or copy symptoms to another clipboard of the same consultation. */
  transferSymptoms(fromId: string, toId: string, symptomIds: string[], copy: boolean) {
    const ids = new Set(symptomIds)
    mutateCase(set, s => {
      const cid = findConsultationOfClipboard(s, fromId)
      return updateConsultation(s, cid, c => {
        const from = c.clipboards.find(cb => cb.id === fromId)
        if (!from || fromId === toId) return null
        const moving = from.symptoms.filter(x => ids.has(x.id)).map(x => copy ? { ...x, id: uid('s') } : x)
        return {
          ...c,
          clipboards: c.clipboards.map(cb => {
            if (cb.id === toId) return { ...cb, symptoms: [...cb.symptoms, ...moving] }
            if (cb.id === fromId && !copy) return { ...cb, symptoms: cb.symptoms.filter(x => !ids.has(x.id)) }
            return cb
          }),
        }
      })
    })
  },
  /** Combine several symptoms into one (rubrics merged). */
  combineSymptoms(clipboardId: string, symptomIds: string[], mode: 'union' | 'intersection') {
    if (symptomIds.length < 2) return
    const ids = new Set(symptomIds)
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => {
      const parts = cb.symptoms.filter(x => ids.has(x.id))
      const first = cb.symptoms.findIndex(x => ids.has(x.id))
      const merged: Symptom = {
        ...parts[0], id: uid('s'), rubrics: [...new Set(parts.flatMap(p => p.rubrics))], combine: mode,
        weight: Math.max(...parts.map(p => p.weight)) as Weight, eliminatory: parts.some(p => p.eliminatory), causal: parts.some(p => p.causal),
      }
      const rest = cb.symptoms.filter(x => !ids.has(x.id))
      rest.splice(first, 0, merged)
      return { ...cb, symptoms: rest }
    }))
    set(() => ({ selectedSymptomIds: [] }))
  },
  splitSymptom(clipboardId: string, symptomId: string) {
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => {
      const i = cb.symptoms.findIndex(x => x.id === symptomId)
      const sym = cb.symptoms[i]
      if (!sym || sym.rubrics.length < 2) return cb
      const parts = sym.rubrics.map(r => ({ ...sym, id: uid('s'), rubrics: [r], combine: 'union' as const }))
      const list = [...cb.symptoms]
      list.splice(i, 1, ...parts)
      return { ...cb, symptoms: list }
    }))
  },
  setSelectedSymptoms(ids: string[]) { set(() => ({ selectedSymptomIds: ids })) },
  /** Patch several symptoms in one undo step; patch may be a function of the symptom. */
  updateSymptoms(clipboardId: string, symptomIds: string[], patch: Partial<Symptom> | ((s: Symptom) => Partial<Symptom>)) {
    const ids = new Set(symptomIds)
    if (!ids.size) return
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => ({
      ...cb, symptoms: cb.symptoms.map(x => ids.has(x.id) ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x),
    })))
  },
  /** Reorder a clipboard to the given id order (ids not listed keep their relative order at the end). */
  reorderSymptoms(clipboardId: string, orderedIds: string[]) {
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => {
      const byId = new Map(cb.symptoms.map(x => [x.id, x]))
      const seen = new Set<string>()
      const list: Symptom[] = []
      for (const id of orderedIds) { const x = byId.get(id); if (x && !seen.has(id)) { list.push(x); seen.add(id) } }
      for (const x of cb.symptoms) if (!seen.has(x.id)) list.push(x)
      return list.every((x, i) => x === cb.symptoms[i]) ? cb : { ...cb, symptoms: list }
    }))
  },
  /** Re-insert symptoms at positions (used to undo a removal without touching later edits). */
  insertSymptoms(clipboardId: string, items: { symptom: Symptom; index: number }[]) {
    mutateCase(set, s => updateClipboard(s, clipboardId, cb => {
      const list = cb.symptoms.filter(x => !items.some(it => it.symptom.id === x.id))
      for (const it of [...items].sort((a, b) => a.index - b.index)) list.splice(Math.min(it.index, list.length), 0, it.symptom)
      return { ...cb, symptoms: list }
    }))
  },

  // analysis options
  setAnalysis(consultationId: string, patch: Partial<AnalysisOptions>) {
    mutateCase(set, s => updateConsultation(s, consultationId, c => ({ ...c, analysis: { ...c.analysis, ...patch } })))
  },

  // prescriptions
  addPrescription(consultationId: string, p: Omit<Prescription, 'id'>) {
    mutateCase(set, s => updateConsultation(s, consultationId, c => ({ ...c, prescriptions: [...c.prescriptions, { ...p, id: uid('rx') }] })))
  },
  removePrescription(consultationId: string, id: string) {
    mutateCase(set, s => updateConsultation(s, consultationId, c => ({ ...c, prescriptions: c.prescriptions.filter(p => p.id !== id) })))
  },
}

function sameTarget(a: Tab, b: Tab): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'repertory': return false
    case 'repertories': return true
    case 'analysis': return a.consultationId === (b as typeof a).consultationId
    case 'materia-medica': return true
    case 'remedy': return a.remedyId === (b as typeof a).remedyId
    case 'patients': return true
    case 'patient': return a.patientId === (b as typeof a).patientId
    case 'search': return false
    case 'families': return true
  }
}
