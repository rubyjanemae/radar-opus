import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { selectActiveTab, useApp } from '../../state/store'
import { registerDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { registerRemedyFamilyProvider } from '../mm/ops'
import { familiesIfLoaded, loadFamilies } from './api'
import { FamilyFilterDialog } from './FamilyFilterDialog'
import { systemLabel } from './model'
import { activeFamiliesTab, applyFamilyFilter, clearFamilyFilter, FILTER_DIALOG, hasTargetCase, openFamilies, openFilterDialog, openRemedy, targetConsultationId } from './ops'
import { viewBus, viewSelection } from './viewState'

function inView() { return !!activeFamiliesTab() && viewSelection().tabId === activeFamiliesTab()?.id }
function selectedGroup() { return inView() ? viewSelection().group : null }

function activeRemedyId(): number | null {
  const t = selectActiveTab(useApp.getState())
  if (t?.kind === 'remedy') return t.remedyId
  if (t?.kind === 'materia-medica') return t.remedyId
  return null
}

function hasFamilyFilter() {
  const id = targetConsultationId()
  const a = id ? useApp.getState().consultations[id]?.analysis : null
  return !!a && (!!a.remedyFilter || !!a.highlight?.length)
}

export function register(_catalog: Catalog) {
  registerDialog(FILTER_DIALOG, FamilyFilterDialog as unknown as DialogComponent)

  // Offer families to the remedy window once the data is in (idle, so startup stays fast).
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1200))
  idle(() => {
    void loadFamilies().then(idx => {
      registerRemedyFamilyProvider(rid => idx.groupsOfRemedy(rid).map(n => ({
        system: systemLabel(n, idx), label: n.name, members: n.remedies, open: () => openFamilies(n.id),
      })))
    }).catch(() => { /* the families view shows the error and a retry */ })
  })

  registerCommands([
    {
      id: 'families.open', title: 'Families & kingdoms', category: 'Tools', keys: ['Mod+5'], allowInInput: true,
      keywords: 'family kingdom plant mineral animal nosode botanical element periodic classification toc',
      run: () => openFamilies(),
    },
    {
      id: 'families.filter', title: 'Family filter…', category: 'Analysis', keywords: 'limit highlight family kingdom remedies analysis',
      enabled: hasTargetCase, run: () => openFilterDialog(selectedGroup() ? { groups: [selectedGroup()!] } : {}),
    },
    {
      id: 'families.limitSelected', title: 'Limit analysis to selected family', category: 'Analysis', keywords: 'family filter restrict',
      enabled: () => !!selectedGroup() && hasTargetCase(), run: () => { const g = selectedGroup(); if (g) applyFamilyFilter([g], 'limit') },
    },
    {
      id: 'families.highlightSelected', title: 'Highlight selected family in analysis', category: 'Analysis', keywords: 'family mark',
      enabled: () => !!selectedGroup() && hasTargetCase(), run: () => { const g = selectedGroup(); if (g) applyFamilyFilter([g], 'highlight') },
    },
    {
      id: 'families.clear', title: 'Remove family limit and highlight', category: 'Analysis', keywords: 'family filter clear reset',
      enabled: hasFamilyFilter, run: () => clearFamilyFilter('both'),
    },
    {
      id: 'families.ofRemedy', title: 'Show families of this remedy', category: 'Tools', keywords: 'kingdom classification botanical family',
      enabled: () => activeRemedyId() != null,
      run: async () => {
        const rid = activeRemedyId()
        if (rid == null) return
        const idx = familiesIfLoaded() ?? await loadFamilies().catch(() => null)
        const g = idx?.primaryGroupOf(rid) ?? idx?.allGroupsOf(rid)[0]
        openFamilies(g ? g.id : null)
      },
    },
    {
      id: 'families.find', title: 'Find family or remedy', category: 'Tools', keys: ['Mod+F', 'F2'], allowInInput: true, scope: '.fam-view',
      keywords: 'search families', enabled: inView, run: () => viewBus.emit('focusSearch'),
    },
    { id: 'families.expandAll', title: 'Expand all families', category: 'Tools', enabled: inView, run: () => viewBus.emit('expandAll') },
    { id: 'families.collapseAll', title: 'Collapse all families', category: 'Tools', enabled: inView, run: () => viewBus.emit('collapseAll') },
    {
      id: 'families.openRemedy', title: 'Open selected remedy', category: 'Tools', enabled: () => inView() && viewSelection().remedy != null,
      run: () => { const r = viewSelection().remedy; if (r != null) openRemedy(r) },
    },
  ])
}
