import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { History, Loader2, Pill, Search, SearchCode, X } from 'lucide-react'
import { formatKeys, isMac } from '../../commands/registry'
import { useCatalog } from '../../data/CatalogContext'
import type { Repertory } from '../../data/repertory'
import type { RubricRef } from '../../data/types'
import { useShallow } from 'zustand/react/shallow'
import { actions, useApp } from '../../state/store'
import { goToRef, recentOf, takeRefs } from '../repertory/ops'
import { DEFAULT_TAKE } from '../repertory/take'
import { SearchAborted, cachedHighlighter, searchSliced, yieldToEventLoop } from './engine'
import type { SearchResult, Target } from './engine'
import { parseQuery } from './query'
import { findRemedies, remedyIntent } from './remedies'
import type { RemedyMatch } from './remedies'
import type { Catalog } from '../../data/catalog'
import type { RepertoryTab } from '../../state/workspace'
import { currentRepertory, openRemedySearch, openSearch, prepare, readyTargets, remedyResolver } from './ops'
import { Highlight, RubricPath, titleIfTruncated } from './components'
import './search.css'

type Item =
  | { kind: 'rubric'; rep: Repertory; index: number; full?: boolean }
  | { kind: 'remedy'; remedyId: number }
  | { kind: 'recent'; query: string }
  | { kind: 'search'; query: string }

type Group = { key: string; label: string; sub?: string; items: { item: Item; n: number }[] }

const RUBRIC_LIMIT = 30

/** Toolbar type-ahead: rubrics across repertories grouped by chapter, and remedies. */
export function QuickFind() {
  const catalog = useCatalog()
  const recent = useApp(s => s.recentSearches)
  // the repertory tab the user last worked in, for its recent rubrics
  // only the fields recentRubrics reads, so unrelated tab changes (scroll, selection) do not re-render the toolbar
  const recentTab = useApp(useShallow((s): RecentSource => {
    const a = s.tabs.find(t => t.id === s.activeTabId)
    const t = a?.kind === 'repertory' ? a : s.tabs.find(x => x.kind === 'repertory')
    return t?.kind === 'repertory' ? { repertory: t.repertory, rubrics: s.recentRubrics, recent: t.recent, back: t.back } : { repertory: null, rubrics: s.recentRubrics, recent: undefined, back: undefined }
  }))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const all = catalog.repertoryInfos.map(r => r.abbrev)
  const first = open ? currentRepertory() : all[0]
  const tabLike = useMemo(() => ({ scope: 'all' as const, repertories: [first] }), [first])

  // load + index every repertory the first time the box is used
  useEffect(() => {
    if (!open) return
    let alive = true
    const { pending } = readyTargets(tabLike)
    if (!pending.length) return
    // the first results after indexing render in a transition, so typing stays responsive meanwhile
    prepare(pending).then(() => { if (alive) startTransition(() => setVersion(v => v + 1)) }, e => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [open, tabLike])

  const q = query.trim()
  // Nothing is searched in the keystroke's own task: the rubric search runs in ~8 ms slices from the
  // next task on (a newer keystroke aborts it) and keeps only the best RUBRIC_LIMIT hits; the remedy
  // matches are found right after it. The dropdown keeps showing the previous matches meanwhile.
  const [found, setFound] = useState<{ query: string; targets: Target[]; res: SearchResult | null; rem: RemedyMatch[] } | null>(null)
  const { targets: readyNow, pending: pendingNow } = useMemo(
    () => (open ? readyTargets(tabLike) : { targets: [] as Target[], pending: [] as string[] }),
    [open, tabLike, version], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => {
    if (!open || !q) return
    const ac = new AbortController()
    const targets = readyNow
    const run = async () => {
      const res = q.length >= 2 && targets.length
        ? await searchSliced(query, targets, { prefixLast: true, limit: RUBRIC_LIMIT, resolveRemedy: remedyResolver }, ac.signal)
        : (await yieldToEventLoop(), null)
      if (ac.signal.aborted) return
      // a remedy abbreviation typed on purpose (sulph, lach, nat-m) goes before the rubrics
      const rem = findRemedies(catalog, q.replace(/^#/, ''), 5).filter(m => m.score >= 55)
      setFound({ query, targets, res, rem })
    }
    run().catch(e => { if (!(e instanceof SearchAborted)) setError(e instanceof Error ? e.message : String(e)) })
    return () => ac.abort()
  }, [open, q, query, readyNow, catalog])
  // the dropdown is up to date with the box (Enter waits for this)
  const settled = !q || (found?.query === query && found.targets === readyNow)

  const { groups, flat, total, pending } = useMemo(() => {
    const groups: Group[] = []
    const flat: Item[] = []
    let total = 0
    const push = (g: Group, item: Item) => { g.items.push({ item, n: flat.length }); flat.push(item) }
    // closed: nothing is shown, so nothing is searched (keeps typing elsewhere free of this work)
    if (!open) return { groups, flat, total, pending: [] as string[] }
    const targets = readyNow, pending = pendingNow
    if (!q) {
      if (recent.length) {
        const g: Group = { key: 'recent', label: 'Recent searches', items: [] }
        recent.slice(0, 6).forEach(r => push(g, { kind: 'recent', query: r }))
        groups.push(g)
      }
      const rr = recentRubrics(catalog, recentTab)
      if (rr.items.length) {
        const g: Group = { key: 'recent-rubrics', label: 'Recent rubrics', sub: rr.rep?.info.title, items: [] }
        rr.items.forEach(index => push(g, { kind: 'rubric', rep: rr.rep!, index, full: true }))
        groups.push(g)
      }
      return { groups, flat, total, pending }
    }
    const rem = found?.rem ?? []
    const remedyFirst = remedyIntent(q, rem)
    const pushRemedies = () => {
      if (!rem.length) return
      const g: Group = { key: 'remedies', label: 'Remedies', items: [] }
      rem.forEach(m => push(g, { kind: 'remedy', remedyId: m.remedy.id }))
      groups.push(g)
    }
    if (remedyFirst) pushRemedies()
    const res = q.length >= 2 ? found?.res ?? null : null
    if (q.length >= 2 && targets.length && res) {
      total = res.total
      const byKey = new Map<string, Group>()
      for (const h of res.hits) {
        const root = h.rep.chapterRoot(h.index)
        const key = `${h.rep.abbrev}:${root}`
        let g = byKey.get(key)
        if (!g) {
          g = { key, label: h.rep.text(root), sub: targets.length > 1 ? h.rep.info.title : undefined, items: [] }
          byKey.set(key, g)
          groups.push(g)
        }
        g.items.push({ item: { kind: 'rubric', rep: h.rep, index: h.index }, n: -1 })
      }
      // number items in display order
      for (const g of groups) for (const it of g.items) if (it.n < 0) { it.n = flat.length; flat.push(it.item) }
    }
    if (!remedyFirst) pushRemedies()
    const g: Group = { key: 'more', label: '', items: [] }
    push(g, { kind: 'search', query })
    groups.push(g)
    return { groups, flat, total, pending }
  }, [open, query, q, readyNow, pendingNow, found, recent, recentTab, catalog]) // eslint-disable-line react-hooks/exhaustive-deps

  const hl = useMemo(() => {
    if (!q) return null
    const parsed = parseQuery(query, { prefixLast: true })
    return parsed.positive.length ? cachedHighlighter(parsed, `qf:${query}`) : null
  }, [query, q])

  // the highlighted option goes back to the top when the list changes
  useEffect(() => { setActive(0) }, [query, found])
  const pendingEnter = useRef<'open' | 'take' | null>(null)
  useEffect(() => {
    popRef.current?.querySelector(`[data-n="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = (restore: boolean) => {
    setOpen(false)
    if (restore) { const el = restoreRef.current; restoreRef.current = null; if (el && el !== inputRef.current && el.isConnected) el.focus(); else inputRef.current?.blur() }
  }

  const focusBook = () => requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>('.rv-scroll')?.focus()))

  const run = (item: Item | undefined, how: 'open' | 'take' | 'search') => {
    if (!item) return
    if (item.kind === 'recent') { setQuery(item.query); inputRef.current?.focus(); return }
    if (item.kind === 'search' || how === 'search') {
      actions.addRecentSearch(query)
      setQuery('')
      close(false)
      openSearch(query.trim(), { newTab: true, scope: 'all' })
      return
    }
    if (item.kind === 'remedy') {
      setQuery('')
      close(false)
      if (how === 'take') openRemedySearch(item.remedyId, { newTab: true })
      else actions.openTab({ kind: 'remedy', remedyId: item.remedyId })
      return
    }
    const ref = item.rep.ref(item.index)
    actions.addRecentSearch(query)
    if (how === 'take') { takeRefs([ref], DEFAULT_TAKE); return }
    setQuery('')
    close(false)
    void goToRef(ref).then(focusBook)
  }

  // Enter pressed while results were still catching up with the typing
  useEffect(() => {
    if (!pendingEnter.current || !settled) return
    const how = pendingEnter.current
    pendingEnter.current = null
    run(flat[0], how)
  })

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(flat.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive(a => Math.min(flat.length - 1, a + 8)) }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive(a => Math.max(0, a - 8)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (mod) run({ kind: 'search', query }, 'search')
      else if (!settled) pendingEnter.current = e.altKey ? 'take' : 'open' // run once results catch up
      else run(flat[active], e.altKey ? 'take' : 'open')
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      // one Esc closes the dropdown and hands focus back to where it was before Mod+F
      setQuery('')
      close(true)
    } else if (!open && e.key.length === 1) setOpen(true)
  }

  const activeItem = flat[active]
  const showPop = open && groups.length > 0
  const optId = (n: number) => `qf-opt-${n}`

  return (
    <div className="qf" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <Search size={14} className="qf-icon" aria-hidden />
      <input
        ref={inputRef}
        data-quickfind
        className="qf-input"
        type="text"
        placeholder="Find rubric or remedy…"
        aria-label="Quick find"
        role="combobox"
        aria-expanded={showPop}
        aria-controls="qf-list"
        aria-autocomplete="list"
        aria-activedescendant={showPop && activeItem ? optId(active) : undefined}
        spellCheck={false}
        autoComplete="off"
        value={query}
        onFocus={e => {
          const prev = e.relatedTarget as HTMLElement | null
          if (prev && !e.currentTarget.parentElement?.contains(prev)) restoreRef.current = prev
          setOpen(true)
        }}
        onMouseDown={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      {query ? (
        <button className="qf-clear" aria-label="Clear" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(''); inputRef.current?.focus() }}><X size={12} /></button>
      ) : <kbd className="kbd qf-kbd">{formatKeys('Mod+F')}</kbd>}
      {showPop && (
        <div className="qf-pop" ref={popRef} role="listbox" id="qf-list" aria-label="Quick find results" onMouseDown={e => e.preventDefault()}>
          {pending.length > 0 && q.length >= 2 && (
            <div className="qf-status"><Loader2 size={13} className="spin" /> Indexing {pending.map(a => catalog.repertoryInfos.find(r => r.abbrev === a)?.title ?? a).join(', ')}…</div>
          )}
          {error && <div className="qf-status err">{error}</div>}
          {q.length === 1 && <div className="qf-status">Type another letter to search rubrics</div>}
          {q.length >= 2 && settled && total === 0 && !pending.length && groups.every(g => g.key === 'more' || g.key === 'remedies') && (
            <div className="qf-status">No rubric matches “{q}”</div>
          )}
          {groups.map(g => (
            <div key={g.key} className="qf-group" role="group" aria-label={g.label || 'More'}>
              {g.label && <div className="qf-head"><span>{g.label}</span>{g.sub && <span className="qf-head-sub">{g.sub}</span>}</div>}
              {g.items.map(({ item, n }) => (
                <div
                  key={n}
                  id={optId(n)}
                  data-n={n}
                  role="option"
                  aria-selected={n === active}
                  className={`qf-opt qf-${item.kind}${n === active ? ' active' : ''}`}
                  onMouseMove={() => { if (n !== active) setActive(n) }}
                  onClick={e => run(item, e.altKey ? 'take' : 'open')}
                >
                  <OptionBody item={item} hl={hl} total={total} />
                </div>
              ))}
            </div>
          ))}
          <div className="qf-foot">
            <span><kbd className="kbd">↑↓</kbd> select</span>
            <span><kbd className="kbd">↵</kbd> open</span>
            <span><kbd className="kbd">{formatKeys('Alt+Enter')}</kbd> take</span>
            <span><kbd className="kbd">{formatKeys('Mod+Enter')}</kbd> search tab</span>
            <span><kbd className="kbd">Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  )
}

function OptionBody({ item, hl, total }: { item: Item; hl: ((n: string) => boolean) | null; total: number }) {
  const catalog = useCatalog()
  if (item.kind === 'recent') return <><History size={13} className="qf-ico" /><span className="qf-text">{item.query}</span></>
  if (item.kind === 'search') {
    return (
      <>
        <SearchCode size={13} className="qf-ico" />
        <span className="qf-text">Search “{item.query.trim()}” in all repertories{total > RUBRIC_LIMIT ? ` · ${total.toLocaleString()} rubrics` : ''}</span>
        <kbd className="kbd">{formatKeys('Mod+Enter')}</kbd>
      </>
    )
  }
  if (item.kind === 'remedy') {
    const r = catalog.remedy(item.remedyId)
    return (
      <>
        <Pill size={13} className="qf-ico" />
        <span className="qf-text"><b className="qf-abbrev"><Highlight text={r.abbrev} hit={hl} /></b> <Highlight text={r.name} hit={hl} /></span>
        <span className="qf-meta">remedy</span>
      </>
    )
  }
  const parts = item.rep.lineage(item.index).map(i => item.rep.text(i))
  const n = item.rep.remedyCount(item.index)
  return (
    <>
      <span className="qf-text qf-path" onMouseEnter={titleIfTruncated(() => parts.join(', '))}>{parts.length > 1 ? <RubricPath parts={parts} hit={hl} skip={item.full ? 0 : 1} /> : <Highlight text={parts[0]} hit={hl} />}</span>
      {n > 0 && <span className="qf-meta">{n}</span>}
    </>
  )
}

/** `rubrics`: the workspace Recent list (all repertories); `recent`: a tab's own list from before it. */
type RecentSource = { repertory: string | null; rubrics: readonly RubricRef[]; recent: RepertoryTab['recent']; back: RepertoryTab['back'] | undefined }

function recentRubrics(catalog: Catalog, tab: RecentSource): { rep: Repertory | undefined; items: number[] } {
  if (!tab.repertory) return { rep: undefined, items: [] }
  const rep = catalog.repertory(tab.repertory)
  if (!rep) return { rep, items: [] }
  const own = recentOf(tab.rubrics, tab.repertory, tab.recent)
  const src = own.length ? own : [...(tab.back ?? [])].reverse()
  const seen = new Set<number>()
  const items: number[] = []
  for (const i of src) {
    if (items.length >= 5) break
    if (i >= 0 && i < rep.size && !seen.has(i)) { seen.add(i); items.push(i) }
  }
  return { rep, items }
}
