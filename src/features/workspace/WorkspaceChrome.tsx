import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useApp, actions } from '../../state/store'
import { focusDocument, focusTarget, trackFocus } from './panes'
import { NARROW_QUERY, closeOverlays, enterNarrow, exclusivePatch, leaveNarrow, openedPane } from './responsive'
import type { SideState } from './responsive'
import { shouldAutoStart, startTour, useTour } from './tour'
import { WelcomeTour } from './WelcomeTour'
import './workspace.css'
import './print.css'

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW_QUERY) : null
const subscribeNarrow = (fn: () => void) => { mq?.addEventListener('change', fn); return () => mq?.removeEventListener('change', fn) }
const getNarrow = () => !!mq?.matches

const PANE_SEL = { tree: '.shell-main > .pane-left', clipboard: '.shell-main > .pane-right' } as const
const PANE_ID = { tree: 'navigator', clipboard: 'clipboard' } as const

/**
 * App-level behaviour owned by the workspace feature: first-run tour, responsive side panes,
 * pane focus memory and motion preference. Mounted once by the shell.
 */
export function WorkspaceChrome() {
  const reduceMotion = useApp(s => s.settings.reduceMotion)
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow, () => false)
  const overlayOpen = useApp(s => s.layout.showTree || s.layout.showClipboard)
  const tourOpen = useTour(s => s.open)
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.documentElement
    if (reduceMotion) root.dataset.reduceMotion = 'true'
    else delete root.dataset.reduceMotion
  }, [reduceMotion])

  // remember the last focused element per pane (for Ctrl+F6 cycling)
  useEffect(() => {
    document.addEventListener('focusin', trackFocus)
    return () => document.removeEventListener('focusin', trackFocus)
  }, [])

  // below 1100px the side panes become overlays over the document
  useEffect(() => { if (narrow) enterNarrow(); else leaveNarrow() }, [narrow])

  useEffect(() => { setHost(document.querySelector<HTMLElement>('.shell-main')) }, [])

  // narrow mode: one overlay at a time; an opened overlay takes focus; closing returns focus to the document
  useEffect(() => {
    if (!narrow) return
    let prev: SideState = { showTree: useApp.getState().layout.showTree, showClipboard: useApp.getState().layout.showClipboard }
    let raf = 0
    const unsub = useApp.subscribe(s => {
      const next: SideState = { showTree: s.layout.showTree, showClipboard: s.layout.showClipboard }
      if (next.showTree === prev.showTree && next.showClipboard === prev.showClipboard) return
      const patch = exclusivePatch(prev, next)
      const opened = openedPane(prev, next)
      const closed = (prev.showTree && !next.showTree) || (prev.showClipboard && !next.showClipboard)
      prev = patch ? { ...next, ...patch } : next
      if (patch) actions.setLayout(patch)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (useTour.getState().open || useApp.getState().dialog) return
        if (opened) {
          const el = document.querySelector<HTMLElement>(PANE_SEL[opened])
          if (el && !el.contains(document.activeElement)) focusTarget(el, PANE_ID[opened]).focus({ preventScroll: true })
        } else if (closed) {
          const a = document.activeElement
          if (!a || a === document.body || !a.isConnected) focusDocument()
        }
      })
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (useTour.getState().open || useApp.getState().dialog || useApp.getState().commandPaletteOpen) return
      const { showTree, showClipboard } = useApp.getState().layout
      if (!showTree && !showClipboard) return
      const a = document.activeElement
      const inOverlay = !!a?.closest('.shell-main > .pane-left, .shell-main > .pane-right')
      if (!inOverlay && a !== document.body) return
      // menus and inline editors inside the pane handle their own Escape first
      if (a?.closest('[role="menu"], [contenteditable="true"]') || (a instanceof HTMLInputElement && a.value && a.type !== 'checkbox')) return
      e.preventDefault()
      closeOverlays()
    }
    document.addEventListener('keydown', onKey)
    return () => { unsub(); cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey) }
  }, [narrow])

  useEffect(() => {
    if (!shouldAutoStart()) return
    const t = window.setTimeout(() => { if (!useApp.getState().dialog) startTour() }, 700)
    return () => window.clearTimeout(t)
  }, [])

  const scrim = narrow && overlayOpen && !tourOpen && host
    ? createPortal(<div className="ws-scrim" aria-hidden="true" onMouseDown={e => { e.preventDefault(); closeOverlays() }} />, host)
    : null

  return <>{scrim}<WelcomeTour /></>
}
