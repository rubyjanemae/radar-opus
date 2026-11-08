import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { actions, useApp } from '../../state/store'
import type { Patient } from '../../state/patients'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { pickFile } from '../../ui/files'
import { cancelDocumentFocus } from '../../shell/TabHost'
import { useFixedVirtual } from '../repertory/virtual'
import { HScrollBar } from '../toc/HScrollBar'
import { HelpGlyph } from '../toc/glyphs'
import { PtpCogsGlyph, PtpGearActiveGlyph, PtpRefreshGlyph } from './glyphs'
import { consultationsOf, tagCounts } from './logic'
import {
  ageYmd, cellText, COLUMN_LABEL, columnsFor, consultationsOldestFirst, DEFAULT_FIELDS, ddmmyyyy, FIELDS,
  filterPanel, fullName, panelRows,
} from './panel'
import type { ColumnKey, FieldKey, Kind, PanelRow } from './panel'
import * as ops from './ops'
import { openPanelHelp } from './help'
import './patients-panel.css'

/**
 * The patients list docked in the table of contents (RadarOpus's Patients panel): "Look for patient"
 * with refresh / search options / help, the patients table, the human / animal radios, the Clificol
 * filter, the group menu and the found counter, and the card of the selected patient.
 */

/** Rows and header in CSS px (RadarOpus: 22 and 24 screen points at 1470 pt). */
const ROW_H = 23
const HEAD_H = 29

/** Panel settings that outlive the panel (it unmounts when another list is shown). */
let remembered = {
  query: '', fields: [...DEFAULT_FIELDS] as FieldKey[], selectAll: false, options: false,
  kind: 'human' as Kind, clificol: false, applied: { kind: 'human' as Kind, clificol: false },
  group: null as string | null, selected: null as string | null,
  /** The patient on the card: the current patient, kept while the list is filtered or refreshed. */
  current: null as string | null,
}

export const PatientsPanel = memo(function PatientsPanel() {
  const catalog = useCatalog()
  const patients = useApp(s => s.patients)
  const consultations = useApp(s => s.consultations)
  const activePatientId = useApp(s => (s.activeConsultationId ? s.consultations[s.activeConsultationId]?.patientId ?? null : null))
  const [query, setQuery] = useState(remembered.query)
  const [fields, setFields] = useState<FieldKey[]>(remembered.fields)
  // RadarOpus: 'Select all' is a box of its own; it leaves the field ticks (and so the columns) alone and
  // makes the search look in every administrative field
  const [selectAll, setSelectAll] = useState(remembered.selectAll)
  const [options, setOptions] = useState(remembered.options)
  // the radios and the Clificol box take effect at the next refresh, as in RadarOpus
  const [kind, setKind] = useState<Kind>(remembered.kind)
  const [clificol, setClificol] = useState(remembered.clificol)
  const [applied, setApplied] = useState(remembered.applied)
  const [group, setGroup] = useState<string | null>(remembered.group)
  // no row is selected until one is clicked or reached with the keyboard (RadarOpus opens the list without a
  // highlighted row); the card shows the active patient meanwhile
  const [selected, setSelected] = useState<string | null>(remembered.selected)
  const [current, setCurrent] = useState<string | null>(remembered.current ?? remembered.selected ?? activePatientId)
  // the card follows the selected row and the active case, and otherwise stays on the current patient
  if (selected && selected !== current && patients[selected]) setCurrent(selected)
  const [seenActive, setSeenActive] = useState(activePatientId)
  if (activePatientId !== seenActive) { setSeenActive(activePatientId); if (activePatientId) setCurrent(activePatientId) }
  const root = useRef<HTMLDivElement>(null)
  const table = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const cm = useContextMenu()
  const groupMenu = useContextMenu()

  useEffect(() => { remembered = { query, fields, selectAll, options, kind, clificol, applied, group, selected, current } }, [query, fields, selectAll, options, kind, clificol, applied, group, selected, current])
  useEffect(() => { ops.setListSelection(selected); return () => ops.setListSelection(null) }, [selected])
  useEffect(() => { if (root.current) ops.applyListFocus(root.current) }, [])

  const all = useMemo(() => panelRows(patients, consultations), [patients, consultations])
  const { rows, total } = useMemo(
    () => filterPanel(all, { query, fields: selectAll ? FIELDS.map(f => f.key) : fields, kind: applied.kind, clificol: applied.clificol, group }),
    [all, query, fields, selectAll, applied, group],
  )
  const columns = columnsFor(fields, applied.kind)
  const index = rows.findIndex(r => r.patient.id === selected)
  const v = useFixedVirtual(table, rows.length, ROW_H)
  const groups = useMemo(() => tagCounts(Object.values(patients)), [patients])

  // the card shows the current patient, also when the list no longer contains it (RadarOpus: Found 0 / 0
  // still shows the patient); only without any current patient does it fall back to the first patient on file
  const cardPatient: Patient | null = (current && patients[current]) || (activePatientId && patients[activePatientId]) || all[0]?.patient || null
  const cardRow = cardPatient ? all.find(r => r.patient.id === cardPatient.id) ?? null : null

  // keep the selected row in view below the header row
  useLayoutEffect(() => {
    const el = table.current
    if (!el || index < 0) return
    const top = index * ROW_H, bottom = top + ROW_H, view = el.clientHeight - HEAD_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + view) el.scrollTop = bottom - view
  }, [index])

  // RadarOpus: Refresh clears the row selection; the card stays on the current patient
  const refresh = () => {
    setQuery('')
    setSelected(null)
    setApplied({ kind, clificol })
    if (table.current) table.current.scrollTop = 0
    // RadarOpus puts the caret back in the search field after a refresh
    search.current?.focus()
  }
  const open = (id: string) => {
    const latest = consultationsOf(useApp.getState().consultations, id)[0]
    if (latest && useApp.getState().activeConsultationId !== latest.id) actions.setActiveConsultation(latest.id)
    ops.openPatient(id)
  }
  const move = (to: number) => {
    if (!rows.length) return
    setSelected(rows[Math.max(0, Math.min(rows.length - 1, to))].patient.id)
  }
  const menuFor = (r: PanelRow): MenuItem[] => [
    { label: 'Open', keys: 'Enter', run: () => open(r.patient.id) },
    { label: 'Create a new consultation', run: () => ops.newConsultation(r.patient.id) },
    { type: 'separator' },
    { label: 'Duplicate', run: () => ops.duplicate(r.patient.id) },
    { label: 'Export patient information…', run: () => void ops.exportCase(r.patient.id) },
    { type: 'separator' },
    { label: 'Delete…', keys: 'Delete', danger: true, run: () => ops.confirmDeletePatient(r.patient.id) },
  ]
  const menuAtRow = (r: PanelRow) => {
    const el = table.current?.querySelector<HTMLElement>(`[data-pid="${CSS.escape(r.patient.id)}"]`) ?? table.current
    if (el) cm.openAt(el, menuFor(r))
  }

  const onTableKey = (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const row = rows[index]
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(index < 0 ? 0 : index + 1); break
      case 'ArrowUp': e.preventDefault(); move(index - 1); break
      case 'PageDown': e.preventDefault(); move(index + v.pageSize); break
      case 'PageUp': e.preventDefault(); move(index - v.pageSize); break
      case 'Home': e.preventDefault(); move(0); break
      case 'End': e.preventDefault(); move(rows.length - 1); break
      case 'Enter': if (row) { e.preventDefault(); open(row.patient.id) } break
      case 'Delete': if (row) { e.preventDefault(); ops.confirmDeletePatient(row.patient.id) } break
      case 'ContextMenu': if (row) { e.preventDefault(); menuAtRow(row) } break
      case 'F10': if (e.shiftKey && row) { e.preventDefault(); menuAtRow(row) } break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
          // type to search
          e.preventDefault()
          search.current?.focus()
          setQuery(q => q + e.key)
        }
    }
  }

  const toggleField = (k: FieldKey) => setFields(fs => (fs.includes(k) ? fs.filter(f => f !== k) : [...fs, k]))
  const groupItems = (): MenuItem[] => [
    { label: 'All', checked: group === null, run: () => setGroup(null) },
    ...(groups.length ? [{ type: 'separator' } as const] : []),
    ...groups.map(g => ({ label: g.tag, checked: group === g.tag, run: () => setGroup(g.tag) })),
  ]
  const width = Math.max(1, columns.length) * 100 - 8

  return (
    <div className="ptp" ref={root} data-testid="patients-panel" onPointerDownCapture={cancelDocumentFocus} onKeyDownCapture={cancelDocumentFocus}>
      <div className="ptp-head">
        <label className="ptp-search-label" htmlFor="ptp-search">Look for patient:</label>
        <input
          id="ptp-search" ref={search} className="ptp-search" type="text" spellCheck={false} autoComplete="off" value={query}
          aria-controls="ptp-table"
          onChange={e => { setQuery(e.target.value); if (table.current) table.current.scrollTop = 0 }}
          onKeyDown={e => {
            if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
            else if (e.key === 'ArrowDown') { e.preventDefault(); table.current?.focus(); move(0) }
            else if (e.key === 'Enter' && rows.length) {
              e.preventDefault()
              const r = rows[index] ?? rows[0]
              setSelected(r.patient.id)
              table.current?.focus()
            }
          }}
        />
        <span className="ptp-hbtns">
          <button className="ptp-hbtn ptp-refresh" title="Refresh the list of patients" aria-label="Refresh the list of patients" onClick={refresh}><PtpRefreshGlyph /></button>
          <button
            className={`ptp-hbtn ptp-gear${options ? ' on' : ''}`} title="Select administrative fields to search in" aria-label="Search options"
            aria-expanded={options} aria-controls="ptp-options" onClick={() => setOptions(o => !o)}
          >
            {options ? <PtpGearActiveGlyph /> : <PtpCogsGlyph />}
          </button>
          <button className="ptp-hbtn ptp-help" title="Help" aria-label="Help on the list of patients" onClick={openPanelHelp}><HelpGlyph /></button>
        </span>
      </div>

      {options && (
        <div className="ptp-options" id="ptp-options">
          <div className="ptp-options-title">Select administrative fields to search in :</div>
          <label className="ptp-check-row ptp-selectall">
            <input type="checkbox" className="ptp-cb" checked={selectAll} onChange={() => setSelectAll(a => !a)} />
            <span>Select all</span>
          </label>
          <div className="ptp-fields" role="group" aria-label="Administrative fields">
            {FIELDS.map(f => (
              <label key={f.key} className="ptp-field">
                <input type="checkbox" className="ptp-fcb" checked={fields.includes(f.key)} onChange={() => toggleField(f.key)} />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="ptp-table-box">
        <div
          ref={table} id="ptp-table" className="ptp-table" role="grid" aria-label="Patients" tabIndex={0}
          aria-rowcount={rows.length + 1} aria-colcount={columns.length}
          aria-activedescendant={index >= 0 ? `ptp-row-${rows[index].patient.id}` : undefined}
          onKeyDown={onTableKey}
          onFocus={e => { if (e.target === e.currentTarget && index < 0 && rows.length) setSelected(rows[0].patient.id) }}
        >
          <div className="ptp-row ptp-hrow" role="row" aria-rowindex={1} style={{ minWidth: width }}>
            {columns.map(c => <div key={c} role="columnheader" className="ptp-cell">{COLUMN_LABEL[c]}</div>)}
          </div>
          <div className="ptp-body" role="rowgroup" style={{ height: rows.length * ROW_H, minWidth: width }}>
            {rows.slice(v.start, v.end).map((r, k) => {
              const i = v.start + k
              return (
                <PanelRowView key={r.patient.id} row={r} i={i} columns={columns} selected={i === index}
                  onSelect={setSelected} onOpen={open} onMenu={(e, row) => { setSelected(row.patient.id); cm.open(e, menuFor(row)) }} />
              )
            })}
          </div>
        </div>
        <HScrollBar target={table} deps={columns.length} />
      </div>

      <div className="ptp-filters">
        <span className="ptp-radios" role="radiogroup" aria-label="Kind of patient">
          <label className="ptp-radio" title="Humans">
            <input type="radio" name="ptp-kind" checked={kind === 'human'} onChange={() => setKind('human')} aria-label="Humans" />
            <HumanGlyph />
          </label>
          <label className="ptp-radio" title="Animals">
            <input type="radio" name="ptp-kind" checked={kind === 'animal'} onChange={() => setKind('animal')} aria-label="Animals" />
            <DogGlyph />
          </label>
        </span>
        <label className="ptp-clificol">
          <input type="checkbox" className="ptp-cb" checked={clificol} onChange={e => setClificol(e.target.checked)} />
          <span>Case sent to Clificol</span>
        </label>
      </div>
      <div className="ptp-filters2">
        <span className="ptp-group-label" id="ptp-group-label">Group</span>
        <button className="ptp-group" aria-haspopup="menu" aria-expanded={groupMenu.isOpen} aria-labelledby="ptp-group-label ptp-group-value"
          onClick={e => groupMenu.openAt(e.currentTarget, groupItems())}
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); groupMenu.openAt(e.currentTarget, groupItems()) } }}>
          <span id="ptp-group-value" className="ptp-group-value">{group ?? 'All'}</span>
          <span className="ptp-group-caret" aria-hidden="true" />
        </button>
        <span className="ptp-found" role="status" aria-label={`Found ${rows.length} of ${total}`}>
          <span>Found</span><span>{rows.length}</span><span>/</span><span>{total}</span>
        </span>
      </div>

      {cardPatient && cardRow ? <PatientCard key={cardPatient.id} patient={cardPatient} code={cardRow.code} remedyAbbrev={id => catalog.remedy(id).abbrev} /> : <div className="ptp-card ptp-card-empty" />}
      {cm.element}
      {groupMenu.element}
    </div>
  )
})

const PanelRowView = memo(function PanelRowView({ row, i, columns, selected, onSelect, onOpen, onMenu }: {
  row: PanelRow; i: number; columns: ColumnKey[]; selected: boolean
  onSelect: (id: string) => void; onOpen: (id: string) => void; onMenu: (e: React.MouseEvent, r: PanelRow) => void
}) {
  const id = row.patient.id
  return (
    <div
      id={`ptp-row-${id}`} data-pid={id} role="row" aria-rowindex={i + 2} aria-selected={selected}
      className={`ptp-row${selected ? ' selected' : ''}`} style={{ top: i * ROW_H }}
      onMouseDown={() => onSelect(id)} onDoubleClick={() => onOpen(id)} onContextMenu={e => onMenu(e, row)}
    >
      {columns.map(c => (
        <div key={c} role="gridcell" className={`ptp-cell${c === 'sex' ? ' ptp-sex' : ''}`}>
          {c === 'sex' ? <SexGlyph sex={row.patient.sex} /> : cellText(row, c)}
        </div>
      ))}
    </div>
  )
})

function SexGlyph({ sex }: { sex: Patient['sex'] }) {
  if (!sex) return null
  const label = sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : 'Other'
  return <span className="ptp-sexg" role="img" aria-label={label} title={label}>{sex === 'male' ? '♂' : sex === 'female' ? '♀' : '⚥'}</span>
}

/** Downscale a picked image to a small JPEG data URL (the card shows it at 157 px). */
async function pictureData(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('not an image'))
      el.src = url
    })
    const max = 320
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}

function PatientCard({ patient: p, code, remedyAbbrev }: { patient: Patient; code: string; remedyAbbrev: (id: number) => string }) {
  const consultations = useApp(s => s.consultations)
  const list = useMemo(() => consultationsOldestFirst(consultations, p.id), [consultations, p.id])
  // the card shows the latest consultation; the arrows step to older and newer ones
  const [at, setAt] = useState<number | null>(null)
  const i = list.length ? Math.max(0, Math.min(list.length - 1, at ?? list.length - 1)) : -1
  const c = i >= 0 ? list[i] : null
  const rx = c?.prescriptions.length ? c.prescriptions.map(r => `${remedyAbbrev(r.remedyId)} ${r.potency}`.trim()).join(', ') : 'nothing'
  const [next, setNext] = useState(p.nextContact ?? '')
  useEffect(() => { setNext(p.nextContact ?? '') }, [p.nextContact])
  const commitNext = () => { if (next !== (p.nextContact ?? '')) actions.updatePatient(p.id, { nextContact: next }) }

  const choosePicture = async () => {
    const file = await pickFile('image/*')
    if (!file) return
    try { actions.updatePatient(p.id, { photo: await pictureData(file) }) }
    catch { actions.toast('This file is not a picture that can be shown.', 'error') }
  }

  const row = (label: string, value: ReactNode, cls = '') => (
    <div className={`ptp-card-row ${cls}`}><b>{label}</b><span>{value}</span></div>
  )
  return (
    <div className="ptp-card" aria-label={`Patient ${fullName(p)}`} role="group">
      <div className="ptp-card-info">
        <div className="ptp-card-row ptp-card-name"><b>{fullName(p)}</b></div>
        {row('Code', code, 'ptp-r-code')}
        {row('Age', ageYmd(p.birthDate), 'ptp-r-age')}
        {row('Consultations', list.length, 'ptp-r-cons')}
        <div className="ptp-card-last">
          <div className="ptp-card-row"><b>Last consultation</b><span>{c ? ddmmyyyy(c.date) : ''}</span></div>
          <div className="ptp-card-row"><b>prescribed</b><span>{rx}</span></div>
        </div>
      </div>
      <div className="ptp-photo" aria-hidden={!p.photo}>
        {p.photo ? <img src={p.photo} alt={`Picture of ${fullName(p)}`} /> : <SilhouetteGlyph />}
      </div>
      <div className="ptp-card-btns">
        <button className="ptp-cbtn" title="Previous consultation" aria-label="Previous consultation" onClick={() => setAt(Math.max(0, i - 1))}><ArrowGlyph dir={-1} /></button>
        <button className="ptp-cbtn" title="Next consultation" aria-label="Next consultation" onClick={() => setAt(Math.min(list.length - 1, i + 1))}><ArrowGlyph dir={1} /></button>
        <button className="ptp-cbtn" title="Choose another picture" aria-label="Choose another picture" onClick={() => void choosePicture()}><PictureGlyph add /></button>
        <button className="ptp-cbtn" title="Delete this picture" aria-label="Delete this picture" onClick={() => { if (p.photo) actions.updatePatient(p.id, { photo: null }) }}><PictureGlyph /></button>
      </div>
      <div className="ptp-next">
        <label htmlFor="ptp-next-input"><b>Next contact</b></label>
        <input id="ptp-next-input" className="ptp-next-input" type="text" value={next} spellCheck={false}
          onChange={e => setNext(e.target.value)} onBlur={commitNext}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitNext() }
            if (e.key === 'Escape' && next !== (p.nextContact ?? '')) { e.stopPropagation(); setNext(p.nextContact ?? '') }
          }} />
      </div>
    </div>
  )
}

/* ───────────── glyphs (original drawings after the RadarOpus icons) ───────────── */

function HumanGlyph() {
  // pink head over two shoulder lobes with a blue tie down the middle
  return (
    <svg className="ptp-kindg" viewBox="0 0 14 16" width="14" height="16" aria-hidden="true">
      <circle cx="7" cy="5" r="3.3" className="ptp-human-head" />
      <ellipse cx="4.6" cy="12.7" rx="2.7" ry="2.1" className="ptp-human-body" />
      <ellipse cx="9.4" cy="12.7" rx="2.7" ry="2.1" className="ptp-human-body" />
      <path d="M7 10.6v4.4" className="ptp-human-tie" />
    </svg>
  )
}
function DogGlyph() {
  // a dog standing side-on, head to the left, tail up
  return (
    <svg className="ptp-kindg" viewBox="0 0 17 16" width="17" height="16" aria-hidden="true">
      <path className="ptp-dog" d="M1 5.6 2.4 3.8 4 2.8l1.3.2.7 2 1 1h6.4l1-1.6.6-2 1 .4-.4 2.2-.2 2.4-.2 3.2.4 3.8h-1.4l-.6-2.8-.7 2.8h-1.2l.2-2.8H8l-.4 2.8H6.4v-3l-.8 3H4.4l.6-4.4-.6-2.4-1-.6H1.6z" />
      <path className="ptp-dog-ear" d="M3.7 2.8 4.9 3l.4 2.6-.9.4z" />
    </svg>
  )
}
function SilhouetteGlyph() {
  // round head narrowing to the crown, ear bumps at mid-height, short neck, sloping rounded shoulders (an original drawing)
  return (
    <svg className="ptp-silhouette" viewBox="0 0 120 116" aria-hidden="true">
      <path d="M60 0C47.5 0 37 4.5 33.5 15.5c-1.8 5.5-2.2 11.5-1.9 17.5-2.4-.4-4.1 1.6-4.1 4.6 0 3.6 1.9 7.4 4.6 8.4 2 8.4 6.6 15.6 13.4 20.4V78c-6.5 3.6-17 6-29.5 8.4C6.5 88.2 1.2 92.2.6 100.5L0 116h120l-.6-15.5c-.6-8.3-5.9-12.3-15.4-14.1C91.5 84 81 81.6 74.5 78V66.4c6.8-4.8 11.4-12 13.4-20.4 2.7-1 4.6-4.8 4.6-8.4 0-3-1.7-5-4.1-4.6.3-6-.1-12-1.9-17.5C83 4.5 72.5 0 60 0z" />
    </svg>
  )
}
function ArrowGlyph({ dir }: { dir: -1 | 1 }) {
  return (
    <svg className="ptp-arrowg" viewBox="0 0 16 12" width="16" height="12" aria-hidden="true" style={dir < 0 ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M1 6h12M8.5 1.5 13.5 6l-5 4.5" />
    </svg>
  )
}
function PictureGlyph({ add }: { add?: boolean }) {
  // a small landscape photo: gradient sky, sun with a glow, dark hills, in a dark frame
  const grad = `ptp-pic-${useId().replace(/:/g, '')}`
  return (
    <svg className={`ptp-picg${add ? ' add' : ' del'}`} viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ptp-pic-sky-a" />
          <stop offset="1" className="ptp-pic-sky-b" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="2.5" width="13" height="11" className="ptp-pic-frame" />
      <rect x="2.6" y="3.6" width="10.8" height="8.8" fill={`url(#${grad})`} />
      <circle cx="6.4" cy="6.4" r="2.3" className="ptp-pic-glow" />
      <circle cx="6.4" cy="6.4" r="1.3" className="ptp-pic-sun" />
      <path d="M2.6 12.4V10.6c1.6-.4 2.6-1.4 4.2-1.2 1.4.2 2 1 3.2.6 1.4-.5 2.4-1.8 3.4-1.9v4.3z" className="ptp-pic-hill" />
      {add
        ? <path d="M14.6 11.6v5M12.1 14.1h5" className="ptp-pic-plus" />
        : <path d="M12.8 12.3l3.6 3.6M16.4 12.3l-3.6 3.6" className="ptp-pic-x" />}
    </svg>
  )
}
