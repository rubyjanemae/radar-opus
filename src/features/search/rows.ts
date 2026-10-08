import type { Repertory } from '../../data/repertory'
import type { Grade, RubricRef } from '../../data/types'
import { remedyRubrics } from './engine'
import type { RemedySearchOptions, SearchHit, Target } from './engine'

/**
 * Result rows of the search view, independent of React: rubric hits, optionally grouped under
 * chapter headers (remedy search), filtering by a co-remedy and cursor movement that skips headers.
 */

export type HitRow = { t: 'hit'; rep: Repertory; index: number; grade?: Grade; size?: number; co?: number }
export type HeadRow = { t: 'head'; rep: Repertory; root: number; count: number }
export type Row = HitRow | HeadRow

export const rowRef = (r: HitRow): RubricRef => r.rep.ref(r.index)

/** Text search: one row per hit, no headers. */
export function textRows(hits: readonly Pick<SearchHit, 'rep' | 'index'>[]): Row[] {
  return hits.map(h => ({ t: 'hit', rep: h.rep, index: h.index }))
}

export type RemedyFilters = Pick<RemedySearchOptions, 'minGrade' | 'maxSize' | 'maxCo'>

/**
 * Remedy search: the remedy's rubrics in every target, in book order, under a header per
 * chapter (per repertory when there are several). Reads the remedy's slice of the remedy index.
 */
export function remedyRows(targets: readonly Target[], remedyId: number, f: RemedyFilters): { rows: Row[]; count: number } {
  const rows: Row[] = []
  let count = 0
  for (const t of targets) {
    const hits = remedyRubrics(t.rep, remedyId, { minGrade: f.minGrade, maxSize: f.maxSize, maxCo: f.maxCo, start: t.start, end: t.end })
    let head: HeadRow | null = null
    for (const h of hits) {
      const root = t.rep.chapterRoot(h.index)
      if (!head || head.root !== root) { head = { t: 'head', rep: t.rep, root, count: 0 }; rows.push(head) }
      head.count++
      rows.push({ t: 'hit', rep: t.rep, index: h.index, grade: h.grade, size: h.size, co: h.co })
    }
    count += hits.length
  }
  return { rows, count }
}

/** Keep only rubrics that also contain `remedyId`; headers are kept (with new counts) when they keep a hit. */
export function filterByRemedy(rows: readonly Row[], remedyId: number | null): readonly Row[] {
  if (remedyId == null) return rows
  const out: Row[] = []
  let head: HeadRow | null = null
  let pushed = false
  for (const r of rows) {
    if (r.t === 'head') { head = { ...r, count: 0 }; pushed = false; continue }
    if (r.rep.gradeOf(r.index, remedyId) > 0) {
      if (head) { if (!pushed) { out.push(head); pushed = true } head.count++ }
      out.push(r)
    }
  }
  return out
}

export function hitRows(rows: readonly Row[]): HitRow[] {
  return rows.filter((r): r is HitRow => r.t === 'hit')
}

export function firstHit(rows: readonly Row[]): number {
  return rows.findIndex(r => r.t === 'hit')
}

/**
 * Where the cursor lands when moving from `cur` towards `target`: clamped to the list and
 * skipping chapter headers in the direction of travel; stays at `cur` when only headers remain.
 */
export function stepCursor(rows: readonly Row[], cur: number, target: number): number {
  if (!rows.length) return 0
  let k = Math.max(0, Math.min(rows.length - 1, target))
  const dir = target >= cur ? 1 : -1
  while (rows[k]?.t === 'head' && k + dir >= 0 && k + dir < rows.length) k += dir
  if (rows[k]?.t === 'head') {
    // at the end of the list in this direction: try the other way before giving up
    let j = k
    while (rows[j]?.t === 'head' && j - dir >= 0 && j - dir < rows.length) j -= dir
    return rows[j]?.t === 'hit' ? j : cur
  }
  return k
}

/** Refs of the hit rows between two row indexes (inclusive, either order). */
export function refsBetween(rows: readonly Row[], a: number, b: number): RubricRef[] {
  const [lo, hi] = a < b ? [a, b] : [b, a]
  const out: RubricRef[] = []
  for (let i = lo; i <= hi; i++) { const r = rows[i]; if (r?.t === 'hit') out.push(rowRef(r)) }
  return out
}
