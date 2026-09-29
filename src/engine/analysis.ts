/**
 * Repertorisation engine: pure, synchronous, no React.
 *
 * ─── Terms ──────────────────────────────────────────────────────────────────
 *  column      one analysed symptom after grouping (symptoms sharing a group letter
 *              within a clipboard form one column).
 *  g(r,s)      grade of remedy r in column s: 0 absent, 1..4 (combined rubrics: union =
 *              max grade, intersection = min grade over rubrics, remedy must be in all).
 *  w(s)        effective weight: the symptom intensity 1..4, or 1 when "use intensity"
 *              is off. Intensity 0 means the column is shown but ignored completely:
 *              it scores nothing and its eliminative / excluding qualification is off.
 *  n(s)        rubric size: number of remedies in the column.
 *  N           number of scored columns (weight > 0, not excluding).
 *
 * ─── Column roles ───────────────────────────────────────────────────────────
 *  scored      weight > 0 and not excluding: contributes points.
 *  excluding   weight > 0 and excluding: every remedy present is removed; scores nothing.
 *  ignored     weight 0.
 *  An eliminative scored column additionally removes every remedy absent from it.
 *  Group merge: grade max, weight max, eliminative if any member is, excluding only if
 *  all members are.
 *
 * ─── Per-term points ────────────────────────────────────────────────────────
 *  points(r,s) = w(s) × V(g) × F(s) × R(r,s) × H(s)     (only when g > 0)
 *    V(g)   grade value, strategy table (identity for most strategies).
 *    F(s)   small-rubric factor  max(1, ln 1001 / ln(n+1))  (Organon §153: the rarer the
 *           rubric, the more characteristic the symptom). n=1 → 9.97, n=9 → 3.00,
 *           n=100 → 1.50, n≥1000 → 1.
 *    R(r,s) small-remedy factor  1 + ln(M / c(r)) / ln M  where c(r) is the number of
 *           rubrics the remedy appears in in that repertory and M the largest such count
 *           in the repertory. The biggest polychrest gets 1, a remedy found in one
 *           rubric gets 2, so small remedies are not buried under polychrests.
 *    H(s)   Kent hierarchy: mental 3, general 2, particular 1 (chapter of the rubric).
 *  Factors not used by a strategy are 1.
 *
 * ─── Totals per remedy ──────────────────────────────────────────────────────
 *  coverage  number of scored columns with g > 0           (raw, for display "8/19")
 *  degrees   Σ g over scored columns                      (raw)
 *  C         Σ w over covered columns                      (weighted symptom count)
 *  P         Σ points                                      (weighted degrees)
 *
 * ─── Strategies (primary key ↓, then secondary ↓, then degrees ↓, then abbrev A→Z) ─
 *  sum-symptoms-degrees  default. primary C, secondary P, V = g. Display "C/P".
 *  sum-symptoms          primary C, ignores degrees entirely (ties go alphabetical), V = 1.
 *  sum-degrees           primary P, secondary C, V = g.
 *  weighted              primary P × C / ΣW (ΣW = Σ w over all scored columns): degree
 *                        totals scaled by the share of the case covered. secondary C.
 *  small-rubrics         primary P with F. secondary C.
 *  small-remedies        primary P with F and R (small rubrics + small remedies).
 *  kent                  primary P with V = min(g, 3) (Kent printed three grades) and H.
 *  boenninghausen        primary C, secondary P with V on the Pocket Book five-step scale
 *                        1,2,3 → 1,2,3 and 4 → 5.
 *  elimination           only remedies covering every scored column; primary P.
 *
 * ─── Exclusion (in order) ───────────────────────────────────────────────────
 *  manual (options.excludedRemedies) → filter (options.remedyFilter, family limit) →
 *  excluding symptom → eliminative symptom → coverage (options.minCoverage, and
 *  "all columns" for elimination). Excluded remedies are dropped, or with
 *  options.showExcluded kept in their sorted position with rank 0.
 */
import type { Grade, RubricRef } from '../data/types'
import type { AnalysisOptions, Clipboard, StrategyId, Symptom, Weight } from './model'

export type ChapterClass = 'mental' | 'general' | 'particular'

export interface RemedyStats {
  /** Number of rubrics the remedy appears in (0 if never). */
  count(remedyId: number): number
  /** Largest count of any remedy in the repertory. */
  max: number
}

/** Minimal data access the engine needs, so it can be tested without the catalog. */
export interface RubricSource {
  /** Remedy grades of a rubric, or null if the rubric is unknown / not loaded. */
  grades(ref: RubricRef): Map<number, Grade> | null
  label(ref: RubricRef): string
  /** Kent hierarchy class of the rubric's chapter (default particular). */
  chapterClass?(ref: RubricRef): ChapterClass
  /** Per-remedy rubric counts of a repertory (small-remedies strategy). */
  remedyStats?(repertory: string): RemedyStats | null
  /** Remedy abbreviation, used for the alphabetical tie-break. */
  remedyName?(remedyId: number): string
}

export type SymptomRole = 'scored' | 'excluding' | 'ignored'

export interface ResolvedSymptom {
  symptom: Symptom
  clipboardId: string
  label: string
  grades: Map<number, Grade>
  /** Remedies in the (combined) rubric. */
  size: number
  missing: boolean
  /** Symptoms merged into this column through a shared group letter (length 1 when ungrouped). */
  members: Symptom[]
  role: SymptomRole
  /** Effective weight w(s) (0 unless scored or excluding). */
  weight: number
  /** Small-rubric factor F(s). */
  rubricFactor: number
  /** Repertory of the first rubric (small-remedy factor source). */
  repertory: string
  hierarchy: ChapterClass
}

export type ExclusionReason = 'manual' | 'filter' | 'excluding' | 'eliminative' | 'coverage'

export interface AnalysisRow {
  remedyId: number
  /** 1-based rank; 0 for excluded rows shown in position. */
  rank: number
  /** Primary sort value of the strategy. */
  score: number
  /** Secondary sort value of the strategy. */
  secondary: number
  /** Scored columns covered (raw count). */
  coverage: number
  /** Σ w over covered columns. */
  weightedCoverage: number
  /** Sum of raw grades over covered scored columns. */
  degrees: number
  /** Grade per column (0 = absent), including ignored and excluding columns. */
  grades: number[]
  /** Points each column contributed to the points total (sums to `points`). */
  contributions: number[]
  /** Σ points (after the weighted strategy's coverage scaling). */
  points: number
  excluded: ExclusionReason | null
}

export interface AnalysisResult {
  strategy: StrategyId
  useIntensity: boolean
  symptoms: ResolvedSymptom[]
  /** Sorted rows, limited to options.limit included rows (excluded rows interleaved when shown). */
  rows: AnalysisRow[]
  /** Every sorted row (not limited). */
  all: AnalysisRow[]
  /** Included (ranked) remedies before the limit. */
  total: number
  /** Remedies dropped by eliminative symptoms. */
  eliminated: number
  /** Remedies dropped per reason. */
  excludedCounts: Record<ExclusionReason, number>
  /** Number of scored columns (N). */
  scoredCount: number
}

export interface StrategyInfo {
  id: StrategyId
  name: string
  short: string
  description: string
  /** Formula as shown in the drill-down. */
  formula: string
}

export const STRATEGIES: StrategyInfo[] = [
  { id: 'sum-symptoms-degrees', name: 'Sum of symptoms (sort degrees)', short: 'Sympt + Deg', formula: 'rank by Σw, then Σ w×g', description: 'Most symptoms covered first, then the sum of degrees, then alphabetical. The classic default.' },
  { id: 'sum-symptoms', name: 'Sum of symptoms (ignore degrees)', short: 'Symptoms', formula: 'rank by Σw', description: 'Counts the symptoms each remedy covers; degrees are ignored.' },
  { id: 'sum-degrees', name: 'Sum of degrees', short: 'Degrees', formula: 'rank by Σ w×g, then Σw', description: 'Sum of grades across all symptoms, sorted by symptoms covered on ties.' },
  { id: 'weighted', name: 'Weighted (degrees × coverage)', short: 'Weighted', formula: 'Σ w×g × covered/total', description: 'Degree total scaled by the share of the case the remedy covers, so breadth and depth both count.' },
  { id: 'small-rubrics', name: 'Small rubrics (Organon §153)', short: 'Small rub.', formula: 'Σ w×g×F, F = max(1, ln1001/ln(n+1))', description: 'Rare, characteristic symptoms (small rubrics) weigh more than common ones.' },
  { id: 'small-remedies', name: 'Small rubrics + small remedies', short: 'Small rem.', formula: 'Σ w×g×F×R, R = 1+ln(M/c)/ln M', description: 'Adds a remedy-size correction so lesser-known remedies are not buried by polychrests.' },
  { id: 'kent', name: 'Kent (hierarchy)', short: 'Kent', formula: 'Σ w×min(g,3)×H, H: mind 3, general 2, local 1', description: 'Kent\'s three grades with his hierarchy: mentals over generals over particulars.' },
  { id: 'boenninghausen', name: 'Bönninghausen', short: 'Bönningh.', formula: 'rank by Σw, then Σ w×V, V: 1,2,3,5', description: 'Totality first (symptoms covered), then grades on the Pocket Book five-step scale.' },
  { id: 'elimination', name: 'Elimination', short: 'Elimin.', formula: 'covers all; Σ w×g', description: 'Only remedies covering every symptom remain, ranked by sum of degrees.' },
]

export const strategyInfo = (id: StrategyId): StrategyInfo => STRATEGIES.find(s => s.id === id) ?? STRATEGIES[0]

/** Strategies whose primary key is the (weighted) symptom count. */
const COVERAGE_FIRST = new Set<StrategyId>(['sum-symptoms-degrees', 'sum-symptoms', 'boenninghausen'])

/** Reference universe for the small-rubric factor. */
export const SMALL_RUBRIC_REF = 1001

/** F(n) = max(1, ln 1001 / ln(n + 1)); 0 for an empty rubric. */
export function smallRubricFactor(size: number): number {
  if (size <= 0) return 0
  return Math.max(1, Math.log(SMALL_RUBRIC_REF) / Math.log(size + 1))
}

/** R(c) = 1 + ln(M / c) / ln M, in [1, 2]; 1 when stats are unknown. */
export function smallRemedyFactor(count: number, max: number): number {
  if (count <= 0 || max <= 1) return 1
  return 1 + Math.log(max / Math.min(count, max)) / Math.log(max)
}

export const HIERARCHY_FACTOR: Record<ChapterClass, number> = { mental: 3, general: 2, particular: 1 }

/** Grade value V(g) per strategy. */
export function gradeValue(strategy: StrategyId, g: number): number {
  if (g <= 0) return 0
  switch (strategy) {
    case 'sum-symptoms': return 1
    case 'kent': return Math.min(g, 3)
    case 'boenninghausen': return g >= 4 ? 5 : g
    default: return g
  }
}

const usesRubricFactor = (s: StrategyId) => s === 'small-rubrics' || s === 'small-remedies'
const usesRemedyFactor = (s: StrategyId) => s === 'small-remedies'
const usesHierarchy = (s: StrategyId) => s === 'kent'

/** Classify a chapter name (English and German repertories) for Kent's hierarchy. */
export function classifyChapter(name: string): ChapterClass {
  const n = name.trim().toLowerCase()
  if (/^(mind|gemüt|gemut|psyche|geist)/.test(n)) return 'mental'
  if (/^(generalities|generals|allgemeines|allgemeinsymptome|sleep|schlaf|dreams|träume|chill|frost|fever|fieber|perspiration|schweiß|schweiss|appetite|blood|constitution)/.test(n)) return 'general'
  return 'particular'
}

function repertoryOf(ref: RubricRef): string {
  const i = ref.lastIndexOf(':')
  return i < 0 ? ref : ref.slice(0, i)
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
  const first = symptom.rubrics[0] ?? ''
  const hierarchy = symptom.rubrics.reduce<ChapterClass>((best, r) => {
    const c = src.chapterClass?.(r) ?? 'particular'
    return HIERARCHY_FACTOR[c] > HIERARCHY_FACTOR[best] ? c : best
  }, 'particular')
  return {
    symptom, clipboardId, label, grades, size: grades.size, missing: present.length < symptom.rubrics.length, members: [symptom],
    role: 'scored', weight: symptom.weight, rubricFactor: smallRubricFactor(grades.size), repertory: repertoryOf(first), hierarchy,
  }
}

/** Merge symptoms sharing a group letter (per clipboard) into one column: grade max, weight max. */
export function applyGroups(list: ResolvedSymptom[]): ResolvedSymptom[] {
  const out: ResolvedSymptom[] = []
  const byGroup = new Map<string, ResolvedSymptom>()
  for (const s of list) {
    const key = s.symptom.group ? `${s.clipboardId}:${s.symptom.group}` : null
    if (!key) { out.push(s); continue }
    const g = byGroup.get(key)
    if (!g) {
      const copy: ResolvedSymptom = { ...s, grades: new Map(s.grades), label: `[${s.symptom.group}] ${s.label}` }
      byGroup.set(key, copy)
      out.push(copy)
      continue
    }
    for (const [rem, grade] of s.grades) g.grades.set(rem, Math.max(g.grades.get(rem) ?? 0, grade) as Grade)
    g.size = g.grades.size
    g.rubricFactor = smallRubricFactor(g.size)
    g.members = [...g.members, s.symptom]
    g.label = `${g.label} + ${s.label}`
    g.missing = g.missing || s.missing
    if (HIERARCHY_FACTOR[s.hierarchy] > HIERARCHY_FACTOR[g.hierarchy]) g.hierarchy = s.hierarchy
    g.symptom = {
      ...g.symptom,
      weight: Math.max(g.symptom.weight, s.symptom.weight) as Weight,
      eliminatory: g.symptom.eliminatory || s.symptom.eliminatory,
      exclusive: g.symptom.exclusive && s.symptom.exclusive,
      causal: g.symptom.causal || s.symptom.causal,
    }
  }
  return out
}

/** Assign role and effective weight to each column. */
function assignRoles(cols: ResolvedSymptom[], useIntensity: boolean) {
  for (const c of cols) {
    const w = c.symptom.weight
    c.role = w <= 0 ? 'ignored' : c.symptom.exclusive ? 'excluding' : 'scored'
    c.weight = w <= 0 ? 0 : useIntensity ? w : 1
  }
}

/** Factor breakdown of one term, for the drill-down ("grade × weight × factors = points"). */
export interface TermExplanation {
  grade: number
  value: number
  weight: number
  factors: { key: 'F' | 'R' | 'H' | 'cov'; label: string; value: number }[]
  points: number
}

function remedyFactorFor(src: RubricSource | null, col: ResolvedSymptom, remedyId: number, cache?: Map<string, RemedyStats | null>): number {
  if (!src?.remedyStats) return 1
  let stats: RemedyStats | null | undefined = cache?.get(col.repertory)
  if (stats === undefined) {
    stats = src.remedyStats(col.repertory)
    cache?.set(col.repertory, stats)
  }
  return stats ? smallRemedyFactor(stats.count(remedyId), stats.max) : 1
}

function rawPoints(strategy: StrategyId, g: number, col: ResolvedSymptom, remedyFactor: number): number {
  let p = col.weight * gradeValue(strategy, g)
  if (usesRubricFactor(strategy)) p *= col.rubricFactor
  if (usesRemedyFactor(strategy)) p *= remedyFactor
  if (usesHierarchy(strategy)) p *= HIERARCHY_FACTOR[col.hierarchy]
  return p
}

/** Explain how column `i` contributes to a remedy's points under the result's strategy. */
export function explainTerm(result: AnalysisResult, src: RubricSource | null, row: AnalysisRow, i: number): TermExplanation {
  const col = result.symptoms[i]
  const g = row.grades[i] ?? 0
  const strategy = result.strategy
  const factors: TermExplanation['factors'] = []
  if (col.role !== 'scored' || g <= 0) return { grade: g, value: 0, weight: col.weight, factors, points: 0 }
  if (usesRubricFactor(strategy)) factors.push({ key: 'F', label: `small rubric (${col.size} remedies)`, value: col.rubricFactor })
  if (usesRemedyFactor(strategy)) factors.push({ key: 'R', label: 'small remedy', value: remedyFactorFor(src, col, row.remedyId) })
  if (usesHierarchy(strategy)) factors.push({ key: 'H', label: col.hierarchy, value: HIERARCHY_FACTOR[col.hierarchy] })
  const totalW = result.symptoms.reduce((n, c) => n + (c.role === 'scored' ? c.weight : 0), 0)
  if (strategy === 'weighted' && totalW > 0) factors.push({ key: 'cov', label: `coverage ${row.weightedCoverage}/${totalW}`, value: row.weightedCoverage / totalW })
  return { grade: g, value: gradeValue(strategy, g), weight: col.weight, factors, points: row.contributions[i] }
}

const round = (x: number) => Math.round(x * 100) / 100

/** Score label shown in column headers, e.g. "8/19" for the default strategy. */
export function formatScore(strategy: StrategyId, row: Pick<AnalysisRow, 'score' | 'secondary'>): string {
  const f = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(x >= 100 ? 0 : 1))
  if (strategy === 'sum-symptoms-degrees' || strategy === 'boenninghausen') return `${f(row.score)}/${f(row.secondary)}`
  return f(row.score)
}

export function analyze(src: RubricSource, clipboards: Clipboard[], options: AnalysisOptions): AnalysisResult {
  const strategy = options.strategy
  const useIntensity = options.useIntensity !== false
  const chosen = options.clipboardIds.map(id => clipboards.find(cb => cb.id === id)).filter((c): c is Clipboard => !!c)
  const symptoms = applyGroups(chosen.flatMap(cb => cb.symptoms.map(s => resolveSymptom(src, s, cb.id))))
  assignRoles(symptoms, useIntensity)
  const ncol = symptoms.length

  const scored: number[] = []
  const eliminative: number[] = []
  const excludedBySymptom = new Set<number>()
  let totalW = 0
  for (let i = 0; i < ncol; i++) {
    const s = symptoms[i]
    if (s.role === 'excluding') for (const rem of s.grades.keys()) excludedBySymptom.add(rem)
    if (s.role !== 'scored') continue
    scored.push(i)
    totalW += s.weight
    if (s.symptom.eliminatory) eliminative.push(i)
  }

  const allow = options.remedyFilter ? new Set(options.remedyFilter) : null
  const manual = new Set(options.excludedRemedies)
  const statsCache = new Map<string, RemedyStats | null>()
  const needR = usesRemedyFactor(strategy)

  const rows = new Map<number, AnalysisRow>()
  for (const i of scored) {
    const s = symptoms[i]
    for (const [rem, g] of s.grades) {
      let row = rows.get(rem)
      if (!row) {
        row = {
          remedyId: rem, rank: 0, score: 0, secondary: 0, coverage: 0, weightedCoverage: 0, degrees: 0,
          grades: new Array(ncol).fill(0), contributions: new Array(ncol).fill(0), points: 0, excluded: null,
        }
        rows.set(rem, row)
      }
      const p = rawPoints(strategy, g, s, needR ? remedyFactorFor(src, s, rem, statsCache) : 1)
      row.grades[i] = g
      row.contributions[i] = p
      row.points += p
      row.coverage += 1
      row.weightedCoverage += s.weight
      row.degrees += g
    }
  }
  // grades of non-scored columns, for display
  for (let i = 0; i < ncol; i++) {
    if (symptoms[i].role === 'scored') continue
    for (const [rem, g] of symptoms[i].grades) { const row = rows.get(rem); if (row) row.grades[i] = g }
  }

  const excludedCounts: Record<ExclusionReason, number> = { manual: 0, filter: 0, excluding: 0, eliminative: 0, coverage: 0 }
  const list = [...rows.values()]
  for (const r of list) {
    if (strategy === 'weighted' && totalW > 0) {
      const k = r.weightedCoverage / totalW
      r.points *= k
      for (const i of scored) r.contributions[i] *= k
    }
    const C = r.weightedCoverage
    const P = r.points
    if (COVERAGE_FIRST.has(strategy)) { r.score = C; r.secondary = strategy === 'sum-symptoms' ? 0 : P }
    else { r.score = P; r.secondary = C }
    r.score = round(r.score)
    r.secondary = round(r.secondary)

    let why: ExclusionReason | null = null
    if (manual.has(r.remedyId)) why = 'manual'
    else if (allow && !allow.has(r.remedyId)) why = 'filter'
    else if (excludedBySymptom.has(r.remedyId)) why = 'excluding'
    else if (eliminative.some(i => r.grades[i] === 0)) why = 'eliminative'
    else if (r.coverage < options.minCoverage || (strategy === 'elimination' && r.coverage < scored.length)) why = 'coverage'
    r.excluded = why
    if (why) excludedCounts[why]++
  }

  const names = new Map<number, string>()
  const name = (id: number) => {
    let n = names.get(id)
    if (n === undefined) { n = (src.remedyName?.(id) ?? '').toLowerCase(); names.set(id, n) }
    return n
  }
  const byDegrees = strategy !== 'sum-symptoms'
  list.sort((a, b) => b.score - a.score || b.secondary - a.secondary || (byDegrees ? b.degrees - a.degrees : 0) || (name(a.remedyId) < name(b.remedyId) ? -1 : name(a.remedyId) > name(b.remedyId) ? 1 : 0) || a.remedyId - b.remedyId)

  const shown = options.showExcluded ? list : list.filter(r => !r.excluded)
  let rank = 0
  for (const r of shown) if (!r.excluded) r.rank = ++rank
  const limit = Math.max(1, options.limit)
  let cut = shown.length
  if (rank > limit) {
    let n = 0
    for (let k = 0; k < shown.length; k++) if (!shown[k].excluded && ++n === limit) { cut = k + 1; break }
  }
  return {
    strategy, useIntensity, symptoms, rows: shown.slice(0, cut), all: shown, total: rank,
    eliminated: excludedCounts.eliminative, excludedCounts, scoredCount: scored.length,
  }
}
