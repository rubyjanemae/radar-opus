/**
 * Text normalisation shared by the search index, the query parser and highlighting.
 * Case and diacritics are folded so "gemut" finds "Gemüt" and "Strasse" finds "Straße".
 */

const MARKS = /[̀-ͯ]/g
const WORD = /[\p{L}\p{N}]+/gu

export function fold(s: string): string {
  // fast path: plain ASCII needs only lower-casing
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(s)) return s.toLowerCase()
  return s.toLowerCase().normalize('NFD').replace(MARKS, '').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
}

/** Folded word tokens of a string. */
export function tokenize(s: string): string[] {
  return fold(s).match(WORD) ?? []
}

export interface TokenSpan { start: number; end: number; norm: string }

/** Word tokens with their offsets in the original (unfolded) string, for highlighting. */
export function tokenSpans(s: string): TokenSpan[] {
  const out: TokenSpan[] = []
  for (const m of s.matchAll(WORD)) out.push({ start: m.index, end: m.index + m[0].length, norm: fold(m[0]) })
  return out
}

/**
 * Inflection endings accepted as "branches" of a root word when the query word has no
 * wildcard (RadarOpus "root and branches"): "fear" also finds "fears" and "feared", but not "fearful".
 */
const BRANCH_SUFFIXES = new Set([
  's', 'es', 'ed', 'd', 'ing', 'ings', 'ly', 'er', 'ers', 'ness', 'y', 'ies', 'ied', 'ness',
  // German inflections
  'e', 'en', 'n', 'em', 'ern', 'ung', 'ungen', 'heit', 'keit', 'lich',
])

/** Is `word` the root itself or one of its inflected branches? 0 = no, 2 = exact, 1 = branch. */
export function branchMatch(root: string, word: string): 0 | 1 | 2 {
  if (word === root) return 2
  if (root.length < 3 || !word.startsWith(root)) {
    // "remedies" for "remedy": y → ies / ied
    if (root.length >= 4 && root.endsWith('y') && (word === root.slice(0, -1) + 'ies' || word === root.slice(0, -1) + 'ied')) return 1
    return 0
  }
  return BRANCH_SUFFIXES.has(word.slice(root.length)) ? 1 : 0
}

export interface Segment { text: string; hit: boolean }

/** Split `text` into highlighted / plain segments using a token predicate. */
export function highlightSegments(text: string, isHit: (norm: string) => boolean): Segment[] {
  const out: Segment[] = []
  let pos = 0
  for (const t of tokenSpans(text)) {
    if (!isHit(t.norm)) continue
    if (t.start > pos) out.push({ text: text.slice(pos, t.start), hit: false })
    out.push({ text: text.slice(t.start, t.end), hit: true })
    pos = t.end
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false })
  return out
}
