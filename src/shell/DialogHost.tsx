import { useEffect } from 'react'
import { actions, useApp } from '../state/store'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Dialog } from '../ui/Dialog'
import { getDialog } from './dialogs'

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
      <C {...(dialog.props ?? {})} onClose={() => actions.closeDialog()} />
    </ErrorBoundary>
  )
}
