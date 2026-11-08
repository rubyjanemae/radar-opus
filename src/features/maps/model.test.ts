import { describe, expect, it } from 'vitest'
import { FamilyIndex } from '../families/model'
import { elementCells, heat, kingdomRows, periodicPosition } from './model'

describe('periodicPosition', () => {
  it('places elements of every block', () => {
    expect(periodicPosition(1)).toEqual({ row: 1, col: 1 })
    expect(periodicPosition(2)).toEqual({ row: 1, col: 18 })
    expect(periodicPosition(3)).toEqual({ row: 2, col: 1 })
    expect(periodicPosition(6)).toEqual({ row: 2, col: 14 })
    expect(periodicPosition(11)).toEqual({ row: 3, col: 1 })
    expect(periodicPosition(17)).toEqual({ row: 3, col: 17 })
    expect(periodicPosition(26)).toEqual({ row: 4, col: 8 })
    expect(periodicPosition(47)).toEqual({ row: 5, col: 11 })
    expect(periodicPosition(56)).toEqual({ row: 6, col: 2 })
    expect(periodicPosition(57)).toEqual({ row: 9, col: 3 })
    expect(periodicPosition(71)).toEqual({ row: 9, col: 17 })
    expect(periodicPosition(72)).toEqual({ row: 6, col: 4 })
    expect(periodicPosition(79)).toEqual({ row: 6, col: 11 })
    expect(periodicPosition(86)).toEqual({ row: 6, col: 18 })
    expect(periodicPosition(92)).toEqual({ row: 10, col: 6 })
    expect(periodicPosition(118)).toEqual({ row: 7, col: 18 })
    expect(periodicPosition(0)).toBeNull()
  })
})

const index = new FamilyIndex({
  version: 1, source: { id: 't', title: 't' },
  groups: [
    { id: 'k:mineral', name: 'Minerals', kind: 'kingdom', parent: null, remedies: [1, 2, 3] },
    { id: 'k:plant', name: 'Plants', kind: 'kingdom', parent: null, remedies: [4, 5] },
    { id: 'theme', name: 'Themes', kind: 'theme', parent: null, remedies: [1, 4] },
    { id: 'p3', name: 'Period 3', kind: 'period', parent: 'k:mineral', remedies: [1, 2] },
    { id: 'el:Na', name: 'Natrium (Na)', kind: 'element', parent: 'p3', note: 'Z 11', remedies: [1, 2] },
    { id: 'el:Au', name: 'Aurum (Au)', kind: 'element', parent: 'k:mineral', note: 'Z 79', remedies: [3] },
  ],
})

describe('maps', () => {
  const ranking = new Map([[2, 1], [1, 7], [5, 3]])
  it('places element groups with their ranked remedies', () => {
    const cells = elementCells(index, ranking)
    expect(cells.map(c => [c.symbol, c.name, c.row, c.col])).toEqual([['Na', 'Natrium', 3, 1], ['Au', 'Aurum', 6, 11]])
    expect(cells[0].ranked).toEqual([{ remedyId: 2, rank: 1 }, { remedyId: 1, rank: 7 }])
    expect(cells[1].ranked).toEqual([])
  })
  it('lists kingdoms (themes left out) with their counts in the top', () => {
    expect(kingdomRows(index, ranking, 5).map(k => [k.name, k.size, k.ranked.length, k.inTop])).toEqual([['Minerals', 3, 2, 1], ['Plants', 2, 1, 1]])
  })
  it('shades by best rank', () => {
    expect([heat(undefined, 30), heat(1, 30), heat(10, 30), heat(11, 30), heat(30, 30), heat(31, 30)]).toEqual([0, 3, 3, 2, 2, 1])
  })
})
