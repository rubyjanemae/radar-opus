import { describe, expect, it } from 'vitest'
import type { Consultation, Patient } from '../../state/patients'
import { DEFAULT_ANALYSIS } from '../../state/store'
import { DEFAULT_PARAMS, DEFAULT_STRATEGY } from '../../engine/model'
import { buildCaseFile, caseFileName, CaseFileError, findExistingPatient, importCaseFile, parseCaseFile } from './casefile'
import type { ImportContext } from './casefile'

const patient: Patient = {
  id: 'p1', firstName: 'Élise', lastName: 'Martin', birthDate: '1985-04-02', sex: 'female', email: 'elise@example.com', phone: '555-0101',
  address: '1 Elm Street', occupation: 'Teacher', notes: 'note', tags: ['chronic'], createdAt: 1, updatedAt: 2,
}
const consultation: Consultation = {
  id: 'c1', patientId: 'p1', date: '2026-01-10', title: 'First', kind: 'first', complaint: 'Sinusitis', notes: 'Weepy', assessment: 'Puls',
  clipboards: [{ id: 'cb1', name: 'Case', color: '#2f6fdb', symptoms: [
    { id: 's1', rubrics: ['publicum:10'], combine: 'union', weight: 3, eliminatory: true, exclusive: false, group: null, causal: false, addedAt: 1 },
    { id: 's2', rubrics: ['publicum:20', 'publicum:21'], combine: 'intersection', weight: 1, eliminatory: false, exclusive: false, group: 'b', causal: true, addedAt: 2, note: 'n' },
  ] }],
  analysis: { ...DEFAULT_ANALYSIS, clipboardIds: ['cb1'], excludedRemedies: [5] },
  prescriptions: [{ id: 'rx1', remedyId: 945, potency: '200C', dosage: 'single dose', date: '2026-01-10', note: '' }],
  createdAt: 10, updatedAt: 11,
}

const paths: Record<string, string> = { 'publicum:10': 'Mind, weeping', 'publicum:20': 'Stomach, thirstless', 'publicum:21': 'Generalities, air, open, amel.' }
const remedies: Record<number, string> = { 945: 'Puls', 5: 'Acon' }

function ctx(over: Partial<ImportContext> = {}): ImportContext {
  return {
    rubricPath: r => paths[r] ?? null,
    resolve: () => -1,
    remedyByAbbrev: ab => Number(Object.entries(remedies).find(([, a]) => a === ab)?.[0]) || undefined,
    remedyAbbrev: id => remedies[id] ?? `#${id}`,
    existing: [],
    ...over,
  }
}

describe('case files', () => {
  const file = buildCaseFile(patient, [consultation], { rubricPath: r => paths[r] ?? null, remedyAbbrev: id => remedies[id] }, new Date('2026-09-29T10:00:00Z'))

  it('records format, version, rubric paths and remedy abbreviations', () => {
    expect(file.format).toBe('radar-opus-case')
    expect(file.version).toBe(1)
    expect(file.rubrics).toEqual(paths)
    expect(file.remedies).toEqual({ 945: 'Puls' })
  })

  it('round-trips through JSON with every id fresh', () => {
    const parsed = parseCaseFile(JSON.stringify(file))
    const res = importCaseFile(parsed, ctx())
    expect(res.patient.id).not.toBe('p1')
    expect(res.patient.firstName).toBe('Élise')
    expect(res.patient.tags).toEqual(['chronic', 'imported'])
    const c = res.consultations[0]
    expect(c.id).not.toBe('c1')
    expect(c.patientId).toBe(res.patient.id)
    expect(c.clipboards[0].id).not.toBe('cb1')
    expect(c.analysis.clipboardIds).toEqual([c.clipboards[0].id])
    expect(c.analysis.excludedRemedies).toEqual([5])
    expect(c.clipboards[0].symptoms.map(s => s.id)).not.toContain('s1')
    expect(c.clipboards[0].symptoms[1]).toMatchObject({ rubrics: ['publicum:20', 'publicum:21'], combine: 'intersection', group: 'b', causal: true, note: 'n' })
    expect(c.prescriptions[0]).toMatchObject({ remedyId: 945, potency: '200C' })
    expect(c.prescriptions[0].id).not.toBe('rx1')
    expect(res.remapped).toBe(0)
    expect(res.unresolved).toBe(0)
  })

  it('replaces an unknown strategy by the default, reports it, and merges params numerically', () => {
    const raw = JSON.parse(JSON.stringify(file))
    raw.consultations[0].analysis.strategy = 'made-up'
    raw.consultations[0].analysis.limit = 'many'
    raw.consultations[0].analysis.params = { smallRubrics: { threshold: '5', factor: 3 }, segments: { topK: Number.NaN }, kent: { weights: { mental: 9 } }, bogus: { x: 1 } }
    const parsed = parseCaseFile(JSON.stringify(raw))
    const a = parsed.consultations[0].analysis
    expect(a.strategy).toBe(DEFAULT_STRATEGY)
    expect(a.limit).toBe(DEFAULT_ANALYSIS.limit)
    expect(a.params).toEqual({
      ...DEFAULT_PARAMS,
      smallRubrics: { threshold: DEFAULT_PARAMS.smallRubrics.threshold, factor: 3 },
      kent: { ...DEFAULT_PARAMS.kent, weights: { ...DEFAULT_PARAMS.kent.weights, mental: 9 } },
    })
    expect(parsed.warnings).toEqual(['unknown analysis strategy "made-up" replaced by the default'])
    // a known strategy passes through without a warning
    raw.consultations[0].analysis.strategy = 'kent'
    const ok = parseCaseFile(JSON.stringify(raw))
    expect(ok.consultations[0].analysis.strategy).toBe('kent')
    expect(ok.warnings).toBeUndefined()
    expect(parseCaseFile(JSON.stringify(file)).consultations[0].analysis.params).toBeUndefined()
  })

  it('finds the patient on file by id, then by name and birth date', () => {
    const f = parseCaseFile(JSON.stringify(file))
    expect(findExistingPatient(f, [patient])).toMatchObject({ by: 'id', patient: { id: 'p1' } })
    const other = { ...patient, id: 'p9', firstName: ' élise ', lastName: 'MARTIN' }
    expect(findExistingPatient(f, [other])).toMatchObject({ by: 'person', patient: { id: 'p9' } })
    expect(findExistingPatient(f, [{ ...other, birthDate: '1990-01-01' }])).toBeNull()
  })

  it('keeps both: a separate record, the name untouched', () => {
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), ctx({ existing: [patient] }))
    expect(res.mode).toBe('new')
    expect(res.duplicateOf?.id).toBe('p1')
    expect(res.patient.id).not.toBe('p1')
    expect(res.patient.lastName).toBe('Martin')
    expect(res.replaces).toEqual([])
  })

  it('replace: the record on file takes the file data and consultations', () => {
    const onFile = { ...patient, occupation: 'Retired', createdAt: 0 }
    const old = { ...consultation, id: 'old', patientId: 'p1' }
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), ctx({ existing: [onFile], existingConsultations: [old] }), 5, 'replace')
    expect(res.mode).toBe('replace')
    expect(res.patient).toMatchObject({ id: 'p1', occupation: 'Teacher', createdAt: 0, updatedAt: 5, lastName: 'Martin' })
    expect(res.replaces).toEqual(['old'])
    expect(res.consultations.every(c => c.patientId === 'p1' && c.id !== 'c1')).toBe(true)
  })

  it('merge: adds only the consultations the patient does not have', () => {
    const second: Consultation = { ...consultation, id: 'c2', date: '2026-03-01', title: 'Follow-up', createdAt: 20 }
    const two = buildCaseFile(patient, [consultation, second], { rubricPath: r => paths[r] ?? null, remedyAbbrev: id => remedies[id] })
    const onFile = { ...patient, id: 'p7', occupation: 'Retired' }
    // c1 came in through an earlier import (fresh id, same visit)
    const earlier = { ...consultation, id: 'x1', patientId: 'p7' }
    const res = importCaseFile(parseCaseFile(JSON.stringify(two)), ctx({ existing: [onFile], existingConsultations: [earlier] }), 5, 'merge')
    expect(res.patient).toBe(onFile)
    expect(res.skipped).toBe(1)
    expect(res.consultations.map(c => c.title)).toEqual(['Follow-up'])
    expect(res.consultations[0].patientId).toBe('p7')
  })

  it('falls back to a new record when replace or merge has no match', () => {
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), ctx(), 5, 'merge')
    expect(res.mode).toBe('new')
    expect(res.patient.id).not.toBe('p1')
  })

  it('keeps symptom addedAt and remaps remedy ids in exclusions, family limit and highlight', () => {
    const c: Consultation = { ...consultation, analysis: { ...consultation.analysis, excludedRemedies: [945], remedyFilter: [945, 5], highlight: [945] } }
    const f = buildCaseFile(patient, [c], { rubricPath: r => paths[r] ?? null, remedyAbbrev: id => remedies[id] })
    f.remedies = { 945: 'Puls', 5: 'Acon' }
    const res = importCaseFile(parseCaseFile(JSON.stringify(f)), ctx({ remedyAbbrev: id => (id === 945 ? 'Other' : remedies[id] ?? `#${id}`), remedyByAbbrev: ab => (ab === 'Puls' ? 1945 : ab === 'Acon' ? 5 : undefined) }))
    const a = res.consultations[0].analysis
    expect(a.excludedRemedies).toEqual([1945])
    expect(a.remedyFilter).toEqual([1945, 5])
    expect(a.highlight).toEqual([1945])
    expect(res.consultations[0].clipboards[0].symptoms.map(s => s.addedAt)).toEqual([1, 2])
  })

  it('re-links rubrics whose index moved, by path', () => {
    const moved = ctx({
      rubricPath: r => (r === 'publicum:10' ? 'Mind, anger' : paths[r] ?? null),
      resolve: (rep, path) => (rep === 'publicum' && path === 'Mind, weeping' ? 99 : -1),
    })
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), moved)
    expect(res.consultations[0].clipboards[0].symptoms[0].rubrics).toEqual(['publicum:99'])
    expect(res.remapped).toBe(1)
  })

  it('counts rubrics it cannot verify', () => {
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), ctx({ rubricPath: () => null }))
    expect(res.unresolved).toBe(3)
  })

  it('maps remedy ids by abbreviation when ids differ', () => {
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), ctx({ remedyAbbrev: id => (id === 945 ? 'Other' : `#${id}`), remedyByAbbrev: ab => (ab === 'Puls' ? 1945 : undefined) }))
    expect(res.consultations[0].prescriptions[0].remedyId).toBe(1945)
  })

  it('keeps the follow-up response (GHHOS) and drops invalid scores', () => {
    const withResp = buildCaseFile(patient, [{ ...consultation, response: { score: 3, note: 'better' } }], { rubricPath: r => paths[r] ?? null, remedyAbbrev: id => remedies[id] })
    expect(parseCaseFile(JSON.stringify(withResp)).consultations[0].response).toEqual({ score: 3, note: 'better' })
    const bad = JSON.parse(JSON.stringify(withResp))
    bad.consultations[0].response = { score: 9, note: 5 }
    expect(parseCaseFile(JSON.stringify(bad)).consultations[0].response).toEqual({ score: null, note: '' })
    expect(parseCaseFile(JSON.stringify(file)).consultations[0].response).toBeUndefined()
  })

  it('rejects files that are not case files', () => {
    expect(() => parseCaseFile('not json')).toThrow(CaseFileError)
    expect(() => parseCaseFile('{"format":"other"}')).toThrow(/Not a Radar Opus case file/)
    expect(() => parseCaseFile(JSON.stringify({ ...file, version: 7 }))).toThrow(/Unsupported/)
    expect(() => parseCaseFile(JSON.stringify({ ...file, patient: { ...patient, firstName: '', lastName: '' } }))).toThrow(/no name/)
  })

  it('tolerates missing optional fields', () => {
    const f = parseCaseFile(JSON.stringify({ format: 'radar-opus-case', version: 1, patient: { lastName: 'Solo' }, consultations: [{ clipboards: [{ symptoms: [{ rubrics: ['publicum:1'], weight: 9 }] }] }] }))
    expect(f.patient.tags).toEqual([])
    expect(f.consultations[0].kind).toBe('follow-up')
    expect(f.consultations[0].clipboards[0].symptoms[0].weight).toBe(4)
    expect(f.consultations[0].analysis.clipboardIds).toEqual([f.consultations[0].clipboards[0].id])
  })

  it('names files after the patient', () => {
    expect(caseFileName(patient, new Date('2026-09-29T00:00:00Z'))).toBe('martin-elise-2026-09-29.radar-case.json')
  })
})
