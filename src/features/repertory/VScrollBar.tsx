import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

/**
 * A classic vertical scrollbar (arrow buttons, track, box thumb) that scrolls `target`, as the
 * RadarOpus Navigation window shows beside its rubric list. Drawn by the page itself so it looks the
 * same whatever the platform's scrollbar style (overlay scrollbars hide the native one). Mouse only:
 * the list it scrolls is walked by keyboard and keeps its selection in view. Renders nothing while
 * everything fits.
 */
type Metrics = { top: number; height: number; client: number; track: number }
const thumbSize = (m: Metrics, min = 18) => Math.max(min, Math.round(m.track * Math.min(1, m.client / m.height)))
const thumbAt = (m: Metrics, min = 18) => { const max = Math.max(0, m.height - m.client); return max ? Math.round((m.track - thumbSize(m, min)) * (Math.min(max, m.top) / max)) : 0 }

export function VScrollBar({ target, step, deps, observe, extent, className = 'vsb', minThumb = 18 }: {
  target: RefObject<HTMLElement | null>; step: number; deps: unknown
  /** Selector of an element inside `target` whose size sets the scroll range (watched for changes). */
  observe?: string
  /**
   * The scroll range told by the owner instead of observed: its content resizes inside its own
   * resize observers, and watching that content from here would loop the observers.
   */
  extent?: { subscribe: (fn: () => void) => () => void; get: () => number }
  className?: string
  /** Smallest thumb height (px). */
  minThumb?: number
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [m, setM] = useState({ top: 0, height: 1, client: 1, track: 1 })
  /** The metrics shown (the scroll position is kept here as it changes, outside the state). */
  const mRef = useRef(m)
  mRef.current = m

  useLayoutEffect(() => {
    const el = target.current
    if (!el) return
    const measure = () => setM(p => {
      const n = { top: el.scrollTop, height: Math.max(1, extent ? extent.get() : el.scrollHeight), client: Math.max(1, el.clientHeight), track: Math.max(1, trackRef.current?.clientHeight ?? el.clientHeight) }
      // compare with the pending state `p` (onScroll keeps its top current in place): returning the
      // rendered object instead would undo an update still queued (two measures before a render)
      return n.top === p.top && n.height === p.height && n.client === p.client && n.track === p.track ? p : n
    })
    measure()
    // the owner's range changes: only the height is new (no layout is read)
    const off = extent?.subscribe(() => { const height = Math.max(1, extent.get()); setM(p => (p.height === height ? p : { ...p, height })) })
    // a scroll changes only the position: reading just scrollTop there forces no extra layout (sizes
    // are read in the resize observer, which runs after layout); the thumb moves without a render
    const onScroll = () => {
      const top = el.scrollTop
      const p = mRef.current
      if (p.top === top) return
      p.top = top
      const thumb = thumbRef.current
      if (thumb) thumb.style.transform = `translateY(${thumbAt(p, minThumb)}px)`
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    if (!extent) {
      if (el.firstElementChild) ro?.observe(el.firstElementChild)
      const extra = observe ? el.querySelector(observe) : null
      if (extra) ro?.observe(extra)
    }
    if (trackRef.current) ro?.observe(trackRef.current)
    return () => { el.removeEventListener('scroll', onScroll); ro?.disconnect(); off?.() }
  }, [target, deps, observe, extent, minThumb])

  const max = Math.max(0, m.height - m.client)
  const thumbH = thumbSize(m, minThumb)
  const thumbY = thumbAt(m, minThumb)
  const scrollTo = (y: number) => { const el = target.current; if (el) el.scrollTop = Math.max(0, Math.min(max, y)) }

  // holding an arrow or the track repeats, like a native scrollbar
  const repeat = useRef<number | null>(null)
  const stop = () => { if (repeat.current != null) { clearInterval(repeat.current); repeat.current = null } }
  useEffect(() => stop, [])
  const hold = (fn: () => void) => { stop(); fn(); repeat.current = window.setInterval(fn, 70) }

  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const dir = y < thumbAt(mRef.current, minThumb) ? -1 : 1
    hold(() => { const el = target.current; if (el) scrollTo(el.scrollTop + dir * Math.max(step, el.clientHeight - step)) })
  }
  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startY = e.clientY, start = target.current?.scrollTop ?? 0
    const span = Math.max(1, m.track - thumbH)
    const el = e.currentTarget
    el.setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => scrollTo(start + (ev.clientY - startY) * (max / span))
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const arrow = (dir: -1 | 1) => ({
    onPointerDown: (e: ReactPointerEvent) => { if (e.button === 0) hold(() => { const el = target.current; if (el) scrollTo(el.scrollTop + dir * step) }) },
    onPointerUp: stop, onPointerLeave: stop,
  })

  return (
    <div
      className={className} aria-hidden="true" hidden={max <= 0}
      // the wheel over the bar scrolls what it scrolls
      onWheel={e => { const el = target.current; if (el && !e.ctrlKey) el.scrollTop += e.deltaMode === 1 ? e.deltaY * step : e.deltaY }}
    >
      <div className={`${className}-btn up`} {...arrow(-1)} />
      <div className={`${className}-track`} ref={trackRef} onPointerDown={onTrackDown} onPointerUp={stop} onPointerLeave={stop}>
        <div ref={thumbRef} className={`${className}-thumb`} style={{ height: thumbH, transform: `translateY(${thumbY}px)` }} onPointerDown={onThumbDown} />
      </div>
      <div className={`${className}-btn down`} {...arrow(1)} />
    </div>
  )
}
