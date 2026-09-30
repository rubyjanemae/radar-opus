import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownRight, Search } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Repertory } from '../../data/repertory'
import { useFixedVirtual } from './virtual'
import { DEFAULT_TAKE, describeTake, parseTake } from './take'
import { findInitial, levelItems, pathMatches, splitFindQuery } from './logic'
import { goToRef, takeRefs } from './ops'
import { openSearch } from '../search/ops'

const ROW = 24
/** Height of the list (.rfind-list in repertory.css). */
const LIST_H = 336
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
  /**
   * The highlight is the first sub-rubric Find picked on its own after a level opened (the reader has
   * not moved inside the level yet): Esc and Go to then mean the opened rubric, not that child.
   */
  const [auto, setAuto] = useState(from >= 0 && initial.level === from)
  const setActive = (i: number, picked = false) => { if (i !== active) moved.current = true; setAuto(picked); setActiveRaw(i) }
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // "fear+2": the text before + or = filters the level, the rest is a take command for the highlighted rubric
  const { filter, take } = splitFindQuery(query)
  const takeMode = take != null
  const direct = useMemo(() => levelItems(rep, level, filter), [rep, level, filter])
  // deeper matches: multi-word paths below the level ("head pain forehead"), and at the chapter level
  // also rubrics under the current rubric's chapter (the current context)
  const deep = useMemo(() => deepMatches(rep, level, filter, current, direct), [rep, level, filter, current, direct])
  const items = useMemo(() => (deep.length ? [...direct, ...deep] : direct), [direct, deep])
  const activeIdx = Math.max(0, items.indexOf(active))
  const cur = items[activeIdx] ?? -1
  const curDeep = activeIdx >= direct.length
  const v = useFixedVirtual(listRef, items.length, ROW, 8, { initialHeight: LIST_H })
  useEffect(() => { v.scrollToIndex(activeIdx, 'auto') }, [activeIdx, items]) // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = take != null ? parseTake(take) : null

  const descend = (i: number) => {
    if (!rep.childCountOf(i)) return false
    setLevel(i); setQuery(''); setActive(rep.children(i)[0] ?? -1, true)
    return true
  }
  const up = () => {
    if (level < 0) return
    setActive(level); setLevel(rep.parent(level)); setQuery('')
  }
  const go = (i: number) => { if (i < 0) return; onClose(); void goToRef(rep.ref(i)) }
  /** What Esc and Go to show: the opened rubric while its first child is only auto-highlighted. */
  const target = auto && level >= 0 ? level : cur
  const goTarget = () => go(target)
  // a step that goes nowhere (Up on the first row) is not a move inside the level
  const move = (d: number) => { const i = items[Math.max(0, Math.min(items.length - 1, activeIdx + d))]; if (i != null && i !== cur) setActive(i) }
  const searchAll = () => { const q = filter.trim(); onClose(); openSearch(q) }
  /** F3: look under the current rubric instead, keeping what was typed. */
  const fromCurrent = () => {
    const ctx = findInitial(rep, { from: current, current, stay: false })
    if (ctx.level === level) return
    setLevel(ctx.level)
    const first = levelItems(rep, ctx.level, filter)[0] ?? deepMatches(rep, ctx.level, filter, current, [])[0]
    setActive(first ?? ctx.active, first == null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let handled = true
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'PageDown') move(v.pageSize)
    else if (e.key === 'PageUp') move(-v.pageSize)
    else if (e.key === 'Enter') {
      if (takeMode) { if (parsed?.ok && cur >= 0) { takeRefs([rep.ref(cur)], parsed.options); setQuery(filter) } }
      else if (!items.length && filter.trim()) searchAll()
      else if (e.shiftKey || e.ctrlKey || e.metaKey) goTarget()
      // a deeper match is a path: Enter shows it in the book (→ opens its level)
      else if (cur >= 0 && curDeep) go(cur)
      else if (cur >= 0 && !descend(cur)) go(cur)
    } else if (e.key === 'Escape') {
      // leave Find at the rubric last highlighted (if the reader moved to one); the book keeps focus
      if (moved.current && target >= 0) goTarget()
      else onClose()
    } else if (e.key === 'ArrowRight' && cur >= 0 && (!query || (curDeep && e.currentTarget.selectionStart === query.length))) {
      // a deeper match opens its level (→ at the end of the text), like a row of the level itself
      if (!descend(cur)) handled = false
    }
    else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !query) up()
    else if (e.key === 'F4' && filter.trim()) searchAll()
    else if (e.key === 'F3' && current >= 0 && !takeMode) fromCurrent()
    else if (e.key === 'F2' || e.key === 'F3') { /* swallow: already finding */ }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const path = level >= 0 ? rep.lineage(level) : []
  const rows = []
  for (let k = v.start; k < v.end; k++) {
    const i = items[k]
    const kids = rep.childCountOf(i)
    const isDeep = k >= direct.length
    // a deeper match shows its path below the level
    const below = isDeep ? rep.lineage(i).slice(path.length) : null
    rows.push(
      <div
        key={i} id={`rfind-${i}`} role="option" aria-selected={i === cur}
        aria-label={below ? below.map(r => rep.text(r)).join(', ') : undefined}
        className={`rfind-row${i === cur ? ' active' : ''}${level < 0 && !isDeep ? ' chapter' : ''}${isDeep ? ' deep' : ''}${k === direct.length && k > 0 ? ' deep-first' : ''}`}
        style={{ top: k * ROW }}
        title={isDeep ? `Enter: show in the book${kids ? ' · →: open its sub-rubrics' : ''}` : undefined}
        onMouseDown={e => e.preventDefault()}
        onClick={() => { setActive(i); inputRef.current?.focus() }}
        onDoubleClick={() => { if (isDeep || !descend(i)) go(i) }}
      >
        {below ? (
          <span className="rfind-text">
            {below.slice(0, -1).map(r => <span key={r} className="rfind-anc">{rep.text(r)} › </span>)}
            {rep.text(i)}
          </span>
        ) : <span className="rfind-text">{rep.text(i)}</span>}
        {rep.remedyCount(i) > 0 && <span className="rfind-count" title={`${rep.remedyCount(i)} ${rep.remedyCount(i) === 1 ? 'remedy' : 'remedies'}`}>{rep.remedyCount(i)}</span>}
        <span className="rfind-kids" title={kids ? `${kids} sub-rubric${kids === 1 ? '' : 's'}` : undefined}>{kids ? <>{kids}<span className="rfind-chev" aria-hidden="true" /></> : null}</span>
      </div>,
    )
  }
  const levelNoun = level < 0 ? (direct.length === 1 ? 'chapter' : 'chapters') : (direct.length === 1 ? 'rubric' : 'rubrics')
  const status = items.length === 0 ? 'No match at this level'
    : `${direct.length} ${levelNoun}${deep.length ? `, ${deep.length} deeper ${deep.length === 1 ? 'match' : 'matches'}` : ''}`

  return (
    <div className="rfind">
      <div className="rfind-top">
        <nav className="rfind-path" aria-label="Level">
          <button className={`rfind-crumb${level < 0 ? ' on' : ''}`} onClick={() => { if (level >= 0) { setActive(rep.chapterRoot(level)); setLevel(-1); setQuery('') } inputRef.current?.focus() }}>Chapters</button>
          {path.map(p => (
            <span key={p}>
              <span className="rfind-sep">›</span>
              <button className={`rfind-crumb${p === level ? ' on' : ''}`} onClick={() => { const next = rep.lineage(level); const child = next[next.indexOf(p) + 1]; setLevel(p); setQuery(''); setActive(child ?? rep.children(p)[0] ?? -1, child == null); inputRef.current?.focus() }}>{rep.text(p)}</button>
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
          if (t == null) {
            const first = levelItems(rep, level, f)[0] ?? deepMatches(rep, level, f, current, [])[0]
            if (first != null) setActive(first)
          }
        }}
        onKeyDown={onKeyDown}
      />
      {takeMode && <div className={`rfind-take${parsed?.ok ? '' : ' err'}`}>{parsed?.ok ? <>Enter takes <b>{cur >= 0 ? rep.text(cur) : '—'}</b> ({describeTake(parsed.options)}), Find stays open</> : parsed?.error}</div>}
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>
      {items.length === 0 ? (
        <div className="rfind-none" id="rfind-list" role="listbox" aria-label="Rubrics">
          <div className="rfind-empty">
            {level < 0 ? <>No chapter matches “{filter.trim()}”, and no path of chapter › rubric › sub-rubric does</> : <>Nothing in {rep.text(level)} matches “{filter.trim()}”</>}
            {level < 0 && (
              <div className="rfind-f3">
                <kbd className="kbd">F3</kbd> searches from the current rubric
                {current >= 0 ? <> ({rep.text(rep.chapterRoot(current))}{current !== rep.chapterRoot(current) ? ` › … › ${rep.text(current)}` : ''})</> : ' (open a rubric in the book first)'}
              </div>
            )}
          </div>
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
        <button className="btn btn-primary" disabled={target < 0} onClick={goTarget} title={target !== cur && target >= 0 ? `Show ${rep.text(target)} in the book` : undefined}>Go to</button>
      </div>
    </div>
  )
}

/**
 * Deeper Find matches beside the level's own items: rubrics whose path below the level matches the
 * words ("head pain forehead"), and at the chapter level also matches under the current rubric's
 * chapter. Shortest paths first, then shortest names, then book order; items already listed are left out.
 */
function deepMatches(rep: Repertory, level: number, filter: string, current: number, direct: readonly number[]): number[] {
  if (!filter.trim()) return []
  const seen = new Set(direct)
  const found = pathMatches(rep, level, filter, { limit: 200 })
  if (level < 0 && current >= 0 && current < rep.size) found.push(...pathMatches(rep, -1, filter, { within: rep.chapterRoot(current), limit: 200 }))
  const out: { id: number; len: number; name: number }[] = []
  for (const m of found) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push({ id: m.id, len: rep.depth(m.id), name: rep.text(m.id).length })
  }
  return out.sort((a, b) => a.len - b.len || a.name - b.name || a.id - b.id).slice(0, 200).map(x => x.id)
}
