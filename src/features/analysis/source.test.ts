import { describe, expect, it } from 'vitest'
import { Catalog } from '../../data/catalog'
import { Repertory } from '../../data/repertory'
import type { RepertoryFile, RepertoryInfo } from '../../data/types'
import { analyze, STRATEGIES } from '../../engine/analysis'
import type { Clipboard, Symptom } from '../../engine/model'
import { tinyRepertory } from '../repertory/fixtures'
import { CatalogSource, computeRemedyStats } from './source'

/** Node's fs without depending on @types/node in the app tsconfig. */
const proc = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(m: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } } }).process
const fs = proc.getBuiltinModule('node:fs')

function withRepertories(reps: Repertory[], remedies: [number, string][] = []): Catalog {
  const c = new Catalog(remedies.map(([id, abbrev]) => ({ id, abbrev, name: abbrev, altName: null })), reps.map(r => r.info))
  const loaded = (c as unknown as { loaded: Map<string, Repertory> }).loaded
  for (const r of reps) loaded.set(r.abbrev, r)
  return c
}

describe('CatalogSource over the tiny repertory', () => {
  const cat = withRepertories([tinyRepertory()], [[1, 'Acon'], [2, 'Bell'], [3, 'Calc']])
  const src = new CatalogSource(cat)

  it('labels rubrics CHAPTER - path', () => {
    expect(src.label('t:2')).toBe('MIND - fear, alone')
    expect(src.label('t:0')).toBe('MIND')
    expect(src.label('t:6')).toBe('HEAD - pain')
    expect(src.label('zz:1')).toBe('zz:1')
  })
  it('returns cached grade maps', () => {
    const g = src.grades('t:1')!
    expect([...g]).toEqual([[1, 3], [2, 1]])
    expect(src.grades('t:1')).toBe(g)
    expect(src.grades('t:99')).toBeNull()
    expect(src.grades('nope:1')).toBeNull()
  })
  it('classifies chapters and counts remedy rubrics', () => {
    expect(src.chapterClass('t:2')).toBe('mental')
    expect(src.chapterClass('t:6')).toBe('particular')
    expect(src.chapter('t:3')).toBe('Mind')
    const stats = src.remedyStats('t')!
    // Acon in fear, alone, pain (3), Bell in fear, anger (2), Calc in night, pain (2)
    expect([stats.count(1), stats.count(2), stats.count(3), stats.count(9999)]).toEqual([3, 2, 2, 0])
    expect(stats.max).toBe(3)
    expect(src.remedyStats('t')).toBe(stats)
    expect(src.remedyStats('missing')).toBeNull()
    expect(src.remedyName(2)).toBe('Bell')
  })
  it('computeRemedyStats grows for large remedy ids', () => {
    const s = computeRemedyStats({ size: 2, forEachRemedy: (i, fn) => fn(i ? 9000 : 3, 1) })
    expect(s.count(9000)).toBe(1)
    expect(s.max).toBe(1)
  })
})

describe('real repertories', () => {
  const load = (abbrev: string, file: string) => {
    const f = JSON.parse(fs.readFileSync(`${proc.cwd()}/public/data/${file}`, 'utf8')) as RepertoryFile
    const info = { abbrev, title: abbrev, fullTitle: abbrev, lang: f.lang, author: '', year: null, publisher: '', license: '', rubricCount: f.text.length, entryCount: 0, file } as RepertoryInfo
    return new Repertory(info, f)
  }
  const pub = load('publicum', 'rep-publicum.json')
  const kent = load('kent-de', 'rep-kent-de.json')

  it('links rubrics to Generalities for Bönninghausen and changes the ranking', () => {
    const src = new CatalogSource(withRepertories([pub, kent]))
    expect(src.label('publicum:7914')).toBe('HEAD - pain, morning')
    const [g] = src.generalRubrics('publicum:7914')
    expect(src.label(g)).toBe('GENERALITIES - morning')
    expect(src.generalRubrics('publicum:191')).toEqual([]) // Mind is not generalised
    expect(src.generalRubrics(g)).toEqual([]) // already general
    expect(src.generalRubrics('publicum:7914')).toBe(src.generalRubrics('publicum:7914')) // cached
    const refs = [191, 3774, 7914, 28632, 4559, 73029, 70850, 5739, 25321].map(i => `publicum:${i}`)
    const cbs: Clipboard[] = [{ id: 'a', name: 'a', color: '', symptoms: refs.map((r, k) => ({ id: `s${k}`, rubrics: [r], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0 })) }]
    const o = { clipboardIds: ['a'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 20 }
    const def = analyze(src, cbs, { ...o, strategy: 'sum-symptoms-degrees' })
    const boen = analyze(src, cbs, { ...o, strategy: 'boenninghausen' })
    expect(boen.symptoms.filter(s => s.generals.length).length).toBe(2) // head pain morning, perspiration night
    expect(boen.rows.map(r => r.remedyId)).not.toEqual(def.rows.map(r => r.remedyId))
    // generalisation only ever raises coverage
    for (const r of def.all) expect(boen.all.find(x => x.remedyId === r.remedyId)!.coverage).toBeGreaterThanOrEqual(r.coverage)
  })

  it('finds polar opposite rubrics for polarity analysis', () => {
    const src = new CatalogSource(withRepertories([pub, kent]))
    const opp = (ref: string) => { const o = src.oppositeRubric(ref); return o && src.label(o) }
    expect(opp('publicum:856')).toBe('MIND - consolation, amel.') // agg. ↔ amel. siblings
    expect(opp('publicum:857')).toBe('MIND - consolation, agg.')
    expect(opp('publicum:5739')).toBeNull() // "weeping" is a symptom, not the opposite of its "amel." sub-rubric
    expect(opp('kent-de:2431')).toBe('GEMÜT - Schwermut, abends, besser') // schlechter ↔ besser
    expect(opp('publicum:0')).toBeNull() // a chapter has none
    expect(src.oppositeRubric('publicum:856')).toBe(src.oppositeRubric('publicum:856'))
    // polarity picks the opposites up without any per-symptom setting
    const cbs: Clipboard[] = [{ id: 'a', name: 'a', color: '', symptoms: [856, 73153].map((i, k) => ({ id: `s${k}`, rubrics: [`publicum:${i}`], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0 })) }]
    const r = analyze(src, cbs, { clipboardIds: ['a'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 20, strategy: 'polarity' })
    expect(r.polarLines).toBe(2)
    expect(r.total).toBeGreaterThan(0)
    for (const row of r.all) expect(row.score).toBe(row.polarity!.ps - row.polarity!.os)
  })

  it('60 symptoms across both repertories analyse in < 30 ms (cold cache, every strategy warm)', () => {
    const pick = (rep: Repertory, k: number) => {
      // walk to the k-th rubric with 30+ remedies, spread over the book
      let i = Math.floor((rep.size / 31) * k)
      while (rep.remedyCount(i) < 30) i++
      return rep.ref(i)
    }
    const syms: Symptom[] = Array.from({ length: 60 }, (_, k) => ({
      id: `s${k}`, rubrics: [k % 2 ? pick(kent, k >> 1) : pick(pub, k >> 1)], combine: 'union', weight: (1 + (k % 4)) as Symptom['weight'],
      eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0,
    }))
    const cbs: Clipboard[] = [{ id: 'a', name: 'a', color: '', symptoms: syms.slice(0, 30) }, { id: 'b', name: 'b', color: '', symptoms: syms.slice(30) }]
    const cat = withRepertories([pub, kent])
    const opts = { clipboardIds: ['a', 'b'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 30 }

    // cold: fresh source, default strategy (grade maps built on the fly)
    const cold = new CatalogSource(cat)
    const t0 = performance.now()
    const r = analyze(cold, cbs, { ...opts, strategy: 'sum-symptoms-degrees' })
    const coldMs = performance.now() - t0
    expect(r.symptoms).toHaveLength(60)
    expect(r.symptoms.every(s => !s.missing && s.size >= 30)).toBe(true)
    expect(r.total).toBeGreaterThan(100)
    expect(coldMs).toBeLessThan(30)

    // warm: every strategy
    for (const s of STRATEGIES) {
      analyze(cold, cbs, { ...opts, strategy: s.id })
      const t = performance.now()
      analyze(cold, cbs, { ...opts, strategy: s.id })
      expect(performance.now() - t, s.id).toBeLessThan(30)
    }
  })
})
