import type { MenuItem } from '../ui/Menu'
import type { Catalog } from '../data/catalog'
import { accountConfigured } from '../features/account/env'
import { RO_METHODS, strategyInfo } from '../engine/analysis'

const sep: MenuItem = { type: 'separator' }
const accountMenu = accountConfigured
/** The application menu's title (macOS shows it in bold, after the Apple menu). */
export const APP_MENU = 'RadarOpus'

/**
 * Analysis › Select your default analysis method (RadarOpus): a submenu of its methods, the default one
 * checked; choosing one makes it the default and the current analysis's method (features/analysis).
 * (The palette's "Select your default analysis method…" opens the same choice as a dialog.)
 */
export const DEFAULT_METHOD_ITEM: MenuItem = {
  label: 'Select your default analysis method',
  submenu: RO_METHODS.map(id => ({ command: `analysis.default.${id}`, label: strategyInfo(id).name })),
}

/** Analysis › Limit to a family (menubar and the toolbar's Analysis ▾): RadarOpus's family classifications; each opens the family chooser on it (features/families FAMILY_SETS). */
export const LIMIT_FAMILY_ITEM: MenuItem = {
  label: 'Limit to a family', submenu: [
    { command: 'families.limit.minerals', label: 'IMPONDERABLES + MINERALS and CHEMICALS' },
    { command: 'families.limit.plants', label: 'Plants APG2' },
    { command: 'families.limit.animals', label: 'Animals + Analogic groups' },
    { command: 'families.limit.periodic', label: 'Periodic Table (Classical)' },
    { command: 'families.limit.nosodes', label: 'Nosodes families' },
  ],
}

/**
 * Menubar layout: RadarOpus's menu titles, order and item wording, limited to what the app can do.
 * The app's further commands are reached from the command palette (Mod+K), their
 * shortcuts and the documents' own toolbars and context menus. Items reference command ids from the
 * registry; a command that is not registered renders disabled, and tests assert that none are missing.
 * The Window menu's list of open documents is appended when it opens (MenuBar).
 */
export function buildMenus(_catalog: Catalog): { label: string; items: MenuItem[] }[] {
  void _catalog
  return [
    {
      // the macOS application menu (RadarOpus's "RadarOpus" menu): About and Preferences; the system's
      // Services / Hide / Quit items belong to the browser here
      label: APP_MENU,
      items: [
        { command: 'help.about', label: 'About RadarOpus' },
        sep,
        { command: 'app.settings', label: 'Preferences...' },
      ],
    },
    {
      label: 'File',
      items: [
        // the documents checked in the table of contents' list of repertories, kept by name (features/docmix)
        { command: 'docmix.save', label: 'Save selection as a document mix' },
        { command: 'docmix.recall', label: 'Recall a document mix' },
        { command: 'docmix.default', label: 'Select a default document mix' },
        { command: 'docmix.unsetDefault', label: 'Unselect current default document mix' },
        sep,
        { command: 'patient.new', label: 'Create a new patient' },
        { command: 'consultation.new', label: 'Create a new consultation' },
        { command: 'file.savePatient', label: 'Save patient information' },
        { command: 'file.exportCase', label: 'Export patient information' },
        { command: 'file.sendClificol', label: 'Send current patient to Clificol' },
        sep,
        // one Ctrl+P entry: it prints what the active document is (analysis, monograph), else the page,
        // like the toolbar's Print (Ctrl+P with nothing printable open is the browser's own print)
        { label: 'Print', commands: ['analysis.print', 'mm.print', 'file.print'], keys: 'Mod+P' },
        // the browser's print dialog is its preview and its page setup: both open it on the same document
        { command: 'file.printPreview', label: 'Print preview' },
        { command: 'file.printSetup', label: 'Print setup' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { command: 'edit.undo', label: 'Undo' },
        // Cut... / Paste move symptoms between clipboards (features/analysis/commands.ts, clipboard/ops.ts)
        { command: 'edit.cut', label: 'Cut...' },
        // the book's rubric, or the analysis item under the grid cursor (features/analysis/commands.ts)
        { command: 'edit.copy', label: 'Copy', keys: 'Mod+C' },
        { command: 'edit.paste', label: 'Paste' },
        { command: 'edit.copyText', label: 'Copy symptom text only', keys: 'Mod+Shift+Y' },
        { command: 'analysis.copy', label: 'Copy analysis' },
        // the symptom under the analysis grid's cursor, else the clipboard pane's selection
        { command: 'edit.deleteSelection', label: 'Delete selection', keys: 'Delete' },
        { command: 'clipboard.selectAll', label: 'Select all' },
        { command: 'clipboard.unselectAll', label: 'Unselect all' },
        sep,
        // the choice list of the field last focused (a select, a date, a field with suggestions)
        { command: 'edit.pickList', label: 'Open pick list of current field' },
        // the patient's previous prescription, into the consultation shown
        { command: 'edit.repeatPrescription', label: 'Repeat last prescription' },
      ],
    },
    {
      label: 'Additions',
      items: [
        { command: 'rubric.note', label: 'Add or modify a symptom note' },
        { command: 'rubric.removeNote', label: 'Remove a symptom note' },
        sep,
        // the symptom notes, as a file (shell/menuCommands.ts)
        { command: 'additions.export', label: 'Export additions' },
        { command: 'additions.import', label: 'Import additions' },
      ],
    },
    {
      label: 'View',
      items: [
        { command: 'view.toc', label: 'Table of contents' },
        { command: 'repertory.toc', label: 'Open list of repertories' },
        { command: 'mm.listReferences', label: 'Open list of references' },
        { command: 'patients.open', label: 'Open list of patients' },
        { command: 'remedy.open', label: 'List of remedies' },
        { command: 'families.open', label: 'List of families' },
        { command: 'bookmarks.open', label: 'Bookmarks' },
        { command: 'view.gotoRepertory', label: 'Go to the open repertories window' },
        { command: 'view.gotoReference', label: 'Go to the open references window' },
        { command: 'view.gotoPatient', label: 'Go to the patient window' },
        { command: 'shell.back', label: 'Go back' },
        { command: 'shell.forward', label: 'Go forward' },
        // RadarOpus's brown History popup (shell/HistoryPopup)
        { command: 'view.history', label: 'History' },
        { command: 'view.patientAdmin', label: 'Patient administration' },
        { command: 'view.patientConsultations', label: 'Patient consultations' },
        { command: 'view.authors', label: 'List of authors and documents' },
        // the current analysis on the periodic table or across the kingdoms (features/maps)
        { command: 'maps.open', label: 'Maps' },
      ],
    },
    {
      label: 'Search',
      items: [
        { command: 'nav.chapter', label: 'Find a rubric' },
        { command: 'nav.findHere', label: 'Find a rubric starting from the current rubric' },
        { command: 'mm.findInDocument', label: 'Search text in the current document' },
        { command: 'search.open', label: 'Search' },
        { command: 'search.remedy', label: 'Advanced search' },
        { command: 'patients.search', label: 'Search in the patient file' },
        { command: 'families.finder', label: 'Family finder' },
      ],
    },
    {
      label: 'Take',
      items: [
        // RadarOpus shows the typed mini-language right-aligned as the shortcut (+1 … +4), and no key for the rest
        { command: 'rubric.add', label: 'Take with intensity 1', hint: '+1' },
        { command: 'rubric.add.w2', label: 'Take with intensity 2', hint: '+2' },
        { command: 'rubric.add.w3', label: 'Take with intensity 3', hint: '+3' },
        { command: 'rubric.add.w4', label: 'Take with intensity 4', hint: '+4' },
        { command: 'rubric.takeDefault', label: 'Take with default options', keys: '' },
        { command: 'rubric.takeOptions', label: 'Take and specify the options', keys: '' },
      ],
    },
    {
      label: 'Analysis',
      items: [
        { command: 'view.clipboardsOnly', label: 'Show current analysis with symptoms only' },
        { command: 'analysis.open', label: 'Show current analysis with symptoms and remedies' },
        LIMIT_FAMILY_ITEM,
        // named snapshots of the case's clipboards and analysis options (features/analysis/SavedDialogs.tsx)
        { command: 'analysis.save', label: 'Save current analysis' },
        { command: 'analysis.recall', label: 'Recall an existing analysis' },
        { command: 'clipboard.clearAll', label: 'Start a new analysis (clear all clipboards)' },
        // the mail program, with the analysis as the message text
        { command: 'analysis.email', label: 'Send current analysis by email' },
        // the previous consultation's analysis with the remedy prescribed then selected
        { command: 'analysis.old', label: 'Show old analysis with old Remedy' },
        // sets the method new analyses start with (and switches the current one)
        DEFAULT_METHOD_ITEM,
      ],
    },
    {
      label: 'Tools',
      items: [
        { command: 'tools.tooltips', label: 'Deactivate tooltips' },
        // registered only when built with a Supabase project (hidden otherwise)
        ...(accountMenu ? [{ label: 'User accounts', submenu: [{ command: 'account.syncNow' }, { command: 'account.signOut' }] }] : []),
        // the local database: the workspace backup and case files
        {
          label: 'Database management', submenu: [
            { command: 'file.exportWorkspace', label: 'Backup' },
            { command: 'file.importWorkspace', label: 'Restore' },
            sep,
            { command: 'file.importCase' },
          ],
        },
        { command: 'tools.screenshot', label: 'Take a screenshot' },
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
        { command: 'help.shortcuts', label: 'Shortcuts list' },
        { command: 'help.provings', label: 'Provings.com' },
        { command: 'help.clificol', label: 'Clificol' },
        { command: 'help.website', label: 'Visit RadarOpus.com' },
        { command: 'help.welcome', label: 'Welcome page' },
      ],
    },
  ]
}
