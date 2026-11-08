import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import { bookAbbrev } from './take'

/**
 * Row-height estimates for the book view, kept out of the component so a remount (a tab switch, a
 * display cycle) costs nothing:
 *
 * - `RemedyChars`: per rubric, the characters its remedy list takes in each display style (book
 *   abbreviations, full names) and minimum grade shown, in Int32Arrays built once per repertory in
 *   idle time (chunk by chunk, like the QuickFind paths). A chunk still missing when a row near the
 *   reader needs it is built on the spot (1024 rubrics, well under a millisecond).
 * - Rows far from the reader whose chunk is not built yet are estimated from the chapter's average
 *   characters per remedy entry, so no estimate ever walks a remedy list.
 * - `layoutSizes`: estimated and measured row heights per repertory, chapter, display mode and
 *   width bucket, so an estimate is computed once and coming back to a chapter or a display mode
 *   starts from the real heights.
 */

const CHUNK = 1024
/** Minimum grades the book can show (settings.minGradeShown). */
const GRADES = 3

/** Characters of each remedy in the book text, by remedy id, separator included. */
function remedyLengths(catalog: Catalog): { abbrev: Uint16Array; name: Uint16Array } {
  let max = 0
  for (const id of catalog.remedies.keys()) if (id > max) max = id
  const abbrev = new Uint16Array(max + 1).fill(6)
  const name = new Uint16Array(max + 1).fill(16)
  for (const r of catalog.remedies.values()) {
    abbrev[r.id] = bookAbbrev(r.abbrev, 1).length + 2
    name[r.id] = r.name.length + 2
  }
  return { abbrev, name }
}
const lengthsCache = new WeakMap<Catalog, { abbrev: Uint16Array; name: Uint16Array }>()
const lengthsOf = (c: Catalog) => { let l = lengthsCache.get(c); if (!l) { l = remedyLengths(c); lengthsCache.set(c, l) } return l }

export class RemedyChars {
  /** [minGrade - 1][rubric]: characters of the remedies of at least that grade, abbreviations. */
  private readonly abbrev: Int32Array[]
  /** Same with full names. */
  private readonly name: Int32Array[]
  private readonly built: Uint8Array
  private builtCount = 0
  private nextChunk = 0
  /** Per chapter (index in rep.chapters), sums over the built chunks: entries per grade floor and their characters. */
  private readonly chEntries: Float64Array
  private readonly chAbbrev: Float64Array
  private readonly chName: Float64Array
  private readonly rep: Repertory
  private readonly lens: { abbrev: Uint16Array; name: Uint16Array }

  constructor(rep: Repertory, catalog: Catalog) {
    this.rep = rep
    this.lens = lengthsOf(catalog)
    const n = rep.size
    this.abbrev = Array.from({ length: GRADES }, () => new Int32Array(n))
    this.name = Array.from({ length: GRADES }, () => new Int32Array(n))
    this.built = new Uint8Array(Math.ceil(n / CHUNK))
    const chapters = rep.chapters.length
    this.chEntries = new Float64Array(chapters * GRADES)
    this.chAbbrev = new Float64Array(chapters * GRADES)
    this.chName = new Float64Array(chapters * GRADES)
  }

  get ready(): boolean { return this.builtCount === this.built.length }

  /** Whether rubric i's exact character counts are available without building anything. */
  has(i: number): boolean { return this.built[(i / CHUNK) | 0] === 1 }

  /** Characters of rubric i's remedy list (grade ≥ minGrade) in the given style; builds its chunk if needed. */
  chars(i: number, names: boolean, minGrade: number): number {
    const c = (i / CHUNK) | 0
    if (!this.built[c]) this.buildChunk(c)
    const m = Math.min(GRADES, Math.max(1, minGrade)) - 1
    return (names ? this.name : this.abbrev)[m][i]
  }

  /**
   * Average characters per remedy entry of a chapter (0-based chapter number), counting only
   * entries of grade ≥ minGrade but dividing by all entries, so `remedyCount(i) * average` estimates
   * a rubric's list. From the chunks built so far; a book-wide fallback before any.
   */
  average(chapter: number, names: boolean, minGrade: number): number {
    const m = Math.min(GRADES, Math.max(1, minGrade)) - 1
    const all = this.chEntries[chapter * GRADES]
    if (all > 0) return (names ? this.chName : this.chAbbrev)[chapter * GRADES + m] / all
    return (names ? 18 : 7) / (m + 1)
  }

  private buildChunk(c: number) {
    if (this.built[c]) return
    const { offsets, data } = this.rep.rawEntries()
    const { abbrev: al, name: nl } = this.lens
    const [a1, a2, a3] = this.abbrev
    const [n1, n2, n3] = this.name
    const from = c * CHUNK, to = Math.min(this.rep.size, from + CHUNK)
    for (let i = from; i < to; i++) {
      let sa1 = 0, sa2 = 0, sa3 = 0, sn1 = 0, sn2 = 0, sn3 = 0, e2 = 0, e3 = 0
      const end = offsets[i + 1]
      for (let k = offsets[i]; k < end; k++) {
        const v = data[k], id = v >> 2, g = (v & 3) + 1
        const a = al[id] ?? 6, nm = nl[id] ?? 16
        sa1 += a; sn1 += nm
        if (g >= 2) { sa2 += a; sn2 += nm; e2++ }
        if (g >= 3) { sa3 += a; sn3 += nm; e3++ }
      }
      a1[i] = sa1; a2[i] = sa2; a3[i] = sa3
      n1[i] = sn1; n2[i] = sn2; n3[i] = sn3
      const ch = this.rep.chapterOf(i) * GRADES
      this.chEntries[ch] += end - offsets[i]
      this.chEntries[ch + 1] += e2
      this.chEntries[ch + 2] += e3
      this.chAbbrev[ch] += sa1; this.chAbbrev[ch + 1] += sa2; this.chAbbrev[ch + 2] += sa3
      this.chName[ch] += sn1; this.chName[ch + 1] += sn2; this.chName[ch + 2] += sn3
    }
    this.built[c] = 1
    this.builtCount++
  }

  /** Build chunks in book order until `deadline()` says stop; true when the whole book is done. */
  build(deadline?: () => boolean): boolean {
    while (this.nextChunk < this.built.length) {
      this.buildChunk(this.nextChunk++)
      if (deadline?.() && this.nextChunk < this.built.length) return false
    }
    return true
  }
}

const charsCache = new WeakMap<Repertory, RemedyChars>()
export function remedyChars(rep: Repertory, catalog: Catalog): RemedyChars {
  let rc = charsCache.get(rep)
  if (!rc) { rc = new RemedyChars(rep, catalog); charsCache.set(rep, rc) }
  return rc
}

/** Longest main-thread slice of the background build (ms): well under a 50 ms long task. */
const IDLE_SLICE_MS = 10

type IdleDeadline = { timeRemaining(): number; didTimeout: boolean }
type IdleGlobal = { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number }
function whenIdle(fn: (d: IdleDeadline) => void) {
  const ric = (globalThis as IdleGlobal).requestIdleCallback
  if (ric) ric(fn, { timeout: 4000 })
  else setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: false }), 50)
}

/** Build a repertory's remedy character counts in idle slices (after it loads). */
export function scheduleRemedyChars(rep: Repertory, catalog: Catalog) {
  const rc = remedyChars(rep, catalog)
  if (rc.ready) return
  // one short slice per idle callback, also when the callback timed out, so no slice is a long task
  const step = (d: IdleDeadline) => {
    const t0 = performance.now()
    if (!rc.build(() => performance.now() - t0 > IDLE_SLICE_MS || (!d.didTimeout && d.timeRemaining() < 2))) whenIdle(step)
  }
  whenIdle(step)
}

export interface EstimateParams {
  showRemedies: boolean
  names: boolean
  minGrade: number
  /** Book font size and line height, px. */
  fs: number
  lineH: number
  /** Width of the book text column, px (0 before the first layout). */
  width: number
}

/** Rows within this distance of the focus row get exact character counts (building their chunks). */
export const NEAR_ROWS = 1500

/**
 * Book metrics shared by the view and the estimates (px at font scale 1): where the text starts in
 * a column (after the gutter with the selection hand), where the selection band starts, the right
 * padding, the indent per level, and the chapter heading block above a chapter's own remedies.
 */
export const BOOK = { text: 50, band: 38, right: 40, indent: 10, head: 77 } as const

/**
 * Indent of a rubric line (px): the first line starts at the rubric's level marker; wrapped lines
 * hang there too down to level 4, deeper levels (5 and on) wrap at the level-4 indent as in RadarOpus.
 */
export function lineIndent(depth: number): { pad: number; first: number } {
  const hang = Math.min(depth, 4)
  return { pad: BOOK.text + (hang - 1) * BOOK.indent, first: (depth - hang) * BOOK.indent }
}

/**
 * Vertical rhythm of the book: wrapped lines are `lineH` apart, but a rubric's first line starts
 * closer to the previous rubric (17px against 20px at zoom 1). Each block's lines are pulled up by
 * `top` and the block ends `bottom` before its last line box, so a block of n lines is
 * n * lineH - top - bottom tall. (RadarOpus sets a rubric's second line 17px below its first; a
 * shorter first line box cannot be had in CSS: `::first-line` line-height does not shrink the
 * block's strut in standards mode.)
 */
export function lineTrim(lineH: number): { top: number; bottom: number } {
  return { top: Math.round(lineH / 9), bottom: Math.round(lineH / 18) }
}

/**
 * Estimated height of rubric i in a book column of `p.width` px: its lines indented by level,
 * text, count and remedies wrapping at that indent, whole lines of `lineH`. O(1): exact
 * character counts when built (or `near`, which builds them), else the chapter average.
 */
export function estimateRow(rep: Repertory, rc: RemedyChars, i: number, p: EstimateParams, near: boolean, note: boolean): number {
  const depth = rep.depth(i)
  const total = rep.remedyCount(i)
  let rem = 0
  if (p.showRemedies && total > 0) {
    rem = near || rc.has(i) ? rc.chars(i, p.names, p.minGrade) : total * rc.average(rep.chapterOf(i), p.names, p.minGrade)
  }
  // insets and indents scale with the zoom (z = 1 at 14px), as the view draws them
  const z = p.fs / 14
  const avail = Math.max(120, (p.width || 600) - (BOOK.text + BOOK.right) * z)
  // Verdana: about half the font size per character of an abbreviation list (separators included)
  const remW = rem * p.fs * 0.5
  const noteH = note ? p.lineH : 0
  const t = lineTrim(p.lineH)
  const trim = t.top + t.bottom
  if (depth === 0) {
    const lines = total > 0 ? Math.ceil((remW + 6 * p.fs * 0.6) / avail) : 0
    return BOOK.head + (lines ? lines * p.lineH - trim : 0) + noteH
  }
  // a sub-rubric's lines hang at its level indent (at most the level-4 indent)
  const ind = lineIndent(depth)
  const textW = (rep.text(i).length + (total > 0 ? 7 : 2)) * p.fs * (depth === 1 ? 0.72 : 0.62) + ind.first * z
  const lines = Math.max(1, Math.ceil((textW + remW) / Math.max(80, avail - (ind.pad - BOOK.text) * z)))
  return lines * p.lineH - trim + noteH
}

/** Row heights of one layout: measured (0 = not yet) and estimated (0 = not yet computed). */
export interface LayoutSizes { measured: Float32Array; estimated: Float32Array }

/**
 * Row heights per layout (repertory, chapter, display mode, grade filter, line height, width
 * bucket), kept outside the component; the least recently used layouts are dropped.
 */
const layouts = new Map<string, LayoutSizes>()
const MAX_LAYOUTS = 24
export function layoutSizes(key: string, count: number): LayoutSizes {
  let s = layouts.get(key)
  if (s && s.measured.length === count) { layouts.delete(key); layouts.set(key, s); return s }
  s = { measured: new Float32Array(count), estimated: new Float32Array(count) }
  layouts.set(key, s)
  if (layouts.size > MAX_LAYOUTS) layouts.delete(layouts.keys().next().value!)
  return s
}
