import { useEffect, useRef } from 'react'
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
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const target = (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) || el?.querySelector<HTMLElement>('input, textarea, select, button:not(.dialog-x)')
    target?.focus()
    return () => prev?.focus?.()
  }, [initialFocus])

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
          <h2>{title}</h2>
          <button className="dialog-x icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
