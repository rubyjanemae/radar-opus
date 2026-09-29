import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatKeys, getCommand, isEnabled } from '../commands/registry'

export type MenuItem =
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | {
      type?: 'item'
      /** Either a registered command id … */
      command?: string
      /** … or an inline action. */
      label?: string
      run?: () => void
      keys?: string
      disabled?: boolean
      checked?: boolean
      danger?: boolean
      submenu?: MenuItem[]
    }

interface Resolved { label: string; keys?: string; disabled: boolean; checked?: boolean; danger?: boolean; run?: () => void; submenu?: MenuItem[] }

function resolve(item: Extract<MenuItem, { type?: 'item' }>): Resolved {
  const cmd = item.command ? getCommand(item.command) : undefined
  return {
    label: item.label ?? cmd?.title ?? item.command ?? '',
    keys: item.keys ?? cmd?.keys?.[0],
    disabled: item.disabled ?? (cmd ? !isEnabled(cmd) : !item.run && !item.submenu),
    checked: item.checked ?? cmd?.checked?.(),
    danger: item.danger,
    run: item.run ?? (cmd ? () => void cmd.run() : undefined),
    submenu: item.submenu,
  }
}

interface MenuListProps {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
  /** Called with -1/+1 when Left/Right is pressed at the top level (menubar navigation). */
  onNavigate?: (dir: -1 | 1) => void
  autoFocus?: boolean
  label?: string
  /** Opened as a submenu: Left closes it. */
  nested?: boolean
}

/** Floating keyboard-navigable menu list; used for menubar dropdowns and context menus. */
export function MenuList({ items, x, y, onClose, onNavigate, autoFocus = true, label, nested }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [active, setActive] = useState(-1)
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null)
  const actionable = items.map((it, i) => ('type' in it && (it.type === 'separator' || it.type === 'label')) ? -1 : i).filter(i => i >= 0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.min(x, window.innerWidth - r.width - 4)
    const ny = y + r.height > window.innerHeight - 4 ? Math.max(4, window.innerHeight - r.height - 4) : y
    setPos({ x: Math.max(4, nx), y: ny })
  }, [x, y])

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
      setActive(actionable.find(i => !resolve(items[i] as never).disabled) ?? -1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (nested) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.menu-list') && !t.closest('[data-menubar]')) onClose()
    }
    const onBlur = () => onClose()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onBlur) }
  }, [onClose, nested])

  const activate = (i: number) => {
    const r = resolve(items[i] as never)
    if (r.disabled) return
    if (r.submenu) {
      const el = ref.current?.querySelectorAll<HTMLElement>('[data-index]')[actionable.indexOf(i)]
      const rect = el?.getBoundingClientRect()
      if (rect) setSub({ index: i, x: rect.right - 2, y: rect.top - 4 })
      return
    }
    onClose()
    r.run?.()
  }

  const move = (d: number) => {
    const enabled = actionable.filter(i => !resolve(items[i] as never).disabled)
    if (!enabled.length) return
    const k = enabled.indexOf(active)
    setActive(enabled[(k + d + enabled.length) % enabled.length])
  }

  return createPortal(
    <div
      ref={ref}
      className="menu-list"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (sub) return
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
        else if (e.key === 'Home') { e.preventDefault(); setActive(-1); move(1) }
        else if (e.key === 'End') { e.preventDefault(); setActive(-1); move(-1) }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0) activate(active) }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
        else if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (active >= 0 && resolve(items[active] as never).submenu) activate(active)
          else onNavigate?.(1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (nested) onClose()
          else onNavigate?.(-1)
        } else if (e.key === 'Tab') { e.preventDefault(); onClose() }
        else if (e.key.length === 1) {
          const ch = e.key.toLowerCase()
          const hit = actionable.find(i => i !== active && resolve(items[i] as never).label.toLowerCase().startsWith(ch) && !resolve(items[i] as never).disabled)
          if (hit !== undefined) setActive(hit)
        }
      }}
    >
      {items.map((it, i) => {
        if ('type' in it && it.type === 'separator') return <div key={i} className="menu-sep" role="separator" />
        if ('type' in it && it.type === 'label') return <div key={i} className="menu-label">{it.label}</div>
        const r = resolve(it as never)
        return (
          <div
            key={i}
            data-index={i}
            role={r.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={r.checked}
            aria-disabled={r.disabled || undefined}
            aria-haspopup={r.submenu ? 'menu' : undefined}
            className={`menu-item${i === active ? ' active' : ''}${r.disabled ? ' disabled' : ''}${r.danger ? ' danger' : ''}`}
            onMouseEnter={() => {
              setActive(i)
              if (r.submenu && !r.disabled) activate(i)
              else setSub(null)
            }}
            onClick={() => activate(i)}
          >
            <span className="menu-check">{r.checked ? '✓' : ''}</span>
            <span className="menu-text">{r.label}</span>
            {r.submenu ? <span className="menu-arrow">›</span> : r.keys ? <span className="menu-keys">{formatKeys(r.keys)}</span> : null}
          </div>
        )
      })}
      {sub && (
        <MenuList
          nested
          items={resolve(items[sub.index] as never).submenu ?? []}
          x={sub.x}
          y={sub.y}
          onClose={() => { setSub(null); ref.current?.focus() }}
        />
      )}
    </div>,
    document.body,
  )
}

/** Context menu state helper: `const cm = useContextMenu(); <div onContextMenu={e => cm.open(e, items)}/>{cm.element}` */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const restore = useRef<HTMLElement | null>(null)
  return {
    open(e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation?: () => void }, items: MenuItem[]) {
      e.preventDefault()
      e.stopPropagation?.()
      restore.current = document.activeElement as HTMLElement | null
      setState({ x: e.clientX, y: e.clientY, items })
    },
    /** Open at an element (keyboard: Shift+F10 / ContextMenu key). */
    openAt(el: HTMLElement, items: MenuItem[]) {
      const r = el.getBoundingClientRect()
      restore.current = document.activeElement as HTMLElement | null
      setState({ x: r.left + 12, y: r.bottom, items })
    },
    close() { setState(null) },
    element: state ? (
      <MenuList
        items={state.items}
        x={state.x}
        y={state.y}
        label="Context menu"
        onClose={() => { setState(null); restore.current?.focus?.() }}
      />
    ) : null,
  }
}
