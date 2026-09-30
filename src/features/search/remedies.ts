import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { Remedy } from '../../data/types'
import { fold } from './text'

interface Entry { remedy: Remedy; abbrev: string; name: string; alt: string; words: string[] }

const cache = new WeakMap<Catalog, Entry[]>()

function entries(catalog: Catalog): Entry[] {
  let list = cache.get(catalog)
  if (!list) {
    list = [...catalog.remedies.values()].map(r => {
      const name = fold(r.name)
      const alt = fold((r.altName ?? '').replace(/[{}"]/g, ' '))
      return { remedy: r, abbrev: fold(r.abbrev), name, alt, words: `${name} ${alt}`.split(/[^\p{L}\p{N}]+/u).filter(Boolean) }
    })
    cache.set(catalog, list)
  }
  return list
}

const repCounts = new WeakMap<object, Map<number, number>>()
const partial = new WeakMap<object, { next: number; counts: Map<number, number> }>()

/** Count each remedy's rubrics in one repertory, until `deadline()` says stop; true when done. */
function countRemedies(rep: Repertory, deadline?: () => boolean): boolean {
  if (repCounts.has(rep)) return true
  let st = partial.get(rep)
  if (!st) { st = { next: 0, counts: new Map() }; partial.set(rep, st) }
  const c = st.counts
  const add = (id: number) => c.set(id, (c.get(id) ?? 0) + 1)
  while (st.next < rep.size) {
    const end = Math.min(rep.size, st.next + 4096)
    for (let i = st.next; i < end; i++) rep.forEachRemedy(i, add)
    st.next = end
    if (end < rep.size && deadline?.()) return false
  }
  repCounts.set(rep, c)
  partial.delete(rep)
  return true
}

type IdleDeadlineLike = { timeRemaining(): number; didTimeout: boolean }
type IdleGlobal = { requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, o?: { timeout: number }) => number }

/** Precount a freshly loaded repertory's remedies in idle slices, so the first remedy lookup (QuickFind, F5) is instant. */
export function warmRemedyPopularity(rep: Repertory): void {
  const ric = (globalThis as IdleGlobal).requestIdleCallback
  if (!ric) return
  const step = (d: IdleDeadlineLike) => {
    const t0 = performance.now()
    if (!countRemedies(rep, () => performance.now() - t0 > 12 || (!d.didTimeout && d.timeRemaining() < 2))) ric(step, { timeout: 3000 })
  }
  ric(step, { timeout: 3000 })
}

/** How many rubrics each remedy appears in across the loaded repertories (for tie-breaking). */
function popularity(catalog: Catalog): Map<number, number> {
  const total = new Map<number, number>()
  for (const info of catalog.repertoryInfos) {
    const rep = catalog.repertory(info.abbrev)
    if (!rep) continue
    countRemedies(rep)
    for (const [id, n] of repCounts.get(rep)!) total.set(id, (total.get(id) ?? 0) + n)
  }
  return total
}

export interface RemedyMatch { remedy: Remedy; score: number; field: 'abbrev' | 'name' | 'alt' }

/**
 * Find remedies by abbreviation, name or alternative name. Ranking: exact abbreviation,
 * abbreviation prefix, name prefix, word prefix, then substring.
 */
export function findRemedies(catalog: Catalog, query: string, limit = 20): RemedyMatch[] {
  const q = fold(query.trim()).replace(/\.$/, '')
  if (!q) return []
  const out: RemedyMatch[] = []
  for (const e of entries(catalog)) {
    let score = 0
    let field: RemedyMatch['field'] = 'abbrev'
    if (e.abbrev === q) score = 100
    else if (e.name === q) { score = 95; field = 'name' }
    else if (e.abbrev.startsWith(q)) score = 80 - Math.min(10, e.abbrev.length - q.length)
    else if (e.name.startsWith(q)) { score = 70 - Math.min(10, (e.name.length - q.length) / 4); field = 'name' }
    else if (e.words.some(w => w.startsWith(q))) { score = 55; field = e.name.includes(q) ? 'name' : 'alt' }
    else if (q.length >= 3 && e.name.includes(q)) { score = 40; field = 'name' }
    else if (q.length >= 3 && e.alt.includes(q)) { score = 30; field = 'alt' }
    if (score) out.push({ remedy: e.remedy, score, field })
  }
  // well-represented remedies (polychrests) win ties and near-ties
  const pop = out.length > 1 ? popularity(catalog) : null
  const boost = (id: number) => (pop ? Math.min(6, Math.log10(1 + (pop.get(id) ?? 0)) * 1.5) : 0)
  for (const m of out) m.score += boost(m.remedy.id)
  out.sort((a, b) => b.score - a.score || a.remedy.abbrev.length - b.remedy.abbrev.length || a.remedy.abbrev.localeCompare(b.remedy.abbrev))
  return out.slice(0, limit)
}

/** Resolve a query token ("lach", "Lachesis") to one remedy id, or null. */
export function resolveRemedy(catalog: Catalog, token: string): number | null {
  const hit = catalog.remedyByAbbrev.get(token.toLowerCase())
  if (hit) return hit.id
  const best = findRemedies(catalog, token, 1)[0]
  return best && best.score >= 55 ? best.remedy.id : null
}

/** Is the query meant as a remedy? An exact abbreviation or name, or an abbreviation prefix of 4+ letters. */
export function remedyIntent(q: string, matches: RemedyMatch[]): boolean {
  const top = matches[0]
  if (!top) return false
  const t = fold(q.replace(/^#/, '').trim()).replace(/\.$/, '')
  if (q.startsWith('#')) return true
  const abbrev = fold(top.remedy.abbrev)
  if (abbrev === t || fold(top.remedy.name) === t) return true
  return t.length >= 4 && abbrev.startsWith(t)
}
