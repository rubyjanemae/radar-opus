import { describe, expect, it } from 'vitest'
import type { MateriaMedicaFile, Remedy } from '../../data/types'
import { headingNamesRemedy, splitTrailingRelationships } from '../../../scripts/lib/boericke.mjs'
import { RemedyResolver } from './resolve'
import { groupRelations, parseParagraph, parseRelationships } from './text'

// Real data: Boericke via OOREP (public/data). Skipped when the data folder is absent.
const nodeFs = 'node:fs'
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean }
const MM = 'public/data/mm-boericke.json', REM = 'public/data/remedies.json'

describe.skipIf(!existsSync(MM) || !existsSync(REM))('Boericke data integrity', () => {
  const file = JSON.parse(readFileSync(MM, 'utf8')) as MateriaMedicaFile
  const rows = JSON.parse(readFileSync(REM, 'utf8')) as [number, string, string, string | null][]
  const remedies: Remedy[] = rows.map(([id, abbrev, name, altName]) => ({ id, abbrev, name, altName }))
  const byId = new Map(remedies.map(r => [r.id, r]))
  const byAbbrev = new Map(remedies.map(r => [r.abbrev, r]))
  const entryOf = (abbrev: string) => file.remedies.find(e => e.remedyId === byAbbrev.get(abbrev)!.id)

  it('has all 688 monographs, one per remedy', () => {
    expect(file.remedies).toHaveLength(688)
    const ids = file.remedies.map(e => e.remedyId)
    expect(new Set(ids).size).toBe(688)
    for (const id of ids) expect(byId.has(id)).toBe(true)
  })

  it('names each monograph after its own remedy', () => {
    const wrong = file.remedies.filter(e => !headingNamesRemedy(e.heading, byId.get(e.remedyId)!)).map(e => `${e.heading} → ${byId.get(e.remedyId)!.abbrev}`)
    expect(wrong).toEqual([])
    expect(file.remedies.some(e => !e.heading.trim() || /^none$/i.test(e.heading))).toBe(false)
  })

  it('files the formerly mis-identified monographs under the right remedies', () => {
    expect(entryOf('Acet-ac')?.heading).toBe('ACETICUM ACIDUM')
    expect(entryOf('Lac-ac')?.heading).toBe('LACTICUM ACIDUM')
    expect(entryOf('Sarcol-ac')?.heading).toBe('SARCOLACTICUM ACIDUM')
    expect(entryOf('Ind')?.heading).toBe('INDIUM METALLICUM')
    expect(entryOf('Irid')?.heading).toBe('IRIDIUM METALLICUM')
    expect(entryOf('Rad-br')?.heading).toBe('RADIUM BROMATUM')
    expect(entryOf('Hip-ac')?.heading).toBe('HIPPURICUM ACIDUM')
    expect(entryOf('Cadm-br')).toBeUndefined()
    expect(entryOf('Uric-ac')).toBeUndefined()
    const juni = entryOf('Juni-c')!, just = entryOf('Just')!
    expect(juni.heading).toBe('JUNIPERUS COMMUNIS')
    expect(juni.sections.map(s => s.heading)).toEqual(['Urinary', 'Respiratory', 'Relationship', 'Dose'])
    expect(just.heading).toBe('JUSTICIA ADHATODA')
    expect(just.commonName).toMatch(/Indian Shrub/)
    expect(just.sections.map(s => s.heading)).toEqual(['Head', 'Throat', 'Respiratory', 'Relationship', 'Dose'])
    expect(just.sections.at(-1)!.text).not.toMatch(/Indian Shrub/)
  })

  it('keeps relationship paragraphs in the Relationship section', () => {
    const stray: string[] = []
    for (const e of file.remedies) for (const s of e.sections) {
      if (/relation/i.test(s.heading)) continue
      s.text.split('\n').forEach((l, i) => { if (i > 0 && /^\s*(Compare|Antidotes?|Complementary|Incompatible|Inimical)\b[^:]{0,30}:/.test(l)) stray.push(`${e.heading} › ${s.heading}`) })
      if (/[.;)]\s+(Compare|Antidotes?|Complementary|Incompatible|Inimical)\s*:/.test(s.text)) stray.push(`${e.heading} › ${s.heading} (inline)`)
    }
    expect(stray).toEqual([])
    for (const ab of ['Ars', 'Aeth', 'Am-i', 'X-ray', 'Laburn', 'Scroph-n']) expect(entryOf(ab)!.sections.map(s => s.heading)).toContain('Relationship')
    expect(entryOf('Ars')!.sections.map(s => s.heading).slice(-3)).toEqual(['Modalities', 'Relationship', 'Dose'])
  })

  const resolver = new RemedyResolver(remedies, file.remedies.map(e => [e.remedyId, e.heading]))
  const relations = (abbrev: string) => {
    const e = entryOf(abbrev)!
    return groupRelations(e.sections.filter(s => /relation/i.test(s.heading)).flatMap(s => parseRelationships(s.text, resolver, e.remedyId)))
  }
  const group = (abbrev: string, kind: string) => (relations(abbrev).find(g => g.kind === kind)?.remedies ?? []).map(id => byId.get(id)!.abbrev)

  it('parses Sulphur’s relationships, plain and emphasised names alike', () => {
    expect(group('Sulph', 'Complementary')).toEqual(expect.arrayContaining(['Aloe', 'Psor', 'Acon']))
    expect(group('Sulph', 'Compare')).toEqual(expect.arrayContaining(['Acon', 'Merc', 'Calc', 'Lyc', 'Sep', 'Sars', 'Puls']))
    expect(group('Sulph', 'Compare')).not.toContain('Sulph')
  })

  it('parses Phosphorus’ relationships', () => {
    expect(group('Phos', 'Complementary')).toEqual(expect.arrayContaining(['Ars', 'All-c', 'Lyc', 'Sil']))
    expect(group('Phos', 'Inimical')).toEqual(['Caust'])
    expect(group('Phos', 'Compare')).toEqual(expect.arrayContaining(['Tub', 'Calc', 'Chin', 'Sep', 'Lyc', 'Sulph']))
    expect(group('Phos', 'Antidotes')).toEqual(expect.arrayContaining(['Ter', 'Kali-ma', 'Nux-v']))
  })

  it('parses Lachesis’ relationships, including “Salt” as Natrium muriaticum', () => {
    expect(group('Lach', 'Antidotes')).toEqual(expect.arrayContaining(['Ars', 'Merc', 'Nat-m']))
    expect(group('Lach', 'Inimical')).toEqual(expect.arrayContaining(['Acet-ac', 'Carb-ac']))
    expect(group('Lach', 'Compare')).toEqual(expect.arrayContaining(['Nat-m', 'Nit-ac', 'Naja']))
  })

  it('parses Arsenicum album’s relationships (formerly trailing Modalities)', () => {
    expect(group('Ars', 'Complementary')).toEqual(expect.arrayContaining(['Rhus-t', 'Carb-v', 'Phos', 'Thuj', 'Sec']))
    expect(group('Ars', 'Antidotes')).toEqual(expect.arrayContaining(['Op', 'Carb-v', 'Chin', 'Hep', 'Nux-v']))
    expect(group('Ars', 'Compare')).toEqual(expect.arrayContaining(['Iod', 'Phos', 'Chin', 'Verat', 'Carb-v', 'Kali-p']))
  })

  it('links the Calcarea–Lycopodium–Sulphur sequence and Calcarea’s inimicals', () => {
    expect(group('Lyc', 'Complementary')).toEqual(expect.arrayContaining(['Calc']))
    expect(group('Calc', 'Inimical')).toEqual(expect.arrayContaining(['Bry', 'Sulph']))
    const puls = entryOf('Puls')!
    const rel = puls.sections.find(s => /relation/i.test(s.heading))!
    expect(parseParagraph(rel.text, resolver, { relationship: true, selfId: puls.remedyId }).some(s => s.text === 'Ionesia Asoca' && s.remedyId === byAbbrev.get('Jon')!.id)).toBe(true)
  })

  it('reads labels ending in “.”, “;” or “.:” (Apis, Nux vomica)', () => {
    expect(group('Apis', 'Inimical')).toEqual(['Rhus-t'])
    expect(group('Apis', 'Complementary')).toEqual(['Nat-m'])
    expect(group('Nux-v', 'Complementary')).toEqual(['Sulph', 'Sep'])
    expect(group('Nux-v', 'Inimical')).toEqual(['Zinc'])
  })

  it('keeps a prose remark after a list out of the list (Sepia: “Nux intensifies action”)', () => {
    const comp = group('Sep', 'Complementary')
    expect(comp).toContain('Nat-m')
    expect(comp).not.toContain('Nux-v')
    expect(group('Sep', 'Inimical')).toEqual(['Lach', 'Puls'])
  })

  it('leaves out relationship kinds that name no remedy', () => {
    const kinds = relations('Caust').map(g => g.kind)
    expect(kinds).not.toContain('Antidotes')
    for (const g of relations('Caust')) expect(g.remedies.length).toBeGreaterThan(0)
  })

  it('resolves Boericke cross-references to the parent polychrest, not a derivative or sibling', () => {
    const res = (q: string) => resolver.resolve(q)?.abbrev ?? null
    const expected: [string, string | null][] = [
      ['Digit', 'Dig'], ['Digital', 'Dig'], ['Chelidon', 'Chel'], ['Chelid', 'Chel'], ['Agaric', 'Agar'],
      ['Hyoscy', 'Hyos'], ['Hyosc', 'Hyos'], ['Lilium', 'Lil-t'], ['Kali hyd', 'Kali-i'], ['Kal hyd', 'Kali-i'],
      ['Cannab', 'Cann-s'], ['Cannab ind', 'Cann-i'], ['Carb', 'Carb-v'], ['Crotalus', 'Crot-h'], ['Crot', 'Crot-h'],
      ['Eucalypt', 'Eucal'], ['Juniperus', 'Juni-c'], ['Carduus', 'Card-m'], ['Colchic', 'Colch'], ['Canthar', 'Canth'],
      ['Berber', 'Berb'], ['Aurum mur', 'Aur-m'], ['Xanthox', 'Xan'], ['Cratoeg', 'Crat'], ['Asafaet', 'Asaf'],
      // not remedies, or not the remedy the abbreviation spells
      ['Peru', null], ['Tabes', null], ['Coccion', null], ['Guaiacol', null],
    ]
    expect(expected.map(([q]) => [q, res(q)])).toEqual(expected)
  })

  it('links plain remedy lists in the reader but not prose', () => {
    const sulph = entryOf('Sulph')!
    const rel = sulph.sections.find(s => /relation/i.test(s.heading))!
    const linked = parseParagraph(rel.text, resolver, { relationship: true, selfId: sulph.remedyId }).filter(s => s.remedyId !== undefined && !s.em).map(s => s.text)
    expect(linked).toEqual(expect.arrayContaining(['Lyc', 'Sep', 'Sars', 'Puls']))
    const natm = entryOf('Nat-m')!
    const nrel = natm.sections.find(s => /relation/i.test(s.heading))!
    const plain = parseParagraph(nrel.text, resolver, { relationship: true, selfId: natm.remedyId }).filter(s => s.remedyId !== undefined && !s.em).map(s => s.text)
    expect(plain).not.toContain('Lupus')
    expect(plain).not.toContain('Lymphadenitis')
  })
})

describe('splitTrailingRelationships', () => {
  it('moves a trailing block into a new Relationship section before Dose', () => {
    const { sections } = splitTrailingRelationships([
      { heading: 'Modalities', text: '*Worse*, cold.\nComplementary: *Rhus*.\nCompare: *Iod*.' },
      { heading: 'Dose', text: 'Third potency.' },
    ])
    expect(sections).toEqual([
      { heading: 'Modalities', text: '*Worse*, cold.' },
      { heading: 'Relationship', text: 'Complementary: *Rhus*.\nCompare: *Iod*.' },
      { heading: 'Dose', text: 'Third potency.' },
    ])
  })
  it('splits an inline clause, appends to an existing Relationship section, and leaves a leading clause alone', () => {
    const { sections } = splitTrailingRelationships([
      { heading: 'Skin', text: 'Antidotes: *Rhus poisoning*. Red eruptions.' },
      { heading: 'Modalities', text: '*Worse*, winter; 11 am. Compare: *Lycop*.' },
      { heading: 'Relationship', text: 'Complementary: *Calc*.' },
    ])
    expect(sections.map(s => s.text)).toEqual(['Antidotes: *Rhus poisoning*. Red eruptions.', '*Worse*, winter; 11 am.', 'Complementary: *Calc*.\nCompare: *Lycop*.'])
  })
})
