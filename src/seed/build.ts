import type { Clipboard, Symptom } from '../engine/model'
import { uid } from '../state/ids'
import type { Consultation, Patient, Prescription } from '../state/patients'
import { CLIPBOARD_COLORS, DEFAULT_ANALYSIS } from '../state/store'
import {
  ACUTES, ACUTE_FOLLOW, ARCHETYPES, CHRONIC, COMMON_RUBRICS, FEMALE_NAMES, FOLLOW_UP_ASSESSMENTS, FOLLOW_UP_NOTES,
  LAST_NAMES, MALE_NAMES, OCCUPATIONS, PATIENT_NOTES, STREETS, TOWNS,
} from './cases'
import type { CaseTemplate, RubricSpec } from './cases'
import { resolvePath } from './rubrics'
import type { PathRepertory } from './rubrics'

/** Small deterministic PRNG (mulberry32) so the demo practice is the same on every first run. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  }
}

export interface SeedInput {
  rep: PathRepertory & { abbrev: string }
  /** Remedy id for an abbreviation ("Puls"), or undefined when unknown. */
  remedyId: (abbrev: string) => number | undefined
  now: number
  seed?: number
  /** Number of patients (default 45). */
  count?: number
}

export interface SeedOutput {
  patients: Record<string, Patient>
  consultations: Record<string, Consultation>
  /** Latest consultation of the Pulsatilla archetype: a good first active case. */
  activeConsultationId: string | null
  /** Paths that could not be resolved (for tests / diagnostics). */
  missing: string[]
  /** Archetype key → patient id. */
  archetypes: Record<string, string>
}

const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const POTENCY_LADDER = ['6C', '12C', '30C', '200C', '1M', '10M']

function nextPotency(p: string): string {
  const lm = /^LM(\d+)$/.exec(p)
  if (lm) return `LM${Number(lm[1]) + 1}`
  const i = POTENCY_LADDER.indexOf(p)
  return i >= 0 && i < POTENCY_LADDER.length - 1 ? POTENCY_LADDER[i + 1] : p
}

function ascii(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase() }

/** Build the demo practice. Pure apart from id generation; deterministic for a given seed and `now`. */
export function buildDemoPractice(input: SeedInput): SeedOutput {
  const { rep, now } = input
  const r = rng(input.seed ?? 20260929)
  const count = input.count ?? 45
  const patients: Record<string, Patient> = {}
  const consultations: Record<string, Consultation> = {}
  const missing = new Set<string>()
  const archetypes: Record<string, string> = {}
  const usedNames = new Set<string>()

  const refOf = (path: string): string | null => {
    const i = resolvePath(rep, path)
    if (i < 0) { missing.add(path); return null }
    return `${rep.abbrev}:${i}`
  }

  const makeClipboards = (t: CaseTemplate, specs: RubricSpec[], at: number): Clipboard[] => {
    const cbs: Clipboard[] = t.clipboards.map((name, i) => ({ id: uid('cb'), name, color: CLIPBOARD_COLORS[i % CLIPBOARD_COLORS.length], symptoms: [] }))
    specs.forEach((s, k) => {
      const ref = refOf(s.p)
      if (!ref) return
      const cb = cbs[Math.min(s.cb ?? 0, cbs.length - 1)]
      if (cb.symptoms.some(x => x.rubrics[0] === ref)) return
      const sym: Symptom = {
        id: uid('s'), rubrics: [ref], combine: 'union', weight: s.w ?? 1, eliminatory: !!s.elim, exclusive: false,
        group: s.group ?? null, causal: !!s.causal, addedAt: at + k * 1000, ...(s.note ? { note: s.note } : {}),
      }
      cb.symptoms.push(sym)
    })
    return cbs
  }

  const cloneClipboards = (cbs: Clipboard[], at: number): Clipboard[] => cbs.map(cb => ({
    ...cb, id: uid('cb'), symptoms: cb.symptoms.map((s, k) => ({ ...s, id: uid('s'), rubrics: [...s.rubrics], addedAt: at + k * 1000 })),
  }))

  const rx = (t: CaseTemplate, potency: string, date: string, note = ''): Prescription[] => {
    const id = input.remedyId(t.remedy)
    return id === undefined ? [] : [{ id: uid('rx'), remedyId: id, potency, dosage: t.dosage, date, note }]
  }

  const addConsultation = (c: Omit<Consultation, 'id' | 'createdAt' | 'updatedAt' | 'analysis'>, at: number): Consultation => {
    const full: Consultation = {
      ...c, id: uid('c'), createdAt: at, updatedAt: at,
      analysis: { ...DEFAULT_ANALYSIS, clipboardIds: c.clipboards.map(cb => cb.id) },
    }
    consultations[full.id] = full
    return full
  }

  const rxLabel = (c: Consultation, t: CaseTemplate) => {
    const p = c.prescriptions[0]
    return p ? `${t.remedy} ${p.potency}` : t.remedy
  }

  const person = (sex: 'female' | 'male', age: number, occupation?: string): Patient => {
    let first = '', last = ''
    for (let tries = 0; tries < 50; tries++) {
      first = r.pick(sex === 'female' ? FEMALE_NAMES : MALE_NAMES)
      last = r.pick(LAST_NAMES)
      if (!usedNames.has(first + last)) break
    }
    usedNames.add(first + last)
    const birth = now - age * 365.25 * DAY - r.int(0, 360) * DAY
    const child = age < 16
    const occ = occupation ?? (child ? (age < 5 ? '' : 'Pupil') : age >= 67 ? 'Retired' : age < 23 ? r.pick(['Student', 'Apprentice', 'Student']) : r.pick(OCCUPATIONS.filter(o => o !== 'Retired' && o !== 'Student')))
    const created = now - r.int(30, 1090) * DAY
    return {
      id: uid('p'), firstName: first, lastName: last, birthDate: iso(birth), sex,
      email: child ? `${ascii(last)}.family@example.com` : `${ascii(first)}.${ascii(last)}@example.com`,
      phone: `+1 (${r.pick(['212', '415', '312', '617', '503'])}) 555-01${String(r.int(0, 99)).padStart(2, '0')}`,
      address: `${r.int(2, 180)} ${r.pick(STREETS)}, ${r.pick(TOWNS)}`,
      occupation: occ, notes: child ? `Accompanied by ${r.pick(['mother', 'father', 'both parents', 'grandmother'])}.` : r.pick(PATIENT_NOTES),
      tags: [], createdAt: created, updatedAt: created,
    }
  }

  /** Chronic course: first visit, follow-ups, optionally one acute episode. Returns the consultations oldest first. */
  const chronicCourse = (p: Patient, t: CaseTemplate, visits: number, full: boolean, acute: CaseTemplate | null): Consultation[] => {
    const out: Consultation[] = []
    let date = now - r.int(Math.max(60, visits * 50), 1080) * DAY
    date = Math.max(date, p.createdAt)
    // first visit
    let specs = t.rubrics
    if (!full) {
      specs = t.rubrics.filter((_, i) => i < 3 || r.chance(0.75))
      const extra = r.int(1, 2)
      for (let k = 0; k < extra; k++) specs = [...specs, { p: r.pick(COMMON_RUBRICS), w: 1 }]
    }
    let potency = t.potencies[0]
    const first = addConsultation({
      patientId: p.id, date: iso(date), title: 'First consultation', kind: 'first', complaint: t.complaint,
      notes: t.notes, assessment: t.assessment, clipboards: makeClipboards(t, specs, date), prescriptions: rx(t, potency, iso(date)),
    }, date)
    out.push(first)
    let prev = first
    const acuteAt = acute ? r.int(1, Math.max(1, visits - 1)) : -1
    for (let v = 1; v < visits; v++) {
      date += r.int(35, 80) * DAY
      if (date > now - DAY) break
      if (v === acuteAt && acute) {
        const a = addConsultation({
          patientId: p.id, date: iso(date), title: acute.title, kind: 'acute', complaint: acute.complaint, notes: acute.notes,
          assessment: acute.assessment, clipboards: makeClipboards(acute, acute.rubrics, date), prescriptions: rx(acute, acute.potencies[0], iso(date), 'Acute; constitutional treatment continues'),
        }, date)
        out.push(a)
        date += r.int(14, 30) * DAY
        if (date > now - DAY) break
      }
      const phone = r.chance(0.15)
      const noteFn = r.pick(FOLLOW_UP_NOTES)
      const raise = r.chance(0.5)
      if (raise) potency = nextPotency(potency)
      const fu = addConsultation({
        patientId: p.id, date: iso(date), title: `Follow-up ${v}`, kind: phone ? 'phone' : 'follow-up',
        complaint: t.complaint, notes: noteFn(rxLabel(prev, t)), assessment: r.pick(FOLLOW_UP_ASSESSMENTS),
        clipboards: cloneClipboards(prev.clipboards, date),
        prescriptions: rx(t, potency, iso(date), raise ? 'Potency raised' : 'Repeat'),
      }, date)
      out.push(fu)
      prev = fu
    }
    return out
  }

  const acuteCourse = (p: Patient, n: number, child: boolean): Consultation[] => {
    const out: Consultation[] = []
    const pool = ACUTES.filter(a => !child || a.paediatric)
    let date = Math.max(p.createdAt, now - r.int(120, 1000) * DAY)
    for (let k = 0; k < n; k++) {
      if (date > now - DAY) break
      const a = r.pick(pool)
      const c = addConsultation({
        patientId: p.id, date: iso(date), title: a.title, kind: 'acute', complaint: a.complaint,
        notes: `${a.notes}\n\nFollow-up call: ${ACUTE_FOLLOW}`, assessment: a.assessment,
        clipboards: makeClipboards(a, a.rubrics, date), prescriptions: rx(a, r.pick(a.potencies), iso(date)),
      }, date)
      out.push(c)
      date += r.int(60, 300) * DAY
    }
    return out
  }

  const finish = (p: Patient, cs: Consultation[], extraTags: string[]) => {
    const tags = new Set(extraTags)
    const age = p.birthDate ? (now - Date.parse(p.birthDate)) / (365.25 * DAY) : 99
    if (age < 16) tags.add('paediatric')
    if (cs.some(c => c.kind === 'first')) tags.add('chronic')
    if (cs.some(c => c.kind === 'acute')) tags.add('acute')
    const last = cs[cs.length - 1]
    if (tags.has('chronic') && last && now - Date.parse(last.date) > 90 * DAY) tags.add('follow-up due')
    if (last) p.updatedAt = Math.max(p.updatedAt, last.updatedAt)
    p.createdAt = Math.min(p.createdAt, ...cs.map(c => c.createdAt))
    p.tags = [...tags]
    patients[p.id] = p
  }

  // 1. archetypes with detailed cases
  const archetypeSetup: Record<string, { age: number; sex: 'female' | 'male'; occupation: string; visits: number; tags: string[] }> = {
    puls: { age: 29, sex: 'female', occupation: 'Teacher', visits: 4, tags: ["women's health"] },
    ars: { age: 64, sex: 'male', occupation: 'Retired accountant', visits: 5, tags: [] },
    sulph: { age: 42, sex: 'male', occupation: 'Software architect', visits: 3, tags: ['skin'] },
    lyc: { age: 51, sex: 'male', occupation: 'Lawyer', visits: 4, tags: [] },
    natm: { age: 38, sex: 'female', occupation: 'Librarian', visits: 3, tags: ['headache'] },
    phos: { age: 24, sex: 'female', occupation: 'Graphic designer', visits: 2, tags: [] },
    calc: { age: 6, sex: 'male', occupation: 'Pupil', visits: 4, tags: [] },
    nux: { age: 46, sex: 'male', occupation: 'Sales director', visits: 3, tags: ['stress'] },
  }
  let activeConsultationId: string | null = null
  for (const t of ARCHETYPES) {
    const s = archetypeSetup[t.key]
    const p = person(s.sex, s.age, s.occupation)
    const acute = r.chance(0.4) ? r.pick(ACUTES.filter(a => s.age >= 16 || a.paediatric)) : null
    const cs = chronicCourse(p, t, s.visits, true, acute)
    finish(p, cs, [...s.tags, 'constitutional'])
    archetypes[t.key] = p.id
    if (t.key === 'puls') activeConsultationId = cs[cs.length - 1]?.id ?? null
  }

  // 2. the rest of the practice
  const chronicPool = [...ARCHETYPES, ...CHRONIC]
  while (Object.keys(patients).length < count) {
    const child = r.chance(0.2)
    const age = child ? r.int(1, 15) : r.int(18, 84)
    const acuteOnly = r.chance(0.25)
    if (acuteOnly) {
      const p = person(r.chance(0.55) ? 'female' : 'male', age)
      finish(p, acuteCourse(p, r.int(1, 2), child), [])
      continue
    }
    const pool = chronicPool.filter(t => child ? (t.paediatric || t.key === 'puls' || t.key === 'phos' || t.key === 'sulph') : !t.paediatric)
    const t = r.pick(pool)
    const sex = t.sex ?? (r.chance(0.55) ? 'female' : 'male')
    const p = person(sex, age)
    const acute = r.chance(0.3) ? r.pick(ACUTES.filter(a => !child || a.paediatric)) : null
    const cs = chronicCourse(p, t, r.int(1, 5), false, acute)
    const extra: string[] = []
    if (r.chance(0.15)) extra.push('allergy')
    if (t.key === 'sep' || (t.key === 'puls' && sex === 'female' && !child)) extra.push("women's health")
    finish(p, cs, extra)
  }

  return { patients, consultations, activeConsultationId, missing: [...missing], archetypes }
}
