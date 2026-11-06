import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Repertory } from '../../data/repertory'
import type { Weight } from '../../engine/model'
import { useFixedVirtual } from './virtual'
import { DEFAULT_TAKE, describeTake, parseTake } from './take'
import { findInitial, splitFindQuery } from './logic'
import { goToRef, openTakeOptions, takeRefs } from './ops'
import { openSearch } from '../search/ops'
import { ChapterIcon } from '../toc/chapterIcons'
import { chapterCaption, LETTERS, otherInitials } from './findCaption'
import { alphabetical, matchLevel } from './findLevel'
import { revealAtTop } from './revealTop'
import { VScrollBar } from './VScrollBar'
import { actions, useApp } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import './find.css'

/** Row pitch of a rubric level's list (RadarOpus: ~17 px). */
const ROW = 17
/** Columns of the chapter grid (.rfind-grid): 14, the window edge cutting the last one off (RadarOpus). */
const TILE_COLS = 14
/** Height of one row of chapter tiles (.rfind-grid grid-auto-rows). */
const TILE_H = 84
/** Initial height of the list before it is measured. */
const LIST_H = 480
const STAY_KEY = 'rfind.stayInChapter'

function readStay(): boolean { try { return localStorage.getItem(STAY_KEY) === '1' } catch { return false } }
function writeStay(v: boolean) { try { localStorage.setItem(STAY_KEY, v ? '1' : '0') } catch { /* storage blocked */ } }

interface Props { onClose: () => void; repertory?: string; from?: number; current?: number }

/**
 * F2 / F3: the Navigation window. The chapters of the book as a grid of tiles under a letter row;
 * typing (or the letter buttons) narrows the level, choosing a chapter continues one level down
 * with its rubrics (alphabetically), and so on; the up arrow, or "<" / Backspace with nothing
 * typed, goes back up. Go to shows the rubric at the top of the book's first column.
 */
export function FindDialog({ onClose, repertory, from = -1, current = -1 }: Props) {
  const catalog = useCatalog()
  const abbrev = repertory ?? catalog.repertoryInfos[0]?.abbrev ?? ''
  const { rep, error } = useRepertory(abbrev)
  const info = catalog.repertoryInfos.find(r => r.abbrev === abbrev)
  return (
    <Dialog title={`Navigation window (${info?.title ?? abbrev})`} onClose={onClose} width={966} initialFocus=".rfind-input">
      {error ? <div className="error-state"><h3>Could not load repertory</h3><pre>{error.message}</pre></div>
        : !rep ? <div className="rfind-loading">Loading repertory…</div>
          : <FindBody rep={rep} from={from} current={current} onClose={onClose} title={info?.title ?? abbrev} />}
    </Dialog>
  )
}

const isTyping = (e: React.KeyboardEvent) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey

/** The level-row up arrow: a heavy filled arrow (original drawing). */
function UpArrow() {
  return (
    <svg width="14" height="22" viewBox="0 0 14 22" aria-hidden="true">
      <path d="M7 0.5 13.5 9.6H9.3V21.5H4.7V9.6H0.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

/** The selected row's marker: a hand pointing right, cuff at the left (original drawing). */
function Hand() {
  return (
    <svg className="rfind-hand" width="30" height="18" viewBox="0 0 30 15" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="5" width="4.5" height="8.5" rx="0.8" className="rfind-hand-cuff" />
      <path
        d="M6 4.5C8 3.2 10.5 2.6 13 2.8H27.6C28.7 2.8 29.5 3.6 29.5 4.6S28.7 6.4 27.6 6.4H18.5C19.4 6.9 19.8 7.6 19.6 8.4 19.4 9.2 18.7 9.6 17.9 9.6 18.6 10.1 18.8 10.8 18.5 11.5 18.2 12.2 17.5 12.5 16.8 12.4 17.1 13 16.9 13.7 16.4 14.1 16 14.4 15.4 14.5 14.8 14.5H11C9 14.5 7.3 13.8 6 12.7Z"
        className="rfind-hand-body"
        vectorEffect="non-scaling-stroke"
      />
      <path d="M18.5 6.4H14.8M17.9 9.6H14.6M16.8 12.4H14.2" className="rfind-hand-line" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** One cog of the gear glyph: `teeth` teeth around (cx, cy), with a hole. */
function cog(cx: number, cy: number, r: number, teeth: number): string {
  const pts: string[] = []
  for (let k = 0; k < teeth * 4; k++) {
    const a = (k / (teeth * 4)) * Math.PI * 2
    const rr = k % 4 < 2 ? r : r * 0.72
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`)
  }
  const h = r * 0.36
  return `M${pts.join('L')}Z M${cx + h} ${cy}A${h} ${h} 0 1 0 ${cx - h} ${cy}A${h} ${h} 0 1 0 ${cx + h} ${cy}Z`
}
const GEAR = cog(5.2, 8.8, 4.9, 7) + ' ' + cog(10.8, 3.3, 3.1, 6)

/** The options gear: a large and a small cog (original drawing). */
function Gear() {
  return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d={GEAR} fill="currentColor" fillRule="evenodd" /></svg>
}

/** The Go to button's heavy filled tick (original drawing). */
function Tick() {
  return (
    <svg className="rfind-ico-go" width="19" height="15" viewBox="0 0 19 15" aria-hidden="true">
      <path d="M0.8 8.4 3.6 5.5 7.1 8.8 15.4 0.8 18.2 3.7 7.1 14.3Z" fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  )
}

/** The Cancel button's pink box with a heavy white cross (original drawing). */
function CancelBox() {
  return (
    <svg className="rfind-ico-cancel" width="21" height="21" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="0" y="0" width="21" height="21" rx="2" />
      <path d="M5.5 5.5 15.5 15.5M15.5 5.5 5.5 15.5" fill="none" strokeWidth="3.6" strokeLinecap="butt" />
    </svg>
  )
}

/** The Help button's question mark in a heavy grey ring (original drawing). */
function HelpRing() {
  return (
    <svg className="rfind-ico-help" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.4" fill="none" strokeWidth="2.8" />
      <path d="M8.6 9.4C8.6 7.4 10.1 6.1 12.1 6.1 14.1 6.1 15.6 7.4 15.6 9.1 15.6 10.6 14.7 11.3 13.7 11.9 13 12.3 12.9 12.7 12.9 13.5V14H11.1V13.3C11.1 12 11.6 11.3 12.6 10.7 13.4 10.2 13.8 9.9 13.8 9.2 13.8 8.4 13.1 7.8 12.1 7.8 11.1 7.8 10.4 8.5 10.4 9.4ZM10.9 15.4H13.1V17.6H10.9Z" />
    </svg>
  )
}

/** The level row's view icon: a small framed window holding a grid of coloured cells (original drawing). */
function ViewIcon() {
  return (
    <svg width="27" height="26" viewBox="0 0 27 26" aria-hidden="true">
      <rect className="rfind-view-frame" x="0.5" y="0.5" width="26" height="25" rx="1.5" />
      <rect className="rfind-view-bar" x="1" y="1" width="25" height="4" />
      <rect className="rfind-view-bar" x="1" y="23.5" width="25" height="1.5" />
      <rect x="6.5" y="7.5" width="5.5" height="5.5" fill="var(--nw-view-1)" />
      <rect x="15" y="7.5" width="5.5" height="5.5" fill="var(--nw-view-2)" />
      <rect x="6.5" y="15.5" width="5.5" height="5.5" fill="var(--nw-view-3)" />
      <rect x="15" y="15.5" width="5.5" height="5.5" fill="var(--nw-view-4)" />
    </svg>
  )
}

/** The small filled drop-down triangle after "Take". */
function DropDown() {
  return <svg className="rfind-ico-drop" width="7" height="4" viewBox="0 0 7 4" aria-hidden="true"><path d="M0 0H7L3.5 4Z" fill="currentColor" /></svg>
}

function FindBody({ rep, from, current, onClose, title }: { rep: Repertory; from: number; current: number; onClose: () => void; title: string }) {
  const menu = useContextMenu()
  const [stay, setStay] = useState(readStay)
  const [help, setHelp] = useState(false)
  const initial = useMemo(() => findInitial(rep, { from, current, stay }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [level, setLevel] = useState(initial.level)
  const [query, setQuery] = useState('')
  // a level just opened shows no selection (RadarOpus): only F3 on a rubric without sub-rubrics
  // opens its parent's level with that rubric selected
  const [sel, setSelRaw] = useState(initial.level < 0 || !(from >= 0 && initial.level === from) ? initial.active : -1)
  const setSel = (i: number) => setSelRaw(i)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // "fear+2": the text before + or = filters the level, the rest is a take command for the selected rubric
  const { filter, take } = splitFindQuery(query)
  const takeMode = take != null
  const grid = level < 0
  const name = (i: number) => rep.text(i)
  const levelIds = useMemo(() => (level < 0 ? [...rep.chapters] : alphabetical(rep.children(level), i => rep.text(i))), [rep, level])
  const items = useMemo(() => matchLevel(levelIds, name, filter, level >= 0), [levelIds, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  const selIdx = sel >= 0 ? items.indexOf(sel) : -1
  // the grid always has a focused tile; a list has a selection once the reader typed or stepped
  const activeIdx = selIdx >= 0 ? selIdx : (grid || filter.trim()) && items.length ? 0 : -1
  const cur = activeIdx >= 0 ? items[activeIdx] : -1
  const v = useFixedVirtual(listRef, grid ? 0 : items.length, ROW, 8, { initialHeight: LIST_H })
  useEffect(() => {
    if (activeIdx < 0) return
    if (grid) document.getElementById(`rfind-${cur}`)?.scrollIntoView?.({ block: 'nearest' })
    else v.scrollToIndex(activeIdx, 'auto')
    // the list area changes height with the keys strip and the take line: the selection stays in view
  }, [activeIdx, items, grid, help, takeMode]) // eslint-disable-line react-hooks/exhaustive-deps
  // the window floats over an inert app (no scrim): a click outside it neither closes it nor takes the typing focus away
  useEffect(() => {
    const keep = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (t?.closest?.('[role="dialog"], [role="menu"], .menu-list')) return
      e.preventDefault()
    }
    document.addEventListener('mousedown', keep, true)
    return () => document.removeEventListener('mousedown', keep, true)
  }, [])
  const parsed = take != null ? parseTake(take) : null
  const focusInput = () => inputRef.current?.focus()

  /** Set the typed text and select the level's first match. */
  const applyQuery = (q: string) => {
    setQuery(q)
    const { filter: f, take: t } = splitFindQuery(q)
    if (t == null) setSel(f.trim() || grid ? (matchLevel(levelIds, name, f, !grid)[0] ?? -1) : -1)
  }
  const openLevel = (i: number, select = -1) => { setLevel(i); setQuery(''); setSelRaw(select) }
  const descend = (i: number) => {
    if (!rep.childCountOf(i)) return false
    openLevel(i)
    return true
  }
  const up = () => { if (level >= 0) openLevel(rep.parent(level), level) }
  /** Show a rubric in the book, in a Full repertory view: at the top of column 1, selected. */
  const go = (i: number) => {
    if (i < 0) return
    const ref = rep.ref(i)
    onClose()
    // the tab goToRef will use (the active one, else the first showing this book) leaves "Rubrics only"
    const s = useApp.getState()
    const books = s.tabs.filter((t): t is RepertoryTab => t.kind === 'repertory' && t.repertory === rep.info.abbrev)
    const tab = books.find(t => t.id === s.activeTabId) ?? books[0]
    if (tab?.display === 'count') actions.updateTab<RepertoryTab>(tab.id, { display: 'remedies' })
    void goToRef(ref)
    revealAtTop(ref)
  }
  /** Go to: a chapter tile opens its rubrics in this window; a rubric (the level's first when none is selected) is shown in the book. */
  const goTo = () => {
    if (grid) { if (cur >= 0 && !descend(cur)) go(cur) } else go(cur >= 0 ? cur : items[0] ?? -1)
    focusInput()
  }
  /** Return: open the level of a rubric with sub-rubrics, else show it in the book. */
  const enter = (i: number) => { if (i >= 0 && !descend(i)) go(i) }
  const moveTo = (k: number) => { if (!items.length) return; const i = items[Math.max(0, Math.min(items.length - 1, k))]; if (i !== cur || selIdx < 0) setSel(i) }
  // with nothing selected a step down selects the first row
  const move = (d: number) => moveTo(activeIdx < 0 ? (d > 0 ? 0 : -1) : activeIdx + d)
  const cols = () => TILE_COLS
  const gridPage = () => Math.max(1, Math.floor((gridRef.current?.parentElement?.clientHeight ?? TILE_H * 6) / TILE_H))
  const searchAll = () => { const q = filter.trim(); onClose(); openSearch(q) }
  /** F3: look under the current rubric instead, keeping what was typed. */
  const fromCurrent = () => {
    const ctx = findInitial(rep, { from: current, current, stay: false })
    if (ctx.level === level) return
    setLevel(ctx.level)
    const ids = ctx.level < 0 ? [...rep.chapters] : alphabetical(rep.children(ctx.level), name)
    const first = filter.trim() ? matchLevel(ids, name, filter, ctx.level >= 0)[0] : undefined
    setSelRaw(first ?? (rep.childCountOf(current) ? -1 : ctx.active))
  }
  const backspace = () => { if (query) applyQuery(query.slice(0, -1)); else up(); focusInput() }
  const typeChar = (c: string) => { applyQuery(query + c); focusInput() }
  /** What Take and Go to act on: the selection, else (a level just opened) the level's first rubric. */
  const target = grid ? cur : cur >= 0 ? cur : items[0] ?? -1
  const takeCur = (weight: Weight) => { if (target >= 0) takeRefs([rep.ref(target)], { ...DEFAULT_TAKE, weight }) }

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    let handled = true
    const onTile = grid && items.length > 0
    if (onTile && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) moveTo(activeIdx + (e.key === 'ArrowLeft' ? -1 : 1))
    else if (onTile && (e.key === 'ArrowDown' || e.key === 'PageDown')) {
      const c = cols(), next = activeIdx + c * (e.key === 'PageDown' ? gridPage() : 1)
      // past the last full row: the same column on the last row, else the last tile
      const lastRow = Math.floor((items.length - 1) / c)
      moveTo(next < items.length ? next : Math.min(items.length - 1, lastRow * c + (activeIdx % c)))
    } else if (onTile && (e.key === 'ArrowUp' || e.key === 'PageUp')) {
      const c = cols(), prev = activeIdx - c * (e.key === 'PageUp' ? gridPage() : 1)
      moveTo(prev >= 0 ? prev : activeIdx % c)
    }
    else if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'PageDown') move(v.pageSize)
    else if (e.key === 'PageUp') move(-v.pageSize)
    else if (e.key === 'Home' && !query) moveTo(0)
    else if (e.key === 'End' && !query) moveTo(items.length - 1)
    else if ((e.key === 'Home' || e.key === 'End') && e.ctrlKey) moveTo(e.key === 'Home' ? 0 : items.length - 1)
    else if (e.key === 'Enter') {
      if (takeMode) { if (parsed?.ok && cur >= 0) { takeRefs([rep.ref(cur)], parsed.options); setQuery(filter) } }
      else if (!items.length && filter.trim()) searchAll()
      else if (e.shiftKey || e.ctrlKey || e.metaKey) { if (grid) go(cur); else go(cur >= 0 ? cur : items[0] ?? -1) }
      else enter(cur >= 0 ? cur : items[0] ?? -1)
    } else if (e.key === 'Escape') {
      // Esc is Cancel (macOS): the window closes and the book is left as it was
      onClose()
    } else if (e.key === 'ArrowRight' && cur >= 0 && !query) { if (!descend(cur)) handled = false }
    else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && !query) up()
    else if (e.key === 'F4' && filter.trim()) searchAll()
    else if (e.key === 'F3' && current >= 0 && !takeMode) fromCurrent()
    else if (e.key === 'F2' || e.key === 'F3') { /* swallow: already finding */ }
    else if (e.key === 'F1') setHelp(h => !h)
    else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { const el = cur >= 0 && document.getElementById(`rfind-${cur}`); if (el) menu.openAt(el, rowMenu(cur)) }
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }
  /** Keys pressed while a button of the window has focus still type into the window. */
  const onRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // menus are portals: their keys bubble here through React but are theirs
    if (e.target === inputRef.current || !e.currentTarget.contains(e.target as Node)) return
    // the list itself (focused by a click on its scrollbar): its keys are the type-ahead's
    if ((e.target as HTMLElement).closest('.rfind-list, .rfind-none')) { onKeyDown(e); focusInput(); return }
    if (isTyping(e) && e.key !== ' ') { e.preventDefault(); typeChar(e.key.toLowerCase()) }
    else if (e.key === 'Backspace') { e.preventDefault(); backspace() }
  }
  /** A click anywhere in the window that is not on a control keeps the typing focus. */
  const onRootMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t === inputRef.current || !e.currentTarget.contains(t)) return
    e.preventDefault()
    if (document.activeElement !== inputRef.current) focusInput()
  }

  const moreMenu = (): MenuItem[] => {
    const others = otherInitials(levelIds.map(name))
    const out: MenuItem[] = [
      { label: 'Space (next word)', run: () => typeChar(' ') },
      ...others.map(c => ({ label: `“${c}”`, run: () => typeChar(c) })),
    ]
    if (filter.trim()) out.push({ type: 'separator' }, { label: `Search all rubrics for “${filter.trim()}”`, keys: 'F4', run: searchAll })
    return out
  }
  const takeMenu = (): MenuItem[] => [
    ...([1, 2, 3, 4] as const).map(w => ({ label: `Take with intensity ${w} (+${w})`, disabled: target < 0, run: () => takeCur(w) })),
    { type: 'separator' },
    { label: 'Take and specify the options…', disabled: target < 0, run: () => { const r = rep.ref(target); onClose(); openTakeOptions([r]) } },
  ]
  /** Context menu of a row or tile (right-click, Shift+F10, the ContextMenu key). */
  const rowMenu = (i: number): MenuItem[] => [
    { label: grid && rep.childCountOf(i) ? 'Open its rubrics' : 'Go to', keys: grid ? 'Return' : 'Shift+Return', run: () => { if (grid) enter(i); else go(i) } },
    ...(!grid && rep.childCountOf(i) ? [{ label: 'Open its sub-rubrics', keys: 'Return', run: () => { descend(i) } }] : []),
    { type: 'separator' },
    ...([1, 2, 3, 4] as const).map(w => ({ label: `Take with intensity ${w} (+${w})`, run: () => takeRefs([rep.ref(i)], { ...DEFAULT_TAKE, weight: w }) })),
    { label: 'Take and specify the options…', run: () => { const r = rep.ref(i); onClose(); openTakeOptions([r]) } },
  ]
  const onRowMenu = (e: React.MouseEvent, i: number) => { setSel(i); menu.open(e, rowMenu(i)) }
  const gearMenu = (): MenuItem[] => [
    { label: 'Start in the chapter of the current rubric', checked: stay, run: () => { setStay(!stay); writeStay(!stay) } },
  ]

  const path = level >= 0 ? rep.lineage(level) : []
  const row = (i: number, k: number) => {
    const kids = rep.childCountOf(i)
    const n = rep.remedyCount(i)
    const on = i === cur
    return (
      <div
        key={i} id={`rfind-${i}`} role="option" aria-selected={on}
        className={`rfind-row${on ? ' active' : ''}${rep.depth(i) === 1 ? ' top' : ''}`}
        style={{ top: k * ROW }}
        onClick={() => { setSel(i); focusInput() }}
        onDoubleClick={() => enter(i)}
        onContextMenu={e => onRowMenu(e, i)}
      >
        {on && <Hand />}
        {kids > 0 && (
          <span className="rfind-plus" title={`Open its ${kids} sub-rubric${kids === 1 ? '' : 's'}`} onClick={e => { e.stopPropagation(); descend(i); focusInput() }} aria-hidden="true" />
        )}
        <span className="rfind-text">{rep.text(i)}</span>{n > 0 && <span className="rfind-count">({n})</span>}
        {kids > 0 && <span className="sr-only">, {kids} sub-rubric{kids === 1 ? '' : 's'}</span>}
      </div>
    )
  }

  let body: React.ReactNode
  if (items.length === 0) {
    // nothing matches what was typed: an empty list, as RadarOpus (F3 looks under the current rubric, F4 or Return searches all rubrics)
    body = <div className="rfind-list rfind-none" id="rfind-list" role="listbox" aria-label={grid ? 'Chapters' : 'Rubrics'} tabIndex={-1} />
  } else if (grid) {
    body = (
      <div className="rfind-list rfind-chapters" id="rfind-list" role="listbox" aria-label="Chapters" tabIndex={-1}>
        <div className="rfind-grid" ref={gridRef} role="presentation">
          {items.map(i => (
            <div
              key={i} id={`rfind-${i}`} role="option" aria-selected={i === cur} aria-label={rep.text(i)} title={rep.text(i)}
              className={`rfind-tile${i === cur ? ' active' : ''}`}
              onClick={() => { setSel(i); focusInput() }}
              onDoubleClick={() => enter(i)}
              onContextMenu={e => onRowMenu(e, i)}
            >
              <ChapterIcon name={rep.text(i)} size={58} className="rfind-glyph" />
              <span className="rfind-cap">{chapterCaption(rep.text(i))}</span>
            </div>
          ))}
        </div>
      </div>
    )
  } else {
    const rows = []
    for (let k = v.start; k < v.end; k++) rows.push(row(items[k], k))
    body = (
      <div className={`rfind-list rfind-rubrics${cur >= 0 ? ' has-sel' : ''}`} id="rfind-list" role="listbox" aria-label="Rubrics" ref={listRef} tabIndex={-1}>
        <div style={{ height: v.total, position: 'relative' }}>
          {/* a level just opened, nothing selected yet: the focus caret on the first row */}
          {cur < 0 && <span className="rfind-caret" aria-hidden="true" />}
          {rows}
        </div>
      </div>
    )
  }

  const noun = level < 0 ? (items.length === 1 ? 'chapter' : 'chapters') : (items.length === 1 ? 'rubric' : 'rubrics')
  const status = items.length === 0 ? 'No match at this level' : `${items.length} ${noun}`
  const goTarget = target
  const goTitle = goTarget < 0 ? undefined : grid && rep.childCountOf(goTarget) ? `Open the rubrics of ${rep.text(goTarget)}` : `Show ${rep.text(goTarget)} in the book`

  return (
    <div className="rfind" onKeyDown={onRootKeyDown} onMouseDown={onRootMouseDown}>
      <div className="rfind-head">
        <label className="rfind-prompt" htmlFor="rfind-input">
          Start typing the first letters of the {level < 0 ? 'chapter' : 'rubric'} you wish to see:
        </label>
        <input
          ref={inputRef}
          id="rfind-input"
          className="rfind-input"
          aria-label="Type ahead"
          role="combobox"
          aria-expanded="true"
          aria-controls="rfind-list"
          aria-activedescendant={cur >= 0 ? `rfind-${cur}` : undefined}
          value={query}
          size={Math.max(1, query.length + 1)}
          spellCheck={false}
          autoComplete="off"
          onChange={e => applyQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="rfind-grow" />
        <button className="rfind-gear" tabIndex={-1} aria-label="Navigation window options" aria-haspopup="menu" aria-expanded="false" title="Options" onClick={e => menu.openAt(e.currentTarget, gearMenu())}>
          <Gear />
        </button>
      </div>
      <div className="rfind-letters" role="toolbar" aria-label="Letters">
        {LETTERS.map(c => (
          <button key={c} tabIndex={-1} onClick={() => typeChar(c.toLowerCase())} aria-label={`Type ${c}`}>{c}</button>
        ))}
        <button tabIndex={-1} aria-label="More characters" aria-haspopup="menu" aria-expanded="false" onClick={e => menu.openAt(e.currentTarget, moreMenu())}>…</button>
        <button tabIndex={-1} onClick={backspace} aria-label={query ? 'Delete last letter' : 'Up one level'} title={query ? 'Delete last letter (Backspace)' : 'Up one level (Backspace)'} aria-disabled={!query && level < 0}>&lt;</button>
      </div>
      {level >= 0 && (
        <nav className="rfind-path" aria-label="Level">
          <button className="rfind-upbtn" tabIndex={-1} aria-label="Up one level" title="Up one level (Backspace)" onClick={() => { up(); focusInput() }}>
            <UpArrow />
          </button>
          <span className="rfind-book" title={title} aria-hidden="true"><ViewIcon /></span>
          <span className="rfind-sep" aria-hidden="true">-</span>
          <ChapterIcon name={rep.text(path[0])} size={26} className="rfind-pathicon" />
          {path.map((p, k) => (
            <span key={p} className="rfind-step">
              {k > 0 && <span className="rfind-sep" aria-hidden="true">-</span>}
              <button
                className={`rfind-crumb${p === level ? ' on' : ''}${k < 2 ? ' caps' : ''}`} tabIndex={-1}
                onClick={() => { if (p !== level) openLevel(p, path[k + 1] ?? -1); focusInput() }}
              >{rep.text(p)}</button>
            </span>
          ))}
        </nav>
      )}
      {takeMode && <div className={`rfind-take${parsed?.ok ? '' : ' err'}`}>{parsed?.ok ? <>Enter takes <b>{cur >= 0 ? rep.text(cur) : '—'}</b> ({describeTake(parsed.options)}), Find stays open</> : parsed?.error}</div>}
      <div className="sr-only" role="status" aria-live="polite">{status}</div>
      <div className="rfind-main">
        {body}
        {!grid && items.length > 0 && <VScrollBar target={listRef} step={ROW} deps={`${level}:${items.length}`} className="rfind-sb" minThumb={27} />}
      </div>
      {help && (
        <div className="rfind-help" role="note" aria-label="Navigation window keys">
          <span><kbd className="kbd">a–z</kbd> narrow</span>
          <span><kbd className="kbd">←↑→↓</kbd> move</span>
          <span><kbd className="kbd">Home End</kbd> first, last</span>
          <span><kbd className="kbd">↵</kbd> open level / show</span>
          <span><kbd className="kbd">⇧↵</kbd> show in the book</span>
          <span><kbd className="kbd">⌫</kbd> up</span>
          <span><kbd className="kbd">+2</kbd> take with intensity 2</span>
          <span><kbd className="kbd">F3</kbd> from current rubric</span>
          <span><kbd className="kbd">F4</kbd> search all rubrics</span>
        </div>
      )}
      <div className="rfind-foot">
        <button className="rfind-btn rfind-takebtn" disabled={target < 0} aria-haspopup="menu" aria-expanded="false" onClick={e => menu.openAt(e.currentTarget, takeMenu())}>
          <ClipboardList size={15} className="rfind-ico-take" /> Take <DropDown />
        </button>
        <button className="rfind-btn rfind-default" disabled={goTarget < 0} onClick={goTo} title={goTitle}>
          <Tick /> Go to
        </button>
        <button className="rfind-btn" onClick={onClose}><CancelBox /> Cancel</button>
        <button className="rfind-btn" aria-pressed={help} onClick={() => { setHelp(h => !h); focusInput() }} title="Keys of the Navigation window (F1)">
          <HelpRing /> Help
        </button>
      </div>
      {menu.element}
    </div>
  )
}
