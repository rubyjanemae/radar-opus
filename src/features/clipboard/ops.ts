import { create } from 'zustand'
import type { Catalog } from '../../data/catalog'
import type { RubricRef } from '../../data/types'
import type { Clipboard, Symptom, Weight } from '../../engine/model'
import { actions, selectActiveClipboard, selectActiveConsultation, selectActiveTab, useApp, MAX_CLIPBOARDS } from '../../state/store'
import { combinedSize, moveIdsBy, parseRubricRef, sortSymptomIds } from './logic'
import type { RubricFacts, SortMode } from './logic'

/**
 * Clipboard operations shared by the panel, its context menus and the registered commands.
 * Everything acts on the active clipboard and the current symptom selection.
 */

/** Transient panel UI state (not persisted, not undoable). */
interface PanelUi {
  cursorId: string | null
  anchorId: string | null
  renamingId: string | null
  /** Waiting for a group letter after G. */
  groupPending: boolean
  /** Bumped to ask the panel to take keyboard focus. */
  focusSeq: number
}
export const usePanelUi = create<PanelUi>(() => ({ cursorId: null, anchorId: null, renamingId: null, groupPending: false, focusSeq: 0 }))
export const setPanelUi = (p: Partial<PanelUi>) => usePanelUi.setState(p)

export const PANEL_SCOPE = '.cbp'
export const LIST_SCOPE = '.cbp-list'

let catalogRef: Catalog | null = null
export function setClipboardCatalog(c: Catalog) { catalogRef = c }

const st = () => useApp.getState()

export function activeClipboard(): Clipboard | null { return selectActiveClipboard(st()) }

/** Selected symptom ids of the active clipboard, in list order. */
export function selectedIds(): string[] {
  const cb = activeClipboard()
  if (!cb) return []
  const sel = new Set(st().selectedSymptomIds)
  return cb.symptoms.filter(s => sel.has(s.id)).map(s => s.id)
}
export function selectedSymptoms(): Symptom[] {
  const cb = activeClipboard()
  if (!cb) return []
  const sel = new Set(st().selectedSymptomIds)
  return cb.symptoms.filter(s => sel.has(s.id))
}
export const hasSelection = () => selectedIds().length > 0

/** Selection, falling back to the cursor row. */
function targetIds(): string[] {
  const ids = selectedIds()
  if (ids.length) return ids
  const cur = usePanelUi.getState().cursorId
  const cb = activeClipboard()
  return cur && cb?.symptoms.some(s => s.id === cur) ? [cur] : []
}
export const hasTarget = () => targetIds().length > 0

export function setWeight(w: Weight) {
  const cb = activeClipboard()
  const ids = targetIds()
  if (cb && ids.length) actions.updateSymptoms(cb.id, ids, { weight: w })
}

export type Flag = 'eliminatory' | 'exclusive' | 'causal'
/** Toggle a qualification on the selection: on for all unless all already have it. Eliminative and excluding are mutually exclusive. */
export function toggleFlag(flag: Flag) {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length) return
  const on = !cb.symptoms.filter(s => ids.includes(s.id)).every(s => s[flag])
  const patch: Partial<Symptom> = { [flag]: on }
  if (on && flag === 'eliminatory') patch.exclusive = false
  if (on && flag === 'exclusive') patch.eliminatory = false
  actions.updateSymptoms(cb.id, ids, patch)
}
export function flagState(flag: Flag): boolean {
  const syms = selectedSymptoms()
  return syms.length > 0 && syms.every(s => s[flag])
}

export function setGroup(letter: string | null) {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length) return
  actions.updateSymptoms(cb.id, ids, { group: letter ? letter.toLowerCase() : null })
}

export function removeSelected() {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length) return
  const items = cb.symptoms.map((symptom, index) => ({ symptom, index })).filter(x => ids.includes(x.symptom.id))
  const last = items[items.length - 1].index
  const next = cb.symptoms.slice(last + 1).find(s => !ids.includes(s.id)) ?? [...cb.symptoms.slice(0, items[0].index)].reverse().find(s => !ids.includes(s.id))
  const refocus = focusWasInPanel()
  actions.removeSymptoms(cb.id, ids)
  setPanelUi({ cursorId: next?.id ?? null, anchorId: next?.id ?? null })
  actions.setSelectedSymptoms(next ? [next.id] : [])
  // the focused row is gone: keep keyboard focus in the list (on the new cursor row, or the list itself)
  if (refocus) requestListFocus()
  actions.toast(items.length === 1 ? 'Symptom removed' : `${items.length} symptoms removed`, 'info', {
    label: 'Undo',
    run: () => {
      actions.insertSymptoms(cb.id, items)
      actions.setSelectedSymptoms(items.map(i => i.symptom.id))
    },
  })
}

export function moveSelected(delta: -1 | 1) {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length) return
  actions.reorderSymptoms(cb.id, moveIdsBy(cb.symptoms.map(s => s.id), ids, delta))
}

export function canMove(delta: -1 | 1): boolean {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length) return false
  const order = cb.symptoms.map(s => s.id)
  const next = moveIdsBy(order, ids, delta)
  return next.some((id, i) => id !== order[i])
}

export function selectAll() {
  const cb = activeClipboard()
  if (!cb) return
  actions.setSelectedSymptoms(cb.symptoms.map(s => s.id))
}

export function combine(mode: 'union' | 'intersection') {
  const cb = activeClipboard()
  const ids = selectedIds()
  if (!cb || ids.length < 2) return
  actions.combineSymptoms(cb.id, ids, mode)
  const after = activeClipboard()
  const merged = after?.symptoms.find(s => !cb.symptoms.some(o => o.id === s.id))
  if (merged) { actions.setSelectedSymptoms([merged.id]); setPanelUi({ cursorId: merged.id, anchorId: merged.id }) }
}
export const canCombine = () => selectedIds().length >= 2

export function split() {
  const cb = activeClipboard()
  if (!cb) return
  const targets = targetIds().filter(id => (cb.symptoms.find(s => s.id === id)?.rubrics.length ?? 0) > 1)
  for (const id of targets) actions.splitSymptom(cb.id, id)
  actions.setSelectedSymptoms([])
}
export function canSplit() {
  const cb = activeClipboard()
  const ids = targetIds()
  return !!cb && cb.symptoms.some(s => ids.includes(s.id) && s.rubrics.length > 1)
}

export function transferSelected(toId: string, copy: boolean) {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length || toId === cb.id) return
  actions.transferSymptoms(cb.id, toId, ids, copy)
  const target = selectActiveConsultation(st())?.clipboards.find(c => c.id === toId)
  actions.toast(`${ids.length} symptom${ids.length === 1 ? '' : 's'} ${copy ? 'copied' : 'moved'} to ${target?.name ?? 'clipboard'}`, 'success')
  if (!copy) actions.setSelectedSymptoms([])
}

/** Facts for sorting, from the loaded repertories. */
export function rubricFacts(ref: RubricRef): RubricFacts | null {
  const c = catalogRef
  const r = c?.resolve(ref)
  if (!c || !r) return null
  return {
    repertoryOrder: c.repertoryInfos.findIndex(i => i.abbrev === r.rep.abbrev),
    chapter: r.rep.chapterOf(r.index),
    index: r.index,
    path: r.rep.path(r.index, ', '),
    size: r.rep.remedyCount(r.index),
  }
}

export async function sortActive(mode: SortMode) {
  const cb = activeClipboard()
  if (!cb || cb.symptoms.length < 2) return
  if (catalogRef) await Promise.all([...new Set(cb.symptoms.map(s => parseRubricRef(s.rubrics[0]).repertory))].map(r => catalogRef!.loadRepertory(r).catch(() => null)))
  const facts = (ref: RubricRef) => {
    const f = rubricFacts(ref)
    if (!f || mode !== 'size') return f
    const sym = cb.symptoms.find(s => s.rubrics[0] === ref)
    return sym && sym.rubrics.length > 1 ? { ...f, size: symptomSize(sym) ?? f.size } : f
  }
  actions.reorderSymptoms(cb.id, sortSymptomIds(cb.symptoms, mode, facts))
}

/** Remedy count of a symptom (combined symptoms merge their rubrics); null while repertories load. */
export function symptomSize(s: Symptom): number | null {
  const c = catalogRef
  if (!c) return null
  if (s.rubrics.length === 1) {
    const r = c.resolve(s.rubrics[0])
    return r ? r.rep.remedyCount(r.index) : null
  }
  const parts = s.rubrics.map(ref => {
    const r = c.resolve(ref)
    if (!r) return null
    const ids: number[] = []
    r.rep.forEachRemedy(r.index, id => ids.push(id))
    return ids
  })
  if (parts.some(p => !p)) return null
  return combinedSize(parts, s.combine)
}

/** Show a rubric in a repertory tab: navigate the active one, reuse another of the same book, or open a new tab. */
export function openRubric(ref: RubricRef) {
  const { repertory, index } = parseRubricRef(ref)
  const s = st()
  const tab = selectActiveTab(s)
  if (tab?.kind === 'repertory' && tab.repertory === repertory) { actions.navigateRubric(tab.id, index); return }
  const other = s.tabs.find(t => t.kind === 'repertory' && t.repertory === repertory)
  if (other) { actions.activateTab(other.id); actions.navigateRubric(other.id, index); return }
  actions.openTab({ kind: 'repertory', repertory, rubric: index, back: [], forward: [] }, { reuse: false })
}

export function openCursorRubric() {
  const cb = activeClipboard()
  const id = usePanelUi.getState().cursorId ?? selectedIds()[0]
  const sym = cb?.symptoms.find(s => s.id === id)
  if (sym) openRubric(sym.rubrics[0])
}

export function clipboards(): Clipboard[] { return selectActiveConsultation(st())?.clipboards ?? [] }

export function selectClipboardAt(i: number) {
  const cb = clipboards()[i]
  if (cb) { actions.setActiveClipboard(cb.id); setPanelUi({ cursorId: null, anchorId: null }) }
}
export function cycleClipboard(d: number) {
  const list = clipboards()
  if (list.length < 2) return
  const cur = list.findIndex(c => c.id === activeClipboard()?.id)
  selectClipboardAt((cur + d + list.length) % list.length)
}

export function newClipboard() {
  const id = actions.addClipboard()
  if (id) setPanelUi({ renamingId: id, cursorId: null })
  else if (clipboards().length >= MAX_CLIPBOARDS) actions.toast(`A case can hold up to ${MAX_CLIPBOARDS} clipboards`, 'error')
}

export function startRename(id?: string) {
  const target = id ?? activeClipboard()?.id
  if (!target) return
  if (!st().layout.showClipboard) actions.setLayout({ showClipboard: true })
  setPanelUi({ renamingId: target })
}

export function clearClipboard(id?: string) {
  const s = st()
  const c = selectActiveConsultation(s)
  const cb = c?.clipboards.find(x => x.id === (id ?? activeClipboard()?.id))
  if (!cb || !cb.symptoms.length) return
  const saved = cb.symptoms
  actions.clearClipboard(cb.id)
  actions.setSelectedSymptoms([])
  actions.toast(`${cb.name} cleared`, 'info', { label: 'Undo', run: () => actions.insertSymptoms(cb.id, saved.map((symptom, index) => ({ symptom, index }))) })
}

export function deleteClipboard(id?: string) {
  const c = selectActiveConsultation(st())
  const list = clipboards()
  const index = list.findIndex(x => x.id === (id ?? activeClipboard()?.id))
  const cb = list[index]
  if (!c || !cb || list.length <= 1) return
  const inAnalysis = c.analysis.clipboardIds.includes(cb.id)
  const wasActive = activeClipboard()?.id === cb.id
  actions.deleteClipboard(cb.id)
  actions.toast(`${cb.name} deleted`, 'info', {
    label: 'Undo',
    run: () => {
      // targeted restore: later edits stay untouched
      if (!actions.restoreClipboard(c.id, cb, index, inAnalysis)) {
        actions.toast(`${cb.name} could not be restored: the case already has ${MAX_CLIPBOARDS} clipboards`, 'error')
        return
      }
      if (wasActive && st().activeConsultationId === c.id) actions.setActiveClipboard(cb.id)
    },
  })
}

/** Empty every clipboard of the active case in one undoable step. */
export function clearAllClipboards() {
  const list = clipboards().filter(cb => cb.symptoms.length)
  if (!list.length) return
  const saved = list.map(cb => ({ id: cb.id, items: cb.symptoms.map((symptom, index) => ({ symptom, index })) }))
  const n = list.reduce((a, cb) => a + cb.symptoms.length, 0)
  actions.clearClipboards(list.map(cb => cb.id))
  actions.setSelectedSymptoms([])
  setPanelUi({ cursorId: null, anchorId: null })
  actions.toast(`All clipboards cleared (${n} symptom${n === 1 ? '' : 's'})`, 'info', {
    label: 'Undo',
    run: () => { for (const x of saved) actions.insertSymptoms(x.id, x.items) },
  })
}
export const hasAnySymptoms = () => clipboards().some(cb => cb.symptoms.length > 0)

export function toggleInAnalysis(id: string) {
  const c = selectActiveConsultation(st())
  if (!c) return
  const ids = c.analysis.clipboardIds
  const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  actions.setAnalysis(c.id, { clipboardIds: c.clipboards.map(cb => cb.id).filter(x => next.includes(x)) })
}

/** Whether keyboard focus is in the clipboard pane (or a menu opened from it, or nowhere). */
function focusWasInPanel(): boolean {
  if (typeof document === 'undefined') return false
  const a = document.activeElement
  return !a || a === document.body || !!a.closest?.(`${PANEL_SCOPE}, .menu-list`)
}

/** Ask the list to focus its cursor row (or itself when empty) without changing the layout. */
export function requestListFocus() {
  if (!st().layout.showClipboard) return
  usePanelUi.setState(s => ({ focusSeq: s.focusSeq + 1 }))
}

/** Show the clipboard pane and move keyboard focus into it. */
export function focusPanel() {
  if (!st().layout.showClipboard) actions.setLayout({ showClipboard: true })
  usePanelUi.setState(s => ({ focusSeq: s.focusSeq + 1 }))
}

export function startGroupPrompt() {
  if (!targetIds().length) return
  focusPanel()
  setPanelUi({ groupPending: true })
}

export function editNote() {
  const cb = activeClipboard()
  const ids = targetIds()
  if (!cb || !ids.length) return
  actions.openDialog('clipboard.note', { clipboardId: cb.id, symptomIds: ids })
}

export function newCase() { actions.openDialog('clipboard.newCase') }
