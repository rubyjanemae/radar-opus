import { describe, expect, it } from 'vitest'
import type { Consultation, Patient } from '../../state/patients'
import { ageYmd, columnsFor, ddmmyyyy, DEFAULT_FIELDS, filterPanel, panelRows, patientCodes } from './panel'

const P = (id: string, extra: Partial<Patient> = {}): Patient => ({
  id, firstName: 'Oefen', lastName: 'Casus', birthDate: '2000-01-01', sex: 'male', email: '', phone: '', address: '',
  occupation: '', notes: '', tags: [], createdAt: Number(id.replace(/\D/g, '')) || 1, updatedAt: 1, ...extra,
})
const C = (id: string, patientId: string, date: string) => ({ id, patientId, date, createdAt: 1 }) as unknown as Consultation

describe('patients panel', () => {
  it('formats dates and ages as RadarOpus does', () => {
    expect(ddmmyyyy('2000-01-01')).toBe('01-01-2000')
    expect(ageYmd('2000-01-01', new Date(2026, 10, 6).getTime())).toBe('26.10.5')
    expect(ageYmd('2000-03-31', new Date(2026, 2, 1).getTime())).toBe('25.11.1')
    expect(ageYmd(null)).toBe('')
  })

  it('shows the ticked fields as columns; animals get a name column and no sex', () => {
    expect(columnsFor(DEFAULT_FIELDS, 'human')).toEqual(['lastName', 'firstName', 'dateOfBirth', 'sex'])
    expect(columnsFor(DEFAULT_FIELDS, 'animal')).toEqual(['lastName', 'firstName', 'animalName', 'dateOfBirth'])
  })

  it('numbers codes in creation order unless stored', () => {
    const codes = patientCodes([P('p2'), P('p1'), P('p3', { code: 'X7' })])
    expect([codes.get('p1'), codes.get('p2'), codes.get('p3')]).toEqual(['1', '2', 'X7'])
  })

  it('filters by kind, Clificol, group and the ticked fields; total counts the kind', () => {
    const patients = {
      p1: P('p1'),
      p2: P('p2', { firstName: 'Ada', lastName: 'Zeta', clificol: true, tags: ['acute'] }),
      p3: P('p3', { species: 'animal', animalName: 'Rex' }),
    }
    const rows = panelRows(patients, { c1: C('c1', 'p1', '2026-11-01') })
    const base = { query: '', fields: DEFAULT_FIELDS, kind: 'human' as const, clificol: false, group: null }
    expect(filterPanel(rows, base)).toMatchObject({ total: 2 })
    expect(filterPanel(rows, base).rows.map(r => r.patient.id)).toEqual(['p1', 'p2'])
    expect(filterPanel(rows, { ...base, clificol: true }).rows.map(r => r.patient.id)).toEqual(['p2'])
    expect(filterPanel(rows, { ...base, group: 'acute' }).rows.map(r => r.patient.id)).toEqual(['p2'])
    expect(filterPanel(rows, { ...base, query: 'zeta' }).rows.map(r => r.patient.id)).toEqual(['p2'])
    expect(filterPanel(rows, { ...base, query: '01-01-2000 oefen' }).rows.map(r => r.patient.id)).toEqual(['p1'])
    // a field that is not ticked is not searched
    expect(filterPanel(rows, { ...base, query: '01-11-2026' }).rows).toHaveLength(0)
    expect(filterPanel(rows, { ...base, fields: ['lastConsDate'], query: '01-11-2026' }).rows.map(r => r.patient.id)).toEqual(['p1'])
    expect(filterPanel(rows, { ...base, kind: 'animal' })).toMatchObject({ total: 1 })
  })
})
