import { describe, expect, it } from 'vitest'
import { tinyRepertory } from './fixtures'
import { bookmarkFolders, flattenTree, levelItems } from './logic'
import { indexAt, prefixSums } from './virtual'

describe('tree helpers', () => {
  const rep = tinyRepertory()
  it('flattens chapters and expanded nodes in book order', () => {
    expect(flattenTree(rep, rep.chapters, new Set())).toEqual([0, 5])
    expect(flattenTree(rep, rep.chapters, new Set([0]))).toEqual([0, 1, 4, 5])
    expect(flattenTree(rep, rep.chapters, new Set([0, 1, 5]))).toEqual([0, 1, 2, 3, 4, 5, 6])
    // an expanded node under a collapsed parent stays hidden
    expect(flattenTree(rep, rep.chapters, new Set([1]))).toEqual([0, 5])
  })
  it('lists find levels with type-ahead', () => {
    expect(levelItems(rep, -1, '')).toEqual([0, 5])
    expect(levelItems(rep, -1, 'he')).toEqual([5])
    expect(levelItems(rep, 0, '')).toEqual([1, 4])
    expect(levelItems(rep, 1, 'ni')).toEqual([3])
    expect(levelItems(rep, 1, 'zzz')).toEqual([])
  })
  it('orders bookmark folders with General first', () => {
    expect(bookmarkFolders([{ folder: 'Zeta' }, { folder: 'General' }, { folder: 'Alpha' }, { folder: 'Zeta' }], ['New'])).toEqual(['General', 'Alpha', 'New', 'Zeta'])
  })
})

describe('virtualisation math', () => {
  it('computes prefix sums and finds the row at an offset', () => {
    const off = prefixSums(4, i => [10, 20, 30, 40][i])
    expect([...off]).toEqual([0, 10, 30, 60, 100])
    expect(indexAt(off, 4, 0)).toBe(0)
    expect(indexAt(off, 4, 9.9)).toBe(0)
    expect(indexAt(off, 4, 10)).toBe(1)
    expect(indexAt(off, 4, 59)).toBe(2)
    expect(indexAt(off, 4, 1000)).toBe(3)
    expect(indexAt(off, 4, -5)).toBe(0)
    expect(indexAt(off, 0, 5)).toBe(0)
  })
})
