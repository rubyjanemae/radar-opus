import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react'
import { ArrowLeft, ArrowRight, BookText, ChevronDown, ChevronUp, FlaskConical, ListTree, Minus, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Printer, RotateCw, Search, Tags, X } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { getCommand, runCommand } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import type { MateriaMedicaTab } from '../../state/workspace'
import { MenuList, useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { Splitter } from '../../ui/Splitter'
import { useFixedVirtual } from '../repertory/virtual'
import { openRemedySearch, openSearch } from '../search/ops'
import { filterItems, useBook } from './book'
import type { MMBook } from './book'
import type { RemedyLinkHandlers } from './components'
import { HIT_ROW, MMListPane, ROW } from './MMListPane'
import { MMReaderPane } from './MMReaderPane'
import { focusIsBusy, historyMove, keepMMFocus, navigateMM, openRemedy, printMonograph, setListHidden, toggleList, toggleShowAbbrevs, useMMUi } from './ops'
import { useMMKeyboard } from './useMMKeyboard'
import { useWidth } from './useWidth'
import { queryTerms, searchDocs } from './text'
import type { MMHit } from './text'
import './mm.css'

const NO_TERMS: string[] = []
const SIDE_KEY = 'radar-opus:mm-side'
/** Narrowest remedy list, and the width the reader keeps before the list gives way (about 45 characters). */
const SIDE_MIN = 168
const READER_MIN = 380
/** Below these view widths the toolbar moves zoom, abbreviations, info and print into "More", then drops the Sections label. */
const COMPACT_TOOLBAR = 700
const TINY_TOOLBAR = 620

function readSideWidth(): number {
  try { const v = Number(localStorage.getItem(SIDE_KEY)); return v >= 200 && v <= 520 ? v : 280 } catch { return 280 }
}

const queryTermsOf = (q: string) => queryTerms(q).join(' ')
/** Section-jump requests carry a sequence number so repeating the same jump still fires. */
let jumpSeq = 0
const nextJump = () => ++jumpSeq

export function MateriaMedicaView({ tab }: { tab: MateriaMedicaTab }) {
  const catalog = useCatalog()
  const { book, error, retry } = useBook(catalog)
  if (error) {
    return (
      <div className="error-state mm-error">
        <h3>The materia medica could not be loaded</h3>
        <pre>{error.message}</pre>
        <button className="btn" onClick={retry}><RotateCw size={14} /> Try again</button>
      </div>
    )
  }
  if (!book) return <MMSkeleton />
  return <Reader tab={tab} book={book} />
}

function MMSkeleton() {
  return (
    <div className="mm-view" aria-busy="true" aria-label="Loading materia medica">
      <div className="mm-toolbar"><div className="skeleton" style={{ width: 220, height: 14 }} /></div>
      <div className="mm-body">
        <aside className="mm-side" style={{ width: 280 }}>
          {Array.from({ length: 14 }, (_, i) => <div key={i} className="skeleton" style={{ height: 12, margin: '9px 12px', width: `${50 + ((i * 37) % 45)}%` }} />)}
        </aside>
        <section className="mm-reader" aria-label="Monograph" aria-busy="true"><div className="mm-page">
          <div className="skeleton" style={{ height: 26, width: '45%', marginBottom: 16 }} />
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 12, margin: '10px 0', width: `${70 + ((i * 29) % 30)}%` }} />)}
        </div></section>
      </div>
    </div>
  )
}

type PendingMark = { kind: 'first' } | { kind: 'last' } | { kind: 'section'; section: number } | null

/**
 * The materia medica reader: owns the view state (selection, full-text query, in-page marks,
 * scroll spy) and the toolbar; the list pane, the reading pane and the keyboard map are separate.
 */
function Reader({ tab, book }: { tab: MateriaMedicaTab; book: MMBook }) {
  const catalog = book.catalog
  const fontScale = useApp(s => s.settings.fontScale)
  const history = useMMUi(s => s.history[tab.id])
  const jump = useMMUi(s => s.jump)
  const focusSearchNonce = useMMUi(s => s.focusSearch)
  const showAbbrevs = useMMUi(s => s.showAbbrevs)
  const listHidden = useMMUi(s => s.listHidden)
  const cm = useContextMenu()

  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const hitsRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const sectionsBtn = useRef<HTMLButtonElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const azRef = useRef<HTMLElement>(null)
  const [viewWidth, viewWidthRef] = useWidth(rootRef)
  const compact = viewWidth > 0 && viewWidth < COMPACT_TOOLBAR
  const tiny = viewWidth > 0 && viewWidth < TINY_TOOLBAR

  const [sideWidth, setSideWidth] = useState(readSideWidth)
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState(tab.query)
  const [dq, setDq] = useState(tab.query)
  const [sideMode, setSideMode] = useState<'list' | 'results'>(tab.query ? 'results' : 'list')
  const [markIndex, setMarkIndex] = useState(-1)
  const [hitSel, setHitSel] = useState(-1)
  const [markSection, setMarkSection] = useState<number | null>(null)
  const [markCount, setMarkCount] = useState(0)
  const [activeSection, setActiveSection] = useState(-1)
  const [sectionsMenu, setSectionsMenu] = useState<{ x: number; y: number } | null>(null)
  const pendingMark = useRef<PendingMark>(null)
  /** Enter pressed before the debounced query caught up: step once the new results are in. */
  const pendingStep = useRef<1 | -1 | null>(null)

  useEffect(() => { try { localStorage.setItem(SIDE_KEY, String(sideWidth)) } catch { /* private mode */ } }, [sideWidth])

  // debounce the full-text query and remember it in the tab
  useEffect(() => {
    if (q === dq) return
    const t = setTimeout(() => setDq(q), q.length < dq.length ? 120 : 200)
    return () => clearTimeout(t)
  }, [q, dq])
  useEffect(() => {
    if (dq !== tab.query) actions.updateTab<MateriaMedicaTab>(tab.id, { query: dq })
    if (dq.trim()) { setSideMode('results'); if (useMMUi.getState().listHidden) setListHidden(false) }
  }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps

  const shownId = useDeferredValue(tab.remedyId)
  const results = useMemo(() => searchDocs(book.docs, dq), [book, dq])
  useEffect(() => { setHitSel(-1) }, [results])
  const terms = results.terms
  const hitRemedies = useMemo(() => [...new Set(results.hits.map(h => h.remedyId))], [results])
  /** Sections of the open monograph that are hits: only these are highlighted and stepped through. */
  const hitSections = useMemo(() => new Set(results.hits.filter(h => h.remedyId === shownId).map(h => h.section)), [results, shownId])
  const termsFor = useCallback((section: number) => (hitSections.has(section) ? terms : NO_TERMS), [hitSections, terms])
  const bookOrder = useMemo(() => new Map(book.items.map((it, i) => [it.remedyId, i])), [book])

  // take keyboard focus when the view opens, unless the user is typing somewhere
  useEffect(() => {
    const take = () => { if (!focusIsBusy(rootRef.current)) (listRef.current ?? readerRef.current)?.focus({ preventScroll: true }) }
    take()
    // a click on the tab strip activates on mousedown and focuses the tab afterwards: take it back
    const raf = requestAnimationFrame(take)
    return () => cancelAnimationFrame(raf)
  }, [tab.id])

  // external requests to focus the search box (mm.search command)
  useEffect(() => {
    if (!focusSearchNonce) return
    searchRef.current?.focus()
    searchRef.current?.select()
  }, [focusSearchNonce])

  const items = useMemo(() => filterItems(book.items, filter), [book, filter])
  const selectedIndex = useMemo(() => items.findIndex(it => it.remedyId === tab.remedyId), [items, tab.remedyId])
  /**
   * The monograph shown lags the selection: moving through the list updates the selection at once and
   * renders the new monograph as a transition, keeping the previous one on screen until it is ready.
   */
  const entry = shownId != null ? book.entries.get(shownId) ?? null : null
  const remedy = useMemo(() => (shownId != null ? catalog.remedy(shownId) : null), [catalog, shownId])

  const list = useFixedVirtual(listRef, items.length, ROW)
  const hitsV = useFixedVirtual(hitsRef, results.hits.length, HIT_ROW)

  const go = useCallback((remedyId: number, section: number | null = null) => {
    const t = useApp.getState().tabs.find(x => x.id === tab.id) as MateriaMedicaTab | undefined
    if (t) navigateMM(t, remedyId, section)
  }, [tab.id])

  // keep the selected remedy visible in the list
  useEffect(() => { if (sideMode === 'list' && selectedIndex >= 0) list.scrollToIndex(selectedIndex) }, [selectedIndex]) // eslint-disable-line react-hooks/exhaustive-deps
  // the list is re-created when its side tab comes back: centre the selection in it
  useEffect(() => { if (sideMode === 'list' && selectedIndex >= 0) list.scrollToIndex(selectedIndex, 'center') }, [sideMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // scroll requests (section jumps, new remedy → top)
  useLayoutEffect(() => {
    const el = readerRef.current
    if (!el || !jump || jump.remedyId !== shownId) return
    let section = jump.section
    if (typeof section === 'string') {
      const name = section.toLowerCase()
      section = entry?.sections.findIndex(s => s.heading.toLowerCase() === name) ?? -1
      if (section < 0) section = -2
    }
    if (section === -2) el.scrollTop = 0
    else {
      const target = el.querySelector<HTMLElement>(`[data-sec="${section}"]`)
      if (target) el.scrollTop = target.offsetTop - 12
    }
  }, [jump, shownId]) // eslint-disable-line react-hooks/exhaustive-deps

  // collect in-page marks after each render of the page / query
  const collectMarks = useCallback(() => [...(readerRef.current?.querySelectorAll<HTMLElement>('mark.mm-hit') ?? [])], [])
  useLayoutEffect(() => {
    const marks = collectMarks()
    setMarkCount(marks.length)
    const p = pendingMark.current
    pendingMark.current = null
    let idx = -1
    if (p && marks.length) {
      if (p.kind === 'first') idx = 0
      else if (p.kind === 'last') idx = marks.length - 1
      else {
        const sec = readerRef.current?.querySelector(`[data-sec="${p.section}"]`)
        idx = Math.max(0, marks.findIndex(m => sec?.contains(m)))
      }
    }
    setMarkIndex(idx)
  }, [shownId, dq, collectMarks])

  useLayoutEffect(() => {
    const marks = collectMarks()
    marks.forEach((m, i) => m.classList.toggle('current', i === markIndex))
    const m = marks[markIndex]
    const secEl = m?.closest<HTMLElement>('[data-sec]')
    setMarkSection(secEl ? Number(secEl.dataset.sec) : null)
    const el = readerRef.current
    if (m && el) {
      const r = m.getBoundingClientRect(), box = el.getBoundingClientRect()
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) el.scrollTop += r.top - box.top - el.clientHeight / 3
    }
  }, [markIndex, markCount, collectMarks])

  const step = useCallback((dir: 1 | -1) => {
    if (!terms.length) { searchRef.current?.focus(); return }
    const marks = collectMarks()
    const ni = markIndex + dir
    if (marks.length && ni >= 0 && ni < marks.length) { setMarkIndex(ni); return }
    if (!hitRemedies.length) { actions.toast(`No matches for “${dq.trim()}”`, 'info'); return }
    const cur = tab.remedyId != null ? bookOrder.get(tab.remedyId) ?? -1 : -1
    let target: number | undefined
    if (dir > 0) target = hitRemedies.find(id => (bookOrder.get(id) ?? 0) > cur) ?? hitRemedies[0]
    else target = [...hitRemedies].reverse().find(id => (bookOrder.get(id) ?? 0) < cur) ?? hitRemedies[hitRemedies.length - 1]
    if (target === tab.remedyId) { setMarkIndex(dir > 0 ? 0 : marks.length - 1); return }
    pendingMark.current = dir > 0 ? { kind: 'first' } : { kind: 'last' }
    go(target)
    const hi = dir > 0 ? results.hits.findIndex(h => h.remedyId === target) : results.hits.findLastIndex(h => h.remedyId === target)
    if (hi >= 0) { hitsV.scrollToIndex(hi); setHitSel(hi) }
  }, [terms, collectMarks, markIndex, hitRemedies, dq, tab.remedyId, bookOrder, go, results, hitsV])

  useEffect(() => {
    const d = pendingStep.current
    if (d === null || results.terms.join(' ') !== queryTermsOf(dq)) return
    pendingStep.current = null
    step(d)
  }, [results]) // eslint-disable-line react-hooks/exhaustive-deps

  const openHit = useCallback((h: MMHit, index: number) => {
    setHitSel(index)
    pendingMark.current = { kind: 'section', section: h.section }
    if (h.remedyId === tab.remedyId) {
      // same page: marks are already rendered
      const marks = collectMarks()
      const sec = readerRef.current?.querySelector(`[data-sec="${h.section}"]`)
      const idx = marks.findIndex(m => sec?.contains(m))
      pendingMark.current = null
      if (idx >= 0) setMarkIndex(idx)
      else useMMUi.setState({ jump: { remedyId: h.remedyId, section: h.section, nonce: nextJump() } })
      return
    }
    go(h.remedyId, h.section)
  }, [tab.remedyId, collectMarks, go])

  // scroll spy for the outline
  const onReaderScroll = useCallback(() => {
    const el = readerRef.current
    if (!el) return
    const secs = el.querySelectorAll<HTMLElement>('[data-sec]')
    let cur = -1
    for (const s of secs) { if (s.offsetTop - 24 <= el.scrollTop) cur = Number(s.dataset.sec); else break }
    setActiveSection(cur)
  }, [])
  useEffect(() => { setActiveSection(-1) }, [shownId])
  // the monograph is rendered after the selection (deferred): a focused link on the page it replaced is
  // gone by then (and keepMMFocus has already run), so focus falls back to the reader, not the document
  const focusInReader = useRef(false)
  useEffect(() => {
    const el = readerRef.current
    if (!el) return
    const onIn = () => { focusInReader.current = true }
    // a focused node that is removed blurs with no related target: that is not the user leaving
    const onOut = (e: FocusEvent) => { if (e.relatedTarget && !el.contains(e.relatedTarget as Node)) focusInReader.current = false }
    el.addEventListener('focusin', onIn)
    el.addEventListener('focusout', onOut)
    return () => { el.removeEventListener('focusin', onIn); el.removeEventListener('focusout', onOut) }
  }, [])
  useLayoutEffect(() => {
    const el = readerRef.current
    if (el && focusInReader.current && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
  }, [shownId])

  const scrollToSection = useCallback((i: number) => {
    if (shownId != null) useMMUi.setState({ jump: { remedyId: shownId, section: i, nonce: nextJump() } })
  }, [shownId])

  const remedyMenu = (rid: number): MenuItem[] => {
    const r = catalog.remedy(rid)
    return [
      { type: 'label', label: `${r.abbrev} · ${r.name}` },
      { label: 'Show in materia medica', run: () => go(rid), disabled: !book.has(rid) || rid === tab.remedyId },
      { label: 'Remedy information', run: () => openRemedy(rid) },
      { label: 'Find rubrics with this remedy', run: () => openRemedySearch(rid, { newTab: true }), disabled: !getCommand('search.remedy') },
      { type: 'separator' },
      { label: 'Copy remedy name', run: () => { void navigator.clipboard?.writeText(`${r.name} (${r.abbrev})`); actions.toast('Copied remedy name', 'success') } },
    ]
  }

  const links: RemedyLinkHandlers = useMemo(() => ({
    onRemedy: (rid: number, e: MouseEvent) => {
      if (e.shiftKey || !book.has(rid)) openRemedy(rid)
      else go(rid)
    },
    onRemedyMenu: (rid: number, e: MouseEvent) => latest.current.openRemedyMenu(e, rid),
  }), [book, go])

  const sectionItems: MenuItem[] = entry ? [
    { label: 'Introduction', run: () => scrollToSection(-1), checked: activeSection === -1 },
    ...entry.sections.map((s, i) => ({ label: s.heading, run: () => scrollToSection(i), checked: activeSection === i })),
  ] : []

  const openSections = () => {
    const b = sectionsBtn.current?.getBoundingClientRect()
    if (b && entry) setSectionsMenu({ x: b.left, y: b.bottom + 2 })
  }

  const letters = useMemo(() => {
    const first = new Map<string, number>()
    items.forEach((it, i) => { if (!first.has(it.letter)) first.set(it.letter, i) })
    return first
  }, [items])

  /** The list gives way before the reader drops under a readable measure. */
  const sideW = viewWidth > 0 ? Math.max(SIDE_MIN, Math.min(sideWidth, viewWidth - READER_MIN)) : sideWidth
  const sideMax = viewWidth > 0 ? Math.max(SIDE_MIN, Math.min(520, viewWidth - READER_MIN)) : 520

  /** Scroll so the item is the top row and select it (A–Z index, type-ahead). */
  const jumpTo = (i: number) => {
    if (i < 0 || i >= items.length) return
    if (listRef.current) listRef.current.scrollTop = i * ROW
    if (items[i].remedyId !== tab.remedyId) go(items[i].remedyId)
    listRef.current?.focus({ preventScroll: true })
  }

  const onFilterKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && items.length) { e.preventDefault(); go(filter.trim() ? items[0].remedyId : items[Math.max(0, selectedIndex)].remedyId); listRef.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (selectedIndex < 0 && items.length) go(items[0].remedyId); listRef.current?.focus() }
    else if (e.key === 'Escape' && filter) { e.preventDefault(); e.stopPropagation(); setFilter('') }
  }

  const moreItems: MenuItem[] = [
    { label: 'Larger text', keys: 'Ctrl+=', run: () => runCommand('view.zoomIn') },
    { label: 'Smaller text', keys: 'Ctrl+-', run: () => runCommand('view.zoomOut') },
    { label: 'Show remedy abbreviations', keys: 'Space', checked: showAbbrevs, run: toggleShowAbbrevs },
    { type: 'separator' },
    { label: 'Remedy information', keys: 'I', disabled: tab.remedyId == null, run: () => { if (tab.remedyId != null) openRemedy(tab.remedyId) } },
    { label: 'Print monograph…', keys: 'Ctrl+P', disabled: !entry, run: () => { if (tab.remedyId != null) void printMonograph(tab.remedyId) } },
  ]

  /** Context menu on selected monograph text: look the words up in the repertory. */
  const selectionMenu = (text: string): MenuItem[] => {
    const q = text.replace(/\s+/g, ' ').trim()
    const short = q.length > 40 ? `${q.slice(0, 38)}…` : q
    return [
      { label: `Search repertory for “${short}”`, run: () => openSearch(q, { newTab: true }), disabled: !getCommand('search.open') },
      { label: `Search materia medica for “${short}”`, run: () => { setQ(q); setDq(q); searchRef.current?.focus() } },
      { type: 'separator' },
      { label: 'Copy', keys: 'Ctrl+C', run: () => { void navigator.clipboard?.writeText(q); actions.toast('Copied', 'success') } },
    ]
  }
  const readerSelection = (): string => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !readerRef.current?.contains(sel.anchorNode)) return ''
    return sel.toString().trim()
  }

  const keys = useMMKeyboard({
    remedyId: tab.remedyId,
    hasEntry: !!entry,
    items,
    selectedIndex,
    letters,
    hits: results.hits,
    hitSel,
    markSection,
    sideMode,
    hasTerms: terms.length > 0,
    pageSize: list.pageSize,
    refs: { list: listRef, reader: readerRef, search: searchRef, az: azRef, hits: hitsV },
    go: rid => go(rid),
    step,
    openHit,
    openSections,
    jumpTo,
    openRemedyMenu: (anchor, rid) => cm.openAt(anchor, remedyMenu(rid)),
    openSelectionMenu: () => {
      const text = readerSelection()
      if (!text) return false
      const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
      cm.open({ clientX: r.left, clientY: r.bottom, preventDefault: () => {} }, selectionMenu(text))
      return true
    },
  })

  /**
   * Latest-value handlers for the memoised panes: their callbacks stay the same across renders (so a
   * selection change does not re-render the monograph) while still reaching the current menus.
   */
  const latest = useRef({
    openRemedyMenu: (e: MouseEvent, rid: number) => cm.open(e, remedyMenu(rid)),
    readerMenu: (e: MouseEvent) => { const t = readerSelection(); if (t && !(e.target as HTMLElement).closest('.mm-rem')) cm.open(e, selectionMenu(t)) },
  })
  useLayoutEffect(() => {
    latest.current.openRemedyMenu = (e, rid) => cm.open(e, remedyMenu(rid))
    latest.current.readerMenu = e => { const t = readerSelection(); if (t && !(e.target as HTMLElement).closest('.mm-rem')) cm.open(e, selectionMenu(t)) }
  })
  const onListGo = useCallback((rid: number) => go(rid), [go])
  const onListMenu = useCallback((e: MouseEvent, rid: number) => latest.current.openRemedyMenu(e, rid), [])
  const onReaderMenu = useCallback((e: MouseEvent) => latest.current.readerMenu(e), [])

  const readerFont = Math.round(15 * fontScale * 10) / 10
  const sectionCount = useMemo(() => book.items.reduce((n, it) => n + (book.entries.get(it.remedyId)?.sections.length ?? 0), 0), [book])

  return (
    <div className="mm-view" ref={viewWidthRef} onKeyDown={keys.onRootKey}>
      <div className="mm-toolbar" role="toolbar" aria-label="Materia medica">
        <button className="icon-btn" aria-label="Back" title="Back (Alt+←)" disabled={!history?.back.length} onClick={() => keepMMFocus(() => historyMove(tab.id, -1))}><ArrowLeft size={15} /></button>
        <button className="icon-btn" aria-label="Forward" title="Forward (Alt+→)" disabled={!history?.forward.length} onClick={() => keepMMFocus(() => historyMove(tab.id, 1))}><ArrowRight size={15} /></button>
        <button className={`icon-btn${listHidden ? '' : ' on'}`} aria-label="Show remedy list" aria-pressed={!listHidden} title={`${listHidden ? 'Show' : 'Hide'} the remedy list (L)`} onClick={toggleList}>
          {listHidden ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <div className="mm-booktitle" title={book.sourceLine}>
          <BookText size={14} />
          <span className="mm-booktitle-name">Boericke</span>
          <span className="mm-booktitle-sub">Pocket Manual of Homoeopathic Materia Medica · {book.info.year}</span>
        </div>
        <div className="mm-search" role="search">
          <Search size={14} className="mm-search-icon" />
          <input
            ref={searchRef}
            className="mm-search-input"
            aria-controls={sideMode === 'results' && !listHidden ? 'mm-results' : undefined}
            data-mm-search
            value={q}
            placeholder="Search all monographs…"
            title="Search every monograph ( / ). Enter: next match, Shift+Enter: previous"
            aria-label="Search the materia medica"
            spellCheck={false}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (q !== dq) { pendingStep.current = e.shiftKey ? -1 : 1; setDq(q); return }
                step(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation()
                if (q) { setQ(''); setDq(''); setSideMode('list') } else readerRef.current?.focus()
              } else if (e.key === 'ArrowDown' && sideMode === 'results') { e.preventDefault(); hitsRef.current?.focus() }
            }}
          />
          {terms.length > 0 && (
            <span className="mm-search-count" aria-live="polite">
              {markCount ? `${markIndex >= 0 ? markIndex + 1 : '–'}/${markCount}` : results.hits.length ? '0 here' : 'no matches'}
            </span>
          )}
          <button className="icon-btn" aria-label="Previous match" title="Previous match (Shift+Enter)" disabled={!results.hits.length} onClick={() => step(-1)}><ChevronUp size={15} /></button>
          <button className="icon-btn" aria-label="Next match" title="Next match (Enter)" disabled={!results.hits.length} onClick={() => step(1)}><ChevronDown size={15} /></button>
          {q && <button className="icon-btn" aria-label="Clear search" title="Clear search (Esc)" onClick={() => { setQ(''); setDq(''); setSideMode('list'); searchRef.current?.focus() }}><X size={14} /></button>}
        </div>
        <div className="mm-toolbar-group">
          <button ref={sectionsBtn} className={tiny ? 'icon-btn' : 'btn btn-sm btn-ghost'} disabled={!entry} aria-haspopup="menu" aria-label="Sections" title="Jump to section (S)" onClick={openSections}><ListTree size={14} />{!tiny && <> Sections <ChevronDown size={12} /></>}</button>
          {compact ? (
            <button ref={moreBtn} className="icon-btn" aria-label="More" aria-haspopup="menu" title="Text size, abbreviations, remedy information, print"
              onClick={() => moreBtn.current && cm.openAt(moreBtn.current, moreItems)}><MoreHorizontal size={16} /></button>
          ) : <>
            <span className="mm-sep" />
            <button className="icon-btn" aria-label="Smaller text" title="Smaller text (Ctrl+-)" onClick={() => runCommand('view.zoomOut')}><Minus size={14} /></button>
            <span className="mm-zoom" title="Text size (follows View › Zoom)" aria-label={`Text size ${Math.round(fontScale * 100)}%`}>{Math.round(fontScale * 100)}%</span>
            <button className="icon-btn" aria-label="Larger text" title="Larger text (Ctrl+=)" onClick={() => runCommand('view.zoomIn')}><Plus size={14} /></button>
            <button className={`icon-btn${showAbbrevs ? ' on' : ''}`} aria-label="Show remedy abbreviations" aria-pressed={showAbbrevs} title="Show the abbreviation after each remedy name in the text (Space)" onClick={toggleShowAbbrevs}><Tags size={15} /></button>
            <span className="mm-sep" />
            <button className="icon-btn" aria-label="Remedy information" title="Remedy information (I)" disabled={tab.remedyId == null} onClick={() => tab.remedyId != null && openRemedy(tab.remedyId)}><FlaskConical size={15} /></button>
            <button className="icon-btn" aria-label="Print monograph" title="Print monograph (Ctrl+P)" disabled={!entry} onClick={() => tab.remedyId != null && void printMonograph(tab.remedyId)}><Printer size={15} /></button>
          </>}
        </div>
      </div>

      <div className="mm-body">
        {!listHidden && <>
          <MMListPane
            catalog={catalog} width={sideW} mode={sideMode} onMode={setSideMode} bookCount={book.items.length}
            items={items} selectedIndex={selectedIndex} letters={letters} filter={filter} onFilter={setFilter} onFilterKey={onFilterKey}
            list={list} hitsV={hitsV} refs={{ list: listRef, hits: hitsRef, az: azRef, filter: filterRef }} keys={keys}
            onGo={onListGo} onInfo={openRemedy} onMenu={onListMenu} onLetter={keys.jumpToLetter}
            remedyId={tab.remedyId} hasTerms={terms.length > 0} query={dq} hits={results.hits} truncated={results.truncated} hitRemedyCount={hitRemedies.length}
            hitSel={hitSel} markSection={markSection} onOpenHit={openHit}
            onResultsTab={() => { setSideMode('results'); if (!q) searchRef.current?.focus() }}
          />
          <Splitter orientation="vertical" value={sideW} min={SIDE_MIN} max={sideMax} onChange={setSideWidth} label="Resize remedy list" onReset={() => setSideWidth(280)} />
        </>}
        <MMReaderPane
          readerRef={readerRef} book={book} entry={entry} remedy={remedy} showAbbrevs={showAbbrevs} fontPx={readerFont} termsFor={termsFor} links={links}
          sectionCount={sectionCount} activeSection={activeSection} onScroll={onReaderScroll} onSection={scrollToSection} onInfo={openRemedy}
          onContextMenu={onReaderMenu}
        />
      </div>
      {sectionsMenu && <MenuList items={sectionItems} x={sectionsMenu.x} y={sectionsMenu.y} label="Sections" onClose={() => { setSectionsMenu(null); readerRef.current?.focus() }} />}
      {cm.element}
    </div>
  )
}
