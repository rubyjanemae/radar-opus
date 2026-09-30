/*
 * Commands → mounted families view. The view's selection (group, remedy) lives on the FamiliesTab in
 * the store, so commands read it from there; only one-shot view actions travel through this bus.
 */
export type ViewCommand = 'focusSearch' | 'expandAll' | 'collapseAll' | 'focusTree'
const subs = new Set<(c: ViewCommand) => void>()
export const viewBus = {
  on(fn: (c: ViewCommand) => void) { subs.add(fn); return () => { subs.delete(fn) } },
  emit(c: ViewCommand) { subs.forEach(fn => fn(c)) },
}

/*
 * Focus request (Ctrl+5): the view may not be mounted yet when the command runs (TabHost remounts
 * on tab switch), so the request stays pending until a view takes it.
 */
let focusPending = false
export function requestViewFocus() {
  focusPending = true
  if (subs.size) viewBus.emit('focusTree')
}
/** Consume a pending focus request (true when there was one). */
export function takeViewFocus(): boolean {
  const p = focusPending
  focusPending = false
  return p
}
