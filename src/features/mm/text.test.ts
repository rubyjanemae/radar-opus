import { describe, expect, it } from 'vitest'
import type { MateriaMedicaFile, Remedy } from '../../data/types'
import { RemedyResolver, normToken, parseAltNames } from './resolve'
import { buildCitations, buildDocs, groupRelations, highlight, parseParagraph, parseRelationships, queryTerms, searchDocs, snippet, titleCase } from './text'

const REMS: Remedy[] = [
  { id: 1, abbrev: 'Nat-m', name: 'Natrium Muriaticum', altName: '{"Natrum Muriaticum"}' },
  { id: 2, abbrev: 'Kali-c', name: 'Kalium Carbonicum', altName: '{"Kali Carbonicum"}' },
  { id: 3, abbrev: 'Puls', name: 'Pulsatilla Pratensis', altName: null },
  { id: 4, abbrev: 'Puls-n', name: 'Pulsatilla Nuttalliana', altName: null },
  { id: 5, abbrev: 'Merc', name: 'Mercurius Solubilis', altName: null },
  { id: 6, abbrev: 'Merc-c', name: 'Mercurius Corrosivus', altName: null },
  { id: 7, abbrev: 'Phos', name: 'Phosphorus', altName: null },
  { id: 8, abbrev: 'Bry', name: 'Bryonia Alba', altName: null },
  { id: 9, abbrev: 'Hydr', name: 'Hydrastis Canadensis', altName: null },
  { id: 10, abbrev: 'Hydrang', name: 'Hydrangea Arborescens', altName: null },
  { id: 11, abbrev: 'Chin', name: 'China Officinalis', altName: null },
  { id: 12, abbrev: 'Cina', name: 'Cina Maritima', altName: null },
  { id: 13, abbrev: 'Nux-v', name: 'Nux Vomica', altName: null },
  { id: 14, abbrev: 'Nux-m', name: 'Nux Moschata', altName: null },
  { id: 15, abbrev: 'Ign', name: 'Ignatia Amara', altName: null },
  { id: 16, abbrev: 'Sep', name: 'Sepia Officinalis', altName: null },
  { id: 17, abbrev: 'Apis', name: 'Apis Mellifica', altName: null },
  { id: 18, abbrev: 'Ars', name: 'Arsenicum Album', altName: null },
  { id: 19, abbrev: 'Hydr-ac', name: 'Hydrocyanicum Acidum', altName: null },
  { id: 20, abbrev: 'Thuj', name: 'Thuja Occidentalis', altName: null },
]
const resolver = new RemedyResolver(REMS, [[1, 'NATRUM MURIATICUM']])
const abbrevOf = (s: string) => resolver.resolve(s)?.abbrev ?? null

describe('remedy resolver', () => {
  it('normalises tokens and alt-name arrays', () => {
    expect(normToken(' Nat. mur. ')).toBe('nat mur')
    expect(normToken('Kali-c')).toBe('kali c')
    expect(parseAltNames('{Exalgin,"Methyl Acetanilid"}')).toEqual(['Exalgin', 'Methyl Acetanilid'])
    expect(parseAltNames(null)).toEqual([])
  })
  it('resolves exact abbreviations, tolerant of case and dots', () => {
    expect(abbrevOf('PULS')).toBe('Puls')
    expect(abbrevOf('Nat-m.')).toBe('Nat-m')
    expect(abbrevOf('nat m')).toBe('Nat-m')
  })
  it('resolves Boericke shorthand by name prefix', () => {
    expect(abbrevOf('Natr mur')).toBe('Nat-m')
    expect(abbrevOf('Nat mur')).toBe('Nat-m')
    expect(abbrevOf('Kali carb')).toBe('Kali-c')
    expect(abbrevOf('Pulsat')).toBe('Puls')
    expect(abbrevOf('Mercur')).toBe('Merc')
    expect(abbrevOf('Merc cor')).toBe('Merc-c')
    expect(abbrevOf('Hydrangea')).toBe('Hydrang')
    expect(abbrevOf('Hydrocy acid')).toBe('Hydr-ac')
    expect(abbrevOf('Bryon')).toBe('Bry')
    expect(abbrevOf('Phosphor')).toBe('Phos')
    expect(abbrevOf('China')).toBe('Chin')
    expect(abbrevOf('Cina')).toBe('Cina')
    expect(abbrevOf('Nux')).toBe('Nux-v')
    expect(abbrevOf('Nux vom.')).toBe('Nux-v')
  })
  it('prefers the remedy with a monograph and rejects look-alike words', () => {
    const rems: Remedy[] = [
      { id: 1, abbrev: 'Digin', name: 'Digitalinum', altName: null },
      { id: 2, abbrev: 'Dig', name: 'Digitalis Purpurea', altName: null },
      { id: 3, abbrev: 'Lil-s', name: 'Lilium Superbum', altName: null },
      { id: 4, abbrev: 'Lil-t', name: 'Lilium Tigrinum', altName: null },
      { id: 5, abbrev: 'Per', name: 'Coqueluchinum', altName: '{Pertussinum}' },
      { id: 6, abbrev: 'Tab', name: 'Tabacum', altName: null },
    ]
    const r = new RemedyResolver(rems, [[2, 'DIGITALIS PURPUREA'], [4, 'LILIUM TIGRINUM'], [5, 'PERTUSSINUM'], [6, 'TABACUM']])
    expect(r.resolve('Digit')?.abbrev).toBe('Dig')
    expect(r.resolve('Lilium')?.abbrev).toBe('Lil-t')
    expect(r.resolve('Peru')).toBeNull()
    expect(r.resolve('Tabes')).toBeNull()
    expect(r.resolve('Tabac')?.abbrev).toBe('Tab')
  })
  it('rejects prose', () => {
    expect(abbrevOf('Gnawing, hungry, faint feeling')).toBeNull()
    expect(abbrevOf('in')).toBeNull()
    expect(abbrevOf('Hydrocele')).toBeNull()
    expect(abbrevOf('Hyd')).toBe('Hydr')
  })
})

describe('paragraph parsing', () => {
  it('renders emphasis and links remedies inside parentheses only', () => {
    const spans = parseParagraph('Cold shivering (*Acon; Nux*). *Gnawing* feeling (*Hydrangea*).', resolver)
    expect(spans.map(s => s.text).join('')).toBe('Cold shivering (Acon; Nux). Gnawing feeling (Hydrangea).')
    expect(spans.filter(s => s.remedyId).map(s => s.text)).toEqual(['Nux', 'Hydrangea'])
    expect(spans.find(s => s.text === 'Gnawing')).toEqual({ text: 'Gnawing', em: true })
    expect(spans.find(s => s.text === 'Acon; ')?.em).toBe(true)
  })
  it('links every emphasised list in relationship sections and skips the remedy itself', () => {
    const spans = parseParagraph('Complementary to *Apis; Sepia; Ign*. Also *Natr mur*.', resolver, { relationship: true, selfId: 1 })
    expect(spans.filter(s => s.remedyId).map(s => s.remedyId)).toEqual([17, 16, 15])
  })
  it('keeps unmatched asterisks as text', () => {
    expect(parseParagraph('a * b', resolver).map(s => s.text).join('')).toBe('a * b')
  })
})

describe('relationships', () => {
  const text = 'Complementary to *Apis; Sepia; Ign*.\nCompare: *Aqua marina*-Isotonic plasma. (*Hydrangea*). *Ignat; Sep; Thuja*.\nAntidote: *Ars; Phos; Spir nit dulc*.'
  it('splits labelled clauses and resolves their remedies', () => {
    const rel = parseRelationships(text, resolver, 1)
    expect(rel.map(r => r.kind)).toEqual(['Complementary', 'Compare', 'Antidotes'])
    expect(rel[0].remedies).toEqual([17, 16, 15])
    expect(rel[1].remedies).toEqual([10, 15, 16, 20])
    expect(rel[2].remedies).toEqual([18, 7])
  })
  it('reads labels ending in “.”, “;” and “.:”', () => {
    const rel = parseRelationships('Complementary.: *Puls*. Inimical. *Phos*.\nCompatible; *Bry; Merc*.', resolver, 1)
    expect(rel.map(r => [r.kind, r.remedies])).toEqual([['Complementary', [3]], ['Inimical', [7]], ['Compatible', [8, 5]]])
  })
  it('ends a list clause before a sentence of prose', () => {
    const rel = parseRelationships('Complementary: *Puls; Phos. Bry* intensifies its action.', resolver, 1)
    expect(rel[0]).toMatchObject({ kind: 'Complementary', remedies: [3, 7] })
    expect(rel[1]).toMatchObject({ kind: 'Compare', remedies: [8] })
  })
  it('keeps the qualifier as context and groups by kind', () => {
    const rel = parseRelationships('Compare: *Puls*. In albuminuria compare: *Merc cor*. Inimical: *Phos*.', resolver, 1)
    expect(rel[1]).toMatchObject({ kind: 'Compare', context: 'In albuminuria', remedies: [6] })
    const g = groupRelations(rel)
    expect(g.map(x => x.kind)).toEqual(['Inimical', 'Compare'])
    expect(g[1].remedies).toEqual([3, 6])
  })
  it('links a remedy in a sequence phrase and plain names in Incompatible clauses', () => {
    const withBook = new RemedyResolver(REMS, REMS.map(r => [r.id, r.name.toUpperCase()]))
    const rel = groupRelations(parseRelationships('Complementary: *Sep* acts well *after Pulsat* and *Thuja*.\nIncompatible: *Bry*; Phosphorus should not be given *after* Sep.\nCompare: *Water cure*.', withBook, 16))
    const ab = (k: string) => rel.find(g => g.kind === k)!.remedies.map(id => REMS.find(r => r.id === id)!.abbrev)
    expect(ab('Complementary')).toEqual(['Puls', 'Thuj'])
    expect(ab('Inimical')).toEqual(['Bry', 'Phos'])
    expect(rel.find(g => g.kind === 'Compare')).toBeUndefined()
    // prose stays prose outside Incompatible clauses
    const spans = parseParagraph('Compare: Phosphorus should be studied.', withBook, { relationship: true, selfId: 16 })
    expect(spans.some(s => s.remedyId !== undefined)).toBe(false)
  })
  it('treats an unlabelled opening as Compare', () => {
    expect(parseRelationships('*Puls; Sep*.', resolver, null)[0]).toMatchObject({ kind: 'Compare', remedies: [3, 16] })
  })
})

describe('full-text search', () => {
  const entries = [
    { remedyId: 1, heading: 'NATRUM MURIATICUM', commonName: 'Salt', intro: 'Great *craving for salt*.', sections: [{ heading: 'Mind', text: 'Consolation aggravates. Salt again.' }] },
    { remedyId: 3, heading: 'PULSATILLA', commonName: 'Wind flower', intro: 'Weeping disposition.', sections: [{ heading: 'Stomach', text: 'Aversion to fat food, salt.' }] },
  ]
  const docs = buildDocs(entries)
  it('parses query terms and phrases', () => {
    expect(queryTerms('Craving  "for salt" a')).toEqual(['craving', 'for salt'])
  })
  it('requires all terms in one section and returns hits in book order', () => {
    const r = searchDocs(docs, 'salt')
    expect(r.hits.map(h => [h.remedyId, h.section])).toEqual([[1, -1], [1, 0], [3, 0]])
    expect(searchDocs(docs, 'craving salt').hits).toHaveLength(1)
    expect(searchDocs(docs, '').hits).toHaveLength(0)
  })
  it('highlights terms case-insensitively and merges overlaps', () => {
    expect(highlight('Salt and SALTY', ['salt'])).toEqual([{ text: 'Salt', hit: true }, { text: ' and ', hit: false }, { text: 'SALT', hit: true }, { text: 'Y', hit: false }])
    expect(highlight('abcdef', ['bcd', 'cde'])).toEqual([{ text: 'a', hit: false }, { text: 'bcde', hit: true }, { text: 'f', hit: false }])
  })
  it('makes snippets around the first hit', () => {
    const long = 'word '.repeat(40) + 'target ' + 'tail '.repeat(40)
    const parts = snippet(long, long.toLowerCase(), ['target'])
    expect(parts[0].text).toBe('…')
    expect(parts.some(p => p.hit && p.text === 'target')).toBe(true)
    expect(parts[parts.length - 1].text).toBe('…')
  })
  it('builds a citation index', () => {
    const cites = buildCitations([{ remedyId: 3, heading: 'P', commonName: '', intro: 'x (*Natr mur*)', sections: [{ heading: 'Relationship', text: 'Compare: *Sepia*.' }] }], resolver)
    expect(cites.get(1)).toEqual([{ remedyId: 3, section: -1, heading: 'Introduction' }])
    expect(cites.get(16)).toEqual([{ remedyId: 3, section: 0, heading: 'Relationship' }])
  })
  it('title-cases headings', () => {
    expect(titleCase('ABIES CANADENSIS-PINUS CANADENSIS')).toBe('Abies Canadensis-Pinus Canadensis')
  })
})

// Real data: Boericke via OOREP. Skipped when the data folder is absent.
const nodeFs = 'node:fs'
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean }
const MM = 'public/data/mm-boericke.json', REM = 'public/data/remedies.json'
describe.skipIf(!existsSync(MM) || !existsSync(REM))('Boericke data', () => {
  const file = existsSync(MM) ? JSON.parse(readFileSync(MM, 'utf8')) as MateriaMedicaFile : null
  const rows = existsSync(REM) ? JSON.parse(readFileSync(REM, 'utf8')) as [number, string, string, string | null][] : []
  const remedies = rows.map(([id, abbrev, name, altName]) => ({ id, abbrev, name, altName }))
  const real = new RemedyResolver(remedies, file!.remedies.map(e => [e.remedyId, e.heading]))
  const ab = (s: string) => real.resolve(s)?.abbrev
  it('resolves common Boericke shorthand to the right remedies', () => {
    expect(ab('Natr mur')).toBe('Nat-m')
    expect(ab('Nux vom')).toBe('Nux-v')
    expect(ab('Kali carb')).toBe('Kali-c')
    expect(ab('Mercur')).toBe('Merc')
    expect(ab('Pulsat')).toBe('Puls')
    expect(ab('Bryon')).toBe('Bry')
    expect(ab('Phosphor')).toBe('Phos')
    expect(ab('Thuja')).toBe('Thuj')
    expect(ab('Ammon mur')).toBe('Am-m')
    expect(ab('Calc')).toBe('Calc')
    expect(ab('Sulph')).toBe('Sulph')
  })
  it('resolves at least 90% of the remedy tokens in Relationship sections', () => {
    let total = 0, ok = 0
    const miss = new Map<string, number>()
    for (const e of file!.remedies) {
      for (const s of e.sections) {
        if (!/relation/i.test(s.heading)) continue
        for (const m of s.text.matchAll(/\*([^*]+)\*/g)) {
          for (const tok of m[1].split(/\s*[;,]\s*|\.\s+(?=[A-Z])/)) {
            const t = tok.trim().replace(/\.$/, '')
            if (!/^[A-Z]/.test(t) || t.split(' ').length > 3) continue
            total++
            if (real.resolve(t)) ok++
            else miss.set(t, (miss.get(t) ?? 0) + 1)
          }
        }
      }
    }
    const rate = ok / total
    if (rate < 0.9) console.log([...miss].sort((a, b) => b[1] - a[1]).slice(0, 60))
    expect(rate).toBeGreaterThan(0.9)
  })
  it("parses Nat-m's relationships (golden)", () => {
    const e = file!.remedies.find(x => x.remedyId === remedies.find(r => r.abbrev === 'Nat-m')!.id)!
    const rel = parseRelationships(e.sections.find(s => s.heading === 'Relationship')!.text, real, e.remedyId)
    const kinds = groupRelations(rel).map(g => g.kind)
    expect(kinds).toEqual(['Complementary', 'Antidotes', 'Compare'])
    const comp = groupRelations(rel).find(g => g.kind === 'Complementary')!.remedies.map(id => remedies.find(r => r.id === id)!.abbrev)
    expect(comp).toEqual(['Apis', 'Sep', 'Ign'])
  })
})
