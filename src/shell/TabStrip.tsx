import { useRef, useState } from 'react'
import { BookOpen, Library, BarChart3, BookText, FlaskConical, Users, User, Search, Network, Pin, X, Plus } from 'lucide-react'
import { useCatalog } from '../data/CatalogContext'
import { actions, useApp } from '../state/store'
import type { NewTab, Tab } from '../state/workspace'
import { useContextMenu } from '../ui/Menu'
import { tabTitle } from './tabTitle'

const ICONS = {
  repertory: BookOpen, repertories: Library, analysis: BarChart3, 'materia-medica': BookText, remedy: FlaskConical,
  patients: Users, patient: User, search: Search, families: Network,
} as const

export function TabStrip() {
  const catalog = useCatalog()
  const tabs = useApp(s => s.tabs)
  const activeId = useApp(s => s.activeTabId)
  const patients = useApp(s => s.patients)
  const consultations = useApp(s => s.consultations)
  const cm = useContextMenu()
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const menuFor = (t: Tab) => [
    { label: t.pinned ? 'Unpin tab' : 'Pin tab', run: () => actions.togglePinTab(t.id) },
    { label: 'Duplicate tab', run: () => { const { id: _id, ...rest } = t; void _id; actions.openTab({ ...rest, pinned: false } as NewTab, { reuse: false }) } },
    { type: 'separator' as const },
    { label: 'Close', run: () => actions.closeTab(t.id), disabled: !!t.pinned, keys: 'Mod+W' },
    { label: 'Close others', run: () => actions.closeOtherTabs(t.id), disabled: tabs.length < 2 },
    { label: 'Close tabs to the right', run: () => { const i = tabs.findIndex(x => x.id === t.id); tabs.slice(i + 1).forEach(x => actions.closeTab(x.id)) }, disabled: tabs.findIndex(x => x.id === t.id) === tabs.length - 1 },
  ]

  return (
    <div className="tabstrip">
      <div className="tabstrip-list" role="tablist" aria-label="Open documents" ref={listRef}
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            actions.cycleTab(e.key === 'ArrowRight' ? 1 : -1)
            requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
          }
        }}
      >
        {tabs.map((t, i) => {
          const { title, subtitle } = tabTitle(t, catalog, { patients, consultations })
          const Icon = ICONS[t.kind]
          const active = t.id === activeId
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={subtitle ? `${title} — ${subtitle}` : title}
              className={`tab${active ? ' active' : ''}${t.pinned ? ' pinned' : ''}${drag && drag.over === i && drag.id !== t.id ? ' drop-target' : ''}`}
              draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: t.id, over: i }) }}
              onDragOver={e => { e.preventDefault(); if (drag) setDrag({ ...drag, over: i }) }}
              onDrop={e => { e.preventDefault(); if (drag) actions.moveTab(drag.id, i); setDrag(null) }}
              onDragEnd={() => setDrag(null)}
              onMouseDown={e => { if (e.button === 1) { e.preventDefault(); actions.closeTab(t.id) } else if (e.button === 0) actions.activateTab(t.id) }}
              onContextMenu={e => cm.open(e, menuFor(t))}
              onKeyDown={e => {
                if (e.key === 'Delete') actions.closeTab(t.id)
                if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { e.preventDefault(); cm.openAt(e.currentTarget, menuFor(t)) }
              }}
            >
              <Icon size={13} className="tab-icon" aria-hidden />
              <span className="tab-title">{title}</span>
              {subtitle && t.kind !== 'repertory' && <span className="tab-sub">{subtitle}</span>}
              {t.pinned
                ? <Pin size={11} className="tab-pin" aria-label="Pinned" />
                : <button className="tab-close" tabIndex={-1} aria-label={`Close ${title}`} onMouseDown={e => e.stopPropagation()} onClick={() => actions.closeTab(t.id)}><X size={12} /></button>}
            </div>
          )
        })}
      </div>
      <button className="tab-new icon-btn" aria-label="New repertory tab" title="New repertory tab"
        onClick={() => actions.openTab({ kind: 'repertory', repertory: useApp.getState().settings.defaultRepertory, rubric: 0, back: [], forward: [] }, { reuse: false })}>
        <Plus size={14} />
      </button>
      {cm.element}
    </div>
  )
}
