import { describe, expect, it } from 'vitest'
import { Catalog } from '../../data/catalog'
import { findRemedies, remedyIntent, resolveRemedy } from './remedies'

const catalog = new Catalog([
  { id: 1, abbrev: 'Lach', name: 'Lachesis Muta', altName: null },
  { id: 2, abbrev: 'Lachn', name: 'Lachnanthes Tinctoria', altName: null },
  { id: 3, abbrev: 'Vip-l-f', name: 'Vipera Lachesis Fel', altName: null },
  { id: 4, abbrev: 'Acetan', name: 'Acetanilidum', altName: '{Exalgin,Antifebrinum}' },
  { id: 5, abbrev: 'Nat-m', name: 'Natrium Muriaticum', altName: null },
], [])

describe('remedy lookup', () => {
  it('ranks exact abbreviation, then prefixes, then words', () => {
    expect(findRemedies(catalog, 'lach').map(m => m.remedy.id)).toEqual([1, 2, 3])
    expect(findRemedies(catalog, 'Lach.')[0].remedy.id).toBe(1)
    expect(findRemedies(catalog, 'muriat')[0].remedy.abbrev).toBe('Nat-m')
  })
  it('finds alternative names', () => {
    const m = findRemedies(catalog, 'exalgin')
    expect(m[0]).toMatchObject({ field: 'alt' })
    expect(m[0].remedy.id).toBe(4)
  })
  it('resolves query tokens to a remedy id', () => {
    expect(resolveRemedy(catalog, 'nat-m')).toBe(5)
    expect(resolveRemedy(catalog, 'lachesis')).toBe(1)
    expect(resolveRemedy(catalog, 'zzz')).toBeNull()
  })
  it('recognises a remedy typed on purpose', () => {
    const intent = (q: string) => remedyIntent(q, findRemedies(catalog, q.replace(/^#/, '')))
    expect(intent('lach')).toBe(true)
    expect(intent('nat-m')).toBe(true)
    expect(intent('Lachesis muta')).toBe(true)
    expect(intent('#lac')).toBe(true)
    expect(intent('acet')).toBe(true)
    // short prefixes and ordinary words stay rubric searches
    expect(intent('la')).toBe(false)
    expect(intent('lac')).toBe(false)
    expect(intent('muriat')).toBe(false)
    expect(intent('fear')).toBe(false)
  })
})
