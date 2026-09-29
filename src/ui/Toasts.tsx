import { useEffect, useRef } from 'react'
import { actions, useApp } from '../state/store'

/**
 * Transient notifications. Auto-dismiss pauses while the pointer is over them or focus is inside
 * (so an Undo button can be reached with the keyboard: Alt+N focuses the newest action).
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

  return (
    <div
      ref={ref}
      className="toasts"
      role="status"
      aria-live="polite"
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
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span>{t.text}</span>
          {t.action && (
            <button className="toast-action" aria-keyshortcuts="Alt+N" title="Alt+N focuses this button" onClick={() => { const run = t.action!.run; actions.dismissToast(t.id); run() }}>
              {t.action.label}
            </button>
          )}
          <button className="toast-x" aria-label="Dismiss" onClick={() => actions.dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
