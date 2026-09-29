import type { Repertory } from '../../data/repertory'
import type { Grade } from '../../data/types'
import { branchMatch, fold, tokenize } from './text'
import { parseQuery, wordTermMatch } from './query'
import type { Node, ParsedQuery, Term } from './query'

/**
 * Rubric search over columnar repertories.
 *
 * A word index (sorted vocabulary → Int32Array of rubric ids whose own text holds the word)
 * is built once per repertory, lazily or in an idle callback. A query is evaluated to a
 * byte mask per repertory: a rubric matches a word when its full path (own text or any
 * ancestor) contains it, which is a range fill of each posting's subtree [i, subtreeEnd(i)).
 */

// ───────────────────────── index ─────────────────────────

export interface WordIndex {
  /** Sorted vocabulary. */
  words: string[]
  /** postings[k] = rubric ids (ascending) whose own text contains words[k]. */
  postings: Int32Array[]
  /** remedyId → rubric ids * 4 + (grade - 1), ascending. Built on first use. */
  remedies: Map<number, Int32Array> | null
  /** Number of word tokens in each rubric's own text (for ranking by coverage). */
  tokenCount: Uint8Array
  buildMs: number
}

const indexes = new WeakMap<Repertory, WordIndex>()

export function hasIndex(rep: Repertory) { return indexes.has(rep) }

export function getIndex(rep: Repertory): WordIndex {
  let ix = indexes.get(rep)
  if (!ix) { ix = buildIndex(rep); indexes.set(rep, ix) }
  return ix
}

function buildIndex(rep: Repertory): WordIndex {
  const t0 = performance.now()
  const map = new Map<string, number[]>()
  const cache = new Map<string, string[]>()
  const tokenCount = new Uint8Array(rep.size)
  for (let i = 0; i < rep.size; i++) {
    const text = rep.text(i)
    let toks = cache.get(text)
    if (!toks) { toks = tokenize(text); cache.set(text, toks) }
    tokenCount[i] = Math.min(255, toks.length)
    for (const w of toks) {
      const list = map.get(w)
      if (!list) map.set(w, [i])
      else if (list[list.length - 1] !== i) list.push(i)
    }
  }
  const words = [...map.keys()].sort()
  const postings = words.map(w => Int32Array.from(map.get(w)!))
  return { words, postings, remedies: null, tokenCount, buildMs: performance.now() - t0 }
}

function remedyIndex(rep: Repertory, ix: WordIndex): Map<number, Int32Array> {
  if (ix.remedies) return ix.remedies
  const lists = new Map<number, number[]>()
  for (let i = 0; i < rep.size; i++) {
    rep.forEachRemedy(i, (id, g) => {
      const l = lists.get(id)
      const v = i * 4 + (g - 1)
      if (l) l.push(v)
      else lists.set(id, [v])
    })
  }
  ix.remedies = new Map([...lists].map(([k, v]) => [k, Int32Array.from(v)]))
  return ix.remedies
}

/** Rubric ids * 4 + (grade - 1) carrying a remedy, in book order. */
export function remedyPostings(rep: Repertory, remedyId: number): Int32Array {
  return remedyIndex(rep, getIndex(rep)).get(remedyId) ?? new Int32Array(0)
}

const warming = new WeakMap<Repertory, { promise: Promise<void>; now: () => void }>()
type IdleWindow = { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }

/**
 * Build the index off the critical path. By default in an idle callback so the first
 * search is instant; `urgent` (someone is waiting) builds on the next task instead.
 */
export function warmIndex(rep: Repertory, urgent = false): Promise<void> {
  if (indexes.has(rep)) return Promise.resolve()
  let w = warming.get(rep)
  if (!w) {
    let done = false
    let resolve!: () => void
    const promise = new Promise<void>(res => { resolve = res })
    const now = () => { if (done) return; done = true; getIndex(rep); warming.delete(rep); resolve() }
    w = { promise, now }
    warming.set(rep, w)
    const win = (typeof window !== 'undefined' ? window : undefined) as IdleWindow | undefined
    if (!urgent && win?.requestIdleCallback) win.requestIdleCallback(now, { timeout: 2000 })
    else setTimeout(now, 0)
  }
  if (urgent) { const run = w.now; setTimeout(run, 0) }
  return w.promise
}

/** Index of the first word >= s in a sorted array. */
function lowerBound(words: string[], s: string): number {
  let lo = 0, hi = words.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (words[m] < s) lo = m + 1; else hi = m }
  return lo
}

/** Vocabulary ids matching a word term, with 2 = exact, 1 = branch/wildcard. */
function vocabMatches(ix: WordIndex, term: Extract<Term, { kind: 'word' }>): [number, 1 | 2][] {
  const out: [number, 1 | 2][] = []
  const { words } = ix
  if (term.wildcard === 'none' || term.wildcard === 'prefix') {
    let root = term.text
    // branches of "remedy" include "remedies": scan from the shared stem
    if (term.wildcard === 'none' && root.length >= 4 && root.endsWith('y')) root = root.slice(0, -1)
    for (let k = lowerBound(words, root); k < words.length && words[k].startsWith(root); k++) {
      const m = wordTermMatch(term, words[k], branchMatch)
      if (m) out.push([k, m])
    }
    return out
  }
  for (let k = 0; k < words.length; k++) {
    const m = wordTermMatch(term, words[k], branchMatch)
    if (m) out.push([k, m])
  }
  return out
}

// ───────────────────────── evaluation ─────────────────────────

export interface Target {
  rep: Repertory
  /** Restrict to rubric ids [start, end) (a chapter or subtree). */
  start?: number
  end?: number
}

export interface SearchOptions {
  /** Treat the last word as a prefix (type-ahead). */
  prefixLast?: boolean
  /** Return at most this many ranked results (all are counted). */
  limit?: number
  /** Drop results whose parent rubric is also a result. */
  collapse?: boolean
  /** Resolve a remedy token ("lach", "lachesis") to a remedy id. */
  resolveRemedy?: (token: string) => number | null
}

export interface SearchHit { rep: Repertory; index: number; score: number }

export interface SearchResult {
  hits: SearchHit[]
  /** Number of matching rubrics before `limit`. */
  total: number
  parsed: ParsedQuery
  ms: number
  error: string | null
}

interface Ctx {
  rep: Repertory
  ix: WordIndex
  n: number
  resolveRemedy?: (token: string) => number | null
  /** own-text mask per positive term, for ranking. */
  own: Map<Term, Uint8Array>
  unknownRemedy: string | null
}

/** Expand own-text marks to a path mask (every rubric under a marked one matches). */
function pathMask(rep: Repertory, own: Uint8Array): Uint8Array {
  const n = own.length
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!own[i]) continue
    const end = rep.subtreeEndOf(i)
    mask.fill(1, i, end)
    // nested marks lie inside this subtree, which is already filled
    i = end - 1
  }
  return mask
}

function wordOwn(ctx: Ctx, term: Extract<Term, { kind: 'word' }>): Uint8Array {
  const own = new Uint8Array(ctx.n)
  for (const [k, m] of vocabMatches(ctx.ix, term)) {
    const p = ctx.ix.postings[k]
    for (let j = 0; j < p.length; j++) if (own[p[j]] < m) own[p[j]] = m
  }
  return own
}

function containsSeq(tokens: string[], words: string[], prefixLast: boolean): boolean {
  outer: for (let s = 0; s + words.length <= tokens.length; s++) {
    for (let k = 0; k < words.length; k++) {
      const t = tokens[s + k], w = words[k]
      const last = k === words.length - 1
      if (last && prefixLast ? !t.startsWith(w) : t !== w) continue outer
    }
    return true
  }
  return false
}

function evalTerm(ctx: Ctx, term: Term): Uint8Array {
  const { rep, n } = ctx
  if (term.kind === 'word') {
    const own = wordOwn(ctx, term)
    ctx.own.set(term, own)
    return pathMask(rep, own)
  }
  if (term.kind === 'remedy') {
    const id = ctx.resolveRemedy?.(term.token) ?? null
    const mask = new Uint8Array(n)
    if (id == null) { ctx.unknownRemedy = term.token; ctx.own.set(term, mask); return mask }
    const p = remedyPostings(rep, id)
    const own = new Uint8Array(n)
    for (let j = 0; j < p.length; j++) if ((p[j] & 3) + 1 >= term.minGrade) { mask[p[j] >> 2] = 1; own[p[j] >> 2] = 2 }
    ctx.own.set(term, own)
    return mask
  }
  // phrase: candidates are rubrics whose path holds every word, then verify order
  const words = term.words
  let cand: Uint8Array | null = null
  words.forEach((w, k) => {
    const m = pathMask(rep, wordOwn(ctx, { kind: 'word', text: w, wildcard: k === words.length - 1 && term.prefixLast ? 'prefix' : 'none' }))
    if (!cand) cand = m
    else for (let i = 0; i < n; i++) cand[i] &= m[i]
  })
  const mask = new Uint8Array(n)
  const own = new Uint8Array(n)
  const c = cand as Uint8Array | null
  if (!c) return mask
  // path tokens are built incrementally from ancestors, cached per rubric in this pass
  const pathToks = new Map<number, string[]>()
  const toksOf = (i: number): string[] => {
    let t = pathToks.get(i)
    if (!t) {
      const p = rep.parent(i)
      t = p >= 0 ? [...toksOf(p), ...tokenize(rep.text(i))] : tokenize(rep.text(i))
      pathToks.set(i, t)
    }
    return t
  }
  for (let i = 0; i < n; i++) {
    if (!c[i]) continue
    if (containsSeq(toksOf(i), words, term.prefixLast)) {
      mask[i] = 1
      if (containsSeq(tokenize(rep.text(i)), words, term.prefixLast)) own[i] = 2
    }
  }
  ctx.own.set(term, own)
  return mask
}

function evalNode(ctx: Ctx, node: Node): Uint8Array {
  if (node.t === 'term') return evalTerm(ctx, node.term)
  if (node.t === 'not') {
    const m = evalNode(ctx, node.item)
    const out = new Uint8Array(ctx.n)
    for (let i = 0; i < ctx.n; i++) out[i] = m[i] ? 0 : 1
    return out
  }
  const parts = node.items.map(x => evalNode(ctx, x))
  const out = parts[0].slice()
  if (node.t === 'and') { for (let k = 1; k < parts.length; k++) { const p = parts[k]; for (let i = 0; i < ctx.n; i++) out[i] &= p[i] } }
  else { for (let k = 1; k < parts.length; k++) { const p = parts[k]; for (let i = 0; i < ctx.n; i++) out[i] |= p[i] } }
  return out
}

/**
 * Rank: words found in the rubric's own text (exact > branch) beat words found only in an
 * ancestor; rubrics whose text is mostly query words, main rubrics (shallow) and larger
 * rubrics come first.
 */
function score(ctx: Ctx, positive: Term[], i: number): number {
  let s = 0
  let ownHits = 0
  for (const t of positive) {
    const m = ctx.own.get(t)?.[i] ?? 0
    if (m) { ownHits += t.kind === 'phrase' ? t.words.length : t.kind === 'word' ? 1 : 0 }
    s += m === 2 ? 40 : m === 1 ? 28 : 22
  }
  const rep = ctx.rep
  const text = rep.text(i)
  const count = ctx.ix.tokenCount[i]
  if (count) s += Math.min(1, ownHits / count) * 30
  s -= rep.depth(i) * 9
  s -= Math.min(text.length, 80) / 16
  s += Math.min(8, Math.log2(1 + rep.remedyCount(i)))
  return s
}

/** Run a parsed or raw query against one or more targets. */
export function search(query: string | ParsedQuery, targets: Target[], opts: SearchOptions = {}): SearchResult {
  const t0 = performance.now()
  const parsed = typeof query === 'string' ? parseQuery(query, { prefixLast: opts.prefixLast }) : query
  const empty = (error: string | null): SearchResult => ({ hits: [], total: 0, parsed, ms: performance.now() - t0, error })
  if (!parsed.ast) return empty(parsed.error)
  if (!parsed.positive.length) return empty(parsed.error)
  const hits: SearchHit[] = []
  let unknown: string | null = null
  targets.forEach((tg, order) => {
    const rep = tg.rep
    const ctx: Ctx = { rep, ix: getIndex(rep), n: rep.size, resolveRemedy: opts.resolveRemedy, own: new Map(), unknownRemedy: null }
    const mask = evalNode(ctx, parsed.ast!)
    unknown ??= ctx.unknownRemedy
    const start = Math.max(0, tg.start ?? 0), end = Math.min(rep.size, tg.end ?? rep.size)
    // earlier targets (the current repertory) win ties
    const bias = -order * 0.001
    for (let i = start; i < end; i++) {
      if (!mask[i]) continue
      if (opts.collapse) { const p = rep.parent(i); if (p >= start && mask[p]) continue }
      hits.push({ rep, index: i, score: score(ctx, parsed.positive, i) + bias })
    }
  })
  const total = hits.length
  hits.sort((a, b) => b.score - a.score || (a.rep === b.rep ? a.index - b.index : 0))
  const out = opts.limit != null && hits.length > opts.limit ? hits.slice(0, opts.limit) : hits
  return { hits: out, total, parsed, ms: performance.now() - t0, error: parsed.error ?? (unknown ? `Unknown remedy “${unknown}”` : null) }
}

/** Token predicate for highlighting the words a query matched. */
export function highlighter(parsed: ParsedQuery): (norm: string) => boolean {
  const words: Extract<Term, { kind: 'word' }>[] = []
  const phraseWords = new Set<string>()
  const phrasePrefixes: string[] = []
  for (const t of parsed.positive) {
    if (t.kind === 'word') words.push(t)
    else if (t.kind === 'phrase') {
      t.words.forEach((w, k) => { if (k === t.words.length - 1 && t.prefixLast) phrasePrefixes.push(w); else phraseWords.add(w) })
    }
  }
  return (norm: string) => phraseWords.has(norm) || phrasePrefixes.some(p => norm.startsWith(p)) || words.some(w => wordTermMatch(w, norm, branchMatch) > 0)
}

// ───────────────────────── remedy search ─────────────────────────

export interface RemedySearchOptions {
  minGrade?: number
  maxGrade?: number
  /** Only rubrics with at most this many remedies (0 = no limit). */
  maxSize?: number
  minSize?: number
  /** At most this many other remedies of the same or higher grade (-1 = no limit). */
  maxCo?: number
  start?: number
  end?: number
}

export interface RemedyHit { index: number; grade: Grade; size: number; co: number }

/** Rubrics of a repertory that contain a remedy, filtered, in book order. */
export function remedyRubrics(rep: Repertory, remedyId: number, o: RemedySearchOptions = {}): RemedyHit[] {
  const p = remedyPostings(rep, remedyId)
  const minG = o.minGrade ?? 1, maxG = o.maxGrade ?? 4
  const maxSize = o.maxSize ?? 0, minSize = o.minSize ?? 0, maxCo = o.maxCo ?? -1
  const start = o.start ?? 0, end = o.end ?? rep.size
  const out: RemedyHit[] = []
  for (let j = 0; j < p.length; j++) {
    const i = p[j] >> 2
    if (i < start || i >= end) continue
    const grade = ((p[j] & 3) + 1) as Grade
    if (grade < minG || grade > maxG) continue
    const size = rep.remedyCount(i)
    if (maxSize > 0 && size > maxSize) continue
    if (size < minSize) continue
    let co = 0
    rep.forEachRemedy(i, (id, g) => { if (id !== remedyId && g >= grade) co++ })
    if (maxCo >= 0 && co > maxCo) continue
    out.push({ index: i, grade, size, co })
  }
  return out
}

// ───────────────────────── result summary ─────────────────────────

export interface RemedyFrequency { remedyId: number; count: number; gradeSum: number; byGrade: [number, number, number, number] }

/** How often each remedy occurs across a set of rubrics (the "graphical" search summary). */
export function remedyFrequency(items: { rep: Repertory; index: number }[], limit = 20): { top: RemedyFrequency[]; distinct: number } {
  const map = new Map<number, RemedyFrequency>()
  for (const { rep, index } of items) {
    rep.forEachRemedy(index, (id, g) => {
      let f = map.get(id)
      if (!f) { f = { remedyId: id, count: 0, gradeSum: 0, byGrade: [0, 0, 0, 0] }; map.set(id, f) }
      f.count++
      f.gradeSum += g
      f.byGrade[g - 1]++
    })
  }
  const all = [...map.values()].sort((a, b) => b.count - a.count || b.gradeSum - a.gradeSum || a.remedyId - b.remedyId)
  return { top: all.slice(0, limit), distinct: all.length }
}

/** Folded key for a query in recent-search lists. */
export function queryKey(q: string) { return fold(q.trim().replace(/\s+/g, ' ')) }
