import type { Catalog } from '../../data/catalog'
import type { Command } from '../../commands/registry'
import { execute, getCommand, isEnabled, registerCommands } from '../../commands/registry'
import { STRATEGIES } from '../../engine/analysis'
import { registerLazyDialog } from '../../shell/dialogs'
import * as ops from './ops'
import { hasParams } from './strategyParams'
import { useApp } from '../../state/store'
import { copyCursor, copyItem } from './copyItem'

const hasTarget = () => ops.targetConsultationId() !== null
const inAnalysis = () => ops.activeAnalysisTab() !== null
const VIEW_SCOPE = '.an-view'
const noTextSelection = () => { const sel = window.getSelection(); return !sel || sel.isCollapsed || !sel.toString().trim() }
/** Edit › Copy / Copy symptom text only: the repertory's command in a book, the analysis item's in the analysis window. */
const firstEnabled = (ids: string[]) => ids.map(getCommand).find(c => !!c && isEnabled(c))

export function register(catalog: Catalog) {
  ops.setAnalysisCatalog(catalog)
  registerLazyDialog(ops.REMEDY_FILTER_DIALOG, () => import('./dialogs'), m => m.RemedyFilterDialog)
  registerLazyDialog(ops.COMPARE_DIALOG, () => import('./dialogs'), m => m.CompareDialog)

  const cmds: Command[] = [
    { id: 'analysis.open', title: 'Analyse case', category: 'Analysis', keys: ['F8'], allowInInput: true, keywords: 'analysis repertorisation result grid', run: () => ops.openAnalysis() },
    // F7 with the clipboard pane hidden (view.clipboardsOnly): the analysis window without its remedy columns
    { id: 'analysis.symptomsOnly', title: 'Show analysis with symptoms only', category: 'Analysis', keywords: 'symptoms list clipboard', run: () => ops.openAnalysis(undefined, true) },
    ...STRATEGIES.map((s): Command => ({
      id: `analysis.strategy.${s.id}`, title: s.name, category: 'Analysis', keywords: `strategy method ${s.short} ${s.description}`,
      enabled: hasTarget, checked: () => ops.targetOptions()?.strategy === s.id, run: () => ops.setStrategy(s.id),
    })),
    ...STRATEGIES.map((s): Command => ({
      id: `analysis.default.${s.id}`, title: `Default analysis method: ${s.name}`, category: 'Analysis', keywords: `default strategy method ${s.short}`,
      checked: () => useApp.getState().settings.defaultStrategy === s.id, run: () => ops.setDefaultStrategy(s.id),
    })),
    { id: 'analysis.intensity', title: 'Use symptom intensity', category: 'Analysis', keywords: 'weight', enabled: hasTarget, checked: () => ops.targetOptions()?.useIntensity !== false, run: () => ops.toggleIntensity() },
    { id: 'analysis.showExcluded', title: 'Show excluded remedies in position', category: 'Analysis', keywords: 'greyed eliminated', enabled: hasTarget, checked: () => !!ops.targetOptions()?.showExcluded, run: () => ops.toggleShowExcluded() },
    { id: 'analysis.params', title: 'Strategy parameters…', category: 'Analysis', keywords: 'advanced settings threshold factor kent weights polarity prominence reset defaults', enabled: () => inAnalysis() && hasParams(ops.targetOptions()?.strategy), run: () => ops.toggleParams() },
    { id: 'analysis.remedies', title: 'Include / exclude remedies…', category: 'Analysis', keywords: 'filter limit exclude highlight minimum coverage symptoms already given', enabled: hasTarget, run: () => ops.openRemedyFilter() },
    { id: 'analysis.clearFilter', title: 'Remove all remedy filters', category: 'Analysis', keywords: 'family limit highlight exclude minimum coverage clear reset', enabled: () => ops.hasFilter(), run: () => ops.clearFilter() },
    { id: 'analysis.compare', title: 'Compare remedies…', category: 'Analysis', keywords: 'extract side by side', enabled: hasTarget, run: () => ops.openCompare() },
    { id: 'analysis.print', title: 'Print analysis…', category: 'Analysis', keys: ['Mod+P'], allowInInput: true, enabled: inAnalysis, run: () => ops.printAnalysis() },
    {
      id: 'analysis.copyItem', title: 'Copy analysis item', category: 'Analysis', keys: ['Mod+C'], scope: VIEW_SCOPE, keywords: 'symptom remedy clipboard text',
      enabled: () => inAnalysis() && noTextSelection(), run: async () => { if (!(await copyItem(false))) await ops.copyAnalysis() },
    },
    {
      id: 'analysis.copyItemText', title: 'Copy symptom text of the analysis item', category: 'Analysis', keys: ['Mod+Shift+Y'], scope: VIEW_SCOPE, keywords: 'rubric',
      enabled: () => inAnalysis() && noTextSelection() && copyCursor()?.text != null, run: () => void copyItem(true),
    },
    // the Edit menu's entries: whichever of the two applies where the user is
    { id: 'edit.copy', title: 'Copy', category: 'Edit', enabled: () => !!firstEnabled(['analysis.copyItem', 'rubric.copy']), run: () => { const c = firstEnabled(['analysis.copyItem', 'rubric.copy']); if (c) void execute(c) } },
    { id: 'edit.copyText', title: 'Copy symptom text only', category: 'Edit', enabled: () => !!firstEnabled(['analysis.copyItemText', 'rubric.copyText']), run: () => { const c = firstEnabled(['analysis.copyItemText', 'rubric.copyText']); if (c) void execute(c) } },
    { id: 'analysis.copy', title: 'Copy analysis', category: 'Analysis', keywords: 'clipboard table spreadsheet paste text', enabled: hasTarget, run: () => ops.copyAnalysis() },
    { id: 'analysis.exportCsv', title: 'Export analysis as CSV', category: 'Analysis', keywords: 'spreadsheet excel download', enabled: hasTarget, run: () => ops.exportCsv() },
    { id: 'analysis.exportPng', title: 'Export analysis grid as PNG', category: 'Analysis', keywords: 'image picture download', enabled: hasTarget, run: () => ops.exportPng() },
    { id: 'analysis.view.grid', title: 'Analysis: grid', category: 'Analysis', keys: ['G'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => { const t = ops.activeAnalysisTab(); return !!t && !t.symptomsOnly && (t.view ?? 'grid') === 'grid' }, run: () => ops.setView('grid') },
    { id: 'analysis.view.bars', title: 'Analysis: bars', category: 'Analysis', keys: ['B'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => { const t = ops.activeAnalysisTab(); return !!t && !t.symptomsOnly && t.view === 'bars' }, run: () => ops.setView('bars') },
    { id: 'analysis.view.cards', title: 'Analysis: remedy cards', category: 'Analysis', keys: ['C'], scope: VIEW_SCOPE, enabled: inAnalysis, checked: () => { const t = ops.activeAnalysisTab(); return !!t && !t.symptomsOnly && t.view === 'cards' }, run: () => ops.setView('cards') },
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
