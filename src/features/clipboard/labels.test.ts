import { describe, expect, it } from 'vitest'
import { Catalog } from '../../data/catalog'
import { tinyRepertory } from '../repertory/fixtures'
import { rubricLabel, symptomLabel } from './labels'

const rep = tinyRepertory()
const catalog = new Catalog([], [rep.info])
;(catalog as unknown as { loaded: Map<string, unknown> }).loaded.set('t', rep)

describe('rubricLabel', () => {
  it('gives chapter, path, leaf and the analysis-style full label', () => {
    expect(rubricLabel(catalog, 't:2')).toMatchObject({ loaded: true, chapter: 'Mind', rest: 'fear, alone', leaf: 'alone', full: 'MIND - fear, alone' })
    expect(rubricLabel(catalog, 't:5')).toMatchObject({ leaf: 'HEAD', full: 'HEAD' })
  })
  it('falls back to the ref for an unknown repertory', () => {
    expect(rubricLabel(catalog, 'zz:4')).toMatchObject({ loaded: false, loading: false, full: 'zz:4' })
  })
})

describe('symptomLabel', () => {
  it('a single rubric reads as the rubric', () => {
    const l = symptomLabel(catalog, { rubrics: ['t:3'], combine: 'union' })
    expect(l.full).toBe('MIND - fear, night')
    expect(l.short).toBe('MIND - fear, night')
    expect(l.parts).toHaveLength(1)
  })
  it('joins a union with ∪ and an intersection with ∩, as the analysis does', () => {
    const u = symptomLabel(catalog, { rubrics: ['t:2', 't:6'], combine: 'union' })
    expect(u.full).toBe('MIND - fear, alone ∪ HEAD - pain')
    expect(u.short).toBe('alone ∪ pain')
    const i = symptomLabel(catalog, { rubrics: ['t:2', 't:3', 't:4'], combine: 'intersection' })
    expect(i.full).toBe('MIND - fear, alone ∩ MIND - fear, night ∩ MIND - anger')
    expect(i.short).toBe('alone ∩ night ∩ anger')
  })
  it("prefers the symptom's own label", () => {
    const l = symptomLabel(catalog, { rubrics: ['t:1', 't:2', 't:3'], combine: 'union', label: 'fear (with 2 sub-rubrics)' })
    expect(l.full).toBe('fear (with 2 sub-rubrics)')
    expect(l.short).toBe('fear (with 2 sub-rubrics)')
    expect(l.parts.map(p => p.leaf)).toEqual(['fear', 'alone', 'night'])
  })
  it('keeps raw refs for rubrics whose repertory is not loaded', () => {
    expect(symptomLabel(catalog, { rubrics: ['t:6', 'zz:1'], combine: 'union' }).full).toBe('HEAD - pain ∪ zz:1')
  })
})
