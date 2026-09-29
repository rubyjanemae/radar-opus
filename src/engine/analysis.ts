import type { Grade, RubricRef } from '../data/types'
import type { AnalysisOptions, Clipboard, StrategyId, Symptom } from './model'

/** Minimal data access the engine needs, so it can be tested without the catalog. */
export interface RubricSource {
  /** Remedy grades of a rubric, or null if the rubric is unknown / not loaded. */
  grades(ref: RubricRef): Map<number, Grade> | null
  label(ref: RubricRef): string
}

export interface ResolvedSymptom {
  symptom: Symptom
  clipboardId: string
  label: string
  grades: Map<number, Grade>
  /** Remedies in the (combined) rubric. */
  size: number
  missing: boolean
}

export interface AnalysisRow {
  remedyId: number
  rank: number
  score: number
  /** Symptoms covered (weight > 0). */
  coverage: number
  /** Sum of grades over covered symptoms. */
  degrees: number
  /** Grade per symptom column (0 = absent). */
  grades: Grade[] | number[]
  /** Points each symptom contributed to the score. */
  contributions: number[]
}

export interface AnalysisResult {
  strategy: StrategyId
  symptoms: ResolvedSymptom[]
  rows: AnalysisRow[]
  /** Remedies matching before limit. */
  total: number
  /** Remedies dropped by eliminatory symptoms. */
  eliminated: number
}

export const STRATEGIES: { id: StrategyId; name: string; short: string; description: string }[] = [
  { id: 'sum-symptoms-degrees', name: 'Sum of symptoms and degrees', short: 'Sympt + Deg', description: 'Ranks by number of symptoms covered, then by the sum of grades. The classic default.' },
  { id: 'sum-degrees', name: 'Sum of degrees', short: 'Degrees', description: 'Ranks by the sum of grades across all symptoms; ties by symptoms covered.' },
  { id: 'sum-symptoms', name: 'Sum of symptoms', short: 'Symptoms', description: 'Ranks by number of symptoms covered only; ties by degrees.' },
  { id: 'weighted', name: 'Weighted symptoms', short: 'Weighted', description: 'Each grade is multiplied by the symptom weight (x1 to x4) before summing.' },
  { id: 'small-remedies', name: 'Small remedies', short: 'Small rem.', description: 'Weighted score where small rubrics count more (factor ln(N)/ln(size+1)), so rare remedies are not buried by polychrests.' },
  { id: 'kent', name: 'Kent', short: 'Kent', description: 'Kent\'s arithmetic: grade x weight summed, ranked by coverage first, then points.' },
  { id: 'boenninghausen', name: 'Bönninghausen', short: 'Bönningh.', description: 'Grades valued 1, 2, 3, 4, 5 (grade + 1 for grade ≥ 2) summed, ranked by coverage then points, favouring strong generals.' },
  { id: 'elimination', name: 'Elimination', short: 'Elimin.', description: 'Only remedies covering every symptom remain, ranked by sum of degrees.' },
]

/** Reference remedy universe for the small-remedies factor. */
const SMALL_N = 1000

export function smallRubricFactor(size: number): number {
  if (size <= 0) return 0
  return Math.log(SMALL_N) / Math.log(size + 1)
}

export function resolveSymptom(src: RubricSource, symptom: Symptom, clipboardId: string): ResolvedSymptom {
  const maps = symptom.rubrics.map(r => src.grades(r))
  const present = maps.filter((m): m is Map<number, Grade> => m !== null)
  let grades = new Map<number, Grade>()
  if (present.length === 1) grades = present[0]
  else if (present.length > 1) {
    if (symptom.combine === 'intersection') {
      for (const [rem, g] of present[0]) {
        let min: number = g
        let all = true
        for (let k = 1; k < present.length; k++) {
          const o = present[k].get(rem)
          if (!o) { all = false; break }
          min = Math.min(min, o)
        }
        if (all) grades.set(rem, min as Grade)
      }
    } else {
      for (const m of present) for (const [rem, g] of m) grades.set(rem, Math.max(grades.get(rem) ?? 0, g) as Grade)
    }
  }
  const label = symptom.label || symptom.rubrics.map(r => src.label(r)).join(symptom.combine === 'intersection' ? ' ∩ ' : ' ∪ ')
  return { symptom, clipboardId, label, grades, size: grades.size, missing: present.length < symptom.rubrics.length }
}

function points(strategy: StrategyId, grade: number, s: ResolvedSymptom): number {
  const w = s.symptom.weight
  switch (strategy) {
    case 'sum-symptoms-degrees':
    case 'sum-degrees':
    case 'elimination':
      return grade
    case 'sum-symptoms':
      return 1
    case 'weighted':
    case 'kent':
      return grade * w
    case 'small-remedies':
      return grade * w * smallRubricFactor(s.size)
    case 'boenninghausen':
      return (grade >= 2 ? grade + 1 : grade) * w
  }
}

/** Primary sort key of a strategy; the remaining keys break ties deterministically. */
function compare(strategy: StrategyId, a: AnalysisRow, b: AnalysisRow): number {
  const byCov = b.coverage - a.coverage
  const byScore = b.score - a.score
  const byDeg = b.degrees - a.degrees
  switch (strategy) {
    case 'sum-symptoms-degrees':
    case 'sum-symptoms':
    case 'kent':
    case 'boenninghausen':
      return byCov || byScore || byDeg || a.remedyId - b.remedyId
    default:
      return byScore || byCov || byDeg || a.remedyId - b.remedyId
  }
}

export function analyze(src: RubricSource, clipboards: Clipboard[], options: AnalysisOptions): AnalysisResult {
  const chosen = clipboards.filter(cb => options.clipboardIds.includes(cb.id))
  const symptoms = chosen.flatMap(cb => cb.symptoms.map(s => resolveSymptom(src, s, cb.id)))
  const active = symptoms.map((s, i) => ({ s, i })).filter(({ s }) => s.symptom.weight > 0)
  const eliminatory = active.filter(({ s }) => s.symptom.eliminatory)
  const allow = options.remedyFilter ? new Set(options.remedyFilter) : null
  const excluded = new Set(options.excludedRemedies)

  const rows = new Map<number, AnalysisRow>()
  for (const { s, i } of active) {
    for (const [rem, g] of s.grades) {
      if (excluded.has(rem) || (allow && !allow.has(rem))) continue
      let row = rows.get(rem)
      if (!row) {
        row = { remedyId: rem, rank: 0, score: 0, coverage: 0, degrees: 0, grades: new Array(symptoms.length).fill(0), contributions: new Array(symptoms.length).fill(0) }
        rows.set(rem, row)
      }
      const p = points(options.strategy, g, s)
      row.grades[i] = g
      row.contributions[i] = p
      row.score += p
      row.coverage += 1
      row.degrees += g
    }
  }

  let list = [...rows.values()]
  const before = list.length
  if (eliminatory.length) list = list.filter(r => eliminatory.every(({ i }) => r.grades[i] > 0))
  const eliminated = before - list.length
  if (options.strategy === 'elimination') list = list.filter(r => r.coverage === active.length)
  if (options.minCoverage > 0) list = list.filter(r => r.coverage >= options.minCoverage)
  list.sort((a, b) => compare(options.strategy, a, b))
  list.forEach((r, k) => { r.rank = k + 1; r.score = Math.round(r.score * 100) / 100 })
  return { strategy: options.strategy, symptoms, rows: list.slice(0, Math.max(1, options.limit)), total: list.length, eliminated }
}
