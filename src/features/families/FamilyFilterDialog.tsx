import { useMemo, useRef, useState } from 'react'
import { Filter, Highlighter, Info, ListFilter, Search, X } from 'lucide-react'
import { getCommand, isEnabled } from '../../commands/registry'
import { openRemedyFilter } from '../analysis/ops'
import { Dialog } from '../../ui/Dialog'
import { actions, useApp } from '../../state/store'
import { useFamilies } from './api'
import { FamilyTree } from './FamilyTree'
import { ancestorsOf, bestMatch, groupsOfFilter, KIND_LABEL, unionLabel, visibleRows } from './model'
import type { FamilyIndex } from './model'
import { analysisToastAction, applyFamilyFilter, clearFamilyFilter } from './ops'
import type { FilterMode } from './ops'

/** The analysis feature's per-remedy filter dialog (limit / exclude / highlight single remedies, minimum coverage). */
const REMEDY_FILTER_COMMAND = 'analysis.remedies'
import './families.css'

interface Props {
  consultationId: string
  /** Groups checked initially. */
  groups?: string[]
  mode?: FilterMode
  onClose: () => void
}

/**
 * Choose one or more families and apply them to the analysis of a case as a limit
 * (only their remedies stay) or a highlight (their remedies are marked). Registered as dialog 'families.filter'.
 */
export function FamilyFilterDialog(props: Props) {
  const { index, error, retry } = useFamilies()
  if (!index) {
    return (
      <Dialog title="Family filter" onClose={props.onClose} width={640}>
        {error
          ? <div className="error-state" role="alert"><h3>Families could not be loaded</h3><pre>{error.message}</pre><button className="btn" onClick={retry}>Retry</button></div>
          : <div className="fam-skel" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ width: `${45 + ((i * 29) % 40)}%`, height: 14 }} />)}</div>}
      </Dialog>
    )
  }
  return <Loaded {...props} index={index} />
}

function Loaded({ consultationId, groups, mode: initialMode, onClose, index }: Props & { index: FamilyIndex }) {
  const analysis = useApp(s => s.consultations[consultationId]?.analysis ?? null)
  const [preset] = useState(() => (groups ?? []).filter(g => index.get(g)))
  // the family groups behind the current limit / highlight (null: that filter is not made of families)
  const current = useMemo(() => ({
    limit: groupsOfFilter(index, analysis?.filterGroups, analysis?.remedyFilter),
    highlight: groupsOfFilter(index, analysis?.highlightGroups, analysis?.highlight),
  }), [index, analysis])
  const hasLimit = !!analysis?.remedyFilter
  const hasHighlight = !!analysis?.highlight?.length
  // open in the mode of the active filter: a highlight alone opens in Highlight
  const [mode, setMode] = useState<FilterMode>(() => initialMode ?? (!hasLimit && hasHighlight ? 'highlight' : 'limit'))
  // one selection per mode; switching the mode shows that mode's families
  // groups the dialog was opened with (e.g. the family selected in the view) are added to the current filter
  const [sel, setSel] = useState<Record<FilterMode, Set<string>>>(() => {
    const start = (m: FilterMode) => new Set([...(current[m] ?? []), ...(m === mode ? preset : [])])
    return { limit: start('limit'), highlight: start('highlight') }
  })
  // ...and follow the mode until the user checks or unchecks something: "open with Solanaceae, switch to
  // Highlight" highlights Solanaceae instead of leaving it added to the limit
  const [carry, setCarry] = useState<string[] | null>(() => preset.length ? preset : null)
  const checked = sel[mode]
  const setChecked = (fn: (s: Set<string>) => Set<string>) => { setCarry(null); setSel(x => ({ ...x, [mode]: fn(x[mode]) })) }
  const switchMode = (m: FilterMode) => {
    if (m === mode) return
    if (carry) {
      setSel(x => {
        const from = new Set(x[mode]), to = new Set(x[m])
        for (const g of carry) { if (!current[mode]?.includes(g)) from.delete(g); to.add(g) }
        return { ...x, [mode]: from, [m]: to }
      })
    }
    setMode(m)
  }
  const [active, setActive] = useState<string | null>(() => groups?.find(g => index.get(g)) ?? [...checked][0] ?? null)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const set of [sel.limit, sel.highlight]) for (const g of set) for (const a of ancestorsOf(index, g)) s.add(a)
    return s
  })
  const [query, setQuery] = useState('')
  const treeRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => visibleRows(index, expanded, query), [index, expanded, query])
  const union = useMemo(() => index.union(checked), [index, checked])
  const ids = [...checked]

  const toggle = (id: string, expand?: boolean) => setExpanded(s => {
    const n = new Set(s)
    if (expand ?? !n.has(id)) n.add(id); else n.delete(id)
    return n
  })
  const check = (id: string) => setChecked(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  if (!analysis) {
    return <Dialog title="Family filter" onClose={onClose}><div className="empty-state"><strong>This case no longer exists.</strong></div></Dialog>
  }

  const MODES: FilterMode[] = ['limit', 'highlight']
  const exists = (m: FilterMode) => (m === 'limit' ? hasLimit : hasHighlight)
  const nounOf = (m: FilterMode) => (m === 'limit' ? 'limit' : 'highlight')
  // a mode has pending changes when its checked families differ from the filter in the analysis
  // (a filter of single remedies, not families, only changes when families are checked)
  const dirty = (m: FilterMode) => {
    const c = current[m]
    if (!exists(m) || c === null) return sel[m].size > 0
    return c.length !== sel[m].size || c.some(g => !sel[m].has(g))
  }
  const pending = MODES.filter(dirty)
  const labelFor = (m: FilterMode) => !sel[m].size ? `Clear ${nounOf(m)}` : exists(m) ? `Update ${nounOf(m)}` : m === 'limit' ? 'Limit analysis' : 'Highlight'
  // the primary action names what it will do, and is disabled when there is nothing to do
  const primary = pending.length === 2 ? 'Apply limit & highlight'
    : pending.length === 1 ? labelFor(pending[0])
    : exists(mode) ? `Update ${nounOf(mode)}` : mode === 'limit' ? 'Limit analysis' : 'Highlight'
  const canApply = pending.length > 0
  const apply = () => {
    if (!canApply) { onClose(); return }
    const done: string[] = []
    for (const m of pending) {
      const g = [...sel[m]]
      if (!g.length) { clearFamilyFilter(m, consultationId); done.push(`${nounOf(m)} removed`) }
      else { applyFamilyFilter(g, m, consultationId, { toast: pending.length === 1 }); done.push(`${m === 'limit' ? 'limited to' : 'highlighting'} ${unionLabel(index, g)}`) }
    }
    // one toast for the whole apply (applyFamilyFilter toasts itself when it is the only change)
    if (pending.length > 1 || !sel[pending[0]].size) {
      const t = done.join('; ')
      actions.toast(`Family filter: ${t}`, 'success', analysisToastAction(consultationId))
    }
    onClose()
  }
  const noun = nounOf(mode)
  const cur = current[mode]
  // the analysis's own per-remedy dialog (exclude, minimum coverage …) stays one click away
  const remedyFilterCmd = getCommand(REMEDY_FILTER_COMMAND)
  const openRemedyFilters = () => { onClose(); openRemedyFilter(consultationId) }
  const focusTree = () => treeRef.current?.querySelector<HTMLElement>('.fam-tree')?.focus()
  const toTree = () => {
    // the best hit (exact / prefix name, family before order), not merely the first in tree order
    const first = bestMatch(index, rows, query) ?? rows.find(r => r.id === active)?.id ?? rows[0]?.id
    if (first) setActive(first)
    focusTree() // synchronously, so a fast Space after ArrowDown lands in the tree
  }

  return (
    <Dialog
      title="Family filter"
      onClose={onClose}
      width={680}
      initialFocus=".fam-dlg-search input"
      footer={
        <>
          <button className="btn btn-ghost" disabled={!hasLimit} onClick={() => { clearFamilyFilter('limit', consultationId); setCarry(null); setSel(x => ({ ...x, limit: new Set() })); actions.toast('Family limit removed', 'success') }}>Remove limit</button>
          <button className="btn btn-ghost" disabled={!hasHighlight} onClick={() => { clearFamilyFilter('highlight', consultationId); setCarry(null); setSel(x => ({ ...x, highlight: new Set() })); actions.toast('Family highlight removed', 'success') }}>Remove highlight</button>
          {remedyFilterCmd && (
            <button className="btn btn-ghost" disabled={!isEnabled(remedyFilterCmd)} onClick={openRemedyFilters} title="Limit, exclude or highlight single remedies and set the minimum symptom coverage">
              <ListFilter size={13} /> Remedy filters…
            </button>
          )}
          <span className="fam-spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={apply} data-testid="fam-apply" disabled={!canApply}
            title={canApply ? 'Apply (Ctrl+Enter)' : sel[mode].size ? 'No changes to apply' : 'Check one or more families first'}>
            {primary}
          </button>
        </>
      }
    >
      <div className="fam-dlg" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); apply() } }}>
        <div className="fam-dlg-top">
          <div className="fam-seg" role="radiogroup" aria-label="Filter mode">
            <button role="radio" aria-checked={mode === 'limit'} className={mode === 'limit' ? 'on' : ''} onClick={() => switchMode('limit')} title="Only remedies of the chosen families stay in the analysis">
              <Filter size={13} /> Limit{mode !== 'limit' && dirty('limit') && <span className="fam-seg-dot" title="Unapplied changes" aria-label="(unapplied changes)" />}
            </button>
            <button role="radio" aria-checked={mode === 'highlight'} className={mode === 'highlight' ? 'on' : ''} onClick={() => switchMode('highlight')} title="Mark remedies of the chosen families without changing scores">
              <Highlighter size={13} /> Highlight{mode !== 'highlight' && dirty('highlight') && <span className="fam-seg-dot" title="Unapplied changes" aria-label="(unapplied changes)" />}
            </button>
          </div>
          <div className="fam-search fam-dlg-search">
            <Search size={14} aria-hidden="true" />
            <input className="input" placeholder="Find family or element" aria-label="Find family" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.ctrlKey || e.metaKey) return
                if (e.key === 'ArrowDown') { e.preventDefault(); toTree() }
                else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (query.trim()) toTree()
                  else apply()
                } else if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery('') }
              }} />
          </div>
        </div>
        <p className="fam-muted fam-dlg-hint">
          {mode === 'limit'
            ? 'Only remedies of the checked families stay in the analysis. Several families combine (union).'
            : 'Remedies of the checked families are marked in the analysis; scores are unchanged.'}
          {' '}Space checks the focused family; Enter on a checked family or Ctrl+Enter applies.
        </p>
        {exists(mode) && cur === null && (
          <p className="fam-dlg-custom" role="note">
            <Info size={13} aria-hidden="true" />
            The current {noun} is a list of {(mode === 'limit' ? analysis.remedyFilter! : analysis.highlight!).length} single remedies, not families. Applying families replaces it.
          </p>
        )}
        <div className="fam-dlg-body">
          <div className="fam-dlg-tree" ref={treeRef}>
            <FamilyTree
              index={index}
              rows={rows}
              active={active}
              onActivate={setActive}
              onToggle={toggle}
              checked={checked}
              onCheck={check}
              onEnter={id => { if (!checked.has(id)) check(id); else apply() }}
              onOpen={check}
              label="Families"
              idPrefix="famdlg"
              onExitStart={() => document.querySelector<HTMLInputElement>('.fam-dlg-search input')?.focus()}
              query={query}
              empty={<div className="empty-state"><strong>No family matches “{query}”</strong></div>}
            />
          </div>
          <div className="fam-dlg-side">
            <div className="pane-head">Selected for {noun} <span className="badge">{ids.length}</span></div>
            {ids.length === 0 && <div className="fam-muted fam-dlg-none">No family checked.</div>}
            <ul className="fam-dlg-sel" aria-label="Selected families">
              {ids.map(id => {
                const n = index.get(id)!
                return (
                  <li key={id} title={index.pathLabel(id)}>
                    <span className="fam-ellipsis">{n.name}</span>
                    {n.depth > 0 && KIND_LABEL[n.kind] && <span className={`fam-level k-${n.kind}`}>{KIND_LABEL[n.kind]}</span>}
                    <span className="fam-count">{n.remedies.length}</span>
                    <button className="icon-btn" aria-label={`Remove ${n.name}`} onClick={() => check(id)}><X size={12} /></button>
                  </li>
                )
              })}
            </ul>
            <div className="fam-dlg-sum" role="status">
              {ids.length ? <><strong>{union.length}</strong> remed{union.length === 1 ? 'y' : 'ies'} in {unionLabel(index, ids)}</> : 'Nothing selected'}
            </div>
            <div className="fam-dlg-cur">
              <div>Current limit: <strong>{hasLimit ? (analysis.filterLabel ?? `${analysis.remedyFilter!.length} remedies`) : 'none'}</strong></div>
              <div>Current highlight: <strong>{hasHighlight ? (analysis.highlightLabel ?? `${analysis.highlight!.length} remedies`) : 'none'}</strong></div>
              {(analysis.excludedRemedies.length > 0 || analysis.minCoverage > 0) && (
                <div>Also: <strong>{[
                  analysis.excludedRemedies.length ? `${analysis.excludedRemedies.length} excluded` : '',
                  analysis.minCoverage ? `min. ${analysis.minCoverage} symptoms` : '',
                ].filter(Boolean).join(' · ')}</strong></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
