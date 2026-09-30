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
 *  i_s         intensity 1..4; 1 for every line when "use intensity" is off. Symptoms at
 *              intensity 0 are dropped before grouping (§2 step 1, E3): their grades never
 *              enter a group's max and their eliminative / excluding qualifiers never act.
 *              They stay visible in the grid as their own greyed ("ignored") line.
 *  n_s         rubric size (remedies in the line; RubricSource.rubricSize may declare it).
 *  m_r         remedy size: number of rubrics containing r in the line's repertory.
 *  κ_s         Kent category weight: mental 3, general 2, particular 1 (§1.4, §6).
 *  w(n)        continuous small-rubric weight 1 + (W_max − 1)·2^(−(n−1)/H) (§4.7).
 *  top_s       the line's highest grade and the number of remedies holding it (§4.10, §4.15).
 *
 * ─── Base quantities (§1.3) ─────────────────────────────────────────────────
 *  C  = Σ [g>0]          D  = Σ g              (raw, over scored lines)
 *  CI = Σ i·[g>0]        DI = Σ i·g
 *  Every row carries C (coverage), D (degrees), CI (weightedCoverage) and the
 *  strategy's per-line points, which sum to `points`.
 *
 * ─── Strategies (§3, §4) ────────────────────────────────────────────────────
 *  id                        spec            sort keys                points per line
 *  sum-symptoms-degrees      sumSymDeg       CI, DI                   i·g
 *  sum-symptoms              sumSym          CI                       i
 *  sum-degrees               sumDegSym       DI, CI                   i·g
 *  sum-symptoms-plus-degrees sumSymPlusDeg   CI + DI                  i·(1 + g)
 *  weighted                  weighted        DI                       i·g
 *  small-rubrics             smallRubrics    Σ                        i·g·f_s, f_s = 2 if n_s ≤ 10 else 1
 *  small-rubrics-cont        smallRubricsCont Σ                       i·g·w(n_s)
 *  remedy-size               smallRemedies   Σ                        i·g·f(r), f(r) = clamp((1000/m_r)^0.5, 0.5, 4)
 *  small-remedies            smallBoth       Σ                        i·g·f_s·f(r)
 *  prominence                prominence      P, CI, DI                i·g·π, π = 1 when r holds top_s and ≤ K share it, else 0
 *  kent                      kent            Σ                        i·g·κ_s
 *  boenninghausen            boenninghausen  CI, DI over g_eff, where
 *                            g_eff(r,s) = max(g(r,s), g(r, general rubrics linked to s)) (§4.12)
 *  polarity                  polarity        not contraindicated, PD, PS, cov
 *                                                                     g(p) − g(opposite) on polar lines
 *  segments                  segments        SegScore, DI             i·g
 *  composite                 composite       Σ                        i·g·κ·w(n)·π·f(r), π = 2 for the sole top grade
 *  elimination               (ours)          DI over remedies covering every scored line, then CI
 *  f(r) uses m_r of the line's repertory, so with several repertories the factor is
 *  applied per line (identical to the spec's single factor for one repertory).
 *  Then the universal tie chain (§2.1): C desc, D desc, abbreviation (case-insensitive,
 *  trailing dots stripped) asc, remedy id asc. Fractional keys compare as
 *  round(x·1e9) (§2.2).
 *  Family pseudo-remedy analysis (§4.16) is `analyzeFamilies`, which runs any strategy
 *  over families instead of remedies.
 *
 * ─── Exclusion (§2 steps 5–7), first matching reason wins ──────────────────
 *  eliminative:<line>  absent from an eliminative line (first failing line in order)
 *  excluding:<line>    present in an excluding ("exclusive") line
 *  filter              outside options.remedyFilter (family limit)
 *  manual              in options.excludedRemedies
 *  coverage            below options.minCoverage, (elimination) not covering all lines, or
 *                      (polarity) covering fewer than N − allowMissing polar lines
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
  /** Polar opposite of a rubric (polarity strategy, §4.13), e.g. "… agg." ↔ "… amel.", or null. */
  oppositeRubric?(ref: RubricRef): RubricRef | null
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
  /** Highest grade in the line (0 when empty). */
  topGrade: number
  /** Number of remedies holding `topGrade`. */
  topCount: number
  /** Polar opposite rubric (polarity strategy only), else null. */
  opposite: RubricRef | null
  /** Grades of the opposite rubric (polarity strategy only), else null. */
  oppositeGrades: Map<number, Grade> | null
}

export type ExclusionReason = 'manual' | 'filter' | 'excluding' | 'eliminative' | 'coverage'

export interface PolarityStats {
  /** PS: Σ grade in the polar lines (plus the non-polar degree sum with includeNonPolar). */
  ps: number
  /** OS: Σ grade in the opposite rubrics. */
  os: number
  /** PD = PS − OS. */
  pd: number
  /** Polar lines covered. */
  cov: number
}

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
  /** Polarity: a polar pair contradicts the remedy (low grade here, high grade in the opposite). */
  contraindicated: boolean
  /** Polarity sums (polarity strategy only), else null. */
  polarity: PolarityStats | null
}

export type QualityLight = 'green' | 'amber' | 'red'

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
  /** Case quality light (§4.15): red < 4 lines; amber > 80 % at intensity 1 or > 20 % at 4. */
  quality: QualityLight
  /** Composite: 100·(S1 − S2)/S1 over the top two ranked scores; null for other strategies. */
  confidence: number | null
  /** Polarity: number of polar lines N (0 for other strategies). */
  polarLines: number
  /** Strategy notes and warnings for the analysis header (plain sentences). */
  notes: string[]
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
  { id: 'sum-symptoms-plus-degrees', name: 'Sum of symptoms and degrees', short: 'Sym + Deg', formula: 'Σ i×(1 + g) = Σ i + Σ i×g', description: 'Symptoms covered and the sum of degrees added into one score.' },
  { id: 'weighted', name: 'Weighted (intensity × degree)', short: 'Weighted', formula: 'Σ i×g', description: 'Each grade multiplied by the symptom intensity and summed.' },
  { id: 'small-rubrics', name: 'Small rubrics (Organon §153)', short: 'Small rub.', formula: 'Σ i×g×f, f = 2 if n ≤ 10 else 1', description: 'Rubrics with 10 remedies or fewer (rare, characteristic symptoms) count double.' },
  { id: 'small-rubrics-cont', name: 'Small rubrics (continuous)', short: 'Small cont.', formula: 'Σ i×g×w, w = 1 + 29×2^(−(n−1)/10)', description: 'The smaller the rubric, the more it counts: a 1-remedy rubric weighs 30, one with 11 remedies 15.5, large rubrics about 1.' },
  { id: 'remedy-size', name: 'Small remedies', short: 'Small rem.', formula: 'Σ i×g × f(r), f(r) = clamp(√(1000/m), 0.5, 4)', description: 'Corrects for remedy size (m = rubrics the remedy appears in), so lesser-known remedies are not buried by polychrests.' },
  { id: 'small-remedies', name: 'Small rubrics + small remedies', short: 'Small both', formula: 'f(r) × Σ i×g×f', description: 'Small-rubric weighting and the remedy-size correction together.' },
  { id: 'prominence', name: 'Prominence (keynotes)', short: 'Prominence', formula: 'P = Σ i×g where the remedy has the top grade (≤ 3 share it); then Σ i, Σ i×g', description: 'Counts only the symptoms in which the remedy stands out with the rubric\'s highest grade; remedies without such symptoms follow by symptoms and degrees.' },
  { id: 'kent', name: 'Kent (hierarchy)', short: 'Kent', formula: 'Σ i×g×κ, κ: mind 3, general 2, local 1', description: 'Kent\'s hierarchy: mentals over generals over particulars.' },
  { id: 'boenninghausen', name: 'Bönninghausen (generalisation)', short: 'Bönningh.', formula: 'g′ = max(g, g in linked general rubric); rank by Σ i, then Σ i×g′', description: 'Grand generalisation: a modality or sensation also counts at the grade its remedy has in the matching Generalities rubric.' },
  { id: 'polarity', name: 'Polarity (Frei)', short: 'Polarity', formula: 'PD = Σ g(symptom) − Σ g(opposite); contraindicated if g ≤ 2 and opposite ≥ 3', description: 'Uses symptoms with a polar opposite (agg. ↔ amel.): remedies covering every polar symptom, ranked by polarity difference; a remedy strong in the opposite pole is contraindicated and sorts last.' },
  { id: 'segments', name: 'Segments (by clipboard)', short: 'Segments', formula: 'number of clipboards where the remedy is in the top 10; then Σ i×g', description: 'Analyses each clipboard as a separate segment of the case and favours remedies that rank high in most segments. Works best with 2–6 clipboards.' },
  { id: 'composite', name: 'Composite (weighted mix)', short: 'Composite', formula: 'f(r) × Σ i×g×κ×w×π, π = 2 for the sole top grade', description: 'Combines hierarchy, continuous small-rubric weight, a bonus for the sole top-grade remedy and the remedy-size correction. Shows a confidence and case-quality note.' },
  { id: 'elimination', name: 'Elimination', short: 'Elimin.', formula: 'covers all; Σ i×g', description: 'Only remedies covering every symptom remain, ranked by sum of degrees.' },
]

export const strategyInfo = (id: StrategyId): StrategyInfo => STRATEGIES.find(s => s.id === id) ?? STRATEGIES[0]

/** Strategies whose primary key is the symptom count (display "CI/DI"). */
export const COVERAGE_FIRST: ReadonlySet<StrategyId> = new Set<StrategyId>(['sum-symptoms-degrees', 'sum-symptoms', 'boenninghausen'])
/** Strategies that show "C/D" style scores. */
const PAIR_SCORE = new Set<StrategyId>(['sum-symptoms-degrees', 'boenninghausen', 'segments'])

/** What each drill-down factor key means. */
export const FACTOR_NOTES: Record<TermFactor['key'], string> = {
  f: 'small-rubric factor (2 when the rubric has 10 remedies or fewer)',
  w: 'continuous small-rubric weight 1 + 29×2^(−(n−1)/10)',
  R: 'remedy-size factor √(1000 / rubrics of the remedy), clamped 0.5–4',
  κ: 'Kent hierarchy (mind 3, general 2, local 1)',
  π: 'prominence: counts when the remedy has the rubric\'s top grade (sole top grade ×2 in the composite)',
}

export function mergeParams(patch: AnalysisOptions['params']): StrategyParams {
  if (!patch) return DEFAULT_PARAMS
  return {
    smallRubrics: { ...DEFAULT_PARAMS.smallRubrics, ...patch.smallRubrics },
    smallRemedies: { ...DEFAULT_PARAMS.smallRemedies, ...patch.smallRemedies },
    kent: { weights: { ...DEFAULT_PARAMS.kent.weights, ...patch.kent?.weights } },
    smallRubricsCont: { ...DEFAULT_PARAMS.smallRubricsCont, ...patch.smallRubricsCont },
    prominence: { ...DEFAULT_PARAMS.prominence, ...patch.prominence },
    polarity: { ...DEFAULT_PARAMS.polarity, ...patch.polarity },
    segments: { ...DEFAULT_PARAMS.segments, ...patch.segments },
    composite: { ...DEFAULT_PARAMS.composite, ...patch.composite },
  }
}

/** f_s (§4.6): F_small when 0 < n ≤ T_small, else 1. */
export function smallRubricFactor(size: number, p: StrategyParams['smallRubrics'] = DEFAULT_PARAMS.smallRubrics): number {
  return size > 0 && size <= p.threshold ? p.factor : 1
}

/** w(n) (§4.7): 1 + (W_max − 1)·2^(−(n−1)/H); n below 1 counts as 1. */
export function rubricSizeWeight(size: number, p: StrategyParams['smallRubricsCont'] = DEFAULT_PARAMS.smallRubricsCont): number {
  const n = Math.max(1, size)
  return 1 + (p.wMax - 1) * Math.pow(2, -(n - 1) / p.halfLife)
}

/** f(r) (§4.8): clamp((M_ref / m_r)^α, f_min, f_max); 1 when m_r is unknown. */
export function remedySizeFactor(m: number, p: StrategyParams['smallRemedies'] = DEFAULT_PARAMS.smallRemedies): number {
  if (!(m > 0)) return 1
  return Math.min(p.fMax, Math.max(p.fMin, Math.pow(p.mRef / m, p.alpha)))
}

/** Grade value V(g) per strategy: 1 for the pure symptom count, 1 + g for symptoms plus degrees, else g. */
export function gradeValue(strategy: StrategyId, g: number): number {
  if (g <= 0) return 0
  if (strategy === 'sum-symptoms') return 1
  if (strategy === 'sum-symptoms-plus-degrees') return 1 + g
  return g
}

const usesRubricFactor = (s: StrategyId) => s === 'small-rubrics' || s === 'small-remedies'
const usesSizeWeight = (s: StrategyId) => s === 'small-rubrics-cont' || s === 'composite'
const usesRemedyFactor = (s: StrategyId) => s === 'small-remedies' || s === 'remedy-size' || s === 'composite'
const usesHierarchy = (s: StrategyId) => s === 'kent' || s === 'composite'
const usesProminence = (s: StrategyId) => s === 'prominence' || s === 'composite'

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
    topGrade: 0, topCount: 0, opposite: null, oppositeGrades: null,
  }
}

/**
 * Merge symptoms sharing a group letter (per clipboard) into one line: grade max, union size,
 * intensity max. Symptoms at intensity 0 are dropped from grouping first (§2 step 1, E3): each
 * stays a line of its own (ignored later), so its grades never enter the group max and its
 * eliminative / excluding qualifier never reaches the group. A group whose members are all at 0
 * leaves only ignored lines.
 */
export function applyGroups(list: ResolvedSymptom[], params: StrategyParams = DEFAULT_PARAMS): ResolvedSymptom[] {
  const out: ResolvedSymptom[] = []
  const byGroup = new Map<string, ResolvedSymptom>()
  for (const s of list) {
    const key = s.symptom.group && s.symptom.weight > 0 ? `${s.clipboardId}:${s.symptom.group}` : null
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
      // a merged line has no single opposite unless every member names the same one
      opposite: g.symptom.opposite && g.symptom.opposite === s.symptom.opposite ? g.symptom.opposite : null,
    }
  }
  return out
}

/** Assign role, effective intensity, f_s and the top-grade statistics to each line. */
function assignRoles(cols: ResolvedSymptom[], useIntensity: boolean, params: StrategyParams) {
  for (const c of cols) {
    const w = c.symptom.weight
    c.role = w <= 0 ? 'ignored' : c.symptom.exclusive ? 'excluding' : 'scored'
    c.weight = w <= 0 ? 0 : useIntensity ? w : 1
    c.rubricFactor = smallRubricFactor(c.size, params.smallRubrics)
    let top = 0, count = 0
    for (const g of c.grades.values()) {
      if (g > top) { top = g; count = 1 } else if (g === top) count++
    }
    c.topGrade = top
    c.topCount = count
  }
}

/** Polar opposite of a line: the symptom's own, else the source's for a single, ungrouped rubric. */
function resolveOpposite(src: RubricSource, col: ResolvedSymptom, mapGrades?: Remap['grades']) {
  let ref: RubricRef | null = col.symptom.opposite ?? null
  if (!ref && col.members.length === 1 && col.symptom.rubrics.length === 1) ref = src.oppositeRubric?.(col.symptom.rubrics[0]) ?? null
  const grades = ref ? src.grades(ref) : null
  col.opposite = grades ? ref : null
  col.oppositeGrades = grades && mapGrades ? mapGrades(grades) : grades
}

export interface TermFactor {
  key: 'f' | 'w' | 'R' | 'κ' | 'π'
  label: string
  value: number
}

/** Factor breakdown of one term, for the drill-down ("grade × intensity × factors = points"). */
export interface TermExplanation {
  /** Grade used (g_eff under Bönninghausen). */
  grade: number
  /** Grade in the symptom's own rubric when generalisation raised it, else null. */
  baseGrade: number | null
  value: number
  weight: number
  factors: TermFactor[]
  /** Polarity: grade of the remedy in the opposite rubric, subtracted from the term; else null. */
  opposite: { label: string; grade: number } | null
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

/** π: prominence (1 when r holds the top grade shared by ≤ K, sole ×2 with soleBonus, else 0); composite (sole top grade ×2, else 1). */
function prominenceFactor(strategy: StrategyId, g: number, col: ResolvedSymptom, params: StrategyParams): number {
  const top = g > 0 && g === col.topGrade
  if (strategy === 'composite') return top && col.topCount === 1 ? params.composite.soleTopFactor : 1
  if (!top || col.topCount > params.prominence.k) return 0
  return params.prominence.soleBonus && col.topCount === 1 ? 2 : 1
}

function rawPoints(strategy: StrategyId, g: number, col: ResolvedSymptom, remedyFactor: number, params: StrategyParams): number {
  let p = col.weight * gradeValue(strategy, g)
  if (usesRubricFactor(strategy)) p *= col.rubricFactor
  if (usesSizeWeight(strategy)) p *= rubricSizeWeight(col.size, params.smallRubricsCont)
  if (usesHierarchy(strategy)) p *= hierarchyWeight(col, params)
  if (usesProminence(strategy)) p *= prominenceFactor(strategy, g, col, params)
  if (usesRemedyFactor(strategy)) p *= remedyFactor
  return p
}

/** Explain how line `i` contributes to a remedy's points under the result's strategy. */
export function explainTerm(result: AnalysisResult, src: RubricSource | null, row: AnalysisRow, i: number): TermExplanation {
  const col = result.symptoms[i]
  const g = row.grades[i] ?? 0
  const strategy = result.strategy
  const params = result.params
  const factors: TermFactor[] = []
  const base = col.baseGrades.get(row.remedyId) ?? 0
  const baseGrade = g > base ? base : null
  if (strategy === 'polarity') {
    if (col.role !== 'scored') return { grade: g, baseGrade, value: 0, weight: 1, factors, opposite: null, points: 0 }
    if (col.oppositeGrades && col.opposite) {
      const og = col.oppositeGrades.get(row.remedyId) ?? 0
      return { grade: g, baseGrade, value: g, weight: 1, factors, opposite: { label: src?.label(col.opposite) ?? col.opposite, grade: og }, points: row.contributions[i] }
    }
    const nonPolar = row.contributions[i] !== 0
    return { grade: g, baseGrade, value: nonPolar ? g : 0, weight: 1, factors, opposite: null, points: row.contributions[i] }
  }
  if (col.role !== 'scored' || g <= 0) return { grade: g, baseGrade, value: 0, weight: col.weight, factors, opposite: null, points: 0 }
  if (usesRubricFactor(strategy)) factors.push({ key: 'f', label: `small rubric: ${col.size} remedies${col.size <= params.smallRubrics.threshold ? ` ≤ ${params.smallRubrics.threshold}` : ''}`, value: col.rubricFactor })
  if (usesSizeWeight(strategy)) factors.push({ key: 'w', label: `rubric size weight: ${col.size} remedies`, value: rubricSizeWeight(col.size, params.smallRubricsCont) })
  if (usesHierarchy(strategy)) factors.push({ key: 'κ', label: col.hierarchy, value: hierarchyWeight(col, params) })
  if (usesProminence(strategy)) {
    const v = prominenceFactor(strategy, g, col, params)
    const shared = col.topCount === 1 ? 'sole top grade' : `top grade ${col.topGrade}, shared by ${col.topCount} remedies`
    const label = g !== col.topGrade ? `below the rubric's top grade ${col.topGrade}` : strategy === 'prominence' && col.topCount > params.prominence.k ? `${shared} (more than ${params.prominence.k})` : shared
    factors.push({ key: 'π', label, value: v })
  }
  if (usesRemedyFactor(strategy)) {
    const stats = src?.remedyStats?.(col.repertory)
    const m = stats?.count(row.remedyId) ?? 0
    factors.push({ key: 'R', label: m ? `remedy size: in ${m.toLocaleString()} rubrics` : 'remedy size unknown', value: remedyFactorFor(src, col, row.remedyId, params) })
  }
  return { grade: g, baseGrade, value: gradeValue(strategy, g), weight: col.weight, factors, opposite: null, points: row.contributions[i] }
}

const fmtNum = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

/**
 * Score label shown in column headers (§2.2): "8/19" for pair strategies, else 1 decimal (0 when
 * integral). Polarity shows PD, prefixed "CI" when the remedy is contraindicated.
 */
export function formatScore(strategy: StrategyId, row: Pick<AnalysisRow, 'score' | 'secondary'> & Partial<Pick<AnalysisRow, 'contraindicated'>>): string {
  if (PAIR_SCORE.has(strategy)) return `${fmtNum(row.score)}/${fmtNum(row.secondary)}`
  if (strategy === 'polarity' && row.contraindicated) return `CI ${fmtNum(row.score)}`
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

/** Case quality light (§4.15) over the scored lines' recorded intensities. */
export function qualityLight(weights: number[]): { light: QualityLight; reason: string } {
  const n = weights.length
  if (n < 4) return { light: 'red', reason: `only ${n} scored symptom${n === 1 ? '' : 's'} (4 or more recommended)` }
  const ones = weights.filter(w => w === 1).length / n
  const fours = weights.filter(w => w === 4).length / n
  if (ones > 0.8) return { light: 'amber', reason: `${Math.round(ones * 100)} % of symptoms at intensity 1: grade the key symptoms` }
  if (fours > 0.2) return { light: 'amber', reason: `${Math.round(fours * 100)} % of symptoms at intensity 4: keep 4 for the few strongest` }
  return { light: 'green', reason: 'intensities well spread' }
}

/** Internal hook for family analysis: rewrites each resolved line's grades before grouping, and opposite grades. */
interface Remap {
  line: (col: ResolvedSymptom) => void
  grades: (grades: Map<number, Grade>) => Map<number, Grade>
}

export function analyze(src: RubricSource, clipboards: Clipboard[], options: AnalysisOptions): AnalysisResult {
  return analyzeCore(src, clipboards, options)
}

function analyzeCore(src: RubricSource, clipboards: Clipboard[], options: AnalysisOptions, remap?: Remap): AnalysisResult {
  const strategy = options.strategy
  const params = mergeParams(options.params)
  const useIntensity = options.useIntensity !== false
  const generalise = strategy === 'boenninghausen'
  const chosen = options.clipboardIds.map(id => clipboards.find(cb => cb.id === id)).filter((c): c is Clipboard => !!c)
  const resolved = chosen.flatMap(cb => cb.symptoms.map(s => resolveSymptom(src, s, cb.id, generalise)))
  if (remap) resolved.forEach(remap.line)
  const symptoms = applyGroups(resolved, params)
  assignRoles(symptoms, useIntensity, params)
  const ncol = symptoms.length
  const notes: string[] = []

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
        contraindicated: false, polarity: null,
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
  const list = [...rows.values()]

  // polarity (§4.13): PS, OS, PD and contraindication over the polar lines
  let polarLines = 0
  let polarNeed = 0
  if (strategy === 'polarity') {
    const pp = params.polarity
    for (const i of scored) resolveOpposite(src, symptoms[i], remap?.grades)
    const polar = scored.filter(i => symptoms[i].oppositeGrades)
    polarLines = polar.length
    const nonPolarCounts = pp.includeNonPolar || polarLines === 0
    if (polarLines === 0) notes.push('No scored symptom has a polar opposite rubric (such as “agg.” ↔ “amel.”), so remedies are ranked by degrees only. Take modality rubrics that have an opposite to use polarity analysis.')
    else if (polarLines < pp.minLinesWarn) notes.push(`Polarity uses ${polarLines} polar symptom${polarLines === 1 ? '' : 's'}; ${pp.minLinesWarn} or more give a reliable result.`)
    polarNeed = Math.max(0, polarLines - pp.allowMissing)
    const isPolar = new Set(polar)
    for (const r of list) {
      let ps = 0, os = 0, cov = 0, contra = false
      r.points = 0
      for (const i of scored) {
        const g = r.grades[i]
        let c = 0
        if (isPolar.has(i)) {
          const og = symptoms[i].oppositeGrades!.get(r.remedyId) ?? 0
          ps += g
          os += og
          if (g > 0) cov++
          if (g <= pp.low && og >= pp.high) contra = true
          c = g - og
        } else if (nonPolarCounts) {
          ps += g
          c = g
        }
        r.contributions[i] = c
        r.points += c
      }
      r.polarity = { ps, os, pd: ps - os, cov }
      r.contraindicated = contra
    }
  }

  // exclusion (§2 steps 5–7)
  const excludedCounts: Record<ExclusionReason, number> = { manual: 0, filter: 0, excluding: 0, eliminative: 0, coverage: 0 }
  for (const r of list) {
    let why: ExclusionReason | null = null
    let by: string | null = null
    const el = eliminative.find(i => r.grades[i] === 0)
    if (el !== undefined) { why = 'eliminative'; by = symptoms[el].symptom.id }
    else {
      const ex = excluding.find(i => r.grades[i] > 0)
      if (ex !== undefined) { why = 'excluding'; by = symptoms[ex].symptom.id }
      else if (allow && !allow.has(r.remedyId)) why = 'filter'
      else if (manual.has(r.remedyId)) why = 'manual'
      else if (
        r.coverage < options.minCoverage
        || (strategy === 'elimination' && r.coverage < scored.length)
        || (strategy === 'polarity' && r.polarity!.cov < polarNeed)
      ) why = 'coverage'
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
  const tieChain = (a: AnalysisRow, b: AnalysisRow) =>
    b.coverage - a.coverage
    || b.degrees - a.degrees
    || (name(a.remedyId) < name(b.remedyId) ? -1 : name(a.remedyId) > name(b.remedyId) ? 1 : 0)
    || a.remedyId - b.remedyId

  // segments (§4.14): SegScore = clipboards in which the remedy ranks in the top K (base sumSymDeg, intensity off)
  const segScore = new Map<AnalysisRow, number>()
  if (strategy === 'segments') {
    const eligible = list.filter(r => r.excluded === null || r.excluded === 'coverage')
    let segmentsUsed = 0
    for (const cb of chosen) {
      const lines = scored.filter(i => symptoms[i].clipboardId === cb.id)
      if (!lines.length) continue
      segmentsUsed++
      const base = new Map<AnalysisRow, { c: number; d: number }>()
      for (const r of eligible) {
        let c = 0, d = 0
        for (const i of lines) if (r.grades[i] > 0) { c++; d += r.grades[i] }
        if (c) base.set(r, { c, d })
      }
      const ranked = [...base.keys()].sort((a, b) => base.get(b)!.c - base.get(a)!.c || base.get(b)!.d - base.get(a)!.d || tieChain(a, b))
      for (const r of ranked.slice(0, Math.max(0, params.segments.topK))) segScore.set(r, (segScore.get(r) ?? 0) + 1)
    }
    if (segmentsUsed < 2 || segmentsUsed > 6) notes.push(`Segments work best with 2–6 clipboards; ${segmentsUsed} selected clipboard${segmentsUsed === 1 ? ' has' : 's have'} scored symptoms.`)
  }

  // sort keys (§3), rounded for fractional strategies (§2.2)
  const keys = new Map<AnalysisRow, number[]>()
  for (const r of list) {
    const CI = r.weightedCoverage
    const P = r.points
    let k: number[]
    switch (strategy) {
      case 'sum-symptoms-degrees':
      case 'boenninghausen': r.score = CI; r.secondary = P; k = [CI, P]; break
      case 'sum-symptoms': r.score = CI; r.secondary = 0; k = [CI]; break
      case 'sum-degrees':
      case 'elimination': r.score = P; r.secondary = CI; k = [P, CI]; break
      case 'prominence': {
        let DI = 0
        for (const i of scored) DI += symptoms[i].weight * r.grades[i]
        r.score = P; r.secondary = CI; k = [P, CI, DI]; break
      }
      case 'polarity': {
        const pol = r.polarity!
        r.score = pol.pd; r.secondary = pol.ps; k = [r.contraindicated ? 0 : 1, pol.pd, pol.ps, pol.cov]; break
      }
      case 'segments': {
        const seg = segScore.get(r) ?? 0
        r.score = seg; r.secondary = P; k = [seg, P]; break
      }
      default: r.score = P; r.secondary = 0; k = [P]
    }
    r.score = key9(r.score) / 1e9
    r.secondary = key9(r.secondary) / 1e9
    keys.set(r, k.map(key9))
  }

  list.sort((a, b) => {
    const ka = keys.get(a)!, kb = keys.get(b)!
    for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return kb[j] - ka[j]
    return tieChain(a, b)
  })

  const shown = options.showExcluded ? list : list.filter(r => !r.excluded)
  let rank = 0
  for (const r of shown) if (!r.excluded) r.rank = ++rank
  const limit = Math.max(1, options.limit)
  let cut = shown.length
  if (rank > limit) {
    let n = 0
    for (let k = 0; k < shown.length; k++) if (!shown[k].excluded && ++n === limit) { cut = k + 1; break }
  }

  const quality = qualityLight(scored.map(i => symptoms[i].symptom.weight))
  let confidence: number | null = null
  if (strategy === 'composite') {
    const ranked = list.filter(r => !r.excluded)
    const s1 = ranked[0]?.score ?? 0
    const s2 = ranked[1]?.score ?? 0
    confidence = s1 > 0 ? (100 * (s1 - s2)) / s1 : 0
    if (scored.length) notes.push(`Confidence ${confidence.toFixed(0)} % (lead of the first remedy over the second). Case quality ${quality.light}: ${quality.reason}.`)
  }

  return {
    strategy, useIntensity, params, symptoms, rows: shown.slice(0, cut), all: shown, excludedRows: list.filter(r => r.excluded), total: rank,
    eliminated: excludedCounts.eliminative, excludedCounts, scoredCount: scored.length,
    quality: quality.light, confidence, polarLines, notes,
  }
}

/* ─── Family pseudo-remedy analysis (§4.16) ───────────────────────────────── */

export interface RemedyFamily {
  id: string
  label: string
  members: number[]
}

export interface FamilyAnalysis {
  /** Analysis over pseudo-remedies: row.remedyId is the 1-based index into `families`. */
  result: AnalysisResult
  families: RemedyFamily[]
  /** Family density per family index: members ranked in the top N of the remedy-level result. */
  density: number[]
  /** The remedy-level analysis the density was taken from. */
  remedyResult: AnalysisResult
}

/**
 * Run a strategy over families instead of remedies: g(F,s) = max over the members r of F of g(r,s),
 * and n is recomputed on the pseudo-remedies. The remedy filter and manual exclusions apply to the
 * members first. m_r is not known for a family, so the remedy-size factor is 1.
 */
export function analyzeFamilies(src: RubricSource, clipboards: Clipboard[], options: AnalysisOptions, families: RemedyFamily[], topN = 20): FamilyAnalysis {
  const allow = options.remedyFilter ? new Set(options.remedyFilter) : null
  const manual = new Set(options.excludedRemedies)
  const of = new Map<number, number[]>()
  families.forEach((f, k) => {
    for (const m of f.members) {
      if ((allow && !allow.has(m)) || manual.has(m)) continue
      const l = of.get(m)
      if (l) { if (!l.includes(k + 1)) l.push(k + 1) } else of.set(m, [k + 1])
    }
  })
  const toFamilies = (grades: Map<number, Grade>) => {
    const out = new Map<number, Grade>()
    for (const [rem, g] of grades) for (const f of of.get(rem) ?? []) if (g > (out.get(f) ?? 0)) out.set(f, g)
    return out
  }
  const remap: Remap = {
    line: col => {
      const same = col.grades === col.baseGrades
      col.baseGrades = toFamilies(col.baseGrades)
      col.grades = same ? col.baseGrades : toFamilies(col.grades)
      col.size = col.grades.size
    },
    grades: toFamilies,
  }
  const famSrc: RubricSource = {
    grades: ref => src.grades(ref), label: ref => src.label(ref), chapterClass: src.chapterClass?.bind(src),
    generalRubrics: src.generalRubrics?.bind(src), oppositeRubric: src.oppositeRubric?.bind(src),
    remedyName: id => families[id - 1]?.label ?? '',
  }
  const famOptions: AnalysisOptions = { ...options, remedyFilter: null, excludedRemedies: [], highlight: null }
  const result = analyzeCore(famSrc, clipboards, famOptions, remap)
  const remedyResult = analyze(src, clipboards, { ...options, limit: topN, showExcluded: false })
  const top = new Set(remedyResult.rows.filter(r => r.rank > 0 && r.rank <= topN).map(r => r.remedyId))
  const density = families.map(f => f.members.filter(m => top.has(m)).length)
  return { result, families, density, remedyResult }
}
