import { describe, expect, it } from 'vitest'
import type { Symptom } from '../../engine/model'
import { clickSelect, clipboardStats, combinedSize, cycleWeight, moveIdsBefore, moveIdsBy, parseRubricDrop, sortSymptomIds } from './logic'
import type { RubricFacts } from './logic'

const sym = (id: string, ref: string, weight: Symptom['weight'] = 1, extra: Partial<Symptom> = {}): Symptom => ({
  id, rubrics: [ref], combine: 'union', weight, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0, ...extra,
})

describe('moveIdsBefore', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('moves a block before a target', () => expect(moveIdsBefore(order, ['d', 'e'], 'b')).toEqual(['a', 'd', 'e', 'b', 'c']))
  it('moves to the end with null', () => expect(moveIdsBefore(order, ['a', 'c'], null)).toEqual(['b', 'd', 'e', 'a', 'c']))
  it('keeps relative order of the moved ids', () => expect(moveIdsBefore(order, ['e', 'a'], 'c')).toEqual(['b', 'a', 'e', 'c', 'd']))
  it('handles a target inside the moved set', () => expect(moveIdsBefore(order, ['b', 'c'], 'c')).toEqual(['a', 'b', 'c', 'd', 'e']))
})

describe('moveIdsBy', () => {
  const order = ['a', 'b', 'c', 'd']
  it('moves up', () => expect(moveIdsBy(order, ['c'], -1)).toEqual(['a', 'c', 'b', 'd']))
  it('moves down', () => expect(moveIdsBy(order, ['b'], 1)).toEqual(['a', 'c', 'b', 'd']))
  it('stops at the edge', () => expect(moveIdsBy(order, ['a'], -1)).toEqual(order))
  it('moves a contiguous block together', () => expect(moveIdsBy(order, ['b', 'c'], 1)).toEqual(['a', 'd', 'b', 'c']))
  it('moves separate items independently', () => expect(moveIdsBy(order, ['b', 'd'], -1)).toEqual(['b', 'a', 'd', 'c']))
})

describe('clickSelect', () => {
  const order = ['a', 'b', 'c', 'd']
  it('single replaces the selection', () => expect(clickSelect(order, ['a', 'b'], 'a', 'c', 'single')).toEqual({ selected: ['c'], anchor: 'c' }))
  it('toggle adds and removes', () => {
    expect(clickSelect(order, ['a'], 'a', 'c', 'toggle').selected).toEqual(['a', 'c'])
    expect(clickSelect(order, ['a', 'c'], 'a', 'a', 'toggle').selected).toEqual(['c'])
  })
  it('range selects from anchor in either direction', () => {
    expect(clickSelect(order, ['b'], 'b', 'd', 'range')).toEqual({ selected: ['b', 'c', 'd'], anchor: 'b' })
    expect(clickSelect(order, ['c'], 'c', 'a', 'range').selected).toEqual(['a', 'b', 'c'])
  })
  it('range without anchor acts as single', () => expect(clickSelect(order, [], null, 'b', 'range').selected).toEqual(['b']))
})

describe('sortSymptomIds', () => {
  const facts: Record<string, RubricFacts> = {
    'r:10': { repertoryOrder: 0, chapter: 2, index: 10, path: 'head, pain', size: 50 },
    'r:2': { repertoryOrder: 0, chapter: 0, index: 2, path: 'mind, anxiety', size: 300 },
    'r:5': { repertoryOrder: 0, chapter: 1, index: 5, path: 'vertigo', size: 8 },
  }
  const list = [sym('x', 'r:10', 2), sym('y', 'r:2', 4), sym('z', 'r:5', 2), sym('u', 'q:1', 3)]
  const f = (ref: string) => facts[ref] ?? null
  it('homeopathic order follows chapters, unknown last', () => expect(sortSymptomIds(list, 'homeopathic', f)).toEqual(['y', 'z', 'x', 'u']))
  it('intensity is descending and stable', () => expect(sortSymptomIds(list, 'intensity', () => facts['r:2'])).toEqual(['y', 'u', 'x', 'z']))
  it('alphabetical by path', () => expect(sortSymptomIds(list, 'alphabetical', f)).toEqual(['x', 'y', 'z', 'u']))
  it('size ascending', () => expect(sortSymptomIds(list, 'size', f)).toEqual(['z', 'x', 'y', 'u']))
})

describe('combinedSize', () => {
  it('union counts distinct remedies', () => expect(combinedSize([[1, 2, 3], [3, 4]], 'union')).toBe(4))
  it('intersection counts shared remedies', () => expect(combinedSize([[1, 2, 3], [3, 2, 9], [2, 3]], 'intersection')).toBe(2))
  it('ignores missing parts', () => expect(combinedSize([null, [1]], 'union')).toBe(1))
})

describe('parseRubricDrop', () => {
  it('accepts JSON arrays', () => expect(parseRubricDrop('["publicum:1","kent-de:22"]')).toEqual(['publicum:1', 'kent-de:22']))
  it('accepts a single ref', () => expect(parseRubricDrop('publicum:7')).toEqual(['publicum:7']))
  it('accepts separated lists and dedupes', () => expect(parseRubricDrop('a:1\na:2, a:1')).toEqual(['a:1', 'a:2']))
  it('accepts an object with refs', () => expect(parseRubricDrop('{"refs":["a:3"]}')).toEqual(['a:3']))
  it('rejects junk', () => expect(parseRubricDrop('hello world')).toEqual([]))
})

describe('misc', () => {
  it('stats count active symptoms', () => {
    expect(clipboardStats([sym('a', 'r:1', 0), sym('b', 'r:2', 2, { eliminatory: true })])).toEqual({ total: 2, active: 1, eliminative: 1, excluding: 0 })
  })
  it('cycleWeight wraps', () => {
    expect(cycleWeight(4)).toBe(0)
    expect(cycleWeight(0, -1)).toBe(4)
  })
})
