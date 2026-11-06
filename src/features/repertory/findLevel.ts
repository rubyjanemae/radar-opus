/**
 * Matching and ordering of one Navigation window level (F2): pure helpers, no React.
 *
 * Like RadarOpus the window goes by first letters. What was typed matches the start of the name or
 * the start of one of its words ("abr" finds "abroad; desire to go" and "abrupt", "ear" finds
 * "ear noises" but not "fear"). Punctuation counts as a word break, so "abroad desire" matches
 * "abroad; desire to go".
 */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')

/** 0 no match, 1 the name starts with the text, 2 one of its later words does. */
export function wordStartMatch(name: string, typed: string): 0 | 1 | 2 {
  const q = norm(typed).replace(/^ +/, '')
  if (!q) return 1
  const n = norm(name).replace(/^ +/, '')
  if (n.startsWith(q)) return 1
  return ` ${n}`.includes(` ${q}`) ? 2 : 0
}

/**
 * The ids of a level matching `typed`, in the level's order. `ranked` (rubric levels) puts names
 * starting with the text first, then names with a later word starting with it; the chapter grid
 * keeps plain book order (RadarOpus: "m" gives MIND, MOUTH, MALE GE., ...).
 */
export function matchLevel(ids: readonly number[], name: (id: number) => string, typed: string, ranked = true): number[] {
  if (!norm(typed).trim()) return [...ids]
  if (!ranked) return ids.filter(id => wordStartMatch(name(id), typed) !== 0)
  const first: number[] = [], later: number[] = []
  for (const id of ids) {
    const m = wordStartMatch(name(id), typed)
    if (m === 1) first.push(id)
    else if (m === 2) later.push(id)
  }
  return later.length ? first.concat(later) : first
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** A rubric level in alphabetical order, as the Navigation window lists it (the book keeps its own order). */
export function alphabetical(ids: readonly number[], name: (id: number) => string): number[] {
  return [...ids].sort((a, b) => collator.compare(name(a), name(b)) || a - b)
}
