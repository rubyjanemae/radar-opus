import { Suspense, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { actions, useApp } from '../state/store'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Dialog, DialogKindContext } from '../ui/Dialog'
import { getDialog } from './dialogs'

type QueuedKey = Pick<KeyboardEventInit, 'key' | 'code' | 'shiftKey'>
/** Keys typed while a dialog loads that are handed to it once it is open (text, Enter, Backspace, arrows, Tab). */
const TYPE_AHEAD = new Set(['Enter', 'Backspace', 'Delete', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])

/**
 * Replay keys typed during loading into the dialog that now has focus, in order: each is dispatched
 * as a keydown (the dialog's own handlers run) and, for text not handled there, inserted into the
 * focused field as typing would, one key per task. Stops if focus is no longer inside a dialog.
 */
export async function replayTypeAhead(keys: QueuedKey[]) {
  for (const k of keys) {
    // one task per key, as real typing: the dialog re-renders with the text so far before the next key
    await new Promise(resolve => setTimeout(resolve, 0))
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || !el.closest('[role="dialog"]')) return
    const handled = !el.dispatchEvent(new KeyboardEvent('keydown', { ...k, bubbles: true, cancelable: true }))
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    if (!handled && field && k.key && k.key.length === 1) document.execCommand('insertText', false, k.key)
  }
}

/**
 * Shown while a lazily registered dialog's chunk loads (usually a few ms: most are preloaded in
 * idle time). Modal like the dialog itself, so the workspace is inert and its shortcuts do not fire
 * underneath; Esc cancels. Keys typed meanwhile (F2 then a chapter name) are kept and handed to the
 * dialog when it opens. The card is delayed by CSS so a fast load never flashes it.
 */
function DialogLoading() {
  const queue = useRef<QueuedKey[]>([])
  useEffect(() => () => {
    const keys = queue.current
    // after the dialog's own mount effects have focused its first field
    if (keys.length) void replayTypeAhead(keys)
  }, [])
  return createPortal(
    <div className="dialog-backdrop dialog-loading" role="dialog" aria-modal="true" aria-busy="true" aria-label="Loading dialog" tabIndex={-1}
      ref={el => { el?.focus({ preventScroll: true }) }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); queue.current = []; actions.closeDialog(); return }
        if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return
        if (e.key.length === 1 || TYPE_AHEAD.has(e.key)) {
          e.preventDefault(); e.stopPropagation()
          queue.current.push({ key: e.key, code: e.code, shiftKey: e.shiftKey })
        }
      }}>
      <div className="dialog-loading-card"><span className="spin-dot" aria-hidden="true" />Loading…</div>
    </div>,
    document.body,
  )
}

/** Renders the open dialog. An unknown kind is reported and cleared; a crashing dialog shows its error in a dialog. */
export function DialogHost() {
  const dialog = useApp(s => s.dialog)
  const C = dialog ? getDialog(dialog.kind) : undefined

  useEffect(() => {
    if (!dialog || C) return
    console.warn(`DialogHost: no dialog registered for "${dialog.kind}"`)
    actions.closeDialog()
  }, [dialog, C])

  if (!dialog || !C) return null
  return (
    <ErrorBoundary
      label="This dialog"
      resetKey={dialog}
      fallback={error => (
        <Dialog title="Something went wrong" onClose={() => actions.closeDialog()}
          footer={<button className="btn btn-primary" onClick={() => actions.closeDialog()}>Close</button>}>
          <div className="error-state" role="alert" style={{ padding: 0 }}>
            <h3>This dialog hit an error</h3>
            <pre>{error.message}</pre>
          </div>
        </Dialog>
      )}
    >
      <DialogKindContext.Provider value={dialog.kind}>
        <Suspense fallback={<DialogLoading />}>
          <C {...(dialog.props ?? {})} onClose={() => actions.closeDialog()} />
        </Suspense>
      </DialogKindContext.Provider>
    </ErrorBoundary>
  )
}
