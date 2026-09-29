/**
 * Pane focus cycling (Ctrl+F6 / Ctrl+Shift+F6): navigator → document → analysis dock → clipboards.
 * Each pane remembers the element that last had focus inside it so cycling returns you where you were.
 */

export interface PaneDef { id: string; label: string; selector: string }

export const PANES: PaneDef[] = [
  { id: 'navigator', label: 'Navigator', selector: '.pane-left' },
  { id: 'document', label: 'Document', selector: '.pane-center .tab-content' },
  { id: 'dock', label: 'Analysis preview', selector: '.analysis-dock' },
  { id: 'clipboard', label: 'Clipboards', selector: '.pane-right' },
]

/** Next index in a ring, skipping nothing; `current` -1 means "no pane focused". */
export function nextIndex(current: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1
  if (current < 0) return dir === 1 ? 0 : count - 1
  return (current + dir + count) % count
}

const lastFocus = new Map<string, WeakRef<HTMLElement>>()

/** Panes currently rendered, in order. */
export function visiblePanes(root: ParentNode = document): { def: PaneDef; el: HTMLElement }[] {
  const out: { def: PaneDef; el: HTMLElement }[] = []
  for (const def of PANES) {
    const el = root.querySelector<HTMLElement>(def.selector)
    if (el && el.getClientRects().length !== 0) out.push({ def, el })
  }
  return out
}

export function paneOf(target: Element | null, root: ParentNode = document): PaneDef | null {
  if (!target) return null
  for (const def of PANES) {
    const el = root.querySelector(def.selector)
    if (el?.contains(target)) return def
  }
  return null
}

/** Remember the focused element of its pane (install once with a focusin listener). */
export function trackFocus(e: FocusEvent) {
  const t = e.target as HTMLElement | null
  if (!t || !(t instanceof HTMLElement)) return
  const p = paneOf(t)
  if (p) lastFocus.set(p.id, new WeakRef(t))
}

const FOCUSABLE = [
  '[role="treeitem"][tabindex="0"]', '[role="option"][tabindex="0"]', '[role="row"][tabindex="0"]',
  '[tabindex="0"]', 'input:not([disabled]):not([type="hidden"])', 'textarea:not([disabled])', 'select:not([disabled])',
  'button:not([disabled])', 'a[href]',
].join(',')

function isFocusable(el: HTMLElement) {
  return el.isConnected && !el.closest('[inert],[hidden]') && el.getClientRects().length > 0
}

/** Best element to focus when a pane is entered. */
export function focusTarget(pane: HTMLElement, id: string): HTMLElement {
  const remembered = lastFocus.get(id)?.deref()
  if (remembered && pane.contains(remembered) && isFocusable(remembered)) return remembered
  // prefer a scroll container that handles keys (list views) and selected items
  for (const sel of ['[data-pane-focus]', '[role="tree"][tabindex], [role="listbox"][tabindex], [role="grid"][tabindex]', '[role="option"][tabindex="0"], [role="treeitem"][tabindex="0"], [role="row"][tabindex="0"]', '[aria-selected="true"][tabindex]']) {
    const el = pane.querySelector<HTMLElement>(sel)
    if (el && isFocusable(el) && el.tabIndex >= 0) return el
  }
  for (const el of pane.querySelectorAll<HTMLElement>(FOCUSABLE)) if (isFocusable(el)) return el
  if (!pane.hasAttribute('tabindex')) pane.setAttribute('tabindex', '-1')
  return pane
}

/** Move focus to the next or previous visible pane. Returns the pane focused. */
export function cyclePane(dir: 1 | -1, root: Document = document): PaneDef | null {
  const panes = visiblePanes(root)
  if (!panes.length) return null
  const cur = paneOf(root.activeElement)
  const i = cur ? panes.findIndex(p => p.def.id === cur.id) : -1
  const next = panes[nextIndex(i, panes.length, dir)]
  const target = focusTarget(next.el, next.def.id)
  target.focus({ preventScroll: false })
  next.el.classList.remove('ws-pane-flash')
  void next.el.offsetWidth // restart the animation
  next.el.classList.add('ws-pane-flash')
  window.setTimeout(() => next.el.classList.remove('ws-pane-flash'), 700)
  announce(`${next.def.label} pane`)
  return next.def
}

/** Polite screen-reader announcement. */
export function announce(text: string) {
  let el = document.getElementById('ws-live')
  if (!el) {
    el = document.createElement('div')
    el.id = 'ws-live'
    el.className = 'sr-only'
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  el.textContent = ''
  window.setTimeout(() => { el!.textContent = text }, 30)
}
