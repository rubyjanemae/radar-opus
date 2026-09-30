import { useMemo, useRef, useState } from 'react'
import type React from 'react'
import { BookText, FlaskConical } from 'lucide-react'
import { formatKeys } from '../../commands/registry'
import { useCatalog } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import type { Remedy } from '../../data/types'
import { Dialog } from '../../ui/Dialog'
import { useFixedVirtual } from '../repertory/virtual'
import { findRemedies } from '../search/remedies'
import { bookIfLoaded, useBook } from './book'
import { openMM, openRemedy } from './ops'
import { parseAltNames } from './resolve'
import './remedy.css'

const ROW = 28

/** Remedies in abbreviation order with their parsed aliases: built once per catalog, not on every open. */
const sortedCache = new WeakMap<Catalog, { all: Remedy[]; alts: Map<number, string[]> }>()
function pickerList(catalog: Catalog) {
  let hit = sortedCache.get(catalog)
  if (!hit) {
    const all = [...catalog.remedies.values()].sort((a, b) => a.abbrev.localeCompare(b.abbrev, undefined, { sensitivity: 'base' }))
    hit = { all, alts: new Map(all.map(r => [r.id, parseAltNames(r.altName)])) }
    sortedCache.set(catalog, hit)
  }
  return hit
}

/** Remedies (Ctrl+4): pick any of the installed remedies by abbreviation, name or alias. */
export function RemedyPickerDialog({ onClose, target }: { onClose: () => void; target?: 'remedy' | 'mm' }) {
  const catalog = useCatalog()
  const { book } = useBook(catalog)
  const [q, setQ] = useState('')
  const [onlyMM, setOnlyMM] = useState(target === 'mm')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { all, alts: altsOf } = pickerList(catalog)
  const results: Remedy[] = useMemo(() => {
    const base = q.trim() ? findRemedies(catalog, q, 400).map(m => m.remedy) : all
    return onlyMM && book ? base.filter(r => book.has(r.id)) : base
  }, [q, all, catalog, onlyMM, book])
  const v = useFixedVirtual(listRef, results.length, ROW)
  const cur = results[Math.min(sel, results.length - 1)] ?? null

  const choose = (r: Remedy | null, mm: boolean) => {
    if (!r) return
    onClose()
    if (mm && bookIfLoaded(catalog)?.has(r.id)) openMM(r.id)
    else openRemedy(r.id)
  }
  const move = (i: number) => {
    const n = Math.max(0, Math.min(results.length - 1, i))
    setSel(n)
    v.scrollToIndex(n)
  }
  /** Keys shared by the search field and the list: arrows, paging, Home/End (list only), Enter. */
  const onNavKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const inList = e.currentTarget === listRef.current
    if (e.key === 'ArrowDown') { e.preventDefault(); move(sel + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(sel - 1) }
    else if (e.key === 'PageDown') { e.preventDefault(); move(sel + v.pageSize) }
    else if (e.key === 'PageUp') { e.preventDefault(); move(sel - v.pageSize) }
    else if (inList && e.key === 'Home') { e.preventDefault(); move(0) }
    else if (inList && e.key === 'End') { e.preventDefault(); move(results.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cur, e.altKey || e.ctrlKey || e.metaKey || target === 'mm') }
  }

  return (
    <Dialog
      title="Remedies"
      width={620}
      onClose={onClose}
      footer={
        <>
          <span className="rp-hint"><kbd className="kbd">{formatKeys('Enter')}</kbd> remedy information · <kbd className="kbd">{formatKeys('Alt+Enter')}</kbd> materia medica</span>
          <button className="btn" disabled={!cur || !book?.has(cur.id)} onClick={() => choose(cur, true)}><BookText size={14} /> Materia medica</button>
          <button className="btn btn-primary" disabled={!cur} onClick={() => choose(cur, target === 'mm')}><FlaskConical size={14} /> {target === 'mm' ? 'Open' : 'Remedy information'}</button>
        </>
      }
    >
      <div className="rp-top">
        <input
          className="input rp-input"
          autoFocus
          value={q}
          placeholder={`Search ${catalog.remedies.size.toLocaleString()} remedies by abbreviation, name or alias…`}
          aria-label="Search remedies"
          aria-controls="rp-list"
          aria-activedescendant={cur ? `rp-${cur.id}` : undefined}
          spellCheck={false}
          onChange={e => { setQ(e.target.value); setSel(0); if (listRef.current) listRef.current.scrollTop = 0 }}
          onKeyDown={onNavKey}
        />
        <label className="rp-only"><input type="checkbox" checked={onlyMM} disabled={!book} onChange={e => { setOnlyMM(e.target.checked); setSel(0) }} /> In Boericke only</label>
      </div>
      <div className="rp-count" role="status" aria-live="polite" aria-atomic="true">{results.length ? `${results.length.toLocaleString()} ${results.length === 1 ? 'remedy' : 'remedies'}${q.trim() ? (results.length === 1 ? ' matches' : ' match') : ''}` : 'No remedy matches'}</div>
      <div className="rp-listwrap">
        <div ref={listRef} id="rp-list" className="rp-list" role="listbox" aria-label="Remedies" tabIndex={0}
          aria-activedescendant={cur ? `rp-${cur.id}` : undefined} onKeyDown={onNavKey}>
          <div style={{ height: v.total, position: 'relative' }}>
            {results.slice(v.start, v.end).map((r, k) => {
              const i = v.start + k
              const alts = altsOf.get(r.id) ?? []
              return (
                <div key={r.id} id={`rp-${r.id}`} role="option" aria-selected={i === sel} className={`rp-row${i === sel ? ' on' : ''}`} style={{ top: i * ROW, height: ROW }}
                  onMouseDown={e => e.preventDefault()} onClick={() => setSel(i)} onDoubleClick={() => choose(r, target === 'mm')}>
                  <span className="rp-abbr">{r.abbrev}</span>
                  <span className="rp-name">{r.name}{alts.length > 0 && <span className="rp-alt"> · {alts.join(', ')}</span>}</span>
                  {book?.has(r.id) && <span className="rp-mm" title="Has a Boericke monograph">MM</span>}
                </div>
              )
            })}
          </div>
        </div>
        {/* outside the listbox: a listbox holds only options */}
        {!results.length && <div className="empty-state rp-empty"><strong>No remedy matches “{q}”</strong><span>Try the abbreviation (nat-m), the Latin name or a common name.</span></div>}
      </div>
    </Dialog>
  )
}
