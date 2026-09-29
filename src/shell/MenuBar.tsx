import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Command as CommandIcon, Search, TextSearch } from 'lucide-react'
import { useCatalog } from '../data/CatalogContext'
import { onCommandsChanged, formatKeys, isMac } from '../commands/registry'
import { actions, useApp, selectActiveConsultation } from '../state/store'
import { MenuList } from '../ui/Menu'
import type { MenuCloseReason } from '../ui/Menu'
import { buildMenus } from './menus'
import { SaveIndicator } from './SaveIndicator'
import { patientName } from '../features/patients/logic'
import { focusDocument } from '../features/workspace/panes'

/** Inside the menubar or one of its dropdowns (portalled to <body>). */
const inMenus = (el: Element | null) => !!el?.closest('[data-menubar], .menu-list')

export const MenuBar = memo(function MenuBar() {
  const catalog = useCatalog()
  const [version, force] = useState(0)
  useEffect(() => onCommandsChanged(() => force(x => x + 1)), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const menus = useMemo(() => buildMenus(catalog), [catalog, version])
  const [open, setOpen] = useState<number | null>(null)
  // roving tab stop: the one menubar item reachable with Tab
  const [current, setCurrent] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  /** Where focus was before the menubar was entered; menus give it back when they close. */
  const returnTo = useRef<HTMLElement | null>(null)
  const consultation = useApp(selectActiveConsultation)
  const patient = useApp(s => (consultation ? s.patients[consultation.patientId] : null))

  const remember = (from: Element | null = document.activeElement) => {
    if (from instanceof HTMLElement && from !== document.body && !inMenus(from)) returnTo.current = from
  }
  const giveBackFocus = () => {
    const t = returnTo.current
    returnTo.current = null
    if (t?.isConnected) t.focus({ preventScroll: true })
    else if (!focusDocument()) (document.activeElement as HTMLElement | null)?.blur?.()
  }
  const focusItem = (i: number) => { setCurrent(i); refs.current[i]?.focus() }

  // Alt (alone) or F10 focuses the menubar, like a desktop app.
  useEffect(() => {
    let altAlone = false
    const enter = () => { remember(); setCurrent(0); refs.current[0]?.focus() }
    const down = (e: KeyboardEvent) => {
      altAlone = e.key === 'Alt'
      if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); enter() }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && altAlone) { e.preventDefault(); enter() }
      altAlone = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rect = open !== null ? refs.current[open]?.getBoundingClientRect() : null

  const closeMenu = (reason?: MenuCloseReason) => {
    setOpen(null)
    // keyboard closes and a chosen item hand focus back; a click elsewhere keeps its own focus
    if (reason === 'escape' || reason === 'tab' || reason === 'select') giveBackFocus()
    else returnTo.current = null
  }

  return (
    <div className="menubar" data-menubar ref={rootRef}>
      <div className="brand" aria-hidden="true"><span className="brand-mark">R</span><span className="brand-name">Radar Opus</span></div>
      <nav className="menubar-nav" aria-label="Application">
        <div
          className="menubar-menus"
          role="menubar"
          aria-label="Main menu"
          onFocus={e => { if (!inMenus(e.relatedTarget as Element | null)) remember(e.relatedTarget as Element | null) }}
        >
          {menus.map((m, i) => (
            <button
              key={m.label}
              ref={el => { refs.current[i] = el }}
              id={`menubar-${i}`}
              role="menuitem"
              tabIndex={i === current ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={open === i}
              className={`menubar-item${open === i ? ' open' : ''}`}
              onFocus={() => setCurrent(i)}
              onMouseDown={e => { e.preventDefault(); if (open === null) remember(); setCurrent(i); setOpen(open === i ? null : i) }}
              onMouseEnter={() => { if (open !== null) { setCurrent(i); setOpen(i) } }}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') { e.preventDefault(); focusItem((i + 1) % menus.length) }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); focusItem((i - 1 + menus.length) % menus.length) }
                else if (e.key === 'Home') { e.preventDefault(); focusItem(0) }
                else if (e.key === 'End') { e.preventDefault(); focusItem(menus.length - 1) }
                else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(i) }
                else if (e.key === 'Escape') { e.preventDefault(); giveBackFocus() }
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </nav>
      {open !== null && rect && (
        <MenuList
          key={open}
          items={menus[open].items}
          x={rect.left}
          y={rect.bottom}
          label={menus[open].label}
          onClose={closeMenu}
          container={rootRef.current}
          onNavigate={d => {
            const n = (open + d + menus.length) % menus.length
            setCurrent(n)
            setOpen(n)
          }}
        />
      )}
      <div className="menubar-spacer" />
      {patient && consultation && (
        <button className="menubar-case" onClick={() => actions.openTab({ kind: 'patient', patientId: patient.id })} title="Open active patient">
          <span className="menubar-case-dot" aria-hidden="true" />
          <span className="menubar-case-text">{patientName(patient)} <span className="menubar-case-sub">· {consultation.title}</span></span>
        </button>
      )}
      <button className="menubar-search" onClick={() => actions.setCommandPalette(true)} aria-label="Search commands, rubrics and remedies">
        <Search size={13} aria-hidden />
        <span>Search rubrics, remedies, commands</span>
        <span className="kbd">{formatKeys('Mod+K')}</span>
      </button>
      <SaveIndicator />
      <button className="icon-btn" aria-label="Command palette" title={`Command palette (${formatKeys('Mod+K')})`} onClick={() => actions.setCommandPalette(true)}>
        {isMac ? <CommandIcon size={14} aria-hidden /> : <TextSearch size={14} aria-hidden />}
      </button>
    </div>
  )
})
