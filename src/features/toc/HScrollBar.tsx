import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

/**
 * A permanent horizontal scrollbar (track, thumb and arrow buttons) that scrolls `target`, as the
 * RadarOpus table of contents shows under its footer. Drawn by the page itself so it shows whatever
 * the platform's scrollbar style (overlay scrollbars would hide it). Mouse only: the tree it scrolls
 * is walked by keyboard and keeps its cursor in view.
 */
export function HScrollBar({ target, deps }: { target: RefObject<HTMLElement | null>; deps: unknown }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [m, setM] = useState({ left: 0, width: 1, client: 1, track: 1 })
  /** Reads the scroll geometry afresh (the panel may have been resized since the last read). */
  const measure = useRef(() => {})

  useLayoutEffect(() => {
    const el = target.current, track = trackRef.current
    if (!el || !track) return
    measure.current = () => setM(p => {
      const n = { left: el.scrollLeft, width: Math.max(1, el.scrollWidth), client: Math.max(1, el.clientWidth), track: Math.max(1, track.clientWidth) }
      return n.left === p.left && n.width === p.width && n.client === p.client && n.track === p.track ? p : n
    })
    const read = () => measure.current()
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    ro?.observe(track)
    return () => { el.removeEventListener('scroll', read); ro?.disconnect() }
  }, [target, deps])

  const max = Math.max(0, m.width - m.client)
  const thumbW = Math.max(16, Math.round(m.track * Math.min(1, m.client / m.width)))
  const thumbX = max ? Math.round((m.track - thumbW) * (m.left / max)) : 0
  // clamped to the live geometry (not the last render's), and the thumb follows at once
  const scrollTo = (x: number) => {
    const el = target.current
    if (!el) return
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, x))
    el.dataset.scrollX = String(el.scrollLeft)
    measure.current()
  }

  // holding an arrow or the track repeats, like a native scrollbar
  const repeat = useRef<number | null>(null)
  const stop = () => { if (repeat.current != null) { clearInterval(repeat.current); repeat.current = null } }
  useEffect(() => stop, [])
  const hold = (step: () => void) => { stop(); step(); repeat.current = window.setInterval(step, 80) }

  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left
    const dir = x < thumbX ? -1 : 1
    hold(() => { const el = target.current; if (el) scrollTo(el.scrollLeft + dir * el.clientWidth * 0.9) })
  }
  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX, start = target.current?.scrollLeft ?? 0
    const span = Math.max(1, m.track - thumbW)
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => scrollTo(start + (ev.clientX - startX) * (max / span))
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const arrow = (dir: -1 | 1) => ({
    onPointerDown: (e: ReactPointerEvent) => { if (e.button === 0) hold(() => { const el = target.current; if (el) scrollTo(el.scrollLeft + dir * 20) }) },
    onPointerUp: stop, onPointerLeave: stop,
  })

  return (
    <div className="toc-hbar" aria-hidden="true">
      <div className="toc-hbar-btn left" {...arrow(-1)} />
      <div className="toc-hbar-track" ref={trackRef} onPointerDown={onTrackDown} onPointerUp={stop} onPointerLeave={stop}>
        <div className="toc-hbar-thumb" style={{ width: thumbW, transform: `translateX(${thumbX}px)` }} onPointerDown={onThumbDown} />
      </div>
      <div className="toc-hbar-btn right" {...arrow(1)} />
    </div>
  )
}
