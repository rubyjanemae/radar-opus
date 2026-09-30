import { useRef } from 'react'
import { registerDialog } from '../shell/dialogs'
import type { DialogComponent } from '../shell/dialogs'
import { actions } from '../state/store'
import { Dialog } from './Dialog'

export const APP_CONFIRM_DIALOG = 'app.confirm'

interface Props {
  onClose: () => void
  title: string
  message: string
  detail?: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

/** Generic yes/no dialog; Cancel is focused first so Enter never confirms a destructive action by accident. */
function ConfirmDialog({ onClose, title, message, detail, confirmLabel, danger, resolve }: Props) {
  const answered = useRef(false)
  const answer = (ok: boolean) => { if (!answered.current) { answered.current = true; resolve(ok) } }
  const cancel = () => { answer(false); onClose() }
  return (
    <Dialog
      title={title} onClose={cancel} width={460} initialFocus=".app-confirm-cancel"
      footer={<>
        <button className="btn app-confirm-cancel" onClick={cancel}>Cancel</button>
        <button className={`btn ${danger ? 'app-btn-danger' : 'btn-primary'}`} onClick={() => { answer(true); onClose() }}>{confirmLabel}</button>
      </>}
    >
      <p className="app-confirm-msg">{message}</p>
      {detail && <p className="app-confirm-detail">{detail}</p>}
    </Dialog>
  )
}

registerDialog(APP_CONFIRM_DIALOG, ConfirmDialog as unknown as DialogComponent)

/** Open the confirm dialog; resolves true when confirmed. */
export function askConfirm(o: { title: string; message: string; detail?: string; confirmLabel: string; danger?: boolean }): Promise<boolean> {
  return new Promise(resolve => actions.openDialog(APP_CONFIRM_DIALOG, { ...o, resolve }))
}
