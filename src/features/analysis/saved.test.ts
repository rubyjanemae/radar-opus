import { describe, expect, it } from 'vitest'
import type { Consultation } from '../../state/patients'
import { analysisNumber, analysisTitle, consultationMoment, ctimeDate } from './saved'

const at = (y: number, mo: number, d: number, h: number, mi: number, s: number) => new Date(y, mo - 1, d, h, mi, s).getTime()
const cons = (id: string, date: string, createdAt: number, extra: Partial<Consultation> = {}) =>
  ({ id, patientId: 'p', date, createdAt, updatedAt: createdAt, title: '', kind: 'first', complaint: '', notes: '', assessment: '', clipboards: [], prescriptions: [], analysis: {} as Consultation['analysis'], ...extra }) as Consultation

describe('analysis tab title', () => {
  it('formats dates the way RadarOpus does (ctime, day not padded)', () => {
    expect(ctimeDate(new Date(2026, 10, 1, 11, 37, 7))).toBe('Sun Nov 1 11:37:07 2026')
  })
  it('takes the day from the consultation date and the time from its creation', () => {
    const m = consultationMoment({ date: '2026-11-01', createdAt: at(2026, 11, 3, 11, 37, 7) })
    expect(ctimeDate(m)).toBe('Sun Nov 1 11:37:07 2026')
  })
  it('numbers the consultation and the analysis', () => {
    const a = cons('a', '2026-11-01', at(2026, 11, 1, 11, 37, 7))
    const b = cons('b', '2026-11-05', at(2026, 11, 5, 9, 5, 0))
    const all = { a, b }
    expect(analysisTitle(a, all)).toBe('1 - Sun Nov 1 11:37:07 2026 - 1 -')
    expect(analysisTitle(b, all)).toBe('2 - Thu Nov 5 09:05:00 2026 - 1 -')
    const saved = { id: 's1', name: 'First', savedAt: 0, clipboards: [], analysis: a.analysis }
    const a2 = { ...a, savedAnalyses: [saved, { ...saved, id: 's2', name: 'Second' }], currentAnalysisId: 's2' }
    expect(analysisNumber(a2)).toBe(2)
    expect(analysisTitle(a2, { a: a2, b })).toBe('1 - Sun Nov 1 11:37:07 2026 - 2 - Second')
    expect(analysisNumber({ ...a2, currentAnalysisId: undefined })).toBe(3)
  })
})
