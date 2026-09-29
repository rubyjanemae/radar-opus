import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { Grade, RubricRef } from '../../data/types'
import { classifyChapter, isGeneralitiesChapter } from '../../engine/analysis'
import type { ChapterClass, RemedyStats, RubricSource } from '../../engine/analysis'

/**
 * RubricSource over the Catalog. Loaded repertories are immutable, so every lookup is
 * cached for the lifetime of the source: grade maps and labels per rubric, chapter
 * classes per repertory chapter and remedy rubric counts per repertory.
 */
export class CatalogSource implements RubricSource {
  private readonly catalog: Catalog
  private readonly gradeCache = new Map<RubricRef, Map<number, Grade>>()
  private readonly labelCache = new Map<RubricRef, string>()
  private readonly classCache = new Map<string, ChapterClass>()
  private readonly statsCache = new Map<string, RemedyStats | null>()
  private readonly generalIndex = new Map<string, { chapter: number; byPath: Map<string, number> } | null>()
  private readonly generalCache = new Map<RubricRef, RubricRef[]>()

  constructor(catalog: Catalog) { this.catalog = catalog }

  private locate(ref: RubricRef): { rep: Repertory; index: number } | null {
    return this.catalog.resolve(ref)
  }

  grades(ref: RubricRef): Map<number, Grade> | null {
    const hit = this.gradeCache.get(ref)
    if (hit) return hit
    const r = this.locate(ref)
    if (!r) return null
    const m = new Map<number, Grade>()
    r.rep.forEachRemedy(r.index, (id, g) => { m.set(id, g) })
    this.gradeCache.set(ref, m)
    return m
  }

  /** "CHAPTER - sub, sub" (chapter upper-cased); the raw ref when the repertory is not loaded. */
  label(ref: RubricRef): string {
    const hit = this.labelCache.get(ref)
    if (hit) return hit
    const r = this.locate(ref)
    if (!r) return ref
    const [root, ...below] = r.rep.lineage(r.index)
    const chapter = r.rep.text(root).toUpperCase()
    const text = below.length ? `${chapter} - ${below.map(i => r.rep.text(i)).join(', ')}` : chapter
    this.labelCache.set(ref, text)
    return text
  }

  /** Chapter name of a rubric (as printed). */
  chapter(ref: RubricRef): string | null {
    const r = this.locate(ref)
    return r ? r.rep.text(r.rep.chapterRoot(r.index)) : null
  }

  chapterClass(ref: RubricRef): ChapterClass {
    const r = this.locate(ref)
    if (!r) return 'particular'
    const key = `${r.rep.abbrev}:${r.rep.chapterOf(r.index)}`
    let c = this.classCache.get(key)
    if (!c) { c = classifyChapter(r.rep.text(r.rep.chapterRoot(r.index))); this.classCache.set(key, c) }
    return c
  }

  remedyStats(repertory: string): RemedyStats | null {
    if (this.statsCache.has(repertory)) return this.statsCache.get(repertory)!
    const rep = this.catalog.repertory(repertory)
    if (!rep) return null
    const stats = computeRemedyStats(rep)
    this.statsCache.set(repertory, stats)
    return stats
  }

  remedyName(id: number): string { return this.catalog.remedy(id).abbrev }

  /**
   * Bönninghausen generalisation links (scoring-spec §4.12): the Generalities rubric whose
   * path equals the longest tail of this rubric's path below its chapter. For example
   * "HEAD - pain - morning" links to "GENERALITIES - morning", "VERTIGO - air - open" to
   * "GENERALITIES - air, open". Mind rubrics and rubrics already in Generalities have none.
   */
  generalRubrics(ref: RubricRef): RubricRef[] {
    const hit = this.generalCache.get(ref)
    if (hit) return hit
    const r = this.locate(ref)
    let out: RubricRef[] = []
    if (r) {
      const idx = this.generalsOf(r.rep)
      if (idx && r.rep.chapterOf(r.index) !== idx.chapter && this.chapterClass(ref) !== 'mental') {
        const tail = r.rep.lineage(r.index).slice(1).map(i => normalise(r.rep.text(i)))
        for (let k = 0; k < tail.length; k++) {
          const g = idx.byPath.get(tail.slice(k).join('|'))
          if (g !== undefined) { out = [r.rep.ref(g)]; break }
        }
      }
    }
    this.generalCache.set(ref, out)
    return out
  }

  private generalsOf(rep: Repertory) {
    if (this.generalIndex.has(rep.abbrev)) return this.generalIndex.get(rep.abbrev)!
    let res: { chapter: number; byPath: Map<string, number> } | null = null
    const root = rep.chapters.find(c => isGeneralitiesChapter(rep.text(c)))
    if (root !== undefined) {
      const byPath = new Map<string, number>()
      const path = new Map<number, string>([[root, '']])
      for (let i = root + 1; i < rep.subtreeEndOf(root); i++) {
        const parent = path.get(rep.parent(i)) ?? ''
        const p = parent ? `${parent}|${normalise(rep.text(i))}` : normalise(rep.text(i))
        path.set(i, p)
        if (!byPath.has(p)) byPath.set(p, i)
      }
      res = { chapter: rep.chapterOf(root), byPath }
    }
    this.generalIndex.set(rep.abbrev, res)
    return res
  }
}

const normalise = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')

/** Count, for every remedy, the rubrics it appears in. */
export function computeRemedyStats(rep: Pick<Repertory, 'size' | 'forEachRemedy'>): RemedyStats {
  let counts = new Int32Array(4096)
  for (let i = 0; i < rep.size; i++) {
    rep.forEachRemedy(i, id => {
      if (id >= counts.length) { const n = new Int32Array(Math.max(id + 1, counts.length * 2)); n.set(counts); counts = n }
      counts[id]++
    })
  }
  let max = 0
  for (let k = 0; k < counts.length; k++) if (counts[k] > max) max = counts[k]
  const c = counts
  return { max, count: id => (id >= 0 && id < c.length ? c[id] : 0) }
}

const sources = new WeakMap<Catalog, CatalogSource>()

/** One shared cached source per catalog. */
export function sourceFor(catalog: Catalog): CatalogSource {
  let s = sources.get(catalog)
  if (!s) { s = new CatalogSource(catalog); sources.set(catalog, s) }
  return s
}
