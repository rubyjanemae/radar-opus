import { actions, useApp } from '../../state/store'
import { readFlag, writeFlag } from './data'

/** Below this width the navigator and clipboard panes float over the document instead of sitting beside it. */
export const NARROW_QUERY = '(max-width: 1099.98px)'
export const WIDE_LAYOUT_KEY = 'radar-opus.wideLayout'

export type SidePane = 'tree' | 'clipboard'
export interface SideState { showTree: boolean; showClipboard: boolean }

/** Hide the side panes (remembering them) when the window becomes narrow. */
export function enterNarrow() {
  document.documentElement.dataset.narrow = 'true'
  const { showTree, showClipboard } = useApp.getState().layout
  if (!showTree && !showClipboard) return
  if (readFlag(WIDE_LAYOUT_KEY) == null) writeFlag(WIDE_LAYOUT_KEY, JSON.stringify({ showTree, showClipboard }))
  actions.setLayout({ showTree: false, showClipboard: false })
}

/** Restore the panes that were open before the window became narrow. */
export function leaveNarrow() {
  delete document.documentElement.dataset.narrow
  const raw = readFlag(WIDE_LAYOUT_KEY)
  if (raw == null) return
  writeFlag(WIDE_LAYOUT_KEY, null)
  try {
    const saved = JSON.parse(raw) as { showTree?: unknown; showClipboard?: unknown }
    const cur = useApp.getState().layout
    actions.setLayout({
      showTree: cur.showTree || saved.showTree === true,
      showClipboard: cur.showClipboard || saved.showClipboard === true,
    })
  } catch { /* ignore a corrupt value */ }
}

/** Close floating side panes (Escape, or a click on the scrim in narrow mode). */
export function closeOverlays() {
  const { showTree, showClipboard } = useApp.getState().layout
  if (showTree || showClipboard) actions.setLayout({ showTree: false, showClipboard: false })
}

/**
 * In narrow mode only one side overlay is open at a time. Given the previous and next pane
 * state, returns the patch that closes the overlay that was already open when the other one
 * opened (or null when nothing needs to change).
 */
export function exclusivePatch(prev: SideState, next: SideState): Partial<SideState> | null {
  if (!(next.showTree && next.showClipboard)) return null
  if (!prev.showTree) return { showClipboard: false }
  if (!prev.showClipboard) return { showTree: false }
  // both were already open (e.g. narrowed while a tour step held them): keep the navigator
  return { showClipboard: false }
}

/** The side pane that just opened, if any. */
export function openedPane(prev: SideState, next: SideState): SidePane | null {
  if (next.showTree && !prev.showTree) return 'tree'
  if (next.showClipboard && !prev.showClipboard) return 'clipboard'
  return null
}

/** The document pane keeps at least this width while the side panes sit beside it. */
export const MIN_CENTER_WIDTH = 640
export const MIN_TREE_WIDTH = 180
export const MIN_CLIPBOARD_WIDTH = 240

/**
 * Displayed widths of the side panes for a window width. The saved widths are used as they are when
 * they fit; otherwise both shrink (in proportion to how far each is above its minimum) until the
 * document keeps MIN_CENTER_WIDTH. The saved layout is not changed, so widening the window restores it.
 */
export function fitSidePanes(
  viewport: number,
  l: { showTree: boolean; showClipboard: boolean; treeWidth: number; clipboardWidth: number },
  splitter = 1,
): { tree: number; clipboard: number } {
  const tree = l.showTree ? Math.max(MIN_TREE_WIDTH, l.treeWidth) : 0
  const clip = l.showClipboard ? Math.max(MIN_CLIPBOARD_WIDTH, l.clipboardWidth) : 0
  const room = viewport - MIN_CENTER_WIDTH - (l.showTree ? splitter : 0) - (l.showClipboard ? splitter : 0)
  const excess = tree + clip - room
  if (excess <= 0) return { tree, clipboard: clip }
  const slackTree = l.showTree ? tree - MIN_TREE_WIDTH : 0
  const slackClip = l.showClipboard ? clip - MIN_CLIPBOARD_WIDTH : 0
  const slack = slackTree + slackClip
  if (slack <= 0) return { tree, clipboard: clip }
  const cut = Math.min(excess, slack)
  const cutTree = Math.round(cut * (slackTree / slack))
  return { tree: tree - cutTree, clipboard: clip - (cut - cutTree) }
}
