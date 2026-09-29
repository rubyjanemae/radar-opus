import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from 'react'
import { ArrowLeft, BookText, Columns3, Copy, ExternalLink, Filter, FlaskConical, Highlighter, Loader2, MoreHorizontal, Network, Search } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { Grade } from '../../data/types'
import { getCommand, runCommand } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import type { RemedyTab } from '../../state/workspace'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import { openCompare, setOptions, targetConsultationId } from '../analysis/ops'
import { useFixedVirtual } from '../repertory/virtual'
import { openRemedySearch } from '../search/ops'
import { useBook } from './book'
import type { MMBook } from './book'
import { Paragraph } from './components'
import type { RemedyLinkHandlers } from './components'
import { familyVersion, focusIsBusy, onFamilyProvider, openMM, remedyGroups } from './ops'
import type { RemedyGroup } from './ops'
import { parseAltNames } from './resolve'
import { remedyIndex } from './remedyIndex'
import type { KeynoteRubric } from './remedyIndex'
import { plainText, titleCase } from './text'
import './mm.css'
import './remedy.css'
import { useWidth } from './useWidth'

type Section = 'overview' | 'relations' | 'repertory' | 'families' | 'sources'

/** Per tab UI memory (section, repertory, back stack) that survives tab switches. */
const tabMemory = new Map<string, { section: Section; repertory: string | null; back: number[] }>()
function memory(tabId: string) {
  let m = tabMemory.get(tabId)
  if (!m) tabMemory.set(tabId, (m = { section: 'overview', repertory: null, back: [] }))
  return m
}

/** Rubric selected in the keynote list, exposed to rubric.* commands (take, copy). */
export let selectedRemedyRubric: string | null = null

const KEY_ROW = 26


/** Below this window width the secondary header actions move into a "More" menu. */
const COMPACT_HEAD = 760

function useFamilies(remedyId: number): RemedyGroup[] | null {
  const version = useSyncExternalStore(onFamilyProvider, familyVersion, familyVersion)
  return useMemo(() => remedyGroups(remedyId), [remedyId, version]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function RemedyView({ tab }: { tab: RemedyTab }) {
  const catalog = useCatalog()
  const { book, error: mmError } = useBook(catalog)
  const remedy = catalog.remedy(tab.remedyId)
  const mem = memory(tab.id)
  const [section, setSectionState] = useState<Section>(mem.section)
  const bodyRef = useRef<HTMLDivElement>(null)
  const setSection = (s: Section) => {
    if (s !== section && bodyRef.current) bodyRef.current.scrollTop = 0
    mem.section = s
    setSectionState(s)
  }
  const groups = useFamilies(tab.remedyId)
  useApp(s => s.activeConsultationId) // re-render when the case changes (compare / limit availability)
  const [back, setBack] = useState<number[]>(mem.back)
  const cm = useContextMenu()
  const rootRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const width = useWidth(rootRef)
  const compact = width > 0 && width < COMPACT_HEAD

  const known = catalog.remedies.has(tab.remedyId)
  const entry = book?.entries.get(tab.remedyId) ?? null
  const alts = useMemo(() => parseAltNames(remedy.altName), [remedy.altName])
  const relations = useMemo(() => (book ? book.relationships(tab.remedyId) : []), [book, tab.remedyId])
  const relCount = relations.reduce((n, g) => n + g.remedies.length, 0)
  const citations = useMemo(() => book?.citations.get(tab.remedyId) ?? [], [book, tab.remedyId])

  useEffect(() => { if (section === 'families' && !groups) setSection('overview') }, [groups, section]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Show another remedy in this window (Mod/Ctrl-click opens a new tab). */
  const showRemedy = (rid: number, e?: { ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean }) => {
    if (rid === tab.remedyId) return
    if (e && (e.ctrlKey || e.metaKey)) { actions.openTab({ kind: 'remedy', remedyId: rid }, { reuse: false }); return }
    const existing = useApp.getState().tabs.find(t => t.kind === 'remedy' && t.remedyId === rid)
    if (existing) { actions.activateTab(existing.id); return }
    const nb = [...back.slice(-49), tab.remedyId]
    mem.back = nb
    setBack(nb)
    actions.updateTab<RemedyTab>(tab.id, { remedyId: rid })
  }
  const goBack = () => {
    const prev = back[back.length - 1]
    if (prev === undefined) return
    const nb = back.slice(0, -1)
    mem.back = nb
    setBack(nb)
    actions.updateTab<RemedyTab>(tab.id, { remedyId: prev })
    rootRef.current?.focus({ preventScroll: true })
  }

  // take keyboard focus when the window opens or shows another remedy (so 1–4, M, F and
  // Backspace work straight away, also after activating the tab from the tab strip), unless the
  // user is typing or a dialog or menu is open
  useEffect(() => {
    const take = () => { if (!focusIsBusy(rootRef.current)) rootRef.current?.focus({ preventScroll: true }) }
    take()
    // a click on the tab strip activates on mousedown and focuses the tab afterwards: take it back
    const raf = requestAnimationFrame(take)
    return () => cancelAnimationFrame(raf)
  }, [tab.id, tab.remedyId])

  const remedyMenu = (rid: number): MenuItem[] => {
    const r = catalog.remedy(rid)
    return [
      { type: 'label', label: `${r.abbrev} · ${r.name}` },
      { label: 'Show remedy information', run: () => showRemedy(rid) },
      { label: 'Open in new tab', run: () => actions.openTab({ kind: 'remedy', remedyId: rid }, { reuse: false }) },
      { label: 'Read in materia medica', run: () => openMM(rid), disabled: !book?.has(rid) },
      { label: 'Find rubrics with this remedy', run: () => openRemedySearch(rid, { newTab: true }), disabled: !getCommand('search.remedy') },
    ]
  }
  const links: RemedyLinkHandlers = {
    onRemedy: (rid: number, e: MouseEvent) => { if (e.shiftKey && book?.has(rid)) openMM(rid); else showRemedy(rid, e) },
    onRemedyMenu: (rid: number, e: MouseEvent) => cm.open(e, remedyMenu(rid)),
  }

  const limitToFamily = (g: RemedyGroup, mode: 'limit' | 'highlight') => {
    const cid = targetConsultationId()
    if (!cid) { actions.toast('Open a case first: the filter applies to its analysis', 'info'); return }
    if (mode === 'limit') setOptions({ remedyFilter: g.members, filterLabel: g.label }, cid)
    else setOptions({ highlight: g.members, highlightLabel: g.label }, cid)
    actions.toast(mode === 'limit' ? `Analysis limited to ${g.label} (${g.members.length} remedies)` : `Highlighting ${g.label} in the analysis`, 'success', { label: 'Open analysis', run: () => runCommand('analysis.open') })
  }

  const tabs: { id: Section; label: string; short?: string; count?: number; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'relations', label: 'Relationships', short: 'Relations', count: relCount || undefined, show: true },
    { id: 'repertory', label: 'Repertory profile', short: 'Profile', show: true },
    { id: 'families', label: 'Families', count: groups?.length, show: !!groups },
    { id: 'sources', label: 'Sources & notes', short: 'Notes', show: true },
  ]
  const visibleTabs = tabs.filter(t => t.show)

  const onKey = (e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
    const n = Number(e.key)
    if (n >= 1 && n <= visibleTabs.length) { e.preventDefault(); setSection(visibleTabs[n - 1].id) }
    else if (e.key === 'm' && entry) { e.preventDefault(); openMM(tab.remedyId) }
    else if (e.key === 'f' && getCommand('search.remedy')) { e.preventDefault(); openRemedySearch(tab.remedyId, { newTab: true }) }
    else if (e.key === 'Backspace' && back.length) { e.preventDefault(); goBack() }
  }
  const onTabsKey = (e: ReactKeyboardEvent) => {
    const i = visibleTabs.findIndex(t => t.id === section)
    let ni = -1
    if (e.key === 'ArrowRight') ni = (i + 1) % visibleTabs.length
    else if (e.key === 'ArrowLeft') ni = (i - 1 + visibleTabs.length) % visibleTabs.length
    if (ni < 0) return
    e.preventDefault()
    setSection(visibleTabs[ni].id)
    rootRef.current?.querySelector<HTMLElement>(`[data-ritab="${visibleTabs[ni].id}"]`)?.focus()
  }

  if (!known) {
    return <div className="empty-state"><strong>Unknown remedy #{tab.remedyId}</strong><span>This remedy is not in the installed data.</span></div>
  }

  const canCompare = !!targetConsultationId()
  const family = groups?.find(g => g.system.toLowerCase() !== 'kingdom') ?? groups?.[0] ?? null
  const copyName = () => { void navigator.clipboard?.writeText(`${remedy.name} (${remedy.abbrev})`); actions.toast('Copied remedy name', 'success') }
  const secondary: MenuItem[] = [
    { label: 'Add to compare', run: () => openCompare([tab.remedyId]), disabled: !canCompare },
    ...(family ? [{ label: `Limit analysis to ${family.label}`, run: () => limitToFamily(family, 'limit') }] : []),
    { type: 'separator' },
    { label: 'Copy remedy name', run: copyName },
  ]

  return (
    <div className="ri-view" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <header className="ri-head">
        <button className="icon-btn ri-back" aria-label="Back to previous remedy" title="Back (Backspace)" disabled={!back.length} onClick={goBack}><ArrowLeft size={15} /></button>
        <div className="ri-badge" aria-hidden="true"><FlaskConical size={18} /></div>
        <div className="ri-title">
          <div className="ri-title-line">
            <h1 title={remedy.name}>{remedy.name}</h1>
            <span className="ri-abbrev" title="Abbreviation">{remedy.abbrev}</span>
          </div>
          <div className="ri-sub">
            {entry?.commonName && <span className="ri-common" title={entry.commonName}>{entry.commonName}</span>}
            {alts.length > 0 && <span className="ri-alts" title={`Also: ${alts.join(' · ')}`}>Also: {alts.join(' · ')}</span>}
            {!entry?.commonName && !alts.length && <span className="ri-dim">No alternative names</span>}
          </div>
        </div>
        <div className="ri-actions" role="toolbar" aria-label="Remedy actions">
          <button className="btn btn-sm" disabled={!entry} title={entry ? 'Read the Boericke monograph (M)' : 'Boericke has no monograph for this remedy'} onClick={() => openMM(tab.remedyId)}><BookText size={13} /> Open in MM</button>
          {getCommand('search.remedy') && <button className="btn btn-sm" title="Remedy search: all rubrics of this remedy (F)" onClick={() => openRemedySearch(tab.remedyId, { newTab: true })}><Search size={13} /> Find rubrics</button>}
          {compact ? (
            <button ref={moreRef} className="icon-btn" aria-label="More actions" aria-haspopup="menu" title="More actions"
              onClick={() => moreRef.current && cm.openAt(moreRef.current, secondary)}><MoreHorizontal size={16} /></button>
          ) : (
            <>
              <button className="btn btn-sm" disabled={!canCompare} title={canCompare ? 'Compare this remedy in the current analysis' : 'Open a case to compare remedies'} onClick={() => openCompare([tab.remedyId])}><Columns3 size={13} /> Add to compare</button>
              {family && <button className="btn btn-sm ri-limit" title={`Limit the analysis to ${family.label}`} onClick={() => limitToFamily(family, 'limit')}><Filter size={13} /> <span>Limit to {family.label}</span></button>}
              <button className="icon-btn" aria-label="Copy remedy name" title="Copy name" onClick={copyName}><Copy size={14} /></button>
            </>
          )}
        </div>
      </header>

      <div className="ri-tabs" role="tablist" aria-label="Remedy information" onKeyDown={onTabsKey}>
        {visibleTabs.map((t, i) => (
          <button key={t.id} role="tab" data-ritab={t.id} aria-selected={section === t.id} tabIndex={section === t.id ? 0 : -1}
            className={section === t.id ? 'on' : ''} aria-label={t.label} title={`${t.label} (${i + 1})`} onClick={() => setSection(t.id)}>
            {compact && t.short ? t.short : t.label}{t.count ? <span className="badge">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="ri-body" role="tabpanel" ref={bodyRef}>
        {section === 'overview' && (
          <Overview book={book} mmError={mmError} remedyId={tab.remedyId} links={links} citations={citations.length} relCount={relCount}
            groups={groups} onSection={setSection} onRemedy={showRemedy} onMenu={(rid, e) => cm.open(e, remedyMenu(rid))} />
        )}
        {section === 'relations' && (
          book ? <Relations book={book} remedyId={tab.remedyId} links={links} onRemedy={showRemedy} onMenu={(rid, e) => cm.open(e, remedyMenu(rid))} />
            : <Loading label="Loading Boericke…" />
        )}
        {section === 'repertory' && <RepertoryProfile tabId={tab.id} remedyId={tab.remedyId} />}
        {section === 'sources' && <Sources book={book} mmError={mmError} remedyId={tab.remedyId} />}
        {section === 'families' && groups && <Families groups={groups} self={tab.remedyId} onRemedy={showRemedy} onMenu={(rid, e) => cm.open(e, remedyMenu(rid))} onLimit={limitToFamily} />}
      </div>
      {cm.element}
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return <div className="ri-loading"><Loader2 size={16} className="spin" /> {label}</div>
}

function Chip({ rid, onRemedy, onMenu, dim, compact }: { rid: number; onRemedy: (rid: number, e: MouseEvent) => void; onMenu: (rid: number, e: MouseEvent) => void; dim?: boolean; compact?: boolean }) {
  const catalog = useCatalog()
  const r = catalog.remedy(rid)
  return (
    <button className={`ri-chip${dim ? ' dim' : ''}`} title={`${r.name} · click: remedy information · Ctrl+click: new tab`} onClick={e => onRemedy(rid, e)} onContextMenu={e => onMenu(rid, e)}>
      <b>{r.abbrev}</b>{!compact && <span>{r.name}</span>}
    </button>
  )
}

// ───────────────────────── overview ─────────────────────────

const KEY_SECTIONS = /^(mind|mental|modalities)$/i

function Overview({ book, mmError, remedyId, links, citations, relCount, groups, onSection, onRemedy, onMenu }: {
  book: MMBook | null; mmError: Error | null; remedyId: number; links: RemedyLinkHandlers; citations: number; relCount: number
  groups: RemedyGroup[] | null; onSection: (s: Section) => void; onRemedy: (rid: number, e: MouseEvent) => void; onMenu: (rid: number, e: MouseEvent) => void
}) {
  const catalog = useCatalog()
  const fontScale = useApp(s => s.settings.fontScale)
  const entry = book?.entries.get(remedyId) ?? null
  const cites = book?.citations.get(remedyId) ?? []
  const citing = [...new Set(cites.map(c => c.remedyId))]
  const note = useApp(s => s.remedyNotes[remedyId] ?? '')
  return (
    <div className="ri-overview">
      <section className="ri-card ri-mono">
        <div className="ri-card-head"><BookText size={14} /> Boericke keynotes {entry && <button className="btn btn-sm btn-ghost" onClick={() => openMM(remedyId)}>Read full monograph <ExternalLink size={12} /></button>}</div>
        {mmError ? <p className="ri-dim">The materia medica could not be loaded: {mmError.message}</p>
          : !book ? <div className="ri-mono-skel">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton" style={{ height: 12, margin: '9px 0', width: `${65 + ((i * 23) % 35)}%` }} />)}</div>
          : !entry ? (
            <div className="ri-nomono">
              <strong>No monograph in Boericke</strong>
              <p>Boericke's Pocket Manual covers {book.items.length} of {catalog.remedies.size.toLocaleString()} remedies. {citing.length ? `This remedy is cited in ${citing.length} other monograph${citing.length > 1 ? 's' : ''}:` : 'Use the repertory profile to study it.'}</p>
              {citing.length > 0 && (
                <div className="ri-chips">
                  {citing.slice(0, 24).map(id => <button key={id} className="ri-chip" onClick={() => openMM(id, { section: cites.find(c => c.remedyId === id)!.section })} onContextMenu={e => onMenu(id, e)} title={`Open ${catalog.remedy(id).name} at the citation`}><b>{catalog.remedy(id).abbrev}</b><span>{cites.filter(c => c.remedyId === id).map(c => c.heading).join(', ')}</span></button>)}
                </div>
              )}
              <button className="btn btn-sm" onClick={() => onSection('repertory')}>Show repertory profile</button>
            </div>
          ) : (
            <div className="ri-mono-text" style={{ ['--mm-fs' as string]: `${Math.round(14 * fontScale)}px` }}>
              <h2 className="ri-mono-title">{titleCase(entry.heading)}</h2>
              <Paragraph text={entry.intro} book={book} selfId={remedyId} terms={[]} links={links} />
              {entry.sections.map((s, i) => KEY_SECTIONS.test(s.heading) && (
                <div key={i} className="ri-keysec">
                  <h3>{s.heading}</h3>
                  <Paragraph text={s.text} book={book} selfId={remedyId} terms={[]} links={links} />
                </div>
              ))}
              <div className="ri-mono-foot">
                Sections: {entry.sections.map((s, i) => <button key={i} className="ri-seclink" onClick={() => openMM(remedyId, { section: i })}>{s.heading}</button>)}
              </div>
            </div>
          )}
      </section>

      <aside className="ri-side">
        <section className="ri-card">
          <div className="ri-card-head">At a glance</div>
          <dl className="ri-facts">
            <dt>Abbreviation</dt><dd>{catalog.remedy(remedyId).abbrev}</dd>
            <dt>Boericke</dt><dd>{book ? (entry ? `${entry.sections.length} sections` : 'no monograph') : '…'}</dd>
            <dt>Relationships</dt><dd>{book ? (relCount ? <button className="ri-link" onClick={() => onSection('relations')}>{relCount} remedies</button> : 'none listed') : '…'}</dd>
            <dt>Cited by</dt><dd>{book ? (citations ? `${citations} section${citations > 1 ? 's' : ''} in ${citing.length} monograph${citing.length > 1 ? 's' : ''}` : 'no other monograph') : '…'}</dd>
            {groups?.map((g, i) => <FactRow key={i} label={g.system} value={g.open ? <button className="ri-link" onClick={g.open}>{g.label}</button> : g.label} />)}
            <FactRow label="Your note" value={<button className="ri-link" onClick={() => onSection('sources')}>{note ? (note.length > 60 ? `${note.slice(0, 58)}…` : note) : 'add a note'}</button>} />
          </dl>
        </section>
        <RepertoryCounts remedyId={remedyId} onOpen={() => onSection('repertory')} />
        {cites.length > 0 && entry && (
          <section className="ri-card">
            <div className="ri-card-head">Cited in Boericke</div>
            <div className="ri-chips">
              {citing.slice(0, 60).map(id => <Chip key={id} rid={id} onRemedy={onRemedy} onMenu={onMenu} compact />)}
              {citing.length > 60 && <span className="ri-dim">+{citing.length - 60} more</span>}
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return <><dt>{label}</dt><dd>{value}</dd></>
}

/** Rubric counts in each installed repertory; unloaded ones can be loaded on demand. */
function RepertoryCounts({ remedyId, onOpen }: { remedyId: number; onOpen: () => void }) {
  const catalog = useCatalog()
  const [, setTick] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  return (
    <section className="ri-card">
      <div className="ri-card-head">Repertories <button className="btn btn-sm btn-ghost" onClick={onOpen}>Profile</button></div>
      <table className="ri-reptable">
        <tbody>
          {catalog.repertoryInfos.map(info => {
            const rep = catalog.repertory(info.abbrev)
            const n = rep ? remedyIndex(rep).rubricCount(remedyId) : null
            return (
              <tr key={info.abbrev}>
                <td title={info.fullTitle}>{info.title}</td>
                <td className="ri-num">
                  {n !== null ? `${n.toLocaleString()} rubrics`
                    : loading === info.abbrev ? <Loader2 size={12} className="spin" />
                    : <button className="btn btn-sm btn-ghost" onClick={() => { setLoading(info.abbrev); catalog.loadRepertory(info.abbrev).then(() => { setLoading(null); setTick(t => t + 1) }, e => { setLoading(null); actions.toast(e instanceof Error ? e.message : 'Could not load repertory', 'error') }) }}>Count</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// ───────────────────────── sources & notes ─────────────────────────

/** Where this remedy's information comes from (per repertory and the materia medica), plus the user's own note. */
function Sources({ book, mmError, remedyId }: { book: MMBook | null; mmError: Error | null; remedyId: number }) {
  const catalog = useCatalog()
  const remedy = catalog.remedy(remedyId)
  const [, setTick] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const saved = useApp(s => s.remedyNotes[remedyId] ?? '')
  const [draft, setDraft] = useState(saved)
  /** Unsaved edit; written after a pause, on blur, and before the window shows another remedy or closes. */
  const pending = useRef<{ id: number; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const flush = () => {
    const p = pending.current
    pending.current = null
    if (p) actions.setRemedyNote(p.id, p.text)
    setDirty(false)
  }
  useEffect(() => {
    setDraft(useApp.getState().remedyNotes[remedyId] ?? '')
    return () => { const p = pending.current; pending.current = null; if (p) actions.setRemedyNote(p.id, p.text) }
  }, [remedyId])
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(flush, 500)
    return () => clearTimeout(t)
  }, [draft, dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  const entry = book?.entries.get(remedyId) ?? null
  const cites = book?.citations.get(remedyId) ?? []
  const load = (abbrev: string) => {
    setLoading(abbrev)
    catalog.loadRepertory(abbrev).then(() => { setLoading(null); setTick(t => t + 1) }, e => { setLoading(null); actions.toast(e instanceof Error ? e.message : 'Could not load repertory', 'error') })
  }
  return (
    <div className="ri-pad ri-rel">
      <section className="ri-relgroup">
        <h3><span className="ri-h3-label">Repertories</span><small>Rubrics that list {remedy.abbrev}, per installed repertory.</small></h3>
        <table className="ri-srctable">
          <thead><tr><th>Repertory</th><th>Author · year</th><th>Licence</th><th className="ri-num">Rubrics</th></tr></thead>
          <tbody>
            {catalog.repertoryInfos.map(info => {
              const rep = catalog.repertory(info.abbrev)
              const n = rep ? remedyIndex(rep).rubricCount(remedyId) : null
              return (
                <tr key={info.abbrev}>
                  <td title={info.fullTitle}><b>{info.title}</b><div className="ri-dim">{info.fullTitle}</div></td>
                  <td>{[info.author, info.year].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{info.license || '—'}</td>
                  <td className="ri-num">
                    {n !== null ? n.toLocaleString()
                      : loading === info.abbrev ? <Loader2 size={12} className="spin" />
                      : <button className="btn btn-sm btn-ghost" onClick={() => load(info.abbrev)}>Count</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <section className="ri-relgroup">
        <h3><span className="ri-h3-label">Materia medica</span><small>Monographs installed with the app.</small></h3>
        {mmError ? <p className="ri-dim">The materia medica could not be loaded: {mmError.message}</p> : !book ? <Loading label="Loading Boericke…" /> : (
          <dl className="ri-facts">
            <dt>Source</dt><dd>{book.sourceLine}</dd>
            <dt>Monograph</dt><dd>{entry ? <button className="ri-link" onClick={() => openMM(remedyId)}>{titleCase(entry.heading)} · {entry.sections.length} sections</button> : 'none in this book'}</dd>
            <dt>Cited in</dt><dd>{cites.length ? `${cites.length} section${cites.length > 1 ? 's' : ''} of ${new Set(cites.map(c => c.remedyId)).size} other monographs` : 'no other monograph'}</dd>
            <dt>Text</dt><dd>via OOREP (GPL-3.0)</dd>
          </dl>
        )}
      </section>
      <section className="ri-relgroup">
        <h3><span className="ri-h3-label">Your notes</span><small>{dirty ? 'Saving…' : saved ? 'Saved with your workspace.' : 'Private notes on this remedy, saved with your workspace.'}</small></h3>
        <textarea className="input ri-note" value={draft} rows={6} placeholder={`Notes on ${remedy.name}: clinical experience, sources, differentials…`} aria-label={`Notes on ${remedy.name}`}
          onChange={e => { setDraft(e.target.value); pending.current = { id: remedyId, text: e.target.value }; setDirty(true) }} onBlur={flush} />
      </section>
    </div>
  )
}

// ───────────────────────── relationships ─────────────────────────

const KIND_HINT: Record<string, string> = {
  Complementary: 'Completes the action of this remedy; often follows it.',
  'Follows well': 'Given after this remedy with good effect.',
  Compatible: 'May be used alongside.',
  Antidotes: 'Antidotes named in the Relationship section (either direction as Boericke states).',
  Inimical: 'Should not follow or precede this remedy.',
  Compare: 'Similar remedies worth differentiating.',
}

function Relations({ book, remedyId, links, onRemedy, onMenu }: {
  book: MMBook; remedyId: number; links: RemedyLinkHandlers; onRemedy: (rid: number, e: MouseEvent) => void; onMenu: (rid: number, e: MouseEvent) => void
}) {
  const groups = book.relationships(remedyId)
  const entry = book.entries.get(remedyId)
  const cites = book.citations.get(remedyId) ?? []
  const comparedBy = [...new Set(cites.filter(c => /relation/i.test(c.heading)).map(c => c.remedyId))]
  const [raw, setRaw] = useState(false)
  if (!entry) {
    return (
      <div className="ri-pad">
        <div className="empty-state ri-empty"><Network size={22} /><strong>No Boericke monograph, so no relationships listed</strong>
          {comparedBy.length > 0 && <span>But {comparedBy.length} monograph{comparedBy.length > 1 ? 's' : ''} compare{comparedBy.length > 1 ? '' : 's'} with it:</span>}
        </div>
        {comparedBy.length > 0 && <div className="ri-chips ri-center">{comparedBy.map(id => <Chip key={id} rid={id} onRemedy={onRemedy} onMenu={onMenu} />)}</div>}
      </div>
    )
  }
  return (
    <div className="ri-pad ri-rel">
      {!groups.length ? (
        <div className="empty-state ri-empty"><Network size={22} /><strong>Boericke lists no relationships for this remedy</strong></div>
      ) : groups.map(g => (
        <section key={g.kind} className={`ri-relgroup ri-rel-${g.kind.replace(/\s/g, '').toLowerCase()}`}>
          <h3><span className="ri-h3-label">{g.kind}</span> <span className="badge">{g.remedies.length}</span><small>{KIND_HINT[g.kind]}</small></h3>
          <div className="ri-chips">
            {g.remedies.map(id => <Chip key={id} rid={id} onRemedy={onRemedy} onMenu={onMenu} dim={!book.has(id)} />)}
          </div>
          {g.clauses.some(c => c.context) && (
            <ul className="ri-contexts">
              {g.clauses.filter(c => c.context).map((c, i) => <li key={i}><b>{c.context}:</b> {c.remedies.length ? c.remedies.map(id => book.catalog.remedy(id).abbrev).join(', ') : plainText(c.text)}</li>)}
            </ul>
          )}
        </section>
      ))}
      {comparedBy.length > 0 && (
        <section className="ri-relgroup">
          <h3><span className="ri-h3-label">Compared with it by</span> <span className="badge">{comparedBy.length}</span><small>Monographs whose Relationship section names this remedy.</small></h3>
          <div className="ri-chips">{comparedBy.map(id => <Chip key={id} rid={id} onRemedy={onRemedy} onMenu={onMenu} />)}</div>
        </section>
      )}
      {entry.sections.some(s => /relation/i.test(s.heading)) && (
        <section className="ri-relgroup">
          <button className="btn btn-sm btn-ghost ri-rawtoggle" aria-expanded={raw} onClick={() => setRaw(r => !r)}>{raw ? 'Hide' : 'Show'} source text</button>
          {raw && (
            <div className="ri-raw">
              {entry.sections.filter(s => /relation/i.test(s.heading)).map((s, i) => <Paragraph key={i} text={s.text} book={book} selfId={remedyId} relationship terms={[]} links={links} />)}
              <div className="ri-dim">{book.sourceLine}</div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ───────────────────────── repertory profile ─────────────────────────

const GRADE_LABEL = ['plain', 'italic', 'bold', 'BOLD CAPS']

function RepertoryProfile({ tabId, remedyId }: { tabId: string; remedyId: number }) {
  const catalog = useCatalog()
  const mem = memory(tabId)
  const defaultRep = useApp(s => s.settings.defaultRepertory)
  const initial = mem.repertory ?? (catalog.repertoryInfos.some(r => r.abbrev === defaultRep) ? defaultRep : catalog.repertoryInfos[0]?.abbrev ?? '')
  const [abbrev, setAbbrevState] = useState(initial)
  const setAbbrev = (a: string) => { mem.repertory = a; setAbbrevState(a) }
  const { rep, error } = useRepertory(abbrev)
  const [chapter, setChapter] = useState<number | null>(null)
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()

  const stats = useMemo(() => (rep ? remedyIndex(rep).stats(remedyId) : null), [rep, remedyId])
  const keynotes = useMemo(() => (stats ? (chapter === null ? stats.keynotes : stats.keynotes.filter(k => rep!.chapterOf(k.rubric) === chapter)) : []), [stats, chapter, rep])
  useEffect(() => { setChapter(null); setSel(0) }, [abbrev, remedyId])
  useEffect(() => { setSel(0) }, [chapter])
  const v = useFixedVirtual(listRef, keynotes.length, KEY_ROW)

  const ref = rep && keynotes[sel] ? rep.ref(keynotes[sel].rubric) : null
  useEffect(() => {
    selectedRemedyRubric = ref
    return () => { selectedRemedyRubric = null }
  }, [ref])

  const openRubric = (k: KeynoteRubric) => {
    if (!rep) return
    actions.openTab({ kind: 'repertory', repertory: rep.abbrev, rubric: k.rubric, back: [], forward: [] }, { reuse: false })
  }
  const rubricMenu = (k: KeynoteRubric): MenuItem[] => [
    { label: 'Open in repertory', run: () => openRubric(k) },
    { command: 'rubric.add', label: 'Add to clipboard' },
    { command: 'rubric.takeOptions' },
    { type: 'separator' },
    { label: 'Copy rubric', run: () => { void navigator.clipboard?.writeText(rep!.path(k.rubric)); actions.toast('Copied rubric', 'success') } },
  ]

  const onListKey = (e: ReactKeyboardEvent) => {
    if (!keynotes.length) return
    let ni: number | null = null
    if (e.key === 'ArrowDown' || e.key === 'j') ni = Math.min(keynotes.length - 1, sel + 1)
    else if (e.key === 'ArrowUp' || e.key === 'k') ni = Math.max(0, sel - 1)
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = keynotes.length - 1
    else if (e.key === 'PageDown') ni = Math.min(keynotes.length - 1, sel + v.pageSize)
    else if (e.key === 'PageUp') ni = Math.max(0, sel - v.pageSize)
    else if (e.key === 'Enter') { e.preventDefault(); openRubric(keynotes[sel]); return }
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const row = listRef.current?.querySelector<HTMLElement>('.ri-kn-row.on')
      if (row) cm.openAt(row, rubricMenu(keynotes[sel]))
      return
    }
    if (ni === null) return
    e.preventDefault()
    e.stopPropagation()
    setSel(ni)
    v.scrollToIndex(ni)
  }

  const maxCh = stats?.chapters[0]?.count ?? 1
  const maxGrade = stats ? Math.max(1, ...stats.grades) : 1
  return (
    <div className="ri-profile">
      <div className="ri-profile-bar">
        <div className="ri-seg" role="radiogroup" aria-label="Repertory">
          {catalog.repertoryInfos.map(info => (
            <button key={info.abbrev} role="radio" aria-checked={abbrev === info.abbrev} className={abbrev === info.abbrev ? 'on' : ''} title={info.fullTitle} onClick={() => setAbbrev(info.abbrev)}>{info.title}</button>
          ))}
        </div>
        <span className="grow" />
        {getCommand('search.remedy') && <button className="btn btn-sm" title="All rubrics of this remedy in remedy search (F)" onClick={() => openRemedySearch(remedyId, { newTab: true })}><Search size={13} /> All rubrics<span className="ri-bar-long">in remedy search</span></button>}
      </div>
      {error ? <div className="error-state"><h3>Could not load the repertory</h3><pre>{error.message}</pre></div>
        : !rep || !stats ? <Loading label={`Loading ${catalog.repertoryInfos.find(r => r.abbrev === abbrev)?.title ?? abbrev} and indexing remedies…`} />
        : stats.rubricCount === 0 ? (
          <div className="empty-state ri-empty"><strong>Not in {rep.info.title}</strong><span>This repertory has no rubric with {catalog.remedy(remedyId).abbrev}. Try another repertory.</span></div>
        ) : (
          <div className="ri-profile-body">
            <div className="ri-stats">
              <div className="ri-tile">
                <div className="ri-tile-num">{stats.rubricCount.toLocaleString()}</div>
                <div className="ri-tile-label">rubrics · {((stats.rubricCount / rep.size) * 100).toFixed(1)}% of {rep.info.title}</div>
              </div>
              <div className="ri-grades" aria-label="Grade distribution">
                {([4, 3, 2, 1] as Grade[]).filter(g => g <= remedyIndex(rep).maxGrade).map(g => (
                  <div key={g} className="ri-grade-row" title={`Grade ${g} (${GRADE_LABEL[g - 1]}): ${stats.grades[g - 1].toLocaleString()} rubrics`}>
                    <span className={`ri-grade-name g${g}`}>{g} {GRADE_LABEL[g - 1]}</span>
                    <span className="ri-bar"><span style={{ width: `${(stats.grades[g - 1] / maxGrade) * 100}%` }} /></span>
                    <span className="ri-num">{stats.grades[g - 1].toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="ri-cols">
              <section className="ri-chapters" aria-label="Chapter distribution">
                <div className="ri-card-head">Chapters <span className="ri-dim">click to filter keynotes</span></div>
                <div className="ri-ch-list">
                  {stats.chapters.map(c => (
                    <button key={c.chapter} className={`ri-ch-row${chapter === c.chapter ? ' on' : ''}`} aria-pressed={chapter === c.chapter}
                      title={`${c.name}: ${c.count.toLocaleString()} of ${c.size.toLocaleString()} rubrics (${((c.count / c.size) * 100).toFixed(1)}%)`}
                      onClick={() => setChapter(chapter === c.chapter ? null : c.chapter)}>
                      <span className="ri-ch-name" title={c.name}>{c.name}</span>
                      <span className="ri-bar"><span style={{ width: `${(c.count / maxCh) * 100}%` }} /></span>
                      <span className="ri-num">{c.count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="ri-keynotes" aria-label="Keynote rubrics">
                <div className="ri-card-head">
                  Keynote rubrics <span className="badge">{keynotes.length.toLocaleString()}</span>
                  <span className="ri-dim">grade {stats.keynoteMinGrade}{stats.keynoteMinGrade < remedyIndex(rep).maxGrade ? '+' : ''}, smallest rubrics first{chapter !== null ? ` · ${rep.text(rep.chapters[chapter])}` : ''}</span>
                  {chapter !== null && <button className="btn btn-sm btn-ghost" onClick={() => setChapter(null)}>All chapters</button>}
                </div>
                {!keynotes.length ? (
                  <div className="empty-state"><strong>No grade {stats.keynoteMinGrade}+ rubrics{chapter !== null ? ' in this chapter' : ''}</strong><span>Use remedy search to see all its rubrics.</span></div>
                ) : (
                  <div ref={listRef} className="ri-kn-list" role="listbox" tabIndex={0} aria-label="Keynote rubrics" aria-activedescendant={`ri-kn-${sel}`} onKeyDown={onListKey}>
                    <div style={{ height: v.total, position: 'relative' }}>
                      {keynotes.slice(v.start, v.end).map((k, j) => {
                        const i = v.start + j
                        return (
                          <div key={k.rubric} id={`ri-kn-${i}`} role="option" aria-selected={i === sel} className={`ri-kn-row${i === sel ? ' on' : ''}`} style={{ top: i * KEY_ROW, height: KEY_ROW }}
                            title={`${rep.path(k.rubric)}\n${k.size} remedies · grade ${k.grade} · double-click to open`}
                            onClick={() => setSel(i)} onDoubleClick={() => openRubric(k)}
                            onContextMenu={e => { setSel(i); cm.open(e, rubricMenu(k)) }}>
                            <span className={`ri-kn-g g${k.grade}`}>{k.grade}</span>
                            <span className="ri-kn-path"><KeynotePath text={rep.path(k.rubric, ' › ')} /></span>
                            <span className="ri-kn-size">{k.size}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      {cm.element}
    </div>
  )
}

function KeynotePath({ text }: { text: string }) {
  const i = text.lastIndexOf(' › ')
  if (i < 0) return <b>{text}</b>
  return <><span className="ri-dim">{text.slice(0, i + 3)}</span><b>{text.slice(i + 3)}</b></>
}

// ───────────────────────── families ─────────────────────────

const MEMBER_PREVIEW = 40
const MEMBER_W = 200
const MEMBER_ROW = 29

/**
 * Family members: the first few as chips; "Show all" opens a filterable, virtualised grid
 * (a kingdom has well over a thousand members).
 */
function Members({ members, label, onRemedy, onMenu }: {
  members: number[]; label: string; onRemedy: (rid: number, e: MouseEvent) => void; onMenu: (rid: number, e: MouseEvent) => void
}) {
  const catalog = useCatalog()
  const [all, setAll] = useState(false)
  const [filter, setFilter] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const width = useWidth(boxRef)
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = members.map(id => catalog.remedy(id))
    const sorted = list.sort((a, b) => a.name.localeCompare(b.name))
    return q ? sorted.filter(r => r.abbrev.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : sorted
  }, [members, filter, catalog])
  const cols = Math.max(1, Math.floor((width + 5) / (MEMBER_W + 5)))
  const rows = Math.ceil(shown.length / cols)
  const v = useFixedVirtual(boxRef, rows, MEMBER_ROW, 4)
  if (!all || members.length <= MEMBER_PREVIEW) {
    return (
      <div className="ri-chips">
        {members.slice(0, MEMBER_PREVIEW).map(id => <Chip key={id} rid={id} onRemedy={onRemedy} onMenu={onMenu} />)}
        {members.length > MEMBER_PREVIEW && <button className="btn btn-sm btn-ghost" onClick={() => setAll(true)}>Show all {members.length.toLocaleString()}</button>}
      </div>
    )
  }
  return (
    <div className="ri-members">
      <div className="ri-members-bar">
        <input className="input" value={filter} autoFocus placeholder={`Filter ${members.length.toLocaleString()} members of ${label}…`} aria-label={`Filter members of ${label}`} spellCheck={false}
          onChange={e => setFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && filter) { e.preventDefault(); e.stopPropagation(); setFilter('') } }} />
        <span className="ri-dim">{shown.length.toLocaleString()} shown</span>
        <button className="btn btn-sm btn-ghost" onClick={() => { setAll(false); setFilter('') }}>Show fewer</button>
      </div>
      <div ref={boxRef} className="ri-members-grid" role="list" aria-label={`Members of ${label}`}>
        {!shown.length ? <div className="ri-dim ri-members-none">No member matches “{filter}”</div> : (
          <div style={{ height: rows * MEMBER_ROW, position: 'relative' }}>
            {Array.from({ length: v.end - v.start }, (_, k) => {
              const row = v.start + k
              return (
                <div key={row} className="ri-members-row" style={{ top: row * MEMBER_ROW, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {shown.slice(row * cols, row * cols + cols).map(r => <span key={r.id} role="listitem"><Chip rid={r.id} onRemedy={onRemedy} onMenu={onMenu} /></span>)}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Families({ groups, self, onRemedy, onMenu, onLimit }: {
  groups: RemedyGroup[]; self: number; onRemedy: (rid: number, e: MouseEvent) => void; onMenu: (rid: number, e: MouseEvent) => void
  onLimit: (g: RemedyGroup, mode: 'limit' | 'highlight') => void
}) {
  if (!groups.length) return <div className="empty-state ri-empty"><strong>No family or kingdom data for this remedy</strong></div>
  return (
    <div className="ri-pad ri-rel">
      {groups.map((g, i) => (
        <section key={i} className="ri-relgroup">
          <h3><span className="ri-h3-label">{g.system}: {g.label}</span> <span className="badge">{g.members.length}</span></h3>
          <div className="ri-famactions">
            <button className="btn btn-sm" onClick={() => onLimit(g, 'limit')}><Filter size={13} /> Limit analysis</button>
            <button className="btn btn-sm" onClick={() => onLimit(g, 'highlight')}><Highlighter size={13} /> Highlight in analysis</button>
            {g.open && <button className="btn btn-sm btn-ghost" onClick={g.open}>Open family <ExternalLink size={12} /></button>}
          </div>
          <Members members={g.members.filter(id => id !== self)} label={g.label} onRemedy={onRemedy} onMenu={onMenu} />
        </section>
      ))}
    </div>
  )
}
