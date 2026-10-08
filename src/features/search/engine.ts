import type { Repertory } from '../../data/repertory'
import type { Grade } from '../../data/types'
import { remedyIndexNow as remedyIndex } from '../mm/remedyIndexAccess'
import { branchMatch, sameOrSynonym, synonymsOf, tokenize } from './text'
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
  /** Number of word tokens in each rubric's own text (for ranking by coverage). */
  tokenCount: Uint8Array
  buildMs: number
}

const indexes = new WeakMap<Repertory, WordIndex>()

export function hasIndex(rep: Repertory) { return indexes.has(rep) }

export function getIndex(rep: Repertory): WordIndex {
  let ix = indexes.get(rep)
  if (!ix) {
    // someone needs it now: finish (or run) the build in one go
    const b = builders.get(rep) ?? new IndexBuilder(rep)
    b.step()
    ix = b.result!
  }
  return ix
}

/**
 * Resumable word-index build. `step(deadline)` works until `deadline()` says stop and returns
 * true when the index is complete (and registered). Like `Repertory.buildLowerPaths`, so a
 * background build never blocks the main thread for more than a slice.
 */
export class IndexBuilder {
  private i = 0
  private phase: 'scan' | 'sort' | 'post' | 'done' = 'scan'
  private readonly map = new Map<string, number[]>()
  private readonly cache = new Map<string, string[]>()
  private readonly tokenCount: Uint8Array
  private words: string[] = []
  private postings: Int32Array[] = []
  private ms = 0
  result: WordIndex | null = null

  private readonly rep: Repertory
  constructor(rep: Repertory) {
    this.rep = rep
    this.tokenCount = new Uint8Array(rep.size)
    builders.set(rep, this)
  }

  step(deadline?: () => boolean): boolean {
    if (this.result) return true
    const t0 = performance.now()
    try {
      const { rep, map, cache, tokenCount } = this
      while (this.phase === 'scan') {
        const end = Math.min(rep.size, this.i + 1024)
        for (let i = this.i; i < end; i++) {
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
        this.i = end
        if (end >= rep.size) { this.phase = 'sort'; cache.clear() }
        if (deadline?.()) return false
      }
      if (this.phase === 'sort') {
        this.words = [...map.keys()].sort()
        this.phase = 'post'
        this.i = 0
        if (deadline?.()) return false
      }
      while (this.phase === 'post') {
        const end = Math.min(this.words.length, this.i + 4096)
        for (let k = this.i; k < end; k++) this.postings.push(Int32Array.from(map.get(this.words[k])!))
        this.i = end
        if (end >= this.words.length) { this.phase = 'done'; break }
        if (deadline?.()) return false
      }
    } finally {
      this.ms += performance.now() - t0
    }
    this.result = { words: this.words, postings: this.postings, tokenCount: this.tokenCount, buildMs: this.ms }
    this.map.clear()
    indexes.set(this.rep, this.result)
    builders.delete(this.rep)
    return true
  }
}

const builders = new WeakMap<Repertory, IndexBuilder>()
const warming = new WeakMap<Repertory, { promise: Promise<void>; hurry: () => void }>()
type IdleDeadlineLike = { timeRemaining(): number; didTimeout: boolean }
type IdleWindow = { requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, o?: { timeout: number }) => number }

/** Main-thread budget of one urgent slice (ms): short enough that typing stays responsive. */
const URGENT_SLICE_MS = 12

/**
 * Build the index off the critical path, in time slices: by default in idle callbacks so the
 * first search is instant; `urgent` (someone is waiting) continues on the next tasks instead.
 */
export function warmIndex(rep: Repertory, urgent = false): Promise<void> {
  if (indexes.has(rep)) return Promise.resolve()
  let w = warming.get(rep)
  if (!w) {
    const b = builders.get(rep) ?? new IndexBuilder(rep)
    let resolve!: () => void
    const promise = new Promise<void>(res => { resolve = res })
    let hurried = false
    const finish = () => { warming.delete(rep); resolve() }
    const win = (typeof window !== 'undefined' ? window : undefined) as IdleWindow | undefined
    const idle = (d: IdleDeadlineLike) => {
      if (hurried) return
      const t0 = performance.now()
      // at most one slice per idle callback (also one that timed out), so a keystroke never waits long
      if (b.step(() => performance.now() - t0 > URGENT_SLICE_MS || (!d.didTimeout && d.timeRemaining() < 2))) finish()
      else win!.requestIdleCallback!(idle, { timeout: 2000 })
    }
    const task = () => {
      const t0 = performance.now()
      if (b.step(() => performance.now() - t0 > URGENT_SLICE_MS)) finish()
      else setTimeout(task, 0)
    }
    const hurry = () => { if (hurried) return; hurried = true; setTimeout(task, 0) }
    w = { promise, hurry }
    warming.set(rep, w)
    if (!urgent && win?.requestIdleCallback) win.requestIdleCallback(idle, { timeout: 2000 })
    else hurry()
  }
  if (urgent) w.hurry()
  return w.promise
}

/** Index of the first word >= s in a sorted array. */
function lowerBound(words: string[], s: string): number {
  let lo = 0, hi = words.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (words[m] < s) lo = m + 1; else hi = m }
  return lo
}

/**
 * Prefix buckets: the vocabulary range [from, to) of every word starting with a short prefix, and
 * the union of those words' postings as one sorted id list. Type-ahead queries ("he", "pa") hit
 * the same short prefixes over and over; the bucket turns their many postings into one list.
 */
const PREFIX_BUCKET_MAX = 3
const buckets = new WeakMap<WordIndex, Map<string, Int32Array>>()

function prefixRange(words: string[], root: string): [number, number] {
  const from = lowerBound(words, root)
  // every word with this prefix sorts before root + U+FFFF
  const to = lowerBound(words, root + '￿')
  return [from, to]
}

/** Sorted, de-duplicated rubric ids whose own text holds a word starting with `prefix` (cached). */
export function prefixBucket(ix: WordIndex, prefix: string): Int32Array {
  let m = buckets.get(ix)
  if (!m) { m = new Map(); buckets.set(ix, m) }
  let out = m.get(prefix)
  if (!out) {
    const [from, to] = prefixRange(ix.words, prefix)
    let size = 0
    for (let k = from; k < to; k++) size += ix.postings[k].length
    const all = new Int32Array(size)
    let o = 0
    for (let k = from; k < to; k++) { all.set(ix.postings[k], o); o += ix.postings[k].length }
    all.sort()
    let w = 0
    for (let r = 0; r < all.length; r++) if (r === 0 || all[r] !== all[r - 1]) all[w++] = all[r]
    out = all.slice(0, w)
    m.set(prefix, out)
  }
  return out
}

/** Vocabulary ids matching a word term, with 2 = exact, 1 = branch/wildcard. */
function vocabMatches(ix: WordIndex, term: Extract<Term, { kind: 'word' }>): [number, 1 | 2][] {
  const out: [number, 1 | 2][] = []
  const { words } = ix
  if (term.wildcard === 'none' || term.wildcard === 'prefix') {
    let root = term.text
    // branches of "remedy" include "remedies": scan from the shared stem
    if (term.wildcard === 'none' && root.length >= 4 && root.endsWith('y')) root = root.slice(0, -1)
    const [from, to] = prefixRange(words, root)
    for (let k = from; k < to; k++) {
      const m = wordTermMatch(term, words[k], branchMatch)
      if (m) out.push([k, m])
    }
    // modality synonyms (worse = agg., better = amel.) count as branch matches
    if (term.wildcard === 'none') {
      for (const syn of synonymsOf(term.text)) {
        const k = lowerBound(words, syn)
        if (words[k] === syn) out.push([k, 1])
      }
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

/**
 * The evaluation is written as generators that `yield` every few thousand steps. `search` runs
 * one to completion; `searchSliced` runs it in ~8 ms slices so the main thread stays free
 * (typing, painting) while a large query is evaluated, and drops it when a newer query starts.
 */
type Work<T> = Generator<void, T, void>
/** Iterations between yield points (each is a cheap check; the driver decides whether to pause). */
const STEP = 4096

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
function* pathMask(rep: Repertory, own: Uint8Array): Work<Uint8Array> {
  const n = own.length
  const mask = new Uint8Array(n)
  let next = STEP
  for (let i = 0; i < n; i++) {
    if (i >= next) { next = i + STEP; yield }
    if (!own[i]) continue
    const end = rep.subtreeEndOf(i)
    mask.fill(1, i, end)
    // nested marks lie inside this subtree, which is already filled
    i = end - 1
  }
  return mask
}

function* wordOwn(ctx: Ctx, term: Extract<Term, { kind: 'word' }>): Work<Uint8Array> {
  const own = new Uint8Array(ctx.n)
  // a short prefix (type-ahead "he", "pa"): one precomputed bucket instead of hundreds of postings
  if (term.wildcard === 'prefix' && term.text.length <= PREFIX_BUCKET_MAX) {
    const b = prefixBucket(ctx.ix, term.text)
    for (let j = 0; j < b.length; j++) { own[b[j]] = 1; if ((j & (STEP - 1)) === STEP - 1) yield }
    // the word itself is an exact match (2); every other word of the bucket a prefix match (1)
    const k = lowerBound(ctx.ix.words, term.text)
    if (ctx.ix.words[k] === term.text) { const p = ctx.ix.postings[k]; for (let j = 0; j < p.length; j++) own[p[j]] = 2 }
    return own
  }
  let done = 0
  for (const [k, m] of vocabMatches(ctx.ix, term)) {
    const p = ctx.ix.postings[k]
    for (let j = 0; j < p.length; j++) if (own[p[j]] < m) own[p[j]] = m
    done += p.length
    if (done >= STEP) { done = 0; yield }
  }
  return own
}

function containsSeq(tokens: string[], words: string[], prefixLast: boolean): boolean {
  outer: for (let s = 0; s + words.length <= tokens.length; s++) {
    for (let k = 0; k < words.length; k++) {
      const t = tokens[s + k], w = words[k]
      const last = k === words.length - 1
      if (last && prefixLast ? !t.startsWith(w) : !sameOrSynonym(w, t)) continue outer
    }
    return true
  }
  return false
}

function* evalTerm(ctx: Ctx, term: Term): Work<Uint8Array> {
  const { rep, n } = ctx
  if (term.kind === 'word') {
    const own = yield* wordOwn(ctx, term)
    ctx.own.set(term, own)
    return yield* pathMask(rep, own)
  }
  if (term.kind === 'remedy') {
    const id = ctx.resolveRemedy?.(term.token) ?? null
    const mask = new Uint8Array(n)
    if (id == null) { ctx.unknownRemedy = term.token; ctx.own.set(term, mask); return mask }
    const ix = remedyIndex(rep)
    const [from, to] = ix.range(id)
    const own = new Uint8Array(n)
    for (let j = from; j < to; j++) if (ix.grades[j] >= term.minGrade) { mask[ix.rubrics[j]] = 1; own[ix.rubrics[j]] = 2 }
    ctx.own.set(term, own)
    return mask
  }
  // phrase: candidates are rubrics whose path holds every word, then verify order
  const words = term.words
  let cand: Uint8Array | null = null
  for (let k = 0; k < words.length; k++) {
    const w = words[k]
    const own = yield* wordOwn(ctx, { kind: 'word', text: w, wildcard: k === words.length - 1 && term.prefixLast ? 'prefix' : 'none' })
    const m = yield* pathMask(rep, own)
    if (!cand) cand = m
    else { const c: Uint8Array = cand; for (let i = 0; i < n; i++) c[i] &= m[i]; yield }
  }
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
  let work = 0
  for (let i = 0; i < n; i++) {
    if (!c[i]) continue
    if (++work >= 256) { work = 0; yield }
    if (containsSeq(toksOf(i), words, term.prefixLast)) {
      mask[i] = 1
      if (containsSeq(tokenize(rep.text(i)), words, term.prefixLast)) own[i] = 2
    }
  }
  ctx.own.set(term, own)
  return mask
}

function* evalNode(ctx: Ctx, node: Node): Work<Uint8Array> {
  if (node.t === 'term') return yield* evalTerm(ctx, node.term)
  if (node.t === 'not') {
    const m = yield* evalNode(ctx, node.item)
    const out = new Uint8Array(ctx.n)
    for (let i = 0; i < ctx.n; i++) out[i] = m[i] ? 0 : 1
    yield
    return out
  }
  const parts: Uint8Array[] = []
  for (const x of node.items) parts.push(yield* evalNode(ctx, x))
  const out = parts[0].slice()
  if (node.t === 'and') { for (let k = 1; k < parts.length; k++) { const p = parts[k]; for (let i = 0; i < ctx.n; i++) out[i] &= p[i]; yield } }
  else { for (let k = 1; k < parts.length; k++) { const p = parts[k]; for (let i = 0; i < ctx.n; i++) out[i] |= p[i]; yield } }
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

/** Result order: higher score first, then book order within a repertory. */
const byRank = (a: SearchHit, b: SearchHit) => b.score - a.score || (a.rep === b.rep ? a.index - b.index : 0)

/** Stable bottom-up merge sort that yields between runs (a 70k-hit sort would otherwise be one long task). */
function* sortHits(hits: SearchHit[]): Work<SearchHit[]> {
  const RUN = 2048
  for (let i = 0; i < hits.length; i += RUN) {
    const part = hits.slice(i, i + RUN).sort(byRank)
    for (let k = 0; k < part.length; k++) hits[i + k] = part[k]
    yield
  }
  let src = hits, dst: SearchHit[] = new Array(hits.length)
  for (let w = RUN; w < hits.length; w *= 2) {
    let work = 0
    for (let lo = 0; lo < hits.length; lo += 2 * w) {
      const mid = Math.min(lo + w, hits.length), hi = Math.min(lo + 2 * w, hits.length)
      let a = lo, b = mid, o = lo
      while (a < mid && b < hi) dst[o++] = byRank(src[b], src[a]) < 0 ? src[b++] : src[a++]
      while (a < mid) dst[o++] = src[a++]
      while (b < hi) dst[o++] = src[b++]
      work += hi - lo
      if (work >= 16384) { work = 0; yield }
    }
    const t = src; src = dst; dst = t
  }
  return src
}

/**
 * Keeps the best `limit` hits seen so far (a min-heap on rank), so a type-ahead search with a
 * small page never sorts every match and stops caring about hits that cannot reach the page.
 */
class TopK {
  readonly heap: SearchHit[] = []
  readonly k: number
  constructor(k: number) { this.k = k }
  /** Worse-ranked of two hits is "smaller". */
  private less(a: SearchHit, b: SearchHit) { return byRank(a, b) > 0 }
  push(h: SearchHit) {
    const hp = this.heap
    if (hp.length < this.k) {
      hp.push(h)
      let i = hp.length - 1
      while (i > 0) { const p = (i - 1) >> 1; if (!this.less(hp[i], hp[p])) break; [hp[i], hp[p]] = [hp[p], hp[i]]; i = p }
      return
    }
    if (!this.k || !this.less(hp[0], h)) return
    hp[0] = h
    let i = 0
    for (;;) {
      const l = 2 * i + 1, r = l + 1
      let m = i
      if (l < hp.length && this.less(hp[l], hp[m])) m = l
      if (r < hp.length && this.less(hp[r], hp[m])) m = r
      if (m === i) break;
      [hp[i], hp[m]] = [hp[m], hp[i]]
      i = m
    }
  }
}

function* searchWork(query: string | ParsedQuery, targets: Target[], opts: SearchOptions, t0: number): Work<SearchResult> {
  const parsed = typeof query === 'string' ? parseQuery(query, { prefixLast: opts.prefixLast }) : query
  const empty = (error: string | null): SearchResult => ({ hits: [], total: 0, parsed, ms: performance.now() - t0, error })
  if (!parsed.ast) return empty(parsed.error)
  if (!parsed.positive.length) return empty(parsed.error)
  const all: SearchHit[] = []
  const top = opts.limit != null ? new TopK(opts.limit) : null
  let total = 0
  let unknown: string | null = null
  for (let order = 0; order < targets.length; order++) {
    const tg = targets[order]
    const rep = tg.rep
    const ctx: Ctx = { rep, ix: getIndex(rep), n: rep.size, resolveRemedy: opts.resolveRemedy, own: new Map(), unknownRemedy: null }
    const mask = yield* evalNode(ctx, parsed.ast)
    unknown ??= ctx.unknownRemedy
    const start = Math.max(0, tg.start ?? 0), end = Math.min(rep.size, tg.end ?? rep.size)
    // earlier targets (the current repertory) win ties
    const bias = -order * 0.001
    let work = 0
    for (let i = start; i < end; i++) {
      if (!mask[i]) continue
      if (opts.collapse) { const p = rep.parent(i); if (p >= start && mask[p]) continue }
      const h = { rep, index: i, score: score(ctx, parsed.positive, i) + bias }
      total++
      if (top) top.push(h); else all.push(h)
      if (++work >= 1024) { work = 0; yield }
    }
  }
  const hits = top ? top.heap.sort(byRank) : yield* sortHits(all)
  return { hits, total, parsed, ms: performance.now() - t0, error: parsed.error ?? (unknown ? `Unknown remedy “${unknown}”` : null) }
}

/** Run a parsed or raw query against one or more targets, synchronously. */
export function search(query: string | ParsedQuery, targets: Target[], opts: SearchOptions = {}): SearchResult {
  const g = searchWork(query, targets, opts, performance.now())
  for (;;) { const r = g.next(); if (r.done) return r.value }
}

/** Main-thread budget of one search slice (ms). */
export const SLICE_MS = 8

/** Yield to the event loop (a macrotask, so input and paint can run in between; no 4 ms clamp). */
export function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel === 'undefined') return new Promise(r => setTimeout(r, 0))
  return new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); r() }; ch.port2.postMessage(0) })
}

export class SearchAborted extends Error { constructor() { super('Search superseded'); this.name = 'SearchAborted' } }

/**
 * Same result as `search`, computed in slices of at most ~`sliceMs` of main-thread work. Rejects
 * with `SearchAborted` once `signal` aborts (a newer query started). The work always starts in a
 * later task, never inside the caller's (a keystroke's task stays short).
 */
export async function searchSliced(query: string | ParsedQuery, targets: Target[], opts: SearchOptions = {}, signal?: AbortSignal, sliceMs = SLICE_MS): Promise<SearchResult> {
  return runSliced(searchWork(query, targets, opts, performance.now()), signal, sliceMs)
}

/** Drive a work generator in slices of ~`sliceMs`, yielding to the event loop in between. */
async function runSliced<T>(g: Work<T>, signal: AbortSignal | undefined, sliceMs: number): Promise<T> {
  // never in the caller's task: a keystroke's own task (render, commit, effects) stays short
  await yieldToEventLoop()
  for (;;) {
    if (signal?.aborted) { g.return(undefined as never); throw new SearchAborted() }
    const s0 = performance.now()
    for (;;) {
      const r = g.next()
      if (r.done) return r.value
      if (performance.now() - s0 >= sliceMs) break
    }
    await yieldToEventLoop()
  }
}

const hlCache = new WeakMap<ParsedQuery, (norm: string) => boolean>()
const hlByText = new Map<string, (norm: string) => boolean>()

/** `highlighter`, cached per parsed query (and per query text + mode), so rows share one predicate. */
export function cachedHighlighter(parsed: ParsedQuery, key?: string): (norm: string) => boolean {
  let h = hlCache.get(parsed) ?? (key != null ? hlByText.get(key) : undefined)
  if (!h) {
    const base = highlighter(parsed)
    const memo = new Map<string, boolean>()
    h = (norm: string) => { let v = memo.get(norm); if (v === undefined) { v = base(norm); memo.set(norm, v) } return v }
    hlCache.set(parsed, h)
    if (key != null) { if (hlByText.size > 64) hlByText.clear(); hlByText.set(key, h) }
  }
  return h
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
  for (const w of [...phraseWords]) for (const syn of synonymsOf(w)) phraseWords.add(syn)
  const synWords = new Set(words.filter(w => w.wildcard === 'none').flatMap(w => synonymsOf(w.text)))
  return (norm: string) => phraseWords.has(norm) || synWords.has(norm) || phrasePrefixes.some(p => norm.startsWith(p)) || words.some(w => wordTermMatch(w, norm, branchMatch) > 0)
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

/**
 * Rubrics of a repertory that contain a remedy, filtered, in book order. Reads the remedy's slice
 * of the cached remedy index (no scan of the repertory) and the raw entry columns for co-remedies.
 */
export function remedyRubrics(rep: Repertory, remedyId: number, o: RemedySearchOptions = {}): RemedyHit[] {
  const ix = remedyIndex(rep)
  const [from, to] = ix.range(remedyId)
  const { offsets, data } = rep.rawEntries()
  const minG = o.minGrade ?? 1, maxG = o.maxGrade ?? 4
  const maxSize = o.maxSize ?? 0, minSize = o.minSize ?? 0, maxCo = o.maxCo ?? -1
  const start = o.start ?? 0, end = o.end ?? rep.size
  const out: RemedyHit[] = []
  for (let j = from; j < to; j++) {
    const i = ix.rubrics[j]
    if (i < start || i >= end) continue
    const grade = ix.grades[j] as Grade
    if (grade < minG || grade > maxG) continue
    const k0 = offsets[i], k1 = offsets[i + 1]
    const size = k1 - k0
    if (maxSize > 0 && size > maxSize) continue
    if (size < minSize) continue
    // other remedies at the same or a higher grade (grade code = grade - 1)
    let co = 0
    for (let k = k0; k < k1; k++) { const v = data[k]; if ((v & 3) + 1 >= grade && v >> 2 !== remedyId) co++ }
    if (maxCo >= 0 && co > maxCo) continue
    out.push({ index: i, grade, size, co })
  }
  return out
}

// ───────────────────────── result summary ─────────────────────────

export interface RemedyFrequency { remedyId: number; count: number; gradeSum: number; byGrade: [number, number, number, number] }

/** How often each remedy occurs across a set of rubrics (the "graphical" search summary). */
export function remedyFrequency(items: readonly { rep: Repertory; index: number }[], limit = 20): { top: RemedyFrequency[]; distinct: number } {
  const g = frequencyWork(items, limit)
  for (;;) { const r = g.next(); if (r.done) return r.value }
}

/** `remedyFrequency` in ~8 ms slices (the summary of 70k results must not block typing). */
export function remedyFrequencySliced(items: readonly { rep: Repertory; index: number }[], limit = 20, signal?: AbortSignal, sliceMs = SLICE_MS) {
  return runSliced(frequencyWork(items, limit), signal, sliceMs)
}

function* frequencyWork(items: readonly { rep: Repertory; index: number }[], limit: number): Work<{ top: RemedyFrequency[]; distinct: number }> {
  const map = new Map<number, RemedyFrequency>()
  let work = 0
  for (const { rep, index } of items) {
    rep.forEachRemedy(index, (id, g) => {
      let f = map.get(id)
      if (!f) { f = { remedyId: id, count: 0, gradeSum: 0, byGrade: [0, 0, 0, 0] }; map.set(id, f) }
      f.count++
      f.gradeSum += g
      f.byGrade[g - 1]++
    })
    if (++work >= 512) { work = 0; yield }
  }
  const all = [...map.values()].sort((a, b) => b.count - a.count || b.gradeSum - a.gradeSum || a.remedyId - b.remedyId)
  return { top: all.slice(0, limit), distinct: all.length }
}
