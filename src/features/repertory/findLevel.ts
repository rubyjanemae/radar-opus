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

/**
 * Where `typed` occurs in `name`, as [start, end) offsets into `name`, or null. Case and runs of
 * punctuation are ignored, as in matching. `anywhere` false: only at the start of the name
 * (RadarOpus with "Search anywhere in the text" off); true: anywhere, even inside a word.
 */
export function hitRange(name: string, typed: string, anywhere: boolean): [number, number] | null {
  const q = norm(typed).replace(/^ +/, '')
  if (!q) return [0, 0]
  // the normalised name with, for each of its characters, the offset in `name` it came from
  let n = ''
  const at: number[] = []
  for (let i = 0; i < name.length;) {
    const cp = name.codePointAt(i)!
    const ch = String.fromCodePoint(cp)
    const w = ch.length
    if (/[\p{L}\p{N}]/u.test(ch)) { const l = ch.toLowerCase(); for (let k = 0; k < l.length; k++) { n += l[k]; at.push(i) } }
    else if (n && !n.endsWith(' ')) { n += ' '; at.push(i) }
    i += w
  }
  at.push(name.length)
  const k = anywhere ? n.indexOf(q) : n.startsWith(q) ? 0 : -1
  if (k < 0) return null
  const endIdx = k + q.length
  return [at[k], endIdx < at.length - 1 ? at[endIdx] : name.length]
}

/**
 * The ids of a level whose name starts with `typed` (or, `anywhere`, contains it), in the level's
 * order; with `anywhere` names starting with the text come first.
 */
export function filterLevel(ids: readonly number[], name: (id: number) => string, typed: string, anywhere: boolean): number[] {
  if (!norm(typed).trim()) return [...ids]
  if (!anywhere) return ids.filter(id => hitRange(name(id), typed, false) != null)
  const first: number[] = [], later: number[] = []
  for (const id of ids) {
    const r = hitRange(name(id), typed, true)
    if (!r) continue
    ;(r[0] === 0 ? first : later).push(id)
  }
  return first.concat(later)
}
