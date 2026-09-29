import { useMemo, useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { useApp } from '../../state/store'
import type { Patient } from '../../state/patients'
import { normalizeTag, tagCounts, validatePatient } from './logic'
import type { PatientDraft } from './logic'
import { TagEditor } from './TagEditor'
import * as ops from './ops'
import './patients.css'

const EMPTY: PatientDraft = { firstName: '', lastName: '', birthDate: null, sex: null, email: '', phone: '', address: '', occupation: '' }

export function NewPatientDialog({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<PatientDraft>(EMPTY)
  const [tags, setTags] = useState<string[]>([])
  const [start, setStart] = useState(true)
  const [touched, setTouched] = useState(false)
  const patients = useApp(s => s.patients)
  const suggestions = useMemo(() => tagCounts(Object.values(patients)).map(t => t.tag), [patients])
  const errors = validatePatient(d)
  const show = (k: keyof PatientDraft) => (touched ? errors[k] : undefined)
  const set = <K extends keyof PatientDraft>(k: K, v: PatientDraft[K]) => setD(x => ({ ...x, [k]: v }))

  const submit = () => {
    setTouched(true)
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0]
      document.querySelector<HTMLElement>(`.pt-new [name="${first}"]`)?.focus()
      return
    }
    const fields: Partial<Patient> = { ...d, firstName: d.firstName.trim(), lastName: d.lastName.trim(), email: d.email.trim(), phone: d.phone.trim(), tags: tags.map(normalizeTag).filter(Boolean) }
    onClose()
    ops.createPatient(fields, start)
  }

  return (
    <Dialog
      title="New patient" onClose={onClose} width={560}
      footer={<>
        <label className="pt-check"><input type="checkbox" checked={start} onChange={e => setStart(e.target.checked)} />Start first consultation</label>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>Create patient</button>
      </>}
    >
      <form className="pt-new pt-form-grid" onSubmit={e => { e.preventDefault(); submit() }} noValidate>
        <Field label="First name" error={show('firstName')}><input name="firstName" className="input" value={d.firstName} onChange={e => set('firstName', e.target.value)} autoComplete="off" /></Field>
        <Field label="Last name" error={show('lastName')}><input name="lastName" className="input" value={d.lastName} onChange={e => set('lastName', e.target.value)} autoComplete="off" /></Field>
        <Field label="Birth date" error={show('birthDate')}><input name="birthDate" type="date" className="input" value={d.birthDate ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={e => set('birthDate', e.target.value || null)} /></Field>
        <Field label="Sex">
          <select name="sex" className="select" value={d.sex ?? ''} onChange={e => set('sex', (e.target.value || null) as Patient['sex'])}>
            <option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Email" error={show('email')}><input name="email" type="email" className="input" value={d.email} onChange={e => set('email', e.target.value)} autoComplete="off" /></Field>
        <Field label="Phone" error={show('phone')}><input name="phone" type="tel" className="input" value={d.phone} onChange={e => set('phone', e.target.value)} autoComplete="off" /></Field>
        <Field label="Occupation"><input name="occupation" className="input" value={d.occupation} onChange={e => set('occupation', e.target.value)} /></Field>
        <Field label="Address"><input name="address" className="input" value={d.address} onChange={e => set('address', e.target.value)} /></Field>
        <div className="pt-span2"><Field label="Tags"><TagEditor tags={tags} onChange={setTags} suggestions={suggestions} /></Field></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={`field pt-field${error ? ' invalid' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="pt-err" role="alert">{error}</span> : hint ? <span className="pt-hint">{hint}</span> : null}
    </label>
  )
}

export function ConfirmDialog({ onClose, title, message, confirmLabel, danger, onConfirm }: {
  onClose: () => void; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void
}) {
  return (
    <Dialog
      title={title} onClose={onClose} width={440} initialFocus=".pt-confirm-cancel"
      footer={<>
        <button className="btn pt-confirm-cancel" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => { onClose(); onConfirm() }}>{confirmLabel}</button>
      </>}
    >
      <p className="pt-confirm-msg">{message}</p>
    </Dialog>
  )
}
