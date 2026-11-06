import { describe, expect, it } from 'vitest'
import { computeViewport, gridLabelWidth, hiddenColumnsRight } from './gridLayout'
import { cardLayout } from './cardLayout'
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

describe('hiddenColumnsRight', () => {
  it('counts the remedy columns beyond the right edge of a whole-column layout', () => {
    // 820 px box: the label absorbs the remainder, 13 whole 36 px columns show out of 30
    const label = gridLabelWidth(820, 30, N)
    expect(hiddenColumnsRight(0, 820, label, 36, 30)).toBe(30 - Math.floor((820 - label) / 36))
    expect(hiddenColumnsRight(0, 820, label, 36, 30)).toBe(17)
  })
  it('is 0 when every column fits or the grid is scrolled to the end', () => {
    expect(hiddenColumnsRight(0, 1000, 340, 36, 5)).toBe(0)
    const label = gridLabelWidth(820, 30, N)
    expect(hiddenColumnsRight(label + 30 * 36 - 820, 820, label, 36, 30)).toBe(0)
  })
  it('is 0 before the box is measured', () => {
    expect(hiddenColumnsRight(0, 0, 340, 36, 30)).toBe(0)
  })
})

describe('computeViewport', () => {
  const g = { label: 340, col: 36, head: 104, row: 24, nr: 11, nc: 125 }
  it('covers every visible column of a wide box on the first render (no second pass)', () => {
    // a 1300px pane: (1300 - 340) / 36 ≈ 27 columns visible, rendered in whole blocks of 4
    const v = computeViewport(g, 1300, 900)
    expect(v.c0).toBe(0)
    expect(v.c1).toBeGreaterThanOrEqual(Math.ceil((1300 - 340) / 36))
    expect(v.c1 % 4).toBe(0)
    expect(v.r1).toBe(11)
    expect(v.canRight).toBe(true)
    expect(v.hiddenRight).toBe(125 - Math.floor((1300 - 340 + 0.5) / 36))
  })
  it('widens to whole blocks when scrolled and stops at the last column', () => {
    const v = computeViewport(g, 800, 400, 36 * 118, 0)
    expect(v.c0).toBe(116)
    expect(v.c1).toBe(125)
    expect(v.canRight).toBe(false)
  })
})

describe('cardLayout', () => {
  it('fits as many 230px cards as the box allows and shares the rest', () => {
    expect(cardLayout(1300)).toEqual({ cols: 5, cardW: Math.floor((1280 - 4 * 8) / 5) })
    expect(cardLayout(480)).toEqual({ cols: 1, cardW: 460 })
    expect(cardLayout(488)).toEqual({ cols: 2, cardW: 230 })
    expect(cardLayout(0).cols).toBe(1)
  })
})

describe('gridLines', () => {
  const syms = [{ clipboardId: 'a' }, { clipboardId: 'a' }, { clipboardId: 'b' }]
  it('puts a header line before each clipboard and numbers symptoms within it', async () => {
    const { gridLines } = await import('./gridLayout')
    expect(gridLines(syms, true)).toEqual([
      { kind: 'clip', clipboardId: 'a', collapsed: false, count: 2 },
      { kind: 'sym', i: 0, n: 1 }, { kind: 'sym', i: 1, n: 2 },
      { kind: 'clip', clipboardId: 'b', collapsed: false, count: 1 },
      { kind: 'sym', i: 2, n: 1 },
    ])
  })
  it('hides the symptoms of a collapsed clipboard, keeping its header', async () => {
    const { gridLines } = await import('./gridLayout')
    expect(gridLines(syms, true, new Set(['a']))).toEqual([
      { kind: 'clip', clipboardId: 'a', collapsed: true, count: 2 },
      { kind: 'clip', clipboardId: 'b', collapsed: false, count: 1 },
      { kind: 'sym', i: 2, n: 1 },
    ])
  })
  it('an expanded symptom is followed by its detail line', async () => {
    const { gridLines } = await import('./gridLayout')
    const withIds = [{ clipboardId: 'a', symptom: { id: 's1' } }, { clipboardId: 'a', symptom: { id: 's2' } }]
    expect(gridLines(withIds, true, new Set(), new Set(['s1']))).toEqual([
      { kind: 'clip', clipboardId: 'a', collapsed: false, count: 2 },
      { kind: 'sym', i: 0, n: 1 }, { kind: 'info', i: 0 }, { kind: 'sym', i: 1, n: 2 },
    ])
    // folded clipboards hide the detail lines too; the dock never draws them
    expect(gridLines(withIds, true, new Set(['a']), new Set(['s1'])).map(l => l.kind)).toEqual(['clip'])
    expect(gridLines(withIds, false, new Set(), new Set(['s1'])).map(l => l.kind)).toEqual(['sym', 'sym'])
  })
  it('without headers: one line per symptom', async () => {
    const { gridLines } = await import('./gridLayout')
    expect(gridLines(syms, false).map(l => l.kind)).toEqual(['sym', 'sym', 'sym'])
  })
})

describe('fitScore', () => {
  it('keeps up to four characters and shortens larger values', async () => {
    const { fitScore } = await import('./gridLayout')
    expect(fitScore('160')).toBe('160')
    expect(fitScore('45.5')).toBe('45.5')
    expect(fitScore('123.4')).toBe('123')
    expect(fitScore('1234')).toBe('1234')
    expect(fitScore('12345')).toBe('12k')
    expect(fitScore('5678.9')).toBe('5.7k')
    expect(fitScore('CI 12')).toBe('CI')
  })
})
