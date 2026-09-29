import type { Grade, RemedyEntry, RepertoryFile, RepertoryInfo, RubricRef } from './types'

/**
 * In-memory repertory with O(1) navigation. Rubric ids are indexes in book order,
 * so a chapter or subtree is a contiguous range [i, end(i)).
 */
export class Repertory {
  readonly info: RepertoryInfo
  readonly size: number
  readonly chapters: readonly number[]
  private readonly file: RepertoryFile
  private readonly subtreeEnd: Int32Array
  private readonly firstChild: Int32Array
  private readonly nextSibling: Int32Array
  private readonly childCount: Int32Array
  private lowerPaths: string[] | null = null

  constructor(info: RepertoryInfo, file: RepertoryFile) {
    this.info = info
    this.file = file
    this.size = file.text.length
    this.chapters = file.chapters
    const n = this.size
    this.subtreeEnd = new Int32Array(n)
    this.firstChild = new Int32Array(n).fill(-1)
    this.nextSibling = new Int32Array(n).fill(-1)
    this.childCount = new Int32Array(n)
    const lastChild = new Int32Array(n).fill(-1)
    for (let i = 0; i < n; i++) {
      const p = file.parent[i]
      if (p >= 0) {
        if (lastChild[p] < 0) this.firstChild[p] = i
        else this.nextSibling[lastChild[p]] = i
        lastChild[p] = i
        this.childCount[p]++
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      let end = i + 1
      for (let c = this.firstChild[i]; c >= 0; c = this.nextSibling[c]) end = Math.max(end, this.subtreeEnd[c])
      this.subtreeEnd[i] = end
    }
  }

  get abbrev() { return this.info.abbrev }

  ref(i: number): RubricRef { return `${this.info.abbrev}:${i}` }
  text(i: number) { return this.file.text[i] }
  parent(i: number) { return this.file.parent[i] }
  depth(i: number) { return this.file.depth[i] }
  chapterOf(i: number) { return this.file.chapter[i] }
  chapterRoot(i: number) { return this.chapters[this.file.chapter[i]] }
  subtreeEndOf(i: number) { return this.subtreeEnd[i] }
  childCountOf(i: number) { return this.childCount[i] }
  remedyCount(i: number) { return this.file.offsets[i + 1] - this.file.offsets[i] }

  children(i: number): number[] {
    const out: number[] = []
    for (let c = this.firstChild[i]; c >= 0; c = this.nextSibling[c]) out.push(c)
    return out
  }

  /** Ancestors from chapter root down to i (inclusive). */
  lineage(i: number): number[] {
    const out: number[] = []
    for (let r = i; r >= 0; r = this.file.parent[r]) out.push(r)
    return out.reverse()
  }

  path(i: number, sep = ' - '): string {
    return this.lineage(i).map(r => this.file.text[r]).join(sep)
  }

  /** Remedies sorted by grade desc, then remedy id. */
  remedies(i: number): RemedyEntry[] {
    const { offsets, data } = this.file
    const out: RemedyEntry[] = []
    for (let k = offsets[i]; k < offsets[i + 1]; k++) out.push({ remedyId: data[k] >> 2, grade: ((data[k] & 3) + 1) as Grade })
    return out
  }

  /** Iterate raw entries without allocation. */
  forEachRemedy(i: number, fn: (remedyId: number, grade: Grade) => void) {
    const { offsets, data } = this.file
    for (let k = offsets[i]; k < offsets[i + 1]; k++) fn(data[k] >> 2, ((data[k] & 3) + 1) as Grade)
  }

  gradeOf(i: number, remedyId: number): Grade | 0 {
    const { offsets, data } = this.file
    for (let k = offsets[i]; k < offsets[i + 1]; k++) if (data[k] >> 2 === remedyId) return ((data[k] & 3) + 1) as Grade
    return 0
  }

  /** Lower-cased full paths, built lazily for search. */
  lowerPath(i: number): string {
    if (!this.lowerPaths) {
      const lp: string[] = new Array(this.size)
      for (let k = 0; k < this.size; k++) {
        const p = this.file.parent[k]
        lp[k] = (p >= 0 ? lp[p] + ', ' : '') + this.file.text[k].toLowerCase()
      }
      this.lowerPaths = lp
    }
    return this.lowerPaths[i]
  }
}
