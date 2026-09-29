/**
 * Repertorisation engine: pure, synchronous, no React.
 * Normative reference: docs/research/scoring-spec.md (sections cited as §n).
 *
 * ─── Terms (§1.2) ───────────────────────────────────────────────────────────
 *  line s      one analysed symptom after grouping (symptoms sharing a group letter
 *              inside one clipboard form one line, §2 step 2).
 *  g(r,s)      grade of remedy r in s: 0 absent, else the repertory's native grade.
 *              Combined rubrics: union = max grade, intersection = min grade and the
 *              remedy must be in every rubric.
 *  i_s         intensity 1..4; 1 for every line when "use intensity" is off. Lines at
 *              intensity 0 are dropped entirely, including their eliminative or
 *              excluding qualifier (E3). They stay visible in the grid, greyed.
 *  n_s         rubric size (remedies in the line; RubricSource.rubricSize may declare it).
 *  m_r         remedy size: number of rubrics containing r in the line's repertory.
 *  κ_s         Kent category weight: mental 3, general 2, particular 1 (§1.4, §6).
 *
 * ─── Base quantities (§1.3) ─────────────────────────────────────────────────
 *  C  = Σ [g>0]          D  = Σ g              (raw, over scored lines)
 *  CI = Σ i·[g>0]        DI = Σ i·g
 *  Every row carries C (coverage), D (degrees), CI (weightedCoverage) and the
 *  strategy's per-line points, which sum to `points`.
 *
 * ─── Strategies (§3, §4) ────────────────────────────────────────────────────
 *  id                     spec          primary          secondary   points per line
 *  sum-symptoms-degrees   sumSymDeg     CI               DI          i·g
 *  sum-symptoms           sumSym        CI               –           i
 *  sum-degrees            sumDegSym     DI               CI          i·g
 *  weighted               weighted      DI               –           i·g
 *  small-rubrics          smallRubrics  Σ g·i·f_s        –           f_s = 2 if n_s ≤ 10 else 1
 *  remedy-size            smallRemedies DI·f(r)          –           f(r) = clamp((1000/m_r)^0.5, 0.5, 4)
 *  small-remedies         smallBoth     f(r)·Σ g·i·f_s   –           i·g·f_s·f(r)
 *  kent                   kent          Σ g·i·κ_s        –           i·g·κ_s
 *  boenninghausen         boenninghausen  sumSymDeg keys over g_eff, where
 *                         g_eff(r,s) = max(g(r,s), g(r, general rubrics linked to s)) (§4.12)
 *  elimination            (ours)        DI over remedies covering every scored line; CI
 *  f(r) uses m_r of the line's repertory, so with several repertories the factor is
 *  applied per line (identical to the spec's single factor for one repertory).
 *  Then the universal tie chain (§2.1): C desc, D desc, abbreviation (case-insensitive,
 *  trailing dots stripped) asc, remedy id asc. Fractional keys compare as
 *  round(x·1e9) (§2.2).
 *
 * ─── Exclusion (§2 steps 5–7), first matching reason wins ──────────────────
 *  eliminative:<line>  absent from an eliminative line (first failing line in order)
 *  excluding:<line>    present in an excluding ("exclusive") line
 *  filter              outside options.remedyFilter (family limit)
 *  manual              in options.excludedRemedies
 *  coverage            below options.minCoverage, or (elimination) not covering all lines
 *  Qualified lines still score for the remedies that remain (§2 step 8); an excluding
 *  line removes every remedy in it, so it contributes to no remaining score.
 *  Excluded remedies are scored too; with options.showExcluded they keep their sorted
 *  position unranked (rank 0), never counted in the limit.
 */
import type { Grade, RubricRef } from '../data/types'
import { DEFAULT_PARAMS } from './model'
import type { AnalysisOptions, Clipboard, StrategyId, StrategyParams, Symptom, Weight } from './model'

export type ChapterClass = 'mental' | 'general' | 'particular'

export interface RemedyStats {
  /** m_r: number of rubrics the remedy appears in (0 if never). */
  count(remedyId: number): number
  /** Largest count of any remedy in the repertory. */
  max: number
}

/** Minimal data access the engine needs, so it can be tested without the catalog. */
export interface RubricSource {
  /** Remedy grades of a rubric, or null if the rubric is unknown / not loaded. */
  grades(ref: RubricRef): Map<number, Grade> | null
  label(ref: RubricRef): string
  /** Declared rubric size n_s (defaults to the number of graded remedies). */
  rubricSize?(ref: RubricRef): number
  /** Kent hierarchy class of the rubric's chapter (default particular). */
  chapterClass?(ref: RubricRef): ChapterClass
  /** Remedy sizes m_r of a repertory (small-remedy strategies). */
  remedyStats?(repertory: string): RemedyStats | null
  /** General rubrics linked to a rubric for Bönninghausen generalisation (§4.12). */
  generalRubrics?(ref: RubricRef): RubricRef[]
  /** Remedy abbreviation, used by the tie chain. */
  remedyName?(remedyId: number): string
}

export type SymptomRole = 'scored' | 'excluding' | 'ignored'

export interface ResolvedSymptom {
  symptom: Symptom
  clipboardId: string
  label: string
  /** Grades used for scoring (g_eff under Bönninghausen). */
  grades: Map<number, Grade>
  /** Grades before generalisation (same map when not generalised). */
  baseGrades: Map<number, Grade>
  /** General rubrics whose grades were folded in (Bönninghausen), else empty. */
  generals: RubricRef[]
  /** n_s. */
  size: number
  missing: boolean
  /** Symptoms merged into this line through a shared group letter (length 1 when ungrouped). */
  members: Symptom[]
  role: SymptomRole
  /** Effective intensity i_s (0 unless scored or excluding). */
  weight: number
  /** Small-rubric factor f_s. */
  rubricFactor: number
  /** Repertory of the first rubric (remedy-size source). */
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
  /** Secondary sort value (0 when the strategy has none). */
  secondary: number
  /** C: scored lines covered. */
  coverage: number
  /** CI: Σ i over covered lines. */
  weightedCoverage: number
  /** D: Σ g over covered scored lines. */
  degrees: number
  /** Grade per line (0 = absent), including ignored and excluding lines. */
  grades: number[]
  /** Points each line contributed (sums to `points`). */
  contributions: number[]
  /** Σ points. */
  points: number
  excluded: ExclusionReason | null
  /** Symptom id of the line responsible for an eliminative / excluding reason. */
  excludedBy: string | null
}

export interface AnalysisResult {
  strategy: StrategyId
  useIntensity: boolean
  params: StrategyParams
  symptoms: ResolvedSymptom[]
  /** Sorted rows, limited to options.limit included rows (excluded rows interleaved when shown). */
  rows: AnalysisRow[]
  /** Every sorted row shown (not limited): included rows, plus excluded ones when shown. */
  all: AnalysisRow[]
  /** Every excluded row, sorted, whether shown or not. */
  excludedRows: AnalysisRow[]
  /** Included (ranked) remedies before the limit. */
  total: number
  /** Remedies dropped by eliminative symptoms. */
  eliminated: number
  /** Remedies dropped per reason. */
  excludedCounts: Record<ExclusionReason, number>
  /** Number of scored lines (N). */
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
  { id: 'sum-symptoms-degrees', name: 'Sum of symptoms (sort degrees)', short: 'Sympt + Deg', formula: 'rank by Σ i, then Σ i×g', description: 'Most symptoms covered first, then the sum of degrees. The classic default.' },
  { id: 'sum-symptoms', name: 'Sum of symptoms (ignore degrees)', short: 'Symptoms', formula: 'rank by Σ i', description: 'Counts the symptoms each remedy covers; degrees only break ties.' },
  { id: 'sum-degrees', name: 'Sum of degrees', short: 'Degrees', formula: 'rank by Σ i×g, then Σ i', description: 'Sum of grades across all symptoms, then symptoms covered.' },
  { id: 'weighted', name: 'Weighted (intensity × degree)', short: 'Weighted', formula: 'Σ i×g', description: 'Each grade multiplied by the symptom intensity and summed.' },
  { id: 'small-rubrics', name: 'Small rubrics (Organon §153)', short: 'Small rub.', formula: 'Σ i×g×f, f = 2 if n ≤ 10 else 1', description: 'Rubrics with 10 remedies or fewer (rare, characteristic symptoms) count double.' },
  { id: 'remedy-size', name: 'Small remedies', short: 'Small rem.', formula: 'Σ i×g × f(r), f(r) = clamp(√(1000/m), 0.5, 4)', description: 'Corrects for remedy size (m = rubrics the remedy appears in), so lesser-known remedies are not buried by polychrests.' },
  { id: 'small-remedies', name: 'Small rubrics + small remedies', short: 'Small both', formula: 'f(r) × Σ i×g×f', description: 'Small-rubric weighting and the remedy-size correction together.' },
  { id: 'kent', name: 'Kent (hierarchy)', short: 'Kent', formula: 'Σ i×g×κ, κ: mind 3, general 2, local 1', description: 'Kent\'s hierarchy: mentals over generals over particulars.' },
  { id: 'boenninghausen', name: 'Bönninghausen (generalisation)', short: 'Bönningh.', formula: 'g′ = max(g, g in linked general rubric); rank by Σ i, then Σ i×g′', description: 'Grand generalisation: a modality or sensation also counts at the grade its remedy has in the matching Generalities rubric.' },
  { id: 'elimination', name: 'Elimination', short: 'Elimin.', formula: 'covers all; Σ i×g', description: 'Only remedies covering every symptom remain, ranked by sum of degrees.' },
]

export const strategyInfo = (id: StrategyId): StrategyInfo => STRATEGIES.find(s => s.id === id) ?? STRATEGIES[0]

/** Strategies whose primary key is the symptom count (display "CI/DI"). */
export const COVERAGE_FIRST: ReadonlySet<StrategyId> = new Set<StrategyId>(['sum-symptoms-degrees', 'sum-symptoms', 'boenninghausen'])
/** Strategies that show "C/D" style scores. */
const PAIR_SCORE = new Set<StrategyId>(['sum-symptoms-degrees', 'boenninghausen'])

export function mergeParams(patch: AnalysisOptions['params']): StrategyParams {
  if (!patch) return DEFAULT_PARAMS
  return {
    smallRubrics: { ...DEFAULT_PARAMS.smallRubrics, ...patch.smallRubrics },
    smallRemedies: { ...DEFAULT_PARAMS.smallRemedies, ...patch.smallRemedies },
    kent: { weights: { ...DEFAULT_PARAMS.kent.weights, ...patch.kent?.weights } },
  }
}

/** f_s (§4.6): F_small when 0 < n ≤ T_small, else 1. */
export function smallRubricFactor(size: number, p: StrategyParams['smallRubrics'] = DEFAULT_PARAMS.smallRubrics): number {
  return size > 0 && size <= p.threshold ? p.factor : 1
}

/** f(r) (§4.8): clamp((M_ref / m_r)^α, f_min, f_max); 1 when m_r is unknown. */
export function remedySizeFactor(m: number, p: StrategyParams['smallRemedies'] = DEFAULT_PARAMS.smallRemedies): number {
  if (!(m > 0)) return 1
  return Math.min(p.fMax, Math.max(p.fMin, Math.pow(p.mRef / m, p.alpha)))
}

/** Grade value V(g) per strategy: 1 for the pure symptom count, else g. */
export function gradeValue(strategy: StrategyId, g: number): number {
  if (g <= 0) return 0
  return strategy === 'sum-symptoms' ? 1 : g
}

const usesRubricFactor = (s: StrategyId) => s === 'small-rubrics' || s === 'small-remedies'
const usesRemedyFactor = (s: StrategyId) => s === 'small-remedies' || s === 'remedy-size'
const usesHierarchy = (s: StrategyId) => s === 'kent'

/** Default category of a chapter (§1.4), English and German repertories. */
export function classifyChapter(name: string): ChapterClass {
  const n = name.trim().toLowerCase()
  if (/^(mind|gemüt|gemut|psyche|geist)(?!\p{L})/u.test(n)) return 'mental'
  if (/^(generalities|generals|allgemeines|allgemeinsymptome|sleep|schlaf|dreams|träume|chill|frost|fever|fieber|perspiration|schweiß|schweiss)(?!\p{L})/u.test(n)) return 'general'
  return 'particular'
}

/** True for the chapter that holds general rubrics (Bönninghausen generalisation target). */
export const isGeneralitiesChapter = (name: string) => /^(generalities|generals|allgemeines|allgemeinsymptome)(?!\p{L})/iu.test(name.trim())

function repertoryOf(ref: RubricRef): string {
  const i = ref.lastIndexOf(':')
  return i < 0 ? ref : ref.slice(0, i)
}

const HIERARCHY_RANK: Record<ChapterClass, number> = { mental: 3, general: 2, particular: 1 }

export function resolveSymptom(src: RubricSource, symptom: Symptom, clipboardId: string, generalise = false): ResolvedSymptom {
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
  const baseGrades = grades
  const generals: RubricRef[] = []
  if (generalise && src.generalRubrics) {
    for (const r of symptom.rubrics) for (const gr of src.generalRubrics(r)) if (!generals.includes(gr) && !symptom.rubrics.includes(gr)) generals.push(gr)
    const gm = generals.map(r => src.grades(r)).filter((m): m is Map<number, Grade> => m !== null)
    if (gm.length) {
      grades = new Map(baseGrades)
      for (const m of gm) for (const [rem, g] of m) if (g > (grades.get(rem) ?? 0)) grades.set(rem, g)
    }
  }
  const label = symptom.label || symptom.rubrics.map(r => src.label(r)).join(symptom.combine === 'intersection' ? ' ∩ ' : ' ∪ ')
  const first = symptom.rubrics[0] ?? ''
  const hierarchy = symptom.rubrics.reduce<ChapterClass>((best, r) => {
    const c = src.chapterClass?.(r) ?? 'particular'
    return HIERARCHY_RANK[c] > HIERARCHY_RANK[best] ? c : best
  }, 'particular')
  const size = grades === baseGrades && symptom.rubrics.length === 1 && present.length === 1 && src.rubricSize ? src.rubricSize(first) : grades.size
  return {
    symptom, clipboardId, label, grades, baseGrades, generals, size, missing: present.length < symptom.rubrics.length, members: [symptom],
    role: 'scored', weight: symptom.weight, rubricFactor: smallRubricFactor(size), repertory: repertoryOf(first), hierarchy,
  }
}

/** Merge symptoms sharing a group letter (per clipboard) into one line: grade max, union size, intensity max. */
export function applyGroups(list: ResolvedSymptom[], params: StrategyParams = DEFAULT_PARAMS): ResolvedSymptom[] {
  const out: ResolvedSymptom[] = []
  const byGroup = new Map<string, ResolvedSymptom>()
  for (const s of list) {
    const key = s.symptom.group ? `${s.clipboardId}:${s.symptom.group}` : null
    if (!key) { out.push(s); continue }
    const g = byGroup.get(key)
    if (!g) {
      const copy: ResolvedSymptom = { ...s, grades: new Map(s.grades), baseGrades: new Map(s.baseGrades), generals: [...s.generals], label: `[${s.symptom.group}] ${s.label}` }
      byGroup.set(key, copy)
      out.push(copy)
      continue
    }
    for (const [rem, grade] of s.grades) g.grades.set(rem, Math.max(g.grades.get(rem) ?? 0, grade) as Grade)
    for (const [rem, grade] of s.baseGrades) g.baseGrades.set(rem, Math.max(g.baseGrades.get(rem) ?? 0, grade) as Grade)
    for (const r of s.generals) if (!g.generals.includes(r)) g.generals.push(r)
    g.size = g.grades.size
    g.rubricFactor = smallRubricFactor(g.size, params.smallRubrics)
    g.members = [...g.members, s.symptom]
    g.label = `${g.label} + ${s.label}`
    g.missing = g.missing || s.missing
    if (HIERARCHY_RANK[s.hierarchy] > HIERARCHY_RANK[g.hierarchy]) g.hierarchy = s.hierarchy
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

/** Assign role, effective intensity and f_s to each line. */
function assignRoles(cols: ResolvedSymptom[], useIntensity: boolean, params: StrategyParams) {
  for (const c of cols) {
    const w = c.symptom.weight
    c.role = w <= 0 ? 'ignored' : c.symptom.exclusive ? 'excluding' : 'scored'
    c.weight = w <= 0 ? 0 : useIntensity ? w : 1
    c.rubricFactor = smallRubricFactor(c.size, params.smallRubrics)
  }
}

/** Factor breakdown of one term, for the drill-down ("grade × intensity × factors = points"). */
export interface TermExplanation {
  /** Grade used (g_eff under Bönninghausen). */
  grade: number
  /** Grade in the symptom's own rubric when generalisation raised it, else null. */
  baseGrade: number | null
  value: number
  weight: number
  factors: { key: 'f' | 'R' | 'κ'; label: string; value: number }[]
  points: number
}

type StatsCache = Map<string, RemedyStats | null>

function remedyFactorFor(src: RubricSource | null, col: ResolvedSymptom, remedyId: number, params: StrategyParams, cache?: StatsCache): number {
  if (!src?.remedyStats) return 1
  let stats: RemedyStats | null | undefined = cache?.get(col.repertory)
  if (stats === undefined) {
    stats = src.remedyStats(col.repertory)
    cache?.set(col.repertory, stats)
  }
  return stats ? remedySizeFactor(stats.count(remedyId), params.smallRemedies) : 1
}

function hierarchyWeight(col: ResolvedSymptom, params: StrategyParams): number {
  return params.kent.weights[col.hierarchy]
}

function rawPoints(strategy: StrategyId, g: number, col: ResolvedSymptom, remedyFactor: number, params: StrategyParams): number {
  let p = col.weight * gradeValue(strategy, g)
  if (usesRubricFactor(strategy)) p *= col.rubricFactor
  if (usesRemedyFactor(strategy)) p *= remedyFactor
  if (usesHierarchy(strategy)) p *= hierarchyWeight(col, params)
  return p
}

/** Explain how line `i` contributes to a remedy's points under the result's strategy. */
export function explainTerm(result: AnalysisResult, src: RubricSource | null, row: AnalysisRow, i: number): TermExplanation {
  const col = result.symptoms[i]
  const g = row.grades[i] ?? 0
  const strategy = result.strategy
  const params = result.params
  const factors: TermExplanation['factors'] = []
  const base = col.baseGrades.get(row.remedyId) ?? 0
  const baseGrade = g > base ? base : null
  if (col.role !== 'scored' || g <= 0) return { grade: g, baseGrade, value: 0, weight: col.weight, factors, points: 0 }
  if (usesRubricFactor(strategy)) factors.push({ key: 'f', label: `small rubric: ${col.size} remedies${col.size <= params.smallRubrics.threshold ? ` ≤ ${params.smallRubrics.threshold}` : ''}`, value: col.rubricFactor })
  if (usesRemedyFactor(strategy)) {
    const stats = src?.remedyStats?.(col.repertory)
    const m = stats?.count(row.remedyId) ?? 0
    factors.push({ key: 'R', label: m ? `remedy size: in ${m.toLocaleString()} rubrics` : 'remedy size unknown', value: remedyFactorFor(src, col, row.remedyId, params) })
  }
  if (usesHierarchy(strategy)) factors.push({ key: 'κ', label: col.hierarchy, value: hierarchyWeight(col, params) })
  return { grade: g, baseGrade, value: gradeValue(strategy, g), weight: col.weight, factors, points: row.contributions[i] }
}

const fmtNum = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

/** Score label shown in column headers (§2.2): "8/19" for pair strategies, else 1 decimal (0 when integral). */
export function formatScore(strategy: StrategyId, row: Pick<AnalysisRow, 'score' | 'secondary'>): string {
  if (PAIR_SCORE.has(strategy)) return `${fmtNum(row.score)}/${fmtNum(row.secondary)}`
  return fmtNum(row.score)
}

/** Reason code as the spec writes it, e.g. "eliminative:s12". */
export function exclusionCode(row: Pick<AnalysisRow, 'excluded' | 'excludedBy'>): string | null {
  if (!row.excluded) return null
  return row.excludedBy ? `${row.excluded}:${row.excludedBy}` : row.excluded
}

/** Abbreviation sort key (§2.1): case-insensitive, trailing dots stripped. */
export const abbrevKey = (s: string) => s.toLowerCase().replace(/\.+$/, '')

const key9 = (x: number) => Math.round(x * 1e9)

export function analyze(src: RubricSource, clipboards: Clipboard[], options: AnalysisOptions): AnalysisResult {
  const strategy = options.strategy
  const params = mergeParams(options.params)
  const useIntensity = options.useIntensity !== false
  const generalise = strategy === 'boenninghausen'
  const chosen = options.clipboardIds.map(id => clipboards.find(cb => cb.id === id)).filter((c): c is Clipboard => !!c)
  const symptoms = applyGroups(chosen.flatMap(cb => cb.symptoms.map(s => resolveSymptom(src, s, cb.id, generalise))), params)
  assignRoles(symptoms, useIntensity, params)
  const ncol = symptoms.length

  const scored: number[] = []
  const eliminative: number[] = []
  const excluding: number[] = []
  for (let i = 0; i < ncol; i++) {
    const s = symptoms[i]
    if (s.role === 'excluding') excluding.push(i)
    if (s.role !== 'scored') continue
    scored.push(i)
    if (s.symptom.eliminatory) eliminative.push(i)
  }

  const allow = options.remedyFilter ? new Set(options.remedyFilter) : null
  const manual = new Set(options.excludedRemedies)
  const statsCache: StatsCache = new Map()
  const needR = usesRemedyFactor(strategy)

  const rows = new Map<number, AnalysisRow>()
  const rowFor = (rem: number) => {
    let row = rows.get(rem)
    if (!row) {
      row = {
        remedyId: rem, rank: 0, score: 0, secondary: 0, coverage: 0, weightedCoverage: 0, degrees: 0,
        grades: new Array(ncol).fill(0), contributions: new Array(ncol).fill(0), points: 0, excluded: null, excludedBy: null,
      }
      rows.set(rem, row)
    }
    return row
  }
  // candidates (§2 step 4): every remedy graded in a scored or excluding line
  for (const i of scored) {
    const s = symptoms[i]
    for (const [rem, g] of s.grades) {
      const row = rowFor(rem)
      const p = rawPoints(strategy, g, s, needR ? remedyFactorFor(src, s, rem, params, statsCache) : 1, params)
      row.grades[i] = g
      row.contributions[i] = p
      row.points += p
      row.coverage += 1
      row.weightedCoverage += s.weight
      row.degrees += g
    }
  }
  for (const i of excluding) for (const [rem, g] of symptoms[i].grades) rowFor(rem).grades[i] = g
  // grades of ignored lines, for display only
  for (let i = 0; i < ncol; i++) {
    if (symptoms[i].role !== 'ignored') continue
    for (const [rem, g] of symptoms[i].grades) { const row = rows.get(rem); if (row) row.grades[i] = g }
  }

  const excludedCounts: Record<ExclusionReason, number> = { manual: 0, filter: 0, excluding: 0, eliminative: 0, coverage: 0 }
  const list = [...rows.values()]
  for (const r of list) {
    const CI = r.weightedCoverage
    const P = r.points
    switch (strategy) {
      case 'sum-symptoms-degrees':
      case 'boenninghausen': r.score = CI; r.secondary = P; break
      case 'sum-symptoms': r.score = CI; r.secondary = 0; break
      case 'sum-degrees':
      case 'elimination': r.score = P; r.secondary = CI; break
      default: r.score = P; r.secondary = 0
    }
    r.score = key9(r.score) / 1e9
    r.secondary = key9(r.secondary) / 1e9

    let why: ExclusionReason | null = null
    let by: string | null = null
    const el = eliminative.find(i => r.grades[i] === 0)
    if (el !== undefined) { why = 'eliminative'; by = symptoms[el].symptom.id }
    else {
      const ex = excluding.find(i => r.grades[i] > 0)
      if (ex !== undefined) { why = 'excluding'; by = symptoms[ex].symptom.id }
      else if (allow && !allow.has(r.remedyId)) why = 'filter'
      else if (manual.has(r.remedyId)) why = 'manual'
      else if (r.coverage < options.minCoverage || (strategy === 'elimination' && r.coverage < scored.length)) why = 'coverage'
    }
    r.excluded = why
    r.excludedBy = by
    if (why) excludedCounts[why]++
  }

  const names = new Map<number, string>()
  const name = (id: number) => {
    let n = names.get(id)
    if (n === undefined) { n = abbrevKey(src.remedyName?.(id) ?? ''); names.set(id, n) }
    return n
  }
  list.sort((a, b) =>
    key9(b.score) - key9(a.score)
    || key9(b.secondary) - key9(a.secondary)
    || b.coverage - a.coverage
    || b.degrees - a.degrees
    || (name(a.remedyId) < name(b.remedyId) ? -1 : name(a.remedyId) > name(b.remedyId) ? 1 : 0)
    || a.remedyId - b.remedyId)

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
    strategy, useIntensity, params, symptoms, rows: shown.slice(0, cut), all: shown, excludedRows: list.filter(r => r.excluded), total: rank,
    eliminated: excludedCounts.eliminative, excludedCounts, scoredCount: scored.length,
  }
}

