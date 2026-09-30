import type { Repertory } from '../../data/repertory'
import type { AnalysisResult } from '../../engine/analysis'

export const MAX_COMPARE = 10

export interface ChapterCoverage {
  chapter: string
  /** Scored case symptoms in this chapter. */
  total: number
  /** Per compared remedy: how many of them it covers. */
  covered: number[]
  /** Per compared remedy: sum of grades. */
  degrees: number[]
}

/** Case symptoms grouped by chapter, with coverage per remedy (in `remedies` order). */
export function caseChapterCoverage(result: AnalysisResult, remedies: number[], chapterOf: (ref: string) => string | null): ChapterCoverage[] {
  const byChapter = new Map<string, ChapterCoverage>()
  const rowOf = new Map(result.all.map(r => [r.remedyId, r]))
  result.symptoms.forEach((s, i) => {
    if (s.role !== 'scored') return
    const ch = chapterOf(s.symptom.rubrics[0] ?? '') ?? 'Unknown'
    let e = byChapter.get(ch)
    if (!e) { e = { chapter: ch, total: 0, covered: remedies.map(() => 0), degrees: remedies.map(() => 0) }; byChapter.set(ch, e) }
    e.total++
    remedies.forEach((id, k) => {
      const g = rowOf.get(id)?.grades[i] ?? s.grades.get(id) ?? 0
      if (g) { e!.covered[k]++; e!.degrees[k] += g }
    })
  })
  return [...byChapter.values()]
}

export interface Sphere {
  chapters: string[]
  /** counts[k][c]: rubrics of remedy k in chapter c. */
  counts: number[][]
  /** Total rubrics per remedy in the repertory. */
  totals: number[]
}

/** Sphere of action: rubric counts per chapter of a repertory for each remedy. */
export function sphereOfAction(rep: Pick<Repertory, 'size' | 'chapters' | 'chapterOf' | 'text' | 'forEachRemedy'>, remedies: number[]): Sphere {
  const index = new Map(remedies.map((id, k) => [id, k]))
  const nch = rep.chapters.length
  const counts = remedies.map(() => new Array<number>(nch).fill(0))
  const totals = remedies.map(() => 0)
  for (let i = 0; i < rep.size; i++) {
    const c = rep.chapterOf(i)
    rep.forEachRemedy(i, id => {
      const k = index.get(id)
      if (k !== undefined) { counts[k][c]++; totals[k]++ }
    })
  }
  return { chapters: rep.chapters.map(i => rep.text(i)), counts, totals }
}

/** Default remedies to compare: the given ones, else the top ranked (up to 4). */
export function initialCompare(result: AnalysisResult | null, initial?: number[]): number[] {
  const list = initial?.length ? initial : (result?.rows.filter(r => !r.excluded).slice(0, 4).map(r => r.remedyId) ?? [])
  return [...new Set(list)].slice(0, MAX_COMPARE)
}
