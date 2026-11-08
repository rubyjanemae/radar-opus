import { describe, expect, it } from 'vitest'
import { chapterCaption, otherInitials } from './findCaption'

describe('chapterCaption', () => {
  it('keeps short names whole, uppercased', () => {
    expect(chapterCaption('Mind')).toBe('MIND')
    expect(chapterCaption('Vertigo')).toBe('VERTIGO')
    expect(chapterCaption('Urethra')).toBe('URETHRA')
  })
  it('keeps names of up to seven characters whole however wide', () => {
    expect(chapterCaption('Abdomen')).toBe('ABDOMEN')
    expect(chapterCaption('Kidneys')).toBe('KIDNEYS')
  })
  it('cuts long names to at most seven characters that fit the caption width, and a dot', () => {
    // narrow letters (I) keep seven
    expect(chapterCaption('Respiration')).toBe('RESPIRA.')
    expect(chapterCaption('Extremities')).toBe('EXTREMI.')
    expect(chapterCaption('Perspiration')).toBe('PERSPIR.')
    expect(chapterCaption('Urinary organs')).toBe('URINARY.')
    // wide ones keep six, as RadarOpus shows them
    expect(chapterCaption('External throat')).toBe('EXTERN.')
    expect(chapterCaption('Prostate gland')).toBe('PROSTA.')
    expect(chapterCaption('Expectoration')).toBe('EXPECT.')
    expect(chapterCaption('Generalities')).toBe('GENERA.')
    expect(chapterCaption('Geschlechtsorgane männlich')).toBe('MÄNNLI.')
  })
  it('puts the sex first for the genitalia chapters and keeps a cut space like RadarOpus', () => {
    expect(chapterCaption('Genitalia male')).toBe('MALE GE.')
    expect(chapterCaption('Genitalia female')).toBe('FEMALE .')
    expect(chapterCaption('Male  genitalia')).toBe('MALE GE.')
  })
})

describe('otherInitials', () => {
  it('lists non-letter initials once, in order', () => {
    expect(otherInitials(['abc', '3 days', 'Über', '(x)', '3rd', 'zed'])).toEqual(['3', 'ü', '('])
  })
})

describe('chapterShownName', () => {
  it('puts male / female first, as the tile caption reads, so type-ahead matches the caption', async () => {
    const { chapterShownName } = await import('./findCaption')
    expect(chapterShownName('Genitalia male')).toBe('male Genitalia')
    expect(chapterShownName('Genitalia  female')).toBe('female Genitalia')
    expect(chapterShownName('Mind')).toBe('Mind')
    expect(chapterCaption('Genitalia male')).toBe('MALE GE.')
  })
})
