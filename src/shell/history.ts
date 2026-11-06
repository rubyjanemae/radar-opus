import { useApp } from '../state/store'
import type { MenuItem } from '../ui/Menu'
import { goToRef, refShortCaps } from '../features/repertory/ops'

/** History (toolbar button, View menu): the rubrics read or acted on most recently, across repertories, by their
 *  RadarOpus path (chapter and first level in capitals, as the breadcrumb and the analysis show it). */
export function historyItems(): MenuItem[] {
  const recent = useApp.getState().recentRubrics.slice(0, 20)
  if (!recent.length) return [{ label: 'No history yet', disabled: true }]
  return recent.map(ref => ({ label: refShortCaps(ref), run: () => void goToRef(ref) }))
}
