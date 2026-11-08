import type { Consultation, Patient } from '../../state/patients'
import { byNewest } from './logic'

/**
 * The docked patients list (RadarOpus "Look for patient" panel): its administrative fields, columns,
 * search and filters. Pure, so it is unit-tested.
 */

export type FieldKey =
  | 'birthTime' | 'code' | 'dateOfBirth' | 'firstName' | 'idCard' | 'lastName'
  | 'lastConsDate' | 'nextContact' | 'owner' | 'personalCode' | 'sex'

/** The options list, in RadarOpus's (alphabetical) order. */
export const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'birthTime', label: 'Birth Time' },
  { key: 'code', label: 'Code' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'firstName', label: 'First Name' },
  { key: 'idCard', label: 'ID card' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'lastConsDate', label: 'Last cons. date' },
  { key: 'nextContact', label: 'Next contact' },
  { key: 'owner', label: 'Owner' },
  { key: 'personalCode', label: 'Personal Code' },
  { key: 'sex', label: 'Sex' },
]

/** Ticked by default: the columns RadarOpus shows (Last Name, First Name, Date of birth, Sex). */
export const DEFAULT_FIELDS: readonly FieldKey[] = ['dateOfBirth', 'firstName', 'lastName', 'sex']

export type ColumnKey = FieldKey | 'animalName'
export type Kind = 'human' | 'animal'

/** Column order of the table: names first, then the ticked fields. */
const COLUMN_ORDER: ColumnKey[] = ['lastName', 'firstName', 'animalName', 'code', 'personalCode', 'idCard', 'dateOfBirth', 'birthTime', 'sex', 'owner', 'lastConsDate', 'nextContact']

export const COLUMN_LABEL: Record<ColumnKey, string> = {
  ...Object.fromEntries(FIELDS.map(f => [f.key, f.label])) as Record<FieldKey, string>,
  animalName: 'Animal Name',
}

/** The table's columns: the ticked fields; animals add their name after the owner's and have no Sex column. */
export function columnsFor(fields: readonly FieldKey[], kind: Kind): ColumnKey[] {
  const on = new Set<ColumnKey>(fields)
  if (kind === 'animal') { on.add('animalName'); on.delete('sex') }
  return COLUMN_ORDER.filter(c => on.has(c))
}

/** "2000-01-01" -> "01-01-2000" (RadarOpus's dd-mm-yyyy). */
export function ddmmyyyy(date: string | null | undefined): string {
  if (!date) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : date
}

/** Age as years.months.days ("26.10.5"); '' without a valid birth date. */
export function ageYmd(birthDate: string | null | undefined, now = Date.now()): string {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return ''
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const n = new Date(now)
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  // the last monthly anniversary on or before today (a 31st falls on the month's last day)
  const at = (months: number) => {
    const first = new Date(by, bm - 1 + months, 1)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    return new Date(first.getFullYear(), first.getMonth(), Math.min(bd, last))
  }
  let months = (today.getFullYear() - by) * 12 + today.getMonth() - (bm - 1)
  if (at(months) > today) months--
  if (months < 0) return ''
  const d = Math.round((today.getTime() - at(months).getTime()) / 86_400_000)
  const y = Math.floor(months / 12), m = months % 12
  return `${y}.${m}.${d}`
}

/** Patient codes: the stored code, else the rank in creation order (1, 2, …). */
export function patientCodes(patients: Iterable<Patient>): Map<string, string> {
  const list = [...patients].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return new Map(list.map((p, i) => [p.id, p.code?.trim() || String(i + 1)]))
}

export const kindOf = (p: Pick<Patient, 'species'>): Kind => (p.species === 'animal' ? 'animal' : 'human')

/** RadarOpus's card name: "First Last". */
export function fullName(p: Pick<Patient, 'firstName' | 'lastName'>): string {
  return [p.firstName.trim(), p.lastName.trim()].filter(Boolean).join(' ') || 'Unnamed patient'
}

const SEX_TEXT: Record<NonNullable<Patient['sex']>, string> = { male: 'male', female: 'female', other: 'other' }

export interface PanelRow {
  patient: Patient
  code: string
  /** Latest consultation date (YYYY-MM-DD) or null. */
  lastCons: string | null
}

/** The text of one column (and search field) of a row. */
export function cellText(r: PanelRow, key: ColumnKey): string {
  const p = r.patient
  switch (key) {
    case 'lastName': return p.lastName
    case 'firstName': return p.firstName
    case 'animalName': return p.animalName ?? ''
    case 'code': return r.code
    case 'personalCode': return p.personalCode ?? ''
    case 'idCard': return p.idCard ?? ''
    case 'dateOfBirth': return ddmmyyyy(p.birthDate)
    case 'birthTime': return p.birthTime ?? ''
    case 'sex': return p.sex ? SEX_TEXT[p.sex] : ''
    case 'owner': return p.owner ?? ''
    case 'lastConsDate': return ddmmyyyy(r.lastCons)
    case 'nextContact': return p.nextContact ?? ''
  }
}

export function panelRows(patients: Record<string, Patient>, consultations: Record<string, Consultation>): PanelRow[] {
  const codes = patientCodes(Object.values(patients))
  const last = new Map<string, string>()
  for (const c of Object.values(consultations)) {
    const cur = last.get(c.patientId)
    if (!cur || c.date > cur) last.set(c.patientId, c.date)
  }
  return Object.values(patients).map(p => ({ patient: p, code: codes.get(p.id) ?? '', lastCons: last.get(p.id) ?? null }))
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface PanelFilter {
  query: string
  fields: readonly FieldKey[]
  kind: Kind
  clificol: boolean
  /** A tag (RadarOpus group), or null for All. */
  group: string | null
}

/**
 * Rows of the selected kind that pass the Clificol and group filters and whose ticked fields contain
 * every word of the query (case and accents ignored). Sorted by last name, then first name.
 * `total` counts all patients of the selected kind (RadarOpus's "Found n / total").
 */
export function filterPanel(rows: PanelRow[], f: PanelFilter): { rows: PanelRow[]; total: number } {
  const words = fold(f.query).split(/\s+/).filter(Boolean)
  const ofKind = rows.filter(r => kindOf(r.patient) === f.kind)
  const out = ofKind.filter(r => {
    if (f.clificol && !r.patient.clificol) return false
    if (f.group && !r.patient.tags.includes(f.group)) return false
    if (!words.length) return true
    if (!f.fields.length) return false
    const hay = f.fields.map(k => fold(cellText(r, k))).join('\u0000')
    return words.every(w => hay.includes(w))
  })
  out.sort((a, b) => fold(a.patient.lastName).localeCompare(fold(b.patient.lastName)) || fold(a.patient.firstName).localeCompare(fold(b.patient.firstName)) || a.patient.id.localeCompare(b.patient.id))
  return { rows: out, total: ofKind.length }
}

/** A patient's consultations, oldest first (the card's arrows step through them). */
export function consultationsOldestFirst(all: Record<string, Consultation>, patientId: string): Consultation[] {
  return Object.values(all).filter(c => c.patientId === patientId).sort((a, b) => -byNewest(a, b))
}
