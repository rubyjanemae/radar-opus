import { create } from 'zustand'
import type { Catalog } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { RubricRef } from '../../data/types'
import { actions, selectActiveTab, useApp } from '../../state/store'
import type { SearchTab } from '../../state/workspace'
import { hasIndex, remedyRubrics, search, warmIndex } from './engine'
import type { SearchHit, Target } from './engine'
import { resolveRemedy } from './remedies'

/** Search operations shared by QuickFind, the search view, the palette and commands. */

let catalogRef: Catalog | null = null
export function setSearchCatalog(c: Catalog) { catalogRef = c }
export function searchCatalog(): Catalog {
  if (!catalogRef) throw new Error('Search feature not registered')
  return catalogRef
}

const st = () => useApp.getState()

export const remedyResolver = (token: string) => (catalogRef ? resolveRemedy(catalogRef, token) : null)

// ───────────── targets ─────────────

/** Repertory the user is looking at (active repertory tab, else the most recent one, else the default). */
export function currentRepertory(): string {
  const s = st()
  const t = selectActiveTab(s)
  if (t?.kind === 'repertory') return t.repertory
  if (t?.kind === 'search' && t.repertories[0]) return t.repertories[0]
  const any = s.tabs.find(x => x.kind === 'repertory')
  return any?.kind === 'repertory' ? any.repertory : s.settings.defaultRepertory
}

/** The rubric the user is looking at, if any (for chapter scope). */
export function currentRubric(): { repertory: string; index: number } | null {
  const t = selectActiveTab(st())
  return t?.kind === 'repertory' ? { repertory: t.repertory, index: t.rubric } : null
}

/** Repertories a search tab covers, current first. */
export function tabRepertories(tab: Pick<SearchTab, 'scope' | 'repertories'>): string[] {
  const all = catalogRef?.repertoryInfos.map(r => r.abbrev) ?? []
  if (tab.scope === 'all') {
    const first = tab.repertories[0]
    return first && all.includes(first) ? [first, ...all.filter(a => a !== first)] : all
  }
  return tab.repertories.slice(0, 1).filter(a => all.includes(a))
}

/** Load and index repertories. Resolves when all are ready. */
export async function prepare(abbrevs: string[]): Promise<Repertory[]> {
  const cat = searchCatalog()
  const reps = await Promise.all(abbrevs.map(a => cat.loadRepertory(a)))
  await Promise.all(reps.map(r => warmIndex(r, true)))
  return reps
}

/** Targets that are ready now (loaded and indexed), and whether any are still pending. */
export function readyTargets(tab: Pick<SearchTab, 'scope' | 'repertories' | 'chapter'>): { targets: Target[]; pending: string[] } {
  const cat = searchCatalog()
  const targets: Target[] = []
  const pending: string[] = []
  for (const a of tabRepertories(tab)) {
    const rep = cat.repertory(a)
    if (!rep || !hasIndex(rep)) { pending.push(a); continue }
    if (tab.scope === 'chapter' && tab.chapter != null && tab.chapter >= 0 && tab.chapter < rep.size) {
      const root = rep.chapterRoot(tab.chapter)
      targets.push({ rep, start: root, end: rep.subtreeEndOf(root) })
    } else targets.push({ rep })
  }
  return { targets, pending }
}

/** All rubrics a search tab currently yields (used for cross-search comparison and export). */
export function tabRubrics(tab: SearchTab): { rep: Repertory; index: number }[] {
  const { targets } = readyTargets(tab)
  if (tab.mode === 'remedy') {
    if (tab.remedyId == null) return []
    return targets.flatMap(t => remedyRubrics(t.rep, tab.remedyId!, { minGrade: tab.minGrade, maxSize: tab.maxSize, maxCo: tab.maxCo, start: t.start, end: t.end }).map(h => ({ rep: t.rep, index: h.index })))
  }
  if (!tab.query.trim()) return []
  return search(tab.query, targets, { collapse: tab.collapse, resolveRemedy: remedyResolver }).hits
}

// ───────────── opening searches ─────────────

export function newSearchTab(patch: Partial<SearchTab> = {}): Omit<SearchTab, 'id'> {
  return { kind: 'search', query: '', repertories: [currentRepertory()], mode: 'text', scope: 'repertory', collapse: false, minGrade: 1, maxSize: 0, maxCo: -1, remedyId: null, ...patch }
}

export function activeSearchTab(): SearchTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'search' ? t : null
}

/** Focus the query field of the active search view (after it renders). */
export function focusSearchInput(select = true) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>('.srch [data-search-input]')
    el?.focus()
    if (select) el?.select()
  }))
}

/** F4: focus the active text search, or open a new one (optionally with a query). */
export function openSearch(query?: string, opts: { newTab?: boolean; scope?: SearchTab['scope'] } = {}) {
  const t = activeSearchTab()
  if (t && t.mode !== 'remedy' && !opts.newTab) {
    if (query != null) actions.updateTab<SearchTab>(t.id, { query })
    if (opts.scope) actions.updateTab<SearchTab>(t.id, { scope: opts.scope })
    focusSearchInput(query == null)
    return
  }
  actions.openTab(newSearchTab({ query: query ?? '', scope: opts.scope ?? 'repertory' }), { reuse: false })
  focusSearchInput(false)
}

/** F5: remedy search, optionally for a given remedy. */
export function openRemedySearch(remedyId: number | null = null, opts: { newTab?: boolean } = {}) {
  const t = activeSearchTab()
  if (t && t.mode === 'remedy' && !opts.newTab) {
    if (remedyId != null) actions.updateTab<SearchTab>(t.id, { remedyId })
    focusSearchInput()
    return
  }
  actions.openTab(newSearchTab({ mode: 'remedy', remedyId, scope: 'all' }), { reuse: false })
  focusSearchInput()
}

export function focusQuickFind() {
  const el = document.querySelector<HTMLInputElement>('[data-quickfind]')
  if (!el) return
  el.focus()
  el.select()
}

// ───────────── selection per search tab (transient) ─────────────

interface SelState {
  /** tab id → selected rubric refs */
  selected: Record<string, RubricRef[]>
  /** tab id → rubric ref with keyboard focus */
  focus: Record<string, RubricRef | null>
}

export const useSearchSel = create<SelState>(() => ({ selected: {}, focus: {} }))

export const selection = {
  get(tabId: string): RubricRef[] { return useSearchSel.getState().selected[tabId] ?? [] },
  set(tabId: string, refs: RubricRef[]) { useSearchSel.setState(s => ({ selected: { ...s.selected, [tabId]: refs } })) },
  toggle(tabId: string, ref: RubricRef) {
    const cur = selection.get(tabId)
    selection.set(tabId, cur.includes(ref) ? cur.filter(r => r !== ref) : [...cur, ref])
  },
  focus(tabId: string, ref: RubricRef | null) { useSearchSel.setState(s => ({ focus: { ...s.focus, [tabId]: ref } })) },
  focused(tabId: string): RubricRef | null { return useSearchSel.getState().focus[tabId] ?? null },
}

/** Rubrics the rubric.* commands act on in a search tab: the ticked ones, else the focused one. */
export function searchRubricRefs(): RubricRef[] | null {
  const t = activeSearchTab()
  if (!t) return null
  const sel = selection.get(t.id)
  if (sel.length) return sel
  const f = selection.focused(t.id)
  return f ? [f] : null
}

export function hitRef(h: Pick<SearchHit, 'rep' | 'index'>): RubricRef { return h.rep.ref(h.index) }

/** CSV of rubrics (path, repertory, remedies with grades) for spreadsheet export. */
export function rubricsCsv(items: { rep: Repertory; index: number }[]): string {
  const cat = searchCatalog()
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const lines = ['Repertory,Rubric,Remedy count,Remedies']
  for (const { rep, index } of items) {
    const rem = rep.remedies(index).map(e => `${cat.remedy(e.remedyId).abbrev}${e.grade > 1 ? ` (${e.grade})` : ''}`).join('; ')
    lines.push([rep.info.title, rep.path(index), String(rep.remedyCount(index)), rem].map(esc).join(','))
  }
  return lines.join('\n') + '\n'
}
