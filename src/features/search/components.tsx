import { useEffect, useMemo, useRef, useState } from 'react'
import { Pill } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { highlightSegments } from './text'
import { findRemedies } from './remedies'

/** Text with query words highlighted. */
export function Highlight({ text, hit }: { text: string; hit: ((norm: string) => boolean) | null }) {
  if (!hit) return <>{text}</>
  const segs = highlightSegments(text, hit)
  return <>{segs.map((s, i) => s.hit ? <mark key={i} className="srch-mark">{s.text}</mark> : <span key={i}>{s.text}</span>)}</>
}

/** Rubric path with the chapter emphasised and query words highlighted. */
export function RubricPath({ parts, hit, skip = 0 }: { parts: string[]; hit: ((norm: string) => boolean) | null; skip?: number }) {
  return (
    <>
      {parts.slice(skip).map((p, k) => (
        <span key={k} className={k + skip === 0 ? 'srch-chap' : k === parts.length - skip - 1 ? 'srch-leaf' : undefined}>
          {k > 0 && <span className="srch-sep">, </span>}
          <Highlight text={p} hit={hit} />
        </span>
      ))}
    </>
  )
}

/** Mouse-enter handler: show the full text as a tooltip only when the element is truncated. */
export function titleIfTruncated(full: string | (() => string)) {
  return (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (el.scrollWidth > el.clientWidth + 1) el.title = typeof full === 'function' ? full() : full
    else el.removeAttribute('title')
  }
}

/** Autocomplete for a remedy by abbreviation or name. */
export function RemedyPicker({ value, onChange, autoFocus, id }: { value: number | null; onChange: (id: number | null) => void; autoFocus?: boolean; id?: string }) {
  const catalog = useCatalog()
  const current = value != null ? catalog.remedy(value) : null
  const [text, setText] = useState(current ? `${current.abbrev} — ${current.name}` : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setText(current ? `${current.abbrev} — ${current.name}` : '') }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const q = text.includes(' — ') ? '' : text
  const matches = useMemo(() => (q.trim() ? findRemedies(catalog, q, 12) : []), [catalog, q])
  const pick = (rid: number) => { onChange(rid); setOpen(false) }
  const listId = `${id ?? 'rp'}-list`
  return (
    <div className="srch-rp">
      <Pill size={14} className="srch-rp-icon" aria-hidden />
      <input
        ref={inputRef}
        id={id}
        data-search-input
        className="input srch-rp-input"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].remedy.id}` : undefined}
        aria-label="Remedy"
        placeholder="Remedy abbreviation or name…"
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        value={text}
        onFocus={e => { if (current) e.currentTarget.select() }}
        onChange={e => { setText(e.target.value); setOpen(true); setActive(0) }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(matches.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
          else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active].remedy.id) }
          else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        }}
      />
      {open && q.trim() && matches.length === 0 && (
        <div className="srch-rp-pop" role="status" aria-live="polite">
          <div className="srch-rp-none">No remedy matches “{q.trim()}”</div>
        </div>
      )}
      {open && matches.length > 0 && (
        <div className="srch-rp-pop" role="listbox" id={listId} aria-label="Remedies">
          {matches.map((m, i) => (
            <div
              key={m.remedy.id}
              id={`${listId}-${m.remedy.id}`}
              role="option"
              aria-selected={i === active}
              className={`srch-rp-opt${i === active ? ' active' : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(m.remedy.id) }}
              onMouseMove={() => { if (i !== active) setActive(i) }}
            >
              <b>{m.remedy.abbrev}</b>
              <span>{m.remedy.name}</span>
              {m.field === 'alt' && m.remedy.altName && <em>{m.remedy.altName.replace(/[{}"]/g, '').replace(/,/g, ', ')}</em>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Small bar for the search summary, stacked by grade (grade also shown by the legend pattern). */
export function GradeBar({ byGrade, max }: { byGrade: [number, number, number, number]; max: number }) {
  const total = byGrade.reduce((a, b) => a + b, 0)
  return (
    <span className="srch-bar" style={{ width: `${Math.max(2, (total / Math.max(1, max)) * 100)}%` }}>
      {[3, 2, 1, 0].map(g => byGrade[g] ? <span key={g} className={`srch-bar-seg sb${g + 1}`} style={{ flexGrow: byGrade[g] }} /> : null)}
    </span>
  )
}
