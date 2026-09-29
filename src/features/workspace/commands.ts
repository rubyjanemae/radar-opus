import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import { registerDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { SettingsDialog } from './SettingsDialog'
import { ShortcutsDialog } from './ShortcutsDialog'
import { AboutDialog } from './AboutDialog'
import { cyclePane } from './panes'
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

export function register(_catalog: Catalog) {
  registerDialog(SETTINGS_DIALOG, SettingsDialog as unknown as DialogComponent)
  registerDialog(SHORTCUTS_DIALOG, ShortcutsDialog as unknown as DialogComponent)
  registerDialog(ABOUT_DIALOG, AboutDialog as unknown as DialogComponent)

  const noModal = () => !useApp.getState().dialog && !useTour.getState().open

  registerCommands([
    {
      id: 'app.settings', title: 'Settings…', category: 'File', keys: ['Mod+,'], allowInInput: true,
      keywords: 'preferences options theme density font text size default repertory strategy backup reset storage',
      run: () => toggleDialog(SETTINGS_DIALOG),
    },
    {
      id: 'app.resetData', title: 'Reset demo data…', category: 'File', keywords: 'erase clear wipe delete all data start over',
      run: () => actions.openDialog(SETTINGS_DIALOG, { tab: 'data' }),
    },
    {
      id: 'help.shortcuts', title: 'Keyboard shortcuts', category: 'Help', keys: ['F1'], allowInInput: true,
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
      id: 'view.focusNext', title: 'Focus next pane', category: 'View', keys: ['Mod+F6'], allowInInput: true,
      keywords: 'pane cycle navigator clipboard document switch focus', enabled: noModal, run: () => { cyclePane(1) },
    },
    {
      id: 'view.focusPrev', title: 'Focus previous pane', category: 'View', keys: ['Mod+Shift+F6'], allowInInput: true,
      keywords: 'pane cycle navigator clipboard document switch focus', enabled: noModal, run: () => { cyclePane(-1) },
    },
  ])
}
