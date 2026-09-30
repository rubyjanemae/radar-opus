import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { Grade } from '../../data/types'
import { bookAbbrev } from './take'

/** Alphabetical rank of every remedy id (book order of remedies within a rubric). */
const rankCache = new WeakMap<Catalog, Map<number, number>>()
export function remedyRank(catalog: Catalog): Map<number, number> {
  let r = rankCache.get(catalog)
  if (!r) {
    const list = [...catalog.remedies.values()].sort((a, b) => a.abbrev.toLowerCase().localeCompare(b.abbrev.toLowerCase()))
    r = new Map(list.map((x, i) => [x.id, i]))
    rankCache.set(catalog, r)
  }
  return r
}

export type RemedyItem = { id: number; grade: Grade }
/** Remedies of each rubric in alphabetical order, sorted once per rubric per repertory. */
const alphaCache = new WeakMap<Repertory, Map<number, RemedyItem[]>>()
export function alphaRemedies(rep: Repertory, catalog: Catalog, i: number): readonly RemedyItem[] {
  let m = alphaCache.get(rep)
  if (!m) { m = new Map(); alphaCache.set(rep, m) }
  let list = m.get(i)
  if (!list) {
    const rank = remedyRank(catalog)
    const out: RemedyItem[] = []
    rep.forEachRemedy(i, (id, grade) => out.push({ id, grade }))
    list = out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    m.set(i, list)
  }
  return list
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
export const GRADE_WORD = ['', 'grade 1', 'grade 2', 'grade 3', 'grade 4']

/** A rubric's remedy list as book markup, and how many remedies it shows. */
export interface RemedyMarkup { html: string; shown: number }

const markupCache = new WeakMap<Repertory, Map<number, RemedyMarkup>>()
const MAX_MARKUP = 4000

/**
 * The remedy list of rubric i as static markup (one span per remedy, grade in its class: italic,
 * bold, capitals), cached per rubric, style and minimum grade. A long rubric has hundreds of
 * remedies: one string set as innerHTML is far cheaper than hundreds of React elements, and an
 * unchanged row keeps its DOM when it re-renders.
 *
 * No hidden "grade N" words: the row is a listbox option, whose children are presentational (its
 * name is the concise rubric label), so they were never spoken. Screen reader and keyboard users
 * get each remedy with its grade from the rubric's Remedies menu (Alt+R, or the context menu).
 */
export function remedyMarkup(rep: Repertory, catalog: Catalog, i: number, names: boolean, minGrade: number): RemedyMarkup {
  let m = markupCache.get(rep)
  if (!m) { m = new Map(); markupCache.set(rep, m) }
  const key = i * 8 + (names ? 4 : 0) + minGrade
  let hit = m.get(key)
  if (hit) return hit
  const parts: string[] = []
  for (const r of alphaRemedies(rep, catalog, i)) {
    if (r.grade < minGrade) continue
    const rem = catalog.remedy(r.id)
    const text = esc(names ? rem.name : bookAbbrev(rem.abbrev, r.grade))
    parts.push(`<span class="rv-rem g${r.grade}" data-rid="${r.id}" data-grade="${r.grade}">${text}</span>`)
  }
  hit = { html: parts.join(names ? ', ' : ' '), shown: parts.length }
  m.set(key, hit)
  if (m.size > MAX_MARKUP) m.delete(m.keys().next().value!)
  return hit
}
