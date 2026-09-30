import { beforeAll, describe, expect, it } from 'vitest'
import { loadRemedyIndexModule } from '../mm/remedyIndexAccess'
import { tinyRepertory } from '../repertory/fixtures'
import { filterByRemedy, firstHit, hitRows, refsBetween, remedyRows, rowRef, stepCursor, textRows } from './rows'
import type { Row } from './rows'

// Tiny: Mind(0) > fear(1) > alone(2), fear > night(3), Mind > anger(4); Head(5) > pain(6).
// fear: r1 g3, r2 g1 · alone: r1 g4 · night: r3 g2 · anger: r2 g1 · pain: r1 g1, r3 g3
const rep = tinyRepertory()
// remedy rows read the remedy index, whose module the app imports on first need (search prepare)
beforeAll(async () => { await loadRemedyIndexModule() })
const shape = (rows: readonly Row[]) => rows.map(r => (r.t === 'head' ? `#${rep.text(r.root)}:${r.count}` : rep.text(r.index)))

describe('search result rows', () => {
  it('groups a remedy’s rubrics under chapter headers, in book order, with grade, size and co-remedies', () => {
    const { rows, count } = remedyRows([{ rep }], 1, {})
    expect(count).toBe(3)
    expect(shape(rows)).toEqual(['#Mind:2', 'fear', 'alone', '#Head:1', 'pain'])
    const fear = hitRows(rows)[0]
    expect(fear).toMatchObject({ grade: 3, size: 2, co: 0 })
    // pain: r1 at grade 1, r3 at grade 3 counts as a co-remedy of the same or higher grade
    expect(hitRows(rows)[2]).toMatchObject({ grade: 1, size: 2, co: 1 })
  })
  it('applies grade, size and co-remedy filters and chapter ranges', () => {
    expect(shape(remedyRows([{ rep }], 1, { minGrade: 3 }).rows)).toEqual(['#Mind:2', 'fear', 'alone'])
    expect(shape(remedyRows([{ rep }], 1, { maxSize: 1 }).rows)).toEqual(['#Mind:1', 'alone'])
    expect(shape(remedyRows([{ rep }], 1, { maxCo: 0 }).rows)).toEqual(['#Mind:2', 'fear', 'alone'])
    expect(shape(remedyRows([{ rep, start: 5, end: 7 }], 1, {}).rows)).toEqual(['#Head:1', 'pain'])
    expect(remedyRows([{ rep }], 99, {})).toEqual({ rows: [], count: 0 })
  })
  it('filters by a co-remedy and recounts the headers', () => {
    const { rows } = remedyRows([{ rep }], 1, {})
    expect(shape(filterByRemedy(rows, 3))).toEqual(['#Head:1', 'pain'])
    expect(filterByRemedy(rows, null)).toBe(rows)
  })
  it('moves the cursor over hits, skipping headers either way', () => {
    const { rows } = remedyRows([{ rep }], 1, {}) // head, fear, alone, head, pain
    expect(firstHit(rows)).toBe(1)
    expect(stepCursor(rows, 2, 3)).toBe(4)
    expect(stepCursor(rows, 4, 3)).toBe(2)
    expect(stepCursor(rows, 4, 0)).toBe(1) // Home lands on the first hit, not the header
    expect(stepCursor(rows, 1, 99)).toBe(4)
    expect(refsBetween(rows, 4, 1)).toEqual([rep.ref(1), rep.ref(2), rep.ref(6)])
  })
  it('makes one row per text hit', () => {
    const rows = textRows([{ rep, index: 3 }])
    expect(rows).toEqual([{ t: 'hit', rep, index: 3 }])
    expect(rowRef(hitRows(rows)[0])).toBe('t:3')
  })
})
