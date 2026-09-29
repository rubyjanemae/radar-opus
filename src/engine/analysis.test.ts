import { describe, expect, it } from 'vitest'
import type { Grade } from '../data/types'
import {
  abbrevKey, analyze, applyGroups, classifyChapter, exclusionCode, explainTerm, formatScore, gradeValue, remedySizeFactor, resolveSymptom,
  smallRubricFactor, STRATEGIES,
} from './analysis'
import type { AnalysisResult, ChapterClass, RubricSource } from './analysis'
import type { AnalysisOptions, Clipboard, StrategyId, Symptom } from './model'

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

/* ═════════════ Scoring-spec fixture F1 (docs/research/scoring-spec.md §5.1) ═════════════
 *   line  i  n    category    grades
 *   R1    1  250  mental      A3 B2 C1 D1 E2
 *   R2    2  3    particular  A1 B3 F2
 *   R3    1  60   general     A2 B1 C3 D2 E1 F1
 *   R4    1  8    particular  A1 C2 D1
 *   remedy sizes m: A 20000, B 4000, C 1000, D 250, E 250, F 10
 *   base values:  A C4 D7 CI5 DI8 · B 3 6 4 9 · C 3 6 3 6 · D 3 4 3 4 · E 2 3 2 3 · F 2 3 3 5
 */
const F1_ID: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 }
const F1_NAME = Object.fromEntries(Object.entries(F1_ID).map(([k, v]) => [v, k])) as Record<number, string>
const F1_LINES: Record<string, { n: number; cat: ChapterClass; g: Record<string, Grade> }> = {
  'f:1': { n: 250, cat: 'mental', g: { A: 3, B: 2, C: 1, D: 1, E: 2 } },
  'f:2': { n: 3, cat: 'particular', g: { A: 1, B: 3, F: 2 } },
  'f:3': { n: 60, cat: 'general', g: { A: 2, B: 1, C: 3, D: 2, E: 1, F: 1 } },
  'f:4': { n: 8, cat: 'particular', g: { A: 1, C: 2, D: 1 } },
  // T22 (Bönninghausen): a particular line and its linked general rubric
  'f:10': { n: 2, cat: 'particular', g: { A: 2, B: 1 } },
  'f:11': { n: 3, cat: 'general', g: { A: 3, C: 2, D: 4 as Grade } },
  // E2: a line sharing no remedy with R2
  'f:12': { n: 1, cat: 'particular', g: { E: 3 } },
}
const F1_M: Record<string, number> = { A: 20000, B: 4000, C: 1000, D: 250, E: 250, F: 10 }
const f1: RubricSource = {
  grades: ref => (F1_LINES[ref] ? new Map(Object.entries(F1_LINES[ref].g).map(([k, g]) => [F1_ID[k], g])) : null),
  label: ref => ref,
  rubricSize: ref => F1_LINES[ref]?.n ?? 0,
  chapterClass: ref => F1_LINES[ref]?.cat ?? 'particular',
  remedyStats: rep => (rep === 'f' ? { max: 20000, count: id => F1_M[F1_NAME[id]] ?? 0 } : null),
  generalRubrics: ref => (ref === 'f:10' ? ['f:11'] : []),
  remedyName: id => F1_NAME[id],
}
const line = (n: number, patch: Partial<Symptom> = {}) => sym(`f:${n}`, { id: `R${n}`, weight: ([1, 2, 1, 1] as const)[n - 1] ?? 1, ...patch })
const F1 = () => [line(1), line(2), line(3), line(4)]
const runF1 = (strategy: StrategyId, useIntensity: boolean, symptoms = F1(), patch: Partial<AnalysisOptions> = {}) =>
  analyze(f1, [cb(symptoms)], opts({ strategy, useIntensity, ...patch }))
/** "A(4/7)" style for pair strategies, "B9" / "B4.5" otherwise. */
const f1Out = (r: AnalysisResult) => r.rows.map(x => {
  const n = F1_NAME[x.remedyId]
  const s = formatScore(r.strategy, x)
  return s.includes('/') ? `${n}(${s})` : `${n}${s}`
})
const f1Rounded = (r: AnalysisResult, d = 4) => r.rows.map(x => `${F1_NAME[x.remedyId]}${Math.round(x.score * 10 ** d) / 10 ** d}`)
const f1Excluded = (r: AnalysisResult) => r.excludedRows.map(x => `${F1_NAME[x.remedyId]} ${exclusionCode(x)}`).sort()

describe('scoring-spec F1 base quantities', () => {
  it('C, D, CI, DI per remedy', () => {
    const r = runF1('sum-symptoms-degrees', true)
    const base = Object.fromEntries(r.all.map(x => [F1_NAME[x.remedyId], [x.coverage, x.degrees, x.weightedCoverage, x.points]]))
    expect(base).toEqual({ A: [4, 7, 5, 8], B: [3, 6, 4, 9], C: [3, 6, 3, 6], D: [3, 4, 3, 4], E: [2, 3, 2, 3], F: [2, 3, 3, 5] })
  })
})

describe('scoring-spec test vectors (§5.2)', () => {
  it('T1 sumSymDeg, intensity off', () => {
    expect(f1Out(runF1('sum-symptoms-degrees', false))).toEqual(['A(4/7)', 'B(3/6)', 'C(3/6)', 'D(3/4)', 'E(2/3)', 'F(2/3)'])
  })
  it('T2 sumSymDeg, intensity on', () => {
    expect(f1Out(runF1('sum-symptoms-degrees', true))).toEqual(['A(5/8)', 'B(4/9)', 'C(3/6)', 'F(3/5)', 'D(3/4)', 'E(2/3)'])
  })
  it('T3 sumSym, intensity off (tie chain falls through to D, then name)', () => {
    expect(f1Out(runF1('sum-symptoms', false))).toEqual(['A4', 'B3', 'C3', 'D3', 'E2', 'F2'])
  })
  it('T4 sumDegSym, intensity off', () => {
    expect(f1Out(runF1('sum-degrees', false))).toEqual(['A7', 'B6', 'C6', 'D4', 'E3', 'F3'])
  })
  it('T5 sumDegSym, intensity on', () => {
    expect(f1Out(runF1('sum-degrees', true))).toEqual(['B9', 'A8', 'C6', 'F5', 'D4', 'E3'])
  })
  it('T6 weighted = DI', () => {
    expect(f1Out(runF1('weighted', true))).toEqual(['B9', 'A8', 'C6', 'F5', 'D4', 'E3'])
  })
  it('T7 R4 eliminative', () => {
    const r = runF1('sum-symptoms-degrees', false, [line(1), line(2), line(3), line(4, { eliminatory: true })])
    expect(f1Out(r)).toEqual(['A(4/7)', 'C(3/6)', 'D(3/4)'])
    expect(f1Excluded(r)).toEqual(['B eliminative:R4', 'E eliminative:R4', 'F eliminative:R4'])
    expect(r.eliminated).toBe(3)
  })
  it('T8 R2 exclusive', () => {
    const r = runF1('sum-symptoms-degrees', false, [line(1), line(2, { exclusive: true }), line(3), line(4)])
    expect(f1Out(r)).toEqual(['C(3/6)', 'D(3/4)', 'E(2/3)'])
    expect(f1Excluded(r)).toEqual(['A excluding:R2', 'B excluding:R2', 'F excluding:R2'])
  })
  it('T9 combine group G = R1 + R3 (max)', () => {
    const r = runF1('sum-symptoms-degrees', false, [line(1, { group: 'g' }), line(2), line(3, { group: 'g' }), line(4)])
    expect(r.symptoms).toHaveLength(3)
    expect(Object.fromEntries([...r.symptoms[0].grades].map(([id, g]) => [F1_NAME[id], g]))).toEqual({ A: 3, B: 2, C: 3, D: 2, E: 2, F: 1 })
    expect(f1Out(r)).toEqual(['A(3/5)', 'B(2/5)', 'C(2/5)', 'D(2/3)', 'F(2/3)', 'E(1/2)'])
    // the same with an explicit union line
    const u = runF1('sum-symptoms-degrees', false, [sym(['f:1', 'f:3'], { combine: 'union' }), line(2), line(4)])
    expect(f1Out(u)).toEqual(['A(3/5)', 'B(2/5)', 'C(2/5)', 'D(2/3)', 'F(2/3)', 'E(1/2)'])
  })
  it('T10 cross R1 × R3 (min, intersection)', () => {
    const s = resolveSymptom(f1, sym(['f:1', 'f:3'], { combine: 'intersection' }), 'c')
    expect(Object.fromEntries([...s.grades].map(([id, g]) => [F1_NAME[id], g]))).toEqual({ A: 2, B: 1, C: 1, D: 1, E: 1 })
  })
  it('T11 smallRubrics (T = 10, F = 2), intensity on', () => {
    expect(f1Out(runF1('small-rubrics', true))).toEqual(['B15', 'A11', 'F9', 'C8', 'D5', 'E3'])
  })
  it('T14 smallRemedies factors', () => {
    expect(['A', 'B', 'C', 'D', 'E', 'F'].map(k => remedySizeFactor(F1_M[k]))).toEqual([0.5, 0.5, 1, 2, 2, 4])
    expect(Math.sqrt(1000 / 20000)).toBeCloseTo(0.2236, 4) // clamped up to 0.5
    expect(remedySizeFactor(0)).toBe(1)
  })
  it('T15 smallRemedies, intensity on (C before E on the tie chain)', () => {
    expect(f1Out(runF1('remedy-size', true))).toEqual(['F20', 'D8', 'C6', 'E6', 'B4.5', 'A4'])
  })
  it('T16 smallBoth', () => {
    expect(f1Rounded(runF1('small-remedies', true))).toEqual(['F36', 'D10', 'C8', 'B7.5', 'E6', 'A5.5'])
  })
  it('T18 kent (κ mental 3, general 2, particular 1)', () => {
    expect(f1Out(runF1('kent', true))).toEqual(['A16', 'B14', 'C11', 'D8', 'E8', 'F6'])
  })
  it('T22 boenninghausen generalisation g_eff = max(g, linked general grade)', () => {
    const s = resolveSymptom(f1, sym('f:10'), 'c', true)
    expect(Object.fromEntries([...s.grades].map(([id, g]) => [F1_NAME[id], g]))).toEqual({ A: 3, B: 1, C: 2, D: 4 })
    expect(s.generals).toEqual(['f:11'])
    expect(s.baseGrades.size).toBe(2)
    // then sumSymDeg over g_eff
    const r = runF1('boenninghausen', true, [sym('f:10'), line(4)])
    expect(f1Out(r)).toEqual(['D(2/5)', 'A(2/4)', 'C(2/4)', 'B(1/1)'])
    // explanation shows the generalised grade and where it came from
    const d = r.all.find(x => F1_NAME[x.remedyId] === 'D')!
    expect(explainTerm(r, f1, d, 0)).toMatchObject({ grade: 4, baseGrade: 0, points: 4 })
    // the other strategies do not generalise
    expect(f1Out(runF1('sum-symptoms-degrees', true, [sym('f:10'), line(4)]))).toEqual(['A(2/3)', 'C(1/2)', 'B(1/1)', 'D(1/1)'])
  })
})

describe('scoring-spec edge cases (§5.4)', () => {
  it('E1 no active lines: empty result and empty excluded', () => {
    const r = runF1('sum-symptoms-degrees', true, F1().map(s => ({ ...s, weight: 0 as const })))
    expect(r.rows).toEqual([])
    expect(r.excludedRows).toEqual([])
    expect(r.scoredCount).toBe(0)
  })
  it('E2 two eliminative lines with no common remedy: everything excluded by the first failing line', () => {
    const r = runF1('sum-symptoms-degrees', true, [line(2, { eliminatory: true }), sym('f:12', { id: 'R12', eliminatory: true })])
    expect(r.rows).toEqual([])
    expect(f1Excluded(r)).toEqual(['A eliminative:R12', 'B eliminative:R12', 'E eliminative:R2', 'F eliminative:R12'])
  })
  it('E3 eliminative line at intensity 0 is ignored entirely', () => {
    const r = runF1('sum-symptoms-degrees', false, [line(1), line(2), line(3), line(4, { eliminatory: true, weight: 0 })])
    expect(r.excludedRows).toEqual([])
    expect(r.total).toBe(6)
    expect(r.symptoms[3].role).toBe('ignored')
  })
  it('E9 eliminative with intensity off: T7 unchanged', () => {
    const on = runF1('sum-symptoms-degrees', true, [line(1), line(2), line(3), line(4, { eliminatory: true })])
    const off = runF1('sum-symptoms-degrees', false, [line(1), line(2), line(3), line(4, { eliminatory: true })])
    expect(on.rows.map(x => F1_NAME[x.remedyId]).sort()).toEqual(['A', 'C', 'D'])
    expect(f1Excluded(off)).toEqual(f1Excluded(on))
  })
  it('E10 eliminative wins over excluding', () => {
    const r = runF1('sum-symptoms-degrees', false, [line(1), line(2, { exclusive: true }), line(3), line(4, { eliminatory: true })])
    // B and F are absent from R4 and present in R2; A is in R4 but in R2
    expect(f1Excluded(r)).toEqual(['A excluding:R2', 'B eliminative:R4', 'E eliminative:R4', 'F eliminative:R4'])
    expect(r.excludedCounts).toMatchObject({ eliminative: 3, excluding: 1 })
  })
  it('excluded remedies are scored and never ranked above included ones when shown', () => {
    const r = runF1('sum-symptoms-degrees', false, [line(1), line(2), line(3), line(4, { eliminatory: true })], { showExcluded: true })
    expect(r.rows.map(x => `${F1_NAME[x.remedyId]}${x.rank}`)).toEqual(['A1', 'B0', 'C2', 'D3', 'E0', 'F0'])
    expect(r.excludedRows.find(x => F1_NAME[x.remedyId] === 'B')).toMatchObject({ score: 3, secondary: 6 })
  })
})

describe('tie chain and numbers (§2.1, §2.2)', () => {
  it('abbreviation key: case-insensitive, trailing dots stripped', () => {
    expect(abbrevKey('Nat-m.')).toBe('nat-m')
    expect(abbrevKey('Calc..')).toBe('calc')
  })
  it('ties on the strategy key fall through C, D, then name', () => {
    // sumSym intensity on: A 5, B 4, F 3 / C 3 / D 3 (C: 3 all), D: C 6, D 4, F 3
    expect(f1Out(runF1('sum-symptoms', true))).toEqual(['A5', 'B4', 'C3', 'D3', 'F3', 'E2'])
  })
  it('score labels: integers bare, fractions 1 decimal', () => {
    expect(formatScore('weighted', { score: 4.5, secondary: 0 })).toBe('4.5')
    expect(formatScore('weighted', { score: 431.8206, secondary: 0 })).toBe('431.8')
    expect(formatScore('sum-symptoms-degrees', { score: 8, secondary: 19 })).toBe('8/19')
    expect(formatScore('boenninghausen', { score: 2, secondary: 5 })).toBe('2/5')
  })
})

describe('factors and metadata', () => {
  it('small-rubric factor f_s = 2 when 0 < n ≤ 10', () => {
    expect([1, 3, 8, 10, 11, 250].map(n => smallRubricFactor(n))).toEqual([2, 2, 2, 2, 1, 1])
    expect(smallRubricFactor(0)).toBe(1)
    expect(smallRubricFactor(15, { threshold: 20, factor: 3 })).toBe(3)
  })
  it('parameters override the defaults', () => {
    const r = runF1('small-rubrics', true, F1(), { params: { smallRubrics: { factor: 3 } } })
    // B: R1 2 + R2 3·2·3 + R3 1 = 21
    expect(f1Out(r)[0]).toBe('B21')
    expect(r.params.smallRubrics).toEqual({ threshold: 10, factor: 3 })
  })
  it('grade value: 1 for the pure symptom count, else the grade', () => {
    expect([1, 2, 3, 4].map(g => gradeValue('sum-symptoms', g))).toEqual([1, 1, 1, 1])
    expect([1, 2, 3, 4].map(g => gradeValue('kent', g))).toEqual([1, 2, 3, 4])
    expect(gradeValue('weighted', 0)).toBe(0)
  })
  it('classifies chapters (§1.4, EN and DE)', () => {
    expect(classifyChapter('Mind')).toBe('mental')
    expect(classifyChapter('Gemüt')).toBe('mental')
    expect(['Generalities', 'Allgemeines', 'Sleep', 'Dreams', 'Fever', 'Chill', 'Perspiration', 'Schweiß'].map(classifyChapter)).toEqual(Array(8).fill('general'))
    expect(['Head', 'Appetite', 'Blood', 'Extremitäten'].map(classifyChapter)).toEqual(Array(4).fill('particular'))
  })
  it('every strategy has metadata', () => {
    const ids: StrategyId[] = ['sum-symptoms-degrees', 'sum-symptoms', 'sum-degrees', 'weighted', 'small-rubrics', 'remedy-size', 'small-remedies', 'kent', 'boenninghausen', 'elimination']
    expect(STRATEGIES.map(s => s.id).sort()).toEqual([...ids].sort())
  })
})

/*
 * Second worked example (repertory "x"):
 *   x:0  a  MIND      Zinc(1) g3   Apis(2) g1   Bry(3) g2          n = 3
 *   x:1  b  GENERALS  Zinc(1) g1   Apis(2) g2                      n = 2
 *   x:2  c  HEAD      Bry(3) g4                                     n = 1
 *   x:3  d  HEAD      Zinc(1) g2                                    n = 1
 */
const RUBRICS: Record<string, [number, Grade][]> = {
  'x:0': [[1, 3], [2, 1], [3, 2]],
  'x:1': [[1, 1], [2, 2]],
  'x:2': [[3, 4]],
  'x:3': [[1, 2]],
}
const CLASS: Record<string, ChapterClass> = { 'x:0': 'mental', 'x:1': 'general', 'x:2': 'particular', 'x:3': 'particular' }
const NAMES: Record<number, string> = { 1: 'Zinc', 2: 'Apis', 3: 'Bry' }
const COUNTS: Record<number, number> = { 1: 4000, 2: 250, 3: 10 }
const src: RubricSource = {
  grades: ref => (RUBRICS[ref] ? new Map(RUBRICS[ref]) : null),
  label: ref => `L ${ref}`,
  chapterClass: ref => CLASS[ref] ?? 'particular',
  remedyStats: rep => (rep === 'x' ? { max: 4000, count: id => COUNTS[id] ?? 0 } : null),
  remedyName: id => NAMES[id] ?? `#${id}`,
}
const run = (symptoms: Symptom[], patch: Partial<AnalysisOptions> = {}) => analyze(src, [cb(symptoms)], opts(patch))
const abc = () => [sym('x:0'), sym('x:1'), sym('x:2')]
const order = (r: ReturnType<typeof run>) => r.rows.map(x => NAMES[x.remedyId])
const byName = (r: ReturnType<typeof run>, n: string) => r.all.find(x => NAMES[x.remedyId] === n)!

describe('elimination strategy', () => {
  it('keeps only remedies covering every scored symptom, ranked by DI', () => {
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
  it('breaks a term into intensity × grade × factors = points', () => {
    const r = run([sym('x:0', { weight: 2 }), sym('x:1')], { strategy: 'small-remedies' })
    const apis = byName(r, 'Apis')
    const t = explainTerm(r, src, apis, 1)
    // Apis in b: g2, i1, f_s = 2 (n = 2), f(r) = √(1000/250) = 2 → 8
    expect(t).toMatchObject({ grade: 2, value: 2, weight: 1, points: 8, baseGrade: null })
    expect(t.factors.map(f => [f.key, f.value])).toEqual([['f', 2], ['R', 2]])
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
      generalRubrics: ref => (ref.endsWith('3') ? [ref.startsWith('kent') ? 'kent:1' : 'pub:0'] : []),
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
