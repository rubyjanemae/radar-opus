// @vitest-environment node
// Pure logic: no DOM needed, so skip the jsdom setup.
import { describe, expect, it } from 'vitest'
import { computeManifest } from '../../scripts/lib/manifest.mjs'
import { isConnector, parseClock, timeSlot } from '../../scripts/lib/rubric-tree.mjs'
import manifest from './data-manifest.json'
import { Repertory } from './repertory'
import type { RepertoryFile, RepertoryInfo } from './types'

/** Node's fs without depending on @types/node in the app tsconfig. */
const proc = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(m: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } } }).process
const fs = proc.getBuiltinModule('node:fs')
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(`${proc.cwd()}/public/data/${f}`, 'utf8')) as T

const infos = read<RepertoryInfo[]>('repertories.json')
const load = (abbrev: string) => { const info = infos.find(i => i.abbrev === abbrev)!; return new Repertory(info, read<RepertoryFile>(info.file)) }
const pub = load('publicum')
const kent = load('kent-de')

/** Index of a rubric by its exact path ("Mind, fear, death, of"), or -1. */
const find = (rep: Repertory, path: string) => { for (let i = 0; i < rep.size; i++) if (rep.path(i, ', ') === path) return i; return -1 }
const kids = (rep: Repertory, path: string) => rep.children(find(rep, path)).map(i => rep.text(i))

describe('data manifest', () => {
  it('matches the files in public/data (run `node scripts/lib/manifest.mjs` after changing them)', () => {
    expect(manifest).toEqual(computeManifest(`${proc.cwd()}/public/data`))
  })
  it('repertories.json counts match the files', () => {
    for (const rep of [pub, kent]) {
      expect(rep.info.nodeCount).toBe(rep.size)
      expect(rep.info.entryCount).toBe(rep.rawEntries().offsets[rep.size])
      let synthetic = 0
      for (let i = 0; i < rep.size; i++) if (rep.isSynthetic(i)) synthetic++
      expect(rep.info.syntheticCount).toBe(synthetic)
    }
  })
  it('lists the source rubric counts (data-plan §7), synthetic headings not counted', () => {
    expect(pub.info.rubricCount).toBe(74667)
    expect(kent.info.rubricCount).toBe(68741)
    expect(kent.info.duplicatePaths).toBe(609)
    expect(pub.info.duplicatePaths).toBe(1)
  })
})

describe('hour sub-rubrics', () => {
  it('follow the clock within each period (Publicum)', () => {
    expect(kids(pub, 'Head, pain, night').slice(0, 7)).toEqual(['midnight', '1 a.m.', '1 a.m. to 10 a.m.', '2 a.m.', '3 a.m.', '4 a.m.', '5 a.m.'])
    expect(kids(pub, 'Head, pain, forenoon')).toEqual(['8 a.m.', '9 a.m. to 12 p.m.', '9 a.m. to 1 p.m.', '9 a.m. to 4 p.m.', '10 a.m.', '10 a.m. to 2 p.m.', '10 a.m. to 3 p.m.', '10 a.m. to 4 p.m.', '10 a.m. to 6 p.m.', '11 a.m.', '11 a.m. to 3 p.m. h'])
    expect(kids(pub, 'Head, pain, evening').slice(0, 7)).toEqual(['6 p.m.', '7 p.m.', '8 p.m.', '8 p.m. to 9 p.m.', '9 p.m.', '10 p.m.', '11 p.m.'])
  })
  it('every period lists its hours in chronological order, before the other sub-rubrics', () => {
    for (const [rep, lang] of [[pub, 'en'], [kent, 'de']] as const) {
      for (let p = 0; p < rep.size; p++) {
        const c = rep.children(p).map(i => rep.text(i))
        const period = timeSlot(rep.text(p), lang) >= 0
        const clocks = c.map(t => parseClock(t, lang) ?? (period && /^(midnight|noon|mitternacht|mittags)$/i.test(t)))
        const first = clocks.findIndex(Boolean), last = clocks.length - 1 - [...clocks].reverse().findIndex(Boolean)
        if (first < 0) continue
        // hours form one block
        expect(clocks.slice(first, last + 1).every(Boolean), `${rep.path(p, ', ')}: ${c.join(' | ')}`).toBe(true)
      }
    }
  })
  it('"h-mm" hours sort by the clock ("2-30 p.m." is 14:30)', () => {
    const c = kids(pub, 'Generalities, afternoon')
    const i = c.indexOf('2-30 p.m.')
    expect(i).toBeGreaterThan(-1)
    expect(parseClock(c[i - 1])!.start).toBeLessThanOrEqual(14 * 60 + 30)
    expect(parseClock(c[i + 1])!.start).toBeGreaterThanOrEqual(14 * 60 + 30)
  })
  it('Kent-de lists "am Tage" as daytime, first', () => {
    expect(kids(kent, 'Gemüt, Angst').slice(0, 7)).toEqual(['am Tage', 'morgens', 'vormittags', 'mittags', 'nachmittags', 'abends', 'nachts'])
    expect(kids(kent, 'Gemüt, fröhlich')[0]).toBe('am Tage')
  })
})

describe('synthetic headings (missing intermediate paths)', () => {
  it('"Gemüt, Ärger" is a heading holding its 32 sub-rubrics', () => {
    const i = find(kent, 'Gemüt, Ärger')
    expect(i).toBeGreaterThan(0)
    expect(kent.isSynthetic(i)).toBe(true)
    expect(kent.remedyCount(i)).toBe(0)
    expect(kent.parent(i)).toBe(kent.chapters[0])
    expect(kent.childCountOf(i)).toBe(32)
    expect(kids(kent, 'Gemüt, Ärger').slice(0, 3)).toEqual(['morgens', 'vormittags', 'abends'])
    expect(kids(kent, 'Gemüt')).not.toContain('Ärger, abends')
    expect(kids(kent, 'Gemüt, Wahnideen').length).toBeGreaterThan(500)
  })
  it('are under 0.5% of each tree, have no remedies and at least two sub-rubrics', () => {
    for (const rep of [pub, kent]) {
      let n = 0
      for (let i = 0; i < rep.size; i++) {
        if (!rep.isSynthetic(i)) continue
        n++
        expect(rep.remedyCount(i)).toBe(0)
        expect(rep.childCountOf(i)).toBeGreaterThanOrEqual(2)
      }
      expect(n / rep.size).toBeLessThan(0.005)
    }
  })
  it('a comma inside a rubric text does not create a heading ("Kribbeln, warm")', () => {
    expect(kids(kent, 'Haut')).toContain('Kribbeln, warm')
  })
})

describe('connector rubrics', () => {
  it('"death" > "of" is one rubric "death, of" with the sub-rubrics below it', () => {
    const i = find(pub, 'Mind, fear, death, of')
    expect(i).toBeGreaterThan(0)
    expect(pub.text(i)).toBe('death, of')
    expect(pub.remedyCount(i)).toBeGreaterThan(100)
    expect(pub.children(i).map(k => pub.text(k))).toContain('alone, when')
    expect(find(pub, 'Mind, fear, death')).toBe(-1)
  })
  it('no sole connector child repeats its parent any more', () => {
    for (const [rep, lang] of [[pub, 'en'], [kent, 'de']] as const) {
      for (let p = 0; p < rep.size; p++) {
        if (rep.parent(p) < 0 || rep.childCountOf(p) !== 1) continue
        const c = rep.children(p)[0]
        if (!isConnector(rep.text(c), lang)) continue
        const same = rep.remedyCount(p) === rep.remedyCount(c) && rep.remedies(p).every(e => rep.gradeOf(c, e.remedyId) === e.grade)
        expect(same, rep.path(c, ', ')).toBe(false)
      }
    }
  })
  it('paths stay the same text, so QuickFind still finds them', () => {
    expect(pub.lowerPath(find(pub, 'Mind, fear, death, of'))).toBe('mind, fear, death, of')
  })
})

describe('lower paths on a real book', () => {
  it('build in resumable slices', () => {
    const rep = load('publicum')
    let slices = 0
    while (!rep.buildLowerPaths(() => true)) slices++
    expect(slices).toBeGreaterThan(10)
    expect(rep.lowerPathsReady).toBe(true)
    for (const i of [0, 1, 5000, rep.size - 1]) expect(rep.lowerPath(i)).toBe(rep.path(i, ', ').toLowerCase())
  })
})
