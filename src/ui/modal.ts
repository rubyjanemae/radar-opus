/**
 * Modality for overlays: dialogs, the command palette, the welcome tour and the case report are
 * `aria-modal="true"` elements portalled outside the app root. While one is open the app root is
 * `inert` (no clicks, no focus, hidden from assistive technology), global shortcuts are suppressed
 * (commands/registry.ts) and focus that escapes is put back into the modal.
 */

const MODAL = '[aria-modal="true"]'

/** The topmost open modal, or null. The app root itself is never one. */
export function activeModal(root: Document = document): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const all = root.querySelectorAll<HTMLElement>(MODAL)
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i]
    if (el.isConnected && !el.closest('[inert]')) return el
  }
  return null
}

export const isModalOpen = () => activeModal() !== null

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

let appRoot: HTMLElement | null = null
/** The last element focused inside the app root while it was not inert. */
let lastAppFocus: HTMLElement | null = null
/** Focus before the app became inert, handed back when the last modal closes and focus was lost. */
let before: HTMLElement | null = null

/** Recompute the app root's `inert` now (Dialog calls this before restoring focus on close). */
export function syncModalInert() {
  if (!appRoot) return
  const modal = activeModal()
  const open = !!modal && !appRoot.contains(modal)
  if (open && !appRoot.inert) {
    const a = document.activeElement
    before = a instanceof HTMLElement && appRoot.contains(a) ? a : lastAppFocus
    appRoot.inert = true
  } else if (!open && appRoot.inert) {
    appRoot.inert = false
    const a = document.activeElement
    const lost = !a || a === document.body || !a.isConnected
    const back = before
    before = null
    if (lost && back?.isConnected) back.focus({ preventScroll: true })
  }
}

/**
 * Make `root` inert while a modal is open, and keep focus inside the open modal. Install once;
 * returns the uninstaller.
 */
export function installModalGuard(root: HTMLElement): () => void {
  appRoot = root
  // children's mount effects (a view focusing its list) ran before this one: start from the current focus
  const a = document.activeElement
  if (a instanceof HTMLElement && root.contains(a)) lastAppFocus = a
  // overlays are portalled straight into <body>: watching its children is enough (and cheap)
  const mo = new MutationObserver(() => syncModalInert())
  mo.observe(document.body, { childList: true })
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as Node | null
    if (t instanceof HTMLElement && !root.inert && root.contains(t)) lastAppFocus = t
    const modal = activeModal()
    if (!modal || !t || modal.contains(t)) return
    // a nested menu or popup portalled from inside the modal (e.g. a context menu) is part of it
    if (t instanceof Element && t.closest('.menu-list')) return
    const first = modal.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? modal).focus({ preventScroll: true })
  }
  document.addEventListener('focusin', onFocusIn)
  syncModalInert()
  return () => {
    mo.disconnect()
    document.removeEventListener('focusin', onFocusIn)
    if (appRoot === root) { root.inert = false; appRoot = null; lastAppFocus = null; before = null }
  }
}
