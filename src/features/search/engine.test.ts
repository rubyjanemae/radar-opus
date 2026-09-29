import { describe, expect, it } from 'vitest'
import { Repertory } from '../../data/repertory'
import type { RepertoryFile, RepertoryInfo } from '../../data/types'
import { getIndex, highlighter, remedyFrequency, remedyRubrics, search } from './engine'
import { describeQuery, parseQuery } from './query'
import { branchMatch, fold, highlightSegments, tokenize } from './text'

function info(abbrev: string, n: number): RepertoryInfo {
  return { abbrev, title: abbrev, fullTitle: abbrev, lang: 'en', author: '', year: null, publisher: '', license: '', rubricCount: n, entryCount: 0, file: '' }
}

/**
 * Mind(0) > fear(1) > night(2), fear > alone, when(3), fear > dogs, of(4)
 * Mind > dreams(5) > cats(6), dreams > dogs(7), dreams > cats and dogs(8)
 * Mind > anxiety(9) > night(10)
 * Head(11) > pain(12) > forehead(13), pain > night(14); Head > heat(15)
 * Gemüt(16) > Ängstlichkeit(17)
 * Remedies: 1 lach, 2 lyc, 3 sulph.
 */
function rep(): Repertory {
  const rows: [string, number, [number, number][]][] = [
    ['Mind', -1, []],
    ['fear', 0, [[1, 3], [2, 1], [3, 2]]],
    ['night', 1, [[1, 2]]],
    ['alone, when', 1, [[2, 4], [1, 1]]],
    ['dogs, of', 1, [[3, 1]]],
    ['dreams', 0, [[1, 1]]],
    ['cats', 5, [[2, 2]]],
    ['dogs', 5, [[1, 3], [3, 3]]],
    ['cats and dogs', 5, [[3, 1]]],
    ['anxiety', 0, [[1, 4], [2, 3], [3, 2]]],
    ['night', 9, [[1, 1]]],
    ['Head', -1, []],
    ['pain', 11, [[3, 2], [2, 1]]],
    ['forehead', 12, [[1, 1]]],
    ['night', 12, [[2, 3]]],
    ['heat', 11, [[3, 1]]],
    ['Gemüt', -1, []],
    ['Ängstlichkeit', 16, [[1, 2]]],
  ]
  return build(rows)
}

function build(rows: [string, number, [number, number][]][]): Repertory {
  const text = rows.map(r => r[0]), parent = rows.map(r => r[1])
  const depth = parent.map(function d(p: number): number { return p < 0 ? 0 : 1 + d(parent[p]) })
  const chapters = parent.flatMap((p, i) => p < 0 ? [i] : [])
  const chapter: number[] = []
  let c = -1
  parent.forEach(p => { if (p < 0) c++; chapter.push(c) })
  const offsets = [0], data: number[] = []
  for (const r of rows) { for (const [id, g] of r[2]) data.push(id * 4 + g - 1); offsets.push(data.length) }
  const file: RepertoryFile = { abbrev: 'x', title: 'x', lang: 'en', chapters, text, parent, depth, chapter, offsets, data }
  return new Repertory(info('x', rows.length), file)
}

const R = rep()
const ids = (q: string, o: Parameters<typeof search>[2] = {}) => search(q, [{ rep: R }], o).hits.map(h => h.index)
const set = (q: string, o: Parameters<typeof search>[2] = {}) => new Set(ids(q, o))

describe('text', () => {
  it('folds case and diacritics', () => {
    expect(fold('Gemüt Ängstlichkeit Straße')).toBe('gemut angstlichkeit strasse')
    expect(tokenize('alone, when; absent-minded')).toEqual(['alone', 'when', 'absent', 'minded'])
  })
  it('matches roots and branches', () => {
    expect(branchMatch('fear', 'fear')).toBe(2)
    expect(branchMatch('fear', 'fears')).toBe(1)
    expect(branchMatch('fear', 'feared')).toBe(1)
    expect(branchMatch('fear', 'fearful')).toBe(0)
    expect(branchMatch('remedy', 'remedies')).toBe(1)
    expect(branchMatch('do', 'dogs')).toBe(0)
  })
  it('highlights matched tokens', () => {
    expect(highlightSegments('Fear, of dogs', n => n === 'dogs' || n === 'fear')).toEqual([
      { text: 'Fear', hit: true }, { text: ', of ', hit: false }, { text: 'dogs', hit: true },
    ])
  })
})

describe('query parser', () => {
  it('parses operators with precedence', () => {
    expect(describeQuery(parseQuery('dream cats ! dogs'))).toBe('dream and cats and not dogs')
    expect(describeQuery(parseQuery('fear | anxiety & night'))).toBe('fear or (anxiety and night)')
    expect(describeQuery(parseQuery('(fear | anxiety) night'))).toBe('(fear or anxiety) and night')
    expect(describeQuery(parseQuery('"alone when" fe*'))).toBe('“alone when” and fe…')
    expect(describeQuery(parseQuery('*ache *ea*'))).toBe('…ache and …ea…')
    expect(describeQuery(parseQuery('fear NOT night -dogs'))).toBe('fear and not night and not dogs')
    expect(describeQuery(parseQuery('#lach:3 fear'))).toBe('remedy lach (grade ≥ 3) and fear')
  })
  it('reports errors but keeps what it can', () => {
    expect(parseQuery('fear |').error).toBeTruthy()
    expect(parseQuery('(fear night').error).toMatch(/Missing/)
    expect(parseQuery('!fear').error).toMatch(/not negated/)
    expect(parseQuery('').ast).toBeNull()
  })
  it('treats the last word as a prefix for type-ahead unless followed by a space', () => {
    expect(describeQuery(parseQuery('fear ni', { prefixLast: true }))).toBe('fear and ni…')
    expect(describeQuery(parseQuery('fear ni ', { prefixLast: true }))).toBe('fear and ni')
  })
})

describe('search', () => {
  it('matches words anywhere in the rubric path', () => {
    expect(set('fear')).toEqual(new Set([1, 2, 3, 4]))
    expect(set('mind night')).toEqual(new Set([2, 10]))
    expect(set('night')).toEqual(new Set([2, 10, 14]))
  })
  it('supports OR, NOT, phrases and wildcards', () => {
    expect(set('fear | anxiety')).toEqual(new Set([1, 2, 3, 4, 9, 10]))
    expect(set('night !head')).toEqual(new Set([2, 10]))
    expect(set('dreams dogs')).toEqual(new Set([7, 8]))
    expect(set('dreams dogs ! cats')).toEqual(new Set([7]))
    expect(set('"cats and dogs"')).toEqual(new Set([8]))
    expect(set('"dogs cats"')).toEqual(new Set())
    expect(set('"fear night"')).toEqual(new Set([2]))
    expect(set('anx*')).toEqual(new Set([9, 10]))
    expect(set('*head')).toEqual(new Set([11, 12, 13, 14, 15]))
    expect(set('*rehe*')).toEqual(new Set([13]))
  })
  it('finds branch words and folded diacritics', () => {
    expect(set('dream')).toEqual(new Set([5, 6, 7, 8]))
    expect(set('angstlichkeit')).toEqual(new Set([17]))
    expect(set('gemut')).toEqual(new Set([16, 17]))
  })
  it('ranks own-text, exact and main rubrics first', () => {
    expect(ids('fear')[0]).toBe(1)
    expect(ids('night')[0]).not.toBe(undefined)
    expect(ids('pain')[0]).toBe(12)
    expect(ids('head pain')[0]).toBe(12)
    expect(ids('dogs')[0]).toBe(7)
  })
  it('collapses sub-rubrics of matching rubrics on request', () => {
    expect(set('fear', { collapse: true })).toEqual(new Set([1]))
    expect(set('night', { collapse: true })).toEqual(new Set([2, 10, 14]))
  })
  it('limits to a range (chapter scope) and counts the total', () => {
    const r = search('night', [{ rep: R, start: 11, end: 16 }])
    expect(r.hits.map(h => h.index)).toEqual([14])
    const lim = search('fear', [{ rep: R }], { limit: 2 })
    expect(lim.hits).toHaveLength(2)
    expect(lim.total).toBe(4)
  })
  it('searches several repertories, earlier targets winning ties', () => {
    const other = rep()
    const r = search('pain', [{ rep: other }, { rep: R }])
    expect(r.hits[0].rep).toBe(other)
    expect(r.total).toBe(6)
  })
  it('combines remedy terms with words', () => {
    const resolveRemedy = (t: string) => ({ lach: 1, lyc: 2, sulph: 3 } as Record<string, number>)[t] ?? null
    expect(set('#sulph', { resolveRemedy })).toEqual(new Set([1, 4, 7, 8, 9, 12, 15]))
    expect(set('#sulph dogs', { resolveRemedy })).toEqual(new Set([4, 7, 8]))
    expect(set('#lach:3', { resolveRemedy })).toEqual(new Set([1, 7, 9]))
    expect(search('#zzz', [{ rep: R }], { resolveRemedy }).error).toMatch(/Unknown remedy/)
  })
  it('type-ahead prefix on the last word', () => {
    expect(set('fear al', { prefixLast: true })).toEqual(new Set([3]))
    expect(set('"cats an', { prefixLast: true })).toEqual(new Set([8]))
  })
  it('highlights query words', () => {
    const hl = highlighter(parseQuery('dream* "cats and" fear'))
    expect(hl('dreams')).toBe(true)
    expect(hl('fears')).toBe(true)
    expect(hl('and')).toBe(true)
    expect(hl('dogs')).toBe(false)
  })
})

describe('modality synonyms', () => {
  // Sleep(0) > night(1) > agg.(2); Sleep > walking, amel.(3); Sleep > better(4)
  const M = build([['Sleep', -1, []], ['night', 0, []], ['agg.', 1, []], ['walking, amel.', 0, []], ['better', 0, []]])
  const find = (q: string) => new Set(search(q, [{ rep: M }]).hits.map(h => h.index))
  it('treats worse/agg. and better/amel. as the same word', () => {
    expect(find('night worse')).toEqual(new Set([2]))
    expect(find('"night worse"')).toEqual(new Set([2]))
    expect(find('"night agg"')).toEqual(new Set([2]))
    expect(find('better')).toEqual(new Set([3, 4]))
    expect(find('amel')).toEqual(new Set([3, 4]))
    // wildcards stay literal
    expect(find('bett*')).toEqual(new Set([4]))
  })
  it('highlights the synonym found in the rubric', () => {
    const hl = highlighter(parseQuery('worse "walking better"'))
    expect(hl('agg')).toBe(true)
    expect(hl('amel')).toBe(true)
    expect(hl('night')).toBe(false)
  })
})

describe('remedy search', () => {
  it('lists rubrics of a remedy with grade, size and co-remedy filters', () => {
    expect(remedyRubrics(R, 1).map(h => h.index)).toEqual([1, 2, 3, 5, 7, 9, 10, 13, 17])
    expect(remedyRubrics(R, 1, { minGrade: 3 }).map(h => h.index)).toEqual([1, 7, 9])
    expect(remedyRubrics(R, 1, { maxSize: 1 }).map(h => h.index)).toEqual([2, 5, 10, 13, 17])
    // at most 0 other remedies of the same or a higher grade
    expect(remedyRubrics(R, 1, { maxCo: 0 }).map(h => h.index)).toEqual([1, 2, 5, 9, 10, 13, 17])
    const h = remedyRubrics(R, 1).find(x => x.index === 3)!
    expect(h).toEqual({ index: 3, grade: 1, size: 2, co: 1 })
  })
  it('summarises remedy frequency across results', () => {
    const { top, distinct } = remedyFrequency([1, 7, 9].map(index => ({ rep: R, index })))
    expect(distinct).toBe(3)
    expect(top[0]).toMatchObject({ remedyId: 1, count: 3, gradeSum: 10 })
    expect(top.find(t => t.remedyId === 3)).toMatchObject({ count: 3, gradeSum: 7, byGrade: [0, 2, 1, 0] })
  })
})

// ───────── performance against the real data (skipped when the data is absent) ─────────

// node:fs through a dynamic specifier: the app tsconfig has no Node types
const nodeFs = 'node:fs'
const { readFileSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string; existsSync: (p: string) => boolean }
const DATA = ['public/data/rep-publicum.json', 'public/data/rep-kent-de.json']
const haveData = DATA.every(f => existsSync(f))

describe.skipIf(!haveData)('performance on 140k rubrics', () => {
  const reps = haveData ? DATA.map((f, k) => {
    const file = JSON.parse(readFileSync(f, 'utf8')) as RepertoryFile
    return new Repertory(info(`r${k}`, file.text.length), file)
  }) : []
  const targets = reps.map(rep => ({ rep }))

  it('builds the word index', () => {
    for (const r of reps) expect(getIndex(r).words.length).toBeGreaterThan(1000)
    expect(reps.reduce((n, r) => n + r.size, 0)).toBeGreaterThan(140_000)
  })

  it.each([
    'fear', 'head pain', 'fear | anxiety night', 'pain ! head', '"as if"', '"night agg"', 'burn*', 'a*', '*ache', 'dream cats ! dogs',
  ])('searches “%s” in under 50 ms', q => {
    search(q, targets) // warm JIT
    const t0 = performance.now()
    const r = search(q, targets, { limit: 500 })
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(50)
    expect(r.error).toBeNull()
    expect(r.total).toBeGreaterThan(0)
  })

  it('finds sensible top results in the real repertory', () => {
    const r = search('head pain', [{ rep: reps[0] }], { limit: 5 })
    expect(reps[0].path(r.hits[0].index)).toBe('Head - pain')
    const f = search('fear', [{ rep: reps[0] }], { limit: 1 })
    expect(reps[0].path(f.hits[0].index)).toBe('Mind - fear')
  })
})
