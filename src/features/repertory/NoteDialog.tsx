import { useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { actions, useApp } from '../../state/store'
import type { RubricRef } from '../../data/types'
import { formatKeys } from '../../commands/registry'
import { refLabel } from './ops'

/** Personal note attached to a rubric; shown under the rubric in the book view. */
export function NoteDialog({ onClose, rubricRef }: { onClose: () => void; rubricRef: RubricRef }) {
  const existing = useApp(s => s.rubricNotes[rubricRef] ?? '')
  const [text, setText] = useState(existing)
  const save = () => {
    actions.setRubricNote(rubricRef, text)
    actions.toast(text.trim() ? 'Note saved' : existing ? 'Note removed' : 'Nothing to save', text.trim() ? 'success' : 'info')
    onClose()
  }
  return (
    <Dialog
      title={existing ? 'Edit rubric note' : 'Add rubric note'} onClose={onClose} width={520} initialFocus="textarea"
      footer={<>
        {existing && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => { actions.setRubricNote(rubricRef, ''); actions.toast('Note removed', 'info', { label: 'Undo', run: () => actions.setRubricNote(rubricRef, existing) }); onClose() }}>Delete note</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save <span className="rnote-keys">{formatKeys('Mod+Enter')}</span></button>
      </>}
    >
      <div className="rnote-rubric">{refLabel(rubricRef)}</div>
      <textarea
        className="textarea rnote-text" rows={7} value={text} aria-label="Note"
        placeholder="Clinical observations, cross-references, cured cases…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
      />
    </Dialog>
  )
}
