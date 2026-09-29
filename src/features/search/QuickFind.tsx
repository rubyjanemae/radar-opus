import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { History, Loader2, Pill, Search, SearchCode, X } from 'lucide-react'
import { formatKeys, isMac } from '../../commands/registry'
import { useCatalog } from '../../data/CatalogContext'
import type { Repertory } from '../../data/repertory'
import { actions, useApp } from '../../state/store'
import { goToRef, takeRefs } from '../repertory/ops'
import { DEFAULT_TAKE } from '../repertory/take'
import { highlighter, search } from './engine'
import { findRemedies } from './remedies'
import { currentRepertory, openRemedySearch, openSearch, prepare, readyTargets, remedyResolver } from './ops'
import { Highlight, RubricPath } from './components'
import './search.css'

type Item =
  | { kind: 'rubric'; rep: Repertory; index: number }
  | { kind: 'remedy'; remedyId: number }
  | { kind: 'recent'; query: string }
  | { kind: 'search'; query: string }

type Group = { key: string; label: string; sub?: string; items: { item: Item; n: number }[] }

const RUBRIC_LIMIT = 30

/** Toolbar type-ahead: rubrics across repertories grouped by chapter, and remedies. */
export function QuickFind() {
  const catalog = useCatalog()
  const recent = useApp(s => s.recentSearches)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const deferred = useDeferredValue(query)
  const all = catalog.repertoryInfos.map(r => r.abbrev)
  const first = open ? currentRepertory() : all[0]
  const tabLike = useMemo(() => ({ scope: 'all' as const, repertories: [first] }), [first])

  // load + index every repertory the first time the box is used
  useEffect(() => {
    if (!open) return
    let alive = true
    const { pending } = readyTargets(tabLike)
    if (!pending.length) return
    prepare(pending).then(() => alive && setVersion(v => v + 1), e => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [open, tabLike])

  const q = deferred.trim()
  const { groups, flat, total, pending } = useMemo(() => {
    const groups: Group[] = []
    const flat: Item[] = []
    let total = 0
    const push = (g: Group, item: Item) => { g.items.push({ item, n: flat.length }); flat.push(item) }
    const { targets, pending } = readyTargets(tabLike)
    if (!q) {
      if (recent.length) {
        const g: Group = { key: 'recent', label: 'Recent searches', items: [] }
        recent.slice(0, 8).forEach(r => push(g, { kind: 'recent', query: r }))
        groups.push(g)
      }
      return { groups, flat, total, pending }
    }
    if (q.length >= 2 && targets.length) {
      const res = search(deferred, targets, { prefixLast: true, limit: RUBRIC_LIMIT, resolveRemedy: remedyResolver })
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
      for (const g of groups) for (const it of g.items) { it.n = flat.length; flat.push(it.item) }
    }
    const rem = findRemedies(catalog, q.replace(/^#/, ''), 5).filter(m => m.score >= 55)
    if (rem.length) {
      const g: Group = { key: 'remedies', label: 'Remedies', items: [] }
      rem.forEach(m => push(g, { kind: 'remedy', remedyId: m.remedy.id }))
      groups.push(g)
    }
    const g: Group = { key: 'more', label: '', items: [] }
    push(g, { kind: 'search', query: deferred })
    groups.push(g)
    return { groups, flat, total, pending }
  }, [deferred, q, tabLike, recent, catalog, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const hl = useMemo(() => {
    const res = q ? search(deferred, [], { prefixLast: true }) : null
    return res?.parsed.positive.length ? highlighter(res.parsed) : null
  }, [deferred, q])

  useEffect(() => { setActive(0) }, [deferred])
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
      close(false)
      openSearch(query.trim(), { newTab: true, scope: 'all' })
      return
    }
    if (item.kind === 'remedy') {
      close(false)
      if (how === 'take') openRemedySearch(item.remedyId, { newTab: true })
      else actions.openTab({ kind: 'remedy', remedyId: item.remedyId })
      return
    }
    const ref = item.rep.ref(item.index)
    actions.addRecentSearch(query)
    if (how === 'take') { takeRefs([ref], DEFAULT_TAKE); return }
    close(false)
    void goToRef(ref).then(focusBook)
  }

  // Enter pressed while results were still catching up with the typing
  useEffect(() => {
    if (!pendingEnter.current || deferred !== query) return
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
      else if (deferred !== query) pendingEnter.current = e.altKey ? 'take' : 'open' // run once results catch up
      else run(flat[active], e.altKey ? 'take' : 'open')
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation()
      if (open && query) { setOpen(false) } else { setQuery(''); close(true) }
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
          {q.length >= 2 && total === 0 && !pending.length && groups.every(g => g.key === 'more' || g.key === 'remedies') && (
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
      <span className="qf-text qf-path">{parts.length > 1 ? <RubricPath parts={parts} hit={hl} skip={1} /> : <Highlight text={parts[0]} hit={hl} />}</span>
      {n > 0 && <span className="qf-meta">{n}</span>}
    </>
  )
}
