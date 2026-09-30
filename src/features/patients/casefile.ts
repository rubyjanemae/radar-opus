import type { RubricRef } from '../../data/types'
import type { Weight } from '../../engine/model'
import { mergeParams, normalizeStrategy } from '../../engine/analysis'
import { DEFAULT_ANALYSIS } from '../../state/store'
import { uid } from '../../state/ids'
import type { Consultation, Patient } from '../../state/patients'
import { copyConsultation } from './logic'

export const CASE_FORMAT = 'radar-opus-case'
export const CASE_VERSION = 1

/** Portable case file: one patient with all consultations. */
export interface CaseFile {
  format: typeof CASE_FORMAT
  version: typeof CASE_VERSION
  exportedAt: string
  app: string
  patient: Patient
  consultations: Consultation[]
  /** Full rubric path for every referenced rubric, so refs can be re-resolved if the data changes. */
  rubrics: Record<RubricRef, string>
  /** Remedy abbreviation for every referenced remedy id (same reason). */
  remedies: Record<string, string>
  /** Problems parseCaseFile repaired (not written on export), reported after an import. */
  warnings?: string[]
}

export interface CaseFileContext {
  /** Full rubric path for a ref, or null when its repertory is not loaded. */
  rubricPath: (ref: RubricRef) => string | null
  remedyAbbrev: (id: number) => string
}

export function buildCaseFile(patient: Patient, consultations: Consultation[], ctx: CaseFileContext, now = new Date()): CaseFile {
  const rubrics: Record<RubricRef, string> = {}
  const remedies: Record<string, string> = {}
  for (const c of consultations) {
    for (const cb of c.clipboards) for (const s of cb.symptoms) for (const r of s.rubrics) {
      const p = ctx.rubricPath(r)
      if (p) rubrics[r] = p
    }
    for (const rx of c.prescriptions) remedies[rx.remedyId] = ctx.remedyAbbrev(rx.remedyId)
  }
  return {
    format: CASE_FORMAT, version: CASE_VERSION, exportedAt: now.toISOString(), app: 'Radar Opus',
    patient, consultations: [...consultations].sort((a, b) => a.date.localeCompare(b.date)), rubrics, remedies,
  }
}

export function caseFileName(p: Pick<Patient, 'firstName' | 'lastName'>, date = new Date()): string {
  const slug = `${p.lastName}-${p.firstName}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'patient'
  return `${slug}-${date.toISOString().slice(0, 10)}.radar-case.json`
}

export class CaseFileError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d)
const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d)

/** Parse and validate a case file; throws CaseFileError with a readable message. Tolerates missing optional fields. */
export function parseCaseFile(text: string): CaseFile {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new CaseFileError('This file is not valid JSON.') }
  if (!isObj(raw) || raw.format !== CASE_FORMAT) throw new CaseFileError('Not a Radar Opus case file (format "radar-opus-case" expected).')
  if (typeof raw.version !== 'number' || raw.version > CASE_VERSION) throw new CaseFileError(`Unsupported case file version ${String(raw.version)}; this app reads version ${CASE_VERSION}.`)
  if (!isObj(raw.patient)) throw new CaseFileError('The case file has no patient.')
  const p = raw.patient
  const sex = p.sex === 'female' || p.sex === 'male' || p.sex === 'other' ? p.sex : null
  const patient: Patient = {
    id: str(p.id, 'p'), firstName: str(p.firstName), lastName: str(p.lastName), birthDate: typeof p.birthDate === 'string' && p.birthDate ? p.birthDate : null,
    sex, email: str(p.email), phone: str(p.phone), address: str(p.address), occupation: str(p.occupation), notes: str(p.notes),
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string') : [],
    createdAt: num(p.createdAt, Date.now()), updatedAt: num(p.updatedAt, Date.now()),
  }
  if (!patient.firstName.trim() && !patient.lastName.trim()) throw new CaseFileError('The patient in this file has no name.')
  const list = Array.isArray(raw.consultations) ? raw.consultations : []
  const unknownStrategies = new Set<string>()
  const consultations: Consultation[] = list.filter(isObj).map((c, i) => {
    const clipboards = (Array.isArray(c.clipboards) ? c.clipboards : []).filter(isObj).map((cb, k) => ({
      id: str(cb.id, `cb${k}`), name: str(cb.name, `Clipboard ${k + 1}`), color: str(cb.color, '#2f6fdb'),
      symptoms: (Array.isArray(cb.symptoms) ? cb.symptoms : []).filter(isObj).filter(s => Array.isArray(s.rubrics) && s.rubrics.length).map((s, j) => ({
        id: str(s.id, `s${j}`), rubrics: (s.rubrics as unknown[]).filter((r): r is string => typeof r === 'string' && r.includes(':')),
        combine: s.combine === 'intersection' ? 'intersection' as const : 'union' as const,
        weight: (Math.max(0, Math.min(4, Math.round(num(s.weight, 1))))) as Weight,
        eliminatory: !!s.eliminatory, exclusive: !!s.exclusive, group: typeof s.group === 'string' && s.group ? s.group : null, causal: !!s.causal,
        ...(typeof s.label === 'string' ? { label: s.label } : {}), ...(typeof s.note === 'string' ? { note: s.note } : {}),
        addedAt: num(s.addedAt, Date.now()),
      })).filter(s => s.rubrics.length),
    }))
    const a = isObj(c.analysis) ? c.analysis : {}
    const strategy = normalizeStrategy(a.strategy ?? DEFAULT_ANALYSIS.strategy)
    if (a.strategy !== undefined && strategy !== a.strategy) unknownStrategies.add(String(a.strategy))
    const kind = c.kind === 'first' || c.kind === 'follow-up' || c.kind === 'acute' || c.kind === 'phone' ? c.kind : 'follow-up'
    return {
      id: str(c.id, `c${i}`), patientId: patient.id, date: str(c.date, new Date().toISOString().slice(0, 10)), title: str(c.title, 'Consultation'), kind,
      complaint: str(c.complaint), notes: str(c.notes), assessment: str(c.assessment), clipboards,
      analysis: {
        ...DEFAULT_ANALYSIS, ...(a as object),
        strategy,
        minCoverage: Math.max(0, Math.round(num(a.minCoverage, DEFAULT_ANALYSIS.minCoverage))),
        limit: Math.max(1, Math.round(num(a.limit, DEFAULT_ANALYSIS.limit))),
        ...(a.params !== undefined ? { params: mergeParams(a.params) } : {}),
        clipboardIds: Array.isArray(a.clipboardIds) ? a.clipboardIds.filter((x): x is string => typeof x === 'string') : clipboards.map(cb => cb.id),
        excludedRemedies: Array.isArray(a.excludedRemedies) ? a.excludedRemedies.filter((x): x is number => typeof x === 'number') : [],
        remedyFilter: Array.isArray(a.remedyFilter) ? a.remedyFilter.filter((x): x is number => typeof x === 'number') : null,
        highlight: Array.isArray(a.highlight) ? a.highlight.filter((x): x is number => typeof x === 'number') : null,
      },
      prescriptions: (Array.isArray(c.prescriptions) ? c.prescriptions : []).filter(isObj).filter(rx => typeof rx.remedyId === 'number').map(rx => ({
        id: str(rx.id, 'rx'), remedyId: rx.remedyId as number, potency: str(rx.potency), dosage: str(rx.dosage), date: str(rx.date), note: str(rx.note),
      })),
      ...(isObj(c.response) ? { response: { score: responseScore(c.response.score), note: str(c.response.note) } } : {}),
      createdAt: num(c.createdAt, Date.now()), updatedAt: num(c.updatedAt, Date.now()),
    }
  })
  const rubrics: Record<string, string> = {}
  if (isObj(raw.rubrics)) for (const [k, v] of Object.entries(raw.rubrics)) if (typeof v === 'string') rubrics[k] = v
  const remedies: Record<string, string> = {}
  if (isObj(raw.remedies)) for (const [k, v] of Object.entries(raw.remedies)) if (typeof v === 'string') remedies[k] = v
  const warnings: string[] = []
  if (unknownStrategies.size) {
    warnings.push(`unknown analysis strategy ${[...unknownStrategies].map(x => `"${x}"`).join(', ')} replaced by the default`)
  }
  return {
    format: CASE_FORMAT, version: CASE_VERSION, exportedAt: str(raw.exportedAt), app: str(raw.app), patient, consultations, rubrics, remedies,
    ...(warnings.length ? { warnings } : {}),
  }
}

export interface ImportContext {
  /** Current path of a ref, or null when unknown / repertory not loaded. */
  rubricPath: (ref: RubricRef) => string | null
  /** Resolve a path in a repertory to a rubric index (-1 when absent). */
  resolve: (repertory: string, path: string) => number
  /** Remedy id for an abbreviation, when known. */
  remedyByAbbrev: (abbrev: string) => number | undefined
  remedyAbbrev: (id: number) => string
  existing: Patient[]
  /** Consultations already on file (merge skips the ones the case file already brought in). */
  existingConsultations?: Consultation[]
}

/**
 * How an import treats a patient that is already on file:
 * - `new`: a separate record (fresh ids), the existing patient stays as it is;
 * - `replace`: the existing record takes the file's personal data and consultations (its old consultations go);
 * - `merge`: the existing record keeps its data and gains the file's consultations it does not have yet.
 */
export type ImportMode = 'new' | 'replace' | 'merge'

export interface ImportResult {
  mode: ImportMode
  patient: Patient
  /** Consultations to insert. */
  consultations: Consultation[]
  /** Consultations of the existing patient that a replace removes. */
  replaces: string[]
  /** Consultations a merge skipped because the patient already has them. */
  skipped: number
  /** Refs whose path changed and were re-resolved. */
  remapped: number
  /** Refs that could not be verified (repertory missing or path no longer found). */
  unresolved: number
  /** The patient on file that matches the case file (same id, or same name and birth date). */
  duplicateOf: Patient | null
}

const fold = (s: string) => s.trim().toLowerCase()

/** The patient on file that a case file describes: the same record (id), or the same person (name and birth date). */
export function findExistingPatient(file: Pick<CaseFile, 'patient'>, existing: Patient[]): { patient: Patient; by: 'id' | 'person' } | null {
  const same = existing.find(p => p.id === file.patient.id)
  if (same) return { patient: same, by: 'id' }
  const person = existing.find(p =>
    fold(p.firstName) === fold(file.patient.firstName) && fold(p.lastName) === fold(file.patient.lastName) &&
    (p.birthDate ?? '') === (file.patient.birthDate ?? ''))
  return person ? { patient: person, by: 'person' } : null
}

/** Whether a consultation from a case file is already among `have` (same record, or same visit recorded at the same moment). */
function alreadyHave(c: Consultation, have: Consultation[]): boolean {
  return have.some(h => h.id === c.id || (h.date === c.date && h.createdAt === c.createdAt && fold(h.title) === fold(c.title)))
}

/**
 * Turn a parsed case file into records. Every consultation, clipboard, symptom and prescription
 * gets a fresh id. The patient is a new record (`new`), or the existing one for `replace` and
 * `merge`. Rubric refs are checked against the recorded paths and re-resolved when the
 * repertory data moved; remedy ids (prescriptions, exclusions, family limit and highlight) are
 * checked against the recorded abbreviations.
 */
export function importCaseFile(file: CaseFile, ctx: ImportContext, now = Date.now(), mode: ImportMode = 'new'): ImportResult {
  let remapped = 0, unresolved = 0
  const refMap = new Map<string, string>()
  const mapRef = (ref: RubricRef): RubricRef => {
    const hit = refMap.get(ref)
    if (hit) return hit
    let out = ref
    const recorded = file.rubrics[ref]
    if (recorded) {
      const current = ctx.rubricPath(ref)
      if (current === null || current.toLowerCase() !== recorded.toLowerCase()) {
        const rep = ref.slice(0, ref.lastIndexOf(':'))
        const i = ctx.resolve(rep, recorded)
        if (i >= 0) { out = `${rep}:${i}`; if (out !== ref) remapped++ }
        else unresolved++
      }
    } else if (ctx.rubricPath(ref) === null) unresolved++
    refMap.set(ref, out)
    return out
  }
  const mapRemedy = (id: number): number => {
    const ab = file.remedies[id]
    if (!ab || ctx.remedyAbbrev(id).toLowerCase() === ab.toLowerCase()) return id
    return ctx.remedyByAbbrev(ab) ?? id
  }
  const match = findExistingPatient(file, ctx.existing)
  const duplicateOf = match?.patient ?? null
  const target = mode !== 'new' ? duplicateOf : null
  if (mode !== 'new' && !target) mode = 'new'

  let patient: Patient
  if (target && mode === 'replace') {
    patient = { ...file.patient, id: target.id, createdAt: target.createdAt, tags: [...file.patient.tags], updatedAt: now }
  } else if (target) {
    patient = target
  } else {
    patient = { ...file.patient, id: uid('p'), tags: [...new Set([...file.patient.tags, 'imported'])], updatedAt: now }
  }
  const have = target ? (ctx.existingConsultations ?? []).filter(c => c.patientId === target.id) : []
  let skipped = 0
  const source = mode === 'merge' ? file.consultations.filter(c => (alreadyHave(c, have) ? (skipped++, false) : true)) : file.consultations
  const consultations = source.map(c => copyConsultation(c, patient.id, { remapRef: mapRef, remapRemedy: mapRemedy, keepAddedAt: true }))
  return {
    mode, patient, consultations, replaces: mode === 'replace' ? have.map(c => c.id) : [], skipped,
    remapped, unresolved, duplicateOf,
  }
}

function responseScore(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -3 && v <= 4 ? v : null
}
