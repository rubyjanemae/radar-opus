import type { Catalog } from '../../data/catalog'
import { registerCommands, runCommand } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import { chrome } from '../../shell/chrome'
import type { TocView } from '../../shell/chrome'

/** The toolbar's list buttons (RadarOpus checkboxes): their command per list. */
export const TOC_COMMAND: Record<TocView, string> = {
  repertories: 'toc.repertories', references: 'toc.references', remedies: 'toc.remedies', families: 'toc.families', bookmarks: 'toc.bookmarks',
  // the Patients list is registered by the patients feature (it also has a menu of its own)
  patients: 'patients.open',
}

/** True while the table of contents is open on `view`. */
export function tocShows(view: TocView): boolean {
  return useApp.getState().layout.showTree && chrome.get().tocView === view
}

/**
 * True while the toolbar's button for `view` is checked. RadarOpus checks only the list the table of
 * contents shows: one button at a time, none while the table of contents is hidden.
 */
export function tocChecked(view: TocView): boolean {
  return tocShows(view)
}

/** Show `view`'s list in the table of contents (opening it when hidden); its button becomes the checked one. */
export function showTocView(view: TocView) {
  const s = chrome.get()
  if (s.tocView !== view || s.tocChecked.length !== 1 || s.tocChecked[0] !== view) chrome.set({ tocView: view, tocChecked: [view] })
  if (!useApp.getState().layout.showTree) actions.setLayout({ showTree: true })
}

/** Hide the table of contents showing `view` (as cmd+F2); no button stays checked. */
export function closeTocView(view: TocView) {
  if (tocShows(view)) runCommand('view.toc')
}

/**
 * A list button (RadarOpus): on the list the table of contents shows it hides the table of contents;
 * otherwise it shows its list there, unchecking the button of the list it replaces.
 */
export function toggleTocView(view: TocView) {
  if (tocShows(view)) closeTocView(view)
  else showTocView(view)
}

const TITLES: Record<TocView, string> = {
  repertories: 'List of repertories', references: 'List of references', remedies: 'List of remedies', families: 'List of families', bookmarks: 'List of bookmarks', patients: 'List of patients',
}

export function register(_catalog: Catalog) {
  void _catalog
  registerCommands((Object.keys(TOC_COMMAND) as TocView[]).filter(view => view !== 'patients').map(view => ({
    id: TOC_COMMAND[view], title: `${TITLES[view]} (table of contents)`, category: 'View',
    keywords: `toc table of contents panel ${view}`,
    checked: () => tocChecked(view),
    run: () => toggleTocView(view),
  })))
}
