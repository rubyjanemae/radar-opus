import { create } from 'zustand'

/**
 * The highlighted remedy of each repertory tab (the yellow marks and the highlight bar). Outside
 * the case store: it is a reading aid, not case data, and is not undone or saved.
 */
const useHighlightStore = create<{ byTab: Record<string, number> }>(() => ({ byTab: {} }))

export const useHighlight = (tabId: string): number | null => useHighlightStore(s => s.byTab[tabId] ?? null)
export const getHighlight = (tabId: string): number | null => useHighlightStore.getState().byTab[tabId] ?? null
export function setHighlight(tabId: string, remedyId: number | null) {
  useHighlightStore.setState(s => {
    if ((s.byTab[tabId] ?? null) === remedyId) return s
    const byTab = { ...s.byTab }
    if (remedyId == null) delete byTab[tabId]
    else byTab[tabId] = remedyId
    return { byTab }
  })
}

/** "Remedies of rubric" (Alt+R) asks the book of a tab to open its remedy menu at the current row. */
const menuRequests = new Map<string, () => void>()
export function onRemedyMenuRequest(tabId: string, fn: () => void): () => void {
  menuRequests.set(tabId, fn)
  return () => { if (menuRequests.get(tabId) === fn) menuRequests.delete(tabId) }
}
export function requestRemedyMenu(tabId: string): boolean {
  const fn = menuRequests.get(tabId)
  fn?.()
  return !!fn
}
