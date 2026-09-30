import type { Catalog } from '../../data/catalog'
import type { RubricRef } from '../../data/types'
import type { Symptom } from '../../engine/model'
import { parseRef } from '../../data/catalog'

export interface RubricLabel {
  repertory: string
  loaded: boolean
  /** The repertory is known but its book has not arrived yet (show a loading state, not the raw ref). */
  loading: boolean
  /** Title of the repertory, for loading and error text. */
  repertoryTitle: string
  /** Chapter name (shown in caps). */
  chapter: string
  /** Path below the chapter. */
  rest: string
  /** The rubric's own text (last path segment; the chapter in caps for a chapter rubric). */
  leaf: string
  full: string
}

export function rubricLabel(catalog: Catalog, ref: RubricRef): RubricLabel {
  const { repertory, index } = parseRef(ref)
  const r = catalog.resolve(ref)
  if (!r) {
    const info = catalog.repertoryInfos.find(i => i.abbrev === repertory)
    return { repertory, loaded: false, loading: !!info, repertoryTitle: info?.title ?? repertory, chapter: repertory, rest: `rubric ${index}`, leaf: ref, full: ref }
  }
  const [root, ...below] = r.rep.lineage(r.index)
  const chapter = r.rep.text(root)
  const rest = below.map(i => r.rep.text(i)).join(', ')
  const leaf = below.length ? r.rep.text(below[below.length - 1]) : chapter.toUpperCase()
  return { repertory, loaded: true, loading: false, repertoryTitle: r.rep.info.title, chapter, rest, leaf, full: rest ? `${chapter.toUpperCase()} - ${rest}` : chapter.toUpperCase() }
}

export interface SymptomLabel {
  /** One line: the symptom's own label, else the rubrics' last path segments joined with the operator. */
  short: string
  /** The symptom's own label, else the full rubric labels joined with ' ∪ ' / ' ∩ ' (as the analysis shows it). */
  full: string
  parts: RubricLabel[]
}

/** The operator a combined symptom's rubrics are joined with (matches the analysis rows). */
export const combineJoiner = (s: Pick<Symptom, 'combine'>) => (s.combine === 'intersection' ? ' ∩ ' : ' ∪ ')

export function symptomLabel(catalog: Catalog, symptom: Pick<Symptom, 'rubrics' | 'combine' | 'label'>): SymptomLabel {
  const parts = symptom.rubrics.map(r => rubricLabel(catalog, r))
  const own = symptom.label
  const join = combineJoiner(symptom)
  const full = own || parts.map(p => p.full).join(join)
  const short = own || (parts.length === 1 ? parts[0].full : parts.map(p => p.leaf).join(join))
  return { short, full, parts }
}
