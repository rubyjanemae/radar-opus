import { describe, expect, it } from 'vitest'
import type { Remedy } from '../../data/types'
import { filterItems } from './book'
import type { BookItem } from './book'
import { normToken, RemedyResolver } from './resolve'
import { groupRelations, parseParagraph, parseRelationships } from './text'

const item = (abbrev: string, title: string, commonName = ''): BookItem => ({
  remedyId: abbrev.length, abbrev, title, commonName, letter: title[0], haystack: `${abbrev} ${title} ${commonName}`.toLowerCase(),
  abbrevKey: normToken(abbrev), names: [normToken(title)], commonKey: normToken(commonName),
})

describe('remedy list filter', () => {
  const items = [
    item('Aeth', 'Aethusa Cynapium', 'Fool’s Parsley'),
    item('Ant-ar', 'Antimonium Arsenicosum', 'Arsenite of Antimony'),
    item('Ars', 'Arsenicum Album', 'Arsenious Acid'),
    item('Ars-i', 'Arsenicum Iodatum'),
    item('Both-l', 'Bothrops Lanceolatus', 'Yellow Viper, Lachesis lanceolatus'),
    item('Lach', 'Lachesis Mutus', 'Bushmaster'),
    item('Lachn', 'Lachnanthes Tinctoria', 'Spirit Weed'),
  ]
  const abbrevs = (q: string) => filterItems(items, q).map(i => i.abbrev)
  it('puts the exact abbreviation first, then prefixes, then word and substring matches', () => {
    expect(abbrevs('lach')).toEqual(['Lach', 'Lachn', 'Both-l'])
    expect(abbrevs('ars')).toEqual(['Ars', 'Ars-i', 'Ant-ar', 'Aeth'])
    expect(abbrevs('ARS-I')).toEqual(['Ars-i'])
  })
  it('keeps book order for an empty query and requires every word', () => {
    expect(filterItems(items, '  ')).toBe(items)
    expect(abbrevs('arsenicum iod')).toEqual(['Ars-i'])
    expect(abbrevs('zzzz')).toEqual([])
  })
})

describe('relationship lists without emphasis', () => {
  const rems: Remedy[] = [
    { id: 1, abbrev: 'Sulph', name: 'Sulphur', altName: null },
    { id: 2, abbrev: 'Lyc', name: 'Lycopodium Clavatum', altName: null },
    { id: 3, abbrev: 'Sep', name: 'Sepia Officinalis', altName: null },
    { id: 4, abbrev: 'Calc', name: 'Calcarea Carbonica', altName: null },
    { id: 5, abbrev: 'Lup', name: 'Lupulus Humulus', altName: null },
    { id: 6, abbrev: 'Nat-m', name: 'Natrium Muriaticum', altName: null },
    { id: 7, abbrev: 'Merc', name: 'Mercurius Solubilis', altName: null },
  ]
  // only remedies with a monograph (a heading) are linked from plain text
  const resolver = new RemedyResolver(rems, [[1, 'SULPHUR'], [2, 'LYCOPODIUM'], [3, 'SEPIA'], [4, 'CALCAREA'], [6, 'NATRUM MUR'], [7, 'MERCURIUS']])
  it('links plain semicolon lists and lower-case emphasised names', () => {
    const spans = parseParagraph('Compare: *Mercur* and *calcarea* are useful after Sulphur. Lyc; Sep; Lupus, eczema.', resolver, { relationship: true, selfId: 1 })
    expect(spans.filter(s => s.remedyId).map(s => [s.text, s.remedyId])).toEqual([['Mercur', 7], ['calcarea', 4], ['Lyc', 2], ['Sep', 3]])
  })
  it('does not link plain words outside Relationship sections', () => {
    expect(parseParagraph('Lyc; Sep.', resolver).some(s => s.remedyId)).toBe(false)
  })
  it('drops relationship kinds that name no remedy and knows Salt', () => {
    const g = groupRelations(parseRelationships('Antidote: Paralysis from lead-poisoning.\nCompare: *Salt*; Lyc.', resolver, 1))
    expect(g.map(x => [x.kind, x.remedies])).toEqual([['Compare', [6, 2]]])
  })
})
