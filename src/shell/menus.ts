import type { MenuItem } from '../ui/Menu'
import type { Catalog } from '../data/catalog'
import { STRATEGIES } from '../engine/analysis'

const sep: MenuItem = { type: 'separator' }

/**
 * Menubar layout. Items reference command ids from the registry; a command that is
 * not registered renders disabled, and tests assert that none are missing.
 */
export function buildMenus(catalog: Catalog): { label: string; items: MenuItem[] }[] {
  return [
    {
      label: 'File',
      items: [
        { command: 'patient.new' },
        { command: 'consultation.new' },
        { command: 'patients.open' },
        sep,
        { command: 'file.importCase' },
        { command: 'file.exportCase' },
        { command: 'file.importWorkspace' },
        { command: 'file.exportWorkspace' },
        sep,
        // one Ctrl+P entry: it prints what the active document is (analysis or monograph)
        { label: 'Print…', commands: ['analysis.print', 'mm.print'] },
        { command: 'case.report' },
        sep,
        { command: 'app.settings' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { command: 'edit.undo' },
        { command: 'edit.redo' },
        sep,
        { command: 'rubric.copy' },
        { command: 'rubric.copyText' },
        { command: 'search.open' },
        sep,
        { command: 'clipboard.selectAll' },
        { command: 'clipboard.deleteSelected' },
      ],
    },
    {
      label: 'View',
      items: [
        { command: 'view.toggleTree' },
        { command: 'view.toggleClipboard' },
        { command: 'view.toggleDock' },
        { command: 'view.clipboardsOnly' },
        sep,
        {
          label: 'Theme', submenu: [
            { command: 'view.theme.light' },
            { command: 'view.theme.dark' },
            { command: 'view.theme.system' },
          ],
        },
        { command: 'view.density' },
        { command: 'view.zoomIn' },
        { command: 'view.zoomOut' },
        { command: 'view.zoomReset' },
        sep,
        {
          label: 'Show remedies', submenu: [
            { command: 'view.minGrade.1' },
            { command: 'view.minGrade.2' },
            { command: 'view.minGrade.3' },
          ],
        },
        { command: 'view.remedyNames' },
        { command: 'view.remedyCounts' },
        sep,
        { command: 'tab.close' },
        { command: 'tab.next' },
        { command: 'tab.prev' },
        { command: 'view.focusNext' },
        { command: 'view.focusPrev' },
      ],
    },
    {
      label: 'Repertory',
      items: [
        { label: 'Open repertory', submenu: catalog.repertoryInfos.map(r => ({ command: `repertory.open.${r.abbrev}` })) },
        { command: 'repertory.toc' },
        sep,
        { command: 'nav.back' },
        { command: 'nav.forward' },
        { command: 'nav.parent' },
        { command: 'nav.chapter' },
        { command: 'nav.findHere' },
        { command: 'repertory.cycleDisplay' },
        sep,
        { command: 'rubric.add' },
        {
          label: 'Take with intensity', submenu: [
            { command: 'rubric.add.w2', label: 'Intensity 2' },
            { command: 'rubric.add.w3', label: 'Intensity 3' },
            { command: 'rubric.add.w4', label: 'Intensity 4' },
          ],
        },
        { command: 'rubric.takeOptions' },
        { command: 'rubric.bookmark' },
        { command: 'rubric.note' },
        sep,
        { command: 'bookmarks.open' },
        { command: 'search.open' },
      ],
    },
    {
      label: 'Search',
      items: [
        { command: 'search.focus' },
        { command: 'search.open' },
        { command: 'search.remedy' },
        { command: 'search.new' },
        { command: 'search.all' },
        sep,
        {
          label: 'Scope', submenu: [
            { command: 'search.scope.repertory' },
            { command: 'search.scope.chapter' },
            { command: 'search.scope.all' },
          ],
        },
        { command: 'search.collapse' },
        { command: 'search.selectAll' },
        { command: 'search.export' },
        sep,
        { command: 'search.clearRecent' },
      ],
    },
    {
      label: 'Case',
      items: [
        { command: 'consultation.activate' },
        { command: 'consultation.followUp' },
        { command: 'prescription.add' },
        { command: 'consultation.delete' },
        sep,
        // same commands as File: the case report (print / PDF) and the case file export
        { command: 'case.report' },
        { command: 'file.exportCase' },
        sep,
        { command: 'clipboard.new' },
        { command: 'clipboard.next' },
        { command: 'clipboard.prev' },
        { command: 'clipboard.rename' },
        { command: 'clipboard.clear' },
        { command: 'clipboard.clearAll' },
        { command: 'clipboard.delete' },
        {
          label: 'Sort symptoms', submenu: [
            { command: 'clipboard.sort.homeopathic', label: 'Homeopathic order' },
            { command: 'clipboard.sort.intensity', label: 'Intensity' },
            { command: 'clipboard.sort.alphabetical', label: 'Alphabetical' },
            { command: 'clipboard.sort.size', label: 'Rubric size' },
          ],
        },
        sep,
        { command: 'symptom.combineUnion' },
        { command: 'symptom.combineIntersection' },
        { command: 'symptom.split' },
        sep,
        {
          label: 'Symptom weight', submenu: [
            { command: 'symptom.weight.0' },
            { command: 'symptom.weight.1' },
            { command: 'symptom.weight.2' },
            { command: 'symptom.weight.3' },
            { command: 'symptom.weight.4' },
          ],
        },
        { command: 'symptom.eliminatory' },
        { command: 'symptom.exclusive' },
        { command: 'symptom.causal' },
        { command: 'symptom.group' },
        { command: 'symptom.note' },
        { command: 'symptom.moveUp' },
        { command: 'symptom.moveDown' },
      ],
    },
    {
      label: 'Analysis',
      items: [
        { command: 'analysis.open' },
        { label: 'Strategy', submenu: STRATEGIES.map(s => ({ command: `analysis.strategy.${s.id}` })) },
        { command: 'analysis.intensity' },
        { command: 'analysis.showExcluded' },
        {
          label: 'Display', submenu: [
            { command: 'analysis.view.grid' },
            { command: 'analysis.view.bars' },
            { command: 'analysis.view.cards' },
          ],
        },
        sep,
        { command: 'families.filter' },
        { command: 'analysis.remedies' },
        { command: 'analysis.clearFilter' },
        { command: 'analysis.compare' },
        sep,
        { command: 'analysis.exportCsv' },
        { command: 'analysis.exportPng' },
        { command: 'analysis.print' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { command: 'mm.open' },
        { command: 'mm.search' },
        { command: 'remedy.open' },
        { command: 'families.open' },
        { command: 'families.ofRemedy' },
        { command: 'app.palette' },
        { command: 'palette.rubrics' },
        { command: 'palette.remedies' },
        { command: 'palette.patients' },
      ],
    },
    {
      label: 'Help',
      items: [
        { command: 'help.shortcuts' },
        { command: 'help.welcome' },
        sep,
        { command: 'help.about' },
      ],
    },
  ]
}
