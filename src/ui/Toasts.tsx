import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { actions, useApp } from '../state/store'

/**
 * Transient notifications. Auto-dismiss pauses while the pointer is over them or focus is inside
 * (so an Undo button can be reached with the keyboard: Alt+N focuses the newest action).
 *
 * Announcements go through two live regions that stay in the DOM for the app's lifetime (a region
 * created together with its text is often not read): a polite status for information and an assertive
 * alert for errors. They hold only the messages; the Undo and Dismiss buttons live on the visible cards.
 * Rendered into <body>, outside the app root, so they are still announced while a dialog makes the app inert.
 */
export function Toasts() {
  const toasts = useApp(s => s.toasts)
  const ref = useRef<HTMLDivElement>(null)
  const hover = useRef(false)
  const focus = useRef(false)
  const sync = () => actions.pauseToasts(hover.current || focus.current)

  // A toast removed while it held focus would drop focus to <body>; hand it back to where the user was.
  const returnTo = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!focus.current || ref.current?.contains(document.activeElement)) return
    focus.current = false
    sync()
    const el = returnTo.current
    returnTo.current = null
    if (el?.isConnected) el.focus()
  }, [toasts])
  useEffect(() => () => actions.pauseToasts(false), [])

  const polite = toasts.filter(t => t.tone !== 'error')
  const errors = toasts.filter(t => t.tone === 'error')

  return createPortal(
    <div
      ref={ref}
      className="toasts"
      role="region"
      aria-label="Notifications"
      onMouseEnter={() => { hover.current = true; sync() }}
      onMouseLeave={() => { hover.current = false; sync() }}
      onFocus={e => {
        if (!focus.current && e.relatedTarget instanceof HTMLElement && !ref.current?.contains(e.relatedTarget)) returnTo.current = e.relatedTarget
        focus.current = true
        sync()
      }}
      onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node | null)) { focus.current = false; returnTo.current = null; sync() } }}
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        const el = returnTo.current
        focus.current = false
        returnTo.current = null
        sync()
        if (el?.isConnected) el.focus()
        else (document.activeElement as HTMLElement | null)?.blur()
      }}
    >
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="false">
        {polite.map(t => <div key={t.id}>{t.text}</div>)}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="false">
        {errors.map(t => <div key={t.id}>{t.text}</div>)}
      </div>
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`} data-toast-id={t.id}>
          {/* announced through the live regions above; read here when browsing */}
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button className="toast-action" aria-keyshortcuts="Alt+N" title="Alt+N focuses this button" onClick={() => { const run = t.action!.run; actions.dismissToast(t.id); run() }}>
              {t.action.label}
            </button>
          )}
          <button className="toast-x" aria-label={`Dismiss: ${t.text}`} title="Dismiss" onClick={() => actions.dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
