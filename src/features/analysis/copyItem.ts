import { actions } from '../../state/store'

/**
 * Edit › Copy in the analysis window acts on the item under the grid's cursor: a symptom line copies its
 * text with the remedies the grid shows for it, a cell or remedy column its remedy, a clipboard bar its
 * symptoms. "Copy symptom text only" copies the symptom text alone. With no cursor the whole analysis is copied.
 * The main grid registers its cursor here; it stays while the menu bar has the focus.
 */
export interface CopyItem {
  /** Edit › Copy. */
  full: string
  /** Edit › Copy symptom text only (null: the item has no symptom text). */
  text: string | null
  /** Toast after copying ("Copied symptom with 43 remedies"). */
  what: string
}

interface Entry { el: () => HTMLElement | null; get: () => CopyItem | null }
const grids = new Set<Entry>()

/** A main grid's cursor item (`el` is the grid: only a visible one counts); returns the function that unregisters it. */
export function setCopyCursor(el: () => HTMLElement | null, get: () => CopyItem | null): () => void {
  const e: Entry = { el, get }
  grids.add(e)
  return () => { grids.delete(e) }
}

export function copyCursor(): CopyItem | null {
  for (const e of grids) {
    const el = e.el()
    // analysis tabs in the background stay mounted but hidden
    if (el?.isConnected && el.getClientRects().length) return e.get()
  }
  return null
}

export async function copyItem(textOnly: boolean): Promise<boolean> {
  const it = copyCursor()
  if (!it) return false
  const t = textOnly ? it.text : it.full
  if (t === null) return false
  try {
    await navigator.clipboard.writeText(t)
    actions.toast(textOnly ? 'Copied symptom text' : it.what, 'success')
  } catch {
    actions.toast('Copy failed: the browser did not allow access to the clipboard', 'error')
  }
  return true
}
