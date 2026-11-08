import { describe, expect, it } from 'vitest'
import { filterRemedies, findTyped, parentOf, stepCursor } from './lists'
import type { ListRow } from './lists'

const rems = [
  { id: 1, abbrev: 'Puls', name: 'Pulsatilla Pratensis' },
  { id: 2, abbrev: 'Acon', name: 'Aconitum Napellus' },
  { id: 3, abbrev: 'Nux-v', name: 'Nux Vomica' },
  { id: 4, abbrev: 'Anem', name: 'Anemone Pulsatilla' },
]

describe('toc lists', () => {
  it('orders remedies by abbreviation, then name and word matches', () => {
    expect(filterRemedies(rems, '').map(r => r.abbrev)).toEqual(['Acon', 'Anem', 'Nux-v', 'Puls'])
    expect(filterRemedies(rems, 'puls').map(r => r.abbrev)).toEqual(['Puls', 'Anem'])
    expect(filterRemedies(rems, 'vom').map(r => r.abbrev)).toEqual(['Nux-v'])
  })
  it('moves the cursor within the list', () => {
    expect(stepCursor(5, -1, 'down')).toBe(0)
    expect(stepCursor(5, 4, 'down')).toBeNull()
    expect(stepCursor(5, 2, 'end')).toBe(4)
    expect(stepCursor(50, 2, 'pageDown', 10)).toBe(12)
    expect(stepCursor(0, -1, 'down')).toBeNull()
  })
  it('finds parents and type-ahead targets', () => {
    const rows: ListRow[] = [
      { key: 'a', depth: 0, label: 'Plants', kind: 'group' },
      { key: 'b', depth: 1, label: 'Mosses', kind: 'group' },
      { key: 'c', depth: 1, label: 'Ferns', kind: 'group' },
      { key: 'd', depth: 0, label: 'Minerals', kind: 'group' },
    ]
    expect(parentOf(rows, 2)).toBe(0)
    expect(parentOf(rows, 3)).toBe(-1)
    expect(findTyped(rows, 1, 'm')).toBe(3)
    expect(findTyped(rows, 1, 'mo')).toBe(1)
  })
})
