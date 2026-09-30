import { runCommand } from '../../commands/registry'
import { actions, selectActiveTab, useApp } from '../../state/store'
import type { FamiliesTab } from '../../state/workspace'
import { analysisTabOf, isAnalysisVisible, openAnalysisFor, targetConsultationId } from '../analysis/ops'
import { familiesIfLoaded, loadFamilies } from './api'
import { requestViewFocus } from './viewState'
import { unionLabel } from './model'

export const FILTER_DIALOG = 'families.filter'
export type FilterMode = 'limit' | 'highlight'

const st = () => useApp.getState()

/**
 * Consultation a family filter applies to: the same target as the analysis commands (the active case,
 * else the visible or most recent analysis tab's), so families.filter and analysis.remedies / clearFilter agree.
 */
export { targetConsultationId }

export function activeFamiliesTab(): FamiliesTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'families' ? t : null
}

/** Open the families tab, optionally revealing a group, and move keyboard focus into it (so Ctrl+F finds in families). */
export function openFamilies(group?: string | null) {
  actions.openTab({ kind: 'families', group: group ?? null })
  const t = activeFamiliesTab()
  if (group !== undefined && t) actions.updateTab<FamiliesTab>(t.id, { group, remedy: null })
  requestViewFocus()
}

function noCase() {
  actions.toast('Open or create a case first: family filters apply to its analysis.', 'info', { label: 'Patients', run: () => runCommand('patients.open') })
}

/**
 * Limit or highlight the analysis of a consultation to the union of groups.
 * Returns false when there is no case or no data.
 */
export function applyFamilyFilter(groupIds: string[], mode: FilterMode, consultationId = targetConsultationId(), opts: { toast?: boolean } = {}): boolean {
  const idx = familiesIfLoaded()
  if (!consultationId || !st().consultations[consultationId]) { noCase(); return false }
  if (!idx || !groupIds.length) return false
  const members = idx.union(groupIds)
  const label = unionLabel(idx, groupIds)
  const groups = [...groupIds]
  if (mode === 'limit') actions.setAnalysis(consultationId, { remedyFilter: members, filterLabel: label, filterGroups: groups })
  else actions.setAnalysis(consultationId, { highlight: members, highlightLabel: label, highlightGroups: groups })
  if (opts.toast !== false) {
    const text = mode === 'limit'
      ? `Analysis limited to ${label} (${members.length} remedies)`
      : `Highlighting ${label} (${members.length} remedies) in the analysis`
    actions.toast(text, 'success', analysisToastAction(consultationId))
  }
  return true
}

/**
 * Toast action after a family filter: none when that case's analysis is the visible tab,
 * "Show analysis" when it is open in another tab, else "Open analysis".
 */
export function analysisToastAction(consultationId: string): { label: string; run: () => void } | undefined {
  if (isAnalysisVisible(consultationId)) return undefined
  return { label: analysisTabOf(consultationId) ? 'Show analysis' : 'Open analysis', run: () => openAnalysisFor(consultationId) }
}

/** Remove the family limit and/or highlight from a consultation's analysis. */
export function clearFamilyFilter(mode: FilterMode | 'both', consultationId = targetConsultationId()) {
  if (!consultationId) return
  // one patch, so a single undo restores both
  actions.setAnalysis(consultationId, {
    ...(mode === 'limit' || mode === 'both' ? { remedyFilter: null, filterLabel: null, filterGroups: null } : {}),
    ...(mode === 'highlight' || mode === 'both' ? { highlight: null, highlightLabel: null, highlightGroups: null } : {}),
  })
}

/** Open the family filter dialog for the target case. */
export function openFilterDialog(props: { groups?: string[]; mode?: FilterMode } = {}) {
  const id = targetConsultationId()
  if (!id) { noCase(); return }
  void loadFamilies().catch(() => { /* the dialog shows the error */ })
  actions.openDialog(FILTER_DIALOG, { consultationId: id, ...props })
}

export function openRemedy(remedyId: number) { actions.openTab({ kind: 'remedy', remedyId }) }

export function hasTargetCase() { return !!targetConsultationId() }
