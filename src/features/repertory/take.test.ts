import { describe, expect, it } from 'vitest'
import { bookAbbrev, describeTake, matchChapters, parseTake, rubricHtml, rubricPlainText } from './take'

const ok = (s: string) => {
  const r = parseTake(s)
  if (!r.ok) throw new Error(`${s}: ${r.error}`)
  return r.options
}
const err = (s: string) => {
  const r = parseTake(s)
  if (r.ok) throw new Error(`${s} should fail`)
  return r.error
}

describe('parseTake', () => {
  it('takes weight 1 into the active clipboard by default', () => {
    expect(ok('+')).toMatchObject({ weight: 1, clipboard: null, eliminatory: false, exclusive: false, group: null, subRubrics: false })
    expect(ok('=')).toMatchObject({ weight: 1, clipboard: null })
  })
  it('reads intensity 0–4', () => {
    expect(ok('+2').weight).toBe(2)
    expect(ok('+0').weight).toBe(0)
    expect(ok('=4').weight).toBe(4)
    expect(err('+5')).toMatch(/out of range/)
    expect(err('+12')).toMatch(/single digit/)
  })
  it('reads the target clipboard', () => {
    expect(ok('+1>3')).toMatchObject({ weight: 1, clipboard: 3 })
    expect(ok('+>12').clipboard).toBe(12)
    expect(err('+1>13')).toMatch(/out of range/)
    expect(err('+1>')).toMatch(/Clipboard number/)
  })
  it('reads qualifications, groups and sub-rubrics in any order', () => {
    expect(ok('+!')).toMatchObject({ eliminatory: true })
    expect(ok('+x')).toMatchObject({ exclusive: true })
    expect(ok('+c')).toMatchObject({ causal: true })
    expect(ok('+a').group).toBe('a')
    expect(ok('+1/s')).toMatchObject({ weight: 1, subRubrics: true })
    expect(ok('+2>1!b/s')).toMatchObject({ weight: 2, clipboard: 1, eliminatory: true, group: 'b', subRubrics: true })
    expect(ok(' + 3 a ')).toMatchObject({ weight: 3, group: 'a' })
    expect(ok('+A').group).toBe('a')
  })
  it('rejects contradictions and junk', () => {
    expect(err('+!x')).toMatch(/both/)
    expect(err('+ab')).toMatch(/one group/)
    expect(err('+/x')).toMatch(/cross-references/)
    expect(err('+?')).toMatch(/Unexpected/)
    expect(err('2')).toMatch(/Start with/)
    expect(err('')).toMatch(/Empty/)
  })
})

describe('formatting', () => {
  it('describes options', () => {
    expect(describeTake(ok('+2>3!a/s'))).toBe('×2 · eliminative · group a · with sub-rubrics · → clipboard 3')
    expect(describeTake(ok('+'), 'Clipboard 1')).toBe('×1 · → Clipboard 1')
  })
  it('prints remedies in book case', () => {
    expect(bookAbbrev('Acon', 1)).toBe('acon.')
    expect(bookAbbrev('acon', 2)).toBe('Acon.')
    expect(bookAbbrev('Acon.', 3)).toBe('Acon.')
    expect(bookAbbrev('Acon', 4)).toBe('ACON.')
  })
  it('renders plain text and html', () => {
    const rem = [{ abbrev: 'Acon', grade: 1 }, { abbrev: 'Ars', grade: 3 }, { abbrev: 'Bell', grade: 2 }]
    expect(rubricPlainText('Mind - fear', rem)).toBe('Mind - fear: acon. ARS. Bell.')
    expect(rubricPlainText('Mind', [])).toBe('Mind')
    const html = rubricHtml('Mind <x>', rem)
    expect(html).toContain('&lt;x&gt;')
    expect(html).toContain('<b style="color:#c2261b">Ars.</b>')
    expect(html).toContain('<i style="color:#1c55b8">Bell.</i>')
  })
})

describe('matchChapters', () => {
  const ch = ['Mind', 'Vertigo', 'Head', 'Heart & Circulation', 'Hearing', 'Genitalia male', 'Stomach'].map((name, id) => ({ id, name }))
  it('ranks prefix, then word prefix, then substring', () => {
    expect(matchChapters(ch, 'mi').map(c => c.name)).toEqual(['Mind'])
    expect(matchChapters(ch, 'he').map(c => c.name)).toEqual(['Head', 'Heart & Circulation', 'Hearing'])
    expect(matchChapters(ch, 'circ').map(c => c.name)).toEqual(['Heart & Circulation'])
    expect(matchChapters(ch, 'ale').map(c => c.name)).toEqual(['Genitalia male'])
    expect(matchChapters(ch, '').length).toBe(ch.length)
  })
})
