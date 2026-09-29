import { useEffect, useId, useRef, useState } from 'react'
import { focusDocument } from '../features/workspace/panes'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  /** Element to focus first; defaults to the first focusable. */
  initialFocus?: string
}

/** Modal dialog with focus trap, Esc to close and focus restore. */
export function Dialog({ title, onClose, children, footer, width = 480, initialFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // captured during the first render, before any child effect can move focus into the dialog
  const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null))
  const titleId = useId()
  useEffect(() => {
    const el = ref.current
    const target = (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) || el?.querySelector<HTMLElement>('input, textarea, select, button:not(.dialog-x)')
    if (!el?.contains(document.activeElement)) (target ?? el)?.focus()
  }, [initialFocus])
  useEffect(() => () => {
    // give focus back to what had it before the dialog opened; if that is gone, to the document
    const a = document.activeElement
    const lost = !a || a === document.body || !a.isConnected || !!ref.current?.contains(a)
    if (!lost) return
    if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
    else focusDocument()
  }, [opener])

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose() }
          if (e.key === 'Tab') {
            const f = [...(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])') ?? [])]
            if (!f.length) return
            const i = f.indexOf(document.activeElement as HTMLElement)
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus() }
            else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus() }
          }
        }}
      >
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button className="dialog-x icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
