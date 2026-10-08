import type { Repertory } from '../../data/repertory'
import { remedyIndex } from '../mm/remedyIndex'

export interface RubricStat {
  /** Rubrics the remedy appears in. */
  total: number
  /** Rubrics at grade 3 or 4 (bold). */
  high: number
}

const cache = new WeakMap<Repertory, Map<number, RubricStat>>()

/** Rubric counts of a remedy in a repertory (index built once per repertory, results cached). */
export function rubricStat(rep: Repertory, remedyId: number): RubricStat {
  let m = cache.get(rep)
  if (!m) cache.set(rep, (m = new Map()))
  let s = m.get(remedyId)
  if (!s) {
    const idx = remedyIndex(rep)
    let high = 0
    const entries = idx.entries(remedyId)
    for (const e of entries) if (e.grade >= 3) high++
    s = { total: entries.length, high }
    m.set(remedyId, s)
  }
  return s
}
