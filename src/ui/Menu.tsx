import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { displayKey, execute, formatKeys, getCommand, isEnabled, isReserved } from '../commands/registry'

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

export type MenuEntry = Extract<MenuItem, { type?: 'item' }>
const isEntry = (it: MenuItem): it is MenuEntry => !('type' in it) || it.type === undefined || it.type === 'item'

/** Why a menu closed: callers restore focus for keyboard closes and after an item ran. */
export type MenuCloseReason = 'escape' | 'tab' | 'select' | 'outside' | 'blur'

interface Resolved { label: string; keys?: string; disabled: boolean; checked?: boolean; danger?: boolean; run?: () => void; submenu?: MenuItem[] }

/** Label, shortcut and state of a menu entry; the shortcut shown is never one the browser keeps for itself. */
export function resolveMenuItem(item: MenuEntry): Resolved {
  const cmd = item.command ? getCommand(item.command) : undefined
  return {
    label: item.label ?? cmd?.title ?? item.command ?? '',
    keys: item.keys !== undefined ? (isReserved(item.keys) ? undefined : item.keys) : displayKey(cmd?.keys),
    disabled: item.disabled ?? (cmd ? !isEnabled(cmd) : !item.run && !item.submenu),
    checked: item.checked ?? cmd?.checked?.(),
    danger: item.danger,
    run: item.run ?? (cmd ? () => void execute(cmd) : undefined),
    submenu: item.submenu,
  }
}

interface MenuListProps {
  items: MenuItem[]
  x: number
  y: number
  onClose: (reason?: MenuCloseReason) => void
  /** Called with -1/+1 when Left/Right is pressed at the top level (menubar navigation). */
  onNavigate?: (dir: -1 | 1) => void
  autoFocus?: boolean
  label?: string
  /** Opened as a submenu: Left closes it. */
  nested?: boolean
  /** Submenus: close the whole menu tree after an item runs (defaults to onClose). */
  onDone?: (reason?: MenuCloseReason) => void
  /** Element to render the menu into (default <body>); e.g. the menubar's landmark for its dropdowns. */
  container?: Element | null
  /** Submenus: left edge of the parent menu, used to flip the submenu to the left side when it does not fit on the right. */
  flipX?: number
}

/** Floating keyboard-navigable menu list; used for menubar dropdowns and context menus. */
export function MenuList({ items, x, y, onClose, onNavigate, autoFocus = true, label, nested, onDone, flipX, container }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const itemId = (i: number) => `${baseId}-item-${i}`
  const [pos, setPos] = useState({ x, y })
  const [active, setActive] = useState(-1)
  const [sub, setSub] = useState<{ index: number; x: number; y: number; flipX: number } | null>(null)
  const actionable = items.map((it, i) => (isEntry(it) ? i : -1)).filter(i => i >= 0)
  const at = (i: number) => resolveMenuItem(items[i] as MenuEntry)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const fits = x + r.width <= window.innerWidth - 4
    const nx = fits ? x : flipX !== undefined ? flipX - r.width + 2 : window.innerWidth - r.width - 4
    const ny = y + r.height > window.innerHeight - 4 ? Math.max(4, window.innerHeight - r.height - 4) : y
    setPos({ x: Math.max(4, nx), y: ny })
  }, [x, y, flipX])

  // keep the keyboard-active item visible when the menu scrolls (tall menus)
  useEffect(() => {
    if (active < 0) return
    ref.current?.querySelector<HTMLElement>(`:scope > [data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
      setActive(actionable.find(i => !at(i).disabled) ?? -1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (nested) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.menu-list') && !t.closest('[data-menubar]')) onClose('outside')
    }
    const onBlur = () => onClose('blur')
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onBlur) }
  }, [onClose, nested])

  const activate = (i: number) => {
    const r = at(i)
    if (r.disabled) return
    if (r.submenu) {
      const el = ref.current?.querySelectorAll<HTMLElement>('[data-index]')[actionable.indexOf(i)]
      const rect = el?.getBoundingClientRect()
      const box = ref.current?.getBoundingClientRect()
      if (rect) setSub({ index: i, x: rect.right - 2, y: rect.top - 4, flipX: box?.left ?? rect.left })
      return
    }
    ;(onDone ?? onClose)('select')
    r.run?.()
  }

  const move = (d: number) => {
    const enabled = actionable.filter(i => !at(i).disabled)
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
      aria-activedescendant={active >= 0 ? itemId(active) : undefined}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (sub) return
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
        else if (e.key === 'Home') { e.preventDefault(); setActive(-1); move(1) }
        else if (e.key === 'End') { e.preventDefault(); setActive(-1); move(-1) }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0) activate(active) }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose('escape') }
        else if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (active >= 0 && at(active).submenu) activate(active)
          else onNavigate?.(1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (nested) onClose('escape')
          else onNavigate?.(-1)
        } else if (e.key === 'Tab') { e.preventDefault(); (onDone ?? onClose)('tab') }
        else if (e.key.length === 1) {
          const ch = e.key.toLowerCase()
          const hit = actionable.find(i => i !== active && at(i).label.toLowerCase().startsWith(ch) && !at(i).disabled)
          if (hit !== undefined) setActive(hit)
        }
      }}
    >
      {items.map((it, i) => {
        if (!isEntry(it)) {
          return it.type === 'separator'
            ? <div key={i} className="menu-sep" role="separator" />
            : <div key={i} className="menu-label" role="presentation">{it.label}</div>
        }
        const r = resolveMenuItem(it)
        return (
          <div
            key={i}
            id={itemId(i)}
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
          items={at(sub.index).submenu ?? []}
          x={sub.x}
          y={sub.y}
          flipX={sub.flipX}
          onDone={onDone ?? onClose}
          onClose={() => { setSub(null); ref.current?.focus() }}
        />
      )}
    </div>,
    container ?? document.body,
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
        onClose={reason => {
          setState(null)
          // a click elsewhere moves focus itself; keyboard closes and chosen items return it
          if (reason !== 'outside' && restore.current?.isConnected) restore.current.focus()
        }}
      />
    ) : null,
  }
}
