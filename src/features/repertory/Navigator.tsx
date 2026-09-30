import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Bookmark, ChevronDown, ChevronRight, History, Library, ListTree, LoaderCircle, Search, Settings2, X } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import { parseRef } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import { actions, useApp } from '../../state/store'
import type { AppState } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { runCommand } from '../../commands/registry'
import { useFixedVirtual } from './virtual'
import { matchChapters } from './take'
import { followExpanded, selectNavigatorTabId, treeRows } from './logic'
import { goToRef, openRepertory, recentOf, toggleBookmark } from './ops'
import { RUBRIC_MIME } from '../clipboard/logic'
import './repertory.css'

const ROW = 22

/** Per-repertory expanded nodes, kept across remounts (written from an effect, read on mount). */
const expandedByRep = new Map<string, ReadonlySet<number>>()

const repTab = (s: AppState, id: string) => s.tabs.find(t => t.id === id) as RepertoryTab | undefined

function loadSections(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('rnav.sections') ?? '{}') as Record<string, boolean> } catch { return {} }
}

export function Navigator() {
  // the navigator follows the book in a transition: switching repertories (or tabs) renders the book
  // first, and the tree of the other repertory renders afterwards, interruptibly
  const tabId = useDeferredValue(useApp(selectNavigatorTabId))
  const [sections, setSections] = useState(loadSections)
  const toggleSection = useCallback((k: string) => setSections(s => {
    const next = { ...s, [k]: !s[k] }
    try { localStorage.setItem('rnav.sections', JSON.stringify(next)) } catch { /* private mode */ }
    return next
  }), [])
  const toggleBookmarks = useCallback(() => toggleSection('bookmarks'), [toggleSection])
  const toggleRecent = useCallback(() => toggleSection('recent'), [toggleSection])

  return (
    <div className="rnav">
      {tabId ? <TreeSection tabId={tabId} /> : <NoRepertory />}
      <BookmarksSection collapsed={!!sections.bookmarks} onToggle={toggleBookmarks} />
      {tabId && <RecentSection tabId={tabId} collapsed={!!sections.recent} onToggle={toggleRecent} />}
    </div>
  )
}

function NoRepertory() {
  const catalog = useCatalog()
  return (
    <div className="rnav-tree-wrap">
      <div className="pane-head"><ListTree size={13} /> Navigator</div>
      <div className="rnav-empty">
        <strong>No repertory open</strong>
        <span>Choose a repertory to browse its chapters.</span>
        <div className="rnav-replist">
          {catalog.repertoryInfos.map(r => (
            <button key={r.abbrev} className="rnav-rep" onClick={() => void openRepertory(r.abbrev)}>
              <Library size={14} />
              <span><b>{r.title}</b><small>{r.author}{r.year ? `, ${r.year}` : ''} · {r.rubricCount.toLocaleString()} rubrics</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The repertory's name in the pane head, taking the free space; when the full name does not fit,
 * the abbreviation stands in (the full name stays in the tooltip and the accessible name).
 */
function PaneTitle({ title, abbrev }: { title: string; abbrev: string }) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const fullRef = useRef<HTMLSpanElement>(null)
  const [short, setShort] = useState(false)
  useEffect(() => {
    const box = boxRef.current, full = fullRef.current
    if (!box || !full) return
    // widths come from the observer's entries (it reports every observed element once on observe),
    // never from a synchronous layout read; the full name is always laid out, hidden when short
    let boxW = -1, fullW = -1
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width
        if (e.target === box) boxW = e.contentBoxSize?.[0]?.inlineSize ?? e.contentRect.width
        else if (e.target === full) fullW = w
      }
      if (boxW >= 0 && fullW >= 0) setShort(fullW > boxW + 0.5)
    })
    ro.observe(box)
    ro.observe(full)
    return () => ro.disconnect()
  }, [title])
  return (
    <span className={`rnav-title${short ? ' rnav-title-short' : ''}`} ref={boxRef} title={title} aria-label={title}>
      <span className="rnav-title-full" ref={fullRef}>{title}</span>
      {short && <span className="rnav-title-abbr" aria-hidden="true">{abbrev}</span>}
    </span>
  )
}

/** Memoised: while the navigator waits for its deferred tab, the urgent render skips the tree. */
const TreeSection = memo(function TreeSection({ tabId }: { tabId: string }) {
  const repertory = useApp(s => repTab(s, tabId)?.repertory ?? '')
  const catalog = useCatalog()
  const loading = useRepertory(repertory)
  // a loaded repertory is taken from the catalog in this very render (the loader's state catches up
  // in an effect): switching to a loaded book renders its tree in the navigator's transition, never
  // the previous book's tree for the new tab
  const rep = catalog.repertory(repertory) ?? (loading.rep?.abbrev === repertory ? loading.rep : null)
  const error = rep ? null : loading.error
  const title = catalog.repertoryInfos.find(r => r.abbrev === repertory)?.title ?? repertory
  return (
    <div className="rnav-tree-wrap">
      <div className="pane-head rnav-head">
        <ListTree size={13} /><PaneTitle title={title} abbrev={repertory} />
        <button className="icon-btn" title="Repertories (Ctrl+1)" aria-label="Repertories table of contents" onClick={() => runCommand('repertory.toc')}><Library size={13} /></button>
        <button className="icon-btn" title="Find rubric (F2)" aria-label="Find rubric" onClick={() => runCommand('nav.chapter')}><Search size={13} /></button>
      </div>
      {error ? <div className="rnav-empty"><strong>Could not load</strong><span>{error.message}</span></div>
        : !rep ? (
          <div className="rnav-skel" role="status" aria-busy="true">
            <span className="rnav-loading"><LoaderCircle size={12} className="spin" /> Loading {title}</span>
            {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${45 + ((i * 29) % 45)}%` }} />)}
          </div>
        )
          : <Tree key={rep.abbrev} tabId={tabId} rep={rep} />}
    </div>
  )
})

const Tree = memo(function Tree({ tabId, rep }: { tabId: string; rep: Repertory }) {
  const showCounts = useApp(s => s.settings.showRemedyCounts)
  // the book's current rubric; following it is deferred, so a key press in the book renders the book first
  const liveRubric = useApp(s => repTab(s, tabId)?.rubric ?? 0)
  const rubric = Math.min(useDeferredValue(liveRubric), rep.size - 1)
  const [filter, setFilter] = useState('')
  // the first render already follows the current rubric (no render-phase update on mount)
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => followExpanded(rep, expandedByRep.get(rep.abbrev) ?? new Set(), rubric, null))
  // the rubric (and its chapter) the tree last followed; a new current rubric re-derives the expansion
  // and puts the cursor back on it (adjusting state while rendering, not in an effect)
  const [followed, setFollowed] = useState<{ rubric: number; chapter: number } | null>(() => ({ rubric, chapter: rep.chapterRoot(rubric) }))
  const [cursorAt, setCursorAt] = useState({ rubric, cursor: rubric })
  if (followed?.rubric !== rubric) {
    setExpanded(followExpanded(rep, expanded, rubric, followed?.chapter ?? null))
    setFollowed({ rubric, chapter: rep.chapterRoot(rubric) })
  }
  const cursor = cursorAt.rubric === rubric ? cursorAt.cursor : rubric
  const setCursor = (c: number) => setCursorAt({ rubric, cursor: c })
  useLayoutEffect(() => { expandedByRep.set(rep.abbrev, expanded) }, [rep, expanded])
  const scrollRef = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()
  const typeahead = useRef({ text: '', at: 0 })
  // the row a context menu applies to stays marked while the menu is open
  const [menuTarget, setMenuTarget] = useState<number | null>(null)
  const menuOpen = cm.element != null
  const markedRow = menuOpen ? menuTarget : null

  const chapters = useMemo(() => {
    if (!filter.trim()) return rep.chapters
    return matchChapters(rep.chapters.map(c => ({ id: c, name: rep.text(c) })), filter).map(x => x.id)
  }, [rep, filter])
  const tree = useMemo(() => treeRows(rep, chapters, expanded), [rep, chapters, expanded])
  const rows = tree.rows
  const pos = useMemo(() => { const m = new Map<number, number>(); rows.forEach((r, k) => m.set(r, k)); return m }, [rows])
  // assume a window-high pane until it is measured: the rows mount in one pass
  const v = useFixedVirtual(scrollRef, rows.length, ROW, 8, { deferScroll: true, initialHeight: typeof window === 'undefined' ? 0 : window.innerHeight })

  const cursorRow = pos.get(cursor) ?? -1
  // keep the cursor in view, also when the tree pane shrinks (the Bookmarks / Recent sections grow)
  useEffect(() => { if (cursorRow >= 0) v.scrollToIndex(cursorRow) }, [cursorRow, rows, v.pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number, open?: boolean) => {
    const isOpen = expanded.has(i)
    const want = open ?? !isOpen
    if (want === isOpen) return
    const next = new Set(expanded)
    if (want) next.add(i)
    else {
      next.delete(i)
      // the current rubric disappears inside a collapsed node: move the cursor up to it
      if (cursor > i && cursor < rep.subtreeEndOf(i)) setCursor(i)
    }
    setExpanded(next)
  }

  const go = (i: number, history = true) => {
    setCursor(i)
    if (history) actions.navigateRubric(tabId, i)
    else actions.updateTab<RepertoryTab>(tabId, { rubric: i })
    if (useApp.getState().activeTabId !== tabId) actions.activateTab(tabId)
  }

  const menuFor = (i: number): MenuItem[] => [
    { label: 'Show in book', run: () => go(i) },
    { label: 'Open in new tab', run: () => void goToRef(rep.ref(i), { newTab: true }) },
    { type: 'separator' },
    { label: expanded.has(i) ? 'Collapse' : 'Expand', disabled: !rep.childCountOf(i), run: () => toggle(i) },
    { label: 'Collapse all', run: () => { setExpanded(new Set()); setCursor(rep.chapterRoot(cursor)) } },
    { type: 'separator' },
    { label: useApp.getState().bookmarks.some(b => b.ref === rep.ref(i)) ? 'Remove bookmark' : 'Bookmark', run: () => toggleBookmark(rep.ref(i)) },
    { label: 'Find from here…', run: () => actions.openDialog('repertory.find', { repertory: rep.abbrev, from: i }) },
  ]
  const openMenu = (i: number, at: { e?: React.MouseEvent; el?: HTMLElement }) => {
    setMenuTarget(i)
    if (at.e) cm.open(at.e, menuFor(i))
    else if (at.el) cm.openAt(at.el, menuFor(i))
  }

  /** Row event handlers, stable across renders so unchanged rows skip rendering. */
  const handlers = useRef<{ go: typeof go; toggle: typeof toggle; openMenu: typeof openMenu } | null>(null)
  useLayoutEffect(() => { handlers.current = { go, toggle, openMenu } })
  const rowActions = useMemo<RowActions>(() => ({
    click: i => { handlers.current?.go(i); scrollRef.current?.focus() },
    twist: i => handlers.current?.toggle(i),
    menu: (i, e) => handlers.current?.openMenu(i, { e }),
  }), [])


  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.target !== scrollRef.current) return
    const k = cursorRow < 0 ? 0 : cursorRow
    const cur = rows[k]
    let handled = true
    if (e.key === 'ArrowDown') { if (k + 1 < rows.length) go(rows[k + 1], false) }
    else if (e.key === 'ArrowUp') { if (k > 0) go(rows[k - 1], false) }
    else if (e.key === 'PageDown') go(rows[Math.min(rows.length - 1, k + v.pageSize)], false)
    else if (e.key === 'PageUp') go(rows[Math.max(0, k - v.pageSize)], false)
    else if (e.key === 'Home') go(rows[0], false)
    else if (e.key === 'End') go(rows[rows.length - 1], false)
    else if (e.key === 'ArrowRight') {
      if (rep.childCountOf(cur) && !expanded.has(cur)) toggle(cur, true)
      else if (rep.childCountOf(cur)) go(rows[k + 1], false)
    } else if (e.key === 'ArrowLeft') {
      if (expanded.has(cur)) toggle(cur, false)
      else if (rep.parent(cur) >= 0) go(rep.parent(cur), false)
    } else if (e.key === 'Enter') {
      go(cur)
      document.querySelector<HTMLElement>('.rv-scroll')?.focus()
    } else if (e.key === '*') {
      const next = new Set(expanded)
      for (const c of rep.children(cur)) if (rep.childCountOf(c)) next.add(c)
      next.add(cur); setExpanded(next)
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-node="${cur}"]`)
      if (el) openMenu(cur, { el })
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = performance.now()
      const t = typeahead.current
      t.text = now - t.at > 800 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
      t.at = now
      const from = t.text.length === 1 ? k + 1 : k
      for (let n = 0; n < rows.length; n++) {
        const r = rows[(from + n) % rows.length]
        if (rep.text(r).toLowerCase().startsWith(t.text)) { go(r, false); break }
      }
    } else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const currentChapter = rep.chapterRoot(rubric)
  const items = []
  for (let k = v.start; k < v.end; k++) {
    const i = rows[k]
    items.push(
      <TreeRow
        key={i} rep={rep} i={i} top={k * ROW} posinset={tree.pos[k]} setsize={tree.size[k]}
        open={expanded.has(i)} current={i === rubric} cursor={i === cursor} menuTarget={i === markedRow}
        currentChapter={i === currentChapter} showCounts={showCounts} actions={rowActions}
      />,
    )
  }

  return (
    <>
      <div className="rnav-filter">
        <Search size={12} className="rnav-filter-icon" />
        <input
          className="input" placeholder="Filter chapters" aria-label="Filter chapters" value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && filter) { e.preventDefault(); e.stopPropagation(); setFilter('') }
            else if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault()
              if (e.key === 'Enter' && chapters[0] != null) go(chapters[0])
              scrollRef.current?.focus()
            }
          }}
        />
        {filter && <button className="icon-btn rnav-filter-x" aria-label="Clear filter" onClick={() => setFilter('')}><X size={12} /></button>}
      </div>
      <div
        className="rnav-tree" ref={scrollRef} tabIndex={0} role="tree" aria-label={`${rep.info.title} chapters`}
        aria-activedescendant={cursorRow >= 0 ? `rnav-${cursor}` : undefined}
        onKeyDown={onKeyDown}
      >
        {rows.length === 0 ? <div className="rnav-empty"><span>No chapter matches “{filter}”</span></div>
          : <div style={{ height: v.total, position: 'relative' }}>{items}</div>}
      </div>
      {cm.element}
    </>
  )
})

interface RowActions {
  click: (i: number) => void
  twist: (i: number) => void
  menu: (i: number, e: React.MouseEvent) => void
}

/** One tree row; memoised, so moving the cursor re-renders two rows, not the whole window. */
const TreeRow = memo(function TreeRow({ rep, i, top, posinset, setsize, open, current, cursor, menuTarget, currentChapter, showCounts, actions: act }: {
  rep: Repertory; i: number; top: number; posinset: number; setsize: number; open: boolean; current: boolean; cursor: boolean
  menuTarget: boolean; currentChapter: boolean; showCounts: boolean; actions: RowActions
}) {
  const depth = rep.depth(i)
  const kids = rep.childCountOf(i)
  const count = rep.remedyCount(i)
  return (
    <div
      id={`rnav-${i}`}
      data-node={i}
      role="treeitem"
      aria-level={depth + 1}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-expanded={kids ? open : undefined}
      aria-selected={current}
      className={`rnav-row${current ? ' current' : ''}${cursor ? ' cursor' : ''}${menuTarget ? ' menu-target' : ''}${depth === 0 ? ' chapter' : ''}${currentChapter ? ' current-chapter' : ''}`}
      style={{ top, paddingLeft: 4 + depth * 14 }}
      draggable
      onDragStart={e => { e.dataTransfer.setData(RUBRIC_MIME, rep.ref(i)); e.dataTransfer.setData('text/plain', rep.path(i)); e.dataTransfer.effectAllowed = 'copy' }}
      onClick={e => { if ((e.target as HTMLElement).closest('.rnav-twist')) return; act.click(i) }}
      onContextMenu={e => act.menu(i, e)}
    >
      <span className="rnav-twist" onClick={() => kids && act.twist(i)} aria-hidden="true">
        {kids ? <span className={`rnav-chev${open ? ' open' : ''}`} /> : null}
      </span>
      <span className="rnav-text">{rep.text(i)}</span>
      {showCounts && count > 0 && <span className="rnav-count" title={`${countFormat.format(count)} ${count === 1 ? 'remedy' : 'remedies'}`}>{countFormat.format(count)}</span>}
    </div>
  )
})
const countFormat = new Intl.NumberFormat()

const BookmarksSection = memo(function BookmarksSection({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const bookmarks = useApp(s => s.bookmarks)
  const catalog = useCatalog()
  const cm = useContextMenu()
  const sorted = useMemo(() => [...bookmarks].sort((a, b) => a.folder.localeCompare(b.folder) || a.label.localeCompare(b.label)), [bookmarks])
  return (
    <section className={`rnav-sec${collapsed ? ' collapsed' : ''}`} aria-label="Bookmarks">
      <div className="pane-head rnav-sec-head">
        <button className="rnav-sec-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<Bookmark size={12} /> Bookmarks <span className="badge">{bookmarks.length}</span>
        </button>
        <span className="grow" />
        <button className="icon-btn" title="Manage bookmarks" aria-label="Manage bookmarks" onClick={() => runCommand('bookmarks.open')}><Settings2 size={13} /></button>
      </div>
      {!collapsed && (
        <div className="rnav-sec-body" role={sorted.length ? 'list' : undefined}>
          {sorted.length === 0 && <div className="rnav-hint">No bookmarks yet. Press <kbd className="kbd">Ctrl+D</kbd> on a rubric.</div>}
          {sorted.map((b, x) => {
            const { repertory } = parseRef(b.ref)
            const showFolder = x === 0 || sorted[x - 1].folder !== b.folder
            return (
              <div key={b.id} role="listitem">
                {showFolder && sorted.length > 1 && <div className="rnav-folder">{b.folder}</div>}
                <button
                  className="rnav-link" title={`${b.label}\n${catalog.repertoryInfos.find(r => r.abbrev === repertory)?.title ?? repertory}`}
                  onClick={() => void goToRef(b.ref)}
                  onContextMenu={e => cm.open(e, [
                    { label: 'Open', run: () => void goToRef(b.ref) },
                    { label: 'Open in new tab', run: () => void goToRef(b.ref, { newTab: true }) },
                    { type: 'separator' },
                    { label: 'Manage bookmarks…', run: () => actions.openDialog('repertory.bookmarks', { selectId: b.id }) },
                    { label: 'Remove bookmark', danger: true, run: () => actions.removeBookmark(b.id) },
                  ])}
                >
                  <Bookmark size={11} className="rnav-link-icon" />
                  <span className="rnav-link-text">{b.label}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
      {cm.element}
    </section>
  )
})

const RecentSection = memo(function RecentSection({ tabId, collapsed, onToggle }: { tabId: string; collapsed: boolean; onToggle: () => void }) {
  const tab = useApp(s => repTab(s, tabId))
  const recentRubrics = useApp(s => s.recentRubrics)
  const catalog = useCatalog()
  const rep = tab ? catalog.repertory(tab.repertory) : undefined
  // the workspace Recent list (saved with the workspace) for this repertory, then the list a tab saved
  // before it existed; with neither, the tab's jump history
  const recent = useMemo(() => {
    if (!tab) return []
    const out = recentOf(recentRubrics, tab.repertory, tab.recent, 15)
    return (out.length ? out : recentOf([], tab.repertory, [...tab.back].reverse(), 15)).filter(r => !rep || r < rep.size)
  }, [tab, recentRubrics, rep])
  if (!rep || !tab) return null
  return (
    <section className={`rnav-sec${collapsed ? ' collapsed' : ''}`} aria-label="Recent rubrics">
      <div className="pane-head rnav-sec-head">
        <button className="rnav-sec-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<History size={12} /> Recent <span className="badge">{recent.length}</span>
        </button>
      </div>
      {!collapsed && (
        <div className="rnav-sec-body" role={recent.length ? 'list' : undefined}>
          {recent.length === 0 && <div className="rnav-hint">Rubrics you jump to, read for a moment, take, copy or bookmark appear here.</div>}
          {recent.map(r => (
            <div key={r} role="listitem">
              <button
                className={`rnav-link${r === tab.rubric ? ' current' : ''}`} title={rep.path(r)} aria-current={r === tab.rubric ? 'location' : undefined}
                onClick={() => { actions.navigateRubric(tab.id, r); if (useApp.getState().activeTabId !== tab.id) actions.activateTab(tab.id) }}
              >
                <span className="rnav-link-text">{rep.path(r, ' › ')}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
})
