import { actions, useApp } from '../state/store'
import { getDialog } from './dialogs'

export function DialogHost() {
  const dialog = useApp(s => s.dialog)
  if (!dialog) return null
  const C = getDialog(dialog.kind)
  if (!C) return null
  return <C {...(dialog.props ?? {})} onClose={() => actions.closeDialog()} />
}
