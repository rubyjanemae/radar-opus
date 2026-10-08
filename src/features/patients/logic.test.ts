import { describe, expect, it } from 'vitest'
import type { Consultation, Patient } from '../../state/patients'
import { DEFAULT_ANALYSIS } from '../../state/store'
import { fastest } from '../../testing/timing'
import {
  ageOf, comparePotency, consultationsOf, copyConsultation, duplicatePatient, filterRows, followUpFrom, formatAge, formatScoreSigned, ghhosLabel,
  analysisFilterNotes, formatDate, formatDateTime, nextFollowUpIndex, normalizeTag, patientName, patientRows, rubricHaystack, potencyRank, previousPrescription, relativeDate, sortRows, tagCounts, validatePatient,
} from './logic'

const NOW = Date.parse('2026-09-29T12:00:00')

function patient(id: string, over: Partial<Patient> = {}): Patient {
  return { id, firstName: 'Ann', lastName: 'Lee', birthDate: '1990-05-10', sex: 'female', email: '', phone: '', address: '', occupation: '', notes: '', tags: [], createdAt: 1, updatedAt: 1, ...over }
}

function consultation(id: string, patientId: string, date: string, over: Partial<Consultation> = {}): Consultation {
  return {
    id, patientId, date, title: 'C', kind: 'first', complaint: '', notes: '', assessment: '',
    clipboards: [{ id: `${id}-cb`, name: 'Clipboard 1', color: '#000', symptoms: [{ id: `${id}-s`, rubrics: ['publicum:5'], combine: 'union', weight: 2, eliminatory: true, exclusive: false, group: 'a', causal: false, addedAt: 1 }] }],
    analysis: { ...DEFAULT_ANALYSIS, clipboardIds: [`${id}-cb`] }, prescriptions: [], createdAt: Date.parse(date), updatedAt: Date.parse(date), ...over,
  }
}

describe('ages and names', () => {
  it('computes whole years, respecting the birthday', () => {
    expect(ageOf('1990-09-29', NOW)).toBe(36)
    expect(ageOf('1990-09-30', NOW)).toBe(35)
    expect(ageOf(null, NOW)).toBeNull()
    expect(ageOf('garbage', NOW)).toBeNull()
    expect(ageOf('2030-01-01', NOW)).toBeNull()
  })
  it('shows months for babies', () => {
    expect(formatAge('2026-01-15', NOW)).toBe('8 mo')
    expect(formatAge('2020-01-15', NOW)).toBe('6')
  })
  it('formats names "Last, First" with fallbacks', () => {
    expect(patientName({ firstName: 'Ann', lastName: 'Lee' })).toBe('Lee, Ann')
    expect(patientName({ firstName: ' ', lastName: 'Lee' })).toBe('Lee')
    expect(patientName({ firstName: '', lastName: '' })).toBe('Unnamed patient')
  })
})

describe('validatePatient', () => {
  it('requires a name', () => {
    expect(validatePatient({ firstName: '', lastName: '' }).lastName).toBeTruthy()
    expect(validatePatient({ firstName: 'A', lastName: '' })).toEqual({})
  })
  it('checks email, phone and birth date', () => {
    const e = validatePatient({ firstName: 'A', email: 'nope', phone: 'abc', birthDate: '2999-01-01' }, NOW)
    expect(Object.keys(e).sort()).toEqual(['birthDate', 'email', 'phone'])
    expect(validatePatient({ firstName: 'A', email: 'a@example.com', phone: '+1 (212) 555-0100', birthDate: '1980-02-03' }, NOW)).toEqual({})
  })
  it('normalises tags', () => { expect(normalizeTag('  Chronic   Pain ')).toBe('chronic pain') })
})

describe('consultations', () => {
  const cs = { a: consultation('a', 'p1', '2025-01-01'), b: consultation('b', 'p1', '2026-02-01', { kind: 'follow-up' }), c: consultation('c', 'p2', '2026-03-01') }
  it('lists a patient\'s consultations newest first', () => {
    expect(consultationsOf(cs, 'p1').map(c => c.id)).toEqual(['b', 'a'])
    expect(nextFollowUpIndex(consultationsOf(cs, 'p1'))).toBe(2)
  })
  it('follow-up copies clipboards with fresh ids and remaps analysis clipboards', () => {
    const f = followUpFrom(cs.b, '2026-09-29', 2)
    expect(f.kind).toBe('follow-up')
    expect(f.title).toBe('Follow-up 2')
    expect(f.clipboards![0].id).not.toBe(cs.b.clipboards[0].id)
    expect(f.clipboards![0].symptoms[0].id).not.toBe(cs.b.clipboards[0].symptoms[0].id)
    expect(f.clipboards![0].symptoms[0]).toMatchObject({ rubrics: ['publicum:5'], weight: 2, eliminatory: true, group: 'a' })
    expect(f.analysis!.clipboardIds).toEqual([f.clipboards![0].id])
    expect(f.prescriptions).toEqual([])
  })
  it('copies consultations onto another patient with fresh ids', () => {
    const src = consultation('x', 'p1', '2026-01-01', { prescriptions: [{ id: 'rx1', remedyId: 7, potency: '30C', dosage: '', date: '2026-01-01', note: '' }] })
    const c = copyConsultation(src, 'p9', r => r.replace('publicum', 'kent'))
    expect(c.id).not.toBe('x')
    expect(c.patientId).toBe('p9')
    expect(c.prescriptions[0].id).not.toBe('rx1')
    expect(c.clipboards[0].symptoms[0].rubrics).toEqual(['kent:5'])
    expect(src.clipboards[0].symptoms[0].rubrics).toEqual(['publicum:5'])
  })
  it('duplicates a patient with all consultations', () => {
    const d = duplicatePatient(patient('p1'), consultationsOf(cs, 'p1'))
    expect(d.patient.id).not.toBe('p1')
    expect(d.patient.lastName).toBe('Lee (copy)')
    expect(d.consultations).toHaveLength(2)
    expect(d.consultations.every(c => c.patientId === d.patient.id)).toBe(true)
  })
})

describe('patient list rows', () => {
  const patients = {
    p1: patient('p1', { firstName: 'Zoe', lastName: 'Adams', birthDate: '2000-01-01', tags: ['chronic'], email: 'zoe@example.com' }),
    p2: patient('p2', { firstName: 'Bob', lastName: 'Young', birthDate: '1950-01-01', tags: ['acute', 'chronic'], sex: 'male' }),
    p3: patient('p3', { firstName: 'Cy', lastName: 'Mills', birthDate: null, tags: [] }),
  }
  const cs = {
    a: consultation('a', 'p1', '2026-01-01', { complaint: 'Migraine', prescriptions: [{ id: 'r', remedyId: 801, potency: '200C', dosage: '', date: '2026-01-01', note: '' }] }),
    b: consultation('b', 'p2', '2026-05-01'), c: consultation('c', 'p2', '2025-05-01'),
  }
  const ab = (id: number) => (id === 801 ? 'Nat-m' : '?')
  const rows = patientRows(patients, cs, ab, NOW)

  it('derives age, counts, last visit and last prescription', () => {
    const r2 = rows.find(r => r.patient.id === 'p2')!
    expect(r2.consultations).toBe(2)
    expect(r2.lastVisit).toBe('2026-05-01')
    expect(rows.find(r => r.patient.id === 'p1')!.lastRx?.potency).toBe('200C')
  })
  it('sorts by any column, empty values last', () => {
    const s = (key: Parameters<typeof sortRows>[1]['key'], dir: 1 | -1) => sortRows(rows, { key, dir }, ab).map(r => r.patient.id)
    expect(s('name', 1)).toEqual(['p1', 'p3', 'p2'])
    expect(s('age', 1)).toEqual(['p1', 'p2', 'p3'])
    expect(s('age', -1)).toEqual(['p2', 'p1', 'p3'])
    expect(s('lastVisit', -1)).toEqual(['p2', 'p1', 'p3'])
    expect(s('consultations', -1)).toEqual(['p2', 'p1', 'p3'])
  })
  it('filters by words (name, contact, complaint, remedy) and tags', () => {
    expect(filterRows(rows, 'zoe', []).map(r => r.patient.id)).toEqual(['p1'])
    expect(filterRows(rows, 'migraine nat-m', []).map(r => r.patient.id)).toEqual(['p1'])
    expect(filterRows(rows, '', ['chronic']).length).toBe(2)
    expect(filterRows(rows, '', ['chronic', 'acute']).map(r => r.patient.id)).toEqual(['p2'])
    expect(filterRows(rows, 'nobody', []).length).toBe(0)
  })
  it('counts tags', () => {
    expect(tagCounts(Object.values(patients))).toEqual([{ tag: 'chronic', count: 2 }, { tag: 'acute', count: 1 }])
  })
})

describe('relativeDate', () => {
  it('reads naturally', () => {
    expect(relativeDate('2026-09-29', NOW)).toBe('today')
    expect(relativeDate('2026-09-28', NOW)).toBe('yesterday')
    expect(relativeDate('2026-09-20', NOW)).toBe('9 days ago')
    expect(relativeDate('2026-06-29', NOW)).toBe('3 months ago')
    expect(relativeDate(null, NOW)).toBe('')
  })
})

describe('potency order', () => {
  it('orders decimal < centesimal (C, M, CM) < LM, numerically', () => {
    const list = ['1M', 'LM12', '30C', '200C', '6X', 'CM', '10M', '6C', 'LM2', '12', '50M']
    expect([...list].sort(comparePotency)).toEqual(['6X', '6C', '12', '30C', '200C', '1M', '10M', '50M', 'CM', 'LM2', 'LM12'])
    expect(potencyRank('q3')).toEqual([2, 3])
    expect(potencyRank('odd')[0]).toBe(3)
  })
  it('sorts the Last prescription column by remedy, then potency scale', () => {
    const rx = (id: string, remedyId: number, potency: string) => ({ id, remedyId, potency, dosage: '', date: '2026-01-01', note: '' })
    const ps = { a: patient('a', { lastName: 'A' }), b: patient('b', { lastName: 'B' }), c: patient('c', { lastName: 'C' }), d: patient('d', { lastName: 'D' }) }
    const cs = {
      a: consultation('a1', 'a', '2026-01-01', { prescriptions: [rx('1', 1, '1M')] }),
      b: consultation('b1', 'b', '2026-01-01', { prescriptions: [rx('2', 1, '30C')] }),
      c: consultation('c1', 'c', '2026-01-01', { prescriptions: [rx('3', 2, '6C')] }),
      d: consultation('d1', 'd', '2026-01-01', { prescriptions: [rx('4', 1, 'LM1')] }),
    }
    const ab = (id: number) => (id === 1 ? 'Ars' : 'Puls')
    const sorted = sortRows(patientRows(ps, cs, ab, NOW), { key: 'lastRx', dir: 1 }, ab).map(r => r.patient.id)
    expect(sorted).toEqual(['b', 'a', 'd', 'c'])
  })
})

describe('search text', () => {
  it('covers notes, assessments, responses, prescribed remedies and rubric text', () => {
    const ps = { a: patient('a', { notes: 'allergic to penicillin' }) }
    const cs = { a1: consultation('a1', 'a', '2026-01-01', {
      notes: 'wakes at 3 a.m.', assessment: 'differential Nux', response: { score: 2, note: 'direction of cure' },
      prescriptions: [{ id: 'r', remedyId: 7, potency: '200C', dosage: '', date: '2026-01-01', note: '' }],
    }) }
    const rows = patientRows(ps, cs, () => 'Puls', NOW, { remedyName: () => 'Pulsatilla pratensis', rubricText: () => 'Stomach thirstless' })
    for (const q of ['penicillin', '3 a.m.', 'differential', 'direction of cure', 'pulsatilla', 'puls', 'thirstless']) expect(filterRows(rows, q, [])).toHaveLength(1)
    expect(filterRows(rows, 'thirsty', [])).toHaveLength(0)
  })
})

describe('follow-up response', () => {
  it('labels the GHHOS scale', () => {
    expect(ghhosLabel(4)).toBe('Cured or almost cured')
    expect(ghhosLabel(null)).toBe('')
    expect(formatScoreSigned(2)).toBe('+2')
    expect(formatScoreSigned(-1)).toBe('\u22121')
  })
  it('evaluates the latest earlier prescription, skipping acute interludes for follow-ups', () => {
    const rx = (id: string, remedyId: number, date: string) => ({ id, remedyId, potency: '30C', dosage: '', date, note: '' })
    const first = consultation('c1', 'p', '2026-01-01', { prescriptions: [rx('r1', 1, '2026-01-01')] })
    const acute = consultation('c2', 'p', '2026-02-01', { kind: 'acute', prescriptions: [rx('r2', 2, '2026-02-01')] })
    const fu = consultation('c3', 'p', '2026-03-01', { kind: 'follow-up' })
    const acute2 = consultation('c4', 'p', '2026-03-05', { kind: 'acute' })
    const list = [acute2, fu, acute, first]
    expect(previousPrescription(list, fu)?.rx.id).toBe('r1')
    expect(previousPrescription(list, acute2)?.rx.id).toBe('r2')
    expect(previousPrescription(list, first)).toBeNull()
  })
})

describe('patient rows at scale', () => {
  it('memoises rows per patient and consultation objects', () => {
    const ps = { a: patient('a', { lastName: 'A' }), b: patient('b', { lastName: 'B' }) }
    const cs = { a1: consultation('a1', 'a', '2026-01-01'), b1: consultation('b1', 'b', '2026-01-01') }
    const ab = () => 'X'
    const r1 = patientRows(ps, cs, ab, NOW)
    const r2 = patientRows({ ...ps }, { ...cs }, ab, NOW)
    expect(r2[0]).toBe(r1[0])
    // editing one consultation rebuilds only that patient's row
    const r3 = patientRows(ps, { ...cs, b1: { ...cs.b1, title: 'changed' } }, ab, NOW)
    expect(r3[0]).toBe(r1[0])
    expect(r3[1]).not.toBe(r1[1])
    // a new day recomputes ages
    expect(patientRows(ps, cs, ab, NOW + 86_400_000)[0]).not.toBe(r1[0])
  })
  it('builds rubric search text lazily, only for queries the rest of the text does not answer', () => {
    let calls = 0
    const ps = { a: patient('a', { lastName: 'Adams' }) }
    const cs = { a1: consultation('a1', 'a', '2026-01-01', { clipboards: [{ id: 'cb', name: 'C', color: '#000', symptoms: [{ id: 's', rubrics: ['publicum:1'], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 1 }] }] }) }
    const rows = patientRows(ps, cs, () => 'X', NOW, { rubricText: () => { calls++; return 'Mind anxiety' } })
    expect(filterRows(rows, 'adams', [])).toHaveLength(1)
    expect(calls).toBe(0)
    expect(filterRows(rows, 'anxiety', [])).toHaveLength(1)
    expect(filterRows(rows, 'mind', [])).toHaveLength(1)
    expect(calls).toBe(1)
    expect(rubricHaystack(rows[0])).toBe('mind anxiety')
  })
  it('does not keep rubric text while a repertory is still loading', () => {
    let loaded = false
    const ps = { a: patient('a') }
    const cs = { a1: consultation('a1', 'a', '2026-01-01', { clipboards: [{ id: 'cb', name: 'C', color: '#000', symptoms: [{ id: 's', rubrics: ['kent-de:1'], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 1 }] }] }) }
    const rows = patientRows(ps, cs, () => 'X', NOW, { rubricText: () => (loaded ? 'Gemüt Angst' : null) })
    expect(filterRows(rows, 'angst', [])).toHaveLength(0)
    loaded = true
    expect(filterRows(rows, 'angst', [])).toHaveLength(1)
  })
  it('sorts 2,000 patients by precomputed keys quickly', () => {
    const ps: Record<string, ReturnType<typeof patient>> = {}
    const cs: Record<string, ReturnType<typeof consultation>> = {}
    for (let i = 0; i < 2000; i++) {
      ps[`p${i}`] = patient(`p${i}`, { lastName: `Name${(i * 7919) % 2000}`, firstName: 'Ann', tags: i % 3 ? ['chronic'] : [] })
      for (let k = 0; k < 3; k++) cs[`c${i}-${k}`] = consultation(`c${i}-${k}`, `p${i}`, `2026-0${1 + k}-1${i % 9}`, { prescriptions: [{ id: `r${i}${k}`, remedyId: i % 50, potency: '30C', dosage: '', date: '2026-01-01', note: '' }] })
    }
    const ab = (id: number) => `R${id}`
    // Budgets on the fastest of a few runs (preemption only adds time). The default budgets are loose
    // (5x) so a loaded CI machine does not fail them; PERF=1 checks the real targets.
    const strict = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PERF
    const loose = strict ? 1 : 5
    // cold: fresh patient records each run, so no row comes from the per-patient memo
    let fresh = ps
    const build = fastest(3, () => {
      const rows = patientRows(fresh, cs, ab, NOW)
      for (const key of ['name', 'lastVisit', 'lastRx', 'tags', 'age'] as const) sortRows(rows, { key, dir: 1 })
      return rows
    }, () => { fresh = Object.fromEntries(Object.entries(ps).map(([k, p]) => [k, { ...p }])) })
    expect(build.result).toHaveLength(2000)
    expect(build.ms).toBeLessThan(500 * loose)
    // rows are memoised per patient: rebuilding with the same records is cheap
    patientRows(ps, cs, ab, NOW)
    const again = fastest(3, () => patientRows({ ...ps }, { ...cs }, ab, NOW))
    expect(again.result).toHaveLength(2000)
    expect(again.ms).toBeLessThan(100 * loose)
  })
})

describe('dates', () => {
  it('formats calendar dates and moments with the one medium style', () => {
    const d = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date('2026-09-02T00:00:00'))
    expect(formatDate('2026-09-02')).toBe(d)
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('not a date')
    const t = new Date('2026-09-02T14:05:00').getTime()
    expect(formatDateTime(t)).toBe(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(t))
    expect(formatDateTime(null)).toBe('')
  })
})

describe('analysis filter notes', () => {
  it('names the family limit, highlight, exclusions and minimum coverage', () => {
    const ab = (id: number) => ['Puls', 'Sep', 'Nat-m', 'Sulph'][id] ?? `#${id}`
    expect(analysisFilterNotes({ remedyFilter: null, excludedRemedies: [], minCoverage: 0 }, ab)).toEqual([])
    expect(analysisFilterNotes({ remedyFilter: [1, 2], filterLabel: 'Solanaceae', highlight: [0], highlightLabel: null, excludedRemedies: [0, 1, 2, 3], minCoverage: 3 }, ab)).toEqual([
      'Limited to Solanaceae', 'Highlighting 1 remedy', 'Excluding Puls, Sep, Nat-m and 1 more', 'Minimum coverage 3 symptoms',
    ])
    expect(analysisFilterNotes({ remedyFilter: [1, 2], excludedRemedies: [], minCoverage: 1 }, ab)).toEqual(['Limited to 2 remedies', 'Minimum coverage 1 symptom'])
  })
})
