import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Library, BookText, FlaskConical, Search, Network, Pin, X, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useCatalog } from '../data/CatalogContext'
import { actions, useApp } from '../state/store'
import type { NewTab, Tab } from '../state/workspace'
import type { Catalog } from '../data/catalog'
import type { AppState } from '../state/store'
import { useContextMenu } from '../ui/Menu'
import type { MenuItem } from '../ui/Menu'
import { tabTitle } from './tabTitle'
import { cancelDocumentFocus, focusActiveDocument, focusDocumentWhenReady } from './TabHost'
import { AnalysisIcon } from '../features/analysis/AnalysisIcon'
import { MapsIcon, PatientsIcon } from './toolbarIcons'

/** A repertory window's icon: a solid book, cover and light spine (an original glyph; lucide's book is line art). */
function SolidBook({ className }: { size?: number; className?: string; 'aria-hidden'?: boolean }) {
  return (
    <svg width="12" height="15" viewBox="0 0 12 15" className={`${className ?? ''} tab-book`} aria-hidden="true">
      <rect className="tab-book-cover" x="0.5" y="0.5" width="11" height="14" rx="1.5" />
      <rect className="tab-book-spine" x="1" y="1" width="2" height="13" rx="0.5" />
      <rect className="tab-book-edge" x="0.5" y="0.5" width="11" height="14" rx="1.5" />
    </svg>
  )
}

/** A patient window's icon: the toolbar's two-people Patients picture in colour, at tab size. */
function PatientsGlyph({ className }: { size?: number; className?: string; 'aria-hidden'?: boolean }) {
  return <PatientsIcon size={16} className={`${className ?? ''} tab-people`} />
}

/** The Maps window's icon: the toolbar's folded map, at tab size. */
function MapsGlyph({ className }: { size?: number; className?: string; 'aria-hidden'?: boolean }) {
  return <MapsIcon size={16} className={className} />
}

/** The analysis window's icon: the toolbar's bar chart, at tab size. */
function AnalysisGlyph({ className }: { size?: number; className?: string; 'aria-hidden'?: boolean }) {
  return <AnalysisIcon size={16} className={`${className ?? ''} tab-chart`} />
}

const ICONS = {
  repertory: SolidBook, repertories: Library, analysis: AnalysisGlyph, 'materia-medica': BookText, remedy: FlaskConical,
  // RadarOpus's patient window carries the two-people Patients icon
  patients: PatientsGlyph, patient: PatientsGlyph, search: Search, families: Network,
  maps: MapsGlyph,
} as const

/** A window's title, cut off at its end with "…" when the tab is too narrow (RadarOpus). */
function TabTitleText({ title }: { title: string }) {
  return <span className="tab-title">{title}</span>
}

/** The single tab panel every tab controls (rendered by the shell around the active document). */
export const TAB_PANEL_ID = 'document-panel'
export const tabDomId = (id: string) => `doctab-${id}`

/**
 * The strip subscribes only to the tab list's shape (id, kind, pinned); each tab subscribes to its own
 * title. A moved cursor inside a document (the MM remedy, a rubric) re-renders at most that one tab.
 */
interface TabShape { id: string; kind: Tab['kind']; pinned: boolean }
interface TabView extends TabShape { title: string; subtitle?: string }
const SEP = '\u0001'
const shapeKey = (t: Tab) => [t.id, t.kind, t.pinned ? '1' : ''].join(SEP)
const parseShape = (k: string): TabShape => {
  const [id, kind, pinned] = k.split(SEP)
  return { id, kind: kind as Tab['kind'], pinned: pinned === '1' }
}
const titleKey = (t: Tab | undefined, catalog: Catalog, s: AppState) => {
  if (!t) return ''
  const { title, subtitle } = tabTitle(t, catalog, s)
  return subtitle ? title + SEP + subtitle : title
}
const viewOf = (t: TabShape, key: string): TabView => {
  const [title, subtitle] = key.split(SEP)
  return { ...t, title, subtitle: subtitle || undefined }
}
/** Titles read when a menu opens, rather than subscribed to. */
const currentView = (t: TabShape, catalog: Catalog): TabView => {
  const s = useApp.getState()
  return viewOf(t, titleKey(s.tabs.find(x => x.id === t.id), catalog, s))
}
/** The system setting or the app's own Reduce motion setting (WorkspaceChrome sets data-reduce-motion on <html>). */
const reducedMotion = () => document.documentElement.dataset.reduceMotion === 'true' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The full tab record, read when an action needs it (duplicate) rather than subscribed to. */
const fullTab = (id: string) => useApp.getState().tabs.find(t => t.id === id)

export const TabStrip = memo(function TabStrip() {
  const catalog = useCatalog()
  const keys = useApp(useShallow(s => s.tabs.map(shapeKey)))
  // useShallow keeps `keys` identical while no tab was opened, closed, moved or (un)pinned
  const tabs = useMemo(() => keys.map(parseShape), [keys])
  const activeId = useApp(s => s.activeTabId)
  const cm = useContextMenu()
  const all = useContextMenu()
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setOverflow(o => (o.left === left && o.right === right ? o : { left, right }))
  }, [])

  useLayoutEffect(measure, [tabs, measure])
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  // a switch made in the strip itself (a click, the arrow keys) handles focus on its own
  const fromStrip = useRef(false)
  const markFromStrip = () => { fromStrip.current = true; setTimeout(() => { fromStrip.current = false }, 0) }
  // keep the active tab in view when it changes (keyboard switching, a newly opened tab)
  useEffect(() => {
    if (!activeId) return
    // another document became active (a toolbar button, a menu, a command) while focus sat on a tab that is
    // now inactive (left there by a closed tab menu): the keyboard continues in the new document
    const a = document.activeElement
    const onTab = a instanceof HTMLElement ? a.closest<HTMLElement>('[data-tab-id]') : null
    if (!fromStrip.current && onTab && listRef.current?.contains(onTab) && onTab.dataset.tabId !== activeId) focusDocumentWhenReady()
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])
  // the scroll arrows appearing (or going) narrow the list: bring the active tab back into view
  const overflowing = overflow.left || overflow.right
  useLayoutEffect(() => {
    if (!overflowing || !activeId) return
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overflowing])

  const scrollBy = (dir: -1 | 1) => {
    const el = listRef.current
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const menuFor = (t: TabShape): MenuItem[] => [
    { label: t.pinned ? 'Unpin tab' : 'Pin tab', run: () => actions.togglePinTab(t.id) },
    { label: 'Duplicate tab', run: () => { const full = fullTab(t.id); if (!full) return; const { id: _id, ...rest } = full; void _id; actions.openTab({ ...rest, pinned: false } as NewTab, { reuse: false }) } },
    { type: 'separator' },
    t.id === activeId ? { command: 'tab.close', label: 'Close', disabled: !!t.pinned } : { label: 'Close', run: () => actions.closeTab(t.id), disabled: !!t.pinned },
    { label: 'Close others', run: () => actions.closeOtherTabs(t.id), disabled: tabs.length < 2 },
    { label: 'Close tabs to the right', run: () => { const i = tabs.findIndex(x => x.id === t.id); tabs.slice(i + 1).forEach(x => actions.closeTab(x.id)) }, disabled: tabs.findIndex(x => x.id === t.id) === tabs.length - 1 },
  ]

  const allTabsMenu = (): MenuItem[] => tabs.map(t => {
    const { title, subtitle } = currentView(t, catalog)
    return { label: subtitle ? `${title} — ${subtitle}` : title, checked: t.id === activeId, run: () => actions.activateTab(t.id) }
  })

  // handlers for the memoised tabs: one stable object reading the latest strip state through a ref
  const latest = useRef({ drag, menuFor, measure, cm })
  latest.current = { drag, menuFor, measure, cm }
  const ctx = useMemo<TabCtx>(() => ({
    dragStart: (id, i) => setDrag({ id, over: i }),
    dragOver: i => { const d = latest.current.drag; if (d && d.over !== i) setDrag({ ...d, over: i }) },
    drop: i => { const d = latest.current.drag; if (d) actions.moveTab(d.id, i); setDrag(null) },
    dragEnd: () => setDrag(null),
    menu: t => latest.current.menuFor(t),
    open: (e, items) => latest.current.cm.open(e, items),
    openAt: (el, items) => latest.current.cm.openAt(el, items),
    titleChanged: () => latest.current.measure(),
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`tabstrip${overflow.left || overflow.right ? ' overflowing' : ''}`}>
      {(overflow.left || overflow.right) && (
        <button className="tab-scroll icon-btn" aria-label="Scroll tabs left" title="Scroll tabs left" tabIndex={-1} disabled={!overflow.left} onClick={() => scrollBy(-1)}>
          <ChevronLeft size={14} aria-hidden />
        </button>
      )}
      <div className="tabstrip-list" role="tablist" aria-label="Open documents" ref={listRef}
        onScroll={measure}
        onMouseDownCapture={markFromStrip}
        onKeyDownCapture={markFromStrip}
        onWheel={e => { if (e.deltaY && !e.deltaX && listRef.current) listRef.current.scrollLeft += e.deltaY }}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            cancelDocumentFocus()
            if (e.key === 'Home' || e.key === 'End') { const t = tabs[e.key === 'Home' ? 0 : tabs.length - 1]; if (t) actions.activateTab(t.id) }
            else actions.cycleTab(e.key === 'ArrowRight' ? 1 : -1)
            setTimeout(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), 0)
          }
        }}
      >
        {tabs.map((t, i) => (
          <TabItem key={t.id} tab={t} index={i} active={t.id === activeId} dropTarget={!!drag && drag.over === i && drag.id !== t.id} ctx={ctx} />
        ))}
      </div>
      {(overflow.left || overflow.right) && (
        <>
          <button className="tab-scroll icon-btn" aria-label="Scroll tabs right" title="Scroll tabs right" tabIndex={-1} disabled={!overflow.right} onClick={() => scrollBy(1)}>
            <ChevronRight size={14} aria-hidden />
          </button>
          <button className="tab-all icon-btn" aria-label={`All ${tabs.length} tabs`} title="All tabs" aria-haspopup="menu" aria-expanded={all.isOpen} onClick={e => all.openAt(e.currentTarget, allTabsMenu())}>
            <ChevronDown size={14} aria-hidden />
          </button>
        </>
      )}
      {cm.element}
      {all.element}
    </div>
  )
})

interface TabCtx {
  dragStart(id: string, i: number): void
  dragOver(i: number): void
  drop(i: number): void
  dragEnd(): void
  menu(t: TabShape): MenuItem[]
  open(e: React.MouseEvent, items: MenuItem[]): void
  openAt(el: HTMLElement, items: MenuItem[]): void
  titleChanged(): void
}

/** One tab: re-renders when its own title, state or position changes, not when a sibling's does. */
const TabItem = memo(function TabItem({ tab, index: i, active, dropTarget, ctx }: { tab: TabShape; index: number; active: boolean; dropTarget: boolean; ctx: TabCtx }) {
  const catalog = useCatalog()
  const key = useApp(s => titleKey(s.tabs.find(x => x.id === tab.id), catalog, s))
  const t = useMemo(() => viewOf(tab, key), [tab, key])
  const { title, subtitle } = t
  // a longer or shorter title can start or end the strip's overflow
  useLayoutEffect(() => { ctx.titleChanged() }, [key, ctx])
  const Icon = ICONS[t.kind]
  // a window's title strip shows its icon and title only (RadarOpus); the subtitle is for assistive technology and the tooltip
  const showSub = !!subtitle && subtitle !== title
  return (
    <div
      data-tab-id={t.id}
      role="presentation"
      className={`tab${active ? ' active' : ''}${t.pinned ? ' pinned' : ''}${dropTarget ? ' drop-target' : ''}`}
      title={subtitle && subtitle !== title ? `${title} — ${subtitle}` : title}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; ctx.dragStart(t.id, i) }}
      onDragOver={e => { e.preventDefault(); ctx.dragOver(i) }}
      onDrop={e => { e.preventDefault(); ctx.drop(i) }}
      onDragEnd={() => ctx.dragEnd()}
      onMouseDown={e => { if (e.button === 1) { e.preventDefault(); actions.closeTab(t.id) } else if (e.button === 0) actions.activateTab(t.id) }}
      // a click on a tab (the active one too) continues in its document, as switching with a command does
      onClick={e => { if (e.button === 0) focusDocumentWhenReady() }}
      onContextMenu={e => ctx.open(e, ctx.menu(t))}
    >
      <div
        role="tab"
        id={tabDomId(t.id)}
        className="tab-main"
        data-kind={t.kind}
        aria-selected={active}
        aria-controls={TAB_PANEL_ID}
        tabIndex={active ? 0 : -1}
        onKeyDown={e => {
          if (e.key === 'Delete') { e.preventDefault(); actions.closeTab(t.id) }
          // Enter (or Space) activates the window and continues in its document
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (active) { if (!focusActiveDocument()) focusDocumentWhenReady() } else { actions.activateTab(t.id); focusDocumentWhenReady() }
          }
          if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { e.preventDefault(); ctx.openAt(e.currentTarget, ctx.menu(t)) }
        }}
      >
        <Icon size={14} className="tab-icon" aria-hidden />
        <TabTitleText title={title} />
        {showSub && <span className="tab-sub sr-only"> {subtitle}</span>}
        {t.pinned && <Pin size={11} className="tab-pin" aria-label="Pinned" />}
      </div>
      {/* mouse affordance only: the keyboard closes the focused tab with Delete or Alt+W */}
      {!t.pinned && (
        <button className="tab-close" tabIndex={-1} aria-hidden="true" title={`Close ${title}`} onMouseDown={e => e.stopPropagation()} onClick={() => actions.closeTab(t.id)}>
          <X size={9} strokeWidth={2.8} aria-hidden />
        </button>
      )}
    </div>
  )
})
