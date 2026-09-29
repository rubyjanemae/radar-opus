import { forwardRef, useId, useMemo, useRef, useState } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { findRemedies } from '../search/remedies'

interface Props {
  value: number | null
  onChange: (id: number | null) => void
  onEnter?: () => void
  placeholder?: string
}

/** Remedy combobox: type an abbreviation or name, pick with ↑↓ and Enter/Tab. */
export const RemedyInput = forwardRef<HTMLInputElement, Props>(function RemedyInput({ value, onChange, onEnter, placeholder = 'Remedy…' }, ref) {
  const catalog = useCatalog()
  const [text, setText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)
  const [up, setUp] = useState(false)
  /** Open the list upward when there is not enough room below inside the scrolling pane (or the window). */
  const placeList = () => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let bottom = window.innerHeight, top = 0
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY
      if (o === 'auto' || o === 'scroll' || o === 'hidden') { const pr = p.getBoundingClientRect(); bottom = Math.min(bottom, pr.bottom); top = Math.max(top, pr.top); break }
    }
    const below = bottom - r.bottom, above = r.top - top
    setUp(below < 250 && above > below)
  }
  const shown = text ?? (value !== null ? catalog.remedy(value).abbrev : '')
  const matches = useMemo(() => (text ? findRemedies(catalog, text, 8) : []), [catalog, text])

  const pick = (i: number) => {
    const m = matches[i]
    if (!m) return false
    onChange(m.remedy.id)
    setText(null)
    setOpen(false)
    return true
  }

  return (
    <div className="pt-combo" ref={box}>
      <input
        ref={ref} className="input pt-combo-input" value={shown} placeholder={placeholder} aria-label="Remedy"
        role="combobox" aria-expanded={open && matches.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        onChange={e => { if (!open) placeList(); setText(e.target.value); setOpen(true); setActive(0); if (!e.target.value) onChange(null) }}
        onFocus={e => e.target.select()}
        onBlur={() => { if (text && matches.length && open) pick(active); setOpen(false); setText(null) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) placeList(); setOpen(true); setActive(a => Math.min(matches.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
          else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && text && matches.length) pick(active)
            else onEnter?.()
          } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setText(null) }
          else if (e.key === 'Tab' && open && text && matches.length) pick(active)
        }}
      />
      {open && text && (
        <div className={`pt-combo-list${up ? ' up' : ''}`} role="listbox" id={listId}>
          {matches.length ? matches.map((m, i) => (
            <div
              key={m.remedy.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`pt-combo-opt${i === active ? ' active' : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(i) }} onMouseEnter={() => setActive(i)}
            >
              <b>{m.remedy.abbrev}</b><span>{m.remedy.name}</span>
            </div>
          )) : <div className="pt-combo-empty">No remedy matches “{text}”</div>}
        </div>
      )}
    </div>
  )
})
