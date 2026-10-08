import type { Catalog } from '../data/catalog'
import { actions, useApp } from '../state/store'
import { exportWorkspace, importWorkspace } from '../state/persist'
import { registerCommands } from './registry'
import { downloadBlob, pickFile } from '../ui/files'
import { askConfirm } from '../ui/ConfirmDialog'
import { registerFeatureCommands } from '../features/register'
import { openRepertory } from '../features/repertory/ops'

const st = () => useApp.getState()

/** App-wide commands (file, edit, view, tabs, help). Feature commands register in features/register.ts. */
export function registerCoreCommands(catalog: Catalog) {
  const zoom = (d: number) => actions.setSettings({ fontScale: Math.round(Math.max(0.8, Math.min(1.5, st().settings.fontScale + d)) * 100) / 100 })
  registerCommands([
    // Edit
    { id: 'edit.undo', title: 'Undo', category: 'Edit', keys: ['Mod+Z'], run: () => actions.undo(), enabled: () => st().past.length > 0 },
    { id: 'edit.redo', title: 'Redo', category: 'Edit', keys: ['Mod+Shift+Z', 'Mod+Y'], run: () => actions.redo(), enabled: () => st().future.length > 0 },

    // File
    {
      id: 'file.exportWorkspace', title: 'Export workspace backup…', category: 'File',
      run: async () => { downloadBlob(await exportWorkspace(), `radar-opus-backup-${new Date().toISOString().slice(0, 10)}.json`); actions.toast('Workspace exported', 'success') },
    },
    {
      id: 'file.importWorkspace', title: 'Restore workspace backup…', category: 'File',
      run: async () => {
        const f = await pickFile('.json,application/json')
        if (!f) return
        try {
          await importWorkspace(await f.text(), sum => askConfirm({
            title: 'Restore workspace backup',
            message: `Replace the current workspace with "${f.name}" (${sum.patients} patient${sum.patients === 1 ? '' : 's'}, ${sum.consultations} consultation${sum.consultations === 1 ? '' : 's'})?`,
            detail: 'Your current patients, tabs and settings are replaced. They are backed up first, and the restore can be undone from the notification.',
            confirmLabel: 'Replace workspace',
          }))
        } catch (e) { actions.toast(e instanceof Error ? e.message : 'Import failed', 'error') }
      },
    },

    // View
    { id: 'view.toggleTree', title: 'Navigator pane', category: 'View', keys: ['Mod+B'], checked: () => st().layout.showTree, run: () => actions.setLayout({ showTree: !st().layout.showTree }) },
    { id: 'view.toggleClipboard', title: 'Clipboard pane', category: 'View', keys: ['Mod+Shift+B'], checked: () => st().layout.showClipboard, run: () => actions.setLayout({ showClipboard: !st().layout.showClipboard }) },
    { id: 'view.toggleDock', title: 'Analysis preview dock', category: 'View', keys: ['Mod+J'], checked: () => st().layout.showAnalysisDock, run: () => actions.setLayout({ showAnalysisDock: !st().layout.showAnalysisDock }) },
    { id: 'view.theme.light', title: 'Light', category: 'View', checked: () => st().settings.theme === 'light', run: () => actions.setSettings({ theme: 'light' }), keywords: 'theme' },
    { id: 'view.theme.dark', title: 'Dark', category: 'View', checked: () => st().settings.theme === 'dark', run: () => actions.setSettings({ theme: 'dark' }), keywords: 'theme' },
    { id: 'view.theme.system', title: 'Match system', category: 'View', checked: () => st().settings.theme === 'system', run: () => actions.setSettings({ theme: 'system' }), keywords: 'theme' },
    { id: 'view.density', title: 'Comfortable density', category: 'View', checked: () => st().settings.density === 'comfortable', run: () => actions.setSettings({ density: st().settings.density === 'compact' ? 'comfortable' : 'compact' }) },
    { id: 'view.zoomIn', title: 'Zoom in', category: 'View', keys: ['Mod+=', 'Mod++'], run: () => zoom(0.05) },
    { id: 'view.zoomOut', title: 'Zoom out', category: 'View', keys: ['Mod+-'], run: () => zoom(-0.05) },
    { id: 'view.zoomReset', title: 'Actual size', category: 'View', keys: ['Mod+0'], run: () => actions.setSettings({ fontScale: 1 }) },
    { id: 'view.minGrade.1', title: 'All grades', category: 'View', checked: () => st().settings.minGradeShown === 1, run: () => actions.setSettings({ minGradeShown: 1 }) },
    { id: 'view.minGrade.2', title: 'Grade 2 and higher', category: 'View', checked: () => st().settings.minGradeShown === 2, run: () => actions.setSettings({ minGradeShown: 2 }) },
    { id: 'view.minGrade.3', title: 'Grade 3 and higher', category: 'View', checked: () => st().settings.minGradeShown === 3, run: () => actions.setSettings({ minGradeShown: 3 }) },
    { id: 'view.remedyNames', title: 'Full remedy names', category: 'View', checked: () => st().settings.remedyStyle === 'name', run: () => actions.setSettings({ remedyStyle: st().settings.remedyStyle === 'name' ? 'abbrev' : 'name' }) },
    { id: 'view.remedyCounts', title: 'Remedy counts in tree', category: 'View', checked: () => st().settings.showRemedyCounts, run: () => actions.setSettings({ showRemedyCounts: !st().settings.showRemedyCounts }) },

    // Tabs. Browser-safe keys first: the browser keeps Ctrl+W, Ctrl+Tab and Ctrl+PageUp/PageDown for its own tabs
    // (menus show the first key a page can receive; the Mod variants still work where the browser lets them through).
    { id: 'tab.close', title: 'Close tab', category: 'View', keys: ['Alt+W', 'Mod+W'], enabled: () => !!st().activeTabId, run: () => { const id = st().activeTabId; if (id) actions.closeTab(id) } },
    { id: 'tab.next', title: 'Next tab', category: 'View', keys: ['Alt+PageDown', 'Mod+PageDown'], allowInInput: true, enabled: () => st().tabs.length > 1, run: () => actions.cycleTab(1) },
    // Ctrl+1..5 open the documents (RadarOpus); Ctrl+6..8 go to that tab and Ctrl+9 to the last, as in a browser
    ...[6, 7, 8].map(n => ({
      id: `tab.goto.${n}`, title: `Go to tab ${n}`, category: 'View', keys: [`Mod+${n}`], allowInInput: true, keywords: 'switch tab number',
      enabled: () => st().tabs.length >= n, run: () => { const t = st().tabs[n - 1]; if (t) actions.activateTab(t.id) },
    })),
    {
      id: 'tab.last', title: 'Go to last tab', category: 'View', keys: ['Mod+9'], allowInInput: true, keywords: 'switch tab number',
      enabled: () => st().tabs.length > 0, run: () => { const t = st().tabs[st().tabs.length - 1]; if (t) actions.activateTab(t.id) },
    },
    { id: 'tab.prev', title: 'Previous tab', category: 'View', keys: ['Alt+PageUp', 'Mod+PageUp'], allowInInput: true, enabled: () => st().tabs.length > 1, run: () => actions.cycleTab(-1) },

    // Repertories: each opens in its own tab (loading, errors and retry are handled by the repertory feature)
    ...catalog.repertoryInfos.map(r => ({
      id: `repertory.open.${r.abbrev}`, title: r.title, category: 'Repertory', keywords: `open repertory ${r.fullTitle} ${r.author}`,
      run: () => openRepertory(r.abbrev),
    })),

    // App
    { id: 'app.palette', title: 'Command palette', category: 'Tools', keys: ['Mod+K', 'Mod+Shift+P'], allowInInput: true, inModal: '.pal', run: () => actions.setCommandPalette(!st().commandPaletteOpen) },
  ])
  registerFeatureCommands(catalog)
}
