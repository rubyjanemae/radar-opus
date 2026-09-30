import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
 * (a re-render) changes only when the size changes or `rangeKey(top, height)` does, i.e. when the
 * range of rendered rows changes. Sizes come from a ResizeObserver and scroll events only read
 * scrollTop, so nothing here forces a layout after a DOM change.
 */
function useViewport(ref: RefObject<HTMLElement | null>, rangeKey: (top: number, height: number) => string, bindKey: unknown) {
  const [vp, setVp] = useState({ height: 0, width: 0, key: '' })
  const [el, setEl] = useState<HTMLElement | null>(null)
  const topRef = useRef(0)
  const sizeRef = useRef({ height: 0, width: 0 })
  const keyFn = useRef(rangeKey)
  keyFn.current = rangeKey
  useScrollerElement(ref, el, setEl, bindKey)
  /** Re-derive the range from the cached scroll position and size (no DOM reads). */
  const update = useCallback(() => {
    const { height, width } = sizeRef.current
    const key = keyFn.current(topRef.current, height)
    setVp(v => (v.key === key && v.height === height && v.width === width) ? v : { height, width, key })
  }, [])
  useLayoutEffect(() => {
    if (!el) return
    // a newly bound scroller: one read of its geometry
    topRef.current = el.scrollTop
    sizeRef.current = { height: el.clientHeight, width: el.clientWidth }
    update()
    const onScroll = () => { if (pending.current) return; topRef.current = el.scrollTop; update() }
    el.addEventListener('scroll', onScroll, { passive: true })
    // ResizeObserver callbacks run after layout: reading the client box there is free
    const ro = new ResizeObserver(() => {
      // the scroller left the document (a remount): bind to its replacement
      if (!el.isConnected) { setEl(ref.current); return }
      sizeRef.current = { height: el.clientHeight, width: el.clientWidth }; update()
    })
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); if (pending.current) { cancelAnimationFrame(pending.current); pending.current = 0 } }
  }, [el, ref, update])
  /**
   * Scroll to `top`: the range follows at once; with `defer` the DOM write (which makes the browser
   * lay out) waits for the next frame, where that layout happens anyway, instead of forcing one now.
   */
  const pending = useRef(0)
  const scrollTo = useCallback((top: number, defer: boolean) => {
    const s = ref.current
    if (!s) return
    topRef.current = top
    update()
    if (!defer) { if (pending.current) { cancelAnimationFrame(pending.current); pending.current = 0 } s.scrollTop = top; return }
    if (!pending.current) pending.current = requestAnimationFrame(() => { pending.current = 0; const x = ref.current; if (x) x.scrollTop = topRef.current })
  }, [ref, update])
  return { vp, el, topRef, sizeRef, update, scrollTo }
}

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

function fixedRange(top: number, height: number, count: number, rowHeight: number, overscan: number) {
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((top + height) / rowHeight) + overscan)
  return { start, end }
}

/**
 * Fixed row-height virtualisation (trees, pickers). `deferScroll`: keeping a row in view writes
 * scrollTop in the next animation frame (for a side pane that follows another view: its scroll
 * then never forces a layout of that view's fresh DOM inside the key press).
 */
export function useFixedVirtual(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, overscan = 8, opts: { deferScroll?: boolean } = {}) {
  const defer = !!opts.deferScroll
  const { vp, topRef, sizeRef, update, scrollTo } = useViewport(ref, (top, height) => { const r = fixedRange(top, height, count, rowHeight, overscan); return `${r.start}:${r.end}` }, count)
  // the row count or height changed: the rendered range must be re-derived
  useLayoutEffect(update, [count, rowHeight, update])
  const { start, end } = fixedRange(topRef.current, vp.height, count, rowHeight, overscan)
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
  /** Rows rendered beyond the viewport on each side, px (default half a viewport). */
  overscan?: number
  /**
   * Height store for a layout, by width bucket (8 px): Float32Arrays of `count` measured and
   * estimated heights (0 = not yet) that the caller keeps across mounts, so an estimate is computed
   * once and returning to a layout reuses its measurements. Default: fresh arrays per reset.
   */
  sizesFor?: (widthBucket: number) => { measured: Float32Array; estimated: Float32Array }
}

type Pin = { index: number; delta: number }

/**
 * Variable-height virtualisation with measured rows, for the book view.
 *
 * Rows are laid out in normal flow inside one window element, translated to the top of the first
 * rendered row; the canvas around it has the total height. Row heights are estimated until
 * rendered, then measured with a ResizeObserver (its border-box sizes, no layout reads). Offsets are
 * prefix sums kept in place and rebuilt only from the first row whose size changed; the window
 * position, canvas height and scroll correction are applied right in the observer callback, before
 * paint, so rows never jump. Rendered rows do not re-render when offsets change.
 *
 * While measurements settle one row stays pinned at its viewport offset: the row last scrolled to or
 * anchored (the current row), or, after a layout reset, the focus row. A user scroll releases the
 * pin; the first visible row then anchors instead, so the view never jumps.
 */
export function useVariableVirtual(ref: RefObject<HTMLElement | null>, count: number, estimate: (i: number, width: number) => number, resetKey: unknown, opts: VariableVirtualOptions = {}) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useScrollerElement(ref, el, setEl, `${count}:${String(resetKey)}`)
  const [vp, setVp] = useState({ height: 0, width: 0 })
  const [version, setVersion] = useState(0)

  const topRef = useRef(0)
  const heightRef = useRef(0)
  const lay = useRef<{ sizes: Float32Array; est: Float32Array; offsets: Float64Array; count: number; width: number }>({ sizes: new Float32Array(0), est: new Float32Array(0), offsets: new Float64Array(1), count: 0, width: 0 })
  const pin = useRef<Pin | null>(null)
  /** scrollTop we set last: its scroll event is ours and keeps the pin. */
  const lastSet = useRef<number | null>(null)
  const estimateRef = useRef(estimate)
  estimateRef.current = estimate
  const optsRef = useRef(opts)
  optsRef.current = opts
  const contentRef = useRef<unknown>(opts.contentKey)
  /** The rows range: what the window shows (or will show once it re-renders). */
  const range = useRef({ start: 0, end: 0, key: '' })
  /** The start the window last rendered, which the window's position follows. */
  const renderedStart = useRef(0)
  const renderedKey = useRef('')
  const rangeListeners = useRef(new Set<() => void>())
  const canvasEl = useRef<HTMLElement | null>(null)
  const windowEl = useRef<HTMLElement | null>(null)
  const listeners = useRef(new Set<() => void>())
  const remeasure = useRef(false)

  const size = (i: number) => {
    const L = lay.current
    return L.sizes[i] || L.est[i] || (L.est[i] = estimateRef.current(i, L.width))
  }
  const rangeOf = (top: number, height: number) => {
    const { offsets: o, count: n } = lay.current
    const ov = optsRef.current.overscan ?? Math.max(120, height / 2)
    const start = Math.max(0, indexAt(o, n, top - ov))
    const end = Math.min(n, indexAt(o, n, top + height + ov) + 1)
    return { start, end, key: `${start}:${end}` }
  }

  // reset: content, row count or width bucket changed
  const widthBucket = Math.round(vp.width / 8)
  const key = useMemo(() => ({}), [resetKey, count, widthBucket]) // eslint-disable-line react-hooks/exhaustive-deps
  const keyRef = useRef<object | null>(null)
  if (keyRef.current !== key) {
    const L = lay.current
    const f = opts.focus
    // carry the focus row's on-screen position across the reset (read from the old offsets)
    if (!Object.is(contentRef.current, opts.contentKey)) pin.current = null
    else if (f != null && f >= 0 && f < count && L.count === count && L.offsets.length === count + 1) {
      const top = L.offsets[f] - topRef.current, bottom = L.offsets[f + 1] - topRef.current
      if (bottom > 0 && top < heightRef.current) pin.current = { index: f, delta: top }
    }
    contentRef.current = opts.contentKey
    keyRef.current = key
    const store = opts.sizesFor?.(widthBucket)
    const ok = !!store && store.measured.length === count && store.estimated.length === count
    L.sizes = ok ? store.measured : new Float32Array(count)
    L.est = ok ? store.estimated : new Float32Array(count)
    L.count = count
    L.width = vp.width
    if (L.offsets.length !== count + 1) L.offsets = new Float64Array(count + 1)
    rebuildPrefix(L.offsets, count, 0, size)
    remeasure.current = true
  }

  const notify = () => { for (const fn of listeners.current) fn() }

  /** Put the window and canvas where the offsets say (imperative: React does not own these styles). */
  const place = () => {
    const { offsets, count: n } = lay.current
    const c = canvasEl.current, w = windowEl.current
    const h = `${offsets[n]}px`, t = `translateY(${offsets[Math.min(renderedStart.current, n)]}px)`
    if (c && c.style.height !== h) c.style.height = h
    if (w && w.style.transform !== t) w.style.transform = t
  }

  /** A scrollTop write waiting for the next frame (see setScroll). */
  const pendingWrite = useRef(0)
  const writeScroll = () => {
    if (pendingWrite.current) { cancelAnimationFrame(pendingWrite.current); pendingWrite.current = 0 }
    const s = ref.current
    if (s) s.scrollTop = topRef.current
  }

  /**
   * Scroll to `y`. The position takes effect at once for the range and anchors (topRef); the DOM
   * write, which makes the browser lay out, is left to the next animation frame, where that layout
   * happens anyway: a key press renders its rows in its own task and the frame lays them out once.
   * In a ResizeObserver callback (`now`) the write is immediate, so the correction is in this frame.
   */
  const setScroll = (y: number, now = false) => {
    if (!ref.current) return
    const { offsets, count: n } = lay.current
    const max = Math.max(0, offsets[n] - heightRef.current)
    const t = Math.max(0, Math.min(max, y))
    if (Math.abs(t - topRef.current) <= 0.5) return
    topRef.current = t
    lastSet.current = t
    if (now) writeScroll()
    else if (!pendingWrite.current) pendingWrite.current = requestAnimationFrame(() => { pendingWrite.current = 0; writeScroll() })
  }

  /** Keep the pinned row (else the given anchor) in place after the offsets changed. */
  const restore = (anchor: Pin | null, now = false) => {
    const p = pin.current
    if (p && p.index < lay.current.count) setScroll(pinnedScrollTop(lay.current.offsets, p.index, p.delta, heightRef.current), now)
    else if (anchor) setScroll(lay.current.offsets[anchor.index] - anchor.delta, now)
  }

  /** The first visible row and its viewport offset, from the current offsets. */
  const firstVisible = (): Pin | null => {
    const { offsets, count: n } = lay.current
    if (!n) return null
    const a = indexAt(offsets, n, topRef.current)
    return { index: a, delta: offsets[a] - topRef.current }
  }

  /** Re-derive the rows range; only the window (not the whole view) re-renders when it changes. */
  const refreshRange = () => {
    const r = rangeOf(topRef.current, heightRef.current)
    if (r.key === range.current.key) return
    range.current = r
    for (const fn of rangeListeners.current) fn()
  }

  // scroll and size of the scroller
  useLayoutEffect(() => {
    if (!el) return
    topRef.current = el.scrollTop
    heightRef.current = el.clientHeight
    // the viewport size comes from the ResizeObserver: its first report arrives before the first paint
    const onScroll = () => {
      // our own write is on its way: this event reports the position it replaces
      if (pendingWrite.current) return
      const top = el.scrollTop
      topRef.current = top
      // a scroll we did not cause (wheel, scrollbar, keys, find-in-page) releases the pin
      if (lastSet.current == null || Math.abs(top - lastSet.current) > 1) { pin.current = null; lastSet.current = null }
      refreshRange()
      notify()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { setEl(ref.current); return }
      const height = el.clientHeight, width = el.clientWidth
      const grew = height !== heightRef.current
      heightRef.current = height
      setVp(v => (v.height === height && v.width === width ? v : { height, width }))
      // a bar opened above or below the book: keep the pinned row in view
      if (grew) { restore(null, true); refreshRange(); notify() }
    })
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); if (pendingWrite.current) { cancelAnimationFrame(pendingWrite.current); pendingWrite.current = 0 } }
  }, [el]) // eslint-disable-line react-hooks/exhaustive-deps

  // row measurements
  const ro = useRef<ResizeObserver | null>(null)
  const mounted = useRef(new Set<HTMLElement>())
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const L = lay.current
      let from = Infinity
      for (const e of entries) {
        const t = e.target as HTMLElement
        const i = Number(t.dataset.vindex)
        const h = e.borderBoxSize?.[0]?.blockSize ?? t.offsetHeight
        if (h > 0 && i >= 0 && i < L.count && Math.abs(L.sizes[i] - h) > 0.5) { L.sizes[i] = h; if (i < from) from = i }
      }
      if (from === Infinity) return
      const anchor = pin.current ? null : firstVisible()
      rebuildPrefix(L.offsets, L.count, from, size)
      place()
      restore(anchor)
      refreshRange()
      notify()
    })
    ro.current = obs
    for (const m of mounted.current) obs.observe(m)
    return () => { obs.disconnect(); ro.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const measure = useCallback((node: HTMLElement | null) => {
    if (!node) return
    mounted.current.add(node)
    ro.current?.observe(node)
    return () => { mounted.current.delete(node); ro.current?.unobserve(node) }
  }, [])

  // a render of the view (reset, navigation) re-derives the range from the current offsets
  range.current = rangeOf(topRef.current, vp.height || heightRef.current)

  /**
   * After the view or its window rendered: place the window, keep the pinned row, and after a reset
   * have the rows that stayed mounted measured again (observing anew reports their current size,
   * no layout read).
   */
  const commit = () => {
    // the view re-rendered with another range than the window shows: have the window catch up
    if (range.current.key !== renderedKey.current) for (const fn of rangeListeners.current) fn()
    place()
    restore(null)
    if (remeasure.current) {
      remeasure.current = false
      const obs = ro.current
      if (obs) for (const m of mounted.current) { obs.unobserve(m); obs.observe(m) }
      setVersion(x => x + 1)
      notify()
    }
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  useLayoutEffect(() => commitRef.current())

  /** Scroll row `index` into view and pin it there while heights settle. */
  const scrollToIndex = useCallback((index: number, align: 'auto' | 'start' | 'center' = 'auto') => {
    const { offsets, count: n } = lay.current
    if (index < 0 || index >= n) return
    setScroll(targetScroll(topRef.current, heightRef.current, offsets, index, align))
    lastSet.current = topRef.current
    pin.current = { index, delta: offsets[index] - topRef.current }
    refreshRange()
    notify()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Pin a row that is already on screen at its current position (e.g. the new current row). */
  const anchor = useCallback((index: number) => {
    const { offsets, count: n } = lay.current
    if (index < 0 || index >= n) return
    lastSet.current = topRef.current
    pin.current = { index, delta: offsets[index] - topRef.current }
  }, [])

  /** Whether row `index` is entirely inside the viewport. */
  const isVisible = useCallback((index: number) => {
    const { offsets, count: n } = lay.current
    if (index < 0 || index >= n) return false
    return offsets[index] >= topRef.current - 0.5 && offsets[index + 1] <= topRef.current + heightRef.current + 0.5
  }, [])

  /** Listen to scrolling and layout changes (e.g. a running head); returns the unsubscribe. */
  const subscribe = useCallback((fn: () => void) => { listeners.current.add(fn); return () => { listeners.current.delete(fn) } }, [])
  const getTop = useCallback(() => topRef.current, [])
  const canvasRef = useCallback((node: HTMLElement | null) => { canvasEl.current = node; if (node) place() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const windowRef = useCallback((node: HTMLElement | null) => { windowEl.current = node; if (node) place() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const subscribeRange = useCallback((fn: () => void) => { rangeListeners.current.add(fn); return () => { rangeListeners.current.delete(fn) } }, [])
  const getRange = useCallback(() => range.current, [])
  const rendered = useCallback((r: { start: number; key: string }) => { renderedStart.current = r.start; renderedKey.current = r.key }, [])
  const afterRender = useCallback(() => commitRef.current(), [])

  /** The live row offsets (prefix sums, mutated in place as rows are measured): read them in effects and callbacks. */
  const getOffsets = useCallback(() => lay.current.offsets, [])
  return {
    version, getOffsets,
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
export function useVirtualWindow(v: Pick<VariableVirtual, 'subscribeRange' | 'getRange' | 'rendered' | 'afterRender'>): { start: number; end: number } {
  // rendering the window also records which range the DOM shows (the window's position follows it)
  const [, force] = useState(0)
  const { subscribeRange, getRange, rendered, afterRender } = v
  useLayoutEffect(() => subscribeRange(() => force(x => x + 1)), [subscribeRange])
  const r = getRange()
  rendered(r)
  const { start, end } = r
  useLayoutEffect(() => afterRender())
  return { start, end }
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
