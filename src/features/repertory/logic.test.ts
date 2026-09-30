import { describe, expect, it } from 'vitest'
import { tinyRepertory } from './fixtures'
import { followExpanded, selectNavigatorTabId, bookmarkFolders, crumbCollapseOrder, crumbFoldCount, findInitial, flattenTree, hiddenRuns, levelItems, rubricLabel, treeRows } from './logic'
import { indexAt, pinnedScrollTop, prefixSums, rebuildPrefix, targetScroll } from './virtual'
import { Catalog } from '../../data/catalog'
import { NEAR_ROWS, estimateRow, layoutSizes, remedyChars } from './estimate'
import { remedyMarkup } from './remedies'
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

describe('tree rows for assistive technology', () => {
  const rep = tinyRepertory()
  it('gives each row its level position among all its siblings', () => {
    const t = treeRows(rep, rep.chapters, new Set([0, 1]))
    expect(t.rows).toEqual([0, 1, 2, 3, 4, 5])
    expect(t.pos).toEqual([1, 1, 1, 2, 2, 2])
    expect(t.size).toEqual([2, 2, 2, 2, 2, 2])
    expect(treeRows(rep, [5], new Set()).size).toEqual([1])
  })
})

describe('incremental layout math', () => {
  it('rebuilds prefix sums from the first changed row only', () => {
    const sizes = [10, 20, 30, 40]
    const o = prefixSums(4, i => sizes[i])
    let calls = 0
    sizes[2] = 5
    rebuildPrefix(o, 4, 2, i => { calls++; return sizes[i] })
    expect(Array.from(o)).toEqual([0, 10, 30, 35, 75])
    expect(calls).toBe(2)
  })
  it('scrolls a row into view from cached geometry', () => {
    const o = prefixSums(10, () => 50)
    expect(targetScroll(0, 200, o, 1, 'auto')).toBe(0)
    expect(targetScroll(0, 200, o, 6, 'auto')).toBe(350 - 200 + 48)
    expect(targetScroll(0, 200, o, 6, 'start')).toBe(300 - 48)
  })
})

describe('row estimates', () => {
  const rep = tinyRepertory()
  const catalog = new Catalog([
    { id: 1, abbrev: 'Acon', name: 'Aconitum napellus', altName: null },
    { id: 2, abbrev: 'Ars', name: 'Arsenicum album', altName: null },
    { id: 3, abbrev: 'Bell', name: 'Belladonna', altName: null },
  ], [rep.info])
  it('counts remedy characters per style and grade floor once, then answers in O(1)', () => {
    const rc = remedyChars(rep, catalog)
    expect(rc.has(1)).toBe(false)
    // rubric 1 (fear): Acon grade 3, Ars grade 1
    expect(rc.chars(1, false, 1)).toBe('Acon.'.length + 2 + 'Ars.'.length + 2)
    expect(rc.chars(1, false, 3)).toBe('Acon.'.length + 2)
    expect(rc.chars(1, true, 2)).toBe('Aconitum napellus'.length + 2)
    expect(rc.has(6)).toBe(true)
    expect(rc.build()).toBe(true)
    expect(rc.average(0, false, 1)).toBeGreaterThan(0)
  })
  it('estimates taller rows for longer remedy lists and adds a line for a note', () => {
    const rc = remedyChars(rep, catalog)
    const p = { showRemedies: true, names: false, minGrade: 1, fs: 13, lineH: 20, width: 140 }
    const plain = estimateRow(rep, rc, 1, p, true, false)
    expect(estimateRow(rep, rc, 1, { ...p, names: true }, true, false)).toBeGreaterThanOrEqual(plain)
    expect(estimateRow(rep, rc, 1, p, true, true)).toBe(plain + 25)
    expect(estimateRow(rep, rc, 1, { ...p, showRemedies: false }, true, false)).toBeLessThanOrEqual(plain)
    expect(NEAR_ROWS).toBeGreaterThan(0)
  })
  it('keeps heights per layout outside the component', () => {
    const a = layoutSizes('t:0:7:abbrev:1', 7)
    a.measured[2] = 33
    expect(layoutSizes('t:0:7:abbrev:1', 7).measured[2]).toBe(33)
    expect(layoutSizes('t:0:7:names:1', 7).measured[2]).toBe(0)
  })
  it('renders a remedy list as cached markup, grade in the class', () => {
    const m = remedyMarkup(rep, catalog, 1, false, 1)
    expect(m.shown).toBe(2)
    expect(m.html).toBe('<span class="rv-rem g3" data-rid="1" data-grade="3">Acon.</span> <span class="rv-rem g1" data-rid="2" data-grade="1">ars.</span>')
    expect(remedyMarkup(rep, catalog, 1, false, 1)).toBe(m)
    expect(remedyMarkup(rep, catalog, 1, true, 3).html).toContain('>Aconitum napellus<')
  })
})

describe('breadcrumb fold count', () => {
  it('folds just enough, measured without layout', () => {
    const order = crumbCollapseOrder(4) // [0, 2, 1]
    expect(crumbFoldCount([100, 80, 60, 50], order, 400, 10, 20)).toBe(0)
    expect(crumbFoldCount([100, 80, 60, 50], order, 250, 10, 20)).toBe(1)
    expect(crumbFoldCount([100, 80, 60, 50], order, 100, 10, 20)).toBe(order.length)
  })
})

describe('find and labels', () => {
  const rep = tinyRepertory()
  it('F3 on a rubric with sub-rubrics opens its level with the first one highlighted', () => {
    expect(findInitial(rep, { from: 1, current: 1, stay: false })).toEqual({ level: 1, active: 2 })
    expect(findInitial(rep, { from: 2, current: 2, stay: false })).toEqual({ level: 1, active: 2 })
  })
  it('formats remedy counts in row labels', () => {
    expect(rubricLabel(['Mind', 'fear'], 1234, { clipboards: [1] })).toBe('Mind, fear, 1,234 remedies, in clipboard 1')
  })
})

describe('navigator follow', () => {
  const rep = tinyRepertory()
  it('opens the ancestors of the followed rubric without mutating the input', () => {
    const start = new Set<number>()
    const next = followExpanded(rep, start, 2, null)
    expect([...next].sort()).toEqual([0, 1])
    expect(start.size).toBe(0)
    // nothing to change: the same set comes back (no re-render)
    expect(followExpanded(rep, next, 3, 0)).toBe(next)
  })
  it('entering another chapter folds the previous one', () => {
    const next = followExpanded(rep, new Set([0, 1]), 6, 0)
    expect([...next]).toEqual([5])
  })
  it('follows the active repertory tab, else the last repertory tab', () => {
    const tabs = [{ id: 'a', kind: 'repertory' }, { id: 'b', kind: 'repertory' }, { id: 'm', kind: 'mm' }]
    const s = (activeTabId: string | null, lastRepertoryTabId: string | null) => ({ tabs, activeTabId, lastRepertoryTabId }) as unknown as Parameters<typeof selectNavigatorTabId>[0]
    expect(selectNavigatorTabId(s('b', 'a'))).toBe('b')
    expect(selectNavigatorTabId(s('m', 'b'))).toBe('b')
    expect(selectNavigatorTabId(s('m', 'gone'))).toBe('a')
    expect(selectNavigatorTabId({ ...s(null, null), tabs: [] })).toBe(null)
  })
})
