import { describe, expect, it } from 'vitest'
import type { Grade } from '../data/types'
import {
  analyze, applyGroups, classifyChapter, explainTerm, formatScore, gradeValue, resolveSymptom,
  smallRemedyFactor, smallRubricFactor, STRATEGIES,
} from './analysis'
import type { ChapterClass, RubricSource } from './analysis'
import type { AnalysisOptions, Clipboard, StrategyId, Symptom } from './model'

/*
 * Worked example used throughout (repertory "x"):
 *   x:0  a  MIND      Zinc(1) g3   Apis(2) g1   Bry(3) g2          n = 3
 *   x:1  b  GENERALS  Zinc(1) g1   Apis(2) g2                      n = 2
 *   x:2  c  HEAD      Bry(3) g4                                     n = 1
 *   x:3  d  HEAD      Zinc(1) g2                                    n = 1
 * Remedy rubric counts in "x": Zinc 100, Apis 10, Bry 1 (max 100).
 */
const RUBRICS: Record<string, [number, Grade][]> = {
  'x:0': [[1, 3], [2, 1], [3, 2]],
  'x:1': [[1, 1], [2, 2]],
  'x:2': [[3, 4]],
  'x:3': [[1, 2]],
}
const CLASS: Record<string, ChapterClass> = { 'x:0': 'mental', 'x:1': 'general', 'x:2': 'particular', 'x:3': 'particular' }
const NAMES: Record<number, string> = { 1: 'Zinc', 2: 'Apis', 3: 'Bry' }
const COUNTS: Record<number, number> = { 1: 100, 2: 10, 3: 1 }

const src: RubricSource = {
  grades: ref => (RUBRICS[ref] ? new Map(RUBRICS[ref]) : null),
  label: ref => `L ${ref}`,
  chapterClass: ref => CLASS[ref] ?? 'particular',
  remedyStats: rep => (rep === 'x' ? { max: 100, count: id => COUNTS[id] ?? 0 } : null),
  remedyName: id => NAMES[id] ?? `#${id}`,
}

let seq = 0
function sym(rubrics: string | string[], patch: Partial<Symptom> = {}): Symptom {
  return {
    id: `s${++seq}`, rubrics: Array.isArray(rubrics) ? rubrics : [rubrics], combine: 'union', weight: 1,
    eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0, ...patch,
  }
}
const cb = (symptoms: Symptom[], id = 'cb1'): Clipboard => ({ id, name: id, color: '#000', symptoms })
const opts = (patch: Partial<AnalysisOptions> = {}): AnalysisOptions => ({
  strategy: 'sum-symptoms-degrees', clipboardIds: ['cb1'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 50, ...patch,
})
const run = (symptoms: Symptom[], patch: Partial<AnalysisOptions> = {}) => analyze(src, [cb(symptoms)], opts(patch))
const abc = () => [sym('x:0'), sym('x:1'), sym('x:2')]
const order = (r: ReturnType<typeof run>) => r.rows.map(x => NAMES[x.remedyId])
const byName = (r: ReturnType<typeof run>, n: string) => r.all.find(x => NAMES[x.remedyId] === n)!

describe('factors', () => {
  it('small-rubric factor F(n) = max(1, ln1001/ln(n+1))', () => {
    expect(smallRubricFactor(1)).toBeCloseTo(9.9672, 3)
    expect(smallRubricFactor(9)).toBeCloseTo(3.0004, 3)
    expect(smallRubricFactor(100)).toBeCloseTo(1.4966, 3)
    expect(smallRubricFactor(1000)).toBe(1)
    expect(smallRubricFactor(5000)).toBe(1)
    expect(smallRubricFactor(0)).toBe(0)
  })
  it('small-remedy factor R = 1 + ln(M/c)/ln M, in [1, 2]', () => {
    expect(smallRemedyFactor(100, 100)).toBe(1)
    expect(smallRemedyFactor(10, 100)).toBeCloseTo(1.5, 10)
    expect(smallRemedyFactor(1, 100)).toBe(2)
    expect(smallRemedyFactor(0, 100)).toBe(1)
    expect(smallRemedyFactor(5, 1)).toBe(1)
  })
  it('grade value tables', () => {
    expect([1, 2, 3, 4].map(g => gradeValue('sum-degrees', g))).toEqual([1, 2, 3, 4])
    expect([1, 2, 3, 4].map(g => gradeValue('sum-symptoms', g))).toEqual([1, 1, 1, 1])
    expect([1, 2, 3, 4].map(g => gradeValue('kent', g))).toEqual([1, 2, 3, 3])
    expect([1, 2, 3, 4].map(g => gradeValue('boenninghausen', g))).toEqual([1, 2, 3, 5])
    expect(gradeValue('kent', 0)).toBe(0)
  })
  it('classifies chapters for Kent hierarchy (EN and DE)', () => {
    expect(classifyChapter('Mind')).toBe('mental')
    expect(classifyChapter('Gemüt')).toBe('mental')
    expect(classifyChapter('Generalities')).toBe('general')
    expect(classifyChapter('Allgemeines')).toBe('general')
    expect(classifyChapter('Sleep')).toBe('general')
    expect(classifyChapter('Head')).toBe('particular')
    expect(classifyChapter('Extremitäten')).toBe('particular')
  })
  it('every strategy has metadata', () => {
    const ids: StrategyId[] = ['sum-symptoms-degrees', 'sum-symptoms', 'sum-degrees', 'weighted', 'small-rubrics', 'small-remedies', 'kent', 'boenninghausen', 'elimination']
    expect(STRATEGIES.map(s => s.id).sort()).toEqual([...ids].sort())
  })
})

describe('strategies (worked example a, b, c at weight 1)', () => {
  it('sum of symptoms (sort degrees): C then P then name', () => {
    // Zinc C2 P4, Apis C2 P3, Bry C2 P6
    const r = run(abc())
    expect(order(r)).toEqual(['Bry', 'Zinc', 'Apis'])
    expect(r.rows.map(x => formatScore(r.strategy, x))).toEqual(['2/6', '2/4', '2/3'])
    expect(r.rows.map(x => x.rank)).toEqual([1, 2, 3])
    expect(byName(r, 'Zinc')).toMatchObject({ coverage: 2, degrees: 4, score: 2, secondary: 4, points: 4 })
  })
  it('sum of symptoms (ignore degrees): ties resolve alphabetically', () => {
    const r = run(abc(), { strategy: 'sum-symptoms' })
    expect(order(r)).toEqual(['Apis', 'Bry', 'Zinc'])
    expect(r.rows.every(x => x.score === 2 && x.secondary === 0)).toBe(true)
  })
  it('sum of degrees', () => {
    const r = run(abc(), { strategy: 'sum-degrees' })
    expect(order(r)).toEqual(['Bry', 'Zinc', 'Apis'])
    expect(r.rows.map(x => x.score)).toEqual([6, 4, 3])
  })
  it('weighted: P × covered/total', () => {
    const r = run([...abc(), sym('x:3')], { strategy: 'weighted' })
    // total W = 4. Zinc covers a,b,d: P = 3+1+2 = 6 → 6·3/4 = 4.5; Bry a,c: 6·2/4 = 3; Apis a,b: 3·2/4 = 1.5
    expect(order(r)).toEqual(['Zinc', 'Bry', 'Apis'])
    expect(r.rows.map(x => x.score)).toEqual([4.5, 3, 1.5])
    const z = r.rows[0]
    expect(z.contributions.reduce((a, b) => a + b, 0)).toBeCloseTo(4.5, 10)
  })
  it('small rubrics (Organon §153)', () => {
    const F3 = Math.log(1001) / Math.log(4), F2 = Math.log(1001) / Math.log(3), F1 = Math.log(1001) / Math.log(2)
    const r = run(abc(), { strategy: 'small-rubrics' })
    expect(order(r)).toEqual(['Bry', 'Zinc', 'Apis'])
    expect(byName(r, 'Zinc').score).toBeCloseTo(3 * F3 + 1 * F2, 2) // 21.24
    expect(byName(r, 'Apis').score).toBeCloseTo(1 * F3 + 2 * F2, 2) // 17.56
    expect(byName(r, 'Bry').score).toBeCloseTo(2 * F3 + 4 * F1, 2) // 49.84
  })
  it('small rubrics + small remedies', () => {
    const F3 = Math.log(1001) / Math.log(4), F2 = Math.log(1001) / Math.log(3)
    const r = run([sym('x:0'), sym('x:1')], { strategy: 'small-remedies' })
    // Zinc R=1: 3F3 + F2 = 21.24 ; Apis R=1.5: 1.5(F3 + 2F2) = 26.34 → small remedy overtakes the polychrest
    expect(byName(r, 'Zinc').score).toBeCloseTo(3 * F3 + F2, 2)
    expect(byName(r, 'Apis').score).toBeCloseTo(1.5 * (F3 + 2 * F2), 2)
    expect(order(r)).toEqual(['Apis', 'Zinc', 'Bry'])
    const sr = run([sym('x:0'), sym('x:1')], { strategy: 'small-rubrics' })
    expect(order(sr)).toEqual(['Zinc', 'Apis', 'Bry'])
  })
  it('Kent: min(g,3) × hierarchy (mind 3, general 2, local 1)', () => {
    // Zinc 3·3 + 1·2 = 11 ; Apis 1·3 + 2·2 = 7 ; Bry 2·3 + min(4,3)·1 = 9
    const r = run(abc(), { strategy: 'kent' })
    expect(order(r)).toEqual(['Zinc', 'Bry', 'Apis'])
    expect(r.rows.map(x => x.score)).toEqual([11, 9, 7])
  })
  it('Bönninghausen: coverage first, grade 4 valued 5', () => {
    const r = run(abc(), { strategy: 'boenninghausen' })
    expect(order(r)).toEqual(['Bry', 'Zinc', 'Apis'])
    expect(r.rows.map(x => formatScore(r.strategy, x))).toEqual(['2/7', '2/4', '2/3'])
  })
  it('elimination keeps only remedies covering every scored symptom', () => {
    const r = run([sym('x:0'), sym('x:1')], { strategy: 'elimination' })
    expect(order(r)).toEqual(['Zinc', 'Apis'])
    expect(r.excludedCounts.coverage).toBe(1)
    const r2 = run([sym('x:0'), sym('x:1'), sym('x:3')], { strategy: 'elimination' })
    expect(order(r2)).toEqual(['Zinc'])
    expect(r2.rows[0].score).toBe(6)
  })
})

describe('intensity', () => {
  it('weight multiplies symptom count and degrees', () => {
    // a ×2: Zinc C3 P7 ; Apis C3 P4 ; Bry C3 P8
    const r = run([sym('x:0', { weight: 2 }), sym('x:1'), sym('x:2')])
    expect(r.rows.map(x => formatScore(r.strategy, x))).toEqual(['3/8', '3/7', '3/4'])
    expect(byName(r, 'Zinc')).toMatchObject({ coverage: 2, weightedCoverage: 3, degrees: 4 })
  })
  it('intensity toggle off counts every scored symptom ×1', () => {
    const r = run([sym('x:0', { weight: 4 }), sym('x:1'), sym('x:2')], { useIntensity: false })
    expect(r.useIntensity).toBe(false)
    expect(r.rows.map(x => formatScore(r.strategy, x))).toEqual(['2/6', '2/4', '2/3'])
    expect(r.symptoms[0].weight).toBe(1)
  })
  it('weight 0 ignores the symptom entirely but keeps its grades for display', () => {
    const r = run([sym('x:0'), sym('x:1'), sym('x:2', { weight: 0 })])
    expect(r.symptoms[2].role).toBe('ignored')
    expect(r.scoredCount).toBe(2)
    const bry = byName(r, 'Bry')
    expect(bry).toMatchObject({ coverage: 1, degrees: 2 })
    expect(bry.grades[2]).toBe(4)
    expect(bry.contributions[2]).toBe(0)
  })
  it('weight 0 switches off eliminative and excluding qualifications', () => {
    const r = run([sym('x:0'), sym('x:2', { weight: 0, eliminatory: true }), sym('x:3', { weight: 0, exclusive: true })])
    expect(r.total).toBe(3)
    expect(r.eliminated).toBe(0)
  })
  it('a remedy only present in ignored columns is not in the result', () => {
    const r = run([sym('x:1'), sym('x:2', { weight: 0 })])
    expect(r.all.map(x => NAMES[x.remedyId])).toEqual(['Apis', 'Zinc'])
  })
})

describe('qualifications', () => {
  it('eliminative removes remedies absent from it and still scores', () => {
    const r = run([sym('x:0'), sym('x:1', { eliminatory: true }), sym('x:2')])
    expect(order(r)).toEqual(['Zinc', 'Apis'])
    expect(r.eliminated).toBe(1)
    expect(byName(r, 'Zinc').score).toBe(2)
  })
  it('excluding removes every remedy present and does not score', () => {
    const r = run([sym('x:0'), sym('x:1'), sym('x:3', { exclusive: true })])
    expect(r.symptoms[2].role).toBe('excluding')
    expect(order(r)).toEqual(['Apis', 'Bry'])
    expect(r.excludedCounts.excluding).toBe(1)
    expect(byName(r, 'Apis').coverage).toBe(2)
  })
  it('two eliminative symptoms require both', () => {
    const r = run([sym('x:0', { eliminatory: true }), sym('x:1', { eliminatory: true }), sym('x:2')])
    expect(order(r)).toEqual(['Zinc', 'Apis'])
  })
})

describe('groups and combined rubrics', () => {
  it('group letter merges columns: grade max, weight max, one symptom', () => {
    // [x] a+b: Zinc 3, Apis 2, Bry 2 (n=3); c: Bry 4
    const r = run([sym('x:0', { group: 'x' }), sym('x:1', { group: 'x', weight: 2 }), sym('x:2')])
    expect(r.symptoms).toHaveLength(2)
    expect(r.symptoms[0].members).toHaveLength(2)
    expect(r.symptoms[0].weight).toBe(2)
    expect(r.symptoms[0].label).toBe('[x] L x:0 + L x:1')
    // Bry C 2+1=3 P 2·2+4=8 ; Zinc C2 P6 ; Apis C2 P4
    expect(r.rows.map(x => `${NAMES[x.remedyId]} ${formatScore(r.strategy, x)}`)).toEqual(['Bry 3/8', 'Zinc 2/6', 'Apis 2/4'])
  })
  it('groups are per clipboard', () => {
    const r = analyze(src, [cb([sym('x:0', { group: 'a' })], 'cb1'), cb([sym('x:1', { group: 'a' })], 'cb2')], opts({ clipboardIds: ['cb1', 'cb2'] }))
    expect(r.symptoms).toHaveLength(2)
  })
  it('group is excluding only if all members are, eliminative if any', () => {
    const g = applyGroups([resolveSymptom(src, sym('x:0', { group: 'q', exclusive: true }), 'c'), resolveSymptom(src, sym('x:1', { group: 'q', eliminatory: true }), 'c')])
    expect(g[0].symptom.exclusive).toBe(false)
    expect(g[0].symptom.eliminatory).toBe(true)
  })
  it('union combine: max grade; intersection: min grade and shared remedies only', () => {
    const u = resolveSymptom(src, sym(['x:0', 'x:1'], { combine: 'union' }), 'c')
    expect([...u.grades]).toEqual([[1, 3], [2, 2], [3, 2]])
    const i = resolveSymptom(src, sym(['x:0', 'x:1'], { combine: 'intersection' }), 'c')
    expect([...i.grades]).toEqual([[1, 1], [2, 1]])
    expect(i.size).toBe(2)
    expect(i.label).toBe('L x:0 ∩ L x:1')
  })
  it('hierarchy of a combined symptom is its highest chapter class', () => {
    expect(resolveSymptom(src, sym(['x:2', 'x:1']), 'c').hierarchy).toBe('general')
  })
  it('missing rubric: flagged, empty column', () => {
    const r = run([sym('x:0'), sym('y:9')])
    expect(r.symptoms[1].missing).toBe(true)
    expect(r.symptoms[1].size).toBe(0)
    expect(r.total).toBe(3)
  })
})

describe('filters, exclusion display and limits', () => {
  it('remedy filter (family limit) and manual exclusion', () => {
    expect(order(run(abc(), { remedyFilter: [1, 2] }))).toEqual(['Zinc', 'Apis'])
    const r = run(abc(), { excludedRemedies: [3] })
    expect(order(r)).toEqual(['Zinc', 'Apis'])
    expect(r.excludedCounts.manual).toBe(1)
  })
  it('show excluded keeps them in sorted position, unranked, with a reason', () => {
    const r = run(abc(), { excludedRemedies: [3], showExcluded: true })
    expect(order(r)).toEqual(['Bry', 'Zinc', 'Apis'])
    expect(r.rows.map(x => x.rank)).toEqual([0, 1, 2])
    expect(r.rows[0].excluded).toBe('manual')
    expect(r.total).toBe(2)
  })
  it('limit counts ranked remedies only', () => {
    const r = run(abc(), { excludedRemedies: [3], showExcluded: true, limit: 1 })
    expect(order(r)).toEqual(['Bry', 'Zinc'])
    expect(run(abc(), { limit: 2 }).rows).toHaveLength(2)
    expect(run(abc(), { limit: 2 }).all).toHaveLength(3)
    expect(run(abc(), { limit: 2 }).total).toBe(3)
  })
  it('minimum coverage', () => {
    const r = run([...abc(), sym('x:3')], { minCoverage: 3 })
    expect(order(r)).toEqual(['Zinc'])
  })
  it('analyses only the selected clipboards, in selection order', () => {
    const cbs = [cb([sym('x:0')], 'cb1'), cb([sym('x:2')], 'cb2')]
    expect(analyze(src, cbs, opts({ clipboardIds: ['cb2'] })).symptoms).toHaveLength(1)
    const both = analyze(src, cbs, opts({ clipboardIds: ['cb2', 'cb1'] }))
    expect(both.symptoms.map(s => s.clipboardId)).toEqual(['cb2', 'cb1'])
    expect(analyze(src, cbs, opts({ clipboardIds: [] })).rows).toEqual([])
  })
})

describe('explainTerm', () => {
  it('breaks a term into grade × weight × factors = points', () => {
    const r = run([sym('x:0', { weight: 2 }), sym('x:1')], { strategy: 'small-remedies' })
    const apis = byName(r, 'Apis')
    const t = explainTerm(r, src, apis, 1)
    expect(t.grade).toBe(2)
    expect(t.value).toBe(2)
    expect(t.weight).toBe(1)
    expect(t.factors.map(f => f.key)).toEqual(['F', 'R'])
    const product = t.weight * t.value * t.factors.reduce((p, f) => p * f.value, 1)
    expect(product).toBeCloseTo(t.points, 10)
  })
  it('every strategy: terms multiply to contributions and sum to points', () => {
    for (const s of STRATEGIES) {
      const r = run([sym('x:0', { weight: 3 }), sym('x:1', { weight: 2 }), sym('x:2'), sym('x:3')], { strategy: s.id })
      for (const row of r.all) {
        let sum = 0
        r.symptoms.forEach((_, i) => {
          const t = explainTerm(r, src, row, i)
          const product = t.value ? t.weight * t.value * t.factors.reduce((p, f) => p * f.value, 1) : 0
          expect(product).toBeCloseTo(row.contributions[i], 8)
          sum += t.points
        })
        expect(sum).toBeCloseTo(row.points, 8)
      }
    }
  })
  it('non-scored columns explain as zero', () => {
    const r = run([sym('x:0'), sym('x:2', { weight: 0 })])
    expect(explainTerm(r, src, byName(r, 'Bry'), 1).points).toBe(0)
  })
})

describe('performance', () => {
  it('60 symptoms across 2 repertories in < 30 ms', () => {
    // Two synthetic repertories with realistic rubric sizes (20–500 remedies of 2400).
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const big: Record<string, Map<number, Grade>> = {}
    const symptoms: Symptom[] = []
    for (let k = 0; k < 60; k++) {
      const ref = `${k % 2 ? 'kent' : 'pub'}:${k}`
      const m = new Map<number, Grade>()
      const n = 20 + Math.floor(rnd() * 480)
      while (m.size < n) m.set(1 + Math.floor(rnd() * 2400), (1 + Math.floor(rnd() * 4)) as Grade)
      big[ref] = m
      symptoms.push(sym(ref, { weight: (1 + (k % 4)) as Symptom['weight'], group: k % 10 === 0 ? 'g' : null }))
    }
    const counts = new Int32Array(2500).map((_, i) => 1 + (i * 37) % 12000)
    const bigSrc: RubricSource = {
      grades: ref => big[ref] ?? null, label: ref => ref, chapterClass: ref => (ref.endsWith('0') ? 'mental' : 'particular'),
      remedyStats: () => ({ max: 12000, count: id => counts[id] }), remedyName: id => `r${id}`,
    }
    const board = [cb(symptoms.slice(0, 30), 'cb1'), cb(symptoms.slice(30), 'cb2')]
    for (const s of STRATEGIES) {
      const o = opts({ strategy: s.id, clipboardIds: ['cb1', 'cb2'], limit: 100, showExcluded: true })
      analyze(bigSrc, board, o) // warm-up (JIT)
      const times: number[] = []
      for (let k = 0; k < 5; k++) {
        const t0 = performance.now()
        const r = analyze(bigSrc, board, o)
        times.push(performance.now() - t0)
        expect(r.symptoms.length).toBe(56)
      }
      times.sort((a, b) => a - b)
      expect(times[2], `${s.id} median ${times[2].toFixed(1)} ms`).toBeLessThan(30)
    }
  })
})
