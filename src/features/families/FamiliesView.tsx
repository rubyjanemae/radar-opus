import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, RefObject } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, ExternalLink, Filter, Highlighter, Info, LoaderCircle, RotateCw, Search, SlidersHorizontal, TriangleAlert, X } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import { actions, useApp } from '../../state/store'
import type { FamiliesTab } from '../../state/workspace'
import { Splitter } from '../../ui/Splitter'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { useFamilies } from './api'
import { FamilyTree, GroupIcon, Mark, ROW_H } from './FamilyTree'
import { ancestorsOf, KIND_LABEL, searchRemedies, visibleRows } from './model'
import type { FamilyIndex, Node } from './model'
import { applyFamilyFilter, clearFamilyFilter, openFilterDialog, openRemedy, targetConsultationId } from './ops'
import { rubricStat } from './rubricStats'
import type { RubricStat } from './rubricStats'
import { setViewSelection, viewBus } from './viewState'
import './families.css'

type SortKey = 'abbrev' | 'name' | 'primary' | 'total' | 'high'

/** Tree pane: preferred width, and the limits that keep the detail pane usable in a narrow view. */
const TREE_W = 340
const TREE_MIN = 180
const TREE_MAX = 640
const DETAIL_MIN = 300

export function FamiliesView({ tab }: { tab: FamiliesTab }) {
  const { index, error, retry } = useFamilies()
  if (error) {
    return (
      <div className="fam-view fam-error-wrap" data-testid="families-view">
        <div className="fam-error" role="alert">
          <TriangleAlert size={22} aria-hidden="true" className="fam-error-icon" />
          <h3>Families could not be loaded</h3>
          <p title={error.message}>{error.message}</p>
          <button className="btn" onClick={retry}><RotateCw size={13} aria-hidden="true" /> Retry</button>
        </div>
      </div>
    )
  }
  if (!index) {
    return (
      <div className="fam-view fam-loading" aria-busy="true" aria-label="Loading families">
        <div className="fam-toolbar"><div className="skeleton" style={{ width: 260, height: 22 }} /></div>
        <div className="fam-skel">{Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${40 + ((i * 37) % 45)}%`, height: 14 }} />)}</div>
      </div>
    )
  }
  return <Loaded tab={tab} index={index} />
}

function Loaded({ tab, index }: { tab: FamiliesTab; index: FamilyIndex }) {
  const catalog = useCatalog()
  const group = tab.group && index.get(tab.group) ? tab.group : null
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(group ? ancestorsOf(index, group) : []))
  const [treeW, setTreeW] = useState(TREE_W)
  const [remedy, setRemedy] = useState<number | null>(null)
  const [remHit, setRemHit] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const treeWrap = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyW = useWidth(bodyRef)
  const cm = useContextMenu()

  // the tree never takes more than its share of a narrow view (side panels open), so the detail stays usable
  const maxTree = bodyW ? Math.max(TREE_MIN, Math.min(TREE_MAX, bodyW - DETAIL_MIN)) : TREE_MAX
  const treeShown = bodyW ? Math.max(TREE_MIN, Math.min(treeW, maxTree, Math.round(bodyW * 0.45))) : treeW

  const rows = useMemo(() => visibleRows(index, expanded, query), [index, expanded, query])
  const remedyHits = useMemo(() => (query.trim() ? searchRemedies(catalog.remedies.values(), query).filter(r => index.allGroupsOf(r.id).length) : []), [catalog, index, query])

  const select = (id: string | null) => { if (id !== tab.group) actions.updateTab<FamiliesTab>(tab.id, { group: id }) }
  const reveal = (id: string) => {
    setExpanded(s => { const n = new Set(s); for (const a of ancestorsOf(index, id)) n.add(a); return n })
    select(id)
  }
  const toggle = (id: string, expand?: boolean) => setExpanded(s => {
    const n = new Set(s)
    const open = expand ?? !n.has(id)
    if (open) n.add(id); else n.delete(id)
    return n
  })
  const expandAll = () => setExpanded(new Set(index.nodes.filter(n => n.children.length).map(n => n.id)))
  const collapseAll = () => setExpanded(new Set())

  // a group opened from elsewhere (remedy window, command) is revealed in the tree
  useEffect(() => {
    if (group) setExpanded(s => { const need = ancestorsOf(index, group).filter(a => !s.has(a)); return need.length ? new Set([...s, ...need]) : s })
  }, [group, index])

  // expose the selection to commands; listen for view commands
  useEffect(() => { setViewSelection({ tabId: tab.id, group, remedy }) }, [tab.id, group, remedy])
  useEffect(() => () => setViewSelection({ tabId: null, group: null, remedy: null }), [])
  useEffect(() => viewBus.on(cmd => {
    if (cmd === 'focusSearch') { searchRef.current?.focus(); searchRef.current?.select() }
    else if (cmd === 'expandAll') expandAll()
    else if (cmd === 'collapseAll') collapseAll()
    else if (cmd === 'focusTree') focusTree()
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const pickRemedy = (rid: number) => {
    const prim = index.primaryGroupOf(rid) ?? index.allGroupsOf(rid)[0]
    if (!prim) return
    reveal(prim.id)
    setRemedy(rid)
    requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>('.fam-table')?.focus())
  }

  const groupMenu = (id: string): MenuItem[] => {
    const n = index.get(id)!
    const hasCase = !!targetConsultationId()
    return [
      { type: 'label', label: n.name },
      { label: 'Limit analysis to this group', run: () => applyFamilyFilter([id], 'limit'), disabled: !hasCase },
      { label: 'Highlight in analysis', run: () => applyFamilyFilter([id], 'highlight'), disabled: !hasCase },
      { label: 'Family filter…', run: () => openFilterDialog({ groups: [id] }), disabled: !hasCase },
      { type: 'separator' },
      ...(n.children.length ? [
        { label: expanded.has(id) ? 'Collapse' : 'Expand', run: () => toggle(id) } as MenuItem,
        { label: 'Expand all below', run: () => setExpanded(s => { const x = new Set(s); const walk = (g: string) => { const m = index.get(g)!; if (m.children.length) { x.add(g); m.children.forEach(walk) } }; walk(id); return x }) } as MenuItem,
      ] : []),
      { label: 'Copy group name', run: () => { void navigator.clipboard?.writeText(n.name); actions.toast(`Copied “${n.name}”`, 'success') } },
      { label: 'Copy remedy abbreviations', run: () => { void navigator.clipboard?.writeText(n.remedies.map(r => catalog.remedy(r).abbrev).join(', ')); actions.toast(`Copied ${n.remedies.length} abbreviations`, 'success') } },
    ]
  }

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      // no group name matches: go straight to the matching remedies
      if (onlyRemedies) { focusHits(0); return }
      const first = rows.find(r => r.match) ?? rows[0]
      if (first) select(first.id)
      focusTree()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const first = rows.find(r => r.match)
      if (first) { select(first.id); focusTree() }
      else if (remedyHits[0]) pickRemedy(remedyHits[0].id)
    }
  }

  // the tree reads the latest selection when focus settles, so focusing in the same handler is safe
  const focusTree = () => treeWrap.current?.querySelector<HTMLElement>('.fam-tree')?.focus()
  const focusHits = (i?: number) => {
    if (i !== undefined) setRemHit(i)
    treeWrap.current?.querySelector<HTMLElement>('.fam-remhits-list')?.focus()
  }
  const focusSearch = () => searchRef.current?.focus()

  const matchCount = query.trim() ? rows.filter(r => r.match).length : 0
  const onlyRemedies = !!query.trim() && matchCount === 0 && remedyHits.length > 0

  return (
    <div className="fam-view" data-testid="families-view">
      <div className="fam-toolbar">
        <div className="fam-search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            className="input"
            placeholder="Find family, element or remedy…"
            aria-label="Find families and remedies"
            value={query}
            onChange={e => { setQuery(e.target.value); setRemHit(0) }}
            onKeyDown={onSearchKey}
          />
          {query && <button className="icon-btn" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus() }}><X size={13} /></button>}
        </div>
        <span className="fam-status fam-muted" role="status" title={query.trim() ? `${matchCount} groups and ${remedyHits.length} remedies match` : undefined}>
          {query.trim() && <>
            <span className="fam-status-long">{`${matchCount} group${matchCount === 1 ? '' : 's'} · ${remedyHits.length} remed${remedyHits.length === 1 ? 'y' : 'ies'}`}</span>
            <span className="fam-status-short" aria-hidden="true">{`${matchCount} · ${remedyHits.length}`}</span>
          </>}
        </span>
        <button className="icon-btn" title="Expand all" aria-label="Expand all" onClick={expandAll}><ChevronsUpDown size={15} /></button>
        <button className="icon-btn" title="Collapse all" aria-label="Collapse all" onClick={collapseAll}><ChevronsDownUp size={15} /></button>
        <button className="btn btn-sm fam-tb-filter" onClick={() => openFilterDialog(group ? { groups: [group] } : {})} aria-label="Family filter…" title="Family filter: limit or highlight the analysis by several families"><SlidersHorizontal size={13} /><span className="fam-btn-label"> Family filter…</span></button>
      </div>
      <div className="fam-body" ref={bodyRef}>
        <div className={`fam-left${onlyRemedies ? ' only-remedies' : ''}`} ref={treeWrap} style={{ width: treeShown }}>
          <FamilyTree
            index={index}
            rows={rows}
            active={group}
            onActivate={id => { select(id); setRemedy(null) }}
            onToggle={toggle}
            onEnter={() => detailRef.current?.querySelector<HTMLElement>('.fam-table')?.focus()}
            onContextMenu={(id, e) => cm.open(e, groupMenu(id))}
            label="Remedy families"
            idPrefix={`famt-${tab.id}`}
            onExitStart={focusSearch}
            onExitEnd={remedyHits.length ? () => focusHits(0) : undefined}
            query={query}
            empty={remedyHits.length
              ? <div className="fam-muted fam-tree-note">No group name matches “{query}”.</div>
              : <div className="empty-state"><strong>No family matches “{query}”</strong><span>Try a botanical family, an element or a remedy abbreviation.</span></div>}
          />
          {remedyHits.length > 0 && (
            <RemedyHits index={index} hits={remedyHits} query={query} active={Math.min(remHit, remedyHits.length - 1)} setActive={setRemHit} onPick={pickRemedy} idPrefix={`famr-${tab.id}`}
              onExitStart={() => {
                // back to the last tree row, or to the search box when the tree is empty
                const last = rows[rows.length - 1]
                if (last && !onlyRemedies) { select(last.id); focusTree() } else focusSearch()
              }} />
          )}
        </div>
        <Splitter orientation="vertical" value={treeShown} min={TREE_MIN} max={maxTree} onChange={setTreeW} label="Resize family tree" onReset={() => setTreeW(TREE_W)} />
        <div className="fam-right" ref={detailRef}>
          {group
            ? <GroupDetail key={group} index={index} node={index.get(group)!} catalog={catalog} remedy={remedy} setRemedy={setRemedy} onSelect={reveal} onGroupMenu={(id, e) => cm.open(e, groupMenu(id))} />
            : <Overview index={index} onSelect={reveal} />}
        </div>
      </div>
      {cm.element}
    </div>
  )
}

// ─────────────────────────── overview (no group selected) ───────────────────────────

function Overview({ index, onSelect }: { index: FamilyIndex; onSelect: (id: string) => void }) {
  const src = index.source
  return (
    <div className="fam-overview">
      <header className="fam-ov-head">
        <h1>Families &amp; kingdoms</h1>
        <p className="fam-muted">
          {index.nodes.length} groups · {src.classified ?? '?'} of {src.remedyCount ?? '?'} remedies classified ({src.coverage ?? '?'}%). Select a group to see its remedies, then limit or highlight the analysis with it.
        </p>
      </header>
      <div className="fam-cards">
        {index.roots.map(id => {
          const n = index.get(id)!
          const top = [...n.children].map(c => index.get(c)!).sort((a, b) => b.remedies.length - a.remedies.length).slice(0, 4)
          return (
            <button key={id} className="fam-card" onClick={() => onSelect(id)}>
              <span className="fam-card-head"><GroupIcon node={n} size={16} /><strong>{n.name}</strong><span className="fam-count">{n.remedies.length}</span></span>
              <span className="fam-card-sub">{top.map(t => `${t.name} ${t.remedies.length}`).join(' · ') || '—'}</span>
            </button>
          )
        })}
      </div>
      <p className="fam-source"><Info size={12} aria-hidden="true" /> {src.title}. {src.note} {src.licence ? `Licence: ${src.licence}.` : ''}</p>
    </div>
  )
}

// ─────────────────────────── group detail ───────────────────────────

function GroupDetail({ index, node, catalog, remedy, setRemedy, onSelect, onGroupMenu }: {
  index: FamilyIndex; node: Node; catalog: Catalog; remedy: number | null; setRemedy: (r: number | null) => void
  onSelect: (id: string) => void; onGroupMenu: (id: string, e: MouseEvent) => void
}) {
  const defaultRep = useApp(s => s.settings.defaultRepertory)
  const { rep, error: repError } = useRepertory(defaultRep)
  const cid = useApp(() => targetConsultationId())
  const analysis = useApp(s => (cid ? s.consultations[cid]?.analysis ?? null : null))
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'abbrev', dir: 1 })
  const [filter, setFilter] = useState('')
  const cm = useContextMenu()

  const stats = useMemo(() => {
    if (!rep) return null
    const m = new Map<number, RubricStat>()
    for (const r of node.remedies) m.set(r, rubricStat(rep, r))
    return m
  }, [rep, node])

  const items = useMemo(() => {
    const list = node.remedies.map(id => {
      const r = catalog.remedy(id)
      const prim = index.primaryGroupOf(id)
      return { id, abbrev: r.abbrev, name: r.name, primary: prim && prim.id !== node.id ? prim.name : '' }
    })
    const f = filter.trim().toLowerCase()
    const shown = f ? list.filter(x => x.abbrev.toLowerCase().includes(f) || x.name.toLowerCase().includes(f) || x.primary.toLowerCase().includes(f)) : list
    const val = (x: typeof list[number]) => {
      switch (sort.key) {
        case 'total': return stats?.get(x.id)?.total ?? -1
        case 'high': return stats?.get(x.id)?.high ?? -1
        default: return x[sort.key].toLowerCase()
      }
    }
    return [...shown].sort((a, b) => {
      const va = val(a), vb = val(b)
      const c = typeof va === 'number' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb))
      return (c || a.abbrev.localeCompare(b.abbrev)) * sort.dir
    })
  }, [node, catalog, index, filter, sort, stats])

  const inLimit = analysis?.remedyFilter ? new Set(analysis.remedyFilter) : null
  const children = node.children.map(c => index.get(c)!)
  const hasCase = !!cid

  const remedyMenu = (rid: number): MenuItem[] => {
    const r = catalog.remedy(rid)
    const prim = index.primaryGroupOf(rid)
    const others = index.groupsOfRemedy(rid).filter(g => g.id !== node.id).slice(0, 8)
    return [
      { type: 'label', label: `${r.abbrev} · ${r.name}` },
      { label: 'Open remedy', keys: 'Enter', run: () => openRemedy(rid) },
      ...(prim && prim.id !== node.id ? [{ label: `Show in ${prim.name}`, run: () => { onSelect(prim.id); setRemedy(rid) } } as MenuItem] : []),
      ...(others.length ? [{ label: 'Other groups', submenu: others.map(g => ({ label: `${g.name} (${g.remedies.length})`, run: () => { onSelect(g.id); setRemedy(rid) } })) } as MenuItem] : []),
      { type: 'separator' },
      { label: `Limit analysis to ${prim?.name ?? 'its group'}`, disabled: !hasCase || !prim, run: () => prim && applyFamilyFilter([prim.id], 'limit') },
      { label: `Highlight ${prim?.name ?? 'its group'} in analysis`, disabled: !hasCase || !prim, run: () => prim && applyFamilyFilter([prim.id], 'highlight') },
      ...(prim && prim.id !== node.id ? [
        { label: `Limit analysis to ${node.name}`, disabled: !hasCase, run: () => applyFamilyFilter([node.id], 'limit') } as MenuItem,
        { label: `Highlight ${node.name} in analysis`, disabled: !hasCase, run: () => applyFamilyFilter([node.id], 'highlight') } as MenuItem,
      ] : []),
      { type: 'separator' },
      { label: 'Copy abbreviation', run: () => { void navigator.clipboard?.writeText(r.abbrev); actions.toast(`Copied ${r.abbrev}`, 'success') } },
    ]
  }

  return (
    <div className="fam-detail" aria-label={`${node.name} details`}>
      <nav className="fam-crumbs" aria-label="Group path">
        {node.path.map((id, i) => {
          const n = index.get(id)!
          const last = i === node.path.length - 1
          return (
            <span key={id} className="fam-crumb">
              {i > 0 && <span className="fam-sep" aria-hidden="true">›</span>}
              {last ? <span aria-current="page">{n.name}</span> : <button className="fam-link" onClick={() => onSelect(id)}>{n.name}</button>}
            </span>
          )
        })}
      </nav>
      <header className="fam-head" onContextMenu={e => onGroupMenu(node.id, e)}>
        <GroupIcon node={node} size={20} />
        <div className="fam-title">
          <h1>{node.name}</h1>
          <div className="fam-sub">
            <span className="fam-kind">{KIND_LABEL[node.kind] ?? node.kind}</span>
            {node.note && <span>{node.note}</span>}
            <span className="fam-sub-counts">
              {node.remedies.length} remed{node.remedies.length === 1 ? 'y' : 'ies'}
              {children.length > 0 && ` · ${children.length} sub-group${children.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <div className="fam-actions">
          <button className="btn btn-sm" disabled={!hasCase} title={hasCase ? 'Only remedies of this group stay in the analysis' : 'Open a case first'} aria-label="Limit analysis" onClick={() => applyFamilyFilter([node.id], 'limit')}><Filter size={13} /><span className="fam-btn-label"> Limit analysis</span></button>
          <button className="btn btn-sm" disabled={!hasCase} title={hasCase ? 'Mark remedies of this group in the analysis' : 'Open a case first'} aria-label="Highlight in analysis" onClick={() => applyFamilyFilter([node.id], 'highlight')}><Highlighter size={13} /><span className="fam-btn-label"> Highlight</span></button>
          <button className="btn btn-sm" disabled={remedy == null} title="Open the selected remedy (Enter)" aria-label="Open remedy" onClick={() => remedy != null && openRemedy(remedy)}><ExternalLink size={13} /><span className="fam-btn-label"> Open remedy</span></button>
        </div>
      </header>

      {analysis && (analysis.filterLabel || analysis.highlightLabel) && (
        <div className="fam-active" role="status">
          {analysis.filterLabel && analysis.remedyFilter && (
            <span className="fam-pill"><Filter size={11} aria-hidden="true" /> Limited to {analysis.filterLabel}
              <button aria-label="Remove family limit" onClick={() => clearFamilyFilter('limit', cid)}><X size={11} /></button></span>
          )}
          {analysis.highlightLabel && analysis.highlight && (
            <span className="fam-pill hl"><Highlighter size={11} aria-hidden="true" /> Highlighting {analysis.highlightLabel}
              <button aria-label="Remove family highlight" onClick={() => clearFamilyFilter('highlight', cid)}><X size={11} /></button></span>
          )}
        </div>
      )}

      {children.length > 0 && <SubGroups groups={children} onSelect={onSelect} onGroupMenu={onGroupMenu} />}

      <div className="fam-table-tools">
        <input className="input fam-filter" placeholder="Filter remedies" aria-label="Filter remedies of this group" value={filter} onChange={e => setFilter(e.target.value)}
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.closest('.fam-detail')?.querySelector('.fam-table') as HTMLElement | null)?.focus() } }} />
        <span className="fam-muted">
          {filter ? `${items.length} shown · ` : ''}{rep ? <span title={`Rubric counts from ${rep.info.title}`}>Counts: {rep.info.title}</span> : repError ? 'Rubric counts unavailable' : <><LoaderCircle size={11} className="spin" aria-hidden="true" /> Loading rubric counts…</>}
        </span>
      </div>
      <RemedyTable
        items={items}
        stats={stats}
        sort={sort}
        setSort={setSort}
        selected={remedy}
        setSelected={setRemedy}
        inLimit={inLimit}
        onOpen={openRemedy}
        onMenu={(rid, e) => cm.open(e, remedyMenu(rid))}
        onMenuAt={(rid, el) => cm.openAt(el, remedyMenu(rid))}
      />
      {cm.element}
    </div>
  )
}

/** Collapsed height of the sub-group chips: two rows. */
const CHIP_ROWS_H = 2 * 22 + 5

/**
 * Sub-group chips. Collapsed to two rows; when some chips do not fit, a "+N more" toggle says how many
 * are hidden and expands the list, so no sub-group is ever silently cut off.
 */
function SubGroups({ groups, onSelect, onGroupMenu }: { groups: Node[]; onSelect: (id: string) => void; onGroupMenu: (id: string, e: MouseEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // ids of the chips below the two collapsed rows (measured; the layout is the same open or collapsed)
  const [clipped, setClipped] = useState<ReadonlySet<string>>(new Set())
  const hidden = clipped.size
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const count = () => {
      const chips = [...el.children] as HTMLElement[]
      const first = chips[0]?.offsetTop ?? 0
      const next = new Set(chips.filter(c => c.offsetTop - first >= CHIP_ROWS_H - 4).map(c => c.dataset.gid!))
      setClipped(prev => (prev.size === next.size && [...next].every(x => prev.has(x)) ? prev : next))
    }
    count()
    const ro = new ResizeObserver(count)
    ro.observe(el)
    return () => ro.disconnect()
  }, [groups])
  const collapsed = !open && hidden > 0
  return (
    <div className="fam-children-wrap">
      <div ref={ref} className={`fam-children${open ? ' open' : ''}`} aria-label="Sub-groups" role="group" style={open ? undefined : { maxHeight: CHIP_ROWS_H }}>
        {groups.map(c => (
          <button key={c.id} className="fam-chip" onClick={() => onSelect(c.id)} onContextMenu={e => onGroupMenu(c.id, e)} title={c.note ?? c.name}
            tabIndex={collapsed && clipped.has(c.id) ? -1 : undefined} aria-hidden={collapsed && clipped.has(c.id) ? true : undefined} data-gid={c.id}>
            <span className="fam-chip-name">{c.name}</span> <span className="fam-count">{c.remedies.length}</span>
          </button>
        ))}
      </div>
      {(hidden > 0 || open) && (
        <button className="fam-chip fam-chip-more" aria-expanded={open} onClick={() => setOpen(o => !o)}
          title={open ? 'Show fewer sub-groups' : `Show all ${groups.length} sub-groups`}>
          {open ? <>Show less <ChevronUp size={12} aria-hidden="true" /></> : <>+{hidden} more <ChevronDown size={12} aria-hidden="true" /></>}
        </button>
      )}
    </div>
  )
}

interface Item { id: number; abbrev: string; name: string; primary: string }

function RemedyTable({ items, stats, sort, setSort, selected, setSelected, inLimit, onOpen, onMenu, onMenuAt }: {
  items: Item[]; stats: Map<number, RubricStat> | null; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void
  selected: number | null; setSelected: (r: number | null) => void; inLimit: Set<number> | null
  onOpen: (r: number) => void; onMenu: (r: number, e: MouseEvent) => void; onMenuAt: (r: number, el: HTMLElement) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [h, setH] = useState(400)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.clientHeight)
    const ro = new ResizeObserver(() => setH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const idx = selected == null ? -1 : items.findIndex(x => x.id === selected)
  useEffect(() => {
    const el = ref.current
    if (!el || idx < 0) return
    const y = idx * ROW_H
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight
  }, [idx])

  const headers: { key: SortKey; label: string; short?: string; num?: boolean; title: string }[] = [
    { key: 'abbrev', label: 'Abbrev', short: 'Abbr', title: 'Sort by abbreviation' },
    { key: 'name', label: 'Remedy', title: 'Sort by name' },
    { key: 'primary', label: 'Classified under', title: 'Main classification of the remedy (when different from this group)' },
    { key: 'total', label: 'Rubrics', short: 'Rubr', num: true, title: 'Rubrics containing the remedy in the default repertory' },
    { key: 'high', label: 'G3–4', num: true, title: 'Rubrics where the remedy is in bold (grade 3 or 4)' },
  ]
  const move = (i: number) => { if (items.length) setSelected(items[Math.max(0, Math.min(items.length - 1, i))].id) }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return // keys on a column header button are its own
    const page = Math.max(1, Math.floor(h / ROW_H) - 1)
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(idx + 1); break
      case 'ArrowUp': e.preventDefault(); move(idx - 1); break
      case 'PageDown': e.preventDefault(); move(idx + page); break
      case 'PageUp': e.preventDefault(); move(idx - page); break
      case 'Home': e.preventDefault(); move(0); break
      case 'End': e.preventDefault(); move(items.length - 1); break
      case 'Enter': if (selected != null) { e.preventDefault(); onOpen(selected) } break
      case 'ContextMenu':
      case 'F10':
        if ((e.key === 'ContextMenu' || e.shiftKey) && selected != null) {
          e.preventDefault()
          const el = ref.current?.querySelector<HTMLElement>(`[data-rid="${selected}"]`)
          if (el) onMenuAt(selected, el)
        }
        break
    }
  }
  const start = Math.max(0, Math.floor(top / ROW_H) - 10)
  const end = Math.min(items.length, Math.ceil((top + h) / ROW_H) + 10)

  // one grid: the header row and the body are rowgroups, so the column headers belong to the grid
  return (
    <div
      className="fam-table"
      role="grid"
      aria-label="Remedies of the group"
      aria-rowcount={items.length + 1}
      aria-colcount={headers.length}
      tabIndex={0}
      aria-activedescendant={idx >= 0 ? `famrow-${items[idx].id}` : undefined}
      onKeyDown={onKey}
      onFocus={e => { if (e.target === e.currentTarget && idx < 0 && items.length) move(0) }}
    >
      <div className="fam-thead" role="rowgroup">
        <div className="fam-hrow" role="row" aria-rowindex={1}>
          {headers.map((hd, c) => (
            <div key={hd.key} role="columnheader" aria-colindex={c + 1} aria-label={hd.label} className={`fam-thc fam-c-${hd.key}`}
              aria-sort={sort.key === hd.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
              <button className={`fam-th${hd.num ? ' num' : ''}`} title={hd.title}
                onClick={() => setSort({ key: hd.key, dir: sort.key === hd.key ? (sort.dir === 1 ? -1 : 1) : (hd.num ? -1 : 1) })}>
                <span className="fam-th-label">{hd.label}</span>{hd.short && <span className="fam-th-short" aria-hidden="true">{hd.short}</span>}{sort.key === hd.key && (sort.dir === 1 ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />)}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div ref={ref} className="fam-tbody" role="rowgroup" onScroll={e => setTop(e.currentTarget.scrollTop)}>
        {items.length === 0 && <div className="empty-state"><strong>No remedy matches the filter</strong></div>}
        <div style={{ height: items.length * ROW_H, position: 'relative' }}>
          {items.slice(start, end).map((x, k) => {
            const s = stats?.get(x.id)
            const out = inLimit && !inLimit.has(x.id)
            return (
              <div key={x.id} id={`famrow-${x.id}`} data-rid={x.id} role="row" aria-rowindex={start + k + 2} aria-selected={x.id === selected}
                className={`fam-tr${(start + k) % 2 ? ' odd' : ''}${x.id === selected ? ' on' : ''}${out ? ' out' : ''}`} style={{ top: (start + k) * ROW_H }}
                onMouseDown={() => setSelected(x.id)} onDoubleClick={() => onOpen(x.id)} onContextMenu={e => { setSelected(x.id); onMenu(x.id, e) }}
                title={out ? 'Outside the current analysis limit' : undefined}>
                <span role="gridcell" aria-colindex={1} className="fam-td fam-c-abbrev">{x.abbrev}</span>
                <span role="gridcell" aria-colindex={2} className="fam-td fam-c-name">{x.name}</span>
                <span role="gridcell" aria-colindex={3} className="fam-td fam-c-primary">{x.primary}</span>
                <span role="gridcell" aria-colindex={4} className="fam-td fam-c-total num">{s ? s.total || '–' : ''}</span>
                <span role="gridcell" aria-colindex={5} className="fam-td fam-c-high num">{s ? (s.high ? <b>{s.high}</b> : '–') : ''}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── remedy search hits ───────────────────────────

/** Virtualised list of remedies matching the search (all of them, not a capped sample). */
function RemedyHits({ index, hits, query, active, setActive, onPick, idPrefix, onExitStart }: {
  index: FamilyIndex; hits: { id: number; abbrev: string; name: string }[]; query: string; active: number
  setActive: (i: number | ((i: number) => number)) => void; onPick: (id: number) => void; idPrefix: string
  /** ArrowUp on the first remedy. */
  onExitStart: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const h = useHeight(ref)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const y = active * ROW_H
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight
  }, [active])
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0 }, [query])
  const page = Math.max(1, Math.floor(h / ROW_H) - 1)
  const start = Math.max(0, Math.floor(top / ROW_H) - 8)
  const end = Math.min(hits.length, Math.ceil((top + h) / ROW_H) + 8)
  return (
    <div className="fam-remhits">
      <div className="pane-head">Remedies <span className="badge">{hits.length}</span></div>
      <div ref={ref} className="fam-remhits-list" role="listbox" aria-label="Matching remedies" tabIndex={0}
        aria-activedescendant={`${idPrefix}-${hits[active].id}`}
        onScroll={e => setTop(e.currentTarget.scrollTop)}
        onKeyDown={e => {
          const go = (i: number) => { e.preventDefault(); setActive(Math.max(0, Math.min(hits.length - 1, i))) }
          if (e.key === 'ArrowDown') go(active + 1)
          else if (e.key === 'ArrowUp') { if (active === 0) { e.preventDefault(); onExitStart() } else go(active - 1) }
          else if (e.key === 'PageDown') go(active + page)
          else if (e.key === 'PageUp') go(active - page)
          else if (e.key === 'Home') go(0)
          else if (e.key === 'End') go(hits.length - 1)
          else if (e.key === 'Enter') { e.preventDefault(); onPick(hits[active].id) }
        }}>
        <div style={{ height: hits.length * ROW_H, position: 'relative' }}>
          {hits.slice(start, end).map((r, k) => {
            const i = start + k
            const prim = index.primaryGroupOf(r.id)
            return (
              <div key={r.id} id={`${idPrefix}-${r.id}`} role="option" aria-selected={i === active} className={`fam-remhit${i === active ? ' on' : ''}`}
                style={{ top: i * ROW_H }} onMouseDown={() => setActive(i)} onClick={() => onPick(r.id)} title={prim ? index.pathLabel(prim.id) : ''}>
                <strong><Mark text={r.abbrev} q={query} /></strong>
                <span className="fam-ellipsis"><Mark text={r.name} q={query} /></span>
                <span className="fam-muted fam-ellipsis">{prim?.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── size hooks ───────────────────────────

function useSize(ref: RefObject<HTMLElement | null>, dim: 'clientWidth' | 'clientHeight', initial: number) {
  const [v, setV] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setV(el[dim])
    const ro = new ResizeObserver(() => setV(el[dim]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, dim])
  return v
}
const useWidth = (ref: RefObject<HTMLElement | null>) => useSize(ref, 'clientWidth', 0)
const useHeight = (ref: RefObject<HTMLElement | null>) => useSize(ref, 'clientHeight', 300)
