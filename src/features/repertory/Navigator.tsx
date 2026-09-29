import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Bookmark, ChevronDown, ChevronRight, History, Library, ListTree, Search, Settings2, X } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import { parseRef } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import { actions, selectActiveTab, useApp } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { runCommand } from '../../commands/registry'
import { useFixedVirtual } from './virtual'
import { matchChapters } from './take'
import { flattenTree } from './logic'
import { goToRef, openRepertory, toggleBookmark } from './ops'
import { RUBRIC_MIME } from './RepertoryView'
import './repertory.css'

const ROW = 22

/** Per-repertory expanded nodes, kept across remounts. */
const expandedByRep = new Map<string, Set<number>>()
function expandedSet(abbrev: string) {
  let s = expandedByRep.get(abbrev)
  if (!s) { s = new Set(); expandedByRep.set(abbrev, s) }
  return s
}

function loadSections(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('rnav.sections') ?? '{}') as Record<string, boolean> } catch { return {} }
}

export function Navigator() {
  const activeTab = useApp(selectActiveTab)
  const tabs = useApp(s => s.tabs)
  const lastRepTab = useRef<string | null>(null)
  if (activeTab?.kind === 'repertory') lastRepTab.current = activeTab.id
  const tab = (activeTab?.kind === 'repertory' ? activeTab : tabs.find(t => t.id === lastRepTab.current && t.kind === 'repertory')) as RepertoryTab | undefined
  const [sections, setSections] = useState(loadSections)
  const toggleSection = (k: string) => setSections(s => {
    const next = { ...s, [k]: !s[k] }
    try { localStorage.setItem('rnav.sections', JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })

  return (
    <div className="rnav">
      {tab ? <TreeSection tab={tab} /> : <NoRepertory />}
      <BookmarksSection collapsed={!!sections.bookmarks} onToggle={() => toggleSection('bookmarks')} />
      {tab && <RecentSection tab={tab} collapsed={!!sections.recent} onToggle={() => toggleSection('recent')} />}
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

function TreeSection({ tab }: { tab: RepertoryTab }) {
  const { rep, error } = useRepertory(tab.repertory)
  const catalog = useCatalog()
  const title = catalog.repertoryInfos.find(r => r.abbrev === tab.repertory)?.title ?? tab.repertory
  return (
    <div className="rnav-tree-wrap">
      <div className="pane-head">
        <ListTree size={13} /><span className="rnav-title" title={title}>{title}</span><span className="grow" />
        <button className="icon-btn" title="Repertories (Ctrl+1)" aria-label="Repertories table of contents" onClick={() => runCommand('repertory.toc')}><Library size={13} /></button>
        <button className="icon-btn" title="Find rubric (F2)" aria-label="Find rubric" onClick={() => runCommand('nav.chapter')}><Search size={13} /></button>
      </div>
      {error ? <div className="rnav-empty"><strong>Could not load</strong><span>{error.message}</span></div>
        : !rep ? <div className="rnav-skel">{Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${45 + ((i * 29) % 45)}%` }} />)}</div>
          : <Tree tab={tab} rep={rep} />}
    </div>
  )
}

function Tree({ tab, rep }: { tab: RepertoryTab; rep: Repertory }) {
  const showCounts = useApp(s => s.settings.showRemedyCounts)
  const [filter, setFilter] = useState('')
  const [version, setVersion] = useState(0)
  const [cursor, setCursor] = useState(tab.rubric)
  const expanded = expandedSet(rep.abbrev)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()
  const typeahead = useRef({ text: '', at: 0 })
  // the row a context menu applies to stays marked while the menu is open
  const [menuTarget, setMenuTarget] = useState<number | null>(null)
  const menuOpen = cm.element != null
  useEffect(() => { if (!menuOpen) setMenuTarget(null) }, [menuOpen])
  const openMenu = (i: number, at: { e?: React.MouseEvent; el?: HTMLElement }) => {
    setMenuTarget(i)
    if (at.e) cm.open(at.e, menuFor(i))
    else if (at.el) cm.openAt(at.el, menuFor(i))
  }

  // follow the current rubric: expand its ancestors; entering another chapter folds the previous one
  const followedChapter = useRef<number | null>(null)
  useEffect(() => {
    const line = rep.lineage(Math.min(tab.rubric, rep.size - 1))
    let changed = false
    const chapter = line[0]
    if (followedChapter.current != null && followedChapter.current !== chapter) {
      const end = rep.subtreeEndOf(chapter)
      for (const n of [...expanded]) if (n < chapter || n >= end) { expanded.delete(n); changed = true }
    }
    followedChapter.current = chapter
    for (const a of line.slice(0, -1)) if (!expanded.has(a)) { expanded.add(a); changed = true }
    if (changed) setVersion(x => x + 1)
    setCursor(tab.rubric)
  }, [tab.rubric, rep, expanded])

  const chapters = useMemo(() => {
    if (!filter.trim()) return rep.chapters
    return matchChapters(rep.chapters.map(c => ({ id: c, name: rep.text(c) })), filter).map(x => x.id)
  }, [rep, filter])
  const rows = useMemo(() => flattenTree(rep, chapters, expanded), [rep, chapters, expanded, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const pos = useMemo(() => { const m = new Map<number, number>(); rows.forEach((r, k) => m.set(r, k)); return m }, [rows])
  const v = useFixedVirtual(scrollRef, rows.length, ROW)

  const cursorRow = pos.get(cursor) ?? -1
  // keep the cursor in view, also when the tree pane shrinks (the Bookmarks / Recent sections grow)
  useEffect(() => { if (cursorRow >= 0) v.scrollToIndex(cursorRow) }, [cursorRow, rows, v.pageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i: number, open?: boolean) => {
    const isOpen = expanded.has(i)
    const want = open ?? !isOpen
    if (want === isOpen) return
    if (want) expanded.add(i)
    else {
      expanded.delete(i)
      // the current rubric disappears inside a collapsed node: move the cursor up to it
      if (cursor > i && cursor < rep.subtreeEndOf(i)) setCursor(i)
    }
    setVersion(x => x + 1)
  }

  const go = (i: number, history = true) => {
    setCursor(i)
    if (history) actions.navigateRubric(tab.id, i)
    else actions.updateTab<RepertoryTab>(tab.id, { rubric: i })
    if (useApp.getState().activeTabId !== tab.id) actions.activateTab(tab.id)
  }

  const menuFor = (i: number): MenuItem[] => [
    { label: 'Show in book', run: () => go(i) },
    { label: 'Open in new tab', run: () => void goToRef(rep.ref(i), { newTab: true }) },
    { type: 'separator' },
    { label: expanded.has(i) ? 'Collapse' : 'Expand', disabled: !rep.childCountOf(i), run: () => toggle(i) },
    { label: 'Collapse all', run: () => { expanded.clear(); setCursor(rep.chapterRoot(cursor)); setVersion(x => x + 1) } },
    { type: 'separator' },
    { label: useApp.getState().bookmarks.some(b => b.ref === rep.ref(i)) ? 'Remove bookmark' : 'Bookmark', run: () => toggleBookmark(rep.ref(i)) },
    { label: 'Find from here…', run: () => actions.openDialog('repertory.find', { repertory: rep.abbrev, from: i }) },
  ]

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
      for (const c of rep.children(cur)) if (rep.childCountOf(c)) expanded.add(c)
      expanded.add(cur); setVersion(x => x + 1)
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

  const items = []
  for (let k = v.start; k < v.end; k++) {
    const i = rows[k]
    const depth = rep.depth(i)
    const kids = rep.childCountOf(i)
    const open = expanded.has(i)
    const count = rep.remedyCount(i)
    items.push(
      <div
        key={i}
        id={`rnav-${i}`}
        data-node={i}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={kids ? open : undefined}
        aria-selected={i === tab.rubric}
        className={`rnav-row${i === tab.rubric ? ' current' : ''}${i === cursor ? ' cursor' : ''}${i === menuTarget ? ' menu-target' : ''}${depth === 0 ? ' chapter' : ''}`}
        style={{ top: k * ROW, paddingLeft: 4 + depth * 14 }}
        draggable
        onDragStart={e => { e.dataTransfer.setData(RUBRIC_MIME, rep.ref(i)); e.dataTransfer.setData('text/plain', rep.path(i)); e.dataTransfer.effectAllowed = 'copy' }}
        onClick={e => { if ((e.target as HTMLElement).closest('.rnav-twist')) return; go(i); scrollRef.current?.focus() }}
        onContextMenu={e => openMenu(i, { e })}
      >
        <span className="rnav-twist" onClick={() => kids && toggle(i)} aria-hidden="true">
          {kids ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
        </span>
        <span className="rnav-text">{rep.text(i)}</span>
        {showCounts && count > 0 && <span className="rnav-count">{count}</span>}
      </div>,
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
}

function BookmarksSection({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
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
        <div className="rnav-sec-body" role="list">
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
}

function RecentSection({ tab, collapsed, onToggle }: { tab: RepertoryTab; collapsed: boolean; onToggle: () => void }) {
  const catalog = useCatalog()
  const rep = catalog.repertory(tab.repertory)
  const recent = useMemo(() => {
    if (tab.recent?.length) return tab.recent.slice(0, 15)
    // tabs from before the Recent list existed: fall back to the jump history
    const seen = new Set<number>()
    const out: number[] = []
    for (let k = tab.back.length - 1; k >= 0 && out.length < 15; k--) {
      const r = tab.back[k]
      if (!seen.has(r)) { seen.add(r); out.push(r) }
    }
    return out
  }, [tab.recent, tab.back])
  if (!rep) return null
  return (
    <section className={`rnav-sec${collapsed ? ' collapsed' : ''}`} aria-label="Recent rubrics">
      <div className="pane-head rnav-sec-head">
        <button className="rnav-sec-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<History size={12} /> Recent <span className="badge">{recent.length}</span>
        </button>
      </div>
      {!collapsed && (
        <div className="rnav-sec-body" role="list">
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
}
