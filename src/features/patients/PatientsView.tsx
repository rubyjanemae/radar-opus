import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, FileUp, Search, UserPlus, Users, X } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { formatKeys, getCommand } from '../../commands/registry'
import { useApp } from '../../state/store'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { useFixedVirtual } from '../repertory/virtual'
import { filterRows, formatDate, patientRows, relativeDate, SEX_SHORT, sortRows, tagCounts } from './logic'
import type { PatientRow, Sort, SortKey } from './logic'
import * as ops from './ops'
import './patients.css'

const COLUMNS: { key: SortKey; label: string; cls: string; defaultDir: 1 | -1 }[] = [
  { key: 'name', label: 'Name', cls: 'c-name', defaultDir: 1 },
  { key: 'age', label: 'Age', cls: 'c-age num', defaultDir: 1 },
  { key: 'sex', label: 'Sex', cls: 'c-sex', defaultDir: 1 },
  { key: 'tags', label: 'Tags', cls: 'c-tags', defaultDir: 1 },
  { key: 'lastVisit', label: 'Last visit', cls: 'c-visit', defaultDir: -1 },
  { key: 'consultations', label: 'Cons.', cls: 'c-count num', defaultDir: -1 },
  { key: 'lastRx', label: 'Last prescription', cls: 'c-rx', defaultDir: 1 },
]

const ROW_H = 28
let remembered: { query: string; tags: string[]; sort: Sort; selected: string | null } = { query: '', tags: [], sort: { key: 'lastVisit', dir: -1 }, selected: null }

export function PatientsView() {
  const catalog = useCatalog()
  const patients = useApp(s => s.patients)
  const consultations = useApp(s => s.consultations)
  const activeConsultation = useApp(s => (s.activeConsultationId ? s.consultations[s.activeConsultationId] : null))
  const [query, setQuery] = useState(remembered.query)
  const [tags, setTags] = useState<string[]>(remembered.tags)
  const [sort, setSort] = useState<Sort>(remembered.sort)
  const [selected, setSelected] = useState<string | null>(remembered.selected)
  const deferredQuery = useDeferredValue(query)
  const scroller = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const cm = useContextMenu()
  const abbrev = useCallback((id: number) => catalog.remedy(id).abbrev, [catalog])

  const all = useMemo(() => patientRows(patients, consultations, abbrev), [patients, consultations, abbrev])
  const tagList = useMemo(() => tagCounts(Object.values(patients)), [patients])
  const rows = useMemo(() => sortRows(filterRows(all, deferredQuery, tags), sort, abbrev), [all, deferredQuery, tags, sort, abbrev])
  const index = rows.findIndex(r => r.patient.id === selected)
  const v = useFixedVirtual(scroller, rows.length, ROW_H)

  useEffect(() => { remembered = { query, tags, sort, selected } }, [query, tags, sort, selected])
  useEffect(() => { ops.setListSelection(selected); return () => ops.setListSelection(null) }, [selected])
  // keep a valid selection
  useEffect(() => {
    if (rows.length && index < 0) setSelected(rows[0].patient.id)
  }, [rows, index])
  useEffect(() => { if (index >= 0) v.scrollToIndex(index) }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (to: number) => {
    if (!rows.length) return
    const i = Math.max(0, Math.min(rows.length - 1, to))
    setSelected(rows[i].patient.id)
  }

  const menuFor = (row: PatientRow): MenuItem[] => [
    { label: 'Open', keys: 'Enter', run: () => ops.openPatient(row.patient.id) },
    { label: 'New consultation', run: () => ops.newConsultation(row.patient.id) },
    { label: 'Case report of last consultation', disabled: row.consultations === 0, run: () => { const c = Object.values(consultations).filter(x => x.patientId === row.patient.id).sort((a, b) => b.date.localeCompare(a.date))[0]; if (c) ops.openReport(c.id) } },
    { type: 'separator' },
    { label: 'Duplicate', run: () => ops.duplicate(row.patient.id) },
    { label: 'Export case file…', run: () => void ops.exportCase(row.patient.id) },
    { type: 'separator' },
    { label: 'Delete…', keys: 'Delete', danger: true, run: () => ops.confirmDeletePatient(row.patient.id) },
  ]

  const onKeyDown = (e: React.KeyboardEvent) => {
    const row = rows[index]
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(index + 1); break
      case 'ArrowUp': e.preventDefault(); move(index - 1); break
      case 'PageDown': e.preventDefault(); move(index + v.pageSize); break
      case 'PageUp': e.preventDefault(); move(index - v.pageSize); break
      case 'Home': e.preventDefault(); move(0); break
      case 'End': e.preventDefault(); move(rows.length - 1); break
      case 'Enter': if (row) { e.preventDefault(); ops.openPatient(row.patient.id) } break
      case 'Delete': if (row) { e.preventDefault(); ops.confirmDeletePatient(row.patient.id) } break
      case 'ContextMenu': if (row) { e.preventDefault(); openMenuAtRow(row) } break
      case 'F10': if (e.shiftKey && row) { e.preventDefault(); openMenuAtRow(row) } break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
          // type-to-search
          e.preventDefault()
          search.current?.focus()
          setQuery(q => q + e.key)
        }
    }
  }
  const openMenuAtRow = (row: PatientRow) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-pid="${row.patient.id}"]`) ?? scroller.current
    if (el) cm.openAt(el, menuFor(row))
  }

  const toggleTag = (t: string) => setTags(ts => (ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]))
  const clickHeader = (key: SortKey, defaultDir: 1 | -1) => setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: defaultDir }))
  const total = all.length
  const filtered = query.trim() !== '' || tags.length > 0
  const keyHint = (id: string) => { const k = getCommand(id)?.keys?.[0]; return k ? ` (${formatKeys(k)})` : '' }

  return (
    <div className="pt-list" data-testid="patients-view">
      <div className="pt-list-toolbar">
        <div className="pt-search">
          <Search size={14} aria-hidden />
          <input
            ref={search} className="pt-search-input" placeholder="Search name, contact, complaint, remedy…" aria-label="Search patients" value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); scroller.current?.focus(); if (e.key === 'Enter' && rows[0] && rows.length === 1) ops.openPatient(rows[0].patient.id) }
              if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') }
            }}
          />
          {query && <button className="icon-btn pt-search-x" aria-label="Clear search" onClick={() => { setQuery(''); search.current?.focus() }}><X size={13} /></button>}
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => void ops.importCase()} title={`Import case file${keyHint('file.importCase')}`}><FileUp size={14} />Import</button>
        <button className="btn" disabled={!selected} onClick={() => selected && void ops.exportCase(selected)} title="Export the selected patient as a case file"><Download size={14} />Export</button>
        <button className="btn btn-primary" onClick={ops.newPatient} title={`New patient${keyHint('patient.new')}`}><UserPlus size={14} />New patient</button>
      </div>
      {tagList.length > 0 && (
        <div className="pt-tagbar" role="group" aria-label="Filter by tag">
          {tagList.map(t => (
            <button key={t.tag} className={`pt-chip${tags.includes(t.tag) ? ' on' : ''}`} aria-pressed={tags.includes(t.tag)} onClick={() => toggleTag(t.tag)}>
              {t.tag}<span className="pt-chip-n">{t.count}</span>
            </button>
          ))}
          {tags.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setTags([])}>Clear tags</button>}
        </div>
      )}
      <div className="pt-table" role="grid" aria-label="Patients" aria-rowcount={rows.length + 1}>
        <div className="pt-row pt-row-head" role="row">
          {COLUMNS.map(c => (
            <div key={c.key} role="columnheader" className={`pt-cell ${c.cls}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
              <button className="pt-sort" onClick={() => clickHeader(c.key, c.defaultDir)}>
                {c.label}
                {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
            </div>
          ))}
        </div>
        <div
          ref={scroller} className="pt-body" tabIndex={0} role="rowgroup"
          aria-activedescendant={index >= 0 ? `pt-row-${rows[index].patient.id}` : undefined}
          onKeyDown={onKeyDown}
        >
          {rows.length === 0 ? (
            total === 0 ? (
              <div className="empty-state">
                <Users size={28} aria-hidden />
                <strong>No patients yet</strong>
                <span>Create a patient to start a case, or import a case file.</span>
                <div className="pt-empty-actions"><button className="btn btn-primary" onClick={ops.newPatient}><UserPlus size={14} />New patient</button><button className="btn" onClick={() => void ops.importCase()}><FileUp size={14} />Import case file</button></div>
              </div>
            ) : (
              <div className="empty-state">
                <Search size={24} aria-hidden />
                <strong>No patients match</strong>
                <span>{query ? <>Nothing found for “{query}”{tags.length ? ' with the selected tags' : ''}.</> : 'No patient has all the selected tags.'}</span>
                <button className="btn" onClick={() => { setQuery(''); setTags([]) }}>Clear filters</button>
              </div>
            )
          ) : (
            <div style={{ height: v.total, position: 'relative' }}>
              {rows.slice(v.start, v.end).map((r, k) => {
                const i = v.start + k
                const p = r.patient
                const isActiveCase = activeConsultation?.patientId === p.id
                return (
                  <div
                    key={p.id} id={`pt-row-${p.id}`} data-pid={p.id} role="row" aria-selected={i === index}
                    className={`pt-row${i === index ? ' selected' : ''}${i % 2 ? ' odd' : ''}`}
                    style={{ position: 'absolute', top: i * ROW_H, height: ROW_H, left: 0, right: 0 }}
                    onMouseDown={() => setSelected(p.id)}
                    onDoubleClick={() => ops.openPatient(p.id)}
                    onContextMenu={e => { setSelected(p.id); cm.open(e, menuFor(r)) }}
                  >
                    <div role="gridcell" className="pt-cell c-name">
                      <span className="pt-name">{r.name}</span>
                      {isActiveCase && <span className="pt-active-dot" title="Active case" aria-label="Active case" />}
                    </div>
                    <div role="gridcell" className="pt-cell c-age num">{r.ageLabel}</div>
                    <div role="gridcell" className="pt-cell c-sex">{p.sex ? SEX_SHORT[p.sex] : ''}</div>
                    <div role="gridcell" className="pt-cell c-tags">{p.tags.map(t => <span key={t} className="pt-tag sm">{t}</span>)}</div>
                    <div role="gridcell" className="pt-cell c-visit" title={r.lastVisit ? relativeDate(r.lastVisit) : undefined}>{formatDate(r.lastVisit)}</div>
                    <div role="gridcell" className="pt-cell c-count num">{r.consultations || ''}</div>
                    <div role="gridcell" className="pt-cell c-rx">{r.lastRx && <><b>{abbrev(r.lastRx.remedyId)}</b> {r.lastRx.potency}<span className="pt-dim"> · {formatDate(r.lastRx.date)}</span></>}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="pt-list-status" aria-live="polite">
        {filtered ? `${rows.length} of ${total} patients` : `${total} patient${total === 1 ? '' : 's'}`}
        <span className="grow" />
        <span className="pt-dim">↑↓ select · Enter open · Shift+F10 menu · Del delete · type to search</span>
      </div>
      {cm.element}
    </div>
  )
}
