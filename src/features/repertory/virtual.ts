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
 * range of rendered rows changes.
 */
function useViewport(ref: RefObject<HTMLElement | null>, rangeKey: (top: number, height: number) => string) {
  const [vp, setVp] = useState({ height: 0, width: 0, key: '' })
  const [el, setEl] = useState<HTMLElement | null>(null)
  const topRef = useRef(0)
  const keyFn = useRef(rangeKey)
  keyFn.current = rangeKey
  // runs after every render: pick up a remounted scroll element
  useLayoutEffect(() => {
    if (ref.current !== el) setEl(ref.current)
  })
  const update = useCallback(() => {
    if (!el) return
    const top = el.scrollTop, height = el.clientHeight, width = el.clientWidth
    topRef.current = top
    const key = keyFn.current(top, height)
    setVp(v => (v.key === key && v.height === height && v.width === width) ? v : { height, width, key })
  }, [el])
  useLayoutEffect(() => {
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [el, update])
  return { vp, el, topRef, update }
}

function fixedRange(top: number, height: number, count: number, rowHeight: number, overscan: number) {
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((top + height) / rowHeight) + overscan)
  return { start, end }
}

/** Fixed row-height virtualisation (trees, pickers). */
export function useFixedVirtual(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, overscan = 8) {
  const { vp, topRef, update } = useViewport(ref, (top, height) => { const r = fixedRange(top, height, count, rowHeight, overscan); return `${r.start}:${r.end}` })
  // the row count or height changed: the rendered range must be re-derived from the live scrollTop
  useLayoutEffect(update, [count, rowHeight, update])
  const { start, end } = fixedRange(topRef.current, vp.height, count, rowHeight, overscan)
  const scrollToIndex = useCallback((i: number, align: 'auto' | 'center' = 'auto') => {
    const el = ref.current
    if (!el || i < 0) return
    const top = i * rowHeight
    if (align === 'center') el.scrollTop = Math.max(0, top - (el.clientHeight - rowHeight) / 2)
    else if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight
  }, [ref, rowHeight])
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

export interface VariableVirtualOptions {
  /** Row to keep fixed on screen when the layout is reset (display mode, filters, width): usually the current row. */
  focus?: number
  /** Identity of the item set; the focus row is only carried across resets that keep it. */
  contentKey?: unknown
  overscan?: number
}

/**
 * Variable-height virtualisation with measured rows. Rows are estimated until rendered,
 * then measured with a ResizeObserver. While measurements settle, one row stays pinned at
 * its viewport offset: the row last scrolled to or anchored (the current row), or, after a
 * layout reset, the focus row. A user scroll releases the pin; the first visible row then
 * anchors instead, so the view never jumps.
 */
export function useVariableVirtual(ref: RefObject<HTMLElement | null>, count: number, estimate: (i: number, width: number) => number, resetKey: unknown, opts: VariableVirtualOptions = {}) {
  const offsetsRef = useRef<Float64Array>(new Float64Array(1))
  const countRef = useRef(count)
  countRef.current = count
  // about one viewport above and below: fast scrolling does not show blank rows, a long book stays cheap
  const overscanFor = (height: number) => opts.overscan ?? Math.max(300, height)
  const range = (top: number, height: number) => {
    const o = offsetsRef.current, n = Math.min(countRef.current, o.length - 1), ov = overscanFor(height)
    return { start: Math.max(0, indexAt(o, n, top - ov)), end: Math.min(n, indexAt(o, n, top + height + ov) + 1) }
  }
  const { vp, el: scrollEl, topRef, update } = useViewport(ref, (top, height) => { const r = range(top, height); return `${r.start}:${r.end}` })
  const sizes = useRef<Float32Array>(new Float32Array(0))
  const [version, setVersion] = useState(0)
  const widthRef = useRef(0)
  const pin = useRef<{ index: number; delta: number } | null>(null)
  const lastSet = useRef<number | null>(null)
  const estimateRef = useRef(estimate)
  estimateRef.current = estimate
  /** Offsets of the last committed layout (what the DOM and scrollTop reflect). */
  const appliedRef = useRef<Float64Array>(new Float64Array(1))
  const contentRef = useRef<unknown>(opts.contentKey)

  // reset measurements when content or width changes
  const widthBucket = Math.round(vp.width / 8)
  const key = useMemo(() => ({}), [resetKey, count, widthBucket]) // eslint-disable-line react-hooks/exhaustive-deps
  const keyRef = useRef<object | null>(null)
  if (keyRef.current !== key) {
    // carry the focus row's on-screen position across the reset (read before the offsets are rebuilt)
    const el = ref.current
    const prev = appliedRef.current
    const f = opts.focus
    const sameContent = Object.is(contentRef.current, opts.contentKey)
    if (!sameContent) pin.current = null
    else if (el && f != null && f >= 0 && f < count && prev.length === count + 1) {
      const top = prev[f] - el.scrollTop, bottom = prev[f + 1] - el.scrollTop
      if (bottom > 0 && top < el.clientHeight) pin.current = { index: f, delta: top }
    }
    contentRef.current = opts.contentKey
    keyRef.current = key
    sizes.current = new Float32Array(count)
    widthRef.current = vp.width
  }

  const offsets = useMemo(() => {
    const s = sizes.current
    const w = widthRef.current || vp.width
    return prefixSums(count, i => s[i] || estimateRef.current(i, w))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, count])

  offsetsRef.current = offsets

  const setScroll = (el: HTMLElement, y: number) => {
    if (Math.abs(y - el.scrollTop) > 0.5) el.scrollTop = y
    lastSet.current = el.scrollTop
  }

  // keep the pinned row (or else the first visible row) stable when offsets change
  useLayoutEffect(() => {
    const el = ref.current
    const prevOffsets = appliedRef.current
    appliedRef.current = offsets
    if (!el || prevOffsets === offsets) return
    if (prevOffsets.length !== offsets.length) { pin.current = null; return }
    const p = pin.current
    if (p && p.index < count) { setScroll(el, pinnedScrollTop(offsets, p.index, p.delta, el.clientHeight)); return }
    const anchor = indexAt(prevOffsets, count, el.scrollTop)
    const delta = el.scrollTop - prevOffsets[anchor]
    setScroll(el, offsets[anchor] + delta)
  }, [offsets]) // eslint-disable-line react-hooks/exhaustive-deps

  // the viewport grew or shrank (a bar opened above or below the book): keep the pinned row in view
  useLayoutEffect(() => {
    const el = ref.current
    const p = pin.current
    if (el && p && p.index < count) setScroll(el, pinnedScrollTop(offsetsRef.current, p.index, p.delta, el.clientHeight))
  }, [vp.height]) // eslint-disable-line react-hooks/exhaustive-deps

  // a scroll we did not cause (wheel, scrollbar, touch, find-in-page) releases the pin
  useEffect(() => {
    const el = scrollEl
    if (!el) return
    const onScroll = () => {
      if (lastSet.current != null && Math.abs(el.scrollTop - lastSet.current) <= 1) return
      pin.current = null
      lastSet.current = null
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollEl])

  const ro = useRef<ResizeObserver | null>(null)
  const raf = useRef(0)
  useEffect(() => {
    ro.current = new ResizeObserver(entries => {
      let changed = false
      for (const e of entries) {
        const el = e.target as HTMLElement
        const i = Number(el.dataset.vindex)
        const h = el.offsetHeight
        if (h > 0 && i >= 0 && i < sizes.current.length && Math.abs(sizes.current[i] - h) > 0.5) { sizes.current[i] = h; changed = true }
      }
      if (changed && !raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setVersion(v => v + 1) })
    })
    return () => { ro.current?.disconnect(); cancelAnimationFrame(raf.current); raf.current = 0 }
  }, [])

  const mounted = useRef(new Set<HTMLElement>())
  const measure = useCallback((el: HTMLElement | null) => {
    if (!el) return
    mounted.current.add(el)
    ro.current?.observe(el)
    return () => { mounted.current.delete(el); ro.current?.unobserve(el) }
  }, [])

  // after a reset (width, content) the rows already on screen keep their DOM nodes; a ResizeObserver
  // only reports *changes*, so rows whose height did not change would stay on the estimate and overlap.
  // Measure every mounted row now, before paint.
  useLayoutEffect(() => {
    let changed = false
    for (const el of mounted.current) {
      const i = Number(el.dataset.vindex)
      const h = el.offsetHeight
      if (h > 0 && i >= 0 && i < sizes.current.length && Math.abs(sizes.current[i] - h) > 0.5) { sizes.current[i] = h; changed = true }
    }
    if (changed) setVersion(v => v + 1)
  }, [key])

  // offsets changed (measurements, a reset): re-derive the rendered range from the live scrollTop
  useLayoutEffect(update, [offsets, update])
  const { start, end } = range(topRef.current, vp.height)

  /** Scroll row `index` into view and pin it there while heights settle. */
  const scrollToIndex = useCallback((index: number, align: 'auto' | 'start' | 'center' = 'auto') => {
    const el = ref.current
    if (!el || index < 0 || index >= count) return
    const o = offsetsRef.current
    const y = targetScroll(el, o, index, align)
    if (Math.abs(y - el.scrollTop) > 0.5) el.scrollTop = y
    lastSet.current = el.scrollTop
    pin.current = { index, delta: o[index] - el.scrollTop }
  }, [ref, count])

  /** Pin a row that is already on screen at its current position (e.g. the new current row). */
  const anchor = useCallback((index: number) => {
    const el = ref.current
    if (!el || index < 0 || index >= count) return
    lastSet.current = el.scrollTop
    pin.current = { index, delta: offsetsRef.current[index] - el.scrollTop }
  }, [ref, count])

  return { start, end, offsets, total: offsets[count] ?? 0, measure, scrollToIndex, anchor, viewport: vp, scrollEl }
}

function targetScroll(el: HTMLElement, offsets: Float64Array, index: number, align: 'auto' | 'start' | 'center'): number {
  const top = offsets[index], bottom = offsets[index + 1]
  const h = el.clientHeight
  const margin = Math.min(48, h / 4)
  let next = el.scrollTop
  if (align === 'start') next = top - margin
  else if (align === 'center') next = top - (h - (bottom - top)) / 3
  else if (top < el.scrollTop + margin) next = top - margin
  else if (bottom > el.scrollTop + h - margin) next = bottom - h + margin
  return Math.max(0, next)
}
