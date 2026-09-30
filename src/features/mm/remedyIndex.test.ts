import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tinyRepertory } from '../repertory/fixtures'
import { Repertory } from '../../data/repertory'
import { RemedyIndex, buildRemedyIndexChunked, remedyIndex, remedyIndexIfReady, warmRemedyIndex } from './remedyIndex'

// Tiny: Mind(0) > fear(1) > alone(2), fear > night(3), Mind > anger(4); Head(5) > pain(6).
// fear: r1 g3, r2 g1 · alone: r1 g4 · night: r3 g2 · anger: r2 g1 · pain: r1 g1, r3 g3
describe('remedy index', () => {
  const rep = tinyRepertory()
  const idx = remedyIndex(rep)

  it('is cached per repertory', () => {
    expect(remedyIndex(rep)).toBe(idx)
  })
  it('lists a remedy’s rubrics in book order with grades', () => {
    expect(idx.entries(1)).toEqual([{ rubric: 1, grade: 3 }, { rubric: 2, grade: 4 }, { rubric: 6, grade: 1 }])
    expect(idx.rubricCount(2)).toBe(2)
    expect(idx.rubricCount(99)).toBe(0)
    expect(idx.entries(99)).toEqual([])
    expect(idx.maxGrade).toBe(4)
  })
  it('computes grade and chapter distribution', () => {
    const s = idx.stats(1)
    expect(s.rubricCount).toBe(3)
    expect(s.grades).toEqual([1, 0, 1, 1])
    expect(s.chapters.map(c => [c.name, c.count, c.size])).toEqual([['Mind', 2, 5], ['Head', 1, 2]])
    expect(idx.stats(1)).toBe(s)
  })
  it('ranks keynote rubrics: top grades, smallest rubrics first, chapter roots skipped', () => {
    expect(idx.stats(1).keynotes.map(k => k.rubric)).toEqual([2, 1])
    expect(idx.stats(3).keynotes).toEqual([{ rubric: 6, grade: 3, size: 2 }])
    expect(idx.stats(2).keynotes).toEqual([])
  })
})

describe('remedy index build', () => {
  it('builds in idle time and caches, readable without building', async () => {
    const { remedyIndexIfReady, warmRemedyIndex } = await import('./remedyIndex')
    const rep = tinyRepertory()
    expect(remedyIndexIfReady(rep)).toBeNull()
    const idx = await warmRemedyIndex(rep)
    expect(remedyIndexIfReady(rep)).toBe(idx)
    expect(await warmRemedyIndex(rep)).toBe(idx)
    expect(idx.range(1)).toEqual([0, 3])
    expect([...idx.rubrics.subarray(0, 3)]).toEqual([1, 2, 6])
    expect([...idx.grades.subarray(0, 3)]).toEqual([3, 4, 1])
  })
})

/** A flat repertory of `n` rubrics with pseudo-random entries (enough to span many build slices). */
function bigRepertory(n: number): Repertory {
  const offsets = [0], data: number[] = []
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
  for (let i = 0; i < n; i++) {
    const k = rnd() % 30
    for (let j = 0; j < k; j++) data.push(((rnd() % 2000) << 2) | (rnd() & 3))
    offsets.push(data.length)
  }
  const text = Array.from({ length: n }, (_, i) => `r${i}`)
  return new Repertory({ abbrev: 'big', title: 'Big', fullTitle: 'Big', lang: 'en', author: '', year: null, publisher: '', license: '', rubricCount: n, entryCount: data.length, file: '' },
    { abbrev: 'big', title: 'Big', lang: 'en', chapters: [0], text, parent: text.map((_, i) => (i ? 0 : -1)), depth: text.map((_, i) => (i ? 1 : 0)), chapter: text.map(() => 0), offsets, data })
}

describe('chunked remedy index build', () => {
  // Independent of machine speed: the clock advances a fixed 10 ms per read, so every slice ends
  // after one build step, and slices are scheduled on fake timers that the test drives.
  let clock = 0
  beforeEach(() => {
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('builds the same index as the synchronous build, across many slices', async () => {
    const rep = bigRepertory(20000)
    const sync = new RemedyIndex(rep)
    const scheduled = vi.spyOn(globalThis, 'setTimeout')
    const done = buildRemedyIndexChunked(rep)
    await vi.runAllTimersAsync()
    const chunked = await done
    expect(scheduled.mock.calls.length).toBeGreaterThan(10)
    expect(chunked.rubrics).toEqual(sync.rubrics)
    expect(chunked.grades).toEqual(sync.grades)
    expect(chunked.maxGrade).toBe(sync.maxGrade)
    for (const id of [0, 5, 1999, 2500]) expect(chunked.entries(id)).toEqual(sync.entries(id))
  }, 30_000)
  it('warming (idle then urgent) shares one build and publishes it', async () => {
    const rep = bigRepertory(5000)
    expect(remedyIndexIfReady(rep)).toBeNull()
    // a mocked idle scheduler: the idle callback comes later than the urgent build starts
    const idle = vi.fn((cb: () => void) => Number(setTimeout(cb, 50)))
    vi.stubGlobal('requestIdleCallback', idle)
    try {
      const a = warmRemedyIndex(rep), b = warmRemedyIndex(rep, true)
      expect(idle).toHaveBeenCalledTimes(1)
      await vi.runAllTimersAsync()
      const [ia, ib] = await Promise.all([a, b])
      expect(ia).toBe(ib)
      expect(remedyIndexIfReady(rep)).toBe(ia)
      expect(remedyIndex(rep)).toBe(ia)
    } finally { vi.unstubAllGlobals() }
  }, 30_000)
})
