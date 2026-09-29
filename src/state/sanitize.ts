import type { RubricRef } from '../data/types'
import type { AnalysisOptions, Clipboard, Symptom, Weight } from '../engine/model'
import { uid } from './ids'
import type { Consultation, Patient, Prescription } from './patients'
import { CLIPBOARD_COLORS, DEFAULT_ANALYSIS } from './store'
import type { AppState } from './store'
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS } from './workspace'
import type { Bookmark, Layout, Settings, Tab, TabKind } from './workspace'

/**
 * Persisted workspace schema. Bump SCHEMA_VERSION and add a migration step whenever the saved
 * shape changes; `sanitizePersisted` runs the steps before validating.
 */
export const SCHEMA_VERSION = 2

export const WORKSPACE_FIELDS = ['tabs', 'activeTabId', 'layout', 'settings', 'bookmarks', 'rubricNotes', 'remedyNotes', 'recentSearches', 'activeConsultationId', 'activeClipboardId'] as const
export const PERSISTED_FIELDS = ['patients', 'consultations', ...WORKSPACE_FIELDS] as const
export type PersistedState = Pick<AppState, (typeof PERSISTED_FIELDS)[number]>
export type WorkspaceState = Pick<AppState, (typeof WORKSPACE_FIELDS)[number]>

type Raw = Record<string, unknown>

/** Migration steps: MIGRATIONS[v] turns a version-v object into version v+1. */
export const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  // v1 (the single 'state-v1' blob) had no version field; v2 has the same fields, stored split per record.
  1: raw => ({ ...raw, version: 2 }),
}

/** The saved data cannot be used at all (not an object, from a newer app version, collections of the wrong type). */
export class RestoreError extends Error {
  constructor(message: string) { super(message); this.name = 'RestoreError' }
}

export interface SanitizeResult {
  state: PersistedState
  /** Human descriptions of what was repaired or dropped (empty when the data was clean). */
  repairs: string[]
}

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [])
function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], d: T): T { return allowed.includes(v as T) ? (v as T) : d }

const TAB_KINDS: readonly TabKind[] = ['repertory', 'analysis', 'materia-medica', 'remedy', 'patients', 'patient', 'search', 'families', 'repertories']

/** Run migrations up to SCHEMA_VERSION. Unversioned data is version 1. */
export function migrate(raw: Raw): Raw {
  let v = typeof raw.version === 'number' ? raw.version : 1
  if (v > SCHEMA_VERSION) throw new RestoreError(`The saved workspace is from a newer version of Radar Opus (schema ${v}); this version reads up to ${SCHEMA_VERSION}.`)
  let out = raw
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) throw new RestoreError(`No migration from workspace schema ${v}`)
    out = step(out)
    v++
  }
  return { ...out, version: SCHEMA_VERSION }
}

/** Merge a saved object onto defaults, keeping only keys of the default's type (and allowed enum values). */
function mergeDefaults<T extends object>(defaults: T, saved: unknown, enums: Partial<Record<keyof T, readonly unknown[]>> = {}): T {
  if (!isObj(saved)) return { ...defaults }
  const out = { ...defaults } as Record<string, unknown>
  for (const k of Object.keys(defaults) as (keyof T & string)[]) {
    const v = saved[k]
    if (v === undefined || typeof v !== typeof defaults[k]) continue
    if (typeof v === 'number' && !Number.isFinite(v)) continue
    const allowed = enums[k]
    if (allowed && !allowed.includes(v)) continue
    out[k] = v
  }
  return out as T
}

export function sanitizeSettings(saved: unknown): Settings {
  return mergeDefaults(DEFAULT_SETTINGS, saved, {
    theme: ['light', 'dark', 'system'], density: ['compact', 'comfortable'], remedyStyle: ['abbrev', 'name'], minGradeShown: [1, 2, 3],
  })
}
export function sanitizeLayout(saved: unknown): Layout { return mergeDefaults(DEFAULT_LAYOUT, saved) }

function sanitizePatient(raw: unknown, key: string): Patient | null {
  if (!isObj(raw)) return null
  const id = str(raw.id) || key
  if (!id) return null
  const now = Date.now()
  return {
    ...raw,
    id, firstName: str(raw.firstName), lastName: str(raw.lastName), birthDate: strOrNull(raw.birthDate),
    sex: raw.sex === 'female' || raw.sex === 'male' || raw.sex === 'other' ? raw.sex : null,
    email: str(raw.email), phone: str(raw.phone), address: str(raw.address), occupation: str(raw.occupation), notes: str(raw.notes),
    tags: strings(raw.tags), createdAt: num(raw.createdAt, now), updatedAt: num(raw.updatedAt, num(raw.createdAt, now)),
  } as Patient
}

function sanitizeSymptom(raw: unknown): Symptom | null {
  if (!isObj(raw)) return null
  const rubrics = strings(raw.rubrics) as RubricRef[]
  if (!rubrics.length) return null
  const out: Symptom = {
    id: str(raw.id) || uid('s'), rubrics, combine: oneOf(raw.combine, ['union', 'intersection'] as const, 'union'),
    weight: oneOf(raw.weight, [0, 1, 2, 3, 4] as const, 1) as Weight, eliminatory: bool(raw.eliminatory), exclusive: bool(raw.exclusive),
    group: strOrNull(raw.group), causal: bool(raw.causal), addedAt: num(raw.addedAt, Date.now()),
  }
  if (typeof raw.label === 'string') out.label = raw.label
  if (typeof raw.note === 'string') out.note = raw.note
  return out
}

function sanitizeClipboard(raw: unknown, index: number, repairs: string[]): Clipboard | null {
  if (!isObj(raw)) return null
  const list = Array.isArray(raw.symptoms) ? raw.symptoms : []
  const symptoms = list.map(sanitizeSymptom).filter((x): x is Symptom => !!x)
  if (symptoms.length < list.length) repairs.push(`${list.length - symptoms.length} unreadable symptom(s) dropped`)
  return {
    id: str(raw.id) || uid('cb'), name: str(raw.name) || `Clipboard ${index + 1}`,
    color: str(raw.color) || CLIPBOARD_COLORS[index % CLIPBOARD_COLORS.length], symptoms,
  }
}

function sanitizeAnalysis(raw: unknown, clipboards: Clipboard[]): AnalysisOptions {
  const ids = new Set(clipboards.map(cb => cb.id))
  if (!isObj(raw)) return { ...DEFAULT_ANALYSIS, clipboardIds: [...ids] }
  const out = { ...DEFAULT_ANALYSIS, ...raw } as AnalysisOptions & Raw
  out.strategy = (typeof raw.strategy === 'string' ? raw.strategy : DEFAULT_ANALYSIS.strategy) as AnalysisOptions['strategy']
  out.clipboardIds = Array.isArray(raw.clipboardIds) ? strings(raw.clipboardIds).filter(id => ids.has(id)) : [...ids]
  out.remedyFilter = Array.isArray(raw.remedyFilter) ? numbers(raw.remedyFilter) : null
  out.excludedRemedies = numbers(raw.excludedRemedies)
  out.minCoverage = num(raw.minCoverage, DEFAULT_ANALYSIS.minCoverage)
  out.limit = num(raw.limit, DEFAULT_ANALYSIS.limit)
  for (const k of ['highlight'] as const) if (raw[k] !== undefined && raw[k] !== null && !Array.isArray(raw[k])) delete out[k]
  if (Array.isArray(raw.highlight)) out.highlight = numbers(raw.highlight)
  return out
}

function sanitizePrescription(raw: unknown): Prescription | null {
  if (!isObj(raw) || typeof raw.remedyId !== 'number') return null
  return { id: str(raw.id) || uid('rx'), remedyId: raw.remedyId, potency: str(raw.potency), dosage: str(raw.dosage), date: str(raw.date), note: str(raw.note) }
}

function sanitizeConsultation(raw: unknown, key: string, patients: Record<string, Patient>, repairs: string[]): Consultation | null {
  if (!isObj(raw)) return null
  const id = str(raw.id) || key
  const patientId = str(raw.patientId)
  if (!id || !patients[patientId]) return null
  const list = Array.isArray(raw.clipboards) ? raw.clipboards : []
  if (!Array.isArray(raw.clipboards)) repairs.push(`consultation ${id}: clipboards were missing`)
  let clipboards = list.map((cb, i) => sanitizeClipboard(cb, i, repairs)).filter((x): x is Clipboard => !!x)
  const seen = new Set<string>()
  clipboards = clipboards.map(cb => { if (seen.has(cb.id)) cb = { ...cb, id: uid('cb') }; seen.add(cb.id); return cb })
  if (!clipboards.length) clipboards = [{ id: uid('cb'), name: 'Clipboard 1', color: CLIPBOARD_COLORS[0], symptoms: [] }]
  if (!isObj(raw.analysis)) repairs.push(`consultation ${id}: analysis options reset`)
  const prescriptions = (Array.isArray(raw.prescriptions) ? raw.prescriptions : []).map(sanitizePrescription).filter((x): x is Prescription => !!x)
  const now = Date.now()
  const out: Consultation = {
    id, patientId, date: str(raw.date) || new Date(num(raw.createdAt, now)).toISOString().slice(0, 10), title: str(raw.title),
    kind: oneOf(raw.kind, ['first', 'follow-up', 'acute', 'phone'] as const, 'first'),
    complaint: str(raw.complaint), notes: str(raw.notes), assessment: str(raw.assessment),
    clipboards, analysis: sanitizeAnalysis(raw.analysis, clipboards), prescriptions,
    createdAt: num(raw.createdAt, now), updatedAt: num(raw.updatedAt, num(raw.createdAt, now)),
  }
  if (isObj(raw.response)) out.response = { score: typeof raw.response.score === 'number' ? raw.response.score : null, note: str(raw.response.note) }
  return out
}

/** A saved tab, or null when its kind is unknown or it points at records that no longer exist. */
function sanitizeTab(raw: unknown, s: Pick<PersistedState, 'patients' | 'consultations'>): Tab | null {
  if (!isObj(raw) || !TAB_KINDS.includes(raw.kind as TabKind)) return null
  const base = { ...raw, id: str(raw.id) || uid('tab'), pinned: raw.pinned === true ? true : undefined } as Raw & { id: string }
  switch (raw.kind as TabKind) {
    case 'repertory':
      if (typeof raw.repertory !== 'string') return null
      return { ...base, kind: 'repertory', repertory: raw.repertory, rubric: Math.max(0, Math.trunc(num(raw.rubric, 0))), back: numbers(raw.back), forward: numbers(raw.forward), recent: raw.recent === undefined ? undefined : numbers(raw.recent) } as Tab
    case 'analysis':
      return typeof raw.consultationId === 'string' && s.consultations[raw.consultationId] ? ({ ...base, kind: 'analysis', consultationId: raw.consultationId } as Tab) : null
    case 'patient': {
      if (typeof raw.patientId !== 'string' || !s.patients[raw.patientId]) return null
      const cid = typeof raw.consultationId === 'string' && s.consultations[raw.consultationId]?.patientId === raw.patientId ? raw.consultationId : null
      return { ...base, kind: 'patient', patientId: raw.patientId, consultationId: cid } as Tab
    }
    case 'remedy':
      return typeof raw.remedyId === 'number' ? ({ ...base, kind: 'remedy', remedyId: raw.remedyId } as Tab) : null
    case 'materia-medica':
      return { ...base, kind: 'materia-medica', remedyId: typeof raw.remedyId === 'number' ? raw.remedyId : null, query: str(raw.query) } as Tab
    case 'search':
      return { ...base, kind: 'search', query: str(raw.query), repertories: strings(raw.repertories) } as Tab
    case 'families':
      return { ...base, kind: 'families', group: strOrNull(raw.group) } as Tab
    case 'patients': case 'repertories':
      return { ...base, kind: raw.kind } as Tab
  }
}

function stringRecord<K extends string | number>(v: unknown): Record<K, string> {
  if (!isObj(v)) return {} as Record<K, string>
  return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as Record<K, string>
}

/**
 * Validate and repair saved workspace data (IndexedDB restore and workspace import share this).
 * Runs schema migrations, merges layout/settings onto defaults, drops unreadable records, tabs of
 * unknown kinds or pointing at missing patients/consultations, and repairs consultations with missing
 * clipboards or analysis fields. Throws RestoreError when the data cannot be used at all.
 */
export function sanitizePersisted(input: unknown): SanitizeResult {
  if (!isObj(input)) throw new RestoreError('The saved workspace is not a valid object')
  const raw = migrate(input)
  const repairs: string[] = []
  for (const k of ['patients', 'consultations'] as const) {
    if (raw[k] !== undefined && raw[k] !== null && !isObj(raw[k])) throw new RestoreError(`The saved ${k} are not readable (expected an object, found ${Array.isArray(raw[k]) ? 'a list' : typeof raw[k]})`)
  }

  const patients: Record<string, Patient> = {}
  for (const [key, v] of Object.entries((raw.patients as Raw) ?? {})) {
    const p = sanitizePatient(v, key)
    if (p) patients[p.id] = p
    else repairs.push(`patient ${key} dropped (unreadable)`)
  }
  const consultations: Record<string, Consultation> = {}
  for (const [key, v] of Object.entries((raw.consultations as Raw) ?? {})) {
    const c = sanitizeConsultation(v, key, patients, repairs)
    if (c) consultations[c.id] = c
    else repairs.push(`consultation ${key} dropped (unreadable or its patient is missing)`)
  }

  return { repairs, state: { patients, consultations, ...sanitizeWorkspace(raw, patients, consultations, repairs) } }
}

/**
 * Validate the workspace part (tabs, focus, layout, settings, bookmarks, notes) against records that
 * are already valid. Record objects are not touched, so their references stay stable.
 */
export function sanitizeWorkspace(raw: Raw, patients: Record<string, Patient>, consultations: Record<string, Consultation>, repairs: string[] = []): WorkspaceState {
  if (raw.tabs !== undefined && !Array.isArray(raw.tabs)) repairs.push('tabs were not a list and were reset')
  const tabs: Tab[] = []
  for (const t of Array.isArray(raw.tabs) ? raw.tabs : []) {
    const tab = sanitizeTab(t, { patients, consultations })
    if (!tab) { repairs.push(`tab dropped (${isObj(t) ? `kind ${String(t.kind)}` : 'unreadable'})`); continue }
    if (tabs.some(x => x.id === tab.id)) tab.id = uid('tab')
    tabs.push(tab)
  }
  const activeTabId = typeof raw.activeTabId === 'string' && tabs.some(t => t.id === raw.activeTabId) ? raw.activeTabId : tabs[0]?.id ?? null

  const active = typeof raw.activeConsultationId === 'string' ? consultations[raw.activeConsultationId] : undefined
  const activeClipboardId = active ? (active.clipboards.some(cb => cb.id === raw.activeClipboardId) ? (raw.activeClipboardId as string) : active.clipboards[0].id) : null

  const bookmarks: Bookmark[] = (Array.isArray(raw.bookmarks) ? raw.bookmarks : []).flatMap((b): Bookmark[] => {
    if (!isObj(b) || typeof b.ref !== 'string') return []
    return [{ id: str(b.id) || uid('bm'), ref: b.ref as RubricRef, label: str(b.label, b.ref), folder: str(b.folder) || 'General', createdAt: num(b.createdAt, Date.now()) }]
  })

  return {
    tabs, activeTabId,
    layout: sanitizeLayout(raw.layout), settings: sanitizeSettings(raw.settings), bookmarks,
    rubricNotes: stringRecord<RubricRef>(raw.rubricNotes), remedyNotes: stringRecord<number>(raw.remedyNotes),
    recentSearches: strings(raw.recentSearches).slice(0, 20),
    activeConsultationId: active?.id ?? null, activeClipboardId,
  }
}
