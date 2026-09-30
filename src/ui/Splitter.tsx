import { useRef } from 'react'

interface Props {
  /** Resizes along x ("vertical" bar) or y ("horizontal" bar). */
  orientation: 'vertical' | 'horizontal'
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  /** +1 when dragging right/down grows the pane, -1 when it shrinks it. */
  direction?: 1 | -1
  label: string
  onReset?: () => void
}

/** Draggable, keyboard-operable pane splitter (role="separator"). */
export function Splitter({ orientation, value, min, max, onChange, direction = 1, label, onReset }: Props) {
  const start = useRef<{ pos: number; value: number } | null>(null)
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, v)))

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={e => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        start.current = { pos: orientation === 'vertical' ? e.clientX : e.clientY, value }
        document.body.classList.add(orientation === 'vertical' ? 'resizing-x' : 'resizing-y')
      }}
      onPointerMove={e => {
        if (!start.current) return
        const pos = orientation === 'vertical' ? e.clientX : e.clientY
        onChange(clamp(start.current.value + (pos - start.current.pos) * direction))
      }}
      onPointerUp={e => {
        start.current = null
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        document.body.classList.remove('resizing-x', 'resizing-y')
      }}
      onDoubleClick={onReset}
      onKeyDown={e => {
        const step = e.shiftKey ? 50 : 10
        const grow = orientation === 'vertical' ? ['ArrowRight'] : ['ArrowDown']
        const shrink = orientation === 'vertical' ? ['ArrowLeft'] : ['ArrowUp']
        if (grow.includes(e.key)) { e.preventDefault(); onChange(clamp(value + step * direction)) }
        else if (shrink.includes(e.key)) { e.preventDefault(); onChange(clamp(value - step * direction)) }
        else if (e.key === 'Home') { e.preventDefault(); onChange(min) }
        else if (e.key === 'End') { e.preventDefault(); onChange(max) }
      }}
    />
  )
}
