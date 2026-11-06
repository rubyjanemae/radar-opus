import type { MenuItem } from '../ui/Menu'
import type { Catalog } from '../data/catalog'
import { STRATEGIES } from '../engine/analysis'
import { accountConfigured } from '../features/account/env'

const sep: MenuItem = { type: 'separator' }
/** Placeholder submenu of View › History; MenuBar fills it with the current history when the menu opens. */
export const HISTORY: MenuItem[] = [{ label: 'No history yet', disabled: true }]
const accountMenu = accountConfigured

/**
 * Menubar layout: RadarOpus's menu titles, order and item wording, limited to what the app can do.
 * The app's further commands are reached from the command palette (Help › Command palette), their
 * shortcuts and the documents' own toolbars and context menus. Items reference command ids from the
 * registry; a command that is not registered renders disabled, and tests assert that none are missing.
 * The Window menu's list of open documents is appended when it opens (MenuBar).
 */
export function buildMenus(_catalog: Catalog): { label: string; items: MenuItem[] }[] {
  void _catalog
  return [
    {
      label: 'File',
      items: [
        { command: 'patient.new', label: 'Create a new patient' },
        { command: 'consultation.new', label: 'Create a new consultation' },
        { command: 'file.exportCase', label: 'Export patient information' },
        sep,
        // one Ctrl+P entry: it prints what the active document is (analysis, monograph), else the page,
        // like the toolbar's Print (Ctrl+P with nothing printable open is the browser's own print)
        { label: 'Print', commands: ['analysis.print', 'mm.print', 'file.print'], keys: 'Mod+P' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { command: 'edit.undo', label: 'Undo' },
        // the book's rubric, or the analysis item under the grid cursor (features/analysis/commands.ts)
        { command: 'edit.copy', label: 'Copy', keys: 'Mod+C' },
        { command: 'edit.copyText', label: 'Copy symptom text only', keys: 'Mod+Shift+Y' },
        { command: 'analysis.copy', label: 'Copy analysis' },
        { command: 'clipboard.deleteSelected', label: 'Delete selection' },
        { command: 'clipboard.selectAll', label: 'Select all' },
      ],
    },
    {
      label: 'Additions',
      items: [
        { command: 'rubric.note', label: 'Add or modify a symptom note' },
      ],
    },
    {
      label: 'View',
      items: [
        { command: 'view.toc', label: 'Table of contents' },
        // the clone's side clipboard pane (RadarOpus has none; hidden by default)
        { command: 'view.toggleClipboard', label: 'Clipboard pane' },
        { command: 'repertory.toc', label: 'Open list of repertories' },
        { command: 'mm.open', label: 'Open list of references' },
        { command: 'patients.open', label: 'Open list of patients' },
        { command: 'remedy.open', label: 'List of remedies' },
        { command: 'families.open', label: 'List of families' },
        { command: 'bookmarks.open', label: 'Bookmarks' },
        { command: 'shell.back', label: 'Go back' },
        { command: 'shell.forward', label: 'Go forward' },
        // its submenu is the history list, read when the menu opens (MenuBar)
        { label: 'History', submenu: HISTORY },
      ],
    },
    {
      label: 'Search',
      items: [
        { command: 'nav.chapter', label: 'Find a rubric' },
        { command: 'nav.findHere', label: 'Find a rubric starting from the current rubric' },
        { command: 'search.open', label: 'Search' },
        { command: 'search.remedy', label: 'Advanced search' },
      ],
    },
    {
      label: 'Take',
      items: [
        { command: 'rubric.add', label: 'Take with intensity 1 (+1)' },
        { command: 'rubric.add.w2', label: 'Take with intensity 2 (+2)' },
        { command: 'rubric.add.w3', label: 'Take with intensity 3 (+3)' },
        { command: 'rubric.add.w4', label: 'Take with intensity 4 (+4)' },
        // "Take with default options" is left out: the clone has no stored default take options to apply
        { command: 'rubric.takeOptions', label: 'Take and specify the options' },
      ],
    },
    {
      label: 'Analysis',
      items: [
        { command: 'view.clipboardsOnly', label: 'Show current analysis with symptoms only' },
        { command: 'analysis.open', label: 'Show current analysis with symptoms and remedies' },
        { command: 'families.filter', label: 'Limit to a family' },
        // "Save current analysis" / "Recall an existing analysis" are left out on purpose: the clone's clipboards ARE the
        // active consultation's and autosave with it, so there is nothing separate to save; recalling one is
        // Patients › consultation › "Make active case". "Send current analysis by email" and "Show old analysis
        // with old Remedy" are left out too (no mail, no remedy history).
        { command: 'clipboard.clearAll', label: 'Start a new analysis (clear all clipboards)' },
        // sets the method new analyses start with (and switches the current one)
        { label: 'Select your default analysis method', submenu: STRATEGIES.map(s => ({ command: `analysis.default.${s.id}`, label: s.name })) },
      ],
    },
    {
      label: 'Tools',
      items: [
        // registered only when built with a Supabase project (hidden otherwise)
        ...(accountMenu ? [{ label: 'User accounts', submenu: [{ command: 'account.syncNow' }, { command: 'account.signOut' }] }] : []),
        // the local database: the workspace backup and case files
        {
          label: 'Database management', submenu: [
            { command: 'file.exportWorkspace' },
            { command: 'file.importWorkspace' },
            sep,
            { command: 'file.importCase' },
          ],
        },
      ],
    },
    {
      label: 'Window',
      items: [
        { command: 'view.zoomIn', label: 'Zoom in' },
        { command: 'view.zoomOut', label: 'Zoom out' },
        { command: 'tab.next', label: 'Next window' },
        { command: 'tab.prev', label: 'Previous window' },
        { command: 'tab.close', label: 'Close current window' },
        { command: 'window.closeAll', label: 'Close all windows' },
        // (MenuBar inserts one entry per open window here)
      ],
    },
    {
      // the macOS Help menu
      label: 'Help',
      items: [
        { command: 'help.shortcuts' },
        { command: 'app.palette' },
        { command: 'help.welcome' },
        sep,
        { command: 'help.about' },
      ],
    },
  ]
}
