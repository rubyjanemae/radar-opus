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

function useViewport(ref: RefObject<HTMLElement | null>) {
  const [vp, setVp] = useState({ top: 0, height: 0, width: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setVp(v => (v.top === el.scrollTop && v.height === el.clientHeight && v.width === el.clientWidth) ? v : { top: el.scrollTop, height: el.clientHeight, width: el.clientWidth })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [ref])
  return vp
}

/** Fixed row-height virtualisation (trees, pickers). */
export function useFixedVirtual(ref: RefObject<HTMLElement | null>, count: number, rowHeight: number, overscan = 8) {
  const vp = useViewport(ref)
  const start = Math.max(0, Math.floor(vp.top / rowHeight) - overscan)
  const end = Math.min(count, Math.ceil((vp.top + vp.height) / rowHeight) + overscan)
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
 * Variable-height virtualisation with measured rows. Rows are estimated until rendered,
 * then measured with a ResizeObserver; the first visible row stays anchored while
 * measurements above it settle, so the view does not jump.
 */
export function useVariableVirtual(ref: RefObject<HTMLElement | null>, count: number, estimate: (i: number, width: number) => number, resetKey: unknown, overscan = 600) {
  const vp = useViewport(ref)
  const sizes = useRef<Float32Array>(new Float32Array(0))
  const [version, setVersion] = useState(0)
  const widthRef = useRef(0)
  const pending = useRef<{ index: number; align: 'auto' | 'start' | 'center'; until: number } | null>(null)
  const estimateRef = useRef(estimate)
  estimateRef.current = estimate

  // reset measurements when content or width changes
  const widthBucket = Math.round(vp.width / 8)
  const key = useMemo(() => ({}), [resetKey, count, widthBucket]) // eslint-disable-line react-hooks/exhaustive-deps
  const keyRef = useRef<object | null>(null)
  if (keyRef.current !== key) {
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

  const offsetsRef = useRef(offsets)
  const prevOffsets = offsetsRef.current
  offsetsRef.current = offsets

  // keep the anchor row (or a pending scroll target) stable when offsets change
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prevOffsets === offsets) return
    const p = pending.current
    if (p && performance.now() < p.until) { applyScroll(el, offsets, count, p.index, p.align); return }
    pending.current = null
    if (prevOffsets.length !== offsets.length) return
    const anchor = indexAt(prevOffsets, count, el.scrollTop)
    const delta = el.scrollTop - prevOffsets[anchor]
    const next = offsets[anchor] + delta
    if (Math.abs(next - el.scrollTop) > 0.5) el.scrollTop = next
  }, [offsets]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const measure = useCallback((el: HTMLElement | null) => {
    if (!el) return
    ro.current?.observe(el)
    return () => ro.current?.unobserve(el)
  }, [])

  const start = Math.max(0, indexAt(offsets, count, vp.top - overscan))
  let end = indexAt(offsets, count, vp.top + vp.height + overscan) + 1
  end = Math.min(count, end)

  const scrollToIndex = useCallback((index: number, align: 'auto' | 'start' | 'center' = 'auto') => {
    const el = ref.current
    if (!el || index < 0 || index >= count) return
    pending.current = { index, align, until: performance.now() + 400 }
    applyScroll(el, offsetsRef.current, count, index, align)
  }, [ref, count])

  return { start, end, offsets, total: offsets[count] ?? 0, measure, scrollToIndex, viewport: vp }
}

function applyScroll(el: HTMLElement, offsets: Float64Array, count: number, index: number, align: 'auto' | 'start' | 'center') {
  if (index >= count) return
  const top = offsets[index], bottom = offsets[index + 1]
  const h = el.clientHeight
  const margin = Math.min(48, h / 4)
  let next = el.scrollTop
  if (align === 'start') next = top - margin
  else if (align === 'center') next = top - (h - (bottom - top)) / 3
  else if (top < el.scrollTop + margin) next = top - margin
  else if (bottom > el.scrollTop + h - margin) next = bottom - h + margin
  next = Math.max(0, next)
  if (Math.abs(next - el.scrollTop) > 0.5) el.scrollTop = next
}
