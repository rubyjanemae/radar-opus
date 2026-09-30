import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { BarChart3, ChevronDown, ClipboardList, MoreHorizontal, Plus, StickyNote, UserPlus, Users, AlertTriangle } from 'lucide-react'
import { useCatalog, useRepertories } from '../../data/CatalogContext'
import type { Catalog } from '../../data/catalog'
import { formatKeys, getCommand, isEnabled, onCommandsChanged, runCommand } from '../../commands/registry'
import type { Clipboard, Symptom, Weight } from '../../engine/model'
import type { Consultation } from '../../state/patients'
import { actions, useApp, selectActiveConsultation, selectActiveClipboard, CLIPBOARD_COLORS, MAX_CLIPBOARDS } from '../../state/store'
import { MenuList, useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { parseRef } from '../../data/catalog'
import { onColor } from '../../shell/color'
import { formatDate, patientName } from '../patients/logic'
import { DEFAULT_TAKE } from '../repertory/take'
import { takeRefs } from '../repertory/ops'
import { RUBRIC_MIME, SORT_LABELS, SYMPTOM_MIME, clickSelect, clipboardStats, moveIdsBefore, parseRubricDrop } from './logic'
import type { SortMode, SymptomDragPayload } from './logic'
import { rubricLabel, symptomLabel } from './labels'
import type { RubricLabel } from './labels'
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
          <div className="cbp-tabpanel" role="tabpanel" id={LIST_PANEL_ID} aria-labelledby={`cbp-tab-${clipboard.id}`}>
            <SymptomList clipboard={clipboard} consultation={consultation} openMenu={cm.open} openMenuAt={cm.openAt} />
          </div>
          <Footer clipboard={clipboard} consultation={consultation} />
        </>
      ) : <NoCase />}
      {cm.element}
    </div>
  )
}

// ───────────────────────── case header ─────────────────────────

const UNKNOWN_PATIENT = 'Unknown patient'

const RECENT_PATIENTS = 5
const PATIENT_CONSULTATIONS = 4

function CaseHeader({ consultation }: { consultation: Consultation | null }) {
  const patients = useApp(s => s.patients)
  const consultations = useApp(s => s.consultations)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const patient = consultation ? patients[consultation.patientId] : undefined
  const name = patient ? patientName(patient) : UNKNOWN_PATIENT

  // Actions first (always reachable), then the current patient's consultations, then a few recent patients.
  const items = useMemo((): MenuItem[] => {
    const byPatient = new Map<string, Consultation[]>()
    for (const c of Object.values(consultations)) {
      const list = byPatient.get(c.patientId) ?? []
      list.push(c)
      byPatient.set(c.patientId, list)
    }
    const newest = (list: Consultation[]) => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
    const out: MenuItem[] = [{ label: 'New case…', run: ops.newCase }]
    if (consultation) {
      out.push({ label: 'New consultation for this patient', run: () => actions.createConsultation(consultation.patientId, { title: 'Follow-up', kind: 'follow-up' }) })
      out.push({ label: 'Open patient file', run: () => actions.openTab({ kind: 'patient', patientId: consultation.patientId }) })
      out.push({ label: 'Close case', run: () => actions.setActiveConsultation(null) })
      const own = newest(byPatient.get(consultation.patientId) ?? [])
      if (own.length > 1) {
        out.push({ type: 'separator' }, { type: 'label', label: `${name}: consultations` })
        const shown = own.slice(0, PATIENT_CONSULTATIONS)
        if (!shown.some(c => c.id === consultation.id)) shown[shown.length - 1] = consultation
        for (const c of shown) out.push({ label: `${c.title || 'Consultation'} · ${formatDate(c.date)}`, checked: c.id === consultation.id, run: () => actions.setActiveConsultation(c.id) })
      }
    }
    const others = [...byPatient.entries()]
      .filter(([pid]) => pid !== consultation?.patientId)
      .map(([pid, list]) => ({ pid, latest: newest(list)[0], last: Math.max(...list.map(c => c.updatedAt)) }))
      .sort((a, b) => b.last - a.last)
    if (others.length) {
      out.push({ type: 'separator' }, { type: 'label', label: 'Recent patients' })
      for (const g of others.slice(0, RECENT_PATIENTS)) {
        const p = patients[g.pid]
        out.push({ label: `${p ? patientName(p) : UNKNOWN_PATIENT} · ${formatDate(g.latest.date)}`, run: () => actions.setActiveConsultation(g.latest.id) })
      }
    }
    if (getCommand('patients.open')) {
      out.push({ type: 'separator' }, { label: others.length > RECENT_PATIENTS ? `All patients (${byPatient.size})…` : 'All patients…', command: 'patients.open' })
    }
    return out
  }, [consultations, patients, consultation, name])

  const open = () => {
    const r = btn.current?.getBoundingClientRect()
    if (r) setMenu({ x: r.left, y: r.bottom + 2 })
  }

  return (
    <div className="cbp-case">
      <button
        ref={btn} className="cbp-case-btn" aria-haspopup="menu" aria-expanded={!!menu} aria-label="Switch case"
        title={consultation ? `${name}: ${consultation.title || 'Consultation'}, ${formatDate(consultation.date)}` : 'No active case'}
        onClick={open}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); open() } }}
      >
        {consultation ? (
          <>
            <span className="cbp-case-patient">{name}</span>
            <span className="cbp-case-cons">{consultation.title || 'Consultation'} · {formatDate(consultation.date)}</span>
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
    { label: 'Set as default', keys: 'Alt+Click', checked: cb.id === activeId, run: () => actions.setActiveClipboard(cb.id) },
    { label: 'Include in analysis', checked: inAnalysis, run: () => ops.toggleInAnalysis(cb.id) },
    { type: 'separator' },
    { label: 'Rename…', run: () => ops.startRename(cb.id) },
    { label: 'Colour', submenu: CLIPBOARD_COLORS.map((c, i) => ({ label: COLOR_NAMES[i] ?? c, checked: cb.color === c, run: () => actions.recolorClipboard(cb.id, c) })) },
    { label: 'Sort symptoms', disabled: cb.symptoms.length < 2, submenu: (Object.keys(SORT_LABELS) as SortMode[]).map(m => ({ label: SORT_LABELS[m], run: () => { actions.setActiveClipboard(cb.id); void ops.sortActive(m) } })) },
    { type: 'separator' },
    { label: 'New clipboard', disabled: count >= MAX_CLIPBOARDS, run: ops.newClipboard },
    { label: 'Clear clipboard', danger: true, disabled: !cb.symptoms.length, run: () => ops.clearClipboard(cb.id) },
    { command: 'clipboard.clearAll', danger: true },
    { label: 'Delete clipboard', danger: true, disabled: count <= 1, run: () => { void ops.deleteClipboard(cb.id) } },
  ]
}

function dragKind(e: DragEvent): 'symptoms' | 'rubrics' | null {
  const types = e.dataTransfer.types
  if (types.includes(SYMPTOM_MIME)) return 'symptoms'
  if (types.includes(RUBRIC_MIME)) return 'rubrics'
  return null
}
const copyModifier = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.altKey || e.ctrlKey || e.metaKey

const NOT_IN_ANALYSIS_TIP = 'Not included in the analysis (click it in the analysis toolbar to include)'

/** Above this many clipboards the inactive chips show only number, colour and count (name in the tooltip). */
const COMPACT_CHIPS = 4
export const LIST_PANEL_ID = 'cbp-symptoms'

function ChipStrip({ consultation, active, openMenu, openMenuAt }: { consultation: Consultation; active: Clipboard; openMenu: OpenMenu; openMenuAt: OpenMenuAt }) {
  const renamingId = ops.usePanelUi(s => s.renamingId)
  const [dropId, setDropId] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const more = useRef<HTMLButtonElement>(null)
  const compact = consultation.clipboards.length > COMPACT_CHIPS

  const onDrop = (e: DragEvent, cb: Clipboard) => {
    e.preventDefault()
    setDropId(null)
    const sym = e.dataTransfer.getData(SYMPTOM_MIME)
    if (sym) {
      const p = JSON.parse(sym) as SymptomDragPayload
      if (p.clipboardId === cb.id) return
      const copy = copyModifier(e)
      const { transferred } = actions.transferSymptoms(p.clipboardId, cb.id, p.ids, copy)
      if (!copy) actions.setSelectedSymptoms([])
      if (transferred) actions.toast(`${transferred} symptom${transferred === 1 ? '' : 's'} ${copy ? 'copied' : 'moved'} to ${cb.name}`, 'success')
      return
    }
    const refsIn = parseRubricDrop(e.dataTransfer.getData(RUBRIC_MIME))
    // the standard take: toast with Undo, recent rubrics
    if (refsIn.length) takeRefs(refsIn, { ...DEFAULT_TAKE, clipboard: consultation.clipboards.indexOf(cb) + 1 })
  }

  return (
    <div className={`cbp-chips${compact ? ' compact' : ''}`}>
      <div className="cbp-chip-wrap" role="tablist" aria-label="Clipboards">
        {consultation.clipboards.map((cb, i) => {
          const isActive = cb.id === active.id
          const inAnalysis = consultation.analysis.clipboardIds.includes(cb.id)
          const shortcut = i < 9 ? ` · ${formatKeys(`Alt+${i + 1}`)}` : ''
          const n = cb.symptoms.length
          const showName = !compact || isActive || renamingId === cb.id
          return (
            <button
              key={cb.id}
              ref={el => { if (el) refs.current.set(cb.id, el); else refs.current.delete(cb.id) }}
              role="tab"
              id={`cbp-tab-${cb.id}`}
              aria-selected={isActive}
              aria-controls={isActive ? LIST_PANEL_ID : undefined}
              aria-label={`${i + 1}. ${cb.name}, ${n} symptom${n === 1 ? '' : 's'}${inAnalysis ? '' : ', not in analysis'}`}
              tabIndex={isActive ? 0 : -1}
              className={`cbp-chip${isActive ? ' active' : ''}${dropId === cb.id ? ' drop' : ''}${inAnalysis ? '' : ' off'}${showName ? '' : ' mini'}`}
              style={{ ['--chip' as string]: cb.color, ['--chip-fg' as string]: onColor(cb.color) }}
              title={`${cb.name}: ${n} symptom${n === 1 ? '' : 's'}${shortcut}${inAnalysis ? '' : `\n${NOT_IN_ANALYSIS_TIP}`}\nDouble-click to rename · Ctrl+click: include in analysis · Alt+click: set as default`}
              onClick={e => {
                if (e.ctrlKey || e.metaKey) { ops.toggleInAnalysis(cb.id); return }
                if (!isActive) { actions.setActiveClipboard(cb.id); ops.setPanelUi({ cursorId: null, anchorId: null }) }
                // Alt+click (RadarOpus: set as default) is the same as a plain click here: the active clipboard is the default
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
              {renamingId === cb.id ? <RenameInput cb={cb} /> : showName && <span className="cbp-chip-name">{cb.name}</span>}
              <span className="cbp-chip-count" aria-hidden="true">{n}</span>
            </button>
          )
        })}
      </div>
      <div className="cbp-chip-actions">
        <button className="icon-btn cbp-chip-add" title="New clipboard" aria-label="New clipboard" disabled={consultation.clipboards.length >= MAX_CLIPBOARDS} onClick={ops.newClipboard}><Plus size={14} /></button>
        <button ref={more} className="icon-btn" title="Clipboard actions" aria-label="Clipboard actions" aria-haspopup="menu" onClick={() => more.current && openMenuAt(more.current, clipboardMenu(active, consultation))}>
          <MoreHorizontal size={15} />
        </button>
      </div>
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
    { label: 'Change intensity', submenu: [0, 1, 2, 3, 4].map(w => ({ command: `symptom.weight.${w}`, label: w === 0 ? '0 – ignore' : w === 4 ? '4 – strongest' : String(w) })) },
    { label: 'Qualification', submenu: [{ command: 'symptom.eliminatory' }, { command: 'symptom.exclusive' }, { command: 'symptom.causal' }] },
    {
      label: 'Group', submenu: [
        ...letters.map(l => ({ label: `Group ${l}`, checked: sel.length > 0 && sel.every(s => s.group === l), run: () => ops.setGroup(l) })),
        { command: 'symptom.group', label: 'Other letter…' },
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
  const reps = useMemo(() => symptoms.flatMap(s => s.rubrics.map(r => parseRef(r).repertory)), [symptoms])
  const { version: ready, failed, retry } = useRepertories(reps)
  const failedKey = failed.join('|')
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
    // focus lands a frame later: if it has meanwhile moved somewhere else (a dialog or the command
    // palette opened in between), leave it there instead of stealing it back
    const before = document.activeElement
    requestAnimationFrame(() => {
      const now = document.activeElement
      if (now && now !== before && now !== document.body && !listRef.current?.closest(ops.PANEL_SCOPE)?.contains(now)) return
      focusRow(id)
    })
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
    // modified paging keys belong to the shell (Alt/Ctrl+PageUp/PageDown switch tabs)
    if ((mod || e.altKey) && (e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End')) return
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
    // the insertion point comes from the drop event itself (the last dragover may not have rendered yet)
    const rowEl = (e.target as HTMLElement).closest?.<HTMLElement>('.cbp-row[data-sid]')
    const target = rowEl?.dataset.sid && order.includes(rowEl.dataset.sid)
      ? { id: rowEl.dataset.sid, after: e.clientY > rowEl.getBoundingClientRect().top + rowEl.getBoundingClientRect().height / 2 }
      : null
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
    const n = consultation.clipboards.findIndex(c => c.id === clipboard.id) + 1
    // the standard take (toast with Undo, recents) and the placement at the drop point: one undo step
    const added = actions.transaction(() => {
      if (!takeRefs(refs, { ...DEFAULT_TAKE, clipboard: n })) return []
      const now = useApp.getState().consultations[consultation.id]?.clipboards.find(c => c.id === clipboard.id)
      if (!now) return []
      const fresh = now.symptoms.filter(s => !before.has(s.id)).map(s => s.id)
      if (fresh.length && beforeId) actions.reorderSymptoms(clipboard.id, moveIdsBefore(now.symptoms.map(s => s.id), fresh, beforeId))
      return fresh
    }, 'Take rubrics')
    if (!added.length) return
    actions.setSelectedSymptoms(added)
    ops.setPanelUi({ cursorId: added[0], anchorId: added[0] })
  }

  // Rows are memoised: they get one stable handler object whose methods always call the latest closures.
  const latest = useRef<RowHandlers>(null as unknown as RowHandlers)
  latest.current = {
    click: (e, s) => onRowClick(e, s.id),
    doubleClick: s => ops.openRubric(s.rubrics[0]),
    contextMenu: (e, s) => {
      if (!selected.has(s.id)) { actions.setSelectedSymptoms([s.id]); ops.setPanelUi({ cursorId: s.id, anchorId: s.id }) }
      else ops.setPanelUi({ cursorId: s.id })
      openMenu(e, symptomMenu(consultation, clipboard))
    },
    focus: s => { if (ops.usePanelUi.getState().cursorId !== s.id) ops.setPanelUi({ cursorId: s.id }) },
    dragStart: (e, s) => onDragStart(e, s),
    dragOver: (e, s) => onDragOverRow(e, s.id),
    dragEnd: () => setDrop(null),
    weight: (s, w) => actions.updateSymptom(clipboard.id, s.id, { weight: w }),
  }
  const rowHandlers = useMemo((): RowHandlers => ({
    click: (e, s) => latest.current.click(e, s),
    doubleClick: s => latest.current.doubleClick(s),
    contextMenu: (e, s) => latest.current.contextMenu(e, s),
    focus: s => latest.current.focus(s),
    dragStart: (e, s) => latest.current.dragStart(e, s),
    dragOver: (e, s) => latest.current.dragOver(e, s),
    dragEnd: () => latest.current.dragEnd(),
    weight: (s, w) => latest.current.weight(s, w),
  }), [])

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
        <div className="cbp-warn" role="alert">
          <AlertTriangle size={13} />
          <span className="cbp-warn-text">Could not load {failed.map(a => catalog.repertoryTitle(a)).join(', ')}; those rubrics show without text.</span>
          <button className="btn btn-sm" onClick={retry}>Retry</button>
        </div>
      )}
      {symptoms.length === 0 ? <EmptyClipboard name={clipboard.name} /> : symptoms.map((s, i) => (
        <SymptomRow
          key={s.id}
          catalog={catalog}
          ready={ready}
          failed={failedKey !== '' && s.rubrics.some(r => failed.includes(parseRef(r).repertory))}
          symptom={s}
          index={i}
          defaultRep={defaultRep}
          selected={selected.has(s.id)}
          cursor={s.id === cursorId}
          tabbable={cursorIndex >= 0 ? s.id === cursorId : i === 0}
          dropBefore={drop?.id === s.id && !drop.after}
          dropAfter={drop?.id === s.id && drop.after}
          h={rowHandlers}
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

interface RowHandlers {
  click: (e: ReactMouseEvent, s: Symptom) => void
  doubleClick: (s: Symptom) => void
  contextMenu: (e: ReactMouseEvent, s: Symptom) => void
  focus: (s: Symptom) => void
  dragStart: (e: DragEvent, s: Symptom) => void
  dragOver: (e: DragEvent, s: Symptom) => void
  dragEnd: () => void
  weight: (s: Symptom, w: Weight) => void
}

interface RowProps {
  catalog: Catalog
  /** Number of loaded repertories: labels are recomputed when one arrives. */
  ready: number
  /** A repertory of this symptom failed to load. */
  failed: boolean
  symptom: Symptom
  index: number
  defaultRep: string
  selected: boolean
  cursor: boolean
  tabbable: boolean
  dropBefore: boolean
  dropAfter: boolean
  h: RowHandlers
}

/** Memoised: moving the cursor re-renders only the rows whose selection/cursor state changed. */
const SymptomRow = memo(function SymptomRow(p: RowProps) {
  const s = p.symptom
  const combined = s.rubrics.length > 1
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sl = useMemo(() => symptomLabel(p.catalog, s), [p.catalog, s.rubrics, s.combine, s.label, p.ready])
  const labels = sl.parts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const size = useMemo(() => ops.symptomSize(s), [s.rubrics, s.combine, p.ready])
  const head = labels[0]
  const reps = [...new Set(labels.map(l => l.repertory))].filter(r => r !== p.defaultRep)
  const op = s.combine === 'union' ? '∪' : '∩'
  const text = (l: RubricLabel) => l.loaded ? l.full : l.loading && !p.failed ? `${l.repertoryTitle} (loading)` : `${l.repertoryTitle}, ${l.rest} (unavailable)`
  // the analysis' label once every rubric is readable; loading / unavailable parts say so instead of showing raw refs
  const allLoaded = labels.every(l => l.loaded)
  const full = allLoaded ? sl.full : s.label || labels.map(text).join(` ${op} `)
  const flags = [s.eliminatory && 'eliminative', s.exclusive && 'excluding', s.causal && 'causal', s.group && `group ${s.group}`].filter(Boolean).join(', ')
  const h = p.h

  return (
    <div
      role="option"
      aria-selected={p.selected}
      aria-label={`${p.index + 1}. ${full}, intensity ${s.weight}${s.weight === 0 ? ' (ignored)' : ''}${flags ? `, ${flags}` : ''}${size !== null ? `, ${size} remedies` : ''}${s.note ? `, note: ${s.note}` : ''}`}
      data-sid={s.id}
      tabIndex={p.tabbable ? 0 : -1}
      className={`cbp-row${p.selected ? ' sel' : ''}${p.cursor ? ' cursor' : ''}${s.weight === 0 ? ' ignored' : ''}${p.dropBefore ? ' drop-before' : ''}${p.dropAfter ? ' drop-after' : ''}`}
      draggable
      onClick={e => h.click(e, s)}
      onDoubleClick={() => h.doubleClick(s)}
      onContextMenu={e => h.contextMenu(e, s)}
      onFocus={() => h.focus(s)}
      onDragStart={e => h.dragStart(e, s)}
      onDragOver={e => h.dragOver(e, s)}
      onDragEnd={h.dragEnd}
    >
      <span className="cbp-idx">{p.index + 1}</span>
      <Intensity weight={s.weight} onChange={w => h.weight(s, w)} />
      <div className="cbp-text" title={full}>
        {combined ? (
          <>
            <div className="cbp-combined-head">
              <span className="cbp-op" title={s.combine === 'union' ? 'Combined: union (any rubric)' : 'Combined: intersection (all rubrics)'}>{op}</span>
              <span className="cbp-combined-label">{allLoaded || s.label ? sl.short : `${s.combine === 'union' ? 'Union' : 'Intersection'} of ${s.rubrics.length} rubrics`}</span>
            </div>
            <ul className="cbp-parts">
              {labels.map((l, i) => (
                <li key={s.rubrics[i]} onDoubleClick={e => { e.stopPropagation(); ops.openRubric(s.rubrics[i]) }}>
                  <span className="cbp-op-sm">{i === 0 ? '' : op}</span>
                  <RubricText l={l} failed={p.failed} />
                </li>
              ))}
            </ul>
          </>
        ) : <div className="cbp-path"><RubricText l={head} failed={p.failed} /></div>}
      </div>
      <div className="cbp-meta">
        {reps.map(r => <span key={r} className="cbp-rep" title={`Repertory: ${r}`}>{r}</span>)}
        {s.eliminatory && <span className="cbp-flag f-e" title="Eliminative: only remedies in this symptom stay in the result">E</span>}
        {s.exclusive && <span className="cbp-flag f-x" title="Excluding: remedies in this symptom are removed from the result">X</span>}
        {s.causal && <span className="cbp-flag f-c" title="Causal symptom (causation / never well since)">C</span>}
        {s.group && <span className="cbp-flag f-g" title={`Group ${s.group.toLowerCase()}: calculated as one symptom with the other symptoms of this group`}>{s.group.toLowerCase()}</span>}
        {s.note && (
          <span className="cbp-note" aria-hidden="true">
            <StickyNote size={12} />
            <span className="cbp-note-tip" role="tooltip">{s.note}</span>
          </span>
        )}
        {size !== null
          ? <span className="cbp-size" title={`${size} remedies`}>{size}</span>
          : p.failed
            ? <span className="cbp-size" title="Repertory unavailable">–</span>
            : <span className="cbp-size" title="Loading the repertory"><span className="cbp-skel sm" aria-hidden="true" /></span>}
      </div>
    </div>
  )
})

function RubricText({ l, failed }: { l: RubricLabel; failed: boolean }) {
  if (!l.loaded && l.loading && !failed) return <span className="cbp-loading" aria-busy="true"><span className="cbp-skel" aria-hidden="true" />Loading {l.repertoryTitle}…</span>
  if (!l.loaded) return <span className="cbp-loading">{l.repertoryTitle}, {l.rest} (unavailable)</span>
  return <><span className="cbp-chapter">{l.chapter}</span>{l.rest && <span className="cbp-rest">{l.rest}</span>}</>
}

/** Compact 0–4 intensity control: four ascending bars; click a bar to set, click the only lit bar again for 0. */
function Intensity({ weight, onChange }: { weight: Weight; onChange: (w: Weight) => void }) {
  return (
    <span className={`cbp-int w${weight}`} aria-hidden="true" data-weight={weight} title={`Intensity ${weight}${weight === 0 ? ' (ignored in analysis)' : ''} · click a bar or press 0–4`}>
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

function Footer({ clipboard, consultation }: { clipboard: Clipboard; consultation: Consultation }) {
  const selectedIds = useApp(s => s.selectedSymptomIds)
  const selected = useMemo(() => { const ids = new Set(selectedIds); return clipboard.symptoms.reduce((n, x) => n + (ids.has(x.id) ? 1 : 0), 0) }, [selectedIds, clipboard.symptoms])
  const inAnalysis = consultation.clipboards.filter(cb => consultation.analysis.clipboardIds.includes(cb.id))
  const nothingToAnalyse = !inAnalysis.some(cb => cb.symptoms.some(x => x.weight > 0))
  const why = !inAnalysis.length ? 'No clipboard is included in the analysis (Ctrl+click a clipboard tab to include it)'
    : inAnalysis.every(cb => !cb.symptoms.length) ? 'The clipboards in the analysis have no symptoms yet: take rubrics first'
    : 'Every symptom in the analysed clipboards has intensity 0 (ignored)'
  const groupPending = ops.usePanelUi(s => s.groupPending)
  const stats = clipboardStats(clipboard.symptoms)
  const analyse = getCommand('analysis.open')
  return (
    <div className="cbp-foot">
      <span className="cbp-status">
        {/* always mounted, only its text changes, so screen readers announce the prompt when it appears */}
        <span className="cbp-prompt" role="status" aria-live="polite">
          {groupPending && <>Group: press a letter a–z, <span className="kbd">-</span> to clear, <span className="kbd">Esc</span> to cancel</>}
        </span>
        {!groupPending && (
          <span className="cbp-stats">
            <b>{stats.total}</b> symptom{stats.total === 1 ? '' : 's'}
            {stats.total > 0 && stats.active !== stats.total && <> · {stats.active} active</>}
            {selected > 0 && <> · {selected} selected</>}
          </span>
        )}
      </span>
      <span className="cbp-grow" />
      <button className="btn btn-sm btn-primary" aria-disabled={nothingToAnalyse || undefined} disabled={!analyse || !isEnabled(analyse)} onClick={() => { if (!nothingToAnalyse) runCommand('analysis.open') }} title={nothingToAnalyse ? why : 'Analyse the case (F8)'}>
        <BarChart3 size={13} />Analyse <span className="cbp-key">F8</span>
      </button>
    </div>
  )
}
