import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { flushSync } from 'react-dom'
import { cappedRange, indexAt, makeLayout, rebuildPrefix } from './virtual'
import type { RowLayout } from './virtual'

/**
 * Two-column ("newspaper") virtualisation for the book view.
 *
 * The book is one flow of rubric blocks laid out at column width, with measured (else estimated)
 * heights and prefix-sum offsets. The viewport shows that flow twice side by side: column 1 shows
 * [Y, B) and column 2 shows [B, B + H), where Y is the scroll position, H the column height and B
 * the split point: Y + H moved back to the start of the line it cuts, so a rubric that runs over
 * continues in column 2 with a whole line (as in a printed book). Only the rubrics around the two
 * columns are rendered; a rubric that runs over the split is rendered in both columns (the second
 * copy is a presentational continuation, clipped at the top of column 2).
 *
 * The scroller is native (wheel, scrollbar): it holds a sticky block of height H (the columns) and
 * a spacer, so scrollTop is Y directly. The columns' windows are positioned imperatively on scroll
 * and on measurement, so scrolling re-renders only when the rendered rows change.
 */

/** Split point of a two-column page: column 1 shows [y, split) of the flow. */
export function splitAt(offsets: ArrayLike<number>, count: number, y: number, h: number, gridTop: (k: number) => number, lineH: number): number {
  const total = offsets[count]
  const end = y + h
  if (count <= 0 || end >= total) return Math.max(y, Math.min(end, total))
  const k = indexAt(offsets, count, end)
  const top = gridTop(k)
  // inside a header (no line grid there): the whole rubric goes to column 2
  let b = end <= top ? offsets[k] : top + Math.floor((end - top) / lineH + 1e-6) * lineH
  // the first line box may start above the block (trimmed blocks): never cut into the previous rubric
  if (b < offsets[k]) b = offsets[k]
  if (b > end) b = end
  // nothing of column 1 would be left (a block taller than the column): cut where the column ends
  if (b <= y + 0.5) b = end
  return b
}

/** Rows a two-column page renders: [start, c1End) in column 1 and [c2Start, end) in column 2. */
export interface ColRange { start: number; end: number; c1End: number; c2Start: number }

/** Split a rows range at the split point `b` (a row across it is in both columns). Pure. */
export function splitRange(offsets: ArrayLike<number>, count: number, r: { start: number; end: number }, b: number): ColRange {
  if (count <= 0 || b >= offsets[count] - 0.5) return { start: r.start, end: r.end, c1End: r.end, c2Start: r.end }
  const s = indexAt(offsets, count, b)
  const straddles = offsets[s] < b - 0.5
  return {
    start: r.start, end: r.end,
    c1End: Math.max(r.start, Math.min(r.end, straddles ? s + 1 : s)),
    c2Start: Math.min(r.end, Math.max(r.start, s)),
  }
}

/**
 * Scroll position that shows row k: unchanged when it is entirely on the page, else the row at the
 * top of column 1 (scrolling up) or its bottom at the bottom of column 2 (scrolling down; its top
 * wins for a row taller than that). Pure.
 */
export function revealTop(offsets: ArrayLike<number>, count: number, top: number, h: number, k: number, gridTop: (k: number) => number, lineH: number): number {
  const b = splitAt(offsets, count, top, h, gridTop, lineH)
  if (offsets[k] >= top - 0.5 && offsets[k + 1] <= b + h + 0.5) return top
  if (offsets[k] < top) return offsets[k]
  let y = Math.max(top, offsets[k + 1] - 2 * h)
  // the split moves in whole lines, so a step smaller than a line may not move it: keep stepping
  for (let n = 0; n < 64; n++) {
    const d = offsets[k + 1] - (splitAt(offsets, count, y, h, gridTop, lineH) + h)
    if (d <= 0.5) break
    y += Math.max(1, Math.min(d, lineH))
  }
  return Math.min(y, offsets[k])
}

/** Whether row k starts on the page and its first line is visible (column 1 or 2). Pure. */
export function firstLineOnPage(offsets: ArrayLike<number>, count: number, top: number, h: number, k: number, gridTop: (k: number) => number, lineH: number): boolean {
  if (k < 0 || k >= count || offsets[k] < top - 0.5) return false
  const b = splitAt(offsets, count, top, h, gridTop, lineH)
  const lineEnd = Math.min(offsets[k + 1], gridTop(k) + lineH)
  // the split falls between lines, so a first line that ends before column 2 does is on the page
  return lineEnd <= b + h + 0.5
}

type Pin = { index: number; delta: number }

/** The rows' base offset moves in steps of this many px (a step repositions every mounted row). */
const BASE_SPAN = 32768

interface Els { sticky: HTMLElement | null; clip: HTMLElement | null; win1: HTMLElement | null; win2: HTMLElement | null; spacer: HTMLElement | null }

const EMPTY: RowLayout = { sizes: new Float32Array(0), est: new Float32Array(0), offsets: new Float64Array(1), count: 0, width: 0 }

/** Mutable scrolling state of the two-column book, outside React (the hook binds it). */
class ColumnCore {
  el: HTMLElement | null = null
  top = 0
  height = 0
  lay: RowLayout = EMPTY
  lineH = 18
  /** Height of the block above row k's line grid (a chapter heading), px. */
  headOf: (k: number) => number = () => 0
  estimate: (i: number, width: number) => number = () => 18
  pin: Pin | null = null
  /** Space left above row k revealed at the top of column 1, px. */
  topGap: (k: number) => number = () => 0
  lastSet: number | null = null
  contentKey: unknown = undefined
  mountsPerFrame = 12
  range: ColRange & { layout: RowLayout } = { start: 0, end: 0, c1End: 0, c2Start: 0, layout: EMPTY }
  /** The range the DOM shows (the windows are positioned from it). */
  shown: ColRange = { start: 0, end: 0, c1End: 0, c2Start: 0 }
  els: Els = { sticky: null, clip: null, win1: null, win2: null, spacer: null }
  /** Flow offset the rows of both windows are positioned from (see place). */
  base = 0
  layBase: RowLayout | null = null
  listeners = new Set<() => void>()
  rangeListeners = new Set<() => void>()
  ro: ResizeObserver | null = null
  mounted = new Set<HTMLElement>()
  remeasure = false
  pendingWrite = 0
  growFrame = 0
  spent = 0
  spentFrame = 0

  size = (i: number) => { const L = this.lay; return L.sizes[i] || L.est[i] || (L.est[i] = this.estimate(i, L.width)) }
  gridTop = (k: number) => this.lay.offsets[k] + this.headOf(k)
  split(top = this.top) { const L = this.lay; return splitAt(L.offsets, L.count, top, this.height, this.gridTop, this.lineH) }
  maxTop() { const L = this.lay; return Math.max(0, Math.round(L.offsets[L.count] - 2 * this.height + 2 * this.lineH)) }

  compute(L: RowLayout, cur: { start: number; end: number }, budget: number): ColRange & { grow: boolean } {
    const { offsets: o, count: n } = L
    if (!n || this.height <= 0) {
      // not measured yet: a first screenful from the top of the position
      const s = Math.min(n, indexAt(o, n, this.top))
      return { start: s, end: Math.min(n, s + 40), c1End: Math.min(n, s + 40), c2Start: Math.min(n, s + 40), grow: false }
    }
    const b = splitAt(o, n, this.top, this.height, k => o[k] + this.headOf(k), this.lineH)
    // ahead of the page by about a column: rows mount (and are measured by the observer) before they show
    const ov = Math.min(900, Math.max(240, this.height))
    const visible = { start: indexAt(o, n, this.top), end: Math.min(n, indexAt(o, n, b + this.height) + 1) }
    const target = { start: indexAt(o, n, Math.max(0, this.top - ov)), end: Math.min(n, indexAt(o, n, b + this.height + ov) + 1) }
    const r = cappedRange(cur, visible, target, budget)
    return { ...splitRange(o, n, r, b), grow: r.start > target.start || r.end < target.end }
  }

  rangeFor = (L: RowLayout) => {
    if (this.range.layout === L) return this.range
    const { grow, ...r } = this.compute(L, { start: 0, end: 0 }, this.mountsPerFrame)
    void grow
    this.range = { ...r, layout: L }
    return this.range
  }

  refreshRange() {
    const L = this.lay
    const cur = this.range.layout === L ? this.range : { start: 0, end: 0 }
    const { grow, ...next } = this.compute(L, cur, Math.max(0, this.mountsPerFrame - this.spent))
    if (grow) this.scheduleGrow()
    const r = this.range
    if (r.layout === L && r.start === next.start && r.end === next.end && r.c1End === next.c1End && r.c2Start === next.c2Start) return
    const fresh = Math.max(0, next.end - next.start) - Math.max(0, Math.min(next.end, cur.end) - Math.max(next.start, cur.start))
    if (fresh > 0) this.spend(fresh)
    this.range = { ...next, layout: L }
    for (const fn of this.rangeListeners) fn()
  }

  spend(n: number) {
    this.spent += n
    if (!this.spentFrame) this.spentFrame = requestAnimationFrame(() => { this.spentFrame = 0; this.spent = 0 })
  }

  scheduleGrow() {
    if (this.growFrame) return
    this.growFrame = requestAnimationFrame(() => { this.growFrame = 0; this.spent = 0; this.refreshRange() })
  }

  notify() { for (const fn of this.listeners) fn() }

  /** Position the columns' windows, the column-1 clip and the scroll range (imperative styles). */
  place() {
    const { offsets: o, count: n } = this.lay
    const { sticky, clip, win1, win2, spacer } = this.els
    const r = this.shown
    const b = this.split()
    const set = (el: HTMLElement | null, prop: 'height' | 'transform', v: string) => { if (el && el.style[prop] !== v) el.style[prop] = v }
    set(sticky, 'height', `${this.height}px`)
    set(spacer, 'height', `${this.maxTop()}px`)
    set(clip, 'height', `${Math.max(0, Math.round(b - this.top))}px`)
    // rows stand at their flow offsets from a base that changes rarely: rows mounting or leaving at
    // the start of a window (or moving between the columns) leave the others in place, so their
    // painted text is kept
    const first = o[Math.min(r.start, n)]
    if (this.layBase !== this.lay || first < this.base || first - this.base > BASE_SPAN) {
      this.layBase = this.lay
      this.base = Math.floor(first / BASE_SPAN) * BASE_SPAN
    }
    const base = this.base
    for (const m of this.mounted) {
      const i = Number(m.dataset.vindex)
      if (!(i >= 0 && i < n)) continue
      const t = `${o[i] - base}px`
      if (m.style.top !== t) m.style.top = t
    }
    set(win1, 'transform', `translateY(${Math.round(base - this.top)}px)`)
    set(win2, 'transform', `translateY(${Math.round(base - b)}px)`)
  }

  writeScroll() {
    if (this.pendingWrite) { cancelAnimationFrame(this.pendingWrite); this.pendingWrite = 0 }
    if (this.el) this.el.scrollTop = this.top
  }

  /** Move to `y` (clamped). The view follows at once; the scroller's own position is written next frame. */
  setScroll(y: number, now = false) {
    const t = Math.max(0, Math.min(this.maxTop(), Math.round(y)))
    if (t === this.top) return
    this.top = t
    this.lastSet = t
    if (!this.el) return
    if (now) this.writeScroll()
    else if (!this.pendingWrite) this.pendingWrite = requestAnimationFrame(() => { this.pendingWrite = 0; this.writeScroll() })
  }

  firstVisible(): Pin | null {
    const { offsets: o, count: n } = this.lay
    if (!n) return null
    const a = indexAt(o, n, this.top)
    return { index: a, delta: o[a] - this.top }
  }

  restore(anchor: Pin | null) {
    const o = this.lay.offsets
    const p = this.pin && this.pin.index < this.lay.count ? this.pin : anchor
    if (p) this.setScroll(o[p.index] - p.delta)
  }

  /** Scroll as little as needed to keep the pinned rubric entirely on the page (after a resize). */
  revealPinned() {
    const p = this.pin, L = this.lay
    if (!p || p.index >= L.count) return
    this.setScroll(revealTop(L.offsets, L.count, L.offsets[p.index] - p.delta, this.height, p.index, this.gridTop, this.lineH))
    this.lastSet = this.top
    this.pin = { index: p.index, delta: L.offsets[p.index] - this.top }
  }

  /** Re-place after the offsets or the position changed. */
  settle() { this.refreshRange(); this.place(); this.notify() }

  adopt(L: RowLayout, focus: number | undefined, contentKey: unknown) {
    const old = this.lay
    if (!Object.is(this.contentKey, contentKey)) this.pin = null
    else if (focus != null && focus >= 0 && focus < L.count && old.count === L.count) {
      const d = old.offsets[focus] - this.top
      if (d + (old.offsets[focus + 1] - old.offsets[focus]) > 0 && d < 2 * this.height) this.pin = { index: focus, delta: d }
    }
    this.contentKey = contentKey
    this.lay = L
    this.remeasure = true
  }

  measured(entries: ResizeObserverEntry[]) {
    const L = this.lay
    let from = Infinity
    for (const e of entries) {
      const t = e.target as HTMLElement
      const i = Number(t.dataset.vindex)
      const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height
      if (h > 0 && i >= 0 && i < L.count && Math.abs(L.sizes[i] - h) > 0.5) { L.sizes[i] = h; if (i < from) from = i }
    }
    if (from === Infinity) return
    const anchor = this.pin ? null : this.firstVisible()
    rebuildPrefix(L.offsets, L.count, from, this.size)
    this.restore(anchor)
    this.settle()
  }

  /**
   * Measure the mounted rows whose height is not known yet, right after they rendered (one layout
   * per commit that mounts rows, which the frame would do anyway), so the page is placed from real
   * heights before it paints; later size changes arrive through the ResizeObserver. Only when one of
   * them is on the page: rows mounted ahead of the page wait for the observer.
   */
  measureNew(): boolean {
    const L = this.lay
    let from = Infinity
    const fresh: HTMLElement[] = []
    let onPage = false
    const { offsets: o, count: n } = L
    const first = n ? indexAt(o, n, this.top) : 0
    const last = n && this.height > 0 ? indexAt(o, n, this.split() + this.height) : n
    for (const m of this.mounted) {
      const i = Number(m.dataset.vindex)
      if (!(i >= 0 && i < L.count) || L.sizes[i]) continue
      fresh.push(m)
      if (i >= first && i <= last) onPage = true
    }
    // rows mounted around the page (scrolling ahead) are measured by the observer after the frame's
    // own layout: reading them here would force that layout inside the commit
    if (!onPage) return false
    for (const m of fresh) {
      const i = Number(m.dataset.vindex)
      const h = m.getBoundingClientRect().height
      if (h > 0) { L.sizes[i] = h; if (i < from) from = i }
    }
    if (from === Infinity) return false
    const anchor = this.pin ? null : this.firstVisible()
    rebuildPrefix(L.offsets, L.count, from, this.size)
    this.restore(anchor)
    return true
  }

  commit() {
    this.measureNew()
    this.restore(null)
    this.settle()
    if (!this.remeasure) return
    this.remeasure = false
    const obs = this.ro
    if (obs) for (const m of this.mounted) { obs.unobserve(m); obs.observe(m) }
  }

  dispose() {
    for (const k of ['pendingWrite', 'growFrame', 'spentFrame'] as const) { if (this[k]) cancelAnimationFrame(this[k]); this[k] = 0 }
    this.spent = 0
  }
}

export interface ColumnBookOptions {
  /** Row kept in place across layout resets (the current rubric). */
  focus?: number
  /** Identity of the rows; the focus row is carried across resets that keep it. */
  contentKey?: unknown
  /** Line height of the book text (column 1 breaks at a line). */
  lineH: number
  /** Height of the block above row k's lines (0 for ordinary rubrics). */
  headOf: (k: number) => number
  /** Width of the rule between the columns, px. */
  rule: number
  /** Space above row k revealed at the top of column 1 (a sliver of the line before it), px. */
  topGap?: number | ((k: number) => number)
  /** Height stores per width bucket (kept by the caller across mounts). */
  sizesFor?: (widthBucket: number) => { measured: Float32Array; estimated: Float32Array }
}

/** The two-column book's virtualiser. `estimate(i, columnWidth)` estimates row i's height. */
export function useColumnBook(ref: RefObject<HTMLElement | null>, count: number, estimate: (i: number, width: number) => number, resetKey: unknown, opts: ColumnBookOptions) {
  const coreRef = useRef<ColumnCore | null>(null)
  const getCore = useCallback(() => (coreRef.current ??= new ColumnCore()), [])
  const [el, setEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { if (ref.current !== el) setEl(ref.current) })
  const [vp, setVp] = useState({ height: 0, width: 0 })
  const vpRef = useRef(vp)
  vpRef.current = vp
  const colWidth = Math.max(0, Math.floor((vp.width - opts.rule) / 2))
  const widthBucket = Math.round(colWidth / 8)
  const { sizesFor, focus, contentKey } = opts
  const layout = useMemo(
    () => makeLayout(count, colWidth, estimate, sizesFor?.(widthBucket)),
    [resetKey, count, widthBucket], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useLayoutEffect(() => {
    const core = getCore()
    core.estimate = estimate
    core.lineH = opts.lineH
    core.headOf = opts.headOf
    const gap = opts.topGap ?? 0
    core.topGap = typeof gap === 'function' ? gap : () => gap
  })
  useLayoutEffect(() => { getCore().adopt(layout, focus, contentKey) }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const core = getCore()
    if (!el) return
    core.el = el
    // the first size is read here (not left to the observer's first report) so the first layout has the real column width
    core.height = el.clientHeight
    setVp(v => (v.height === el.clientHeight && v.width === el.clientWidth ? v : { height: el.clientHeight, width: el.clientWidth }))
    core.place()
    if (Math.abs(el.scrollTop - core.top) > 0.5) core.writeScroll()
    const onScroll = () => {
      if (core.pendingWrite) return
      const top = el.scrollTop
      if (Math.abs(top - core.top) < 0.5) return
      core.top = top
      // a scroll we did not cause (wheel, scrollbar) releases the pin
      if (core.lastSet == null || Math.abs(top - core.lastSet) > 1) { core.pin = null; core.lastSet = null }
      core.settle()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // the columns never scroll on their own (they clip, see book.css): should anything still scroll a box
    // inside the book (or the book sideways), it is put back, so column 2 always continues column 1
    const onInnerScroll = (e: Event) => {
      const t = e.target
      if (t === el) { if (el.scrollLeft) el.scrollLeft = 0; return }
      if (t instanceof HTMLElement && el.contains(t) && (t.scrollTop || t.scrollLeft)) { t.scrollTop = 0; t.scrollLeft = 0 }
    }
    el.addEventListener('scroll', onInnerScroll, { capture: true, passive: true })
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { setEl(ref.current); return }
      const height = el.clientHeight, width = el.clientWidth
      const changed = Math.abs(height - core.height) > 0.5
      core.height = height
      // a new width means a new layout: render it before this frame paints (flushSync from the
      // observer, which runs after layout), so the columns never show the old width's rows
      const widen = Math.abs(width - vpRef.current.width) > 0.5
      if (widen) flushSync(() => setVp({ height, width }))
      else setVp(v => (v.height === height && v.width === width ? v : { height, width }))
      // a bar opened above or below the book: the pinned rubric (the current one) stays on the page
      if (changed && core.pin) core.revealPinned()
      if (changed) { core.restore(null); core.settle() }
    })
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('scroll', onInnerScroll, { capture: true }); ro.disconnect(); core.dispose(); if (core.el === el) core.el = null }
  }, [el, getCore, ref])

  useEffect(() => {
    const core = getCore()
    const obs = new ResizeObserver(entries => core.measured(entries))
    core.ro = obs
    for (const m of core.mounted) obs.observe(m)
    return () => { obs.disconnect(); core.ro = null }
  }, [getCore])

  useLayoutEffect(() => { getCore().commit() })

  const measure = useCallback((node: HTMLElement | null) => {
    const core = getCore()
    if (!node) return
    core.mounted.add(node)
    core.ro?.observe(node)
    return () => { core.mounted.delete(node); core.ro?.unobserve(node) }
  }, [getCore])

  const elRef = (k: keyof Els) => (node: HTMLElement | null) => { const core = getCore(); core.els[k] = node; if (node) core.place() }
  const refs = useMemo(() => ({ sticky: elRef('sticky'), clip: elRef('clip'), win1: elRef('win1'), win2: elRef('win2'), spacer: elRef('spacer') }), []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Show row k: 'top' puts it at the top of column 1, 'nearest' scrolls only if it is not entirely on
   * the page, 'step' (arrowing) only if its first line is not on the page (then as 'nearest'). Pins it there.
   */
  const reveal = useCallback((k: number, how: 'top' | 'nearest' | 'step') => {
    const core = getCore()
    const { offsets: o, count: n } = core.lay
    if (k < 0 || k >= n) return
    // a jump leaves a sliver of the previous line above the target, as RadarOpus does
    const y = how === 'top' ? o[k] - (k > 0 ? core.topGap(k) : 0)
      : how === 'step' && firstLineOnPage(o, n, core.top, core.height, k, core.gridTop, core.lineH) ? core.top
      : revealTop(o, n, core.top, core.height, k, core.gridTop, core.lineH)
    core.setScroll(y)
    core.lastSet = core.top
    core.pin = { index: k, delta: o[k] - core.top }
    core.settle()
  }, [getCore])

  /** Whether row k is entirely on the page (column 1 or 2). */
  const isVisible = useCallback((k: number) => {
    const core = getCore()
    const { offsets: o, count: n } = core.lay
    if (k < 0 || k >= n) return false
    return o[k] >= core.top - 0.5 && o[k + 1] <= core.split() + core.height + 0.5
  }, [getCore])

  /** Scroll to a flow position (Back/Forward restore), keeping row `pin` there while heights settle. */
  const scrollToTop = useCallback((y: number, pinRow?: number) => {
    const core = getCore()
    core.setScroll(y)
    core.lastSet = core.top
    const o = core.lay.offsets
    core.pin = pinRow != null && pinRow >= 0 && pinRow < core.lay.count ? { index: pinRow, delta: o[pinRow] - core.top } : null
    core.settle()
  }, [getCore])

  /** Row at the top of column 1, at the bottom of column 2, and the page height (both columns). */
  const page = useCallback(() => {
    const core = getCore()
    const { offsets: o, count: n } = core.lay
    const b = core.split()
    return { first: indexAt(o, n, core.top), last: indexAt(o, n, Math.max(core.top, b + core.height - 1)), height: b - core.top + core.height }
  }, [getCore])

  const getTop = useCallback(() => getCore().top, [getCore])
  const subscribe = useCallback((fn: () => void) => { const s = getCore().listeners; s.add(fn); return () => { s.delete(fn) } }, [getCore])
  const subscribeRange = useCallback((fn: () => void) => { const s = getCore().rangeListeners; s.add(fn); return () => { s.delete(fn) } }, [getCore])
  const getRange = useCallback((L: RowLayout) => getCore().rangeFor(L), [getCore])
  const rendered = useCallback((r: ColRange) => { const core = getCore(); core.shown = r; if (core.measureNew()) core.settle(); else core.place() }, [getCore])
  const getOffsets = useCallback(() => getCore().lay.offsets, [getCore])
  /** The scroller's scroll height (columns and spacer), without reading layout; `subscribe` tells changes. */
  const extent = useMemo(() => ({ subscribe, get: () => { const core = getCore(); return core.height + core.maxTop() } }), [getCore, subscribe])

  return { layout, refs, measure, reveal, isVisible, scrollToTop, page, getTop, subscribe, subscribeRange, getRange, rendered, getOffsets, extent, viewport: vp, colWidth }
}

export type ColumnBook = ReturnType<typeof useColumnBook>

/** The rows of the two columns, for the component that renders them (re-renders when they change). */
export function useColumnWindow(book: Pick<ColumnBook, 'subscribeRange' | 'getRange' | 'rendered' | 'layout'>): ColRange {
  const { subscribeRange, getRange, rendered, layout } = book
  const [, force] = useState(0)
  useLayoutEffect(() => subscribeRange(() => force(x => x + 1)), [subscribeRange])
  const r = getRange(layout)
  useLayoutEffect(() => { rendered(r) }, [r, rendered])
  return r
}
