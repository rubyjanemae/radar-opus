import { describe, expect, it } from 'vitest'
import type { Consultation, Patient } from '../../state/patients'
import { DEFAULT_ANALYSIS } from '../../state/store'
import { buildCaseFile, caseFileName, CaseFileError, importCaseFile, parseCaseFile } from './casefile'
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

  it('flags an existing patient with the same name and birth date instead of overwriting', () => {
    const res = importCaseFile(parseCaseFile(JSON.stringify(file)), ctx({ existing: [patient] }))
    expect(res.duplicateOf?.id).toBe('p1')
    expect(res.patient.id).not.toBe('p1')
    expect(res.patient.lastName).toBe('Martin (imported)')
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
