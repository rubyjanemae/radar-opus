import { focusIsLost } from '../features/workspace/panes'
import { focusDocumentWhenReady } from './TabHost'

/**
 * Window chrome (the toolbar, the status strip links, the clipboard strip) acts on the active document
 * the way a desktop app's toolbar does: it does not keep the keyboard. After a chrome control ran its
 * action, focus goes (back) to the document when it is still on the chrome or was lost (the control
 * disabled or removed itself); a dialog or menu the action opened keeps it.
 */
export function returnFocusFromChrome(region: string, prefer: HTMLElement | null = null) {
  const a = document.activeElement
  if (focusIsLost() || (a instanceof Element && a.closest(region))) focusDocumentWhenReady(prefer)
}

/** onMouseDown for chrome buttons: a click does not move focus off the document. */
export const keepFocus = (e: { button: number; preventDefault(): void }) => { if (e.button === 0) e.preventDefault() }

/** Targets inside chrome that take focus themselves (fields, enabled buttons, links, roving items, grips). */
const FOCUSABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), a[href], button:not(:disabled), [tabindex], [role="separator"][aria-valuenow]'

/**
 * onMouseDown for a chrome region (the toolbar band, the desktop, the clipboard strip, the status strip):
 * a click on its background, a separator or a dimmed button does nothing and leaves the keyboard where it
 * was (a browser would move focus to <body>). `onlySelf`: only clicks on the region's own background count.
 */
export function chromeBackgroundMouseDown(e: { button: number; target: EventTarget | null; currentTarget: EventTarget; preventDefault(): void }, onlySelf = false) {
  if (e.button !== 0) return
  const t = e.target
  if (!(t instanceof Element)) return
  if (onlySelf ? t !== e.currentTarget : t.closest(FOCUSABLE)) return
  e.preventDefault()
}
