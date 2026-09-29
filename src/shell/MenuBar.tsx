import { useEffect, useMemo, useRef, useState } from 'react'
import { Command as CommandIcon, Search } from 'lucide-react'
import { useCatalog } from '../data/CatalogContext'
import { onCommandsChanged, formatKeys } from '../commands/registry'
import { actions, useApp, selectActiveConsultation } from '../state/store'
import { MenuList } from '../ui/Menu'
import { buildMenus } from './menus'
import { SaveIndicator } from './SaveIndicator'
import { patientName } from '../features/patients/logic'

export function MenuBar() {
  const catalog = useCatalog()
  const [, force] = useState(0)
  useEffect(() => onCommandsChanged(() => force(x => x + 1)), [])
  const menus = useMemo(() => buildMenus(catalog), [catalog])
  const [open, setOpen] = useState<number | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const consultation = useApp(selectActiveConsultation)
  const patient = useApp(s => (consultation ? s.patients[consultation.patientId] : null))

  // Alt (alone) or F10 focuses the menubar, like a desktop app.
  useEffect(() => {
    let altAlone = false
    const down = (e: KeyboardEvent) => {
      altAlone = e.key === 'Alt'
      if (e.key === 'F10' && !e.shiftKey) { e.preventDefault(); refs.current[0]?.focus() }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && altAlone) { e.preventDefault(); refs.current[0]?.focus() }
      altAlone = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const rect = open !== null ? refs.current[open]?.getBoundingClientRect() : null

  return (
    <div className="menubar" role="menubar" aria-label="Main menu" data-menubar>
      <div className="brand" aria-hidden="true"><span className="brand-mark">R</span><span className="brand-name">Radar Opus</span></div>
      {menus.map((m, i) => (
        <button
          key={m.label}
          ref={el => { refs.current[i] = el }}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open === i}
          className={`menubar-item${open === i ? ' open' : ''}`}
          onMouseDown={e => { e.preventDefault(); setOpen(open === i ? null : i) }}
          onMouseEnter={() => { if (open !== null) setOpen(i) }}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); refs.current[(i + 1) % menus.length]?.focus() }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); refs.current[(i - 1 + menus.length) % menus.length]?.focus() }
            else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(i) }
            else if (e.key === 'Escape') { (e.target as HTMLElement).blur() }
          }}
        >
          {m.label}
        </button>
      ))}
      {open !== null && rect && (
        <MenuList
          key={open}
          items={menus[open].items}
          x={rect.left}
          y={rect.bottom}
          label={menus[open].label}
          onClose={() => { setOpen(null) }}
          onNavigate={d => {
            const n = (open + d + menus.length) % menus.length
            setOpen(n)
          }}
        />
      )}
      <div className="menubar-spacer" />
      {patient && consultation && (
        <button className="menubar-case" onClick={() => actions.openTab({ kind: 'patient', patientId: patient.id })} title="Open active patient">
          <span className="menubar-case-dot" />
          <span className="menubar-case-text">{patientName(patient)} <span className="menubar-case-sub">· {consultation.title}</span></span>
        </button>
      )}
      <button className="menubar-search" onClick={() => actions.setCommandPalette(true)} aria-label="Search commands, rubrics and remedies">
        <Search size={13} />
        <span>Search rubrics, remedies, commands</span>
        <span className="kbd">{formatKeys('Mod+K')}</span>
      </button>
      <SaveIndicator />
      <button className="icon-btn" aria-label="Command palette" onClick={() => actions.setCommandPalette(true)}><CommandIcon size={14} /></button>
    </div>
  )
}
