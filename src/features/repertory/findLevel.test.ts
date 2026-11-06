import { describe, expect, it } from 'vitest'
import { alphabetical, matchLevel, wordStartMatch } from './findLevel'

describe('wordStartMatch', () => {
  it('matches the start of the name or of a later word, never inside a word', () => {
    expect(wordStartMatch('abrupt', 'abr')).toBe(1)
    expect(wordStartMatch('speech, abrupt', 'abr')).toBe(2)
    expect(wordStartMatch('fear', 'ear')).toBe(0)
    expect(wordStartMatch('hardhearted', 'ear')).toBe(0)
    expect(wordStartMatch('ear noises', 'ear')).toBe(1)
    expect(wordStartMatch('Genitalia male', 'm')).toBe(2)
  })
  it('treats punctuation as a word break, in the name and in what was typed', () => {
    expect(wordStartMatch('abroad; desire to go', 'abroad desire')).toBe(1)
    expect(wordStartMatch('abroad; desire to go', 'abroad ')).toBe(1)
    expect(wordStartMatch('absent-minded', 'minded')).toBe(2)
    expect(wordStartMatch('anything', '')).toBe(1)
  })
})

describe('matchLevel', () => {
  const names = ['anger', 'fear', 'ear noises', 'clear', 'noise, from', 'earnest']
  const name = (i: number) => names[i]
  it('keeps the level order, name starts before later words', () => {
    expect(matchLevel([0, 1, 2, 3, 4, 5], name, 'ear')).toEqual([2, 5])
    expect(matchLevel([0, 1, 2, 3, 4, 5], name, 'no')).toEqual([4, 2])
    expect(matchLevel([0, 1, 2], name, '  ')).toEqual([0, 1, 2])
  })
  it('keeps plain level order when not ranked (the chapter grid)', () => {
    expect(matchLevel([0, 1, 2, 3, 4, 5], name, 'no', false)).toEqual([2, 4])
  })
})

describe('alphabetical', () => {
  it('sorts a level by name, ignoring case, spaces before letters', () => {
    const n = ['Morning', 'abashed', 'ABANDONED', 'absentminded', 'absent father', 'Absences']
    expect(alphabetical([0, 1, 2, 3, 4, 5], i => n[i]).map(i => n[i])).toEqual(['ABANDONED', 'abashed', 'Absences', 'absent father', 'absentminded', 'Morning'])
  })
})
