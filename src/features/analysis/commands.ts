import type { Catalog } from '../../data/catalog'
import type { Command } from '../../commands/registry'
import { registerCommands } from '../../commands/registry'
import { STRATEGIES } from '../../engine/analysis'
import { registerDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { CompareDialog, RemedyFilterDialog } from './dialogs'
import * as ops from './ops'
import { printResult } from './print'

const hasTarget = () => ops.targetConsultationId() !== null
const inAnalysis = () => ops.activeAnalysisTab() !== null
const VIEW_SCOPE = '.an-view'

export function register(catalog: Catalog) {
  ops.setAnalysisCatalog(catalog)
  ops.setPrinter(printResult)
  registerDialog(ops.REMEDY_FILTER_DIALOG, RemedyFilterDialog as unknown as DialogComponent)
  registerDialog(ops.COMPARE_DIALOG, CompareDialog as unknown as DialogComponent)

  const cmds: Command[] = [
    { id: 'analysis.open', title: 'Analyse case', category: 'Analysis', keys: ['F8'], allowInInput: true, keywords: 'analysis repertorisation result grid', run: () => ops.openAnalysis() },
    ...STRATEGIES.map((s): Command => ({
      id: `analysis.strategy.${s.id}`, title: s.name, category: 'Analysis', keywords: `strategy method ${s.short} ${s.description}`,
      enabled: hasTarget, checked: () => ops.targetOptions()?.strategy === s.id, run: () => ops.setStrategy(s.id),
    })),
    { id: 'analysis.intensity', title: 'Use symptom intensity', category: 'Analysis', keywords: 'weight', enabled: hasTarget, checked: () => ops.targetOptions()?.useIntensity !== false, run: ops.toggleIntensity },
    { id: 'analysis.showExcluded', title: 'Show excluded remedies in position', category: 'Analysis', keywords: 'greyed eliminated', enabled: hasTarget, checked: () => !!ops.targetOptions()?.showExcluded, run: ops.toggleShowExcluded },
    // Alias kept for the brief and the toolbar: the family filter when that feature is present
    // (listed as families.filter), else the remedy picker below. Hidden so the palette has one entry.
    { id: 'analysis.filter', title: 'Filter analysis…', category: 'Analysis', hidden: true, enabled: hasTarget, run: ops.openFilter },
    { id: 'analysis.remedies', title: 'Include / exclude remedies…', category: 'Analysis', keywords: 'filter limit exclude highlight minimum coverage symptoms already given', enabled: hasTarget, run: ops.openRemedyFilter },
    { id: 'analysis.clearFilter', title: 'Remove all remedy filters', category: 'Analysis', keywords: 'family limit highlight exclude minimum coverage clear reset', enabled: () => ops.hasFilter(), run: ops.clearFilter },
    { id: 'analysis.compare', title: 'Compare remedies…', category: 'Analysis', keywords: 'extract side by side', enabled: hasTarget, run: () => ops.openCompare() },
    { id: 'analysis.print', title: 'Print analysis…', category: 'Analysis', keys: ['Mod+P'], allowInInput: true, enabled: inAnalysis, run: ops.printAnalysis },
    { id: 'analysis.exportCsv', title: 'Export analysis as CSV', category: 'Analysis', keywords: 'spreadsheet excel download', enabled: hasTarget, run: ops.exportCsv },
    { id: 'analysis.exportPng', title: 'Export analysis grid as PNG', category: 'Analysis', keywords: 'image picture download', enabled: hasTarget, run: ops.exportPng },
    { id: 'analysis.view.grid', title: 'Analysis: grid', category: 'Analysis', keys: ['G'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => (ops.activeAnalysisTab()?.view ?? 'grid') === 'grid', run: () => ops.setView('grid') },
    { id: 'analysis.view.bars', title: 'Analysis: bars', category: 'Analysis', keys: ['B'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => ops.activeAnalysisTab()?.view === 'bars', run: () => ops.setView('bars') },
    { id: 'analysis.view.cards', title: 'Analysis: remedy cards', category: 'Analysis', keys: ['C'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => ops.activeAnalysisTab()?.view === 'cards', run: () => ops.setView('cards') },
    {
      id: 'analysis.findRemedy', title: 'Jump to remedy in analysis', category: 'Analysis', keys: ['/'], scope: VIEW_SCOPE, enabled: inAnalysis,
      run: () => document.querySelector<HTMLInputElement>('[data-analysis-remedy-box]')?.focus(),
    },
  ]
  registerCommands(cmds)
}
