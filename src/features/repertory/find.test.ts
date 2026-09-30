import { describe, expect, it } from 'vitest'
import { tinyRepertory } from './fixtures'
import { findTokens, pathMatches, wordStarts } from './logic'

describe('Find: multi-word paths', () => {
  const rep = tinyRepertory()
  it('splits words and matches word starts', () => {
    expect(findTokens(' Head  pain,forehead ')).toEqual(['head', 'pain', 'forehead'])
    expect(findTokens('head › pain')).toEqual(['head', 'pain'])
    expect(wordStarts('fear, night', 'nig')).toBe(true)
    expect(wordStarts('knight', 'nig')).toBe(false)
  })
  it('follows a path from the chapters: chapter › rubric › sub-rubric', () => {
    expect(pathMatches(rep, -1, 'head pain').map(m => m.id)).toEqual([6])
    expect(pathMatches(rep, -1, 'mind fear alone')[0]).toEqual({ id: 2, path: [0, 1, 2] })
    // levels without a word are skipped; the rubric itself takes the last word
    expect(pathMatches(rep, -1, 'mind alone').map(m => m.id)).toEqual([2])
    // at the chapter level the first word must name the chapter
    expect(pathMatches(rep, -1, 'fear alone')).toEqual([])
    expect(pathMatches(rep, -1, 'mind pain')).toEqual([])
  })
  it('searches below a level, and under a context rubric', () => {
    expect(pathMatches(rep, 0, 'fear night').map(m => m.id)).toEqual([3])
    expect(pathMatches(rep, 0, 'an').map(m => m.id)).toEqual([4])
    expect(pathMatches(rep, -1, 'alone', { within: 0 }).map(m => m.id)).toEqual([2])
    // the context's own name may (but need not) take the first word
    expect(pathMatches(rep, -1, 'mind night', { within: 0 }).map(m => m.id)).toEqual([3])
    expect(pathMatches(rep, -1, 'pain', { within: 0 })).toEqual([])
  })
  it('respects the limit and ignores an empty filter', () => {
    expect(pathMatches(rep, -1, '   ')).toEqual([])
    expect(pathMatches(rep, 0, 'a', { limit: 1 }).length).toBe(1)
  })
})
