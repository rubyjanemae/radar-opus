import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Command as CommandIcon, Search, TextSearch } from 'lucide-react'
import { flushSync } from 'react-dom'
import { useCatalog } from '../data/CatalogContext'
import { onCommandsChanged, formatKeys, isMac } from '../commands/registry'
import { actions, useApp, selectActiveConsultation } from '../state/store'
import { MenuList } from '../ui/Menu'
import type { MenuCloseReason, MenuItem } from '../ui/Menu'
import { isModalOpen } from '../ui/modal'
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
  const allMenus = useMemo(() => buildMenus(catalog), [catalog, version])
  // narrow windows: the menus that do not fit fold into a trailing "…" menu (no horizontal page scroll)
  const [fit, setFit] = useState(allMenus.length)
  const menus = useMemo((): { label: string; items: MenuItem[]; more?: boolean }[] => {
    if (fit >= allMenus.length) return allMenus
    const hidden = allMenus.slice(fit)
    return [...allMenus.slice(0, fit), { label: 'More menus', more: true, items: hidden.map(m => ({ label: m.label, submenu: m.items })) }]
  }, [allMenus, fit])
  const measureRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
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
    // a modal dialog keeps the keyboard: the menubar is behind it
    const enter = () => { if (isModalOpen()) return; remember(); setCurrent(0); refs.current[0]?.focus() }
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

  // how many menus fit beside the rest of the menubar (measured from an invisible copy of the labels)
  useLayoutEffect(() => {
    const bar = rootRef.current, meas = measureRef.current
    if (!bar || !meas) return
    const outer = (el: Element) => {
      const cs = getComputedStyle(el)
      return el.getBoundingClientRect().width + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight)
    }
    const compute = () => {
      const widths = [...meas.children].map(c => c.getBoundingClientRect().width)
      const moreW = widths.pop() ?? 0
      const cs = getComputedStyle(bar)
      const gap = parseFloat(cs.columnGap) || 0
      let others = 0
      for (const c of bar.children) {
        if (c === navRef.current || c === meas || c.classList.contains('menubar-spacer') || c.classList.contains('menu-list')) continue
        if (getComputedStyle(c).display === 'none') continue
        others += outer(c) + gap
      }
      const avail = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - others - 2
      const total = widths.reduce((a, b) => a + b + 1, 0)
      let n = widths.length
      if (total > avail) {
        n = 0
        let acc = moreW
        while (n < widths.length && acc + widths[n] + 1 <= avail) acc += widths[n++] + 1
      }
      // the observer runs after layout and before paint: commit now so the fitted bar is what paints
      flushSync(() => setFit(n))
    }
    // no synchronous first measurement: reading layout here would force the whole first layout of the
    // app into this commit (a long startup task); the observer's initial callback measures in the frame
    const ro = new ResizeObserver(compute)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [allMenus])
  // a fold or unfold changes which item an index names: close an open menu, keep the tab stop in range
  useEffect(() => { setOpen(null); setCurrent(c => Math.min(c, menus.length - 1)) }, [menus.length])

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
      <div className="menubar-measure" ref={measureRef} aria-hidden="true">
        {allMenus.map(m => <span key={m.label} className="menubar-item">{m.label}</span>)}
        <span className="menubar-item">…</span>
      </div>
      <nav className="menubar-nav" aria-label="Application" ref={navRef}>
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
              aria-label={m.more ? 'More menus' : undefined}
              title={m.more ? allMenus.slice(fit).map(x => x.label).join(', ') : undefined}
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
              {m.more ? '…' : m.label}
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
