import { describe, expect, it } from 'vitest'
import { tinyRepertory } from '../repertory/fixtures'
import { remedyIndex } from './remedyIndex'

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
