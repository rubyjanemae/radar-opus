import type { Repertory } from '../../data/repertory'
import type { Grade } from '../../data/types'

/**
 * Remedy → rubric index for one repertory, built lazily on first use (one pass over all
 * entries, ~1M for publicum) and cached per repertory. Stored as CSR arrays so a remedy's
 * rubrics are a contiguous slice in book order.
 */
export class RemedyIndex {
  readonly rep: Repertory
  private readonly start: Int32Array
  private readonly rubrics: Int32Array
  private readonly grades: Uint8Array
  private readonly statsCache = new Map<number, RemedyStats>()
  /** Highest grade used in this repertory (Kent: 3, some books: 4). */
  readonly maxGrade: Grade

  constructor(rep: Repertory) {
    this.rep = rep
    let maxId = 0, total = 0, maxGrade = 1
    for (let i = 0; i < rep.size; i++) rep.forEachRemedy(i, (id, g) => { if (id > maxId) maxId = id; if (g > maxGrade) maxGrade = g; total++ })
    const count = new Int32Array(maxId + 2)
    for (let i = 0; i < rep.size; i++) rep.forEachRemedy(i, id => { count[id + 1]++ })
    for (let k = 1; k < count.length; k++) count[k] += count[k - 1]
    this.start = count
    this.rubrics = new Int32Array(total)
    this.grades = new Uint8Array(total)
    const fill = count.slice(0, maxId + 1)
    for (let i = 0; i < rep.size; i++) rep.forEachRemedy(i, (id, g) => { const p = fill[id]++; this.rubrics[p] = i; this.grades[p] = g })
    this.maxGrade = maxGrade as Grade
  }

  rubricCount(remedyId: number): number {
    if (remedyId < 0 || remedyId + 1 >= this.start.length) return 0
    return this.start[remedyId + 1] - this.start[remedyId]
  }

  /** Rubrics of a remedy in book order with their grades. */
  entries(remedyId: number): { rubric: number; grade: Grade }[] {
    const out: { rubric: number; grade: Grade }[] = []
    if (remedyId < 0 || remedyId + 1 >= this.start.length) return out
    for (let p = this.start[remedyId]; p < this.start[remedyId + 1]; p++) out.push({ rubric: this.rubrics[p], grade: this.grades[p] as Grade })
    return out
  }

  stats(remedyId: number): RemedyStats {
    let s = this.statsCache.get(remedyId)
    if (!s) { s = computeStats(this, remedyId); this.statsCache.set(remedyId, s) }
    return s
  }
}

export interface ChapterShare {
  /** Chapter number (index into rep.chapters). */
  chapter: number
  root: number
  name: string
  count: number
  /** Rubrics in the chapter. */
  size: number
}

export interface KeynoteRubric { rubric: number; grade: Grade; size: number }

export interface RemedyStats {
  rubricCount: number
  /** grades[g - 1] = rubrics at grade g */
  grades: [number, number, number, number]
  /** Chapters by count, descending. */
  chapters: ChapterShare[]
  /**
   * Characteristic rubrics: the remedy at its top grades (grade ≥ min(3, maxGrade)), smallest
   * rubrics first, then deepest. Chapter roots are skipped.
   */
  keynotes: KeynoteRubric[]
  keynoteMinGrade: Grade
}

function computeStats(idx: RemedyIndex, remedyId: number): RemedyStats {
  const rep = idx.rep
  const grades: [number, number, number, number] = [0, 0, 0, 0]
  const perChapter = new Map<number, number>()
  const entries = idx.entries(remedyId)
  const minGrade = Math.min(3, idx.maxGrade) as Grade
  const keynotes: KeynoteRubric[] = []
  for (const { rubric, grade } of entries) {
    grades[grade - 1]++
    const ch = rep.chapterOf(rubric)
    perChapter.set(ch, (perChapter.get(ch) ?? 0) + 1)
    if (grade >= minGrade && rep.parent(rubric) >= 0) keynotes.push({ rubric, grade, size: rep.remedyCount(rubric) })
  }
  keynotes.sort((a, b) => a.size - b.size || b.grade - a.grade || rep.depth(b.rubric) - rep.depth(a.rubric) || a.rubric - b.rubric)
  const chapters: ChapterShare[] = [...perChapter].map(([chapter, count]) => {
    const root = rep.chapters[chapter]
    return { chapter, root, name: rep.text(root), count, size: rep.subtreeEndOf(root) - root }
  }).sort((a, b) => b.count - a.count || a.chapter - b.chapter)
  return { rubricCount: entries.length, grades, chapters, keynotes, keynoteMinGrade: minGrade }
}

const cache = new WeakMap<Repertory, RemedyIndex>()

/** The (cached) remedy index of a repertory. */
export function remedyIndex(rep: Repertory): RemedyIndex {
  let idx = cache.get(rep)
  if (!idx) { idx = new RemedyIndex(rep); cache.set(rep, idx) }
  return idx
}
