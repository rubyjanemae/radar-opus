import { useMemo, useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { actions, useApp } from '../../state/store'
import { useCatalog } from '../../data/CatalogContext'
import { rubricLabel } from './labels'

/** Edit the free-text note of one or more symptoms. */
export function NoteDialog({ onClose, clipboardId, symptomIds }: { onClose: () => void; clipboardId: string; symptomIds: string[] }) {
  const catalog = useCatalog()
  const clipboard = useApp(s => {
    for (const c of Object.values(s.consultations)) {
      const cb = c.clipboards.find(x => x.id === clipboardId)
      if (cb) return cb
    }
    return null
  })
  const symptoms = useMemo(() => clipboard?.symptoms.filter(x => symptomIds.includes(x.id)) ?? [], [clipboard, symptomIds])
  const notes = [...new Set(symptoms.map(s => s.note ?? ''))]
  const [text, setText] = useState(notes.length === 1 ? notes[0] : '')
  const save = () => {
    actions.updateSymptoms(clipboardId, symptoms.map(s => s.id), { note: text.trim() ? text.trim() : undefined })
    onClose()
  }
  const first = symptoms[0]
  const title = symptoms.length === 1 && first ? rubricLabel(catalog, first.rubrics[0]).full : `${symptoms.length} symptoms`
  return (
    <Dialog
      title="Symptom note"
      onClose={onClose}
      width={460}
      footer={<>
        {symptoms.some(s => s.note) && <button className="btn btn-ghost btn-danger" style={{ marginRight: 'auto' }} onClick={() => { setText(''); actions.updateSymptoms(clipboardId, symptoms.map(s => s.id), { note: undefined }); onClose() }}>Remove note</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>}
    >
      <div className="cbp-dialog-subject" title={title}>{title}</div>
      {notes.length > 1 && <p className="cbp-dialog-hint">The selected symptoms have different notes; saving replaces all of them.</p>}
      <label className="field">
        Note
        <textarea
          className="textarea" rows={5} value={text} aria-label="Note"
          placeholder="Patient's own words, modalities, source of the symptom…"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }}
        />
      </label>
      <p className="cbp-dialog-hint">Ctrl+Enter saves.</p>
    </Dialog>
  )
}

/** Create a patient with a first consultation and make it the active case. */
export function NewCaseDialog({ onClose }: { onClose: () => void }) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [complaint, setComplaint] = useState('')
  const [title, setTitle] = useState('First consultation')
  const valid = first.trim() || last.trim()
  const create = () => {
    if (!valid) return
    const pid = actions.createPatient({ firstName: first.trim(), lastName: last.trim() })
    actions.createConsultation(pid, { title: title.trim() || 'Consultation', complaint: complaint.trim() })
    actions.toast(`Case opened for ${[first.trim(), last.trim()].filter(Boolean).join(' ')}`, 'success')
    onClose()
  }
  return (
    <Dialog
      title="New case"
      onClose={onClose}
      width={440}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!valid} onClick={create}>Create case</button>
      </>}
    >
      <form className="cbp-form" onSubmit={e => { e.preventDefault(); create() }}>
        <div className="cbp-form-row">
          <label className="field">First name<input className="input" value={first} onChange={e => setFirst(e.target.value)} /></label>
          <label className="field">Last name<input className="input" value={last} onChange={e => setLast(e.target.value)} /></label>
        </div>
        <label className="field">Consultation<input className="input" value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="field">Chief complaint<input className="input" value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="Optional" /></label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
