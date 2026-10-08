import { useEffect } from 'react'
import { actions, useApp } from '../../state/store'

/** At or below this window width the analysis tab folds the clipboard pane away while it is shown. */
export const CLIPBOARD_AUTO_COLLAPSE_WIDTH = 1200
/** Below this width the side panes are overlays (WorkspaceChrome): reopening one there would cover the document. */
const OVERLAY_WIDTH = 1100

/**
 * On narrow windows the ~280px clipboard pane leaves the analysis grid too little room (the symptom
 * column and a useful number of remedy columns). While an analysis tab is shown at <= 1200px the pane
 * collapses; leaving the tab reopens it if this hook closed it and the person did not touch it since.
 * Opening it again by hand (Ctrl+Shift+B) while on the analysis is respected until the tab is left.
 * The tab's effects run while it is visible (hidden tabs sit in an Activity), so this follows tab switches.
 */
export function useAutoCollapseClipboard() {
  useEffect(() => {
    let collapsedByUs = false
    let userTouched = false
    let ours = false
    const collapse = () => {
      if (userTouched || collapsedByUs) return
      if (window.innerWidth > CLIPBOARD_AUTO_COLLAPSE_WIDTH || !useApp.getState().layout.showClipboard) return
      ours = true
      actions.setLayout({ showClipboard: false })
      ours = false
      collapsedByUs = true
    }
    const unsub = useApp.subscribe((s, prev) => {
      if (ours || s.layout.showClipboard === prev.layout.showClipboard) return
      // any other change of the pane (the person, a command, the tour) wins over the automatic fold
      userTouched = true
      collapsedByUs = false
    })
    collapse()
    window.addEventListener('resize', collapse)
    return () => {
      window.removeEventListener('resize', collapse)
      unsub()
      if (collapsedByUs && !useApp.getState().layout.showClipboard && window.innerWidth >= OVERLAY_WIDTH) actions.setLayout({ showClipboard: true })
    }
  }, [])
}
