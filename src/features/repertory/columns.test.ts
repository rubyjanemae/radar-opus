import { describe, expect, it } from 'vitest'
import { prefixSums } from './virtual'
import { firstLineOnPage, revealTop, splitAt, splitRange } from './columns'
import { levelPrefix } from './RepertoryView'

// rows of whole 18px lines; row 0 is a chapter with a 68px heading above two lines
const L = 18
const sizes = [68 + 2 * L, L, 3 * L, L, 5 * L, L, 2 * L, L, L, 4 * L]
const o = prefixSums(sizes.length, i => sizes[i])
const n = sizes.length
const head = (k: number) => (k === 0 ? 68 : 0)
const grid = (k: number) => o[k] + head(k)

describe('two-column split', () => {
  it('breaks column 1 at the start of the line it cuts', () => {
    // y 0, h 150: end 150 falls in row 2 (122..176): its grid starts at 122, one whole line fits
    expect(splitAt(o, n, 0, 150, grid, L)).toBe(140)
    // exactly on a row boundary: no change
    expect(splitAt(o, n, 0, o[3], grid, L)).toBe(o[3])
  })
  it('moves a chapter heading that does not fit into column 2 whole', () => {
    // nothing before it in column 1: cut where the column ends
    expect(splitAt(o, n, 0, 40, grid, L)).toBe(40)
    const big = [L, 68 + L, L]
    const ob = prefixSums(3, i => big[i])
    expect(splitAt(ob, 3, 0, 50, k => ob[k] + (k === 1 ? 68 : 0), L)).toBe(L)
  })
  it('stops at the end of the book', () => {
    expect(splitAt(o, n, 0, 10_000, grid, L)).toBe(o[n])
  })
  it('splits a rows range into the two columns, a row across the split in both', () => {
    const b = splitAt(o, n, 0, 150, grid, L)
    expect(splitRange(o, n, { start: 0, end: 8 }, b)).toEqual({ start: 0, end: 8, c1End: 3, c2Start: 2 })
    // a split on a row boundary: no shared row
    expect(splitRange(o, n, { start: 0, end: 8 }, o[3])).toEqual({ start: 0, end: 8, c1End: 3, c2Start: 3 })
    // the book ends in column 1
    expect(splitRange(o, n, { start: 0, end: n }, o[n])).toEqual({ start: 0, end: n, c1End: n, c2Start: n })
  })
})

describe('trimmed blocks (first line 15px after the previous rubric, wrapped lines 18px)', () => {
  // each block is n * 18 - 3 tall; its line grid starts 2px above it
  const T = [1, 3, 1, 2, 1, 1, 4, 1].map(lines => lines * L - 3)
  const ot = prefixSums(T.length, i => T[i])
  const gt = (k: number) => ot[k] - 2
  it('never cuts into the previous rubric when the first line does not fit', () => {
    // row 1 starts at 15: an end of 20 leaves no whole line of it in column 1
    expect(splitAt(ot, T.length, 0, 20, gt, L)).toBe(ot[1])
  })
  it('cuts a wrapped rubric between its line boxes', () => {
    // row 1 (15..66): lines at 13, 31, 49; an end of 60 keeps two of them
    expect(splitAt(ot, T.length, 0, 60, gt, L)).toBe(49)
  })
  it('reveals a rubric entirely inside the page after stepping', () => {
    for (let k = 0; k < T.length; k++) {
      const y = revealTop(ot, T.length, 0, 60, k, gt, L)
      expect(ot[k + 1]).toBeLessThanOrEqual(splitAt(ot, T.length, y, 60, gt, L) + 60 + 0.5)
    }
  })
})

describe('revealing a rubric', () => {
  const h = 120
  it('keeps a rubric that is on the page where it is', () => {
    expect(revealTop(o, n, 0, h, 1, grid, L)).toBe(0)
    // row 3 sits in column 2 (split 104, column 2 down to 224)
    expect(revealTop(o, n, 0, h, 3, grid, L)).toBe(0)
  })
  it('scrolls up to put a rubric above the page at the top of column 1', () => {
    expect(revealTop(o, n, o[5], h, 2, grid, L)).toBe(o[2])
  })
  it('scrolls down just far enough to end a rubric at the bottom of column 2', () => {
    const y = revealTop(o, n, 0, h, 7, grid, L)
    expect(y).toBeGreaterThan(0)
    expect(o[8]).toBeLessThanOrEqual(splitAt(o, n, y, h, grid, L) + h)
    expect(y).toBeLessThanOrEqual(o[7])
  })
})

describe('stepping keeps the page while the first line shows', () => {
  const h = 120
  it('a rubric running off the bottom of column 2 counts as on the page by its first line', () => {
    // split 104, column 2 down to 224: row 4 (194..284) starts there, its first line ends at 212
    expect(firstLineOnPage(o, n, 0, h, 4, grid, L)).toBe(true)
    expect(revealTop(o, n, 0, h, 4, grid, L)).toBeGreaterThan(0)
    // row 5 starts below the page, row 2 above it
    expect(firstLineOnPage(o, n, 0, h, 5, grid, L)).toBe(false)
    expect(firstLineOnPage(o, n, o[3], h, 2, grid, L)).toBe(false)
  })
})

describe('level marks', () => {
  it('prints sub-levels as in the book', () => {
    expect(levelPrefix(1)).toBe('')
    expect(levelPrefix(2)).toBe('-')
    expect(levelPrefix(3)).toBe('.')
    expect(levelPrefix(4)).toBe('..')
  })
})
