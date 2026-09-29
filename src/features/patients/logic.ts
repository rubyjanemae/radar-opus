import type { Clipboard } from '../../engine/model'
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

/** Clone clipboards with fresh ids; returns the clones and the old → new clipboard id map. */
export function cloneClipboards(cbs: Clipboard[]): { clipboards: Clipboard[]; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  const now = Date.now()
  const clipboards = cbs.map(cb => {
    const id = uid('cb')
    ids.set(cb.id, id)
    return { ...cb, id, symptoms: cb.symptoms.map((s, k) => ({ ...s, id: uid('s'), rubrics: [...s.rubrics], addedAt: now + k })) }
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

/** Copy a consultation (all ids fresh) onto another patient id. */
export function copyConsultation(c: Consultation, patientId: string, remapRef: (r: RubricRef) => RubricRef = r => r): Consultation {
  const { clipboards, ids } = cloneClipboards(c.clipboards)
  for (const cb of clipboards) for (const s of cb.symptoms) s.rubrics = s.rubrics.map(remapRef)
  return {
    ...c, id: uid('c'), patientId, clipboards,
    analysis: {
      ...c.analysis,
      clipboardIds: c.analysis.clipboardIds.map(id => ids.get(id)).filter((x): x is string => !!x),
      excludedRemedies: [...(c.analysis.excludedRemedies ?? [])],
      remedyFilter: c.analysis.remedyFilter ? [...c.analysis.remedyFilter] : null,
    },
    prescriptions: c.prescriptions.map(p => ({ ...p, id: uid('rx') })),
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
  /** Lower-cased text searched by the filter box. */
  haystack: string
}

/** Optional text sources for the search haystack (remedy names, rubric labels). */
export interface RowText {
  remedyName?: (id: number) => string
  rubricText?: (ref: RubricRef) => string | null
}

/** One row per patient with the derived columns of the patients table. */
export function patientRows(patients: Record<string, Patient>, consultations: Record<string, Consultation>, remedyAbbrev: (id: number) => string, now = Date.now(), text: RowText = {}): PatientRow[] {
  const byPatient = new Map<string, Consultation[]>()
  for (const c of Object.values(consultations)) {
    const l = byPatient.get(c.patientId)
    if (l) l.push(c)
    else byPatient.set(c.patientId, [c])
  }
  return Object.values(patients).map(p => {
    const cs = byPatient.get(p.id) ?? []
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
    for (const r of rubrics) parts.push(text.rubricText!(r) ?? '')
    const haystack = parts.join(' ').toLowerCase()
    return { patient: p, name, age: ageOf(p.birthDate, now), ageLabel: formatAge(p.birthDate, now), consultations: cs.length, lastVisit, lastRx, haystack }
  })
}

export type SortKey = 'name' | 'age' | 'sex' | 'tags' | 'lastVisit' | 'consultations' | 'lastRx'
export interface Sort { key: SortKey; dir: 1 | -1 }

export function sortRows(rows: PatientRow[], sort: Sort, remedyAbbrev: (id: number) => string): PatientRow[] {
  const cmpStr = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  const val = (r: PatientRow): string | number | null => {
    switch (sort.key) {
      case 'name': return r.name
      case 'age': return r.age
      case 'sex': return r.patient.sex
      case 'tags': return r.patient.tags.join(', ') || null
      case 'lastVisit': return r.lastVisit
      case 'consultations': return r.consultations
      case 'lastRx': return r.lastRx ? remedyAbbrev(r.lastRx.remedyId) : null
    }
  }
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b)
    // empty values always last
    if (x === null || x === '') return y === null || y === '' ? cmpStr(a.name, b.name) : 1
    if (y === null || y === '') return -1
    let c = typeof x === 'number' && typeof y === 'number' ? x - y : cmpStr(String(x), String(y))
    if (!c && sort.key === 'lastRx') c = comparePotency(a.lastRx!.potency, b.lastRx!.potency)
    return c * sort.dir || cmpStr(a.name, b.name)
  })
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
  return x[0] - y[0] || x[1] - y[1] || a.localeCompare(b)
}

/** Every query word must appear somewhere; every selected tag must be on the patient. */
export function filterRows(rows: PatientRow[], query: string, tags: string[]): PatientRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter(r => words.every(w => r.haystack.includes(w)) && tags.every(t => r.patient.tags.includes(t)))
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

export function formatDate(date: string | null): string {
  if (!date) return ''
  const t = Date.parse(date + 'T00:00:00')
  return Number.isNaN(t) ? date : new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
