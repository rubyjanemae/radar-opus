import { memo, useCallback, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent, RefObject } from 'react'
import { SearchCode } from 'lucide-react'
import type { Catalog } from '../../data/catalog'
import type { BookItem } from './book'
import { Snippet } from './components'
import type { MMHit } from './text'

export const ROW = 26
export const HIT_ROW = 60
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

interface Virtual { start: number; end: number; total: number }

/**
 * The side pane of the materia medica: the remedy list (filter, virtualised list, A–Z index) and
 * the full-text results. Presentational: state and keyboard handling come from the reader.
 */
export function MMListPane(p: {
  catalog: Catalog
  width: number
  mode: 'list' | 'results'
  onMode: (m: 'list' | 'results') => void
  bookCount: number
  items: BookItem[]
  selectedIndex: number
  letters: Map<string, number>
  filter: string
  onFilter: (f: string) => void
  onFilterKey: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  list: Virtual
  hitsV: Virtual
  refs: { list: RefObject<HTMLDivElement | null>; hits: RefObject<HTMLDivElement | null>; az: RefObject<HTMLElement | null>; filter: RefObject<HTMLInputElement | null> }
  keys: { onListKey: (e: ReactKeyboardEvent) => void; onAzKey: (e: ReactKeyboardEvent) => void; onHitsKey: (e: ReactKeyboardEvent) => void }
  onGo: (remedyId: number) => void
  onInfo: (remedyId: number) => void
  onMenu: (e: MouseEvent, remedyId: number) => void
  onLetter: (L: string) => void
  // results
  remedyId: number | null
  hasTerms: boolean
  query: string
  hits: MMHit[]
  truncated: boolean
  hitRemedyCount: number
  hitSel: number
  markSection: number | null
  onOpenHit: (h: MMHit, index: number) => void
  onResultsTab: () => void
}) {
  const { items, selectedIndex, list, hitsV } = p
  const current = selectedIndex >= 0 ? items[selectedIndex].letter : AZ.find(x => p.letters.has(x))
  // the list always has an active option while it has focus: the current remedy, else the first one
  const [listFocused, setListFocused] = useState(false)
  const activeIndex = selectedIndex >= 0 ? selectedIndex : listFocused && items.length ? 0 : -1
  // the abbreviation column is as wide as the longest abbreviation in the book
  const abbrCh = useMemo(() => items.reduce((m, it) => Math.max(m, it.abbrev.length), 4), [items])
  const { onGo, onInfo, onMenu } = p
  /** One delegated handler per event for every row: the row is found from its data-rid. */
  const rowOf = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-rid]')
    return el ? Number(el.dataset.rid) : null
  }
  const onRowClick = useCallback((e: MouseEvent) => { const id = rowOf(e); if (id != null) onGo(id) }, [onGo])
  const onRowDouble = useCallback((e: MouseEvent) => { const id = rowOf(e); if (id != null) onInfo(id) }, [onInfo])
  const onRowMenu = useCallback((e: MouseEvent) => { const id = rowOf(e); if (id != null) onMenu(e, id) }, [onMenu])
  const hitOn = p.markSection !== null && p.remedyId != null ? p.hits.findIndex(h => h.remedyId === p.remedyId && h.section === p.markSection) : p.hitSel
  return (
    <aside className="mm-side" style={{ width: p.width }}>
      <div className="mm-side-tabs" role="tablist" aria-label="Side panel">
        <button role="tab" aria-selected={p.mode === 'list'} className={p.mode === 'list' ? 'on' : ''} onClick={() => p.onMode('list')}>
          Remedies <span className="badge">{items.length === p.bookCount ? p.bookCount : `${items.length}/${p.bookCount}`}</span>
        </button>
        <button role="tab" aria-selected={p.mode === 'results'} className={p.mode === 'results' ? 'on' : ''} title="Full-text search results" onClick={p.onResultsTab}>
          Results {p.hasTerms && <span className="badge">{p.hits.length.toLocaleString()}{p.truncated ? '+' : ''}</span>}
        </button>
      </div>

      {p.mode === 'list' ? (
        <>
          <div className="mm-filter">
            <input ref={p.refs.filter} className="input" value={p.filter} placeholder="Filter remedies…" aria-label="Filter remedies" spellCheck={false}
              onChange={e => p.onFilter(e.target.value)} onKeyDown={p.onFilterKey} />
          </div>
          <div className="mm-listwrap">
            <div
              ref={p.refs.list}
              className="mm-list"
              style={{ '--mm-abbr-w': `calc(${abbrCh}ch + 8px)` } as CSSProperties}
              role="listbox"
              tabIndex={0}
              aria-label="Boericke remedies"
              aria-activedescendant={activeIndex >= 0 ? `mm-opt-${items[activeIndex].remedyId}` : undefined}
              onFocus={e => { if (e.target === e.currentTarget) setListFocused(true) }}
              onBlur={() => setListFocused(false)}
              onKeyDown={p.keys.onListKey}
              onClick={onRowClick}
              onDoubleClick={onRowDouble}
              onContextMenu={onRowMenu}
            >
              {items.length === 0 ? (
                <div className="empty-state"><strong>No remedy matches “{p.filter}”</strong><span>Boericke has {p.bookCount} monographs. Try an abbreviation or a common name.</span></div>
              ) : (
                <div style={{ height: list.total, position: 'relative' }}>
                  {items.slice(list.start, list.end).map((it, k) => {
                    const i = list.start + k
                    return <ListRow key={it.remedyId} item={it} top={i * ROW} selected={i === selectedIndex} active={i === activeIndex} />
                  })}
                </div>
              )}
            </div>
            <nav className="mm-az" aria-label="Alphabetical index" ref={p.refs.az} onKeyDown={p.keys.onAzKey}>
              {AZ.map(L => {
                const at = p.letters.get(L)
                return (
                  <button key={L} data-letter={L} disabled={at === undefined} tabIndex={L === current ? 0 : -1} aria-label={`Remedies starting with ${L}`} title={at === undefined ? undefined : `Remedies starting with ${L} (or type ${L} in the list)`}
                    onClick={() => p.onLetter(L)}>{L}</button>
                )
              })}
            </nav>
          </div>
        </>
      ) : (
        <div className="mm-results" id="mm-results">
          {!p.hasTerms ? (
            <div className="empty-state">
              <SearchCode size={22} />
              <strong>Search every monograph</strong>
              <span>Words must all appear in the same section. Use quotes for a phrase: <code>"craving salt"</code>.</span>
            </div>
          ) : !p.hits.length ? (
            <div className="empty-state"><strong>No matches for “{p.query.trim()}”</strong><span>Check the spelling or search fewer words.</span></div>
          ) : (
            <>
              <div className="mm-results-sum">{p.hits.length}{p.truncated ? '+' : ''} sections in {p.hitRemedyCount} remedies</div>
              <div ref={p.refs.hits} className="mm-hits" role="listbox" tabIndex={0} aria-label="Search results" onKeyDown={p.keys.onHitsKey}
                aria-activedescendant={hitOn >= hitsV.start && hitOn < hitsV.end ? `mm-hit-${hitOn}` : undefined}>
                <div style={{ height: hitsV.total, position: 'relative' }}>
                  {p.hits.slice(hitsV.start, hitsV.end).map((h, k) => {
                    const i = hitsV.start + k
                    const same = h.remedyId === p.remedyId
                    const on = same && (p.markSection !== null ? h.section === p.markSection : i === p.hitSel)
                    const r = p.catalog.remedy(h.remedyId)
                    return (
                      <div key={`${h.remedyId}:${h.section}`} id={`mm-hit-${i}`} role="option" aria-selected={on} aria-posinset={i + 1} aria-setsize={p.hits.length}
                        className={`mm-hit-row${same ? ' same' : ''}${on ? ' on' : ''}`}
                        style={{ top: i * HIT_ROW, height: HIT_ROW }}
                        onClick={() => p.onOpenHit(h, i)}
                        onContextMenu={e => p.onMenu(e, h.remedyId)}>
                        <div className="mm-hit-head"><b>{r.abbrev}</b><span>{h.heading}</span>{h.count > 1 && <span className="mm-hit-n">{h.count}×</span>}</div>
                        <div className="mm-hit-snip"><Snippet parts={h.snippet} /></div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

/** A remedy row. Memoised: moving the selection re-renders only the rows whose state changed. */
const ListRow = memo(function ListRow({ item, top, selected, active }: { item: BookItem; top: number; selected: boolean; active: boolean }) {
  return (
    <div
      id={`mm-opt-${item.remedyId}`}
      data-rid={item.remedyId}
      role="option"
      aria-selected={selected}
      className={`mm-row${selected ? ' on' : ''}${active && !selected ? ' active' : ''}`}
      style={{ top, height: ROW }}
      title={`${item.title}${item.commonName ? ` · ${item.commonName}` : ''}\nDouble-click: remedy information`}
    >
      <span className="mm-row-abbr">{item.abbrev}</span>
      <span className="mm-row-title">{item.title}</span>
      {item.commonName && <span className="mm-row-common">{item.commonName}</span>}
    </div>
  )
})
