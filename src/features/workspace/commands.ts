import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import { registerDialog, registerLazyDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { ShortcutsDialog } from './ShortcutsDialog'
import { AboutDialog } from './AboutDialog'
import { cyclePane, focusDocument, PANES } from './panes'
import { startTour, useTour } from './tour'

export const SETTINGS_DIALOG = 'workspace.settings'
export const SHORTCUTS_DIALOG = 'workspace.shortcuts'
export const ABOUT_DIALOG = 'workspace.about'

const dialogOpen = (kind: string) => useApp.getState().dialog?.kind === kind

/** Toggle a dialog: its own shortcut closes it again. */
function toggleDialog(kind: string, props?: Record<string, unknown>) {
  if (dialogOpen(kind)) actions.closeDialog()
  else actions.openDialog(kind, props)
}

const TEXT_INPUT = /^(text|search|number|email|tel|url|password|date|time|datetime-local|month|week)$/

/**
 * The text field Escape leaves: a focused input, textarea, select or editable element that is not
 * part of a popup of its own (a dialog, menu or open combobox handles Escape itself).
 */
export function fieldToLeave(el: Element | null = typeof document === 'undefined' ? null : document.activeElement): HTMLElement | null {
  if (!(el instanceof HTMLElement)) return null
  const field = el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && TEXT_INPUT.test((el as HTMLInputElement).type || 'text'))
  if (!field) return null
  if (el.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"], .pal')) return null
  if (el.getAttribute('aria-expanded') === 'true') return null
  return el
}

/** Leave a text field: focus returns to the main list of the active document (or the document itself). */
export function leaveField(field: HTMLElement, root: Document = document): HTMLElement | null {
  const doc = root.querySelector<HTMLElement>(PANES[1].selector)
  field.blur()
  if (!doc) return null
  const visible = (x: HTMLElement) => x !== field && x.isConnected && x.getClientRects().length > 0 && !x.closest('[inert],[hidden]')
  for (const sel of ['[data-pane-focus]', '[role="tree"][tabindex], [role="listbox"][tabindex], [role="grid"][tabindex]', '[role="option"][tabindex="0"], [role="treeitem"][tabindex="0"], [role="row"][tabindex="0"]']) {
    const x = [...doc.querySelectorAll<HTMLElement>(sel)].find(visible)
    if (x && x.tabIndex >= 0) { x.focus({ preventScroll: true }); return x }
  }
  const t = focusDocument(root)
  if (t && t !== field && !fieldToLeave(t)) return t
  // a form without a list: the document itself keeps focus so its keys still work
  if (!doc.hasAttribute('tabindex')) doc.setAttribute('tabindex', '-1')
  doc.focus({ preventScroll: true })
  return doc
}

export function register(_catalog: Catalog) {
  registerLazyDialog(SETTINGS_DIALOG, () => import('./SettingsDialog'), m => m.SettingsDialog)
  registerDialog(SHORTCUTS_DIALOG, ShortcutsDialog as unknown as DialogComponent)
  registerDialog(ABOUT_DIALOG, AboutDialog as unknown as DialogComponent)

  const noModal = () => !useApp.getState().dialog && !useTour.getState().open

  registerCommands([
    {
      id: 'app.settings', title: 'Settings…', category: 'File', keys: ['Mod+,'], allowInInput: true,
      // its own key closes it again while it is open (other shortcuts wait while a dialog is modal)
      inModal: `[data-dialog="${SETTINGS_DIALOG}"]`,
      keywords: 'preferences options theme density font text size default repertory strategy backup reset storage',
      run: () => toggleDialog(SETTINGS_DIALOG),
    },
    {
      id: 'app.resetData', title: 'Reset demo data…', category: 'File', keywords: 'erase clear wipe delete all data start over',
      run: () => actions.openDialog(SETTINGS_DIALOG, { tab: 'data' }),
    },
    {
      id: 'help.shortcuts', title: 'Keyboard shortcuts', category: 'Help', keys: ['F1'], allowInInput: true,
      inModal: `[data-dialog="${SHORTCUTS_DIALOG}"]`,
      keywords: 'keys hotkeys keymap cheat sheet take syntax mini-language help',
      run: () => toggleDialog(SHORTCUTS_DIALOG),
    },
    {
      id: 'help.welcome', title: 'Welcome tour', category: 'Help', keywords: 'introduction getting started onboarding guide',
      enabled: () => !useTour.getState().open, run: () => startTour(),
    },
    {
      id: 'help.about', title: 'About Radar Opus', category: 'Help', keywords: 'version licence license credits data sources oorep boericke',
      run: () => toggleDialog(ABOUT_DIALOG),
    },
    {
      // Escape in a form field hands the keyboard back to the document's list (a field that handles Escape itself wins)
      id: 'view.leaveField', title: 'Leave text field', category: 'View', keys: ['Escape'], allowInInput: true,
      keywords: 'escape blur field return focus list', enabled: () => !!fieldToLeave(), run: () => { const f = fieldToLeave(); if (f) leaveField(f) },
    },
    {
      id: 'view.focusNext', title: 'Focus next pane', category: 'View', keys: ['Mod+F6'], allowInInput: true,
      keywords: 'pane cycle navigator clipboard document switch focus', enabled: noModal, run: () => { cyclePane(1) },
    },
    {
      id: 'view.focusPrev', title: 'Focus previous pane', category: 'View', keys: ['Mod+Shift+F6'], allowInInput: true,
      keywords: 'pane cycle navigator clipboard document switch focus', enabled: noModal, run: () => { cyclePane(-1) },
    },
  ])
}
