import type { RubricRef } from '../data/types'

/** Symptom intensity chosen by the practitioner (Radar: x1..x4); 0 ignores the symptom in analysis. */
export type Weight = 0 | 1 | 2 | 3 | 4

/** A case symptom: one rubric, or several rubrics combined into one symptom. */
export interface Symptom {
  id: string
  /** Single rubric, or 2+ rubrics when combined. */
  rubrics: RubricRef[]
  /** How combined rubrics merge: union keeps every remedy (max grade), intersection keeps only shared remedies (min grade). */
  combine: 'union' | 'intersection'
  weight: Weight
  /** Eliminative: only remedies present in this symptom stay in the result. */
  eliminatory: boolean
  /** Excluding ("exclusive"): every remedy present in this symptom is removed from the result. */
  exclusive: boolean
  /** Group letter a–z: symptoms sharing a letter are calculated as one symptom (max grade). */
  group: string | null
  /** Counts as a causation / never-well-since symptom (shown with a marker, optional extra weighting). */
  causal: boolean
  label?: string
  note?: string
  addedAt: number
}

export interface Clipboard {
  id: string
  name: string
  color: string
  symptoms: Symptom[]
}

export type StrategyId =
  | 'sum-symptoms-degrees'
  | 'sum-degrees'
  | 'sum-symptoms'
  | 'weighted'
  | 'small-rubrics'
  /** Small remedies only: DI × f(r) (spec `smallRemedies`). */
  | 'remedy-size'
  /** Small rubrics + small remedies (spec `smallBoth`; id kept for saved cases). */
  | 'small-remedies'
  | 'kent'
  | 'boenninghausen'
  | 'elimination'

export interface AnalysisOptions {
  strategy: StrategyId
  clipboardIds: string[]
  /** Restrict remedies to these ids (families/kingdoms filter); null = all remedies. */
  remedyFilter: number[] | null
  /** Exclude these remedies (e.g. already prescribed). */
  excludedRemedies: number[]
  /** Minimum symptoms a remedy must cover. */
  minCoverage: number
  /** Number of remedies shown. */
  limit: number
  /** Use symptom intensity (x1..x4) in the score; when false every scored symptom counts x1. Default true. */
  useIntensity?: boolean
  /** Keep excluded remedies in their sorted position (greyed, unranked) instead of hiding them. Default false. */
  showExcluded?: boolean
  /** Remedies to highlight in the result (family highlight); display only, does not change scores. */
  highlight?: number[] | null
  /** Human label for `remedyFilter` (e.g. "Solanaceae"), shown in the analysis toolbar. */
  filterLabel?: string | null
  /** Human label for `highlight`. */
  highlightLabel?: string | null
  /** Family group ids `remedyFilter` was built from (families feature), so its dialog can reopen the selection. */
  filterGroups?: string[] | null
  /** Family group ids `highlight` was built from. */
  highlightGroups?: string[] | null
  /** Strategy parameters (scoring-spec §6); missing values use DEFAULT_PARAMS. */
  params?: StrategyParamsPatch
}

/** Strategy parameters, scoring-spec §6. */
export interface StrategyParams {
  /** f_s = factor when n_s ≤ threshold, else 1. */
  smallRubrics: { threshold: number; factor: number }
  /** f(r) = clamp((mRef / m_r)^alpha, fMin, fMax). */
  smallRemedies: { mRef: number; alpha: number; fMin: number; fMax: number }
  /** κ per symptom category (Kent preset). */
  kent: { weights: { srp: number; mental: number; general: number; particular: number } }
}

export type StrategyParamsPatch = { [K in keyof StrategyParams]?: Partial<StrategyParams[K]> }

export const DEFAULT_PARAMS: StrategyParams = {
  smallRubrics: { threshold: 10, factor: 2 },
  smallRemedies: { mRef: 1000, alpha: 0.5, fMin: 0.5, fMax: 4 },
  kent: { weights: { srp: 4, mental: 3, general: 2, particular: 1 } },
}
