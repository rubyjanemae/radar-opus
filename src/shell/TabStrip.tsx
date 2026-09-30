import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BookOpen, Library, BarChart3, BookText, FlaskConical, Users, User, Search, Network, Pin, X, Plus, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useCatalog } from '../data/CatalogContext'
import { actions, useApp } from '../state/store'
import type { NewTab, Tab } from '../state/workspace'
import type { Catalog } from '../data/catalog'
import type { AppState } from '../state/store'
import { useContextMenu } from '../ui/Menu'
import type { MenuItem } from '../ui/Menu'
import { tabTitle } from './tabTitle'

const ICONS = {
  repertory: BookOpen, repertories: Library, analysis: BarChart3, 'materia-medica': BookText, remedy: FlaskConical,
  patients: Users, patient: User, search: Search, families: Network,
} as const

/** The single tab panel every tab controls (rendered by the shell around the active document). */
export const TAB_PANEL_ID = 'document-panel'
export const tabDomId = (id: string) => `doctab-${id}`

/** What the strip draws for one tab. Only these fields re-render it, not every change inside a tab (a moved cursor). */
interface TabView { id: string; kind: Tab['kind']; pinned: boolean; title: string; subtitle?: string }
const SEP = '\u0001'
const tabKey = (t: Tab, catalog: Catalog, s: AppState) => {
  const { title, subtitle } = tabTitle(t, catalog, s)
  return [t.id, t.kind, t.pinned ? '1' : '', title, subtitle ?? ''].join(SEP)
}
const parseKey = (k: string): TabView => {
  const [id, kind, pinned, title, subtitle] = k.split(SEP)
  return { id, kind: kind as Tab['kind'], pinned: pinned === '1', title, subtitle: subtitle || undefined }
}
/** The full tab record, read when an action needs it (duplicate) rather than subscribed to. */
const fullTab = (id: string) => useApp.getState().tabs.find(t => t.id === id)

export const TabStrip = memo(function TabStrip() {
  const catalog = useCatalog()
  const keys = useApp(useShallow(s => s.tabs.map(t => tabKey(t, catalog, s))))
  // useShallow keeps `keys` identical while nothing the strip shows has changed
  const tabs = useMemo(() => keys.map(parseKey), [keys])
  const activeId = useApp(s => s.activeTabId)
  const cm = useContextMenu()
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

  // keep the active tab in view when it changes (keyboard switching, a newly opened tab)
  useEffect(() => {
    if (!activeId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  const scrollBy = (dir: -1 | 1) => {
    const el = listRef.current
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' })
  }

  const menuFor = (t: TabView): MenuItem[] => [
    { label: t.pinned ? 'Unpin tab' : 'Pin tab', run: () => actions.togglePinTab(t.id) },
    { label: 'Duplicate tab', run: () => { const full = fullTab(t.id); if (!full) return; const { id: _id, ...rest } = full; void _id; actions.openTab({ ...rest, pinned: false } as NewTab, { reuse: false }) } },
    { type: 'separator' },
    t.id === activeId ? { command: 'tab.close', label: 'Close', disabled: !!t.pinned } : { label: 'Close', run: () => actions.closeTab(t.id), disabled: !!t.pinned },
    { label: 'Close others', run: () => actions.closeOtherTabs(t.id), disabled: tabs.length < 2 },
    { label: 'Close tabs to the right', run: () => { const i = tabs.findIndex(x => x.id === t.id); tabs.slice(i + 1).forEach(x => actions.closeTab(x.id)) }, disabled: tabs.findIndex(x => x.id === t.id) === tabs.length - 1 },
  ]

  const allTabsMenu = (): MenuItem[] => tabs.map(t => {
    const { title, subtitle } = t
    return { label: subtitle ? `${title} — ${subtitle}` : title, checked: t.id === activeId, run: () => actions.activateTab(t.id) }
  })

  return (
    <div className={`tabstrip${overflow.left || overflow.right ? ' overflowing' : ''}`}>
      {(overflow.left || overflow.right) && (
        <button className="tab-scroll icon-btn" aria-label="Scroll tabs left" title="Scroll tabs left" tabIndex={-1} disabled={!overflow.left} onClick={() => scrollBy(-1)}>
          <ChevronLeft size={14} aria-hidden />
        </button>
      )}
      <div className="tabstrip-list" role="tablist" aria-label="Open documents" ref={listRef}
        onScroll={measure}
        onWheel={e => { if (e.deltaY && !e.deltaX && listRef.current) listRef.current.scrollLeft += e.deltaY }}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            if (e.key === 'Home' || e.key === 'End') { const t = tabs[e.key === 'Home' ? 0 : tabs.length - 1]; if (t) actions.activateTab(t.id) }
            else actions.cycleTab(e.key === 'ArrowRight' ? 1 : -1)
            requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
          }
        }}
      >
        {tabs.map((t, i) => {
          const { title, subtitle } = t
          const Icon = ICONS[t.kind]
          const active = t.id === activeId
          const showSub = !!subtitle && subtitle !== title && t.kind !== 'repertory'
          return (
            <div
              key={t.id}
              data-tab-id={t.id}
              role="presentation"
              className={`tab${active ? ' active' : ''}${t.pinned ? ' pinned' : ''}${drag && drag.over === i && drag.id !== t.id ? ' drop-target' : ''}`}
              title={subtitle && subtitle !== title ? `${title} — ${subtitle}` : title}
              draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: t.id, over: i }) }}
              onDragOver={e => { e.preventDefault(); if (drag) setDrag({ ...drag, over: i }) }}
              onDrop={e => { e.preventDefault(); if (drag) actions.moveTab(drag.id, i); setDrag(null) }}
              onDragEnd={() => setDrag(null)}
              onMouseDown={e => { if (e.button === 1) { e.preventDefault(); actions.closeTab(t.id) } else if (e.button === 0) actions.activateTab(t.id) }}
              onContextMenu={e => cm.open(e, menuFor(t))}
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
                  if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { e.preventDefault(); cm.openAt(e.currentTarget, menuFor(t)) }
                }}
              >
                <Icon size={13} className="tab-icon" aria-hidden />
                <span className="tab-title">{title}</span>
                {showSub && <span className="tab-sub">{subtitle}</span>}
                {t.pinned && <Pin size={11} className="tab-pin" aria-label="Pinned" />}
              </div>
              {/* mouse affordance only: the keyboard closes the focused tab with Delete or Alt+W */}
              {!t.pinned && (
                <button className="tab-close" tabIndex={-1} aria-hidden="true" title={`Close ${title}`} onMouseDown={e => e.stopPropagation()} onClick={() => actions.closeTab(t.id)}>
                  <X size={12} aria-hidden />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {(overflow.left || overflow.right) && (
        <>
          <button className="tab-scroll icon-btn" aria-label="Scroll tabs right" title="Scroll tabs right" tabIndex={-1} disabled={!overflow.right} onClick={() => scrollBy(1)}>
            <ChevronRight size={14} aria-hidden />
          </button>
          <button className="tab-all icon-btn" aria-label={`All ${tabs.length} tabs`} title="All tabs" aria-haspopup="menu" onClick={e => cm.openAt(e.currentTarget, allTabsMenu())}>
            <ChevronDown size={14} aria-hidden />
          </button>
        </>
      )}
      <button className="tab-new icon-btn" aria-label="New repertory tab" title="New repertory tab"
        onClick={() => actions.openTab({ kind: 'repertory', repertory: useApp.getState().settings.defaultRepertory, rubric: 0, back: [], forward: [] }, { reuse: false })}>
        <Plus size={14} aria-hidden />
      </button>
      {cm.element}
    </div>
  )
})
