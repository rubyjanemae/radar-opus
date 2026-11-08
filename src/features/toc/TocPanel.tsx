import { Suspense, lazy, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { parseRef } from '../../data/catalog'
import { actions, useApp } from '../../state/store'
import { useChrome } from '../../shell/chrome'
import type { TocView } from '../../shell/chrome'
import { cancelDocumentFocus, focusDocumentWhenReady } from '../../shell/TabHost'
import { runCommand } from '../../commands/registry'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { Navigator } from '../repertory/Navigator'
import { goToRef } from '../repertory/ops'
import { openMM, openRemedy } from '../mm/ops'
import { openFamilies } from '../families/ops'
import { useFamilies } from '../families/api'
import { visibleRows } from '../families/model'
import { closeOverlays } from '../workspace/responsive'
import { BookGlyph, CogsGlyph, HelpGlyph, LangFlag, RefreshGlyph, TreeGlyph } from './glyphs'
import { HScrollBar } from './HScrollBar'
import { filterRemedies, findTyped, foldText, parentOf, stepCursor } from './lists'
import type { ListRow } from './lists'
import './toc.css'

/** The docked patients list (the toolbar's Patients button): the patients feature's own chunk. */
const PatientsPanel = lazy(() => import('../patients/PatientsPanel').then(m => ({ default: m.PatientsPanel })))

/**
 * The table of contents panel (RadarOpus "Toc"): the list the toolbar's list buttons chose —
 * Repertories (the book tree), References, Remedies, Families or Bookmarks. Each list keeps the
 * Repertories layout: a filter field with refresh / settings / help on top, the list, a count footer.
 */
export const TocPanel = memo(function TocPanel() {
  const view = useChrome(s => s.tocView)
  // each list starts fresh (filter, cursor) when it is shown again
  switch (view) {
    case 'references': return <ReferencesList key="references" />
    case 'remedies': return <RemediesList key="remedies" />
    case 'families': return <FamiliesList key="families" />
    case 'bookmarks': return <BookmarksList key="bookmarks" />
    case 'patients': return <Suspense fallback={null}><PatientsPanel key="patients" /></Suspense>
    default: return <Navigator key="repertories" />
  }
})

/* ───────────────────────── shared list ───────────────────────── */

/** Rows are 18 px tall with 2 px between them, as in the repertory tree. */
const ROW_PX = 20
const OVERSCAN = 12
const TYPEAHEAD_MS = 700

interface TocListProps {
  view: TocView
  /** Label in front of the filter field. */
  label: string
  rows: ListRow[]
  query: string
  setQuery: (q: string) => void
  footer: string
  /** Shown when nothing matches the filter (or the list is empty). */
  empty: string
  onActivate: (row: ListRow, opts: { newTab?: boolean }) => void
  onToggle?: (row: ListRow, open?: boolean) => void
  menu?: (row: ListRow) => MenuItem[]
  /** Clears what the refresh button resets besides the filter (expanded rows). */
  onRefresh?: () => void
  glyph?: (row: ListRow) => ReactNode
}

function TocList({ view, label, rows, query, setQuery, footer, empty, onActivate, onToggle, menu, onRefresh, glyph }: TocListProps) {
  const [cursorKey, setCursorKey] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const treeRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const cm = useContextMenu()
  const fieldId = `toc-search-${view}`

  const at = cursorKey == null ? -1 : rows.findIndex(r => r.key === cursorKey)
  const cur = at >= 0 ? rows[at] : null

  useLayoutEffect(() => {
    const el = treeRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // the cursor row is kept in view
  useLayoutEffect(() => {
    const el = treeRef.current
    if (!el || at < 0) return
    const top = at * ROW_PX, bottom = top + ROW_PX
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
  }, [at])

  // hiding the panel (Cmd+F2) with the focus in it hands the focus to the active document
  useLayoutEffect(() => {
    const root = rootRef.current
    return () => { if (root?.contains(document.activeElement)) focusDocumentWhenReady() }
  }, [])

  const focusTree = () => treeRef.current?.focus({ preventScroll: true })
  const activate = (row: ListRow, opts: { newTab?: boolean } = {}) => {
    if (row.kind === 'section' || row.kind === 'folder') { onToggle?.(row); return }
    onActivate(row, opts)
    if (document.documentElement.dataset.narrow === 'true') closeOverlays()
    focusDocumentWhenReady()
  }
  const showMenu = (row: ListRow, e?: ReactMouseEvent) => {
    const items = menu?.(row) ?? []
    if (!items.length) return
    if (e) { cm.open(e, items); return }
    const el = document.getElementById(rowId(view, row.key))
    if (el) cm.openAt(el, items)
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.target !== treeRef.current) return
    const plain = !e.altKey && !e.metaKey && !e.ctrlKey
    const page = Math.max(1, Math.floor(height / ROW_PX) - 1)
    const go = (k: Parameters<typeof stepCursor>[2]) => { const n = stepCursor(rows.length, at, k, page); if (n != null) setCursorKey(rows[n].key) }
    let handled = true
    if (e.key === 'ArrowDown' && plain) go('down')
    else if (e.key === 'ArrowUp' && plain) go('up')
    else if (e.key === 'Home' && plain) go('home')
    else if (e.key === 'End' && plain) go('end')
    else if (e.key === 'PageDown' && plain) go('pageDown')
    else if (e.key === 'PageUp' && plain) go('pageUp')
    else if (e.key === 'ArrowRight' && plain && cur) {
      if (cur.expandable && !cur.open) onToggle?.(cur, true)
      else if (cur.expandable && rows[at + 1]?.depth > cur.depth) setCursorKey(rows[at + 1].key)
    } else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && plain && cur) {
      if (cur.expandable && cur.open) onToggle?.(cur, false)
      else { const p = parentOf(rows, at); if (p >= 0) setCursorKey(rows[p].key) }
    } else if (e.key === 'Enter' && cur && !e.altKey) activate(cur, { newTab: e.metaKey || e.ctrlKey })
    else if (e.key === ' ' && plain && cur) activate(cur)
    else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && cur) showMenu(cur)
    else if (e.key.length === 1 && e.key !== ' ' && plain) {
      const t = typed.current
      t.text = e.timeStamp - t.at < TYPEAHEAD_MS ? t.text + e.key : e.key
      t.at = e.timeStamp
      const n = findTyped(rows, at, t.text) ?? (t.text.length > 1 ? findTyped(rows, at, e.key) : null)
      if (n != null) setCursorKey(rows[n].key)
    } else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const refresh = () => {
    setQuery('')
    onRefresh?.()
    setCursorKey(null)
    if (treeRef.current) { treeRef.current.scrollTop = 0; setScrollX(treeRef.current, 0) }
    focusTree()
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_PX) + OVERSCAN)
  const menuOpen = cm.element != null

  return (
    <div className={`toc toc-list toc-list-${view}`} ref={rootRef} onPointerDownCapture={cancelDocumentFocus} onKeyDownCapture={cancelDocumentFocus}>
      <div className="toc-head">
        <label className="toc-search-label" htmlFor={fieldId}>{label}</label>
        <input
          id={fieldId} className="toc-search" type="search" placeholder={label.replace(/:$/, '')} spellCheck={false} autoComplete="off" value={query}
          onChange={e => { setQuery(e.target.value); if (treeRef.current) treeRef.current.scrollTop = 0 }}
          onKeyDown={e => {
            if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
            else if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault()
              const firstItem = rows.find(r => r.kind !== 'section') ?? rows[0]
              if (firstItem) setCursorKey(firstItem.key)
              if (e.key === 'Enter' && firstItem && query.trim()) activate(firstItem)
              else focusTree()
            }
          }}
        />
        <span className="toc-hbtns">
          <button className="toc-hbtn toc-refresh" title="Refresh the table of contents" aria-label="Refresh the table of contents" onClick={refresh}><RefreshGlyph /></button>
          <button className="toc-hbtn" title="Settings" aria-label="Settings" onClick={() => runCommand('app.settings')}><CogsGlyph /></button>
          <button className="toc-hbtn toc-help" title="Keyboard shortcuts (F1)" aria-label="Keyboard shortcuts" onClick={() => runCommand('help.shortcuts')}><HelpGlyph /></button>
        </span>
      </div>
      <div
        className="toc-tree" ref={treeRef} tabIndex={0} role="tree" aria-label={label.replace(/:$/, '')}
        aria-activedescendant={cur ? rowId(view, cur.key) : undefined} onKeyDown={onKeyDown}
        onScroll={e => { holdScrollX(e.currentTarget); setScrollTop(e.currentTarget.scrollTop) }}
        onWheel={e => { if (e.deltaX) setScrollX(e.currentTarget, e.currentTarget.scrollLeft + e.deltaX) }}
        onFocus={e => { if (e.target === treeRef.current && at < 0 && rows.length) setCursorKey((rows.find(r => r.kind !== 'section') ?? rows[0]).key) }}
      >
        {rows.length === 0 && <div className="toc-empty">{empty}</div>}
        <div className="toc-list-body" style={{ height: rows.length * ROW_PX }}>
          {rows.slice(first, last).map((row, n) => {
            const i = first + n
            const isCur = i === at
            return (
              <div
                key={row.key} id={rowId(view, row.key)} role="treeitem" aria-level={row.depth + 1}
                aria-expanded={row.expandable ? !!row.open : undefined} aria-selected={isCur}
                className={`toc-row toc-lrow toc-lrow-${row.kind}${isCur ? ' cursor' : ''}${isCur && menuOpen ? ' menu-target' : ''}`}
                style={{ top: i * ROW_PX, paddingLeft: row.depth * 16 }}
                onClick={e => {
                  setCursorKey(row.key); focusTree()
                  if (row.expandable && (row.kind === 'section' || row.kind === 'folder' || (e.target as HTMLElement).closest('.toc-twist'))) onToggle?.(row)
                }}
                onDoubleClick={e => { if (!(e.target as HTMLElement).closest('.toc-twist') && row.kind !== 'section' && row.kind !== 'folder') activate(row) }}
                onContextMenu={e => { setCursorKey(row.key); focusTree(); showMenu(row, e) }}
              >
                {row.expandable ? <span className={`toc-twist${row.open ? ' open' : ''}`} aria-hidden="true" /> : <span className="toc-twist-gap" aria-hidden="true" />}
                {glyph?.(row)}
                {row.lang && <LangFlag lang={row.lang} />}
                <span className="toc-label">{row.label}</span>
                {row.sub && <span className="toc-lsub">{row.sub}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="toc-foot" role="status">{footer}</div>
      <HScrollBar target={treeRef} deps={rows} />
      {cm.element}
    </div>
  )
}

/**
 * The tree's horizontal offset moves only when the user scrolls sideways (the scrollbar under the
 * footer, a sideways wheel or trackpad swipe). Anything else that would scroll it (the browser
 * bringing a clicked or focused row's long label into view) is undone, so column 0 (twists, icons)
 * stays in view while rows are selected and opened, as in RadarOpus.
 */
function setScrollX(el: HTMLElement, x: number) {
  el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, x))
  el.dataset.scrollX = String(el.scrollLeft)
}
function holdScrollX(el: HTMLElement) {
  const want = Number(el.dataset.scrollX ?? 0)
  if (el.scrollLeft !== want) el.scrollLeft = want
}

const rowId = (view: string, key: string) => `tocl-${view}-${key.replace(/[^\w-]/g, '_')}`

/** Expanded rows of a list (kept while the list is shown). */
function useExpanded(initial: string[] = []) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initial))
  const toggle = (key: string, want?: boolean) => setOpen(prev => {
    const has = prev.has(key)
    const next = want ?? !has
    if (next === has) return prev
    const s = new Set(prev)
    if (next) s.add(key); else s.delete(key)
    return s
  })
  return { open, toggle, reset: () => setOpen(new Set(initial)) }
}

/* ───────────────────────── References ───────────────────────── */

const MM_FALLBACK = { title: 'Pocket Manual of Homoeopathic Materia Medica', author: 'Boericke W.', lang: 'en' }

function ReferencesList() {
  const catalog = useCatalog()
  const [query, setQuery] = useState('')
  const ex = useExpanded(['sec:mm'])
  const bookOpen = ex.open.has('book:mm')
  const [monographs, setMonographs] = useState<number[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!bookOpen || monographs) return
    let live = true
    catalog.loadMateriaMedica().then(m => { if (live) setMonographs([...m.keys()]) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [bookOpen, monographs, catalog])

  const info = catalog.mmInfo ?? MM_FALLBACK
  const bookLabel = `${info.author.toUpperCase()} ${info.title}`
  const rows = useMemo<ListRow[]>(() => {
    const q = foldText(query.trim())
    const out: ListRow[] = []
    const mmItems = (monographs ?? []).map(id => catalog.remedy(id))
    const hits = q ? filterRemedies(mmItems, query) : [...mmItems].sort((a, b) => a.abbrev.localeCompare(b.abbrev, 'en', { sensitivity: 'base' }))
    const bookHit = !q || foldText(bookLabel).includes(q) || hits.length > 0
    if (!bookHit) return out
    const secOpen = q ? true : ex.open.has('sec:mm')
    out.push({ key: 'sec:mm', depth: 0, label: 'Materia medica', kind: 'section', expandable: true, open: secOpen })
    if (!secOpen) return out
    const showKids = q ? hits.length > 0 && (bookOpen || !foldText(bookLabel).includes(q)) : bookOpen
    out.push({ key: 'book:mm', depth: 1, label: bookLabel, kind: 'book', lang: info.lang, expandable: true, open: showKids })
    if (showKids) for (const r of hits) out.push({ key: `mm:${r.id}`, depth: 2, label: r.abbrev, sub: r.name, kind: 'remedy' })
    return out
  }, [query, ex.open, monographs, catalog, bookOpen, bookLabel, info.lang])

  return (
    <TocList
      view="references" label="Search for a reference:" rows={rows} query={query} setQuery={setQuery}
      footer={failed ? 'The materia medica could not be loaded' : '1 document(s) loaded (1 volumes)'}
      empty={`No document matches “${query.trim()}”`}
      onToggle={(row, want) => ex.toggle(row.key, want)}
      onRefresh={ex.reset}
      onActivate={row => { if (row.kind === 'book') openMM(); else if (row.kind === 'remedy') openMM(Number(row.key.slice(3))) }}
      glyph={row => row.kind === 'book' ? <BookGlyph /> : null}
      menu={row => row.kind === 'book' ? [
        { label: 'Open', run: () => openMM() },
        { label: row.open ? 'Collapse' : 'Show remedies', run: () => ex.toggle(row.key) },
      ] : row.kind === 'remedy' ? [
        { label: 'Open in materia medica', run: () => openMM(Number(row.key.slice(3))) },
        { label: 'Remedy information', run: () => openRemedy(Number(row.key.slice(3))) },
      ] : [{ label: row.open ? 'Collapse' : 'Expand', run: () => ex.toggle(row.key) }]}
    />
  )
}

/* ───────────────────────── Remedies ───────────────────────── */

function RemediesList() {
  const catalog = useCatalog()
  const [query, setQuery] = useState('')
  const all = useMemo(() => [...catalog.remedies.values()], [catalog])
  const rows = useMemo<ListRow[]>(() => filterRemedies(all, query).map(r => ({
    key: `r:${r.id}`, depth: 0, label: r.abbrev, sub: r.name, kind: 'remedy' as const,
  })), [all, query])
  const idOf = (row: ListRow) => Number(row.key.slice(2))
  return (
    <TocList
      view="remedies" label="Look for remedy:" rows={rows} query={query} setQuery={setQuery}
      footer={query.trim() ? `Found ${rows.length} / ${all.length}` : `${all.length} remedies`}
      empty={`No remedy matches “${query.trim()}”`}
      onActivate={row => openRemedy(idOf(row))}
      menu={row => [
        { label: 'Remedy information', run: () => openRemedy(idOf(row)) },
        { label: 'Open in materia medica', run: () => openMM(idOf(row)) },
      ]}
    />
  )
}

/* ───────────────────────── Families ───────────────────────── */

function FamiliesList() {
  const { index, error, loading, retry } = useFamilies()
  const [query, setQuery] = useState('')
  const ex = useExpanded()
  const rows = useMemo<ListRow[]>(() => {
    if (!index) return []
    return visibleRows(index, ex.open, query).map(r => {
      const n = index.get(r.id)!
      return { key: r.id, depth: r.depth, label: n.name, sub: `(${n.remedies.length})`, kind: 'group' as const, expandable: r.hasChildren, open: r.expanded }
    })
  }, [index, ex.open, query])
  return (
    <TocList
      view="families" label="Search for a family:" rows={rows} query={query} setQuery={setQuery}
      footer={error ? 'The families could not be loaded' : loading || !index ? 'Loading families…' : `${index.nodes.length} families`}
      empty={error ? 'The families could not be loaded' : !index ? 'Loading families…' : `No family matches “${query.trim()}”`}
      onToggle={(row, want) => ex.toggle(row.key, want)}
      onRefresh={() => { ex.reset(); if (error) retry() }}
      onActivate={row => openFamilies(row.key)}
      glyph={row => row.depth === 0 ? <TreeGlyph /> : null}
      menu={row => [
        { label: 'Open', run: () => { openFamilies(row.key); focusDocumentWhenReady() } },
        ...(row.expandable ? [{ label: row.open ? 'Collapse' : 'Expand', run: () => ex.toggle(row.key) }] : []),
      ]}
    />
  )
}

/* ───────────────────────── Bookmarks ───────────────────────── */

function BookmarksList() {
  const catalog = useCatalog()
  const bookmarks = useApp(s => s.bookmarks)
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const rows = useMemo<ListRow[]>(() => {
    const q = foldText(query.trim())
    const shown = bookmarks
      .filter(b => !q || foldText(b.label).includes(q) || foldText(b.folder).includes(q))
      .sort((a, b) => a.folder.localeCompare(b.folder) || a.label.localeCompare(b.label))
    const out: ListRow[] = []
    let folder: string | null = null
    for (const b of shown) {
      if (b.folder !== folder) {
        folder = b.folder
        out.push({ key: `f:${folder}`, depth: 0, label: folder || 'Bookmarks', kind: 'folder', expandable: true, open: q !== '' || !closed.has(folder) })
      }
      if (q === '' && closed.has(b.folder)) continue
      const rep = parseRef(b.ref).repertory
      out.push({ key: `b:${b.id}`, depth: 1, label: b.label, sub: catalog.repertoryInfos.find(r => r.abbrev === rep)?.title ?? rep, kind: 'bookmark' })
    }
    return out
  }, [bookmarks, query, closed, catalog])
  const byKey = (row: ListRow) => bookmarks.find(b => `b:${b.id}` === row.key)
  const toggle = (row: ListRow, want?: boolean) => setClosed(prev => {
    const f = row.key.slice(2)
    const isOpen = !prev.has(f)
    const next = want ?? !isOpen
    if (next === isOpen) return prev
    const s = new Set(prev)
    if (next) s.delete(f); else s.add(f)
    return s
  })
  return (
    <TocList
      view="bookmarks" label="Look for bookmark:" rows={rows} query={query} setQuery={setQuery}
      footer={`${bookmarks.length} bookmark(s)`}
      empty={bookmarks.length ? `No bookmark matches “${query.trim()}”` : 'No bookmarks yet: bookmark a rubric from its context menu'}
      onToggle={toggle}
      onRefresh={() => setClosed(new Set())}
      onActivate={(row, { newTab }) => { const b = byKey(row); if (b) void goToRef(b.ref, { newTab }) }}
      glyph={row => row.kind === 'bookmark' ? <BookGlyph /> : null}
      menu={row => {
        const b = byKey(row)
        if (!b) return [{ label: row.open ? 'Collapse' : 'Expand', run: () => toggle(row) }]
        return [
          { label: 'Open', run: () => void goToRef(b.ref) },
          { label: 'Open in new tab', run: () => void goToRef(b.ref, { newTab: true }) },
          { type: 'separator' },
          { label: 'Manage bookmarks…', run: () => actions.openDialog('repertory.bookmarks', { selectId: b.id }) },
          { label: 'Delete bookmark', run: () => actions.removeBookmark(b.id) },
        ]
      }}
    />
  )
}
