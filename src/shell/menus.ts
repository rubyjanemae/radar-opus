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
        { command: 'analysis.print' },
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
      ],
    },
    {
      label: 'Repertory',
      items: [
        { label: 'Open repertory', submenu: catalog.repertoryInfos.map(r => ({ command: `repertory.open.${r.abbrev}` })) },
        { command: 'nav.back' },
        { command: 'nav.forward' },
        { command: 'nav.parent' },
        { command: 'nav.chapter' },
        sep,
        { command: 'rubric.add' },
        {
          label: 'Add with weight', submenu: [
            { command: 'rubric.add.w2' },
            { command: 'rubric.add.w3' },
            { command: 'rubric.add.w4' },
          ],
        },
        { command: 'rubric.bookmark' },
        { command: 'rubric.note' },
        sep,
        { command: 'bookmarks.open' },
        { command: 'search.open' },
      ],
    },
    {
      label: 'Case',
      items: [
        { command: 'clipboard.new' },
        { command: 'clipboard.next' },
        { command: 'clipboard.prev' },
        { command: 'clipboard.rename' },
        { command: 'clipboard.clear' },
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
        { command: 'symptom.causal' },
      ],
    },
    {
      label: 'Analysis',
      items: [
        { command: 'analysis.open' },
        { label: 'Strategy', submenu: STRATEGIES.map(s => ({ command: `analysis.strategy.${s.id}` })) },
        { command: 'analysis.filter' },
        { command: 'analysis.clearFilter' },
        { command: 'analysis.compare' },
        sep,
        { command: 'analysis.print' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { command: 'mm.open' },
        { command: 'families.open' },
        { command: 'app.palette' },
      ],
    },
    {
      label: 'Help',
      items: [
        { command: 'help.shortcuts' },
        { command: 'help.about' },
      ],
    },
  ]
}
