import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppWindow, Check, ChevronRight, Command as CommandIcon, History, Pill, Search, TextSearch, User, X } from 'lucide-react'
import { allCommands, displayKey, formatKeys, isEnabled, onCommandsChanged } from '../../commands/registry'
import type { Command } from '../../commands/registry'
import { useCatalog } from '../../data/CatalogContext'
import { actions, useApp } from '../../state/store'
import { tabTitle } from '../../shell/tabTitle'
import { goToRef } from '../repertory/ops'
import { highlighter, search } from '../search/engine'
import { findRemedies } from '../search/remedies'
import { openRemedySearch, openSearch, prepare, readyTargets, remedyResolver } from '../search/ops'
import { Highlight, RubricPath, titleIfTruncated } from '../search/components'
import { fuzzyIndex, markPositions } from './fuzzy'
import { bindQuerySetter, commandCounts, lastOf, memoPerCommand, paletteItems, parseMode, recentCommands, rememberCommand, takeInitialQuery } from './model'
import type { PaletteItem, Section } from './model'
import './palette.css'

/** Unified command palette: commands, open tabs, patients, remedies and rubrics. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog()
  const [query, setQuery] = useState(() => takeInitialQuery())
  const [active, setActive] = useState(0)
  const [cmdVersion, setCmdVersion] = useState(0)
  const [repVersion, setRepVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // captured before the palette takes focus (a layout effect would see the palette input under StrictMode)
  const [restoreEl] = useState(() => document.activeElement as HTMLElement | null)
  const tabs = useApp(s => s.tabs)
  const activeTabId = useApp(s => s.activeTabId)
  // the whole input text was selected before this keystroke: typing replaces the mode chip too
  const replaceAll = useRef(false)
  const patients = useApp(s => s.patients)
  const consultations = useApp(s => s.consultations)

  useLayoutEffect(() => {
    inputRef.current?.focus()
    const len = inputRef.current?.value.length ?? 0
    inputRef.current?.setSelectionRange(len, len)
  }, [])
  useEffect(() => onCommandsChanged(() => setCmdVersion(v => v + 1)), [])
  useEffect(() => { bindQuerySetter(q => { setQuery(q); inputRef.current?.focus() }); return () => bindQuerySetter(null) }, [])

  const { mode, text } = parseMode(query)
  const wantsRubrics = mode === 'rubrics' || (mode === 'all' && text.trim().length >= 3)
  const scopeTab = useMemo(() => ({ scope: 'all' as const, repertories: [currentRep()] }), [])
  useEffect(() => {
    if (!wantsRubrics) return
    const { pending } = readyTargets(scopeTab)
    if (!pending.length) return
    let alive = true
    prepare(pending).then(() => { if (alive) startTransition(() => setRepVersion(v => v + 1)) }, () => {})
    return () => { alive = false }
  }, [wantsRubrics, scopeTab])

  // Commands and tabs follow every keystroke; remedies, patients and rubrics use a deferred copy of
  // the query (an interruptible background render), each computed once per query.
  const deferredQuery = useDeferredValue(query)
  const slow = parseMode(deferredQuery)
  const slowText = slow.mode === mode ? slow.text : text
  const remediesFor = useMemo(() => lastOf(q => findRemedies(catalog, q, mode === 'remedies' ? 50 : 6)), [catalog, mode])
  const rubricsFor = useMemo(() => {
    const { targets, pending } = readyTargets(scopeTab)
    return lastOf(q => {
      if (!targets.length) return { hits: [], pending: pending.length > 0 }
      const res = search(q, targets, { prefixLast: true, limit: mode === 'rubrics' ? 60 : 8, resolveRemedy: remedyResolver })
      return { hits: res.hits.map(h => ({ ref: h.rep.ref(h.index), rep: h.rep, index: h.index })), pending: pending.length > 0 }
    })
  }, [mode, scopeTab, repVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Built once per open (and when the registry changes): folded-title index, command list,
  // recents/counts from storage, and memoised enabled()/checked() so keystrokes only re-rank.
  const match = useMemo(() => fuzzyIndex(), [])
  const perOpen = useMemo(() => ({
    commands: allCommands(),
    enabled: memoPerCommand(isEnabled),
    checked: memoPerCommand((c: Command) => !!c.checked?.()),
  }), [cmdVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const stored = useMemo(() => ({ recent: recentCommands(), counts: commandCounts() }), [])
  const tabList = useMemo(() => tabs.map(t => ({ id: t.id, active: t.id === activeTabId, ...tabTitle(t, catalog, { patients, consultations }) })), [tabs, activeTabId, catalog, patients, consultations])
  const patientList = useMemo(() => Object.values(patients), [patients])
  const itemsFor = (slowText: string) => paletteItems({
    mode, text, slowText,
    commands: perOpen.commands,
    recent: stored.recent,
    counts: stored.counts,
    match,
    enabled: perOpen.enabled,
    tabs: tabList,
    patients: patientList,
    remedies: remediesFor,
    rubrics: rubricsFor,
  })
  const sections: Section[] = useMemo(() => itemsFor(slowText), [mode, text, slowText, tabList, patientList, perOpen, remediesFor, rubricsFor]) // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => sections.flatMap(s => s.items), [sections])
  const rubricHl = useMemo(() => {
    const res = slowText.trim() ? search(slowText, [], { prefixLast: true }) : null
    return res?.parsed.positive.length ? highlighter(res.parsed) : null
  }, [slowText])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { listRef.current?.querySelector(`[data-n="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  const close = () => {
    onClose()
    const el = restoreEl
    if (el && el.isConnected && el !== document.body) el.focus()
  }

  const run = (item: PaletteItem | undefined, alt = false) => {
    if (!item || item.disabled) return
    close()
    switch (item.kind) {
      case 'command': rememberCommand(item.command.id); void item.command.run(); break
      case 'tab': actions.activateTab(item.id); break
      case 'patient': actions.openTab({ kind: 'patient', patientId: item.patient.id }); break
      case 'remedy': if (alt) openRemedySearch(item.remedy.id, { newTab: true }); else actions.openTab({ kind: 'remedy', remedyId: item.remedy.id }); break
      case 'rubric': actions.addRecentSearch(text); void goToRef(item.ref, { newTab: alt }); break
      case 'search': actions.addRecentSearch(item.query); openSearch(item.query, { newTab: true, scope: 'all' }); break
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % Math.max(1, flat.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + flat.length) % Math.max(1, flat.length)) }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 8)) }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive(a => Math.max(0, a - 8)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      // Enter right after typing, before the deferred results caught up: act on the top result for
      // what is typed now, not on the list for an older query
      const item = slowText !== text && active === 0 ? itemsFor(text).flatMap(s => s.items)[0] : flat[active]
      run(item, e.altKey || e.ctrlKey || e.metaKey)
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') e.preventDefault()
    else if (e.key === 'Backspace' && !text && mode !== 'all') { e.preventDefault(); setQuery('') }
  }

  let n = -1
  const activeItem = flat[active]
  return createPortal(
    <div className="pal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="pal-inputrow">
          {mode !== 'all' ? (
            <span className={`pal-mode pal-mode-${mode}`}>
              {MODE_LABEL[mode]}
              <button className="pal-mode-x" tabIndex={-1} aria-label={`Leave ${MODE_LABEL[mode].toLowerCase()} mode`} title="Search everything (Backspace)"
                onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(text); inputRef.current?.focus() }}><X size={11} /></button>
            </span>
          ) : <Search size={16} className="pal-search-ico" />}
          <input
            ref={inputRef}
            className="pal-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `pal-opt-${active}` : undefined}
            aria-label="Command or search"
            placeholder={PLACEHOLDER[mode]}
            spellCheck={false}
            autoComplete="off"
            value={mode === 'all' ? query : text}
            onKeyDown={e => {
              const el = e.currentTarget
              replaceAll.current = mode !== 'all' && el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length
            }}
            onChange={e => {
              const v = e.target.value
              const wasAll = replaceAll.current
              replaceAll.current = false
              setQuery(mode === 'all' || wasAll || /^[>#@/]/.test(v) ? v : PREFIX[mode] + v)
            }}
          />
        </div>
        {flat.length === 0 && (
          // outside the listbox (which holds only options), announced politely
          <div className="pal-empty" role="status">{sections.some(s => s.pending) || slowText !== text ? 'Searching…' : text.trim() ? `Nothing matches “${text.trim()}”` : 'Nothing here yet'}</div>
        )}
        <div className="pal-list" id="pal-list" role="listbox" aria-label="Results" ref={listRef} hidden={flat.length === 0}>
          {sections.map(s => (
            <div key={s.key} role="group" aria-label={s.label}>
              <div className="pal-head">{s.label}{s.pending && <span className="pal-head-note"> · indexing…</span>}</div>
              {s.items.map(item => {
                n++
                const k = n
                return (
                  <div
                    key={`${s.key}-${k}`}
                    id={`pal-opt-${k}`}
                    data-n={k}
                    role="option"
                    aria-selected={k === active}
                    aria-disabled={item.disabled || undefined}
                    className={`pal-opt${k === active ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
                    onMouseMove={() => { if (k !== active) setActive(k) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => run(item, e.altKey || e.ctrlKey || e.metaKey)}
                  >
                    <ItemBody item={item} text={text} hl={rubricHl} checked={perOpen.checked} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="pal-foot">
          <span><kbd className="kbd">&gt;</kbd> commands</span>
          <span><kbd className="kbd">#</kbd> remedies</span>
          <span><kbd className="kbd">@</kbd> patients</span>
          <span><kbd className="kbd">/</kbd> rubrics</span>
          <span className="pal-foot-sp" />
          <span><kbd className="kbd">↵</kbd> run</span>
          {(activeItem?.kind === 'rubric' || activeItem?.kind === 'remedy') && <span><kbd className="kbd">{formatKeys('Alt+Enter')}</kbd> {activeItem.kind === 'rubric' ? 'new tab' : 'remedy search'}</span>}
          <span><kbd className="kbd">Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const MODE_LABEL = { commands: 'Commands', remedies: 'Remedies', patients: 'Patients', rubrics: 'Rubrics', all: '' } as const
const PREFIX = { commands: '>', remedies: '#', patients: '@', rubrics: '/', all: '' } as const
const PLACEHOLDER = {
  all: 'Type a command, rubric, remedy, patient or tab…',
  commands: 'Run a command…',
  remedies: 'Remedy abbreviation or name…',
  patients: 'Patient name…',
  rubrics: 'Words of a rubric…',
} as const

function currentRep(): string {
  const s = useApp.getState()
  const t = s.tabs.find(x => x.id === s.activeTabId)
  return t?.kind === 'repertory' ? t.repertory : s.settings.defaultRepertory
}

function Marked({ text, positions }: { text: string; positions?: number[] }) {
  if (!positions?.length) return <>{text}</>
  return <>{markPositions(text, positions).map((s, i) => s.hit ? <mark key={i} className="pal-mark">{s.text}</mark> : <span key={i}>{s.text}</span>)}</>
}

function ItemBody({ item, text, hl, checked: isChecked }: { item: PaletteItem; text: string; hl: ((n: string) => boolean) | null; checked: (c: Command) => boolean }) {
  const catalog = useCatalog()
  switch (item.kind) {
    case 'command': {
      const c = item.command
      const checked = isChecked(c)
      return (
        <>
          <span className="pal-ico">{item.recent ? <History size={14} /> : checked ? <Check size={14} /> : <CommandIcon size={14} />}</span>
          <span className="pal-text"><Marked text={c.title} positions={item.positions} /></span>
          {item.why && <span className="pal-why" title="Matched a keyword">{item.why}</span>}
          <span className="pal-cat">{c.category}</span>
          {item.disabled && <span className="pal-note">unavailable</span>}
          {displayKey(c.keys) && <kbd className="kbd pal-keys">{formatKeys(displayKey(c.keys)!)}</kbd>}
        </>
      )
    }
    case 'tab':
      return (
        <>
          <span className="pal-ico"><AppWindow size={14} /></span>
          <span className="pal-text"><Marked text={item.title} positions={item.positions} />{item.subtitle && <span className="pal-sub"> — {item.subtitle}</span>}</span>
          <span className="pal-cat">Open tab</span>
        </>
      )
    case 'patient': {
      const p = item.patient
      return (
        <>
          <span className="pal-ico"><User size={14} /></span>
          <span className="pal-text"><Marked text={item.label} positions={item.positions} />{p.birthDate && <span className="pal-sub"> · {p.birthDate}</span>}</span>
          <span className="pal-cat">Patient</span>
        </>
      )
    }
    case 'remedy':
      return (
        <>
          <span className="pal-ico"><Pill size={14} /></span>
          <span className="pal-text"><b className="pal-abbrev"><Highlight text={item.remedy.abbrev} hit={prefixHl(text)} /></b> <Highlight text={item.remedy.name} hit={prefixHl(text)} /></span>
          <span className="pal-cat">Remedy</span>
        </>
      )
    case 'rubric': {
      const parts = item.rep.lineage(item.index).map(i => item.rep.text(i))
      return (
        <>
          <span className="pal-ico"><TextSearch size={14} /></span>
          <span className="pal-text pal-rubric" onMouseEnter={titleIfTruncated(() => parts.join(', '))}><RubricPath parts={parts} hit={hl} /></span>
          <span className="pal-cat">{catalog.repertoryInfos.length > 1 ? item.rep.info.abbrev : 'Rubric'} · {item.rep.remedyCount(item.index)}</span>
        </>
      )
    }
    case 'search':
      return (
        <>
          <span className="pal-ico"><Search size={14} /></span>
          <span className="pal-text">Search rubrics for “{item.query}”</span>
          <ChevronRight size={14} className="pal-cat" />
        </>
      )
  }
}

function prefixHl(text: string) {
  const q = text.trim().toLowerCase()
  return q ? (norm: string) => norm.startsWith(q) : null
}

