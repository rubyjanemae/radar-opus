import { memo } from 'react'
import { useApp } from '../state/store'
import { isMac, runCommand } from '../commands/registry'
import { useChrome } from './chrome'
import { SaveIndicator } from './SaveIndicator'
import { chromeBackgroundMouseDown, keepFocus, returnFocusFromChrome } from './focus'

const TOC_KEY = `(${isMac ? 'cmd' : 'ctrl'}+F2)`

/** A status strip link: runs its command and leaves the keyboard in the document. */
function StatusLink({ command, children }: { command: string; children: string }) {
  return (
    <button className="status-link" onMouseDown={keepFocus} onClick={() => { runCommand(command); returnFocusFromChrome('.statusbar') }}>
      {children}
    </button>
  )
}

/**
 * The status strip along the desktop's bottom edge (RadarOpus): only its text links, which show or hide
 * the table of contents, the toolbars and clipboards, and widen the table of contents. The autosave
 * state is kept for assistive technology and shows only when saving fails.
 */
export const StatusBar = memo(function StatusBar() {
  const tocOpen = useApp(s => s.layout.showTree)
  const hideBars = useChrome(s => s.hideBars)
  const tocExpanded = useChrome(s => s.tocExpanded)
  return (
    <footer className="statusbar" aria-label="Status" onMouseDown={e => chromeBackgroundMouseDown(e)}>
      <StatusLink command="view.toc">{tocOpen ? `Hide the table of contents ${TOC_KEY}` : `Show table of contents ${TOC_KEY}`}</StatusLink>
      <StatusLink command="view.toolbars">{hideBars ? 'Show toolbars and clipboards' : 'Hide toolbars and clipboards'}</StatusLink>
      {tocOpen && <StatusLink command="view.expandToc">{tocExpanded ? 'Reduce Toc' : 'Expand Toc'}</StatusLink>}
      <span className="status-spacer" />
      <SaveIndicator />
    </footer>
  )
})
