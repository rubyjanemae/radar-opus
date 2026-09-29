/** Selection of the families view, shared with commands (the view is the single writer). */
export interface ViewSelection { tabId: string | null; group: string | null; remedy: number | null }

let sel: ViewSelection = { tabId: null, group: null, remedy: null }
export function setViewSelection(s: ViewSelection) { sel = s }
export function viewSelection(): ViewSelection { return sel }

export type ViewCommand = 'focusSearch' | 'expandAll' | 'collapseAll' | 'focusTree'
const subs = new Set<(c: ViewCommand) => void>()
/** Commands → mounted families view. */
export const viewBus = {
  on(fn: (c: ViewCommand) => void) { subs.add(fn); return () => { subs.delete(fn) } },
  emit(c: ViewCommand) { subs.forEach(fn => fn(c)) },
}
