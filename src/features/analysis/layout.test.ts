import { describe, expect, it } from 'vitest'
import { gridLabelWidth } from './gridLayout'
import { analysisStatusText } from './labels'
import { splitTabTitle } from '../../shell/tabTitle'

const N = { base: 340, col: 36, min: 260, max: 900 }

describe('gridLabelWidth', () => {
  it('leaves whole remedy columns visible when they overflow', () => {
    for (const w of [500, 588, 640, 700, 872, 1000, 1133]) {
      const label = gridLabelWidth(w, 125, N)
      expect(label).toBeGreaterThanOrEqual(260)
      expect((w - label) % 36).toBe(0)
      expect(label).toBeLessThan(Math.max(260, Math.min(340, w * 0.4)) + 36)
    }
  })
  it('never goes below the minimum, even in very narrow boxes', () => {
    expect(gridLabelWidth(200, 30, N)).toBe(260)
  })
  it('grows into unused width when every column fits', () => {
    expect(gridLabelWidth(1000, 5, N)).toBe(820)
    expect(gridLabelWidth(2000, 5, N)).toBe(900)
  })
  it('uses the base width before the box is measured', () => {
    expect(gridLabelWidth(0, 30, N)).toBe(340)
  })
  it('snaps a fixed (compact) label too', () => {
    const c = { base: 230, col: 36, min: 230, max: 230 }
    expect((700 - gridLabelWidth(700, 40, c)) % 36).toBe(0)
  })
})

describe('analysisStatusText', () => {
  it('describes method, symptoms, remedies and limit', () => {
    expect(analysisStatusText('sum-symptoms-degrees', { symptoms: new Array(11), total: 125 } as never, 30)).toBe('Sympt + Deg · 11 symptoms · 125 remedies · Top 30')
    expect(analysisStatusText('sum-degrees', { symptoms: new Array(1), total: 1 } as never, 100000)).toBe('Degrees · 1 symptom · 1 remedy · Top All')
    expect(analysisStatusText('sum-degrees', null, 30, true)).toBe('Degrees · loading… · Top 30')
  })
})

describe('splitTabTitle', () => {
  it('splits an analysis title after the patient so it truncates in the middle', () => {
    expect(splitTabTitle('analysis', 'Whitfield · Follow-up 3')).toEqual(['Whitfield', ' · Follow-up 3'])
    expect(splitTabTitle('analysis', 'Keller · A · B')).toEqual(['Keller', ' · A · B'])
    expect(splitTabTitle('analysis', 'Missing case')).toBeNull()
    expect(splitTabTitle('repertory', 'Mind · x')).toBeNull()
  })
})
