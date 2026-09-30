import { describe, expect, it } from 'vitest'
import { cappedRange, fixedRange, makeLayout } from './virtual'
import { lruGet, lruSet, remedyMarkup } from './remedies'
import { tinyRepertory } from './fixtures'
import type { Catalog } from '../../data/catalog'

describe('capped mounting', () => {
  it('takes the whole target when it adds few rows', () => {
    expect(cappedRange({ start: 10, end: 30 }, { start: 14, end: 26 }, { start: 12, end: 34 }, 8)).toEqual({ start: 12, end: 34 })
  })
  it('mounts the visible rows and grows the overscan by the cap after a jump', () => {
    // a fling far away: nothing mounted overlaps; visible rows 500..520 always, 8 more around them
    const r = cappedRange({ start: 0, end: 40 }, { start: 500, end: 520 }, { start: 480, end: 540 }, 8)
    expect(r.start).toBeLessThanOrEqual(500)
    expect(r.end).toBeGreaterThanOrEqual(520)
    expect((r.end - r.start) - 20).toBe(8)
    // the next frame grows further toward the target
    const r2 = cappedRange(r, { start: 500, end: 520 }, { start: 480, end: 540 }, 8)
    expect(r2.end - r2.start).toBe(36)
    let r3 = r2
    for (let n = 0; n < 5; n++) r3 = cappedRange(r3, { start: 500, end: 520 }, { start: 480, end: 540 }, 8)
    expect(r3).toEqual({ start: 480, end: 540 })
  })
  it('never drops visible rows even beyond the cap', () => {
    const r = cappedRange({ start: 0, end: 0 }, { start: 0, end: 50 }, { start: 0, end: 70 }, 8)
    expect(r.start).toBe(0)
    expect(r.end).toBeGreaterThanOrEqual(50)
  })
  it('keeps mounted rows next to the visible ones', () => {
    const r = cappedRange({ start: 90, end: 130 }, { start: 110, end: 125 }, { start: 60, end: 160 }, 4)
    expect(r.start).toBeLessThanOrEqual(90)
    expect(r.end).toBeGreaterThanOrEqual(130)
  })
})

describe('layouts', () => {
  it('fixed ranges are clamped', () => {
    expect(fixedRange(0, 100, 3, 20, 8)).toEqual({ start: 0, end: 3 })
    expect(fixedRange(1000, 100, 3, 20, 8)).toEqual({ start: 3, end: 3 })
  })
  it('builds offsets from stored measurements and estimates', () => {
    const measured = new Float32Array([0, 50, 0]), estimated = new Float32Array(3)
    const L = makeLayout(3, 400, () => 20, { measured, estimated })
    expect([...L.offsets]).toEqual([0, 20, 70, 90])
    expect(L.sizes).toBe(measured)
    expect(estimated[0]).toBe(20)
  })
})

describe('remedy markup cache', () => {
  const rep = tinyRepertory()
  const catalog = { remedy: (id: number) => ({ id, abbrev: `rem${id}`, name: `Remedium ${id}` }), remedies: new Map([1, 2, 3].map(id => [id, { id, abbrev: `rem${id}`, name: `Remedium ${id}` }])) } as unknown as Catalog
  it('keys by rubric, display mode and minimum grade', () => {
    const a = remedyMarkup(rep, catalog, 0, false, 1)
    expect(remedyMarkup(rep, catalog, 0, false, 1)).toBe(a)
    expect(remedyMarkup(rep, catalog, 0, true, 1)).not.toBe(a)
    expect(remedyMarkup(rep, catalog, 0, false, 2)).not.toBe(a)
  })
  it('evicts the least recently used entry', () => {
    const m = new Map<number, string>()
    lruSet(m, 1, 'a', 2); lruSet(m, 2, 'b', 2)
    expect(lruGet(m, 1)).toBe('a') // 1 is now the most recent
    lruSet(m, 3, 'c', 2)
    expect([...m.keys()]).toEqual([1, 3])
    expect(lruGet(m, 2)).toBeUndefined()
  })
})
