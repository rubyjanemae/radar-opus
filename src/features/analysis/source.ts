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
  private readonly oppositeCache = new Map<RubricRef, RubricRef | null>()

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

  /** m_r per remedy under the view (grades ≥ minGrade), computed once per repertory and view. */
  remedyStats(repertory: string, minGrade = 1): RemedyStats | null {
    const key = minGrade > 1 ? `${repertory}|${minGrade}` : repertory
    if (this.statsCache.has(key)) return this.statsCache.get(key)!
    const rep = this.catalog.repertory(repertory)
    if (!rep) return null
    const stats = computeRemedyStats(rep, minGrade)
    this.statsCache.set(key, stats)
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

  /**
   * Polar opposite of a rubric for polarity analysis (scoring-spec §4.13), looked up among its
   * siblings: a polar word swapped ("… agg." ↔ "… amel.", "schlechter" ↔ "besser", "desire" ↔
   * "aversion") or "X" ↔ "X, amel.". A bare "amel." sub-rubric is not paired with its parent: the
   * parent may be a symptom ("weeping") rather than a modality. Null when there is no counterpart.
   */
  oppositeRubric(ref: RubricRef): RubricRef | null {
    if (this.oppositeCache.has(ref)) return this.oppositeCache.get(ref)!
    const r = this.locate(ref)
    const out = r ? findOpposite(r.rep, r.index) : null
    const hit = out === null ? null : r!.rep.ref(out)
    this.oppositeCache.set(ref, hit)
    return hit
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

/** Polar word pairs of the bundled repertories (English Publicum, German Kent). */
const POLES: [string, string][] = [['agg.', 'amel.'], ['schlechter', 'besser'], ['desire', 'aversion'], ['Verlangen', 'Abneigung']]
const POLE_RES = POLES.flatMap(([a, b]) => [[a, b], [b, a]]).map(([from, to]) => ({ re: new RegExp(`(^|[\\s,])${from.replace('.', '\\.')}(?=$|[\\s,])`), to }))
const AMEL_SUFFIX = /^(.+?),?\s+amel\.$/

/** Sibling index of the polar opposite of rubric i, or null. */
export function findOpposite(rep: Pick<Repertory, 'parent' | 'children' | 'text'>, i: number): number | null {
  const p = rep.parent(i)
  if (p < 0) return null
  const text = rep.text(i)
  const siblings = rep.children(p)
  const find = (t: string) => siblings.find(k => k !== i && rep.text(k) === t)
  for (const { re, to } of POLE_RES) {
    if (!re.test(text)) continue
    const k = find(text.replace(re, `$1${to}`))
    if (k !== undefined) return k
  }
  const m = AMEL_SUFFIX.exec(text)
  if (m) { const k = find(m[1]); if (k !== undefined) return k }
  else {
    const k = siblings.find(s => s !== i && AMEL_SUFFIX.exec(rep.text(s))?.[1] === text)
    if (k !== undefined) return k
  }
  return null
}

/** Count, for every remedy, the rubrics it appears in (at grade ≥ minGrade: the repertory view). */
export function computeRemedyStats(rep: Pick<Repertory, 'size' | 'forEachRemedy'>, minGrade = 1): RemedyStats {
  let counts = new Int32Array(4096)
  for (let i = 0; i < rep.size; i++) {
    rep.forEachRemedy(i, (id, g) => {
      if (g < minGrade) return
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
