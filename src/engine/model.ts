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
  /** Remedy must appear in this symptom to stay in the result. */
  eliminatory: boolean
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
}
