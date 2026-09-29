import { describe, expect, it } from 'vitest'
import { tinyRepertory } from './fixtures'
import { bookmarkFolders, crumbCollapseOrder, flattenTree, hiddenRuns, levelItems } from './logic'
import { indexAt, pinnedScrollTop, prefixSums } from './virtual'
import { pushRecent } from './ops'
import { matchChapters } from './take'

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

describe('scroll pinning', () => {
  const off = prefixSums(5, i => [100, 40, 300, 40, 40][i])
  it('keeps a row at its viewport offset', () => {
    // row 1 (top 100) shown 50px below the viewport top
    expect(pinnedScrollTop(off, 1, 50, 400)).toBe(50)
  })
  it('clamps so the row stays fully visible, top first', () => {
    // row 2 is 300px tall at offset 140; pinned 300px down in a 400px viewport it would overflow
    expect(pinnedScrollTop(off, 2, 300, 400)).toBe(140 - 100)
    // taller than the viewport: its top is shown
    expect(pinnedScrollTop(off, 2, 50, 200)).toBe(140)
    expect(pinnedScrollTop(off, 0, -30, 400)).toBe(0)
  })
})

describe('breadcrumb folding', () => {
  it('folds the repertory, then middle levels, then the chapter; keeps parent and leaf', () => {
    expect(crumbCollapseOrder(1)).toEqual([])
    expect(crumbCollapseOrder(2)).toEqual([0])
    expect(crumbCollapseOrder(3)).toEqual([0])
    expect(crumbCollapseOrder(4)).toEqual([0, 1])
    expect(crumbCollapseOrder(6)).toEqual([0, 2, 3, 1])
  })
  it('groups hidden crumbs into runs', () => {
    expect(hiddenRuns(6, new Set([0, 2, 3]))).toEqual([[0], [2, 3]])
    expect(hiddenRuns(6, new Set([0, 1, 2, 3]))).toEqual([[0, 1, 2, 3]])
    expect(hiddenRuns(3, new Set())).toEqual([])
  })
})

describe('recent rubrics and chapter ranking', () => {
  it('moves a rubric to the front without duplicates and caps the list', () => {
    expect(pushRecent(undefined, 4)).toEqual([4])
    expect(pushRecent([1, 2, 3], 2)).toEqual([2, 1, 3])
    expect(pushRecent([1, 2, 3], 9, 3)).toEqual([9, 1, 2])
  })
  it('prefers recently used chapters among equal matches', () => {
    const items = [{ id: 1, name: 'External throat' }, { id: 2, name: 'Extremities' }, { id: 3, name: 'Eye' }]
    expect(matchChapters(items, 'ext').map(x => x.id)).toEqual([1, 2])
    expect(matchChapters(items, 'ext', x => (x.id === 2 ? 0 : -1)).map(x => x.id)).toEqual([2, 1])
    // recency never beats a better tier
    expect(matchChapters(items, 'e', x => (x.id === 3 ? -1 : x.id)).map(x => x.id)).toEqual([1, 2, 3])
  })
})
