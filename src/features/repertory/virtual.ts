import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Index of the item containing pixel offset `y` in a prefix-sum array (offsets[i] = top of item i, offsets[n] = total). */
export function indexAt(offsets: ArrayLike<number>, count: number, y: number): number {
  if (count <= 0) return 0
  let lo = 0, hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Prefix sums of sizes: out[i] = sum(sizes[0..i)). */
export function prefixSums(count: number, size: (i: number) => number): Float64Array {
  const out = new Float64Array(count + 1)
  for (let i = 0; i < count; i++) out[i + 1] = out[i] + size(i)
  return out
}

/**
 * Viewport of the scroll element behind `ref`. The element is tracked by identity, not by ref
 * object: when the scroller unmounts and a new one mounts (a tab switch, a conditional render) the
 * listeners re-bind to the new element and the state is re-read.
 *
 * Scrolling does not re-render on every pixel: `topRef` always holds the live scrollTop, and state
 * (a re-render) changes only when the size changes or the range `rangeOf(top, height)` does. The
 * range is part of the state, so rendering reads no ref. Sizes come from a ResizeObserver and scroll
 * events only read scrollTop, so nothing here forces a layout after a DOM change.
 */
function useViewport(ref: RefObject<HTMLElement | null>, rangeOf: (top: number, height: number) => Range, initialHeight = 0) {
  // before the scroller is measured, the viewport is assumed `initialHeight` high: with a good guess
  // the first commit already shows every visible row, and the measured size only trims the overscan
  const [vp, setVp] = useState(() => ({ height: initialHeight, width: 0, ...rangeOf(0, initialHeight) }))
  const topRef = useRef(0)
  const sizeRef = useRef({ height: initialHeight, width: 0 })
  const rangeFn = useRef(rangeOf)
  useLayoutEffect(() => { rangeFn.current = rangeOf })
  /** The viewport state last committed (what the rendered rows cover). */
  const shownRef = useRef<Range | null>(null)
  useLayoutEffect(() => { shownRef.current = { start: vp.start, end: vp.end } }, [vp.start, vp.end])
  /**
   * Re-derive the range from the cached scroll position and size (no DOM reads). A range the rendered
   * one already covers (the measured viewport is smaller than assumed) is applied in a transition:
   * the extra rows are harmless until then, so a mount never re-renders the list synchronously.
   */
  const update = useCallback(() => {
    const { height, width } = sizeRef.current
    const r = rangeFn.current(topRef.current, height)
    const next = (v: typeof vp) => (v.start === r.start && v.end === r.end && v.height === height && v.width === width) ? v : { height, width, ...r }
    const shown = shownRef.current
    if (shown && shown.start <= r.start && shown.end >= r.end) startTransition(() => setVp(next))
    else setVp(next)
  }, [])
  const pending = useRef(0)
  // bind to the scroller behind `ref` by identity, after every commit (a remounted scroller is picked
  // up); binding reads its geometry once and needs no re-render of its own
  const bound = useRef<{ el: HTMLElement; unbind: () => void } | null>(null)
  const [, rebind] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (bound.current?.el === el) return
    bound.current?.unbind()
    bound.current = null
    if (!el) return
    topRef.current = el.scrollTop
    sizeRef.current = { height: el.clientHeight, width: el.clientWidth }
    update()
    const onScroll = () => { if (pending.current) return; topRef.current = el.scrollTop; update() }
    el.addEventListener('scroll', onScroll, { passive: true })
    // ResizeObserver callbacks run after layout: reading the client box there is free
    const ro = new ResizeObserver(() => {
      // the scroller left the document (a remount): bind to its replacement after a render
      if (!el.isConnected) { rebind(x => x + 1); return }
      sizeRef.current = { height: el.clientHeight, width: el.clientWidth }; update()
    })
    ro.observe(el)
    bound.current = {
      el,
      unbind: () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); if (pending.current) { cancelAnimationFrame(pending.current); pending.current = 0 } },
    }
  })
  useEffect(() => () => { bound.current?.unbind(); bound.current = null }, [])
  /**
   * Scroll to `top`: the range follows at once; with `defer` the DOM write (which makes the browser
   * lay out) waits for the next frame, where that layout happens anyway, instead of forcing one now.
   */
  const scrollTo = useCallback((top: number, defer: boolean) => {
    const s = ref.current
    if (!s) return
    topRef.current = top
    update()
    if (!defer) { if (pending.current) { cancelAnimationFrame(pending.current); pending.current = 0 } setScrollTop(s, top); return }
    if (!pending.current) pending.current = requestAnimationFrame(() => { pending.current = 0; const x = ref.current; if (x) setScrollTop(x, topRef.current) })
  }, [ref, update])
  return { vp, topRef, sizeRef, update, scrollTo }
}

type Range = { start: number; end: number }

/** Write a scroller's position (a DOM write; the element is not React state). */
function setScrollTop(el: HTMLElement, top: number) { el.scrollTo({ top }) }

/**
 * Track the element behind `ref` by identity. It is (re)read after the renders that can mount a
 * scroller (first mount, `bindKey` changed: the row count, the content) and when the bound one leaves
 * the document (its ResizeObserver reports that), so listeners re-bind to a remounted scroller.
 */
function useScrollerElement(ref: RefObject<HTMLElement | null>, el: HTMLElement | null, setEl: (e: HTMLElement | null) => void, bindKey: unknown) {
  // after every commit: a scroller can be remounted by a parent (a side tab re-opened) without any
  // of our inputs changing, and the identity check is free
  useLayoutEffect(() => {
    if (ref.current !== el) setEl(ref.current)
  })
  void bindKey
}

export function fixedRange(top: number, height: number, count: number, rowHeight: number, overscan: number): Range {
  const start = Math.max(0, Math.min(count, Math.floor(top / rowHeight) - overscan))
  const end = Math.max(start, Math.min(count, Math.ceil((top + height) / rowHeight) + overscan))
  return { start, end }
}

/**
 * Fixed row-height virtualisation (trees, pickers). `deferScroll`: keeping a row in view writes
 * scrollTop in the next animation frame (for a side pane that follows another view: its scroll
 * then never forces a layout of that view's fresh DOM inside the key press). `initialHeight`: the
 * viewport height assumed until the scroller is measured (a good guess mounts the rows in one pass).
 */
export function useFixedVirtual(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, overscan = 8, opts: { deferScroll?: boolean; initialHeight?: number } = {}) {
  const defer = !!opts.deferScroll
  const { vp, topRef, sizeRef, update, scrollTo } = useViewport(ref, (top, height) => fixedRange(top, height, count, rowHeight, overscan), opts.initialHeight)
  // the row count or height changed: the rendered range must be re-derived
  useLayoutEffect(update, [count, rowHeight, update])
  // until that update lands, the range from the state is clamped to the rows that exist
  const end = Math.min(vp.end, count)
  const start = Math.min(vp.start, end)
  // with `deferScroll` it uses the scroll position and height the viewport keeps (scroll events,
  // ResizeObserver), so keeping a row in view right after a render never forces a layout; otherwise
  // it reads them live (a caller may have just set scrollTop itself)
  const scrollToIndex = useCallback((i: number, align: 'auto' | 'center' = 'auto') => {
    const el = ref.current
    if (!el || i < 0) return
    const top = i * rowHeight
    const cur = defer ? topRef.current : el.scrollTop
    const h = defer ? sizeRef.current.height : el.clientHeight
    let next = cur
    if (align === 'center') next = Math.max(0, top - (h - rowHeight) / 2)
    else if (top < cur) next = top
    else if (top + rowHeight > cur + h) next = top + rowHeight - h
    next = Math.max(0, Math.min(next, count * rowHeight - h))
    if (Math.abs(next - cur) < 0.5) return
    scrollTo(next, defer)
  }, [ref, rowHeight, count, topRef, sizeRef, scrollTo, defer])
  return { start, end, total: count * rowHeight, scrollToIndex, pageSize: Math.max(1, Math.floor(vp.height / rowHeight) - 1) }
}

/**
 * Scroll position that keeps row `index` at `delta` px from the viewport top, clamped so the
 * row stays fully visible (its top wins when it is taller than the viewport).
 */
export function pinnedScrollTop(offsets: ArrayLike<number>, index: number, delta: number, viewport: number): number {
  const top = offsets[index], height = offsets[index + 1] - top
  let d = delta
  if (d + height > viewport) d = viewport - height
  if (d < 0) d = 0
  return Math.max(0, top - d)
}

/** Rebuild prefix sums in place from row `from` on: out[i + 1] = out[i] + size(i) for i >= from. */
export function rebuildPrefix(out: Float64Array, count: number, from: number, size: (i: number) => number) {
  for (let i = Math.max(0, from); i < count; i++) out[i + 1] = out[i] + size(i)
}

export interface VariableVirtualOptions {
  /** Row to keep fixed on screen when the layout is reset (display mode, filters, width): usually the current row. */
  focus?: number
  /** Identity of the item set; the focus row is only carried across resets that keep it. */
  contentKey?: unknown
  /** Rows rendered beyond the viewport on each side, px (default half a viewport, 120 to 480 px). */
  overscan?: number
  /**
   * Rows newly mounted per animation frame beyond the visible ones (default 8). A fling or a jump
   * mounts the rows on screen at once and grows the overscan by this many rows a frame, so no frame
   * builds a whole window of new rows.
   */
  mountsPerFrame?: number
  /**
   * Height store for a layout, by width bucket (8 px): Float32Arrays of `count` measured and
   * estimated heights (0 = not yet) that the caller keeps across mounts, so an estimate is computed
   * once and returning to a layout reuses its measurements. Default: fresh arrays per reset.
   */
  sizesFor?: (widthBucket: number) => { measured: Float32Array; estimated: Float32Array }
}

type Pin = { index: number; delta: number }

/** Row heights and offsets of one layout (content, row count, width bucket). Arrays are filled in place. */
export interface RowLayout { sizes: Float32Array; est: Float32Array; offsets: Float64Array; count: number; width: number }

/** The rows a window renders, for one layout. */
export interface RowRange { start: number; end: number; layout: RowLayout }

const EMPTY_LAYOUT: RowLayout = { sizes: new Float32Array(0), est: new Float32Array(0), offsets: new Float64Array(1), count: 0, width: 0 }

/** Build a layout: stored measurements when the caller keeps them, estimates for the rest. */
export function makeLayout(count: number, width: number, estimate: (i: number, width: number) => number, store?: { measured: Float32Array; estimated: Float32Array }): RowLayout {
  const ok = !!store && store.measured.length === count && store.estimated.length === count
  const L: RowLayout = { sizes: ok ? store.measured : new Float32Array(count), est: ok ? store.estimated : new Float32Array(count), offsets: new Float64Array(count + 1), count, width }
  rebuildPrefix(L.offsets, count, 0, i => L.sizes[i] || L.est[i] || (L.est[i] = estimate(i, width)))
  return L
}

/**
 * Next rows range: the target (viewport plus overscan) when it adds at most `cap` rows to what is
 * mounted; otherwise the visible rows (always, however many) and up to `cap` of the overscan, nearest
 * the visible rows first, keeping mounted rows that stay inside the target. Pure; unit-tested.
 */
/** Rows of `r` not in `cur` (the rows a window change would mount). */
export function freshRows(cur: { start: number; end: number }, r: { start: number; end: number }): number {
  return Math.max(0, r.end - r.start) - Math.max(0, Math.min(r.end, cur.end) - Math.max(r.start, cur.start))
}

export function cappedRange(cur: { start: number; end: number }, visible: { start: number; end: number }, target: { start: number; end: number }, cap: number): { start: number; end: number } {
  const fresh = (start: number, end: number) => freshRows(cur, { start, end })
  if (fresh(target.start, target.end) <= cap) return { start: target.start, end: target.end }
  // the visible rows, widened by mounted rows adjacent to them within the target
  let start = visible.start, end = visible.end
  if (cur.start < end && cur.end > start) { start = Math.max(target.start, Math.min(start, cur.start)); end = Math.min(target.end, Math.max(end, cur.end)) }
  let budget = cap
  // grow toward the target alternately below and above
  while (budget > 0 && (start > target.start || end < target.end)) {
    if (end < target.end) { end++; budget-- }
    if (budget > 0 && start > target.start) { start--; budget-- }
  }
  return { start, end }
}

/**
 * Mutable scrolling state of one variable-height list, outside React: the scroll position, the pin,
 * the current layout and the rows range. The hook below binds it to the DOM and to renders; rendering
 * reads it only through snapshot getters (the rows range for a layout).
 */
class VariableCore {
  el: HTMLElement | null = null
  top = 0
  height = 0
  lay: RowLayout = EMPTY_LAYOUT
  pin: Pin | null = null
  /** scrollTop we set last: its scroll event is ours and keeps the pin. */
  lastSet: number | null = null
  estimate: (i: number, width: number) => number = () => 24
  overscan: number | undefined
  mountsPerFrame = 8
  contentKey: unknown = undefined
  range: RowRange = { start: 0, end: 0, layout: EMPTY_LAYOUT }
  /** The start the window last rendered, which the window's position follows. */
  renderedStart = 0
  rangeListeners = new Set<() => void>()
  listeners = new Set<() => void>()
  canvasEl: HTMLElement | null = null
  windowEl: HTMLElement | null = null
  remeasure = false
  pendingWrite = 0
  growFrame = 0
  ro: ResizeObserver | null = null
  mounted = new Set<HTMLElement>()

  size = (i: number) => { const L = this.lay; return L.sizes[i] || L.est[i] || (L.est[i] = this.estimate(i, L.width)) }

  /** The rows on screen and the overscan target, for a layout. */
  bounds(L: RowLayout, top: number, height: number) {
    const { offsets: o, count: n } = L
    const ov = this.overscan ?? Math.min(480, Math.max(120, height / 2))
    const visible = { start: Math.min(n, indexAt(o, n, top)), end: Math.min(n, indexAt(o, n, top + height) + 1) }
    const target = { start: Math.max(0, indexAt(o, n, top - ov)), end: Math.min(n, indexAt(o, n, top + height + ov) + 1) }
    return { visible, target }
  }

  /**
   * The range a window renders for layout `L` (a snapshot: the same object until it changes). A layout
   * the core has not adopted yet (the render that resets it) gets its visible rows and a first part of
   * the overscan; the commit after it schedules the rest.
   */
  rangeFor = (L: RowLayout): RowRange => {
    if (this.range.layout === L) return this.range
    const { visible, target } = this.bounds(L, this.top, this.height)
    this.range = { ...cappedRange({ start: 0, end: 0 }, visible, target, this.mountsPerFrame), layout: L }
    return this.range
  }

  notify() { for (const fn of this.listeners) fn() }
  emitRange() { for (const fn of this.rangeListeners) fn() }

  /** Re-derive the rows range; only the window (not the whole view) re-renders when it changes. */
  refreshRange() {
    const L = this.lay
    const { visible, target } = this.bounds(L, this.top, this.height)
    const cur = this.range.layout === L ? this.range : { start: 0, end: 0 }
    // the budget is per frame: scroll events and measurements in one frame share it
    const next = cappedRange(cur, visible, target, Math.max(0, this.mountsPerFrame - this.spent))
    if (next.end < target.end || next.start > target.start) this.scheduleGrow()
    if (this.range.layout === L && next.start === cur.start && next.end === cur.end) return
    const extra = freshRows(cur, next) - freshRows(cur, visible)
    if (extra > 0) this.spend(extra)
    this.range = { ...next, layout: L }
    this.emitRange()
  }

  /** Overscan rows mounted in this frame so far (reset at the next frame). */
  spent = 0
  spentFrame = 0
  spend(n: number) {
    this.spent += n
    if (!this.spentFrame) this.spentFrame = requestAnimationFrame(() => { this.spentFrame = 0; this.spent = 0 })
  }

  /** Mount the rest of the overscan over the next frames, a few rows per frame. */
  scheduleGrow() {
    if (this.growFrame) return
    this.growFrame = requestAnimationFrame(() => { this.growFrame = 0; this.spent = 0; this.refreshRange() })
  }

  /** Put the window and canvas where the offsets say (imperative: React does not own these styles). */
  place() {
    const { offsets, count: n } = this.lay
    const c = this.canvasEl, w = this.windowEl
    const h = `${offsets[n]}px`, t = `translateY(${offsets[Math.min(this.renderedStart, n)]}px)`
    if (c && c.style.height !== h) c.style.height = h
    if (w && w.style.transform !== t) w.style.transform = t
  }

  writeScroll() {
    if (this.pendingWrite) { cancelAnimationFrame(this.pendingWrite); this.pendingWrite = 0 }
    if (this.el) setScrollTop(this.el, this.top)
  }

  /**
   * Scroll to `y`. The position takes effect at once for the range and anchors; the DOM write, which
   * makes the browser lay out, is left to the next animation frame, where that layout happens anyway:
   * a key press renders its rows in its own task and the frame lays them out once. In a
   * ResizeObserver callback (`now`) the write is immediate, so the correction is in this frame.
   */
  setScroll(y: number, now = false) {
    if (!this.el) return
    const { offsets, count: n } = this.lay
    const max = Math.max(0, offsets[n] - this.height)
    const t = Math.max(0, Math.min(max, y))
    if (Math.abs(t - this.top) <= 0.5) return
    this.top = t
    this.lastSet = t
    if (now) this.writeScroll()
    else if (!this.pendingWrite) this.pendingWrite = requestAnimationFrame(() => { this.pendingWrite = 0; this.writeScroll() })
  }

  /** Keep the pinned row (else the given anchor) in place after the offsets changed. */
  restore(anchor: Pin | null, now = false) {
    const p = this.pin
    if (p && p.index < this.lay.count) this.setScroll(pinnedScrollTop(this.lay.offsets, p.index, p.delta, this.height), now)
    else if (anchor) this.setScroll(this.lay.offsets[anchor.index] - anchor.delta, now)
  }

  /** The first visible row and its viewport offset, from the current offsets. */
  firstVisible(): Pin | null {
    const { offsets, count: n } = this.lay
    if (!n) return null
    const a = indexAt(offsets, n, this.top)
    return { index: a, delta: offsets[a] - this.top }
  }

  /** Adopt a new layout, carrying the focus row's on-screen position across when the content is the same. */
  adopt(L: RowLayout, focus: number | undefined, contentKey: unknown) {
    const old = this.lay
    if (!Object.is(this.contentKey, contentKey)) this.pin = null
    else if (focus != null && focus >= 0 && focus < L.count && old.count === L.count && old.offsets.length === L.count + 1) {
      const top = old.offsets[focus] - this.top, bottom = old.offsets[focus + 1] - this.top
      if (bottom > 0 && top < this.height) this.pin = { index: focus, delta: top }
    }
    this.contentKey = contentKey
    this.lay = L
    this.remeasure = true
  }

  /** Row measurements from the rows' ResizeObserver (border-box sizes, no layout reads). */
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
    this.place()
    this.restore(anchor)
    this.refreshRange()
    this.notify()
  }

  /**
   * After the view or its window rendered: place the window, keep the pinned row, and after a reset
   * have the rows that stayed mounted measured again (observing anew reports their current size, no
   * layout read).
   */
  commit() {
    this.place()
    this.restore(null)
    this.refreshRange()
    if (!this.remeasure) return
    this.remeasure = false
    const obs = this.ro
    if (obs) for (const m of this.mounted) { obs.unobserve(m); obs.observe(m) }
    this.notify()
  }

  dispose() {
    if (this.pendingWrite) { cancelAnimationFrame(this.pendingWrite); this.pendingWrite = 0 }
    if (this.growFrame) { cancelAnimationFrame(this.growFrame); this.growFrame = 0 }
    if (this.spentFrame) { cancelAnimationFrame(this.spentFrame); this.spentFrame = 0; this.spent = 0 }
  }
}

/**
 * Variable-height virtualisation with measured rows, for the book view.
 *
 * Rows are laid out in normal flow inside one window element, translated to the top of the first
 * rendered row; the canvas around it has the total height. Row heights are estimated until
 * rendered, then measured with a ResizeObserver (its border-box sizes, no layout reads). Offsets are
 * prefix sums kept in place and rebuilt only from the first row whose size changed; the window
 * position, canvas height and scroll correction are applied right in the observer callback, before
 * paint, so rows never jump. Rendered rows do not re-render when offsets change. A fling mounts the
 * visible rows first and the overscan over the following frames (`mountsPerFrame`).
 *
 * While measurements settle one row stays pinned at its viewport offset: the row last scrolled to or
 * anchored (the current row), or, after a layout reset, the focus row. A user scroll releases the
 * pin; the first visible row then anchors instead, so the view never jumps.
 */
export function useVariableVirtual(ref: RefObject<HTMLElement | null>, count: number, estimate: (i: number, width: number) => number, resetKey: unknown, opts: VariableVirtualOptions = {}) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useScrollerElement(ref, el, setEl, `${count}:${String(resetKey)}`)
  const [vp, setVp] = useState({ height: 0, width: 0 })
  const coreRef = useRef<VariableCore | null>(null)
  /** The core, created on first use (effects and callbacks only: rendering reads it through snapshots). */
  const getCore = useCallback(() => (coreRef.current ??= new VariableCore()), [])

  // reset: content, row count or width bucket changed. The layout is render data (a memo); the core
  // adopts it in the layout effect below, before anything reads its offsets.
  const widthBucket = Math.round(vp.width / 8)
  const { sizesFor } = opts
  const layout = useMemo(
    () => makeLayout(count, vp.width, estimate, sizesFor?.(widthBucket)),
    [resetKey, count, widthBucket], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const { focus, contentKey, overscan, mountsPerFrame } = opts
  useLayoutEffect(() => {
    const core = getCore()
    core.estimate = estimate
    core.overscan = overscan
    core.mountsPerFrame = mountsPerFrame ?? 8
  })
  useLayoutEffect(() => {
    const core = getCore()
    core.adopt(layout, focus, contentKey)
  }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  // scroll and size of the scroller
  useLayoutEffect(() => {
    const core = getCore()
    if (!el) return
    core.el = el
    core.top = el.scrollTop
    core.height = el.clientHeight
    // the viewport size comes from the ResizeObserver: its first report arrives before the first paint
    const onScroll = () => {
      // our own write is on its way: this event reports the position it replaces
      if (core.pendingWrite) return
      const top = el.scrollTop
      core.top = top
      // a scroll we did not cause (wheel, scrollbar, keys, find-in-page) releases the pin
      if (core.lastSet == null || Math.abs(top - core.lastSet) > 1) { core.pin = null; core.lastSet = null }
      core.refreshRange()
      core.notify()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // ResizeObserver callbacks run after layout: reading the client box there is free
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { setEl(ref.current); return }
      const height = el.clientHeight, width = el.clientWidth
      const grew = Math.abs(height - core.height) > 0.5
      core.height = height
      setVp(v => (v.height === height && v.width === width ? v : { height, width }))
      // a bar opened above or below the book: keep the pinned row in view
      if (grew) { core.restore(null, true); core.refreshRange(); core.notify() }
    })
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); core.dispose(); if (core.el === el) core.el = null }
  }, [el, getCore, ref])

  // row measurements
  useEffect(() => {
    const core = getCore()
    const obs = new ResizeObserver(entries => core.measured(entries))
    core.ro = obs
    for (const m of core.mounted) obs.observe(m)
    return () => { obs.disconnect(); core.ro = null }
  }, [getCore])

  const measure = useCallback((node: HTMLElement | null) => {
    const core = getCore()
    if (!node) return
    core.mounted.add(node)
    core.ro?.observe(node)
    return () => { core.mounted.delete(node); core.ro?.unobserve(node) }
  }, [getCore])

  // after the view rendered: place the window, keep the pinned row, re-measure after a reset
  useLayoutEffect(() => { getCore().commit() })

  /** Scroll row `index` into view and pin it there while heights settle. */
  const scrollToIndex = useCallback((index: number, align: 'auto' | 'start' | 'center' = 'auto') => {
    const core = getCore()
    const { offsets, count: n } = core.lay
    if (index < 0 || index >= n) return
    core.setScroll(targetScroll(core.top, core.height, offsets, index, align))
    core.lastSet = core.top
    core.pin = { index, delta: offsets[index] - core.top }
    core.refreshRange()
    core.notify()
  }, [getCore])

  /** Pin a row that is already on screen at its current position (e.g. the new current row). */
  const anchor = useCallback((index: number) => {
    const core = getCore()
    const { offsets, count: n } = core.lay
    if (index < 0 || index >= n) return
    core.lastSet = core.top
    core.pin = { index, delta: offsets[index] - core.top }
  }, [getCore])

  /** Whether row `index` is entirely inside the viewport. */
  const isVisible = useCallback((index: number) => {
    const core = getCore()
    const { offsets, count: n } = core.lay
    if (index < 0 || index >= n) return false
    return offsets[index] >= core.top - 0.5 && offsets[index + 1] <= core.top + core.height + 0.5
  }, [getCore])

  /** Listen to scrolling and layout changes (e.g. a running head); returns the unsubscribe. */
  const subscribe = useCallback((fn: () => void) => { const { listeners } = getCore(); listeners.add(fn); return () => { listeners.delete(fn) } }, [getCore])
  const getTop = useCallback(() => getCore().top, [getCore])
  const canvasRef = useCallback((node: HTMLElement | null) => { const core = getCore(); core.canvasEl = node; if (node) core.place() }, [getCore])
  const windowRef = useCallback((node: HTMLElement | null) => { const core = getCore(); core.windowEl = node; if (node) core.place() }, [getCore])

  const subscribeRange = useCallback((fn: () => void) => { const { rangeListeners } = getCore(); rangeListeners.add(fn); return () => { rangeListeners.delete(fn) } }, [getCore])
  const getRange = useCallback((L: RowLayout) => getCore().rangeFor(L), [getCore])
  const rendered = useCallback((r: RowRange) => { getCore().renderedStart = r.start }, [getCore])
  const afterRender = useCallback(() => { const core = getCore(); core.place(); core.restore(null) }, [getCore])
  /** Height of row `k` as far as it is known (measured, else estimated). */
  const sizeOf = useCallback((k: number) => {
    // the layout the window renders with (a reset's new layout before the core adopts it)
    const L = getCore().range.layout
    return k >= 0 && k < L.count ? (L.sizes[k] || L.est[k]) : 0
  }, [getCore])

  /** The live row offsets (prefix sums, mutated in place as rows are measured): read them in effects and callbacks. */
  const getOffsets = useCallback(() => getCore().lay.offsets, [getCore])
  return {
    getOffsets, layout, sizeOf,
    measure, scrollToIndex, anchor, isVisible, subscribe, getTop, canvasRef, windowRef,
    subscribeRange, getRange, rendered, afterRender,
    viewport: vp, scrollEl: el,
  }
}

export type VariableVirtual = ReturnType<typeof useVariableVirtual>

/**
 * The rows range of a variable virtualiser, for the component that renders the rows: it re-renders
 * when the range changes (scrolling), without re-rendering the view around it.
 */
export function useVirtualWindow(v: Pick<VariableVirtual, 'subscribeRange' | 'getRange' | 'rendered' | 'afterRender' | 'layout'>): { start: number; end: number } {
  const { subscribeRange, getRange, rendered, afterRender, layout } = v
  // a range change re-renders the window as an ordinary (batched, scheduled) update: the scroll events
  // and measurements of one frame render the rows once, after the event, not inside each of them
  const [, force] = useState(0)
  useLayoutEffect(() => subscribeRange(() => force(x => x + 1)), [subscribeRange])
  const r = getRange(layout)
  // the window's position follows the range the DOM shows, once it is committed
  useLayoutEffect(() => { rendered(r); afterRender() }, [r, rendered, afterRender])
  return { start: r.start, end: r.end }
}

export function targetScroll(top: number, h: number, offsets: ArrayLike<number>, index: number, align: 'auto' | 'start' | 'center'): number {
  const rowTop = offsets[index], bottom = offsets[index + 1]
  const margin = Math.min(48, h / 4)
  let next = top
  if (align === 'start') next = rowTop - margin
  else if (align === 'center') next = rowTop - (h - (bottom - rowTop)) / 3
  else if (rowTop < top + margin) next = rowTop - margin
  else if (bottom > top + h - margin) next = bottom - h + margin
  return Math.max(0, next)
}
