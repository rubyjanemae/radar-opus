import { describe, expect, it } from 'vitest'
import { additionsFile, parseAdditions } from './menuCommands'

describe('Additions › Export / Import additions', () => {
  it('round-trips the symptom notes and rejects other files', () => {
    const notes = { 'publicum:12': 'seen twice', 'kent-de:4': 'note' }
    expect(parseAdditions(additionsFile(notes))).toEqual(notes)
    expect(parseAdditions('{"format":"other"}')).toBeNull()
    expect(parseAdditions('not json')).toBeNull()
    expect(parseAdditions(JSON.stringify({ format: 'radar-opus-additions', symptomNotes: { bad: 'x', 'a:1': '', 'a:2': 'ok' } }))).toEqual({ 'a:2': 'ok' })
  })
})
