import { create } from 'zustand'
import { actions, useApp } from '../../state/store'
import { WELCOME_KEY, readFlag, writeFlag } from './data'

export interface TourStep {
  id: string
  /** CSS selectors tried in order; the first visible match is highlighted. */
  targets: string[]
  title: string
  body: string
  /** Keys to show under the text (registry form or literal). */
  keys?: { keys: string; label: string }[]
  /** Layout the step needs visible. */
  needs?: 'tree' | 'clipboard'
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'navigator', targets: ['.pane-left'], needs: 'tree',
    title: 'Find your way with the navigator',
    body: 'Chapters and rubrics of the open repertory as a tree. Type letters to jump, use the arrow keys to expand and collapse, and Enter to open a rubric in the book.',
    keys: [{ keys: 'F2', label: 'find a rubric' }, { keys: 'Mod+B', label: 'show or hide' }],
  },
  {
    id: 'repertory', targets: ['.pane-center .tab-content'],
    title: 'Read rubrics like the printed book',
    body: 'Remedies are listed by grade: plain, italic, bold and BOLD CAPS. Space cycles the display, Backspace goes up a level, and + takes a rubric (+2 for intensity 2, +1>3 into clipboard 3).',
    keys: [{ keys: 'F4', label: 'word search' }, { keys: 'F6', label: 'take with options' }],
  },
  {
    id: 'clipboard', targets: ['.pane-right'], needs: 'clipboard',
    title: 'Collect symptoms in clipboards',
    body: 'Taken rubrics land in the active clipboard of the open consultation. Keep up to 12 clipboards, set a symptom’s intensity with 0–4 and reorder, combine or mark symptoms as eliminative.',
    keys: [{ keys: 'Alt+1', label: 'switch clipboard' }, { keys: 'F7', label: 'clipboards' }],
  },
  {
    id: 'analysis', targets: ['.toolbar button[aria-label="Analyse case"]', '.toolbar button[aria-label^="Analy"]', '.toolbar'],
    title: 'Analyse the case',
    body: 'The analysis ranks remedies across your symptoms with the strategy you pick, from sum of symptoms to Kent and Bönninghausen, as a grid, bars or cards. A live preview can sit under any document.',
    keys: [{ keys: 'F8', label: 'open analysis' }, { keys: 'Mod+J', label: 'preview dock' }],
  },
]

interface TourState { open: boolean; step: number; saved: { showTree: boolean; showClipboard: boolean } | null }
export const useTour = create<TourState>(() => ({ open: false, step: 0, saved: null }))

export function startTour() {
  const { showTree, showClipboard } = useApp.getState().layout
  actions.closeDialog()
  actions.setCommandPalette(false)
  useTour.setState({ open: true, step: 0, saved: { showTree, showClipboard } })
}

export function tourGo(step: number) {
  const n = Math.max(0, Math.min(TOUR_STEPS.length - 1, step))
  useTour.setState({ step: n })
}

/** Close the tour, remember it was seen and restore the panes it opened. */
export function endTour(completed: boolean) {
  const { saved } = useTour.getState()
  useTour.setState({ open: false, step: 0, saved: null })
  writeFlag(WELCOME_KEY, completed ? 'done' : 'dismissed')
  if (saved) actions.setLayout(saved)
}

export function shouldAutoStart(): boolean {
  if (readFlag(WELCOME_KEY) != null) return false
  // automated browsers (tests, screenshots) start without the tour unless asked for it
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false
  return true
}

export type Placement = 'right' | 'left' | 'bottom' | 'top' | 'center'

/** Place a card of size w×h next to a target rect inside a viewport, preferring the side with most room. */
export function placeCard(target: { left: number; top: number; right: number; bottom: number } | null, w: number, h: number, vw: number, vh: number, gap = 14): { x: number; y: number; placement: Placement } {
  const clampX = (x: number) => Math.max(12, Math.min(vw - w - 12, x))
  const clampY = (y: number) => Math.max(12, Math.min(vh - h - 12, y))
  if (!target) return { x: clampX((vw - w) / 2), y: clampY((vh - h) / 2), placement: 'center' }
  const room = { right: vw - target.right, left: target.left, bottom: vh - target.bottom, top: target.top }
  const midY = (target.top + target.bottom) / 2 - h / 2
  const midX = (target.left + target.right) / 2 - w / 2
  if (room.right >= w + gap + 12) return { x: target.right + gap, y: clampY(midY), placement: 'right' }
  if (room.left >= w + gap + 12) return { x: target.left - gap - w, y: clampY(midY), placement: 'left' }
  if (room.bottom >= h + gap + 12) return { x: clampX(midX), y: target.bottom + gap, placement: 'bottom' }
  if (room.top >= h + gap + 12) return { x: clampX(midX), y: target.top - gap - h, placement: 'top' }
  // large target (e.g. the document pane): float inside it, near its top right
  return { x: clampX(target.right - w - 24), y: clampY(target.top + 24), placement: 'center' }
}
