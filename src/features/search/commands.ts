import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import type { SearchTab } from '../../state/workspace'
import { downloadBlob } from '../../ui/files'
import { registerRubricSource } from '../repertory/ops'
import { warmIndex } from './engine'
import {
  activeSearchTab, currentRepertory, currentRubric, focusQuickFind, openRemedySearch, openSearch, rubricsCsv, searchRubricRefs,
  selection, setSearchCatalog, tabRubrics,
} from './ops'

const isText = () => { const t = activeSearchTab(); return !!t && t.mode !== 'remedy' }
const setScope = (scope: SearchTab['scope']) => {
  const t = activeSearchTab()
  if (!t) return
  const cur = currentRubric()
  const patch: Partial<SearchTab> = { scope }
  if (scope === 'chapter' && t.chapter == null) patch.chapter = cur && cur.repertory === t.repertories[0] ? cur.index : 0
  actions.updateTab<SearchTab>(t.id, patch)
}

export function register(catalog: Catalog) {
  setSearchCatalog(catalog)
  registerRubricSource('search', searchRubricRefs)

  // build the word index of the default repertory while the app is idle
  const warm = () => { void catalog.loadRepertory(currentRepertory()).then(r => warmIndex(r)).catch(() => {}) }
  if (typeof window !== 'undefined') setTimeout(warm, 1200)

  registerCommands([
    { id: 'search.focus', title: 'Quick find', category: 'Search', keys: ['Mod+F'], allowInInput: true, keywords: 'find toolbar type ahead', run: focusQuickFind },
    { id: 'search.open', title: 'Search rubrics…', category: 'Search', keys: ['F4', 'Shift+?', '?'], keywords: 'simple search words find text', run: () => openSearch() },
    { id: 'search.new', title: 'New search tab', category: 'Search', keys: ['Mod+Shift+F'], allowInInput: true, keywords: 'search window compare', run: () => openSearch('', { newTab: true }) },
    { id: 'search.all', title: 'Search all repertories…', category: 'Search', keywords: 'library everything', run: () => openSearch(undefined, { newTab: !isText(), scope: 'all' }) },
    { id: 'search.remedy', title: 'Remedy search…', category: 'Search', keys: ['F5'], allowInInput: true, keywords: 'advanced rubrics of remedy degree grade co-remedies', run: () => openRemedySearch() },

    // active search tab
    { id: 'search.scope.repertory', title: 'Search in current repertory', category: 'Search', enabled: () => !!activeSearchTab(), checked: () => activeSearchTab()?.scope === 'repertory', run: () => setScope('repertory') },
    { id: 'search.scope.all', title: 'Search in all repertories', category: 'Search', enabled: () => !!activeSearchTab(), checked: () => activeSearchTab()?.scope === 'all', run: () => setScope('all') },
    { id: 'search.scope.chapter', title: 'Search in current chapter', category: 'Search', enabled: () => !!activeSearchTab(), checked: () => activeSearchTab()?.scope === 'chapter', run: () => setScope('chapter') },
    {
      id: 'search.collapse', title: 'Hide sub-rubrics of matches', category: 'Search', enabled: isText, checked: () => !!activeSearchTab()?.collapse,
      run: () => { const t = activeSearchTab(); if (t) actions.updateTab<SearchTab>(t.id, { collapse: !t.collapse }) },
    },
    {
      id: 'search.selectAll', title: 'Select all results', category: 'Search', keys: ['Mod+A'], scope: '.srch-results', enabled: () => !!activeSearchTab(),
      run: () => { const t = activeSearchTab(); if (t) selection.set(t.id, tabRubrics(t).map(h => h.rep.ref(h.index))) },
    },
    {
      id: 'search.clearSelection', title: 'Clear result selection', category: 'Search', keys: ['Escape'], scope: '.srch-results',
      enabled: () => { const t = activeSearchTab(); return !!t && selection.get(t.id).length > 0 },
      run: () => { const t = activeSearchTab(); if (t) selection.set(t.id, []) },
    },
    {
      id: 'search.export', title: 'Export results as CSV', category: 'Search', keywords: 'excel spreadsheet download',
      enabled: () => { const t = activeSearchTab(); return !!t && (t.mode === 'remedy' ? t.remedyId != null : !!t.query.trim()) },
      run: () => {
        const t = activeSearchTab()
        if (!t) return
        const items = tabRubrics(t)
        const name = t.mode === 'remedy' ? `remedy-${t.remedyId}` : t.query.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)
        downloadBlob(new Blob([rubricsCsv(items)], { type: 'text/csv' }), `search-${name || 'results'}.csv`)
        actions.toast(`Exported ${items.length} rubrics`, 'success')
      },
    },
    {
      id: 'search.clearRecent', title: 'Clear recent searches', category: 'Search', enabled: () => useApp.getState().recentSearches.length > 0,
      run: () => { const prev = useApp.getState().recentSearches; useApp.setState({ recentSearches: [] }); actions.toast('Recent searches cleared', 'info', { label: 'Undo', run: () => useApp.setState({ recentSearches: prev }) }) },
    },
  ])
}
