import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CornerDownRight, Search } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Repertory } from '../../data/repertory'
import { useFixedVirtual } from './virtual'
import { DEFAULT_TAKE, describeTake, parseTake } from './take'
import { findInitial, levelItems, splitFindQuery } from './logic'
import { goToRef, takeRefs } from './ops'
import { openSearch } from '../search/ops'

const ROW = 24
const STAY_KEY = 'rfind.stayInChapter'

function readStay(): boolean { try { return localStorage.getItem(STAY_KEY) === '1' } catch { return false } }
function writeStay(v: boolean) { try { localStorage.setItem(STAY_KEY, v ? '1' : '0') } catch { /* storage blocked */ } }

interface Props { onClose: () => void; repertory?: string; from?: number; current?: number }

/** F2 / F3: hierarchical chapter → rubric → sub-rubric finder with type-ahead at each level. */
export function FindDialog({ onClose, repertory, from = -1, current = -1 }: Props) {
  const catalog = useCatalog()
  const [abbrev, setAbbrev] = useState(repertory ?? catalog.repertoryInfos[0]?.abbrev ?? '')
  const { rep, error } = useRepertory(abbrev)
  return (
    <Dialog title={from >= 0 ? 'Find from current rubric' : 'Find rubric'} onClose={onClose} width={640} initialFocus=".rfind-input">
      {error ? <div className="error-state"><h3>Could not load repertory</h3><pre>{error.message}</pre></div>
        : !rep ? <div className="rfind-loading">Loading repertory…</div>
          : <FindBody key={abbrev} rep={rep} from={abbrev === repertory ? from : -1} current={abbrev === repertory ? current : -1} onClose={onClose} abbrev={abbrev} setAbbrev={setAbbrev} />}
    </Dialog>
  )
}

function FindBody({ rep, from, current, onClose, abbrev, setAbbrev }: { rep: Repertory; from: number; current: number; onClose: () => void; abbrev: string; setAbbrev: (a: string) => void }) {
  const catalog = useCatalog()
  const [stay, setStay] = useState(readStay)
  const initial = useMemo(() => findInitial(rep, { from, current, stay }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [level, setLevel] = useState(initial.level)
  const [query, setQuery] = useState('')
  const [active, setActiveRaw] = useState(initial.active)
  /** The reader moved the highlight: Esc then shows that rubric in the book. */
  const moved = useRef(false)
  const setActive = (i: number) => { if (i !== active) moved.current = true; setActiveRaw(i) }
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // "fear+2": the text before + or = filters the level, the rest is a take command for the highlighted rubric
  const { filter, take } = splitFindQuery(query)
  const takeMode = take != null
  const items = useMemo(() => levelItems(rep, level, filter), [rep, level, filter])
  const activeIdx = Math.max(0, items.indexOf(active))
  const cur = items[activeIdx] ?? -1
  const v = useFixedVirtual(listRef, items.length, ROW)
  useEffect(() => { v.scrollToIndex(activeIdx, 'auto') }, [activeIdx, items]) // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = take != null ? parseTake(take) : null

  const descend = (i: number) => {
    if (!rep.childCountOf(i)) return false
    setLevel(i); setQuery(''); setActive(rep.children(i)[0] ?? -1)
    return true
  }
  const up = () => {
    if (level < 0) return
    setActive(level); setLevel(rep.parent(level)); setQuery('')
  }
  const go = (i: number) => { if (i < 0) return; onClose(); void goToRef(rep.ref(i)) }
  const move = (d: number) => { if (items.length) setActive(items[Math.max(0, Math.min(items.length - 1, activeIdx + d))]) }
  const searchAll = () => { const q = filter.trim(); onClose(); openSearch(q) }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let handled = true
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'PageDown') move(v.pageSize)
    else if (e.key === 'PageUp') move(-v.pageSize)
    else if (e.key === 'Enter') {
      if (takeMode) { if (parsed?.ok && cur >= 0) { takeRefs([rep.ref(cur)], parsed.options); setQuery(filter) } }
      else if (!items.length && filter.trim()) searchAll()
      else if (e.shiftKey || e.ctrlKey || e.metaKey) go(cur)
      else if (cur >= 0 && !descend(cur)) go(cur)
    } else if (e.key === 'Escape') {
      // leave Find at the rubric last highlighted (if the reader moved to one); the book keeps focus
      if (moved.current && cur >= 0) go(cur)
      else onClose()
    } else if (e.key === 'ArrowRight' && !query && cur >= 0) descend(cur)
    else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !query) up()
    else if (e.key === 'F4' && filter.trim()) searchAll()
    else if (e.key === 'F2' || e.key === 'F3') { /* swallow: already finding */ }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const path = level >= 0 ? rep.lineage(level) : []
  const rows = []
  for (let k = v.start; k < v.end; k++) {
    const i = items[k]
    const kids = rep.childCountOf(i)
    rows.push(
      <div
        key={i} id={`rfind-${i}`} role="option" aria-selected={i === cur}
        className={`rfind-row${i === cur ? ' active' : ''}${level < 0 ? ' chapter' : ''}`}
        style={{ top: k * ROW }}
        onMouseDown={e => e.preventDefault()}
        onClick={() => { setActive(i); inputRef.current?.focus() }}
        onDoubleClick={() => { if (!descend(i)) go(i) }}
      >
        <span className="rfind-text">{rep.text(i)}</span>
        {rep.remedyCount(i) > 0 && <span className="rfind-count" title={`${rep.remedyCount(i)} ${rep.remedyCount(i) === 1 ? 'remedy' : 'remedies'}`}>{rep.remedyCount(i)}</span>}
        <span className="rfind-kids" title={kids ? `${kids} sub-rubric${kids === 1 ? '' : 's'}` : undefined}>{kids ? <>{kids}<ChevronRight size={12} /></> : null}</span>
      </div>,
    )
  }

  return (
    <div className="rfind">
      <div className="rfind-top">
        <nav className="rfind-path" aria-label="Level">
          <button className={`rfind-crumb${level < 0 ? ' on' : ''}`} onClick={() => { if (level >= 0) { setActive(rep.chapterRoot(level)); setLevel(-1); setQuery('') } inputRef.current?.focus() }}>Chapters</button>
          {path.map(p => (
            <span key={p}>
              <span className="rfind-sep">›</span>
              <button className={`rfind-crumb${p === level ? ' on' : ''}`} onClick={() => { const next = rep.lineage(level); const child = next[next.indexOf(p) + 1]; setLevel(p); setQuery(''); setActive(child ?? rep.children(p)[0] ?? -1); inputRef.current?.focus() }}>{rep.text(p)}</button>
            </span>
          ))}
        </nav>
        {catalog.repertoryInfos.length > 1 && (
          <select className="select rfind-rep" aria-label="Repertory" value={abbrev} onChange={e => setAbbrev(e.target.value)}>
            {catalog.repertoryInfos.map(r => <option key={r.abbrev} value={r.abbrev}>{r.title}</option>)}
          </select>
        )}
      </div>
      <input
        ref={inputRef}
        className="input rfind-input"
        placeholder={level < 0 ? 'Type a chapter…' : `Type a rubric in ${rep.text(level)}…`}
        aria-label="Type ahead"
        role="combobox"
        aria-expanded="true"
        aria-controls="rfind-list"
        aria-activedescendant={cur >= 0 ? `rfind-${cur}` : filter.trim() ? 'rfind-searchall' : undefined}
        value={query}
        spellCheck={false}
        autoComplete="off"
        onChange={e => {
          const q = e.target.value
          setQuery(q)
          const { filter: f, take: t } = splitFindQuery(q)
          if (t == null) { const first = levelItems(rep, level, f)[0]; if (first != null) setActive(first) }
        }}
        onKeyDown={onKeyDown}
      />
      {takeMode && <div className={`rfind-take${parsed?.ok ? '' : ' err'}`}>{parsed?.ok ? <>Enter takes <b>{cur >= 0 ? rep.text(cur) : '—'}</b> ({describeTake(parsed.options)}), Find stays open</> : parsed?.error}</div>}
      <div className="sr-only" role="status" aria-live="polite">
        {items.length === 0 ? `No match at this level` : `${items.length} ${level < 0 ? (items.length === 1 ? 'chapter' : 'chapters') : (items.length === 1 ? 'rubric' : 'rubrics')}`}
      </div>
      {items.length === 0 ? (
        <div className="rfind-none" id="rfind-list" role="listbox" aria-label="Rubrics">
          <div className="rfind-empty">Nothing {level < 0 ? 'among the chapters' : `in ${rep.text(level)}`} matches “{filter}”</div>
          {filter.trim() && (
            <button className="rfind-searchall" id="rfind-searchall" role="option" tabIndex={-1} aria-selected="true" onClick={searchAll}>
              <Search size={13} /> Search all rubrics for “{filter.trim()}” <kbd className="kbd">F4</kbd>
            </button>
          )}
        </div>
      ) : (
        <div className="rfind-list" id="rfind-list" role="listbox" aria-label="Rubrics" ref={listRef}>
          <div style={{ height: v.total, position: 'relative' }}>{rows}</div>
        </div>
      )}
      <div className="rfind-foot">
        <label className="rfind-stay">
          <input type="checkbox" checked={stay} onChange={e => { setStay(e.target.checked); writeStay(e.target.checked) }} /> Stay in chapter
        </label>
        <span className="rfind-hint"><kbd className="kbd">↵</kbd> open level <kbd className="kbd">⇧↵</kbd> go to <kbd className="kbd">⌫</kbd> up <kbd className="kbd">+</kbd> take</span>
        <button className="btn" disabled={cur < 0} onClick={() => cur >= 0 && takeRefs([rep.ref(cur)], DEFAULT_TAKE)}><CornerDownRight size={13} /> Take</button>
        <button className="btn btn-primary" disabled={cur < 0} onClick={() => go(cur)}>Go to</button>
      </div>
    </div>
  )
}
