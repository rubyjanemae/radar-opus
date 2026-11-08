import type { Clipboard, Symptom } from '../engine/model'
import { uid } from '../state/ids'
import type { Consultation, Patient } from '../state/patients'
import { CLIPBOARD_COLORS, DEFAULT_ANALYSIS } from '../state/store'
import { ACUTES, ARCHETYPES, CHRONIC, COMMON_RUBRICS } from './cases'
import { resolvePath } from './rubrics'
import type { PathRepertory } from './rubrics'

/**
 * RadarOpus's start state as the parity comparisons capture it (`?seed=ro`): the practice case
 * "Oefen Casus" (born 01-01-2000, male, code 1, one consultation on 01-11-2026) alone in the patients
 * list and open, its three clipboards holding 24, 18 and 9 symptoms with clipboard 2 active, the
 * repertory at MIND - WEARISOME, and "cough dry" as the toolbar search box's last query.
 * The rubrics are real Publicum rubrics (RadarOpus's case uses Synthesis ones: a dataset difference).
 */
export const RO_START = {
  firstName: 'Oefen', lastName: 'Casus', birthDate: '2000-01-01', consultationDate: '2026-11-01',
  clipboardSizes: [24, 18, 9] as const, activeClipboard: 1, lastSearch: 'cough dry', rubric: 'Mind, wearisome',
}

export interface RoStart {
  patient: Patient
  consultation: Consultation
  /** The rubric the repertory window shows (MIND - WEARISOME, else the first chapter). */
  rubric: number
}

/** The rubric paths of the demo case material, in a fixed order, each once. */
function candidatePaths(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (p: string) => { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p) } }
  for (const t of [...ARCHETYPES, ...CHRONIC, ...ACUTES]) for (const r of t.rubrics) add(r.p)
  COMMON_RUBRICS.forEach(add)
  return out
}

export function buildRoStart(rep: PathRepertory & { abbrev: string }, now: number): RoStart {
  const created = Date.parse(`${RO_START.consultationDate}T11:37:07`) || now
  const patient: Patient = {
    id: uid('p'), firstName: RO_START.firstName, lastName: RO_START.lastName, birthDate: RO_START.birthDate, sex: 'male',
    email: '', phone: '', address: '', occupation: '', notes: '', tags: [], code: '1', createdAt: created, updatedAt: created,
  }
  const refs: string[] = []
  for (const p of candidatePaths()) {
    const i = resolvePath(rep, p)
    const ref = `${rep.abbrev}:${i}`
    if (i >= 0 && !refs.includes(ref)) refs.push(ref)
  }
  let k = 0
  const clipboards: Clipboard[] = RO_START.clipboardSizes.map((n, ci) => {
    const symptoms: Symptom[] = refs.slice(k, k + n).map((ref, j) => ({
      id: uid('s'), rubrics: [ref], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: created + (k + j) * 1000,
    }))
    k += n
    return { id: uid('cb'), name: `Clipboard ${ci + 1}`, color: CLIPBOARD_COLORS[ci % CLIPBOARD_COLORS.length], symptoms }
  })
  const consultation: Consultation = {
    id: uid('c'), patientId: patient.id, date: RO_START.consultationDate, title: 'Consultation', kind: 'first',
    complaint: '', notes: '', assessment: '', clipboards, prescriptions: [], createdAt: created, updatedAt: created,
    // RadarOpus S0: only clipboard 1 is in the analysis (its rail icon carries the check marks; "24 symptom(s)")
    analysis: { ...DEFAULT_ANALYSIS, clipboardIds: clipboards.slice(0, 1).map(c => c.id) },
  }
  const w = resolvePath(rep, RO_START.rubric)
  return { patient, consultation, rubric: w >= 0 ? w : rep.chapters[0] ?? 0 }
}
