import { runCommand } from '../../commands/registry'
import { actions, selectActiveConsultation, selectActiveTab, useApp } from '../../state/store'
import type { FamiliesTab } from '../../state/workspace'
import { familiesIfLoaded, loadFamilies } from './api'
import { unionLabel } from './model'

export const FILTER_DIALOG = 'families.filter'
export type FilterMode = 'limit' | 'highlight'

const st = () => useApp.getState()

/** Consultation a family filter applies to: the active analysis tab's case, else the active case, else the last analysis tab's. */
export function targetConsultationId(): string | null {
  const s = st()
  const t = selectActiveTab(s)
  if (t?.kind === 'analysis' && s.consultations[t.consultationId]) return t.consultationId
  const c = selectActiveConsultation(s)
  if (c) return c.id
  for (let i = s.tabs.length - 1; i >= 0; i--) {
    const x = s.tabs[i]
    if (x.kind === 'analysis' && s.consultations[x.consultationId]) return x.consultationId
  }
  return null
}

export function activeFamiliesTab(): FamiliesTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'families' ? t : null
}

/** Open the families tab, optionally revealing a group. */
export function openFamilies(group?: string | null) {
  actions.openTab({ kind: 'families', group: group ?? null })
  if (group !== undefined) {
    const t = activeFamiliesTab()
    if (t) actions.updateTab<FamiliesTab>(t.id, { group })
  }
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
    actions.toast(text, 'success', { label: 'Open analysis', run: () => runCommand('analysis.open') })
  }
  return true
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
