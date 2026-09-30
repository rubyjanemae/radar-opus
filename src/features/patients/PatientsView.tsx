import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, FileUp, Search, UserPlus, Users, X } from 'lucide-react'
import { useCatalog } from '../../data/CatalogContext'
import { displayKey, formatKeys, getCommand, runCommand } from '../../commands/registry'
import { useApp } from '../../state/store'
import { rubricLabel } from '../clipboard/labels'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { useFixedVirtual } from '../repertory/virtual'
import { filterRows, formatDate, patientRows, relativeDate, SEX_SHORT, sortRows, tagCounts } from './logic'
import type { PatientRow, RowText, Sort, SortKey } from './logic'
import type { Catalog } from '../../data/catalog'
import type { Consultation, Patient } from '../../state/patients'
import * as ops from './ops'
import './patients.css'

const COLUMNS: { key: SortKey; label: string; short?: string; title?: string; cls: string; defaultDir: 1 | -1 }[] = [
  { key: 'name', label: 'Name', cls: 'c-name', defaultDir: 1 },
  { key: 'age', label: 'Age', cls: 'c-age num', defaultDir: 1 },
  { key: 'sex', label: 'Sex', cls: 'c-sex', defaultDir: 1 },
  { key: 'tags', label: 'Tags', cls: 'c-tags', defaultDir: 1 },
  { key: 'lastVisit', label: 'Last visit', short: 'Visit', cls: 'c-visit', defaultDir: -1 },
  { key: 'consultations', label: 'Cons.', title: 'Consultations', cls: 'c-count num', defaultDir: -1 },
  { key: 'lastRx', label: 'Last prescription', short: 'Last Rx', cls: 'c-rx', defaultDir: 1 },
]

const ROW_H = 28
/** Text sources per catalog, stable across mounts: rows are memoised per patient against them (see patientRows). */
const sources = new WeakMap<Catalog, { abbrev: (id: number) => string; text: RowText }>()
function rowSources(catalog: Catalog) {
  let s = sources.get(catalog)
  if (!s) {
    s = {
      abbrev: id => catalog.remedy(id).abbrev,
      text: {
        remedyName: id => catalog.remedy(id).name,
        rubricText: ref => { const l = rubricLabel(catalog, ref); return l.loaded ? `${l.chapter} ${l.rest}` : null },
      },
    }
    sources.set(catalog, s)
  }
  return s
}

const DAY_MS = 86_400_000
/** Last built row list and last filtered/sorted view, kept at module level so they survive tab switches. */
const listCache = (() => {
  let allKey: unknown[] = []
  let allVal: PatientRow[] = []
  let rowsKey: unknown[] = []
  let rowsVal: PatientRow[] = []
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])
  return {
    all(patients: Record<string, Patient>, consultations: Record<string, Consultation>, abbrev: (id: number) => string, text: RowText): PatientRow[] {
      const now = Date.now()
      const key = [patients, consultations, abbrev, text, Math.floor(now / DAY_MS)]
      if (!same(key, allKey)) { allVal = patientRows(patients, consultations, abbrev, now, text); allKey = key }
      return allVal
    },
    rows(all: PatientRow[], query: string, tags: string[], sort: Sort, abbrev: (id: number) => string): PatientRow[] {
      const key = [all, query, tags.join('\u0000'), sort.key, sort.dir, abbrev]
      if (!same(key, rowsKey)) { rowsVal = sortRows(filterRows(all, query, tags), sort, abbrev); rowsKey = key }
      return rowsVal
    },
  }
})()

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
  // the table is its own scroll region (sticky header row), so the focusable grid is what scrolls
  const grid = useRef<HTMLDivElement>(null)
  const scroller = grid
  const search = useRef<HTMLInputElement>(null)
  const cm = useContextMenu()
  const { abbrev, text } = rowSources(catalog)

  // memoised across mounts on the store's identities, so reactivating the tab with thousands of
  // patients reuses the built, filtered and sorted list instead of rebuilding it
  const all = listCache.all(patients, consultations, abbrev, text)
  const tagList = useMemo(() => tagCounts(Object.values(patients)), [patients])
  const rows = listCache.rows(all, deferredQuery, tags, sort, abbrev)
  const index = rows.findIndex(r => r.patient.id === selected)
  const v = useFixedVirtual(scroller, rows.length, ROW_H)

  useEffect(() => { remembered = { query, tags, sort, selected } }, [query, tags, sort, selected])
  useEffect(() => { ops.setListSelection(selected); return () => ops.setListSelection(null) }, [selected])
  // keep a valid selection
  useEffect(() => {
    if (rows.length && index < 0) setSelected(rows[0].patient.id)
  }, [rows, index])
  // keep the selected row in view below the sticky header row
  useEffect(() => {
    const el = grid.current
    if (!el || index < 0) return
    const top = (index + 1) * ROW_H, bottom = top + ROW_H
    if (top - ROW_H < el.scrollTop) el.scrollTop = top - ROW_H
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
  }, [index])
  // Focus moves into the list only when a command asked for it (Mod+3, after a delete): switching to the
  // tab from the tab strip leaves focus on the tab, and Enter or Tab from there moves into the panel.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { if (root.current) ops.applyListFocus(root.current) }, [])

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
    if (e.target !== e.currentTarget) return // header buttons and empty-state actions handle their own keys
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
    const el = scroller.current?.querySelector<HTMLElement>(`[data-pid="${row.patient.id}"]`) ?? grid.current
    if (el) cm.openAt(el, menuFor(row))
  }

  const toggleTag = (t: string) => setTags(ts => (ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]))
  const clickHeader = (key: SortKey, defaultDir: 1 | -1) => startTransition(() => setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: defaultDir })))
  /** Search text when the field got focus: Ctrl+Z on an unchanged (or empty) field is the app's undo, not the field's. */
  const focusQuery = useRef<string | null>(null)
  const total = all.length
  const filtered = query.trim() !== '' || tags.length > 0
  const keyHint = (id: string) => { const k = displayKey(getCommand(id)?.keys); return k ? ` (${formatKeys(k)})` : '' }

  return (
    <div ref={root} className="pt-list" data-testid="patients-view">
      <div className="pt-list-toolbar">
        <div className="pt-search">
          <Search size={14} aria-hidden />
          <input
            ref={search} className="pt-search-input" aria-controls="pt-grid" placeholder="Search name, notes, symptom, remedy…" title="Searches names, contact details, notes, complaints, assessments, prescribed remedies and rubrics" aria-label="Search patients" value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { focusQuery.current = query }}
            onBlur={() => { focusQuery.current = null }}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z' && (query === '' || query === focusQuery.current)) {
                e.preventDefault()
                runCommand(e.shiftKey ? 'edit.redo' : 'edit.undo')
                return
              }
              if (e.key === 'ArrowDown') { e.preventDefault(); grid.current?.focus(); if (query) move(0) }
              if (e.key === 'Enter' && rows.length) { e.preventDefault(); const r = rows[index] ?? rows[0]; ops.openPatient(r.patient.id) }
              if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') }
            }}
          />
          {query && <button className="icon-btn pt-search-x" aria-label="Clear search" onClick={() => { setQuery(''); search.current?.focus() }}><X size={13} /></button>}
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => void ops.importCase()} title={`Import case file${keyHint('file.importCase')}`} aria-label="Import case file"><FileUp size={14} /><span className="btn-label">Import</span></button>
        <button className="btn" disabled={!selected} onClick={() => selected && void ops.exportCase(selected)} title="Export the selected patient as a case file" aria-label="Export case file"><Download size={14} /><span className="btn-label">Export</span></button>
        <button className="btn btn-primary" onClick={ops.newPatient} title={`New patient${keyHint('patient.new')}`} aria-label="New patient"><UserPlus size={14} /><span className="btn-label">New patient</span></button>
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
      <div
        ref={grid} id="pt-grid" className="pt-table" role="grid" aria-label="Patients" aria-rowcount={rows.length + 1} tabIndex={0}
        aria-activedescendant={index >= 0 ? `pt-row-${rows[index].patient.id}` : undefined}
        onKeyDown={onKeyDown}
      >
        <div className="pt-row pt-row-head" role="row" aria-rowindex={1}>
          {COLUMNS.map(c => (
            <div key={c.key} role="columnheader" className={`pt-cell ${c.cls}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
              <button className="pt-sort" title={c.title} onClick={() => clickHeader(c.key, c.defaultDir)}>
                {c.short ? <><span className="pt-lbl-long">{c.label}</span><span className="pt-lbl-short">{c.short}</span></> : c.label}
                {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
            </div>
          ))}
        </div>
        <div className="pt-body" role="rowgroup">
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
                    key={p.id} id={`pt-row-${p.id}`} data-pid={p.id} role="row" aria-rowindex={i + 2} aria-selected={i === index}
                    className={`pt-row${i === index ? ' selected' : ''}${i % 2 ? ' odd' : ''}`}
                    style={{ position: 'absolute', top: i * ROW_H, height: ROW_H, left: 0, right: 0 }}
                    onMouseDown={() => setSelected(p.id)}
                    onDoubleClick={() => ops.openPatient(p.id)}
                    onContextMenu={e => { setSelected(p.id); cm.open(e, menuFor(r)) }}
                  >
                    <div role="gridcell" className="pt-cell c-name" title={p.tags.length ? `${r.name}\nTags: ${p.tags.join(', ')}` : r.name}>
                      <span className="pt-name">{r.name}</span>
                      {isActiveCase && <span className="pt-active-dot" title="Active case" aria-label="Active case" />}
                    </div>
                    <div role="gridcell" className="pt-cell c-age num">{r.ageLabel}</div>
                    <div role="gridcell" className="pt-cell c-sex">{p.sex ? SEX_SHORT[p.sex] : ''}</div>
                    <TagCell tags={p.tags} />
                    <div role="gridcell" className="pt-cell c-visit" title={r.lastVisit ? relativeDate(r.lastVisit) : undefined}>{formatDate(r.lastVisit)}</div>
                    <div role="gridcell" className="pt-cell c-count num">{r.consultations || ''}</div>
                    <div role="gridcell" className="pt-cell c-rx" title={r.lastRx ? `${catalog.remedy(r.lastRx.remedyId).name} ${r.lastRx.potency}, ${formatDate(r.lastRx.date)}` : undefined}>{r.lastRx && <><b>{abbrev(r.lastRx.remedyId)}</b> {r.lastRx.potency}</>}</div>
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
        <span className="pt-dim pt-keys-hint">
          <kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> select · <kbd className="kbd">Enter</kbd> open · <kbd className="kbd">Shift+F10</kbd> menu · <kbd className="kbd">Del</kbd> delete · type to search
        </span>
      </div>
      {cm.element}
    </div>
  )
}

/** Tag chips that fit on one line, whole, followed by a "+N" badge for the rest (full list in the tooltip). */
function TagCell({ tags }: { tags: string[] }) {
  const box = useRef<HTMLSpanElement>(null)
  const [more, setMore] = useState<{ hidden: number; left: number }>({ hidden: 0, left: 0 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const kids = [...el.children] as HTMLElement[]
      const top = kids[0]?.offsetTop ?? 0
      const shown = kids.filter(k => k.offsetTop <= top)
      const last = shown[shown.length - 1]
      const hidden = kids.length - shown.length
      const left = last ? last.offsetLeft - el.offsetLeft + last.offsetWidth + 3 : 0
      setMore(m => (m.hidden === hidden && m.left === left ? m : { hidden, left }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tags])
  return (
    <div role="gridcell" className="pt-cell c-tags" title={tags.length ? tags.join(', ') : undefined}>
      <span ref={box} className={`pt-tags-fit${more.hidden ? ' clipped' : ''}`}>{tags.map(t => <span key={t} className="pt-tag sm">{t}</span>)}</span>
      {more.hidden > 0 && <span className="pt-tag-more" style={{ left: more.left + 8 }} aria-label={`${more.hidden} more tag${more.hidden === 1 ? '' : 's'}`}>+{more.hidden}</span>}
    </div>
  )
}
