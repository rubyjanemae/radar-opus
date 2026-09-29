import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react'
import { ArrowLeft, ArrowRight, BookText, ChevronDown, ChevronUp, FlaskConical, ListTree, Minus, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Printer, RotateCw, Search, SearchCode, Tags, X } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { getCommand, runCommand } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import type { MateriaMedicaTab } from '../../state/workspace'
import { MenuList, useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { Splitter } from '../../ui/Splitter'
import { useFixedVirtual } from '../repertory/virtual'
import { openRemedySearch } from '../search/ops'
import { filterItems, useBook } from './book'
import type { BookItem, MMBook } from './book'
import { Paragraph, Snippet } from './components'
import type { RemedyLinkHandlers } from './components'
import { focusIsBusy, historyMove, navigateMM, openRemedy, printMonograph, setListHidden, toggleList, toggleShowAbbrevs, useMMUi } from './ops'
import { useWidth } from './useWidth'
import { openSearch } from '../search/ops'
import { queryTerms, searchDocs } from './text'
import type { MMHit } from './text'
import './mm.css'

const ROW = 26
const NO_TERMS: string[] = []
const HIT_ROW = 60
const SIDE_KEY = 'radar-opus:mm-side'
/** Narrowest remedy list, and the width the reader keeps before the list gives way (about 45 characters). */
const SIDE_MIN = 168
const READER_MIN = 380
/** Below these view widths the toolbar moves zoom, abbreviations, info and print into "More", then drops the Sections label. */
const COMPACT_TOOLBAR = 700
const TINY_TOOLBAR = 620
/** Type-ahead: letters typed within this many ms extend the prefix. */
const TYPEAHEAD_MS = 800

function readSideWidth(): number {
  try { const v = Number(localStorage.getItem(SIDE_KEY)); return v >= 200 && v <= 520 ? v : 280 } catch { return 280 }
}

const queryTermsOf = (q: string) => queryTerms(q).join(' ')
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function isEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

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
        <main className="mm-reader"><div className="mm-page">
          <div className="skeleton" style={{ height: 26, width: '45%', marginBottom: 16 }} />
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 12, margin: '10px 0', width: `${70 + ((i * 29) % 30)}%` }} />)}
        </div></main>
      </div>
    </div>
  )
}

type PendingMark = { kind: 'first' } | { kind: 'last' } | { kind: 'section'; section: number } | null

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
  const typeahead = useRef({ text: '', at: 0 })
  const viewWidth = useWidth(rootRef)
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

  const results = useMemo(() => searchDocs(book.docs, dq), [book, dq])
  useEffect(() => { setHitSel(-1) }, [results])
  const terms = results.terms
  const hitRemedies = useMemo(() => [...new Set(results.hits.map(h => h.remedyId))], [results])
  /** Sections of the open monograph that are hits: only these are highlighted and stepped through. */
  const hitSections = useMemo(() => new Set(results.hits.filter(h => h.remedyId === tab.remedyId).map(h => h.section)), [results, tab.remedyId])
  const termsFor = (section: number) => (hitSections.has(section) ? terms : NO_TERMS)
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
  const entry = tab.remedyId != null ? book.entries.get(tab.remedyId) ?? null : null
  const remedy = tab.remedyId != null ? catalog.remedy(tab.remedyId) : null

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
    if (!el || !jump || jump.remedyId !== tab.remedyId) return
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
  }, [jump, tab.remedyId]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [tab.remedyId, dq, collectMarks])

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
      else useMMUi.setState({ jump: { remedyId: h.remedyId, section: h.section, nonce: Date.now() } })
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
  useEffect(() => { setActiveSection(-1) }, [tab.remedyId])

  const scrollToSection = (i: number) => {
    if (tab.remedyId != null) useMMUi.setState({ jump: { remedyId: tab.remedyId, section: i, nonce: Date.now() } })
  }

  const moveSelection = (delta: number, abs?: number) => {
    if (!items.length) return
    const base = selectedIndex < 0 ? (delta > 0 ? -1 : items.length) : selectedIndex
    const i = Math.max(0, Math.min(items.length - 1, abs ?? base + delta))
    go(items[i].remedyId)
  }

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
    onRemedyMenu: (rid: number, e: MouseEvent) => cm.open(e, remedyMenu(rid)),
  }), [book, go, cm, tab.remedyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sectionItems: MenuItem[] = entry ? [
    { label: 'Introduction', run: () => scrollToSection(-1), checked: activeSection === -1 },
    ...entry.sections.map((s, i) => ({ label: s.heading, run: () => scrollToSection(i), checked: activeSection === i })),
  ] : []

  const openSections = () => {
    const b = sectionsBtn.current?.getBoundingClientRect()
    if (b && entry) setSectionsMenu({ x: b.left, y: b.bottom + 2 })
  }

  // view-level keys: j/k next/previous remedy, / search, s sections, n/N next/previous match
  const onRootKey = (e: ReactKeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return
    if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select() }
    else if (e.key === 'j' || e.key === 'k') {
      e.preventDefault()
      if (sideMode === 'results' && results.hits.length) step(e.key === 'j' ? 1 : -1)
      else moveSelection(e.key === 'j' ? 1 : -1)
    } else if (e.key === 's' && entry) { e.preventDefault(); openSections() }
    else if (e.key === 'n' && terms.length) { e.preventDefault(); step(1) }
    else if (e.key === 'N' && terms.length) { e.preventDefault(); step(-1) }
    else if (e.key === 'i' && tab.remedyId != null) { e.preventDefault(); openRemedy(tab.remedyId) }
    else if (e.key === 'l') { e.preventDefault(); toggleList(); requestAnimationFrame(() => (useMMUi.getState().listHidden ? readerRef.current : listRef.current)?.focus({ preventScroll: true })) }
    else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && readerSelection()) {
      e.preventDefault()
      const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
      cm.open({ clientX: r.left, clientY: r.bottom, preventDefault: () => {} }, selectionMenu(readerSelection()))
    }
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); toggleShowAbbrevs() }
  }

  const typeaheadActive = () => Date.now() - typeahead.current.at < TYPEAHEAD_MS && typeahead.current.text.length > 0
  const onListKey = (e: ReactKeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
    else if (k === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
    else if (k === 'Home') { e.preventDefault(); moveSelection(0, 0) }
    else if (k === 'End') { e.preventDefault(); moveSelection(0, items.length - 1) }
    else if (k === 'PageDown') { e.preventDefault(); moveSelection(list.pageSize) }
    else if (k === 'PageUp') { e.preventDefault(); moveSelection(-list.pageSize) }
    else if (k === 'Enter' && tab.remedyId != null) { e.preventDefault(); if (e.shiftKey) openRemedy(tab.remedyId); else readerRef.current?.focus() }
    // type-ahead: letters jump to the first remedy with that prefix (j/k keep moving; Shift+J/K type J/K)
    else if (/^[a-z]$/i.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey && !((k === 'j' || k === 'k') && !typeaheadActive())) { e.preventDefault(); e.stopPropagation(); typeAhead(k) }
    else if ((k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) && tab.remedyId != null) {
      e.preventDefault()
      const row = listRef.current?.querySelector<HTMLElement>(`[data-rid="${tab.remedyId}"]`)
      if (row) cm.openAt(row, remedyMenu(tab.remedyId))
    }
  }

  /** A–Z index: one tab stop; Up/Down move between letters, Enter/Space jump, a letter jumps directly. */
  const onAzKey = (e: ReactKeyboardEvent) => {
    const btns = [...(azRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    let ni = -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') ni = Math.min(btns.length - 1, i + 1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ni = Math.max(0, i - 1)
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = btns.length - 1
    else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); jumpToLetter(e.key.toUpperCase()); return }
    if (ni < 0) return
    e.preventDefault()
    e.stopPropagation()
    btns[ni]?.focus()
  }

  const onHitsKey = (e: ReactKeyboardEvent) => {
    if (!results.hits.length) return
    const cur = markSection !== null && tab.remedyId != null ? results.hits.findIndex(h => h.remedyId === tab.remedyId && h.section === markSection) : hitSel
    let ni: number | null = null
    if (e.key === 'ArrowDown') ni = Math.min(results.hits.length - 1, cur + 1)
    else if (e.key === 'ArrowUp') ni = Math.max(0, cur - 1)
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = results.hits.length - 1
    if (ni === null) return
    e.preventDefault()
    hitsV.scrollToIndex(ni)
    openHit(results.hits[ni], ni)
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
  const jumpToLetter = (L: string) => { const at = letters.get(L); if (at !== undefined) jumpTo(at) }
  /** Type-ahead: the first remedy whose title (then abbreviation) starts with the typed prefix. */
  const typeAhead = (ch: string) => {
    const now = Date.now()
    const t = typeahead.current
    const text = (now - t.at < TYPEAHEAD_MS ? t.text : '') + ch.toLowerCase()
    typeahead.current = { text, at: now }
    const find = (p: string) => {
      let i = items.findIndex(it => it.title.toLowerCase().startsWith(p))
      if (i < 0) i = items.findIndex(it => it.abbrev.toLowerCase().startsWith(p))
      return i
    }
    let i = find(text)
    // repeating one letter cycles through the remedies starting with it
    if (text.length > 1 && [...text].every(c => c === text[0])) {
      const same = items.map((it, k) => [it, k] as const).filter(([it]) => it.title.toLowerCase().startsWith(text[0])).map(([, k]) => k)
      if (same.length) i = same[(text.length - 1) % same.length]
    }
    if (i >= 0) jumpTo(i)
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

  const readerFont = Math.round(15 * fontScale * 10) / 10
  const sectionCount = useMemo(() => book.items.reduce((n, it) => n + (book.entries.get(it.remedyId)?.sections.length ?? 0), 0), [book])

  return (
    <div className="mm-view" ref={rootRef} onKeyDown={onRootKey}>
      <div className="mm-toolbar" role="toolbar" aria-label="Materia medica">
        <button className="icon-btn" aria-label="Back" title="Back (Alt+←)" disabled={!history?.back.length} onClick={() => historyMove(tab.id, -1)}><ArrowLeft size={15} /></button>
        <button className="icon-btn" aria-label="Forward" title="Forward (Alt+→)" disabled={!history?.forward.length} onClick={() => historyMove(tab.id, 1)}><ArrowRight size={15} /></button>
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
        <aside className="mm-side" style={{ width: sideW }}>
          <div className="mm-side-tabs" role="tablist" aria-label="Side panel">
            <button role="tab" aria-selected={sideMode === 'list'} className={sideMode === 'list' ? 'on' : ''} onClick={() => setSideMode('list')}>
              Remedies <span className="badge">{items.length === book.items.length ? book.items.length : `${items.length}/${book.items.length}`}</span>
            </button>
            <button role="tab" aria-selected={sideMode === 'results'} className={sideMode === 'results' ? 'on' : ''} title="Full-text search results" onClick={() => { setSideMode('results'); if (!q) searchRef.current?.focus() }}>
              Results {terms.length > 0 && <span className="badge">{results.hits.length.toLocaleString()}{results.truncated ? '+' : ''}</span>}
            </button>
          </div>

          {sideMode === 'list' ? (
            <>
              <div className="mm-filter">
                <input
                  ref={filterRef}
                  className="input"
                  value={filter}
                  placeholder="Filter remedies…"
                  aria-label="Filter remedies"
                  spellCheck={false}
                  onChange={e => setFilter(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && items.length) { e.preventDefault(); go(filter.trim() ? items[0].remedyId : items[Math.max(0, selectedIndex)].remedyId); listRef.current?.focus() }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); if (selectedIndex < 0 && items.length) go(items[0].remedyId); listRef.current?.focus() }
                    else if (e.key === 'Escape' && filter) { e.preventDefault(); e.stopPropagation(); setFilter('') }
                  }}
                />
              </div>
              <div className="mm-listwrap">
                <div
                  ref={listRef}
                  className="mm-list"
                  role="listbox"
                  tabIndex={0}
                  aria-label="Boericke remedies"
                  aria-activedescendant={selectedIndex >= 0 ? `mm-opt-${items[selectedIndex].remedyId}` : undefined}
                  onKeyDown={onListKey}
                >
                  {items.length === 0 ? (
                    <div className="empty-state"><strong>No remedy matches “{filter}”</strong><span>Boericke has {book.items.length} monographs. Try an abbreviation or a common name.</span></div>
                  ) : (
                    <div style={{ height: list.total, position: 'relative' }}>
                      {items.slice(list.start, list.end).map((it, k) => {
                        const i = list.start + k
                        return <ListRow key={it.remedyId} item={it} top={i * ROW} selected={i === selectedIndex} onClick={() => go(it.remedyId)} onDoubleClick={() => openRemedy(it.remedyId)} onContextMenu={e => cm.open(e, remedyMenu(it.remedyId))} />
                      })}
                    </div>
                  )}
                </div>
                <nav className="mm-az" aria-label="Alphabetical index" ref={azRef} onKeyDown={onAzKey}>
                  {AZ.map(L => {
                    const at = letters.get(L)
                    const current = selectedIndex >= 0 ? items[selectedIndex].letter : AZ.find(x => letters.has(x))
                    return (
                      <button key={L} data-letter={L} disabled={at === undefined} tabIndex={L === current ? 0 : -1} aria-label={`Remedies starting with ${L}`} title={at === undefined ? undefined : `Remedies starting with ${L} (or type ${L} in the list)`}
                        onClick={() => jumpToLetter(L)}>{L}</button>
                    )
                  })}
                </nav>
              </div>
            </>
          ) : (
            <div className="mm-results">
              {!terms.length ? (
                <div className="empty-state">
                  <SearchCode size={22} />
                  <strong>Search every monograph</strong>
                  <span>Words must all appear in the same section. Use quotes for a phrase: <code>"craving salt"</code>.</span>
                </div>
              ) : !results.hits.length ? (
                <div className="empty-state"><strong>No matches for “{dq.trim()}”</strong><span>Check the spelling or search fewer words.</span></div>
              ) : (
                <>
                  <div className="mm-results-sum">
                    {results.hits.length}{results.truncated ? '+' : ''} sections in {hitRemedies.length} remedies
                  </div>
                  <div ref={hitsRef} className="mm-hits" role="listbox" tabIndex={0} aria-label="Search results" onKeyDown={onHitsKey}>
                    <div style={{ height: hitsV.total, position: 'relative' }}>
                      {results.hits.slice(hitsV.start, hitsV.end).map((h, k) => {
                        const i = hitsV.start + k
                        const same = h.remedyId === tab.remedyId
                        const on = same && (markSection !== null ? h.section === markSection : i === hitSel)
                        const r = catalog.remedy(h.remedyId)
                        return (
                          <div key={`${h.remedyId}:${h.section}`} role="option" aria-selected={on}
                            className={`mm-hit-row${same ? ' same' : ''}${on ? ' on' : ''}`}
                            style={{ top: i * HIT_ROW, height: HIT_ROW }}
                            onClick={() => openHit(h, i)}
                            onContextMenu={e => cm.open(e, remedyMenu(h.remedyId))}>
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
        <Splitter orientation="vertical" value={sideW} min={SIDE_MIN} max={sideMax} onChange={setSideWidth} label="Resize remedy list" onReset={() => setSideWidth(280)} />
        </>}

        <main
          ref={readerRef}
          className={`mm-reader${showAbbrevs ? ' mm-show-abbr' : ''}`}
          tabIndex={-1}
          onScroll={onReaderScroll}
          onContextMenu={e => { const t = readerSelection(); if (t && !(e.target as HTMLElement).closest('.mm-rem')) cm.open(e, selectionMenu(t)) }}
          style={{ ['--mm-fs' as string]: `${readerFont}px` }}
          aria-label="Monograph"
        >
          {!entry || !remedy ? (
            <div className="mm-welcome">
              <BookText size={30} strokeWidth={1.4} />
              <h1>Pocket Manual of Homoeopathic Materia Medica</h1>
              <p className="mm-welcome-by">William Boericke · {book.info.year}</p>
              <p>{book.items.length} monographs · {sectionCount.toLocaleString()} sections. Pick a remedy from the list, or search the whole book.</p>
              <ul className="mm-keys">
                <li><span className="kbd">J</span> <span className="kbd">K</span> next / previous remedy</li>
                <li><span className="kbd">/</span> search all monographs, <span className="kbd">↵</span> next match</li>
                <li><span className="kbd">S</span> jump to section, <span className="kbd">I</span> remedy information</li>
                <li><span className="kbd">Space</span> show remedy abbreviations in the text, <span className="kbd">L</span> hide the list</li>
                <li>Type letters in the list to jump; right-click selected text to search the repertory</li>
                <li><span className="kbd">Ctrl</span>+<span className="kbd">4</span> open any remedy</li>
              </ul>
              <p className="mm-source">{book.sourceLine}</p>
            </div>
          ) : (
            <article className="mm-page" lang="en">
              <header className="mm-head">
                <div className="mm-head-meta">
                  <button className="mm-abbr" title="Remedy information (I)" onClick={() => openRemedy(remedy.id)}>{remedy.abbrev}</button>
                  <span>{remedy.name}</span>
                </div>
                <h1>{entry.heading}</h1>
                {entry.commonName && <div className="mm-common">{entry.commonName}</div>}
              </header>
              <section data-sec={-1} className="mm-intro">
                <Paragraph text={entry.intro} book={book} selfId={remedy.id} terms={termsFor(-1)} links={links} />
              </section>
              {entry.sections.map((s, i) => (
                <section key={i} data-sec={i} className="mm-sec">
                  <h2>{s.heading}</h2>
                  <Paragraph text={s.text} book={book} selfId={remedy.id} relationship={/relation/i.test(s.heading)} terms={termsFor(i)} links={links} />
                </section>
              ))}
              <footer className="mm-source">{book.sourceLine}. Text via OOREP (GPL-3.0).</footer>
            </article>
          )}
        </main>

        {entry && (
          <nav className="mm-outline" aria-label="Sections">
            <div className="mm-outline-title">On this page</div>
            <button className={activeSection === -1 ? 'on' : ''} onClick={() => scrollToSection(-1)}>Introduction</button>
            {entry.sections.map((s, i) => <button key={i} className={activeSection === i ? 'on' : ''} onClick={() => scrollToSection(i)}>{s.heading}</button>)}
          </nav>
        )}
      </div>
      {sectionsMenu && <MenuList items={sectionItems} x={sectionsMenu.x} y={sectionsMenu.y} label="Sections" onClose={() => { setSectionsMenu(null); readerRef.current?.focus() }} />}
      {cm.element}
    </div>
  )
}

function ListRow({ item, top, selected, onClick, onDoubleClick, onContextMenu }: {
  item: BookItem; top: number; selected: boolean
  onClick: () => void; onDoubleClick: () => void; onContextMenu: (e: MouseEvent) => void
}) {
  return (
    <div
      id={`mm-opt-${item.remedyId}`}
      data-rid={item.remedyId}
      role="option"
      aria-selected={selected}
      className={`mm-row${selected ? ' on' : ''}`}
      style={{ top, height: ROW }}
      title={`${item.title}${item.commonName ? ` · ${item.commonName}` : ''}\nDouble-click: remedy information`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <span className="mm-row-abbr">{item.abbrev}</span>
      <span className="mm-row-title">{item.title}</span>
      {item.commonName && <span className="mm-row-common">{item.commonName}</span>}
    </div>
  )
}
