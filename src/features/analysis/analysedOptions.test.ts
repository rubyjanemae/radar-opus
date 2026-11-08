import { describe, expect, it } from 'vitest'
import { DEFAULT_ANALYSIS } from '../../state/store'
import type { Clipboard, Symptom } from '../../engine/model'
import { analysedOptions } from './useAnalysis'

const sym = (id: string): Symptom => ({ id, rubrics: ['x:1'], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0 })
const cb = (id: string, n: number): Clipboard => ({ id, name: id, color: '', symptoms: Array.from({ length: n }, (_, i) => sym(`${id}${i}`)) })

describe('analysedOptions', () => {
  const clipboards = [cb('a', 0), cb('b', 18), cb('c', 9)]
  it('analyses the active clipboard when the included ones are empty (RadarOpus)', () => {
    const c = { clipboards, analysis: { ...DEFAULT_ANALYSIS, clipboardIds: ['a'] } }
    const o = analysedOptions(c, 'b')
    expect(o.clipboardIds).toEqual(['b'])
    expect(analysedOptions(c, 'b')).toBe(o) // memoised: the analysis cache keeps hitting
  })
  it('keeps the included clipboards when they have symptoms', () => {
    const c = { clipboards, analysis: { ...DEFAULT_ANALYSIS, clipboardIds: ['c'] } }
    expect(analysedOptions(c, 'b')).toBe(c.analysis)
  })
  it('keeps the options when the active clipboard is empty or not of this case', () => {
    const c = { clipboards, analysis: { ...DEFAULT_ANALYSIS, clipboardIds: ['a'] } }
    expect(analysedOptions(c, 'a')).toBe(c.analysis)
    expect(analysedOptions(c, 'zz')).toBe(c.analysis)
  })
})
