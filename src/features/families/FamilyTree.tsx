import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import {
  Atom, Biohazard, Bird, Bug, ChevronDown, ChevronRight, CircleDot, Droplets, FlaskConical, Fish, Gem, HeartPulse, Layers,
  Leaf, Microscope, Mountain, PawPrint, Shell, Sparkles, Sprout, TreePine, Waves, Zap,
} from 'lucide-react'
import { rowPositions } from './model'
import type { FamilyIndex, Node, TreeRow } from './model'

export const ROW_H = 24

const KINGDOM_ICON: Record<string, typeof Leaf> = {
  'k:plant': Leaf, 'k:mineral': Gem, 'k:animal': PawPrint, 'k:fungus': Sprout, 'k:nosode': Biohazard, 'k:sarcode': HeartPulse,
  'k:bacteria': Microscope, 'k:impon': Zap, 'k:other': FlaskConical, theme: Sparkles,
}
const GROUP_ICON: Record<string, typeof Leaf> = {
  'animal:birds': Bird, 'animal:fish': Fish, 'animal:insects': Bug, 'animal:molluscs': Shell, 'theme:sea': Waves,
  'mineral:waters': Droplets, 'mineral:rocks': Mountain, 'plant:clade:gymnosperms': TreePine, 'mineral:periods': Atom,
}

/** Icon for a group: its own, else by kind, else its kingdom's. */
export function GroupIcon({ node, size = 14 }: { node: Node; size?: number }) {
  const I = GROUP_ICON[node.id] ?? KINGDOM_ICON[node.id] ?? (node.kind === 'element' ? Atom : node.kind === 'salt' ? Layers : node.depth === 0 ? CircleDot : null)
  if (I) return <I size={size} aria-hidden="true" className="fam-icon" />
  const K = KINGDOM_ICON[node.root] ?? CircleDot
  return <K size={size} aria-hidden="true" className="fam-icon fam-icon-dim" />
}

interface Props {
  index: FamilyIndex
  rows: TreeRow[]
  /** Focused / selected group. */
  active: string | null
  onActivate: (id: string) => void
  onToggle: (id: string, expand?: boolean) => void
  /** Checkbox mode (filter dialog). */
  checked?: ReadonlySet<string>
  onCheck?: (id: string) => void
  onContextMenu?: (id: string, e: MouseEvent | { clientX: number; clientY: number; preventDefault: () => void }, el: HTMLElement | null) => void
  /** Enter on a row. */
  onEnter?: (id: string) => void
  /** Double click on a row. */
  onOpen?: (id: string) => void
  label: string
  idPrefix: string
  query?: string
  empty?: ReactNode
  /** Extra classes on the scroll container. */
  className?: string
  /** ArrowDown on the last row (e.g. move on to a list below the tree). */
  onExitEnd?: () => void
  /** ArrowUp on the first row (e.g. back to the search box). */
  onExitStart?: () => void
}

/** Keyboard-navigable virtualised tree (role="tree", aria-activedescendant). */
export function FamilyTree({ index, rows, active, onActivate, onToggle, checked, onCheck, onContextMenu, onEnter, onOpen, label, idPrefix, query, empty, className, onExitEnd, onExitStart }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [h, setH] = useState(400)
  const typeahead = useRef({ text: '', at: 0 })
  // latest active id, read after focus settles (a caller may select and focus in the same tick)
  const activeRef = useRef(active)
  activeRef.current = active

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.clientHeight)
    const ro = new ResizeObserver(() => setH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeIndex = active ? rows.findIndex(r => r.id === active) : -1
  const positions = useMemo(() => rowPositions(rows), [rows])

  // keep the active row in view
  useEffect(() => {
    const el = ref.current
    if (!el || activeIndex < 0) return
    const y = activeIndex * ROW_H
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight
  }, [activeIndex])

  const move = (i: number) => {
    if (!rows.length) return
    const j = Math.max(0, Math.min(rows.length - 1, i))
    onActivate(rows[j].id)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // a key right after focus (before the focus handler picked a row) acts on the first row
    const act = activeIndex < 0 && rows.length > 0 && [' ', 'Enter', 'ContextMenu', 'F10'].includes(e.key)
    if (act) onActivate(rows[0].id)
    const i = act ? 0 : activeIndex
    const row = i >= 0 ? rows[i] : null
    const page = Math.max(1, Math.floor(h / ROW_H) - 1)
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if ((rows.length === 0 || i === rows.length - 1) && onExitEnd) onExitEnd()
        else move(i < 0 ? 0 : i + 1)
        return
      case 'ArrowUp':
        e.preventDefault()
        if ((rows.length === 0 || i === 0) && onExitStart) onExitStart()
        else move(i < 0 ? 0 : i - 1)
        return
      case 'PageDown': e.preventDefault(); move(i + page); return
      case 'PageUp': e.preventDefault(); move(i - page); return
      case 'Home': e.preventDefault(); move(0); return
      case 'End': e.preventDefault(); move(rows.length - 1); return
      case 'ArrowRight':
        e.preventDefault()
        if (!row) return move(0)
        if (row.hasChildren && !row.expanded) onToggle(row.id, true)
        else if (row.expanded && rows[i + 1]?.depth === row.depth + 1) move(i + 1)
        return
      case 'ArrowLeft': {
        e.preventDefault()
        if (!row) return
        if (row.expanded && row.hasChildren) { onToggle(row.id, false); return }
        const parent = index.get(row.id)?.parent
        if (parent) onActivate(parent)
        return
      }
      case '*': {
        // expand all siblings (WAI-ARIA tree pattern)
        e.preventDefault()
        if (!row) return
        const p = index.get(row.id)?.parent
        const sibs = p ? index.get(p)!.children : index.roots
        for (const s of sibs) if (index.get(s)!.children.length) onToggle(s, true)
        return
      }
      case ' ':
        if (onCheck && row) { e.preventDefault(); onCheck(row.id) }
        return
      case 'Enter':
        if (e.ctrlKey || e.metaKey || e.altKey) return // modified Enter belongs to the container (e.g. Ctrl+Enter applies a dialog)
        if (row && onEnter) { e.preventDefault(); onEnter(row.id) }
        return
      case 'ContextMenu':
        if (row && onContextMenu) { e.preventDefault(); onContextMenu(row.id, fakeEvent(rowEl(row.id)), rowEl(row.id)) }
        return
      case 'F10':
        if (e.shiftKey && row && onContextMenu) { e.preventDefault(); onContextMenu(row.id, fakeEvent(rowEl(row.id)), rowEl(row.id)) }
        return
    }
    // type-ahead: jump to the next row whose name starts with the typed text
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      const t = typeahead.current
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
      t.at = now
      const start = t.text.length === 1 ? i + 1 : Math.max(0, i)
      for (let k = 0; k < rows.length; k++) {
        const r = rows[(start + k) % rows.length]
        if (index.get(r.id)!.name.toLowerCase().startsWith(t.text)) { onActivate(r.id); break }
      }
    }
  }

  const rowEl = (id: string) => ref.current?.querySelector<HTMLElement>(`[data-gid="${CSS.escape(id)}"]`) ?? null
  const fakeEvent = (el: HTMLElement | null) => {
    const r = el?.getBoundingClientRect() ?? ref.current!.getBoundingClientRect()
    return { clientX: r.left + 24, clientY: r.bottom, preventDefault: () => {} }
  }

  const start = Math.max(0, Math.floor(top / ROW_H) - 8)
  const end = Math.min(rows.length, Math.ceil((top + h) / ROW_H) + 8)
  const q = query?.trim()

  return (
    <div
      ref={ref}
      className={`fam-tree${className ? ` ${className}` : ''}`}
      role="tree"
      aria-label={label}
      aria-multiselectable={checked ? true : undefined}
      tabIndex={0}
      aria-activedescendant={activeIndex >= 0 ? `${idPrefix}-${rows[activeIndex].id}` : undefined}
      onKeyDown={onKey}
      onFocus={() => requestAnimationFrame(() => { if (!activeRef.current && rows.length) onActivate(rows[0].id) })}
      onScroll={e => setTop(e.currentTarget.scrollTop)}
    >
      {rows.length === 0 && (empty ?? <div className="empty-state"><strong>No groups</strong></div>)}
      <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
        {rows.slice(start, end).map((r, k) => {
          const n = index.get(r.id)!
          const on = r.id === active
          const isChecked = checked?.has(r.id)
          return (
            <div
              key={r.id}
              id={`${idPrefix}-${r.id}`}
              data-gid={r.id}
              role="treeitem"
              aria-level={r.depth + 1}
              aria-setsize={positions[start + k].size}
              aria-posinset={positions[start + k].pos}
              aria-expanded={r.hasChildren ? r.expanded : undefined}
              aria-selected={checked ? !!isChecked : on}
              className={`fam-row${on ? ' on' : ''}${r.match ? ' match' : ''}${n.depth === 0 ? ' root' : ''}`}
              style={{ top: (start + k) * ROW_H, paddingLeft: 4 + r.depth * 14 }}
              onMouseDown={e => { if (e.button === 0) onActivate(r.id) }}
              onDoubleClick={() => { if (onOpen) onOpen(r.id); else if (r.hasChildren) onToggle(r.id) }}
              onContextMenu={e => { onActivate(r.id); onContextMenu?.(r.id, e, e.currentTarget) }}
              title={index.pathLabel(r.id)}
            >
              <span
                className={`fam-twist${r.hasChildren ? '' : ' leaf'}`}
                aria-hidden="true"
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); if (r.hasChildren) { onActivate(r.id); onToggle(r.id) } }}
              >
                {r.hasChildren && (r.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
              </span>
              {checked && (
                <input
                  type="checkbox"
                  className="fam-check"
                  tabIndex={-1}
                  aria-label={`Select ${n.name}`}
                  checked={!!isChecked}
                  onChange={() => onCheck?.(r.id)}
                  onMouseDown={e => e.stopPropagation()}
                />
              )}
              <GroupIcon node={n} />
              <span className="fam-name">{q && r.match ? <Mark text={n.name} q={q} /> : n.name}</span>
              {n.note && <span className="fam-note">{n.note}</span>}
              <span className="fam-count" aria-label={`${n.remedies.length} remedies`}>{n.remedies.length}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Index of the first occurrence of `w` at a word start in `lower`, else of any occurrence (abbreviations like "nat-m"). */
function wordStart(lower: string, w: string): number {
  for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1])) return i
  }
  return lower.indexOf(w)
}

/** Emphasise the first word-start occurrence of each query word (search matches word starts). */
export function Mark({ text, q }: { text: string; q: string }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  const ranges: [number, number][] = []
  for (const w of words) {
    const i = wordStart(lower, w)
    if (i >= 0) ranges.push([i, i + w.length])
  }
  if (!ranges.length) return <>{text}</>
  ranges.sort((a, b) => a[0] - b[0])
  const out: ReactNode[] = []
  let at = 0
  ranges.forEach(([a, b], k) => {
    if (a < at) return
    out.push(text.slice(at, a), <mark key={k}>{text.slice(a, b)}</mark>)
    at = b
  })
  out.push(text.slice(at))
  return <>{out}</>
}
