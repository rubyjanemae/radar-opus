import type { Repertory } from '../data/repertory'

/** The part of a Repertory the path resolver needs (keeps it testable with fixtures). */
export type PathRepertory = Pick<Repertory, 'chapters' | 'children' | 'text'>

const caches = new WeakMap<object, Map<string, number>>()

/**
 * Resolve a human rubric path such as "Mind, fear, death, of" to a rubric index by
 * walking the tree from the chapter roots. Segments are separated by ", ", but a rubric
 * text may itself contain commas ("die, fear he will"), so each level matches the longest
 * child text that is a prefix of the remaining path. Case-insensitive. Returns -1 when
 * the path does not exist in this repertory.
 */
export function resolvePath(rep: PathRepertory, path: string): number {
  let cache = caches.get(rep)
  if (!cache) { cache = new Map(); caches.set(rep, cache) }
  const key = path.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const found = walk(rep, rep.chapters, key)
  cache.set(key, found)
  return found
}

function walk(rep: PathRepertory, candidates: readonly number[], rest: string): number {
  // Try longer texts first so "fear, death, of" prefers a rubric literally named "death, of" if one exists.
  const matches: { i: number; len: number }[] = []
  for (const c of candidates) {
    const t = rep.text(c).toLowerCase()
    if (rest === t) return c
    if (rest.startsWith(t + ', ')) matches.push({ i: c, len: t.length })
  }
  matches.sort((a, b) => b.len - a.len)
  for (const m of matches) {
    const r = walk(rep, rep.children(m.i), rest.slice(m.len + 2))
    if (r >= 0) return r
  }
  return -1
}
