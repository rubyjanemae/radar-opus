import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { formatKeys } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import { APP_NAME } from './data'
import { TOUR_STEPS, endTour, placeCard, tourGo, useTour } from './tour'

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number }

function findTarget(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s)
    if (el && el.getClientRects().length) return el
  }
  return null
}

/** First-run tour: a spotlight over each main area with a step card. Modal, keyboard driven. */
export function WelcomeTour() {
  const open = useTour(s => s.open)
  if (!open) return null
  return <TourOverlay />
}

function TourOverlay() {
  const step = useTour(s => s.step)
  const s = TOUR_STEPS[step]
  const layout = useApp(st => st.layout)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const last = step === TOUR_STEPS.length - 1

  // make sure the pane this step talks about is on screen
  useEffect(() => {
    if (s.needs === 'tree' && !layout.showTree) actions.setLayout({ showTree: true })
    if (s.needs === 'clipboard' && !layout.showClipboard) actions.setLayout({ showClipboard: true })
  }, [s, layout.showTree, layout.showClipboard])

  // measure target and place the card; follow resizes
  useLayoutEffect(() => {
    const measure = () => {
      const el = findTarget(s.targets)
      const r = el?.getBoundingClientRect()
      const pad = 4
      const next = r ? { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad, width: r.width + pad * 2, height: r.height + pad * 2 } : null
      setRect(next)
      const card = cardRef.current
      const w = card?.offsetWidth ?? 360, h = card?.offsetHeight ?? 220
      const p = placeCard(next, w, h, window.innerWidth, window.innerHeight)
      setPos({ x: p.x, y: p.y })
    }
    measure()
    const raf = requestAnimationFrame(measure) // after layout toggles settle
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure) }
  }, [s, layout.showTree, layout.showClipboard, layout.treeWidth, layout.clipboardWidth])

  // focus the primary button; a closing menu may restore focus after we mount, so retry once
  useEffect(() => {
    nextRef.current?.focus()
    const t = window.setTimeout(() => { if (!cardRef.current?.contains(document.activeElement)) nextRef.current?.focus() }, 60)
    return () => window.clearTimeout(t)
  }, [step])

  // restore focus to where the user was when the tour closes
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    return () => { if (prev?.isConnected && prev !== document.body) prev.focus() }
  }, [])

  // The tour is modal: handle its keys in the capture phase so global shortcuts never fire underneath.
  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = stepRef.current
      const isLast = cur === TOUR_STEPS.length - 1
      const card = cardRef.current
      const inCard = !!card && card.contains(e.target as Node)
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); endTour(false) }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); if (isLast) endTour(true); else tourGo(cur + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); tourGo(cur - 1) }
      else if (e.key === 'Tab') {
        const f = [...(card?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])') ?? [])]
        if (!f.length) return
        const i = f.indexOf(document.activeElement as HTMLElement)
        if (!inCard) { e.preventDefault(); f[0].focus() }
        else if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() }
      } else if (!inCard) {
        // Enter/Space outside the card would act on the app beneath: send them to the primary button
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextRef.current?.click() }
        else if (!e.ctrlKey && !e.metaKey) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return createPortal(
    <div className="ws-tour">
      <div className="ws-tour-block" onMouseDown={e => e.preventDefault()} />
      {rect
        ? <div className="ws-tour-spot" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
        : <div className="ws-tour-scrim" />}
      <div
        ref={cardRef}
        className="ws-tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-tour-title"
        aria-describedby="ws-tour-body"
        style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
      >
        <div className="ws-tour-top">
          <span className="ws-tour-step">{step === 0 ? `Welcome to ${APP_NAME}` : `Step ${step + 1} of ${TOUR_STEPS.length}`}</span>
          <button className="icon-btn" aria-label="Close tour" onClick={() => endTour(false)}><X size={14} /></button>
        </div>
        <h2 id="ws-tour-title">{s.title}</h2>
        <p id="ws-tour-body">{s.body}</p>
        {s.keys && (
          <ul className="ws-tour-keys">
            {s.keys.map(k => <li key={k.keys}><kbd className="kbd">{formatKeys(k.keys)}</kbd>{k.label}</li>)}
          </ul>
        )}
        <div className="ws-tour-foot">
          <div className="ws-tour-dots" role="group" aria-label="Tour steps">
            {TOUR_STEPS.map((t, i) => (
              <button key={t.id} type="button" aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1} of ${TOUR_STEPS.length}: ${t.title}`} tabIndex={-1}
                className={`ws-tour-dot${i === step ? ' on' : ''}`} onClick={() => tourGo(i)} />
            ))}
          </div>
          <button className="btn btn-ghost" onClick={() => endTour(false)}>Skip tour</button>
          {step > 0 && <button className="btn" onClick={() => tourGo(step - 1)}><ArrowLeft size={13} />Back</button>}
          <button ref={nextRef} className="btn btn-primary" onClick={() => (last ? endTour(true) : tourGo(step + 1))}>
            {last ? 'Get started' : <>Next<ArrowRight size={13} /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
