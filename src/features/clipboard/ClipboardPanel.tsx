import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { BarChart3, ChevronDown, ClipboardList, MoreHorizontal, Plus, StickyNote, UserPlus, Users, AlertTriangle } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import { formatKeys, getCommand, isEnabled, onCommandsChanged, runCommand } from '../../commands/registry'
import type { Clipboard, Symptom, Weight } from '../../engine/model'
import type { Consultation } from '../../state/patients'
import { actions, useApp, selectActiveConsultation, selectActiveClipboard, CLIPBOARD_COLORS, MAX_CLIPBOARDS } from '../../state/store'
import { MenuList, useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { RUBRIC_MIME, SORT_LABELS, SYMPTOM_MIME, clickSelect, clipboardStats, moveIdsBefore, parseRubricDrop, parseRubricRef } from './logic'
import type { SortMode, SymptomDragPayload } from './logic'
import { rubricLabel, useRepertoriesReady } from './labels'
import * as ops from './ops'
import './clipboard.css'

const COLOR_NAMES = ['Blue', 'Red', 'Green', 'Amber', 'Purple', 'Teal', 'Orange', 'Grey', 'Pink', 'Brown', 'Emerald', 'Lime']
const GROUP_LETTERS = ['a', 'b', 'c', 'd', 'e']

/** Re-render when the command registry changes (enablement of footer buttons). */
function useCommandsVersion() {
  const [, force] = useState(0)
  useEffect(() => onCommandsChanged(() => force(x => x + 1)), [])
}

export function ClipboardPanel() {
  const consultation = useApp(selectActiveConsultation)
  const clipboard = useApp(selectActiveClipboard)
  const cm = useContextMenu()
  useCommandsVersion()

  return (
    <div className="cbp" data-testid="clipboard-panel">
      <CaseHeader consultation={consultation} />
      {consultation && clipboard ? (
        <>
          <ChipStrip consultation={consultation} active={clipboard} openMenu={cm.open} openMenuAt={cm.openAt} />
          <SymptomList clipboard={clipboard} consultation={consultation} openMenu={cm.open} openMenuAt={cm.openAt} />
          <Footer clipboard={clipboard} />
        </>
      ) : <NoCase />}
      {cm.element}
    </div>
  )
}

// ───────────────────────── case header ─────────────────────────

function patientName(p: { firstName: string; lastName: string } | undefined) {
  if (!p) return 'Unknown patient'
  return [p.lastName, p.firstName].filter(Boolean).join(', ') || 'Unnamed patient'
}

function CaseHeader({ consultation }: { consultation: Consultation | null }) {
  const patients = useApp(s => s.patients)
  const consultations = useApp(s => s.consultations)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const patient = consultation ? patients[consultation.patientId] : undefined

  const items = useMemo((): MenuItem[] => {
    const byPatient = new Map<string, Consultation[]>()
    for (const c of Object.values(consultations)) {
      const list = byPatient.get(c.patientId) ?? []
      list.push(c)
      byPatient.set(c.patientId, list)
    }
    const groups = [...byPatient.entries()]
      .map(([pid, list]) => ({ pid, list: list.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt), last: Math.max(...list.map(c => c.updatedAt)) }))
      .sort((a, b) => (a.pid === consultation?.patientId ? -1 : b.pid === consultation?.patientId ? 1 : b.last - a.last))
      .slice(0, 12)
    const out: MenuItem[] = []
    for (const g of groups) {
      out.push({ type: 'label', label: patientName(patients[g.pid]) })
      for (const c of g.list.slice(0, 6)) out.push({ label: `${c.title || 'Consultation'} · ${c.date}`, checked: c.id === consultation?.id, run: () => actions.setActiveConsultation(c.id) })
    }
    if (out.length) out.push({ type: 'separator' })
    out.push({ label: 'New case…', run: ops.newCase })
    if (consultation) {
      out.push({ label: 'New consultation for this patient', run: () => actions.createConsultation(consultation.patientId, { title: 'Follow-up', kind: 'follow-up' }) })
      out.push({ label: 'Open patient file', run: () => actions.openTab({ kind: 'patient', patientId: consultation.patientId }) })
      out.push({ type: 'separator' })
      out.push({ label: 'Close case', run: () => actions.setActiveConsultation(null) })
    }
    return out
  }, [consultations, patients, consultation])

  const open = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r) setMenu({ x: r.left, y: r.bottom + 2 })
  }

  return (
    <div className="cbp-case">
      <button
        ref={btn} className="cbp-case-btn" aria-haspopup="menu" aria-expanded={!!menu} aria-label="Switch case"
        onClick={open}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); open() } }}
      >
        {consultation ? (
          <>
            <span className="cbp-case-patient">{patientName(patient)}</span>
            <span className="cbp-case-cons">{consultation.title || 'Consultation'} · {consultation.date}</span>
          </>
        ) : <span className="cbp-case-none">No active case</span>}
        <ChevronDown size={14} className="cbp-case-caret" />
      </button>
      <button className="icon-btn" title="New case (patient and consultation)" aria-label="New case" onClick={ops.newCase}><UserPlus size={15} /></button>
      {menu && <MenuList items={items} x={menu.x} y={menu.y} label="Cases" onClose={() => { setMenu(null); btn.current?.focus() }} />}
    </div>
  )
}

function NoCase() {
  const hasPatients = getCommand('patients.open')
  return (
    <div className="empty-state cbp-empty">
      <ClipboardList size={28} strokeWidth={1.5} />
      <strong>No active case</strong>
      <p>Symptoms are collected on clipboards that belong to a patient's consultation. Open a case to start taking rubrics.</p>
      <div className="cbp-empty-actions">
        <button className="btn btn-primary" onClick={ops.newCase}><UserPlus size={14} />New case</button>
        {hasPatients && <button className="btn" onClick={() => runCommand('patients.open')}><Users size={14} />Patients</button>}
      </div>
    </div>
  )
}

// ───────────────────────── clipboard chips ─────────────────────────

type OpenMenu = (e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation?: () => void }, items: MenuItem[]) => void
type OpenMenuAt = (el: HTMLElement, items: MenuItem[]) => void

function clipboardMenu(cb: Clipboard, consultation: Consultation): MenuItem[] {
  const count = consultation.clipboards.length
  const activeId = selectActiveClipboard(useApp.getState())?.id
  const inAnalysis = consultation.analysis.clipboardIds.includes(cb.id)
  return [
    { label: 'Set as default', checked: cb.id === activeId, run: () => actions.setActiveClipboard(cb.id) },
    { label: 'Include in analysis', checked: inAnalysis, run: () => ops.toggleInAnalysis(cb.id) },
    { type: 'separator' },
    { label: 'Rename…', run: () => ops.startRename(cb.id) },
    { label: 'Colour', submenu: CLIPBOARD_COLORS.map((c, i) => ({ label: COLOR_NAMES[i] ?? c, checked: cb.color === c, run: () => actions.recolorClipboard(cb.id, c) })) },
    { label: 'Sort symptoms', disabled: cb.symptoms.length < 2, submenu: (Object.keys(SORT_LABELS) as SortMode[]).map(m => ({ label: SORT_LABELS[m], run: () => { actions.setActiveClipboard(cb.id); void ops.sortActive(m) } })) },
    { type: 'separator' },
    { label: 'New clipboard', disabled: count >= MAX_CLIPBOARDS, run: ops.newClipboard },
    { label: 'Clear clipboard', danger: true, disabled: !cb.symptoms.length, run: () => ops.clearClipboard(cb.id) },
    { label: 'Delete clipboard', danger: true, disabled: count <= 1, run: () => ops.deleteClipboard(cb.id) },
  ]
}

function dragKind(e: DragEvent): 'symptoms' | 'rubrics' | null {
  const types = e.dataTransfer.types
  if (types.includes(SYMPTOM_MIME)) return 'symptoms'
  if (types.includes(RUBRIC_MIME)) return 'rubrics'
  return null
}
const copyModifier = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.altKey || e.ctrlKey || e.metaKey

function ChipStrip({ consultation, active, openMenu, openMenuAt }: { consultation: Consultation; active: Clipboard; openMenu: OpenMenu; openMenuAt: OpenMenuAt }) {
  const renamingId = ops.usePanelUi(s => s.renamingId)
  const [dropId, setDropId] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const more = useRef<HTMLButtonElement>(null)

  const onDrop = (e: DragEvent, cb: Clipboard) => {
    e.preventDefault()
    setDropId(null)
    const sym = e.dataTransfer.getData(SYMPTOM_MIME)
    if (sym) {
      const p = JSON.parse(sym) as SymptomDragPayload
      if (p.clipboardId === cb.id) return
      const copy = copyModifier(e)
      actions.transferSymptoms(p.clipboardId, cb.id, p.ids, copy)
      if (!copy) actions.setSelectedSymptoms([])
      actions.toast(`${p.ids.length} symptom${p.ids.length === 1 ? '' : 's'} ${copy ? 'copied' : 'moved'} to ${cb.name}`, 'success')
      return
    }
    const refsIn = parseRubricDrop(e.dataTransfer.getData(RUBRIC_MIME))
    if (refsIn.length) {
      const n = actions.addRubrics(refsIn, { clipboardId: cb.id })
      actions.toast(n ? `Added ${n} rubric${n === 1 ? '' : 's'} to ${cb.name}` : `Already on ${cb.name}`, n ? 'success' : 'info')
    }
  }

  return (
    <div className="cbp-chips" role="tablist" aria-label="Clipboards">
      {consultation.clipboards.map((cb, i) => {
        const isActive = cb.id === active.id
        const inAnalysis = consultation.analysis.clipboardIds.includes(cb.id)
        const shortcut = i < 9 ? ` · ${formatKeys(`Alt+${i + 1}`)}` : ''
        return (
          <button
            key={cb.id}
            ref={el => { if (el) refs.current.set(cb.id, el); else refs.current.delete(cb.id) }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`cbp-chip${isActive ? ' active' : ''}${dropId === cb.id ? ' drop' : ''}${inAnalysis ? '' : ' off'}`}
            style={{ ['--chip' as string]: cb.color }}
            title={`${cb.name}: ${cb.symptoms.length} symptom${cb.symptoms.length === 1 ? '' : 's'}${inAnalysis ? '' : ' (not in analysis)'}${shortcut}\nDouble-click to rename, Ctrl+click to toggle in analysis`}
            onClick={e => {
              if (e.ctrlKey || e.metaKey) { ops.toggleInAnalysis(cb.id); return }
              if (!isActive) { actions.setActiveClipboard(cb.id); ops.setPanelUi({ cursorId: null, anchorId: null }) }
            }}
            onDoubleClick={() => ops.startRename(cb.id)}
            onContextMenu={e => openMenu(e, clipboardMenu(cb, consultation))}
            onKeyDown={e => {
              const list = consultation.clipboards
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]
                actions.setActiveClipboard(next.id)
                refs.current.get(next.id)?.focus()
              } else if (e.key === 'F2' || (e.key === 'Enter' && isActive && e.altKey)) {
                e.preventDefault(); ops.startRename(cb.id)
              } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
                e.preventDefault(); openMenuAt(e.currentTarget, clipboardMenu(cb, consultation))
              } else if (e.key === 'ArrowDown') {
                e.preventDefault(); ops.focusPanel()
              }
            }}
            onDragOver={e => {
              const k = dragKind(e)
              if (!k) return
              e.preventDefault()
              e.dataTransfer.dropEffect = k === 'rubrics' || copyModifier(e) ? 'copy' : 'move'
              if (dropId !== cb.id) setDropId(cb.id)
            }}
            onDragLeave={() => setDropId(d => (d === cb.id ? null : d))}
            onDrop={e => onDrop(e, cb)}
          >
            <span className="cbp-chip-num">{i + 1}</span>
            {renamingId === cb.id ? <RenameInput cb={cb} /> : <span className="cbp-chip-name">{cb.name}</span>}
            <span className="cbp-chip-count" aria-label={`${cb.symptoms.length} symptoms`}>{cb.symptoms.length}</span>
          </button>
        )
      })}
      <button className="icon-btn cbp-chip-add" title="New clipboard" aria-label="New clipboard" disabled={consultation.clipboards.length >= MAX_CLIPBOARDS} onClick={ops.newClipboard}><Plus size={14} /></button>
      <span className="cbp-grow" />
      <button ref={more} className="icon-btn" title="Clipboard actions" aria-label="Clipboard actions" aria-haspopup="menu" onClick={() => more.current && openMenuAt(more.current, clipboardMenu(active, consultation))}>
        <MoreHorizontal size={15} />
      </button>
    </div>
  )
}

function RenameInput({ cb }: { cb: Clipboard }) {
  const [value, setValue] = useState(cb.name)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const name = value.trim()
    if (commit && name && name !== cb.name) actions.renameClipboard(cb.id, name.slice(0, 40))
    ops.setPanelUi({ renamingId: null })
  }
  return (
    <input
      ref={ref} className="cbp-rename" value={value} aria-label="Clipboard name" maxLength={40}
      size={Math.max(6, value.length)}
      onChange={e => setValue(e.target.value)}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(true); ops.focusPanel() }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); ops.focusPanel() }
      }}
      onBlur={() => finish(true)}
    />
  )
}

// ───────────────────────── symptom list ─────────────────────────

function symptomMenu(consultation: Consultation, clipboard: Clipboard): MenuItem[] {
  const sel = ops.selectedSymptoms()
  const others = consultation.clipboards.filter(c => c.id !== clipboard.id)
  const letters = [...new Set([...GROUP_LETTERS, ...clipboard.symptoms.map(s => s.group).filter((g): g is string => !!g)])].sort()
  const target = (copy: boolean): MenuItem[] => others.length
    ? others.map(c => ({ label: `${consultation.clipboards.indexOf(c) + 1}. ${c.name}`, run: () => ops.transferSelected(c.id, copy) }))
    : [{ label: 'No other clipboards', disabled: true }]
  return [
    { label: 'Change intensity', submenu: [0, 1, 2, 3, 4].map(w => ({ command: `symptom.weight.${w}` })) },
    { label: 'Qualification', submenu: [{ command: 'symptom.eliminatory' }, { command: 'symptom.exclusive' }, { command: 'symptom.causal' }] },
    {
      label: 'Group', submenu: [
        ...letters.map(l => ({ label: `Group ${l}`, keys: 'G', checked: sel.length > 0 && sel.every(s => s.group === l), run: () => ops.setGroup(l) })),
        { label: 'Other letter…', run: ops.startGroupPrompt },
        { type: 'separator' as const },
        { command: 'symptom.ungroup', label: 'No group' },
      ],
    },
    { type: 'separator' },
    { command: 'symptom.combineUnion', label: 'Combine (union)' },
    { command: 'symptom.combineIntersection', label: 'Combine (intersection)' },
    { command: 'symptom.split', label: 'Split' },
    { type: 'separator' },
    { label: 'Move to clipboard', disabled: !others.length, submenu: target(false) },
    { label: 'Copy to clipboard', disabled: !others.length, submenu: target(true) },
    { label: 'Sort', disabled: clipboard.symptoms.length < 2, submenu: (Object.keys(SORT_LABELS) as SortMode[]).map(m => ({ command: `clipboard.sort.${m}`, label: SORT_LABELS[m] })) },
    { command: 'symptom.moveUp', label: 'Move up' },
    { command: 'symptom.moveDown', label: 'Move down' },
    { type: 'separator' },
    { command: 'symptom.note', label: 'Edit note…' },
    { command: 'symptom.open', label: 'Open rubric' },
    { type: 'separator' },
    { command: 'clipboard.deleteSelected', label: sel.length > 1 ? `Remove ${sel.length} symptoms` : 'Remove', danger: true },
  ]
}

function SymptomList({ clipboard, consultation, openMenu, openMenuAt }: { clipboard: Clipboard; consultation: Consultation; openMenu: OpenMenu; openMenuAt: OpenMenuAt }) {
  const catalog = useCatalog()
  const selectedIds = useApp(s => s.selectedSymptomIds)
  const defaultRep = useApp(s => s.settings.defaultRepertory)
  const { cursorId, anchorId, groupPending, focusSeq } = ops.usePanelUi()
  const listRef = useRef<HTMLDivElement>(null)
  const [drop, setDrop] = useState<{ id: string | null; after: boolean } | null>(null)
  const symptoms = clipboard.symptoms
  const order = useMemo(() => symptoms.map(s => s.id), [symptoms])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const reps = useMemo(() => symptoms.flatMap(s => s.rubrics.map(r => parseRubricRef(r).repertory)), [symptoms])
  const { failed } = useRepertoriesReady(catalog, reps)
  const cursorIndex = cursorId ? order.indexOf(cursorId) : -1

  // keep keyboard focus on the cursor row
  const focusRow = (id: string | null) => {
    const el = id ? listRef.current?.querySelector<HTMLElement>(`[data-sid="${id}"]`) : null
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }) } else listRef.current?.focus()
  }
  useEffect(() => {
    if (!focusSeq) return
    const id = cursorIndex >= 0 ? cursorId : (selectedIds.find(x => order.includes(x)) ?? order[0] ?? null)
    if (id && id !== cursorId) ops.setPanelUi({ cursorId: id, anchorId: anchorId ?? id })
    requestAnimationFrame(() => focusRow(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq])
  // after reorders, deletions and cursor moves keep the focused row visible
  useEffect(() => {
    if (!listRef.current?.contains(document.activeElement)) return
    if (cursorId && order.includes(cursorId)) focusRow(cursorId)
    else if (document.activeElement !== listRef.current) listRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorId, order])

  const moveCursor = (to: number, extend: boolean) => {
    if (!order.length) return
    const i = Math.max(0, Math.min(order.length - 1, to))
    const id = order[i]
    if (extend) {
      const a = anchorId && order.includes(anchorId) ? anchorId : cursorId ?? id
      actions.setSelectedSymptoms(clickSelect(order, selectedIds, a, id, 'range').selected)
      ops.setPanelUi({ cursorId: id, anchorId: a })
    } else {
      actions.setSelectedSymptoms([id])
      ops.setPanelUi({ cursorId: id, anchorId: id })
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const mod = e.ctrlKey || e.metaKey
    if (groupPending) {
      if (/^[a-z]$/i.test(e.key) && !mod && !e.altKey) { e.preventDefault(); ops.setGroup(e.key); ops.setPanelUi({ groupPending: false }); return }
      if (e.key === '-' || e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); ops.setGroup(null); ops.setPanelUi({ groupPending: false }); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ops.setPanelUi({ groupPending: false }); return }
      if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) ops.setPanelUi({ groupPending: false })
    }
    if (mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return // move commands
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveCursor(cursorIndex < 0 ? 0 : cursorIndex + 1, e.shiftKey); break
      case 'ArrowUp': e.preventDefault(); moveCursor(cursorIndex < 0 ? 0 : cursorIndex - 1, e.shiftKey); break
      case 'Home': e.preventDefault(); moveCursor(0, e.shiftKey); break
      case 'End': e.preventDefault(); moveCursor(order.length - 1, e.shiftKey); break
      case 'PageDown': e.preventDefault(); moveCursor((cursorIndex < 0 ? 0 : cursorIndex) + 10, e.shiftKey); break
      case 'PageUp': e.preventDefault(); moveCursor((cursorIndex < 0 ? 0 : cursorIndex) - 10, e.shiftKey); break
      case ' ':
        if (cursorId) {
          e.preventDefault()
          if (mod || selected.has(cursorId)) actions.setSelectedSymptoms(selectedIds.filter(x => x !== cursorId))
          else actions.setSelectedSymptoms([...selectedIds, cursorId])
        }
        break
      case 'Escape':
        if (selectedIds.length) { e.preventDefault(); e.stopPropagation(); actions.setSelectedSymptoms([]) }
        break
      case 'ContextMenu':
      case 'F10':
        if (e.key === 'F10' && !e.shiftKey) break
        e.preventDefault()
        if (cursorId && !selected.has(cursorId)) actions.setSelectedSymptoms([cursorId])
        {
          const el = cursorId ? listRef.current?.querySelector<HTMLElement>(`[data-sid="${cursorId}"]`) : null
          if (el) openMenuAt(el, symptomMenu(consultation, clipboard))
        }
        break
    }
  }

  const onRowClick = (e: ReactMouseEvent, id: string) => {
    const mode = e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single'
    const r = clickSelect(order, selectedIds, anchorId, id, mode)
    actions.setSelectedSymptoms(r.selected)
    ops.setPanelUi({ cursorId: id, anchorId: r.anchor })
  }

  // ── drag and drop ──
  const onDragStart = (e: DragEvent, s: Symptom) => {
    let ids = selected.has(s.id) ? order.filter(id => selected.has(id)) : [s.id]
    if (!selected.has(s.id)) { actions.setSelectedSymptoms([s.id]); ops.setPanelUi({ cursorId: s.id, anchorId: s.id }) }
    ids = ids.length ? ids : [s.id]
    const payload: SymptomDragPayload = { clipboardId: clipboard.id, ids }
    e.dataTransfer.setData(SYMPTOM_MIME, JSON.stringify(payload))
    e.dataTransfer.setData('text/plain', symptoms.filter(x => ids.includes(x.id)).map(x => rubricLabel(catalog, x.rubrics[0]).full).join('\n'))
    e.dataTransfer.effectAllowed = 'copyMove'
  }
  const onDragOverRow = (e: DragEvent, id: string) => {
    if (!dragKind(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = dragKind(e) === 'rubrics' ? 'copy' : 'move'
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    if (drop?.id !== id || drop.after !== after) setDrop({ id, after })
  }
  const onDragOverList = (e: DragEvent) => {
    if (!dragKind(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = dragKind(e) === 'rubrics' ? 'copy' : 'move'
    if (drop?.id !== null) setDrop({ id: null, after: true })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const target = drop
    setDrop(null)
    // insertion point: before this id (null = end)
    let beforeId: string | null = null
    if (target?.id) {
      const i = order.indexOf(target.id)
      beforeId = target.after ? order[i + 1] ?? null : target.id
    }
    const sym = e.dataTransfer.getData(SYMPTOM_MIME)
    if (sym) {
      const p = JSON.parse(sym) as SymptomDragPayload
      if (p.clipboardId === clipboard.id) {
        actions.reorderSymptoms(clipboard.id, moveIdsBefore(order, p.ids, beforeId))
      } else {
        actions.transferSymptoms(p.clipboardId, clipboard.id, p.ids, copyModifier(e))
      }
      return
    }
    const refs = parseRubricDrop(e.dataTransfer.getData(RUBRIC_MIME))
    if (!refs.length) return
    const before = new Set(order)
    const n = actions.addRubrics(refs, { clipboardId: clipboard.id })
    if (!n) { actions.toast('Already on this clipboard', 'info'); return }
    const after = selectActiveClipboard(useApp.getState())
    if (!after) return
    const added = after.symptoms.filter(s => !before.has(s.id)).map(s => s.id)
    if (beforeId) actions.reorderSymptoms(clipboard.id, moveIdsBefore(after.symptoms.map(s => s.id), added, beforeId))
    actions.setSelectedSymptoms(added)
    ops.setPanelUi({ cursorId: added[0], anchorId: added[0] })
  }

  return (
    <div
      ref={listRef}
      className={`cbp-list${drop && drop.id === null ? ' drop-end' : ''}`}
      role="listbox"
      aria-label={`${clipboard.name} symptoms`}
      aria-multiselectable="true"
      tabIndex={symptoms.length ? -1 : 0}
      onKeyDown={onKeyDown}
      onDragOver={onDragOverList}
      onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop(null) }}
      onDrop={onDrop}
      onContextMenu={e => { if (e.target === e.currentTarget) openMenu(e, clipboardMenu(clipboard, consultation)) }}
      onClick={e => { if (e.target === e.currentTarget) actions.setSelectedSymptoms([]) }}
    >
      {failed.length > 0 && (
        <div className="cbp-warn" role="alert"><AlertTriangle size={13} />Could not load {failed.join(', ')}; those rubrics show without text.</div>
      )}
      {symptoms.length === 0 ? <EmptyClipboard name={clipboard.name} /> : symptoms.map((s, i) => (
        <SymptomRow
          key={s.id}
          catalog={catalog}
          symptom={s}
          index={i}
          defaultRep={defaultRep}
          selected={selected.has(s.id)}
          cursor={s.id === cursorId}
          tabbable={cursorIndex >= 0 ? s.id === cursorId : i === 0}
          dropBefore={drop?.id === s.id && !drop.after}
          dropAfter={drop?.id === s.id && drop.after}
          onClick={e => onRowClick(e, s.id)}
          onDoubleClick={() => ops.openRubric(s.rubrics[0])}
          onContextMenu={e => {
            if (!selected.has(s.id)) { actions.setSelectedSymptoms([s.id]); ops.setPanelUi({ cursorId: s.id, anchorId: s.id }) }
            else ops.setPanelUi({ cursorId: s.id })
            openMenu(e, symptomMenu(consultation, clipboard))
          }}
          onFocus={() => { if (cursorId !== s.id) ops.setPanelUi({ cursorId: s.id }) }}
          onDragStart={e => onDragStart(e, s)}
          onDragOver={e => onDragOverRow(e, s.id)}
          onDragEnd={() => setDrop(null)}
          onWeight={w => actions.updateSymptom(clipboard.id, s.id, { weight: w })}
        />
      ))}
    </div>
  )
}

function EmptyClipboard({ name }: { name: string }) {
  return (
    <div className="empty-state cbp-empty">
      <ClipboardList size={26} strokeWidth={1.5} />
      <strong>{name} is empty</strong>
      <p>Take rubrics from the repertory:</p>
      <ul className="cbp-howto">
        <li><span className="kbd">+</span> or <span className="kbd">=</span> takes the current rubric at intensity 1</li>
        <li><span className="kbd">F6</span> takes it with options (intensity, qualification, group)</li>
        <li>Drag a rubric onto this list or onto a clipboard tab</li>
      </ul>
    </div>
  )
}

interface RowProps {
  catalog: Catalog
  symptom: Symptom
  index: number
  defaultRep: string
  selected: boolean
  cursor: boolean
  tabbable: boolean
  dropBefore: boolean
  dropAfter: boolean
  onClick: (e: ReactMouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: ReactMouseEvent) => void
  onFocus: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragEnd: () => void
  onWeight: (w: Weight) => void
}

function SymptomRow(p: RowProps) {
  const s = p.symptom
  const combined = s.rubrics.length > 1
  const labels = s.rubrics.map(r => rubricLabel(p.catalog, r))
  const head = labels[0]
  const size = ops.symptomSize(s)
  const reps = [...new Set(labels.map(l => l.repertory))].filter(r => r !== p.defaultRep)
  const op = s.combine === 'union' ? '∪' : '∩'
  const full = combined ? labels.map(l => l.full).join(` ${op} `) : head.full
  const flags = [s.eliminatory && 'eliminative', s.exclusive && 'excluding', s.causal && 'causal', s.group && `group ${s.group}`].filter(Boolean).join(', ')

  return (
    <div
      role="option"
      aria-selected={p.selected}
      aria-label={`${p.index + 1}. ${full}, intensity ${s.weight}${flags ? `, ${flags}` : ''}`}
      data-sid={s.id}
      tabIndex={p.tabbable ? 0 : -1}
      className={`cbp-row${p.selected ? ' sel' : ''}${p.cursor ? ' cursor' : ''}${s.weight === 0 ? ' ignored' : ''}${p.dropBefore ? ' drop-before' : ''}${p.dropAfter ? ' drop-after' : ''}`}
      draggable
      onClick={p.onClick}
      onDoubleClick={p.onDoubleClick}
      onContextMenu={p.onContextMenu}
      onFocus={p.onFocus}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDragEnd={p.onDragEnd}
      title={full + (s.note ? `\n\nNote: ${s.note}` : '')}
    >
      <span className="cbp-idx">{p.index + 1}</span>
      <Intensity weight={s.weight} onChange={p.onWeight} />
      <div className="cbp-text">
        {combined ? (
          <>
            <div className="cbp-combined-head">
              <span className="cbp-op" title={s.combine === 'union' ? 'Combined: union (any rubric)' : 'Combined: intersection (all rubrics)'}>{op}</span>
              {s.combine === 'union' ? 'Union' : 'Intersection'} of {s.rubrics.length} rubrics
            </div>
            <ul className="cbp-parts">
              {labels.map((l, i) => (
                <li key={s.rubrics[i]} onDoubleClick={e => { e.stopPropagation(); ops.openRubric(s.rubrics[i]) }}>
                  <span className="cbp-op-sm">{i === 0 ? '' : op}</span>
                  <RubricText l={l} />
                </li>
              ))}
            </ul>
          </>
        ) : <div className="cbp-path"><RubricText l={head} /></div>}
      </div>
      <div className="cbp-meta">
        {reps.map(r => <span key={r} className="cbp-rep" title={`Repertory: ${r}`}>{r}</span>)}
        {s.eliminatory && <span className="cbp-flag f-e" title="Eliminative: only remedies in this symptom stay in the result">E</span>}
        {s.exclusive && <span className="cbp-flag f-x" title="Excluding: remedies in this symptom are removed from the result">X</span>}
        {s.causal && <span className="cbp-flag f-c" title="Causal symptom (causation / never well since)">C</span>}
        {s.group && <span className="cbp-flag f-g" title={`Group ${s.group}: calculated together with the other symptoms of this group`}>{s.group}</span>}
        {s.note && <span className="cbp-note" title={s.note} aria-label={`Note: ${s.note}`}><StickyNote size={12} /></span>}
        <span className="cbp-size" title={size === null ? 'Loading…' : `${size} remedies`}>{size ?? '…'}</span>
      </div>
    </div>
  )
}

function RubricText({ l }: { l: ReturnType<typeof rubricLabel> }) {
  if (!l.loaded) return <span className="cbp-loading">{l.full}</span>
  return <><span className="cbp-chapter">{l.chapter}</span>{l.rest && <span className="cbp-rest">{l.rest}</span>}</>
}

/** Compact 0–4 intensity control: four ascending bars; click a bar to set, click the only lit bar again for 0. */
function Intensity({ weight, onChange }: { weight: Weight; onChange: (w: Weight) => void }) {
  return (
    <span className={`cbp-int w${weight}`} role="group" aria-label={`Intensity ${weight}`} title={`Intensity ${weight}${weight === 0 ? ' (ignored in analysis)' : ''} · keys 0–4`}>
      {([1, 2, 3, 4] as const).map(n => (
        <span
          key={n}
          className={`cbp-bar${n <= weight ? ' on' : ''}`}
          onClick={e => { e.stopPropagation(); onChange((weight === n && n === 1 ? 0 : n) as Weight) }}
          onDoubleClick={e => e.stopPropagation()}
        />
      ))}
      <span className="cbp-int-num">{weight}</span>
    </span>
  )
}

// ───────────────────────── footer ─────────────────────────

function Footer({ clipboard }: { clipboard: Clipboard }) {
  const selected = useApp(s => s.selectedSymptomIds.filter(id => clipboard.symptoms.some(x => x.id === id)).length)
  const groupPending = ops.usePanelUi(s => s.groupPending)
  const stats = clipboardStats(clipboard.symptoms)
  const analyse = getCommand('analysis.open')
  return (
    <footer className="cbp-foot">
      {groupPending ? (
        <span className="cbp-prompt" role="status">Group: press a letter a–z, <span className="kbd">-</span> to clear, <span className="kbd">Esc</span> to cancel</span>
      ) : (
        <span className="cbp-stats" role="status">
          <b>{stats.total}</b> symptom{stats.total === 1 ? '' : 's'}
          {stats.total > 0 && stats.active !== stats.total && <> · {stats.active} active</>}
          {selected > 0 && <> · {selected} selected</>}
        </span>
      )}
      <span className="cbp-grow" />
      <button className="btn btn-sm btn-primary" disabled={!analyse || !isEnabled(analyse)} onClick={() => runCommand('analysis.open')} title="Analyse the case (F8)">
        <BarChart3 size={13} />Analyse <span className="cbp-key">F8</span>
      </button>
    </footer>
  )
}
