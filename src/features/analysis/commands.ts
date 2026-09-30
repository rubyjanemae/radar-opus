import type { Catalog } from '../../data/catalog'
import type { Command } from '../../commands/registry'
import { registerCommands } from '../../commands/registry'
import { STRATEGIES } from '../../engine/analysis'
import { registerLazyDialog } from '../../shell/dialogs'
import * as ops from './ops'

const hasTarget = () => ops.targetConsultationId() !== null
const inAnalysis = () => ops.activeAnalysisTab() !== null
const VIEW_SCOPE = '.an-view'

export function register(catalog: Catalog) {
  ops.setAnalysisCatalog(catalog)
  registerLazyDialog(ops.REMEDY_FILTER_DIALOG, () => import('./dialogs'), m => m.RemedyFilterDialog)
  registerLazyDialog(ops.COMPARE_DIALOG, () => import('./dialogs'), m => m.CompareDialog)

  const cmds: Command[] = [
    { id: 'analysis.open', title: 'Analyse case', category: 'Analysis', keys: ['F8'], allowInInput: true, keywords: 'analysis repertorisation result grid', run: () => ops.openAnalysis() },
    ...STRATEGIES.map((s): Command => ({
      id: `analysis.strategy.${s.id}`, title: s.name, category: 'Analysis', keywords: `strategy method ${s.short} ${s.description}`,
      enabled: hasTarget, checked: () => ops.targetOptions()?.strategy === s.id, run: () => ops.setStrategy(s.id),
    })),
    { id: 'analysis.intensity', title: 'Use symptom intensity', category: 'Analysis', keywords: 'weight', enabled: hasTarget, checked: () => ops.targetOptions()?.useIntensity !== false, run: () => ops.toggleIntensity() },
    { id: 'analysis.showExcluded', title: 'Show excluded remedies in position', category: 'Analysis', keywords: 'greyed eliminated', enabled: hasTarget, checked: () => !!ops.targetOptions()?.showExcluded, run: () => ops.toggleShowExcluded() },
    { id: 'analysis.params', title: 'Strategy parameters…', category: 'Analysis', keywords: 'advanced settings threshold factor kent weights polarity prominence reset defaults', enabled: inAnalysis, run: () => ops.toggleParams() },
    { id: 'analysis.remedies', title: 'Include / exclude remedies…', category: 'Analysis', keywords: 'filter limit exclude highlight minimum coverage symptoms already given', enabled: hasTarget, run: () => ops.openRemedyFilter() },
    { id: 'analysis.clearFilter', title: 'Remove all remedy filters', category: 'Analysis', keywords: 'family limit highlight exclude minimum coverage clear reset', enabled: () => ops.hasFilter(), run: () => ops.clearFilter() },
    { id: 'analysis.compare', title: 'Compare remedies…', category: 'Analysis', keywords: 'extract side by side', enabled: hasTarget, run: () => ops.openCompare() },
    { id: 'analysis.print', title: 'Print analysis…', category: 'Analysis', keys: ['Mod+P'], allowInInput: true, enabled: inAnalysis, run: () => ops.printAnalysis() },
    { id: 'analysis.exportCsv', title: 'Export analysis as CSV', category: 'Analysis', keywords: 'spreadsheet excel download', enabled: hasTarget, run: () => ops.exportCsv() },
    { id: 'analysis.exportPng', title: 'Export analysis grid as PNG', category: 'Analysis', keywords: 'image picture download', enabled: hasTarget, run: () => ops.exportPng() },
    { id: 'analysis.view.grid', title: 'Analysis: grid', category: 'Analysis', keys: ['G'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => (ops.activeAnalysisTab()?.view ?? 'grid') === 'grid', run: () => ops.setView('grid') },
    { id: 'analysis.view.bars', title: 'Analysis: bars', category: 'Analysis', keys: ['B'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => ops.activeAnalysisTab()?.view === 'bars', run: () => ops.setView('bars') },
    { id: 'analysis.view.cards', title: 'Analysis: remedy cards', category: 'Analysis', keys: ['C'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => ops.activeAnalysisTab()?.view === 'cards', run: () => ops.setView('cards') },
    {
      id: 'analysis.findRemedy', title: 'Jump to remedy in analysis', category: 'Analysis', keys: ['/'], scope: VIEW_SCOPE, enabled: inAnalysis,
      run: () => document.querySelector<HTMLInputElement>('[data-analysis-remedy-box]')?.focus(),
    },
  ]
  registerCommands(cmds)
  prefetchAnalysisView()
}

/**
 * The analysis tab's code (view, grid, engine glue) loads when the browser is idle after start-up, so the
 * first F8 does not wait for it: F8 then only pays for computing and drawing the result.
 */
function prefetchAnalysisView() {
  if (typeof window === 'undefined') return
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
  // a failed prefetch is harmless: the tab imports the chunk itself (with retry) when it opens
  idle(() => { void import('./AnalysisView').catch(() => {}) }, { timeout: 5000 })
}
