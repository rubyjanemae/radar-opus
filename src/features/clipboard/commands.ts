import type { Catalog } from '../../data/catalog'
import type { Command } from '../../commands/registry'
import { registerCommands } from '../../commands/registry'
import { registerDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import type { Weight } from '../../engine/model'
import { selectActiveConsultation, useApp, MAX_CLIPBOARDS } from '../../state/store'
import { SORT_LABELS } from './logic'
import type { SortMode } from './logic'
import * as ops from './ops'
import { NewCaseDialog, NoteDialog } from './dialogs'

const st = () => useApp.getState()
const hasCase = () => !!selectActiveConsultation(st())
const hasSymptoms = () => (ops.activeClipboard()?.symptoms.length ?? 0) > 0
const INTENSITY = ['0 – ignore', '1', '2', '3', '4 – strongest']

export function register(catalog: Catalog) {
  ops.setClipboardCatalog(catalog)
  registerDialog('clipboard.note', NoteDialog as unknown as DialogComponent)
  registerDialog('clipboard.newCase', NewCaseDialog as unknown as DialogComponent)

  const cmds: Command[] = [
    { id: 'clipboard.newCase', title: 'New case…', category: 'Case', keywords: 'patient consultation create', run: ops.newCase },
    { id: 'clipboard.new', title: 'New clipboard', category: 'Case', enabled: () => hasCase() && ops.clipboards().length < MAX_CLIPBOARDS, run: ops.newClipboard },
    { id: 'clipboard.next', title: 'Next clipboard', category: 'Case', keys: ['Mod+]'], enabled: () => ops.clipboards().length > 1, run: () => ops.cycleClipboard(1) },
    { id: 'clipboard.prev', title: 'Previous clipboard', category: 'Case', keys: ['Mod+['], enabled: () => ops.clipboards().length > 1, run: () => ops.cycleClipboard(-1) },
    { id: 'clipboard.rename', title: 'Rename clipboard…', category: 'Case', enabled: hasCase, run: () => ops.startRename() },
    { id: 'clipboard.clear', title: 'Clear clipboard', category: 'Case', enabled: hasSymptoms, run: () => ops.clearClipboard() },
    { id: 'clipboard.clearAll', title: 'Clear all clipboards', category: 'Case', enabled: ops.hasAnySymptoms, run: ops.clearAllClipboards, keywords: 'empty remove symptoms' },
    { id: 'clipboard.delete', title: 'Delete clipboard', category: 'Case', enabled: () => ops.clipboards().length > 1, run: () => ops.deleteClipboard() },
    { id: 'clipboard.selectAll', title: 'Select all symptoms', category: 'Edit', keys: ['Mod+A'], scope: ops.PANEL_SCOPE, enabled: hasCase, run: ops.selectAll },
    { id: 'clipboard.deleteSelected', title: 'Remove selected symptoms', category: 'Edit', keys: ['Delete', 'Backspace'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, run: ops.removeSelected },
    { id: 'view.clipboardsOnly', title: 'Show clipboards', category: 'View', keys: ['F7'], run: ops.focusPanel, keywords: 'symptoms focus' },

    { id: 'symptom.combineUnion', title: 'Combine symptoms (union)', category: 'Case', enabled: ops.canCombine, run: () => ops.combine('union'), keywords: 'or merge' },
    { id: 'symptom.combineIntersection', title: 'Combine symptoms (intersection)', category: 'Case', enabled: ops.canCombine, run: () => ops.combine('intersection'), keywords: 'and merge' },
    { id: 'symptom.split', title: 'Split combined symptom', category: 'Case', enabled: ops.canSplit, run: ops.split },
    ...([0, 1, 2, 3, 4] as Weight[]).map((w): Command => ({
      id: `symptom.weight.${w}`, title: `Intensity ${INTENSITY[w]}`, category: 'Case', keys: [String(w)], scope: ops.LIST_SCOPE, keywords: 'weight',
      enabled: ops.hasTarget, checked: () => { const s = ops.selectedSymptoms(); return s.length > 0 && s.every(x => x.weight === w) }, run: () => ops.setWeight(w),
    })),
    { id: 'symptom.eliminatory', title: 'Eliminative', category: 'Case', keys: ['E'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, checked: () => ops.flagState('eliminatory'), run: () => ops.toggleFlag('eliminatory'), keywords: 'qualification eliminate' },
    { id: 'symptom.exclusive', title: 'Excluding', category: 'Case', keys: ['X'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, checked: () => ops.flagState('exclusive'), run: () => ops.toggleFlag('exclusive'), keywords: 'qualification exclusive exclude' },
    { id: 'symptom.causal', title: 'Causal', category: 'Case', keys: ['C'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, checked: () => ops.flagState('causal'), run: () => ops.toggleFlag('causal'), keywords: 'qualification causation never well since' },
    { id: 'symptom.group', title: 'Assign group…', category: 'Case', keys: ['G'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, run: ops.startGroupPrompt },
    { id: 'symptom.ungroup', title: 'Remove from group', category: 'Case', enabled: () => ops.selectedSymptoms().some(s => s.group), run: () => ops.setGroup(null) },
    { id: 'symptom.note', title: 'Edit symptom note…', category: 'Case', keys: ['N'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, run: ops.editNote },
    { id: 'symptom.moveUp', title: 'Move symptom up', category: 'Case', keys: ['Mod+ArrowUp'], scope: ops.LIST_SCOPE, enabled: () => ops.canMove(-1), run: () => ops.moveSelected(-1) },
    { id: 'symptom.moveDown', title: 'Move symptom down', category: 'Case', keys: ['Mod+ArrowDown'], scope: ops.LIST_SCOPE, enabled: () => ops.canMove(1), run: () => ops.moveSelected(1) },
    { id: 'symptom.open', title: 'Open rubric in repertory', category: 'Case', keys: ['Enter'], scope: ops.LIST_SCOPE, enabled: ops.hasTarget, run: ops.openCursorRubric },
    ...(Object.keys(SORT_LABELS) as SortMode[]).map((m): Command => ({
      id: `clipboard.sort.${m}`, title: `Sort symptoms: ${SORT_LABELS[m]}`, category: 'Case', enabled: () => (ops.activeClipboard()?.symptoms.length ?? 0) > 1, run: () => ops.sortActive(m),
    })),
    ...Array.from({ length: MAX_CLIPBOARDS }, (_, i): Command => ({
      id: `clipboard.select.${i + 1}`, title: `Clipboard ${i + 1}`, category: 'Case', keys: i < 9 ? [`Alt+${i + 1}`] : undefined, allowInInput: true,
      enabled: () => ops.clipboards().length > i, checked: () => ops.clipboards()[i]?.id === ops.activeClipboard()?.id,
      run: () => ops.selectClipboardAt(i), keywords: 'switch default',
    })),
  ]
  registerCommands(cmds)
}
