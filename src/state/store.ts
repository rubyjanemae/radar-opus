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
    analysis: { ...DEFAULT_ANALYSIS, ...analysisDefaults(), clipboardIds: [cb.id] }, prescriptions: [], createdAt: now, updatedAt: now,
  }
}

/** Analysis defaults for new consultations from the user's settings. */
function analysisDefaults(): Partial<AnalysisOptions> {
  const st = useApp.getState().settings
  return { strategy: st.defaultStrategy ?? DEFAULT_ANALYSIS.strategy, limit: st.analysisLimit ?? DEFAULT_ANALYSIS.limit }
}

/** The part of state that undo/redo covers (case data). */
export interface CaseData {
  patients: Record<string, Patient>
  consultations: Record<string, Consultation>
}

export interface Toast { id: string; text: string; tone: 'info' | 'success' | 'error'; action?: { label: string; run: () => void } }

/** A tab closed by an undoable step, with its position, so undo can reopen it. */
export interface ClosedTab { tab: Tab; index: number }

/**
 * One undo step: the case data before the step, the case focus at that moment and a
 * human label ("Take rubric"). Tabs the step closed are reopened on undo and closed again on redo.
 */
export interface HistoryEntry extends CaseData {
  label: string
  activeConsultationId: string | null
  activeClipboardId: string | null
  activeTabId?: string | null
  closedTabs?: ClosedTab[]
}

export interface AppState extends CaseData {
  hydrated: boolean
  // workspace
  tabs: Tab[]
  activeTabId: string | null
  layout: Layout
  settings: Settings
  bookmarks: Bookmark[]
  rubricNotes: Record<RubricRef, string>
  /** User notes per remedy id (remedy information window › Sources & notes). */
  remedyNotes: Record<number, string>
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
  past: HistoryEntry[]
  future: HistoryEntry[]
}

type Set = (fn: (s: AppState) => Partial<AppState>) => void

const UNDO_LIMIT = 200

/** What a case mutation may change besides case data: focus and tabs it closes (recorded for undo). */
type CasePatch = Partial<CaseData> & Partial<Pick<AppState, 'activeConsultationId' | 'activeClipboardId' | 'selectedSymptomIds' | 'tabs' | 'activeTabId'>> & { closedTabs?: ClosedTab[] }

function historyEntry(s: AppState, label: string): HistoryEntry {
  return { label, patients: s.patients, consultations: s.consultations, activeConsultationId: s.activeConsultationId, activeClipboardId: s.activeClipboardId, activeTabId: s.activeTabId }
}

// Transactions: while depth > 0 every case mutation collapses into one history entry.
let txDepth = 0
let txBase: HistoryEntry | null = null
let txPushed = false
let txLabel: string | undefined

/** Hooks run for every tab removed by closeTab / closeOtherTabs / case deletions (features prune per-tab maps). */
const tabClosedHooks = new Set<(tab: Tab) => void>()
/** Register a hook called with each closed tab; returns an unregister function. */
export function onTabClosed(fn: (tab: Tab) => void): () => void { tabClosedHooks.add(fn); return () => { tabClosedHooks.delete(fn) } }
function notifyTabsClosed(tabs: Tab[]) {
  for (const t of tabs) for (const fn of tabClosedHooks) { try { fn(t) } catch (e) { console.error(e) } }
}

/**
 * Apply a case-data mutation and record the previous snapshot (case data + focus) for undo.
 * `fn` returns null when nothing changes: no history entry, no updatedAt bump. Returns whether it applied.
 */
function mutateCase(label: string, fn: (s: AppState) => CasePatch | null): boolean {
  let closed: ClosedTab[] = []
  let applied = false
  useApp.setState(s => {
    const patch = fn(s)
    if (!patch) return {}
    applied = true
    const { closedTabs, ...rest } = patch
    closed = closedTabs ?? []
    if (txDepth > 0) {
      if (!txPushed) {
        txPushed = true
        const entry: HistoryEntry = { ...(txBase ?? historyEntry(s, label)), label: txLabel ?? label, ...(closed.length ? { closedTabs: closed } : {}) }
        return { ...rest, past: [...s.past.slice(-UNDO_LIMIT + 1), entry], future: [] }
      }
      if (!closed.length) return { ...rest, future: [] }
      const last = s.past[s.past.length - 1]
      const merged: HistoryEntry = { ...last, closedTabs: [...(last.closedTabs ?? []), ...closed] }
      return { ...rest, past: [...s.past.slice(0, -1), merged], future: [] }
    }
    const entry: HistoryEntry = { ...historyEntry(s, label), ...(closed.length ? { closedTabs: closed } : {}) }
    return { ...rest, past: [...s.past.slice(-UNDO_LIMIT + 1), entry], future: [] }
  })
  if (closed.length) notifyTabsClosed(closed.map(c => c.tab))
  return applied
}

/** Structural equality for patch values (plain objects and arrays, compared deeply). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined)
    const kb = Object.keys(b).filter(k => (b as Record<string, unknown>)[k] !== undefined)
    return ka.length === kb.length && ka.every(k => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** `{ ...obj, ...patch }`, or `obj` itself when the patch changes nothing. */
function applyPatch<T extends object>(obj: T, patch: Partial<T>): T {
  for (const k of Object.keys(patch) as (keyof T)[]) if (!sameValue(obj[k], patch[k])) return { ...obj, ...patch }
  return obj
}

/** Latest consultation of a patient (date, then creation), used when the active one goes away. */
function latestConsultationOf(consultations: Record<string, Consultation>, patientId: string, except?: string): Consultation | null {
  let best: Consultation | null = null
  for (const c of Object.values(consultations)) {
    if (c.patientId !== patientId || c.id === except) continue
    if (!best || c.date > best.date || (c.date === best.date && c.createdAt > best.createdAt)) best = c
  }
  return best
}

/** Remove tabs matching `pred` (pinned too: they point at deleted records), recording them for undo. */
function closeTabsWhere(s: AppState, pred: (t: Tab) => boolean): Pick<CasePatch, 'tabs' | 'activeTabId' | 'closedTabs'> {
  const closedTabs: ClosedTab[] = []
  s.tabs.forEach((tab, index) => { if (pred(tab)) closedTabs.push({ tab, index }) })
  if (!closedTabs.length) return {}
  const tabs = s.tabs.filter(t => !pred(t))
  let activeTabId = s.activeTabId
  if (activeTabId && !tabs.some(t => t.id === activeTabId)) {
    const i = s.tabs.findIndex(t => t.id === activeTabId)
    activeTabId = tabs[Math.min(i, tabs.length - 1)]?.id ?? null
  }
  return { tabs, activeTabId, closedTabs }
}

/** Focus after restoring case data: keep the recorded ids when they still exist. */
function restoreFocus(consultations: Record<string, Consultation>, consultationId: string | null, clipboardId: string | null) {
  const c = consultationId ? consultations[consultationId] : undefined
  if (!c) return { activeConsultationId: null, activeClipboardId: null }
  return { activeConsultationId: c.id, activeClipboardId: c.clipboards.some(cb => cb.id === clipboardId) ? clipboardId : c.clipboards[0]?.id ?? null }
}

function updateConsultation(s: AppState, id: string | null, fn: (c: Consultation) => Consultation | null): Partial<CaseData> | null {
  if (!id) return null
  const c = s.consultations[id]
  if (!c) return null
  const next = fn(c)
  if (!next || next === c) return null
  return { consultations: { ...s.consultations, [id]: { ...next, updatedAt: Date.now() } } }
}

/** Update one clipboard; returns null (no history, no updatedAt bump) when `fn` returns the clipboard unchanged. */
function updateClipboard(s: AppState, clipboardId: string, fn: (cb: Clipboard) => Clipboard): Partial<CaseData> | null {
  const cid = findConsultationOfClipboard(s, clipboardId)
  return updateConsultation(s, cid, c => {
    let changed = false
    const clipboards = c.clipboards.map(cb => {
      if (cb.id !== clipboardId) return cb
      const next = fn(cb)
      if (next !== cb) changed = true
      return next
    })
    return changed ? { ...c, clipboards } : c
  })
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
  remedyNotes: {},
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

// ───────────────────────── toasts ─────────────────────────

const TOAST_MS = { plain: 3000, action: 6000 }
/** Auto-dismiss timers; paused while the toast region is hovered or holds focus. */
const toastTimers = new Map<string, { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }>()
let toastsPaused = false

function armToast(id: string) {
  const t = toastTimers.get(id)
  if (!t || toastsPaused) return
  t.startedAt = Date.now()
  t.handle = setTimeout(() => actions.dismissToast(id), t.remaining)
}

/** Symptoms describe the same rubric set (order-independent). */
function rubricKey(sym: Symptom): string { return [...sym.rubrics].sort().join('|') }

// ───────────────────────── actions ─────────────────────────

export const actions = {
  /**
   * Run `fn` as one undo step: every case mutation inside collapses into a single history entry
   * (labelled `label`, or the first mutation's label). Nested transactions join the outer one.
   */
  transaction<T>(fn: () => T, label?: string): T {
    if (txDepth === 0) { txBase = historyEntry(get(), label ?? ''); txPushed = false; txLabel = label }
    txDepth++
    try {
      return fn()
    } finally {
      txDepth--
      if (txDepth === 0) { txBase = null; txPushed = false; txLabel = undefined }
    }
  },

  // undo / redo
  undo() {
    const s = get()
    const entry = s.past[s.past.length - 1]
    if (!entry) return
    const redo: HistoryEntry = { ...historyEntry(s, entry.label), ...(entry.closedTabs ? { closedTabs: entry.closedTabs } : {}) }
    let tabs = s.tabs
    let activeTabId = s.activeTabId
    if (entry.closedTabs?.length) {
      tabs = [...tabs]
      for (const { tab, index } of [...entry.closedTabs].sort((a, b) => a.index - b.index)) {
        if (!tabs.some(t => t.id === tab.id)) tabs.splice(Math.min(index, tabs.length), 0, tab)
      }
      if (entry.activeTabId && tabs.some(t => t.id === entry.activeTabId)) activeTabId = entry.activeTabId
    }
    const focus = restoreFocus(entry.consultations, entry.activeConsultationId, entry.activeClipboardId)
    set(() => ({
      patients: entry.patients, consultations: entry.consultations, ...focus, tabs, activeTabId,
      selectedSymptomIds: focus.activeClipboardId === s.activeClipboardId ? s.selectedSymptomIds : [],
      past: s.past.slice(0, -1), future: [redo, ...s.future],
    }))
    actions.toast(`Undone: ${entry.label || 'last change'}`, 'info', undefined, 2000)
  },
  redo() {
    const s = get()
    const entry = s.future[0]
    if (!entry) return
    const undo: HistoryEntry = { ...historyEntry(s, entry.label), ...(entry.closedTabs ? { closedTabs: entry.closedTabs } : {}) }
    const closing = new Set((entry.closedTabs ?? []).map(c => c.tab.id))
    const closeTabs = closing.size ? closeTabsWhere(s, t => closing.has(t.id)) : {}
    const focus = restoreFocus(entry.consultations, entry.activeConsultationId, entry.activeClipboardId)
    set(() => ({
      patients: entry.patients, consultations: entry.consultations, ...focus,
      ...(closeTabs.tabs ? { tabs: closeTabs.tabs, activeTabId: closeTabs.activeTabId } : {}),
      selectedSymptomIds: focus.activeClipboardId === s.activeClipboardId ? s.selectedSymptomIds : [],
      future: s.future.slice(1), past: [...s.past, undo],
    }))
    if (closeTabs.closedTabs) notifyTabsClosed(closeTabs.closedTabs.map(c => c.tab))
    actions.toast(`Redone: ${entry.label || 'change'}`, 'info', undefined, 2000)
  },

  // toasts
  toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action'], durationMs?: number) {
    const t: Toast = { id: uid('t'), text, tone, action }
    const dropped = get().toasts.slice(0, -3)
    set(s => ({ toasts: [...s.toasts.slice(-3), t] }))
    for (const d of dropped) { const tm = toastTimers.get(d.id); if (tm?.handle) clearTimeout(tm.handle); toastTimers.delete(d.id) }
    toastTimers.set(t.id, { handle: null, remaining: durationMs ?? (action ? TOAST_MS.action : TOAST_MS.plain), startedAt: 0 })
    armToast(t.id)
  },
  dismissToast(id: string) {
    const tm = toastTimers.get(id)
    if (tm?.handle) clearTimeout(tm.handle)
    toastTimers.delete(id)
    set(s => s.toasts.some(t => t.id === id) ? { toasts: s.toasts.filter(t => t.id !== id) } : {})
  },
  /** Hold auto-dismiss while the pointer or focus is on the toasts (resume continues the remaining time). */
  pauseToasts(paused: boolean) {
    if (paused === toastsPaused) return
    toastsPaused = paused
    for (const [id, tm] of toastTimers) {
      if (paused) {
        if (tm.handle) { clearTimeout(tm.handle); tm.handle = null; tm.remaining = Math.max(800, tm.remaining - (Date.now() - tm.startedAt)) }
      } else armToast(id)
    }
  },

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
    let closed: Tab | null = null
    set(s => {
      const i = s.tabs.findIndex(t => t.id === id)
      if (i < 0 || s.tabs[i].pinned) return {}
      closed = s.tabs[i]
      const tabs = s.tabs.filter(t => t.id !== id)
      const activeTabId = s.activeTabId === id ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    })
    if (closed) notifyTabsClosed([closed])
  },
  closeOtherTabs(id: string) {
    const closed = get().tabs.filter(t => t.id !== id && !t.pinned)
    set(s => ({ tabs: s.tabs.filter(t => t.id === id || t.pinned), activeTabId: id }))
    notifyTabsClosed(closed)
  },
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
  setRemedyNote(remedyId: number, text: string) {
    set(s => {
      const remedyNotes = { ...s.remedyNotes }
      if (text.trim()) remedyNotes[remedyId] = text
      else delete remedyNotes[remedyId]
      return { remedyNotes }
    })
  },
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
    mutateCase('New patient', s => ({ patients: { ...s.patients, [patient.id]: patient } }))
    return patient.id
  },
  updatePatient(id: string, patch: Partial<Patient>) {
    mutateCase('Edit patient', s => {
      const cur = s.patients[id]
      if (!cur) return null
      const next = applyPatch(cur, patch)
      return next === cur ? null : { patients: { ...s.patients, [id]: { ...next, updatedAt: Date.now() } } }
    })
  },
  /** Delete a patient with all consultations; closes their tabs (reopened by undo) and clears the case focus if it was theirs. */
  deletePatient(id: string) {
    mutateCase('Delete patient', s => {
      if (!s.patients[id]) return null
      const patients = { ...s.patients }
      delete patients[id]
      const gone = new Set(Object.values(s.consultations).filter(c => c.patientId === id).map(c => c.id))
      const consultations = Object.fromEntries(Object.entries(s.consultations).filter(([cid]) => !gone.has(cid)))
      const tabPatch = closeTabsWhere(s, t => (t.kind === 'patient' && t.patientId === id) || (t.kind === 'analysis' && gone.has(t.consultationId)))
      const focusGone = !!s.activeConsultationId && gone.has(s.activeConsultationId)
      return {
        patients, consultations, ...tabPatch,
        ...(focusGone ? { activeConsultationId: null, activeClipboardId: null, selectedSymptomIds: [] } : {}),
      }
    })
  },
  /** Insert (or replace) whole patients and consultations in one undo step (import, duplicate, restore). */
  insertCaseData(patients: Patient[], consultations: Consultation[], label = 'Add case data') {
    if (!patients.length && !consultations.length) return
    mutateCase(label, s => ({
      patients: { ...s.patients, ...Object.fromEntries(patients.map(p => [p.id, p])) },
      consultations: { ...s.consultations, ...Object.fromEntries(consultations.map(c => [c.id, c])) },
    }))
  },

  // consultations
  createConsultation(patientId: string, patch: Partial<Consultation> = {}): string {
    const c = { ...newConsultation(patientId), ...patch }
    mutateCase(c.kind === 'follow-up' ? 'New follow-up' : 'New consultation', s => ({
      consultations: { ...s.consultations, [c.id]: c },
      activeConsultationId: c.id, activeClipboardId: c.clipboards[0]?.id ?? null, selectedSymptomIds: [],
    }))
    return c.id
  },
  updateConsultation(id: string, patch: Partial<Consultation>) {
    mutateCase('Edit consultation', s => updateConsultation(s, id, c => applyPatch(c, patch)))
  },
  /** Delete a consultation; if it was the active case, the patient's latest remaining consultation becomes active. */
  deleteConsultation(id: string) {
    mutateCase('Delete consultation', s => {
      const c = s.consultations[id]
      if (!c) return null
      const consultations = { ...s.consultations }
      delete consultations[id]
      const tabPatch = closeTabsWhere(s, t => t.kind === 'analysis' && t.consultationId === id)
      if (s.activeConsultationId !== id) return { consultations, ...tabPatch }
      const next = latestConsultationOf(consultations, c.patientId)
      return { consultations, ...tabPatch, activeConsultationId: next?.id ?? null, activeClipboardId: next?.clipboards[0]?.id ?? null, selectedSymptomIds: [] }
    })
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
    const ok = mutateCase('Add clipboard', st => {
      const patch = updateConsultation(st, c.id, x => ({ ...x, clipboards: [...x.clipboards, cb], analysis: { ...x.analysis, clipboardIds: [...x.analysis.clipboardIds, cb.id] } }))
      return patch && { ...patch, activeClipboardId: cb.id, selectedSymptomIds: [] }
    })
    return ok ? cb.id : null
  },
  renameClipboard(id: string, name: string) { mutateCase('Rename clipboard', s => updateClipboard(s, id, cb => cb.name === name ? cb : ({ ...cb, name }))) },
  recolorClipboard(id: string, color: string) { mutateCase('Change clipboard colour', s => updateClipboard(s, id, cb => cb.color === color ? cb : ({ ...cb, color }))) },
  clearClipboard(id: string) { mutateCase('Clear clipboard', s => updateClipboard(s, id, cb => cb.symptoms.length ? ({ ...cb, symptoms: [] }) : cb)) },
  deleteClipboard(id: string) {
    mutateCase('Delete clipboard', s => {
      const patch = updateConsultation(s, findConsultationOfClipboard(s, id), c => c.clipboards.length <= 1 ? null : ({
        ...c, clipboards: c.clipboards.filter(cb => cb.id !== id), analysis: { ...c.analysis, clipboardIds: c.analysis.clipboardIds.filter(x => x !== id) },
      }))
      if (!patch) return null
      if (s.activeClipboardId !== id) return patch
      const active = s.activeConsultationId ? patch.consultations?.[s.activeConsultationId] : undefined
      return { ...patch, activeClipboardId: active?.clipboards[0]?.id ?? null, selectedSymptomIds: [] }
    })
  },
  /** Empty several clipboards in one undoable step. */
  clearClipboards(ids: string[]) {
    mutateCase(ids.length === 1 ? 'Clear clipboard' : 'Clear clipboards', s => {
      let consultations = s.consultations
      for (const id of ids) {
        const p = updateClipboard({ ...s, consultations }, id, cb => cb.symptoms.length ? { ...cb, symptoms: [] } : cb)
        if (p?.consultations) consultations = p.consultations
      }
      return consultations === s.consultations ? null : { consultations }
    })
  },
  /** Put a deleted clipboard back at its position (targeted undo of deleteClipboard). Returns false when it cannot be restored. */
  restoreClipboard(consultationId: string, clipboard: Clipboard, index: number, inAnalysis: boolean): boolean {
    const c = get().consultations[consultationId]
    if (!c || c.clipboards.length >= MAX_CLIPBOARDS || c.clipboards.some(cb => cb.id === clipboard.id)) return false
    mutateCase('Restore clipboard', s => updateConsultation(s, consultationId, x => {
      const clipboards = [...x.clipboards]
      clipboards.splice(Math.min(index, clipboards.length), 0, clipboard)
      const ids = inAnalysis ? [...x.analysis.clipboardIds, clipboard.id] : x.analysis.clipboardIds
      return { ...x, clipboards, analysis: { ...x.analysis, clipboardIds: clipboards.map(cb => cb.id).filter(id => ids.includes(id)) } }
    }))
    return true
  },

  // symptoms
  /** Add rubrics to a clipboard (active one by default); skips rubrics already there. Returns number added. */
  addRubrics(refs: RubricRef[], opts: { clipboardId?: string; weight?: Weight } = {}): number {
    const s = get()
    const cbId = opts.clipboardId ?? selectActiveClipboard(s)?.id
    if (!cbId) return 0
    let added = 0
    mutateCase(refs.length === 1 ? 'Take rubric' : `Take ${refs.length} rubrics`, st => updateClipboard(st, cbId, cb => {
      const have = new Set(cb.symptoms.flatMap(x => x.rubrics.length === 1 ? x.rubrics : []))
      const fresh: Symptom[] = [...new Set(refs)].filter(r => !have.has(r)).map(r => ({
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
    const ok = mutateCase('Take symptom', st => updateClipboard(st, clipboardId, cb => ({ ...cb, symptoms: [...cb.symptoms, sym] })))
    return ok ? sym.id : null
  },
  updateSymptom(clipboardId: string, symptomId: string, patch: Partial<Symptom>) {
    actions.updateSymptoms(clipboardId, [symptomId], patch)
  },
  removeSymptoms(clipboardId: string, symptomIds: string[]) {
    const ids = new Set(symptomIds)
    mutateCase(ids.size === 1 ? 'Remove symptom' : `Remove ${ids.size} symptoms`, s => updateClipboard(s, clipboardId, cb => {
      const symptoms = cb.symptoms.filter(x => !ids.has(x.id))
      return symptoms.length === cb.symptoms.length ? cb : { ...cb, symptoms }
    }))
    set(s => ({ selectedSymptomIds: s.selectedSymptomIds.filter(x => !ids.has(x)) }))
  },
  moveSymptom(clipboardId: string, symptomId: string, toIndex: number) {
    mutateCase('Move symptom', s => updateClipboard(s, clipboardId, cb => {
      const list = [...cb.symptoms]
      const i = list.findIndex(x => x.id === symptomId)
      if (i < 0) return cb
      const [x] = list.splice(i, 1)
      const to = Math.max(0, Math.min(toIndex, list.length))
      if (to === i) return cb
      list.splice(to, 0, x)
      return { ...cb, symptoms: list }
    }))
  },
  /**
   * Move or copy symptoms to another clipboard of the same consultation. Symptoms whose rubric set is
   * already in the target are not duplicated: skipped when copying, merged (removed from the source) when moving.
   */
  transferSymptoms(fromId: string, toId: string, symptomIds: string[], copy: boolean): { transferred: number; skipped: number } {
    const ids = new Set(symptomIds)
    let transferred = 0, skipped = 0, targetName = ''
    mutateCase(copy ? 'Copy symptoms' : 'Move symptoms', s => {
      const cid = findConsultationOfClipboard(s, fromId)
      return updateConsultation(s, cid, c => {
        const from = c.clipboards.find(cb => cb.id === fromId)
        const to = c.clipboards.find(cb => cb.id === toId)
        if (!from || !to || fromId === toId) return null
        targetName = to.name
        const have = new Set(to.symptoms.map(rubricKey))
        const moving = from.symptoms.filter(x => ids.has(x.id))
        const fresh: Symptom[] = []
        for (const x of moving) {
          const k = rubricKey(x)
          if (have.has(k)) continue
          have.add(k)
          fresh.push(copy ? { ...x, id: uid('s') } : x)
        }
        transferred = fresh.length
        skipped = moving.length - fresh.length
        if (!moving.length || (copy && !fresh.length)) return null
        return {
          ...c,
          clipboards: c.clipboards.map(cb => {
            if (cb.id === toId) return fresh.length ? { ...cb, symptoms: [...cb.symptoms, ...fresh] } : cb
            if (cb.id === fromId && !copy) return { ...cb, symptoms: cb.symptoms.filter(x => !ids.has(x.id)) }
            return cb
          }),
        }
      })
    })
    if (skipped) actions.toast(`${skipped} symptom${skipped === 1 ? ' was' : 's were'} already in ${targetName || 'the target clipboard'}: ${copy ? 'skipped' : 'merged'}`, 'info')
    return { transferred, skipped }
  },
  /** Combine several symptoms into one (rubrics merged). The combined symptom starts without label or exclusion. */
  combineSymptoms(clipboardId: string, symptomIds: string[], mode: 'union' | 'intersection') {
    if (symptomIds.length < 2) return
    const ids = new Set(symptomIds)
    mutateCase('Combine symptoms', s => updateClipboard(s, clipboardId, cb => {
      const parts = cb.symptoms.filter(x => ids.has(x.id))
      if (parts.length < 2) return cb
      const first = cb.symptoms.findIndex(x => ids.has(x.id))
      const groups = new Set(parts.map(p => p.group))
      const merged: Symptom = {
        id: uid('s'), rubrics: [...new Set(parts.flatMap(p => p.rubrics))], combine: mode,
        weight: Math.max(...parts.map(p => p.weight)) as Weight, eliminatory: parts.some(p => p.eliminatory), exclusive: false,
        group: groups.size === 1 ? parts[0].group : null, causal: parts.some(p => p.causal), addedAt: parts[0].addedAt,
      }
      const rest = cb.symptoms.filter(x => !ids.has(x.id))
      rest.splice(first, 0, merged)
      return { ...cb, symptoms: rest }
    }))
    set(() => ({ selectedSymptomIds: [] }))
  },
  /** Split a combined symptom into one symptom per rubric (the combined label does not describe the parts). */
  splitSymptom(clipboardId: string, symptomId: string) {
    mutateCase('Split symptom', s => updateClipboard(s, clipboardId, cb => {
      const i = cb.symptoms.findIndex(x => x.id === symptomId)
      const sym = cb.symptoms[i]
      if (!sym || sym.rubrics.length < 2) return cb
      const parts = sym.rubrics.map(r => {
        const { label: _label, ...rest } = sym
        return { ...rest, id: uid('s'), rubrics: [r], combine: 'union' as const }
      })
      const list = [...cb.symptoms]
      list.splice(i, 1, ...parts)
      return { ...cb, symptoms: list }
    }))
  },
  setSelectedSymptoms(ids: string[]) { set(() => ({ selectedSymptomIds: ids })) },
  /** Patch several symptoms in one undo step; patch may be a function of the symptom. No-op patches record nothing. */
  updateSymptoms(clipboardId: string, symptomIds: string[], patch: Partial<Symptom> | ((s: Symptom) => Partial<Symptom>)) {
    const ids = new Set(symptomIds)
    if (!ids.size) return
    mutateCase(ids.size === 1 ? 'Edit symptom' : `Edit ${ids.size} symptoms`, s => updateClipboard(s, clipboardId, cb => {
      let changed = false
      const symptoms = cb.symptoms.map(x => {
        if (!ids.has(x.id)) return x
        const next = applyPatch(x, typeof patch === 'function' ? patch(x) : patch)
        if (next !== x) changed = true
        return next
      })
      return changed ? { ...cb, symptoms } : cb
    }))
  },
  /** Reorder a clipboard to the given id order (ids not listed keep their relative order at the end). */
  reorderSymptoms(clipboardId: string, orderedIds: string[]) {
    mutateCase('Reorder symptoms', s => updateClipboard(s, clipboardId, cb => {
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
    if (!items.length) return
    mutateCase(items.length === 1 ? 'Restore symptom' : 'Restore symptoms', s => updateClipboard(s, clipboardId, cb => {
      const list = cb.symptoms.filter(x => !items.some(it => it.symptom.id === x.id))
      for (const it of [...items].sort((a, b) => a.index - b.index)) list.splice(Math.min(it.index, list.length), 0, it.symptom)
      return list.length === cb.symptoms.length && list.every((x, i) => x === cb.symptoms[i]) ? cb : { ...cb, symptoms: list }
    }))
  },

  // analysis options
  setAnalysis(consultationId: string, patch: Partial<AnalysisOptions>) {
    mutateCase('Change analysis options', s => updateConsultation(s, consultationId, c => {
      const analysis = applyPatch(c.analysis, patch)
      return analysis === c.analysis ? c : { ...c, analysis }
    }))
  },

  // prescriptions
  addPrescription(consultationId: string, p: Omit<Prescription, 'id'>) {
    mutateCase('Add prescription', s => updateConsultation(s, consultationId, c => ({ ...c, prescriptions: [...c.prescriptions, { ...p, id: uid('rx') }] })))
  },
  removePrescription(consultationId: string, id: string) {
    mutateCase('Remove prescription', s => updateConsultation(s, consultationId, c => c.prescriptions.some(p => p.id === id) ? ({ ...c, prescriptions: c.prescriptions.filter(p => p.id !== id) }) : c))
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
