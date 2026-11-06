import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useCatalog, useRepertories } from '../../data/CatalogContext'
import { actions, useApp } from '../../state/store'
import { DEFAULT_LAYOUT } from '../../state/workspace'
import type { RepertoryTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { runCommand } from '../../commands/registry'
import { cancelDocumentFocus, focusDocumentWhenReady } from '../../shell/TabHost'
import { familiesIfLoaded, loadFamilies, onFamiliesChanged } from '../families/api'
import { openFamilies } from '../families/ops'
import { closeOverlays } from '../workspace/responsive'
import { goToRef, openRepertory } from './ops'
import { revealAtTop } from './revealTop'
import { selectNavigatorTabId } from './logic'
import { ChapterIcon } from '../toc/chapterIcons'
import { HScrollBar } from '../toc/HScrollBar'
import { noteSameChapterJump } from '../toc/chapterHistory'
import { BookGlyph, CogsGlyph, HelpGlyph, LangFlag, RefreshGlyph, StarGlyph, TreeGlyph } from '../toc/glyphs'
import { buildRows, docLabel, filterDocs, move, pageMove, parentRow, typeahead } from '../toc/model'
import type { Cursor, Move, TocDoc, TocRow } from '../toc/model'
import '../toc/toc.css'

/**
 * The table of contents (RadarOpus "Toc", Cmd+F2): the installed documents as a tree — Repertories
 * (each expands to its chapters as a grid of icon tiles) and Families of remedies — with a filter
 * field on top and the document count at the bottom.
 */

const FAMILIES_DOC = 'editorial'
const FAMILIES_FALLBACK_TITLE = 'Radar Opus editorial remedy classification'

/** Tree rows are 20 px; PageUp/PageDown move by the rows in view less one. */
const ROW_PX = 20
const TYPEAHEAD_MS = 700

let familiesVersion = 0
const subscribeFamilies = (fn: () => void) => onFamiliesChanged(() => { familiesVersion++; fn() })
const getFamiliesVersion = () => familiesVersion

const domId = (key: string, tile?: number) => `toc-${key.replace(/[^\w-]/g, '_')}${tile == null ? '' : `-t${tile}`}`

export function Navigator() {
  const catalog = useCatalog()
  const defaultRep = useApp(s => s.settings.defaultRepertory)
  // the chapter shown in the book the table of contents follows (announced on its tile, not drawn:
  // RadarOpus marks no tile as current)
  const followed = useApp(s => {
    const id = selectNavigatorTabId(s)
    const t = id ? s.tabs.find(x => x.id === id) as RepertoryTab | undefined : undefined
    return t ? `${t.repertory}:${t.rubric}` : ''
  })
  useSyncExternalStore(subscribeFamilies, getFamiliesVersion, getFamiliesVersion)
  const families = familiesIfLoaded()

  // the expanded rows and the checked documents are part of the saved workspace (layout)
  const openKeys = useApp(s => s.layout.tocOpen)
  const open = useMemo<ReadonlySet<string>>(() => new Set(openKeys), [openKeys])
  // checked documents (the checkbox column): "Open checked documents" opens them together
  const checkedKeys = useApp(s => s.layout.tocChecked)
  const checked = useMemo<ReadonlySet<string>>(() => new Set(checkedKeys), [checkedKeys])
  const toggleCheck = useCallback((key: string) => {
    const prev = useApp.getState().layout.tocChecked
    actions.setLayout({ tocChecked: prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key] })
  }, [])
  const [query, setQuery] = useState('')
  // the cursor starts on the default repertory, as in RadarOpus
  const [cursor, setCursor] = useState<Cursor>(() => ({ key: `rep:${defaultRep}`, tile: 0 }))
  const rootRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const cm = useContextMenu()

  const reps = useMemo<TocDoc[]>(() => catalog.repertoryInfos.map(r => ({
    key: `rep:${r.abbrev}`, kind: 'rep', id: r.abbrev, label: docLabel(r.author, r.title), lang: r.lang, extra: `${r.fullTitle} ${r.abbrev}`,
  })), [catalog])
  const fams = useMemo<TocDoc[]>(() => [{
    key: `fam:${FAMILIES_DOC}`, kind: 'fam', id: FAMILIES_DOC, label: families?.source.title ?? FAMILIES_FALLBACK_TITLE, lang: 'en', extra: 'families kingdoms',
  }], [families])
  const shownReps = useMemo(() => filterDocs(reps, query), [reps, query])
  const shownFams = useMemo(() => filterDocs(fams, query), [fams, query])

  // the books of expanded repertories load on demand
  const openReps = useMemo(() => reps.filter(d => open.has(d.key)).map(d => d.id), [reps, open])
  const loads = useRepertories(openReps)
  const famOpen = open.has(`fam:${FAMILIES_DOC}`)
  useEffect(() => { if (famOpen && !familiesIfLoaded()) void loadFamilies().catch(() => { /* shown as a note */ }) }, [famOpen])

  const rows = useMemo(() => buildRows({
    reps: shownReps, fams: shownFams, open, filtering: query.trim() !== '',
    chapterCount: a => (loads.failed.includes(a) ? null : catalog.repertory(a)?.chapters.length),
    groups: () => families?.roots.map(id => ({ id, label: families.byId.get(id)?.name ?? id })),
  }), [shownReps, shownFams, open, query, loads, catalog, families])

  // aria-posinset / aria-setsize: position among the rows of the same parent
  const position = useMemo(() => {
    const m = new Map<string, { pos: number; size: number }>()
    const groups = new Map<string, string[]>()
    rows.forEach((r, k) => {
      if (r.kind === 'grid' || r.kind === 'note') return
      const p = parentRow(rows, k)
      const g = p < 0 ? '' : rows[p].key
      groups.set(g, [...(groups.get(g) ?? []), r.key])
    })
    for (const keys of groups.values()) keys.forEach((k, x) => m.set(k, { pos: x + 1, size: keys.length }))
    return m
  }, [rows])

  // the cursor stays on a row that exists (a collapsed or filtered row hands it to the first row)
  const cur: Cursor = rows.some(r => r.key === cursor.key) ? cursor : { key: (rows.find(r => r.kind === 'doc') ?? rows[0])?.key ?? '', tile: 0 }
  const curRow = rows.find(r => r.key === cur.key)
  const activeId = curRow ? domId(cur.key, curRow.kind === 'grid' ? Math.min(cur.tile, curRow.count - 1) : undefined) : undefined

  useLayoutEffect(() => {
    // vertically the cursor row is kept in view. Sideways a row keeps its left edge (long labels
    // overflow to the right with the cursor on them, as in RadarOpus); a chapter tile under the cursor,
    // with its focus ring RING px outside it, is scrolled into view when the panel is narrower than the grid
    const tree = treeRef.current, el = activeId ? document.getElementById(activeId) : null
    if (!tree || !el) return
    const t = tree.getBoundingClientRect(), r = el.getBoundingClientRect()
    if (r.top < t.top) tree.scrollTop += r.top - t.top
    else if (r.bottom > t.bottom) tree.scrollTop += Math.min(r.top - t.top, r.bottom - t.bottom)
    const RING = 4
    if (!el.closest('.toc-grid')) { tree.scrollLeft = 0; return }
    const left = r.left - RING - t.left, right = r.right + RING - (t.left + tree.clientWidth)
    if (left < 0) tree.scrollLeft += left
    else if (right > 0) tree.scrollLeft += Math.min(left, right)
  }, [activeId])

  const toggle = useCallback((key: string, want?: boolean) => {
    const prev = useApp.getState().layout.tocOpen
    const isOpen = prev.includes(key)
    const next = want ?? !isOpen
    if (next === isOpen) return
    actions.setLayout({ tocOpen: next ? [...prev, key] : prev.filter(k => k !== key) })
  }, [])

  // hiding the panel (Cmd+F2) with the focus in it hands the focus to the active document
  useLayoutEffect(() => {
    const root = rootRef.current
    return () => { if (root?.contains(document.activeElement)) focusDocumentWhenReady() }
  }, [])

  /**
   * Moves the keyboard focus from the tree to the active document once it is ready. The tree keeps
   * the focus until then (no moment without a focused element); using the panel meanwhile (a click,
   * a key) cancels the hand-over so it never takes the focus back from the reader. In narrow mode
   * the panel floats over the document behind a scrim: opening a document closes it, so the focus
   * never lands in a book the reader cannot see.
   */
  const toDocument = () => {
    if (document.documentElement.dataset.narrow === 'true') closeOverlays()
    focusDocumentWhenReady()
  }
  const chapterOf = (abbrev: string, tile: number) => catalog.repertory(abbrev)?.chapters[tile]
  const openChapter = (abbrev: string, tile: number, newTab = false) => {
    const c = chapterOf(abbrev, tile)
    if (c == null) return
    const ref = `${abbrev}:${c}`
    // a book in a background tab is not on screen (no view takes the reveal, its page cannot be
    // measured): bring that tab to the front first, so the tile lands exactly as in the active tab
    if (!newTab) {
      const s = useApp.getState()
      const active = s.tabs.find(t => t.id === s.activeTabId)
      const other = active?.kind === 'repertory' && active.repertory === abbrev ? null : s.tabs.find(t => t.kind === 'repertory' && t.repertory === abbrev)
      if (other) flushSync(() => actions.activateTab(other.id))
    }
    // a tile for the chapter already shown is a history step only when it moves the page
    const commit = newTab ? null : sameChapterJump(abbrev, c)
    void goToRef(ref, { newTab }).then(toDocument)
    // the chapter heading always comes to the top of column 1, also when that chapter is already
    // the selected rubric and the reader has wheeled it out of view
    if (!newTab) revealAtTop(ref)
    commit?.()
  }
  /** The tab goToRef will navigate, when it already shows the chapter: chapterHistory records the page it leaves. */
  const sameChapterJump = (abbrev: string, chapter: number) => {
    const s = useApp.getState()
    const active = s.tabs.find(t => t.id === s.activeTabId)
    const tab = (active?.kind === 'repertory' && active.repertory === abbrev ? active : s.tabs.find(t => t.kind === 'repertory' && t.repertory === abbrev)) as RepertoryTab | undefined
    return tab ? noteSameChapterJump(tab, chapter) : null
  }
  /**
   * Refresh (the first header button): clears the filter, collapses the tree back to its two
   * sections and puts the cursor on the default repertory at the top. A book that failed to load is
   * tried again the next time it is expanded.
   */
  const refresh = () => {
    setQuery('')
    actions.setLayout({ tocOpen: [...DEFAULT_LAYOUT.tocOpen] })
    setCursor({ key: `rep:${defaultRep}`, tile: 0 })
    if (treeRef.current) { treeRef.current.scrollTop = 0; treeRef.current.scrollLeft = 0 }
    loads.retry()
    focusTree()
  }
  const openDoc = (doc: TocDoc) => {
    if (doc.kind === 'rep') void openRepertory(doc.id).then(toDocument)
    else { openFamilies(); toDocument() }
  }
  const allDocs = [...reps, ...fams]
  const checkedDocs = allDocs.filter(d => checked.has(d.key))
  const openChecked = () => {
    for (const d of checkedDocs) {
      if (d.kind === 'rep') void openRepertory(d.id)
      else openFamilies()
    }
    toDocument()
  }
  const checkedItems = (): MenuItem[] => [
    { type: 'separator' },
    { label: checkedDocs.length ? `Open checked documents (${checkedDocs.length})` : 'Open checked documents', disabled: !checkedDocs.length, run: openChecked },
    { label: 'Uncheck all', disabled: !checkedDocs.length, run: () => actions.setLayout({ tocChecked: [] }) },
  ]

  /** Return / Space / double-click on a row. */
  const activate = (row: TocRow, tile: number) => {
    if (row.kind === 'section') toggle(row.key)
    else if (row.kind === 'doc') openDoc(row.doc)
    else if (row.kind === 'grid') openChapter(row.doc.id, tile)
    else if (row.kind === 'group') { openFamilies(row.id); toDocument() }
  }

  const menuFor = (row: TocRow, tile: number): MenuItem[] => {
    if (row.kind === 'doc' && row.doc.kind === 'rep') {
      const a = row.doc.id
      return [
        { label: 'Open', run: () => openDoc(row.doc) },
        { label: 'Open in new tab', run: () => void goToRef(`${a}:0`, { newTab: true }) },
        { type: 'separator' },
        { label: row.open ? 'Collapse' : 'Show chapters', run: () => toggle(row.key) },
        { label: checked.has(row.key) ? 'Uncheck' : 'Check', run: () => toggleCheck(row.key) },
        { label: 'Set as default repertory', disabled: a === defaultRep, run: () => actions.setSettings({ defaultRepertory: a }) },
        { label: 'Repertory information', run: () => actions.openTab({ kind: 'repertories', selected: a }) },
        ...checkedItems(),
      ]
    }
    if (row.kind === 'grid') {
      const a = row.doc.id, c = chapterOf(a, tile)
      return [
        { label: 'Open chapter', run: () => openChapter(a, tile) },
        { label: 'Open in new tab', run: () => openChapter(a, tile, true) },
        { type: 'separator' },
        { label: 'Find in chapter…', disabled: c == null, run: () => actions.openDialog('repertory.find', { repertory: a, from: c }) },
      ]
    }
    if (row.kind === 'doc') return [
      { label: 'Open', run: () => openDoc(row.doc) },
      { label: row.open ? 'Collapse' : 'Expand', run: () => toggle(row.key) },
      { label: checked.has(row.key) ? 'Uncheck' : 'Check', run: () => toggleCheck(row.key) },
      ...checkedItems(),
    ]
    if (row.kind === 'group') return [{ label: 'Open', run: () => activate(row, 0) }]
    if (row.kind === 'section') return [{ label: row.open ? 'Collapse' : 'Expand', run: () => toggle(row.key) }]
    return []
  }

  const showMenu = (row: TocRow, tile: number, e?: ReactMouseEvent) => {
    const items = menuFor(row, tile)
    if (!items.length) return
    if (e) { cm.open(e, items); return }
    const el = document.getElementById(domId(row.key, row.kind === 'grid' ? tile : undefined))
    if (el) cm.openAt(el, items)
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.target !== treeRef.current || !curRow) return
    const tile = curRow.kind === 'grid' ? Math.min(cur.tile, curRow.count - 1) : 0
    const keyMove: Record<string, Move> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end' }
    const plain = !e.altKey && !e.metaKey && !e.ctrlKey
    let handled = true
    if (keyMove[e.key] && plain) {
      const m = move(rows, cur, keyMove[e.key])
      if (m && 'toggle' in m) toggle(m.toggle, m.open)
      else if (m) setCursor(m)
    } else if ((e.key === 'PageDown' || e.key === 'PageUp') && plain) {
      const n = Math.max(1, Math.floor((treeRef.current?.clientHeight ?? ROW_PX) / ROW_PX) - 1)
      const m = pageMove(rows, cur, e.key === 'PageDown' ? 'down' : 'up', n)
      if (m) setCursor(m)
    } else if (e.key === ' ' && e.shiftKey && plain && curRow.kind === 'doc') toggleCheck(curRow.key)
    else if ((e.key === 'Enter' || e.key === ' ') && plain) activate(curRow, tile)
    else if (e.key.length === 1 && e.key !== ' ' && e.key !== '*' && plain) {
      // type-ahead: letters typed in quick succession find a row by its first letters
      const now = e.timeStamp
      const t = typed.current
      t.text = now - t.at < TYPEAHEAD_MS ? t.text + e.key : e.key
      t.at = now
      const m = typeahead(rows, cur, t.text) ?? (t.text.length > 1 ? typeahead(rows, cur, e.key) : null)
      if (m) setCursor(m)
    }
    else if (e.key === '*' && curRow.kind === 'section') {
      const prev = useApp.getState().layout.tocOpen
      actions.setLayout({ tocOpen: [...new Set([...prev, curRow.key, ...rows.filter(r => r.kind === 'doc').map(r => r.key)])] })
    }
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) showMenu(curRow, tile)
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const focusTree = () => treeRef.current?.focus({ preventScroll: true })
  const pick = (key: string, tile = 0) => { setCursor({ key, tile }); focusTree() }

  const docCount = allDocs.length
  const menuOpen = cm.element != null

  return (
    <div className="toc" ref={rootRef} onPointerDownCapture={cancelDocumentFocus} onKeyDownCapture={cancelDocumentFocus}>
      <div className="toc-head">
        <label className="toc-search-label" htmlFor="toc-search">Search for a repertory:</label>
        <input
          id="toc-search" className="toc-search" type="search" placeholder="Search for a repertory" spellCheck={false} autoComplete="off" value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
            else if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault()
              const first = rows.find(r => r.kind === 'doc')
              if (first) setCursor({ key: first.key, tile: 0 })
              focusTree()
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
        className="toc-tree" ref={treeRef} tabIndex={0} role="tree" aria-label="Table of contents"
        aria-activedescendant={activeId} onKeyDown={onKeyDown}
        onWheel={e => { if (e.deltaX) e.currentTarget.scrollLeft += e.deltaX }}
      >
        {rows.length === 0 && <div className="toc-empty">No document matches “{query.trim()}”</div>}
        {rows.map(row => {
          const isCur = row.key === cur.key
          if (row.kind === 'grid') {
            const rep = catalog.repertory(row.doc.id)
            if (!rep) return null
            return (
              // the whole grid is one item of the tree: the cursor outlines the block (RadarOpus), and
              // the tile under the cursor gets a ring while the tree has the keyboard focus
              <div key={row.key} role="group" aria-label={`${row.doc.label} chapters`} className={`toc-grid${isCur ? ' cursor' : ''}`}>
                {rep.chapters.map((c, t) => {
                  const name = rep.text(c)
                  const active = isCur && t === Math.min(cur.tile, row.count - 1)
                  const current = followed === `${row.doc.id}:${c}`
                  return (
                    <div
                      key={c} id={domId(row.key, t)} role="treeitem" aria-level={3} aria-posinset={t + 1} aria-setsize={row.count}
                      aria-selected={active} aria-label={name} title={name}
                      aria-current={current ? 'page' : undefined}
                      className={`toc-tile${active ? ' cursor' : ''}${active && menuOpen ? ' menu-target' : ''}`}
                      onClick={() => { setCursor({ key: row.key, tile: t }); openChapter(row.doc.id, t) }}
                      onContextMenu={e => { pick(row.key, t); showMenu(row, t, e) }}
                    >
                      <ChapterIcon name={name} size={32} />
                    </div>
                  )
                })}
              </div>
            )
          }
          if (row.kind === 'note') return <div key={row.key} className="toc-note" role="none">{row.label}</div>
          const expandable = row.kind === 'section' || row.kind === 'doc'
          const isOpen = expandable && row.open
          return (
            <div
              key={row.key} id={domId(row.key)} role="treeitem" aria-level={row.depth + 1}
              aria-posinset={position.get(row.key)?.pos} aria-setsize={position.get(row.key)?.size}
              aria-expanded={expandable ? isOpen : undefined} aria-selected={isCur}
              aria-checked={row.kind === 'doc' ? checked.has(row.key) : undefined}
              className={`toc-row toc-${row.kind}${isCur ? ' cursor' : ''}${isCur && menuOpen ? ' menu-target' : ''}`}
              onClick={e => {
                pick(row.key)
                if (row.kind === 'section' || (e.target as HTMLElement).closest('.toc-twist')) { if (expandable) toggle(row.key) }
                else if (row.kind === 'group') activate(row, 0)
              }}
              onDoubleClick={e => { if (row.kind === 'doc' && !(e.target as HTMLElement).closest('.toc-twist')) openDoc(row.doc) }}
              onContextMenu={e => { pick(row.key); showMenu(row, 0, e) }}
            >
              {row.kind === 'doc' && (
                <span
                  className={`toc-check${checked.has(row.key) ? ' on' : ''}`} aria-hidden="true" title="Check (Shift+Space)"
                  onClick={e => { e.stopPropagation(); setCursor({ key: row.key, tile: 0 }); focusTree(); toggleCheck(row.key) }}
                  onDoubleClick={e => e.stopPropagation()}
                />
              )}
              {expandable ? <span className={`toc-twist${isOpen ? ' open' : ''}`} aria-hidden="true" /> : <span className="toc-twist-gap" aria-hidden="true" />}
              {row.kind === 'section' && <span className="toc-label">{row.label}</span>}
              {row.kind === 'doc' && (
                <>
                  {row.doc.kind === 'rep' && row.doc.id === defaultRep && <span className="toc-default" title="Default repertory"><StarGlyph /></span>}
                  {row.doc.kind === 'rep' ? <BookGlyph /> : <TreeGlyph />}
                  <LangFlag lang={row.doc.lang} />
                  <span className="toc-label">{row.doc.label}</span>
                </>
              )}
              {row.kind === 'group' && <span className="toc-label">{row.label}</span>}
            </div>
          )
        })}
      </div>
      <div className="toc-foot" role="status">{docCount} document(s) loaded ({docCount} volumes)</div>
      {/* the horizontal scrollbar under the footer scrolls the tree (whose own overflow-x is hidden) */}
      <HScrollBar target={treeRef} deps={rows} />
      {cm.element}
    </div>
  )
}
