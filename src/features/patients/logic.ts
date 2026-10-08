import type { AnalysisOptions, Clipboard } from '../../engine/model'
import type { RubricRef } from '../../data/types'
import { uid } from '../../state/ids'
import type { Consultation, Patient, Prescription } from '../../state/patients'

const DAY = 86_400_000

// ───────────────────────── people ─────────────────────────

/** Whole years between a birth date (YYYY-MM-DD) and `now`; null when unknown or invalid. */
export function ageOf(birthDate: string | null, now = Date.now()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const b = new Date(birthDate + 'T00:00:00')
  if (Number.isNaN(b.getTime())) return null
  const n = new Date(now)
  let years = n.getFullYear() - b.getFullYear()
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) years--
  return years < 0 ? null : years
}

/** "34", or "8 mo" for babies under two. */
export function formatAge(birthDate: string | null, now = Date.now()): string {
  const y = ageOf(birthDate, now)
  if (y === null) return ''
  if (y >= 2) return String(y)
  const b = new Date(birthDate + 'T00:00:00'), n = new Date(now)
  const months = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth() - (n.getDate() < b.getDate() ? 1 : 0)
  return `${Math.max(0, months)} mo`
}

export function patientName(p: Pick<Patient, 'firstName' | 'lastName'>): string {
  const l = p.lastName.trim(), f = p.firstName.trim()
  return l && f ? `${l}, ${f}` : l || f || 'Unnamed patient'
}

export function initials(p: Pick<Patient, 'firstName' | 'lastName'>): string {
  return ((p.firstName.trim()[0] ?? '') + (p.lastName.trim()[0] ?? '')).toUpperCase() || '?'
}

export const SEX_LABEL: Record<NonNullable<Patient['sex']>, string> = { female: 'Female', male: 'Male', other: 'Other' }
export const SEX_SHORT: Record<NonNullable<Patient['sex']>, string> = { female: 'F', male: 'M', other: 'X' }

export const KIND_LABEL: Record<Consultation['kind'], string> = { first: 'First visit', 'follow-up': 'Follow-up', acute: 'Acute', phone: 'Phone' }

/** Glasgow Homeopathic Hospital Outcome Scale, best first. */
export const GHHOS: { score: number; label: string }[] = [
  { score: 4, label: 'Cured or almost cured' },
  { score: 3, label: 'Major improvement' },
  { score: 2, label: 'Moderate improvement, affecting daily living' },
  { score: 1, label: 'Slight improvement, no effect on daily living' },
  { score: 0, label: 'No change' },
  { score: -1, label: 'Slight deterioration' },
  { score: -2, label: 'Moderate deterioration, affecting daily living' },
  { score: -3, label: 'Major deterioration' },
]

export function formatScoreSigned(n: number): string { return n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : '0' }

export function ghhosLabel(score: number | null | undefined): string {
  return score == null ? '' : GHHOS.find(g => g.score === score)?.label ?? ''
}

/**
 * The prescription a consultation evaluates: the latest one made before it, with the consultation it came from.
 * Follow-ups evaluate the constitutional line, so acute interludes are skipped unless nothing else was prescribed.
 */
export function previousPrescription(list: Consultation[], c: Consultation): { rx: Prescription; from: Consultation } | null {
  const pick = (skipAcute: boolean) => {
    let best: { rx: Prescription; from: Consultation } | null = null
    for (const o of list) {
      if (o.id === c.id || byNewest(o, c) <= 0) continue // only consultations older than c
      if (skipAcute && o.kind === 'acute') continue
      for (const rx of o.prescriptions) if (!best || rx.date > best.rx.date || (rx.date === best.rx.date && byNewest(o, best.from) < 0)) best = { rx, from: o }
    }
    return best
  }
  return (c.kind !== 'acute' ? pick(true) : null) ?? pick(false)
}

export type PatientDraft = Pick<Patient, 'firstName' | 'lastName' | 'birthDate' | 'sex' | 'email' | 'phone' | 'address' | 'occupation'>
export type PatientErrors = Partial<Record<keyof PatientDraft, string>>

/** Field validation for the patient forms; empty object when valid. */
export function validatePatient(d: Partial<PatientDraft>, now = Date.now()): PatientErrors {
  const e: PatientErrors = {}
  if (!d.firstName?.trim() && !d.lastName?.trim()) e.lastName = 'Enter a first or last name'
  if (d.lastName && d.lastName.length > 80) e.lastName = 'At most 80 characters'
  if (d.firstName && d.firstName.length > 80) e.firstName = 'At most 80 characters'
  if (d.birthDate) {
    const t = Date.parse(d.birthDate + 'T00:00:00')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) || Number.isNaN(t)) e.birthDate = 'Use YYYY-MM-DD'
    else if (t > now) e.birthDate = 'Birth date is in the future'
    else if (t < now - 125 * 365.25 * DAY) e.birthDate = 'Birth date is too far in the past'
  }
  if (d.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Not a valid email address'
  if (d.phone?.trim() && !/^[+()\d\s./-]{5,}$/.test(d.phone.trim())) e.phone = 'Digits, spaces and + ( ) - only'
  return e
}

/** Normalise a tag: trimmed, lower-case, single spaces. */
export function normalizeTag(t: string): string { return t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40) }

// ───────────────────────── consultations ─────────────────────────

/** Consultations of a patient, newest first (date, then creation time). */
export function consultationsOf(all: Record<string, Consultation>, patientId: string): Consultation[] {
  return Object.values(all).filter(c => c.patientId === patientId).sort(byNewest)
}

export function byNewest(a: Consultation, b: Consultation): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt
}

export function symptomCount(c: Pick<Consultation, 'clipboards'>): number {
  return c.clipboards.reduce((n, cb) => n + cb.symptoms.length, 0)
}

/** Clone clipboards with fresh ids; returns the clones and the old → new clipboard id map. `keepAddedAt` keeps when each symptom was taken. */
export function cloneClipboards(cbs: Clipboard[], keepAddedAt = false): { clipboards: Clipboard[]; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  const now = Date.now()
  const clipboards = cbs.map(cb => {
    const id = uid('cb')
    ids.set(cb.id, id)
    return { ...cb, id, symptoms: cb.symptoms.map((s, k) => ({ ...s, id: uid('s'), rubrics: [...s.rubrics], addedAt: keepAddedAt ? s.addedAt : now + k })) }
  })
  return { clipboards, ids }
}

/**
 * Fields for a follow-up of `prev`: same complaint, clipboards copied (new ids) and the
 * analysis options carried over with clipboard ids remapped.
 */
export function followUpFrom(prev: Consultation, date: string, index: number): Partial<Consultation> {
  const { clipboards, ids } = cloneClipboards(prev.clipboards)
  return {
    date, kind: 'follow-up', title: `Follow-up ${index}`, complaint: prev.complaint, notes: '', assessment: '', prescriptions: [],
    clipboards,
    analysis: { ...prev.analysis, clipboardIds: prev.analysis.clipboardIds.map(id => ids.get(id)).filter((x): x is string => !!x) },
  }
}

/** Next follow-up number for a patient ("Follow-up 3"). */
export function nextFollowUpIndex(list: Consultation[]): number {
  return list.filter(c => c.kind === 'follow-up' || c.kind === 'phone').length + 1
}

export interface CopyOptions {
  /** Rewrite rubric refs (case-file import re-resolves moved rubrics). */
  remapRef?: (r: RubricRef) => RubricRef
  /** Rewrite remedy ids everywhere they occur: prescriptions, exclusions, family limit and highlight. */
  remapRemedy?: (id: number) => number
  /** Keep each symptom's addedAt (import, duplicate) instead of stamping the copy time. */
  keepAddedAt?: boolean
}

/** Copy a consultation (all ids fresh) onto another patient id. */
export function copyConsultation(c: Consultation, patientId: string, opts: CopyOptions | ((r: RubricRef) => RubricRef) = {}): Consultation {
  const o: CopyOptions = typeof opts === 'function' ? { remapRef: opts } : opts
  const remapRef = o.remapRef ?? (r => r)
  const remedy = o.remapRemedy ?? (id => id)
  const { clipboards, ids } = cloneClipboards(c.clipboards, o.keepAddedAt)
  for (const cb of clipboards) for (const s of cb.symptoms) s.rubrics = s.rubrics.map(remapRef)
  return {
    ...c, id: uid('c'), patientId, clipboards,
    analysis: {
      ...c.analysis,
      clipboardIds: c.analysis.clipboardIds.map(id => ids.get(id)).filter((x): x is string => !!x),
      excludedRemedies: (c.analysis.excludedRemedies ?? []).map(remedy),
      remedyFilter: c.analysis.remedyFilter ? c.analysis.remedyFilter.map(remedy) : null,
      ...(c.analysis.highlight !== undefined ? { highlight: c.analysis.highlight ? c.analysis.highlight.map(remedy) : null } : {}),
    },
    prescriptions: c.prescriptions.map(p => ({ ...p, id: uid('rx'), remedyId: remedy(p.remedyId) })),
  }
}

/** Duplicate a patient with all consultations (new ids). */
export function duplicatePatient(p: Patient, cs: Consultation[]): { patient: Patient; consultations: Consultation[] } {
  const now = Date.now()
  const patient: Patient = { ...p, id: uid('p'), firstName: p.firstName, lastName: `${p.lastName} (copy)`.trim(), tags: [...p.tags], createdAt: now, updatedAt: now }
  return { patient, consultations: cs.map(c => copyConsultation(c, patient.id)) }
}

// ───────────────────────── patient list ─────────────────────────

export interface PatientRow {
  patient: Patient
  name: string
  age: number | null
  ageLabel: string
  consultations: number
  lastVisit: string | null
  lastRx: Prescription | null
  /** Lower-cased text searched by the filter box (everything except rubric labels, which are built lazily). */
  haystack: string
  /** Precomputed sort keys (lower-cased, accents folded). */
  keys: { name: string; tags: string; sex: string; rx: string }
  /** Rubrics on the patient's clipboards, for the lazily built rubric search text. */
  rubricRefs: RubricRef[]
  /** Rubric-label search text, built on the first query that needs it (undefined until then). */
  rubricHaystack?: string
  /** Source of the rubric labels (from the RowText passed to patientRows). */
  rubricText?: (ref: RubricRef) => string | null
}

/** Optional text sources for the search haystack (remedy names, rubric labels). */
export interface RowText {
  remedyName?: (id: number) => string
  rubricText?: (ref: RubricRef) => string | null
}

/** Lower-cased, accent-folded key for fast string comparisons. */
export function foldKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

interface RowCacheEntry {
  consultations: Consultation[]
  day: number
  abbrev: (id: number) => string
  text: RowText
  row: PatientRow
}
/**
 * Per-patient row memo: records are immutable (every edit replaces the object), so a row stays
 * valid while its patient object, its consultation objects, the day (age) and the text sources
 * are the same. With thousands of patients an edit rebuilds one row, not all of them.
 */
const rowCache = new WeakMap<Patient, RowCacheEntry>()

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function buildRow(p: Patient, cs: Consultation[], remedyAbbrev: (id: number) => string, now: number, text: RowText): PatientRow {
  let lastVisit: string | null = null
  let lastRx: Prescription | null = null
  for (const c of cs) {
    if (!lastVisit || c.date > lastVisit) lastVisit = c.date
    for (const rx of c.prescriptions) if (!lastRx || rx.date > lastRx.date) lastRx = rx
  }
  const name = patientName(p)
  const parts: string[] = [p.firstName, p.lastName, p.email, p.phone, p.occupation, p.address, p.notes, ...p.tags]
  const remedies = new Set<number>()
  const rubrics = new Set<RubricRef>()
  for (const c of cs) {
    parts.push(c.title, c.complaint, c.notes, c.assessment, c.response?.note ?? '')
    for (const rx of c.prescriptions) { remedies.add(rx.remedyId); parts.push(rx.potency, rx.dosage, rx.note) }
    if (text.rubricText) for (const cb of c.clipboards) for (const s of cb.symptoms) for (const r of s.rubrics) rubrics.add(r)
  }
  for (const id of remedies) parts.push(remedyAbbrev(id), text.remedyName?.(id) ?? '')
  const tags = p.tags.join(', ')
  return {
    patient: p, name, age: ageOf(p.birthDate, now), ageLabel: formatAge(p.birthDate, now), consultations: cs.length, lastVisit, lastRx,
    haystack: parts.join(' ').toLowerCase(),
    keys: { name: foldKey(name), tags: foldKey(tags), sex: p.sex ?? '', rx: lastRx ? foldKey(remedyAbbrev(lastRx.remedyId)) : '' },
    rubricRefs: [...rubrics],
    rubricText: text.rubricText,
  }
}

/** One row per patient with the derived columns of the patients table (memoised per patient). */
export function patientRows(patients: Record<string, Patient>, consultations: Record<string, Consultation>, remedyAbbrev: (id: number) => string, now = Date.now(), text: RowText = {}): PatientRow[] {
  const byPatient = new Map<string, Consultation[]>()
  for (const c of Object.values(consultations)) {
    const l = byPatient.get(c.patientId)
    if (l) l.push(c)
    else byPatient.set(c.patientId, [c])
  }
  const day = Math.floor(now / DAY)
  const none: Consultation[] = []
  return Object.values(patients).map(p => {
    const cs = byPatient.get(p.id) ?? none
    const hit = rowCache.get(p)
    if (hit && hit.day === day && hit.abbrev === remedyAbbrev && hit.text.remedyName === text.remedyName && hit.text.rubricText === text.rubricText && sameList(hit.consultations, cs)) return hit.row
    const row = buildRow(p, cs, remedyAbbrev, now, text)
    rowCache.set(p, { consultations: cs, day, abbrev: remedyAbbrev, text, row })
    return row
  })
}

/** Rubric-label search text of a row, built on first use; kept once every label resolved (repertories loaded). */
export function rubricHaystack(row: PatientRow): string {
  if (row.rubricHaystack !== undefined) return row.rubricHaystack
  const src = row.rubricText
  if (!src || !row.rubricRefs.length) return (row.rubricHaystack = '')
  let complete = true
  const parts: string[] = []
  for (const r of row.rubricRefs) {
    const t = src(r)
    if (t === null) complete = false
    else parts.push(t)
  }
  const out = parts.join(' ').toLowerCase()
  if (complete) row.rubricHaystack = out
  return out
}

export type SortKey = 'name' | 'age' | 'sex' | 'tags' | 'lastVisit' | 'consultations' | 'lastRx'
export interface Sort { key: SortKey; dir: 1 | -1 }

const cmpKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Sort rows by a column; empty values always last, ties by name. Uses the precomputed keys only. */
export function sortRows(rows: PatientRow[], sort: Sort, _remedyAbbrev?: (id: number) => string): PatientRow[] {
  const val = (r: PatientRow): string | number | null => {
    switch (sort.key) {
      case 'name': return r.keys.name
      case 'age': return r.age
      case 'sex': return r.keys.sex || null
      case 'tags': return r.keys.tags || null
      case 'lastVisit': return r.lastVisit
      case 'consultations': return r.consultations
      case 'lastRx': return r.keys.rx || null
    }
  }
  // potency ranks are parsed once per row, not once per comparison (ties on the remedy are common)
  const byRx = sort.key === 'lastRx'
  const keyed = rows.map(r => ({ r, v: val(r), p: byRx && r.lastRx ? potencyRank(r.lastRx.potency) : null }))
  keyed.sort((a, b) => {
    const x = a.v, y = b.v
    if (x === null || x === '') return y === null || y === '' ? cmpKey(a.r.keys.name, b.r.keys.name) : 1
    if (y === null || y === '') return -1
    let c = typeof x === 'number' && typeof y === 'number' ? x - y : cmpKey(String(x), String(y))
    if (!c && a.p && b.p) c = a.p[0] - b.p[0] || a.p[1] - b.p[1] || comparePotencyText(a.r.lastRx!.potency, b.r.lastRx!.potency)
    return c * sort.dir || cmpKey(a.r.keys.name, b.r.keys.name)
  })
  return keyed.map(k => k.r)
}

/**
 * Sort key of a potency: decimal (6X, D12) < centesimal (6C … 200C, 1M, 10M, CM, MM) < LM/Q (by number) < anything else.
 * Returns [scale, value]; unknown notations sort last by text.
 */
export function potencyRank(potency: string): [number, number] {
  const p = potency.trim().toUpperCase().replace(/\s+/g, '')
  let m = /^(\d+(?:\.\d+)?)(X|D|DH)$/.exec(p) ?? /^D(\d+)$/.exec(p)
  if (m) return [0, Number(m[1])]
  if ((m = /^(\d+(?:\.\d+)?)(C|CH|K)?$/.exec(p))) return [1, Number(m[1])]
  if ((m = /^(\d+(?:\.\d+)?)M$/.exec(p))) return [1, Number(m[1]) * 1000]
  if (p === 'CM') return [1, 100_000]
  if (p === 'MM') return [1, 1_000_000]
  if ((m = /^(?:LM|Q)(\d+)$/.exec(p)) ?? (m = /^(\d+)(?:LM|Q)$/.exec(p))) return [2, Number(m[1])]
  if (p === 'Q' || p === 'MT' || p === 'Ø') return [-1, 0]
  return [3, 0]
}

export function comparePotency(a: string, b: string): number {
  const x = potencyRank(a), y = potencyRank(b)
  return x[0] - y[0] || x[1] - y[1] || comparePotencyText(a, b)
}
const comparePotencyText = (a: string, b: string) => (a === b ? 0 : a.localeCompare(b))

/** Every query word must appear somewhere; every selected tag must be on the patient. Rubric text is consulted only when needed. */
export function filterRows(rows: PatientRow[], query: string, tags: string[]): PatientRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length && !tags.length) return rows
  return rows.filter(r => {
    if (!tags.every(t => r.patient.tags.includes(t))) return false
    let rubric: string | null = null
    for (const w of words) {
      if (r.haystack.includes(w)) continue
      rubric ??= rubricHaystack(r)
      if (!rubric.includes(w)) return false
    }
    return true
  })
}

/** Tags in use with their counts, most used first. */
export function tagCounts(patients: Iterable<Patient>): { tag: string; count: number }[] {
  const m = new Map<string, number>()
  for (const p of patients) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** Relative "3 days ago" style label for a YYYY-MM-DD date. */
export function relativeDate(date: string | null, now = Date.now()): string {
  if (!date) return ''
  const d = Math.round((new Date(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - Date.parse(date + 'T00:00:00Z')) / DAY)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 0) return `in ${-d} d`
  if (d < 14) return `${d} days ago`
  if (d < 60) return `${Math.round(d / 7)} weeks ago`
  if (d < 730) return `${Math.round(d / 30.4)} months ago`
  return `${Math.round(d / 365.25)} years ago`
}

let dateFmt: Intl.DateTimeFormat | null = null
let dateTimeFmt: Intl.DateTimeFormat | null = null

/** The app's one date format for calendar dates (YYYY-MM-DD): medium date style in the user's locale. */
export function formatDate(date: string | null): string {
  if (!date) return ''
  const t = Date.parse(date + 'T00:00:00')
  if (Number.isNaN(t)) return date
  dateFmt ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  return dateFmt.format(t)
}

/** The app's one format for moments (epoch ms or Date): medium date, short time. */
export function formatDateTime(at: number | Date | null | undefined): string {
  if (at === null || at === undefined) return ''
  const t = typeof at === 'number' ? at : at.getTime()
  if (!Number.isFinite(t)) return ''
  dateTimeFmt ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return dateTimeFmt.format(t)
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ───────────────────────── analysis summary ─────────────────────────

/**
 * Plain-language notes for the analysis options that narrow or mark the result (family limit,
 * highlight, excluded remedies, minimum coverage), so a "Top remedies" summary never hides them.
 */
export function analysisFilterNotes(o: Pick<AnalysisOptions, 'remedyFilter' | 'filterLabel' | 'highlight' | 'highlightLabel' | 'excludedRemedies' | 'minCoverage'>, remedyAbbrev: (id: number) => string): string[] {
  const out: string[] = []
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  if (o.remedyFilter) out.push(`Limited to ${o.filterLabel || n(o.remedyFilter.length, 'remedy', 'remedies')}`)
  if (o.highlight?.length) out.push(`Highlighting ${o.highlightLabel || n(o.highlight.length, 'remedy', 'remedies')}`)
  const ex = o.excludedRemedies ?? []
  if (ex.length) {
    const names = ex.slice(0, 3).map(remedyAbbrev).join(', ')
    out.push(`Excluding ${names}${ex.length > 3 ? ` and ${ex.length - 3} more` : ''}`)
  }
  if (o.minCoverage > 0) out.push(`Minimum coverage ${n(o.minCoverage, 'symptom', 'symptoms')}`)
  return out
}
