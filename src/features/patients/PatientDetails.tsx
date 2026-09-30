import { useMemo, useState } from 'react'
import { actions, useApp } from '../../state/store'
import type { Patient } from '../../state/patients'
import { Field, todayIso } from './dialogs'
import { formatAge, formatDateTime, tagCounts, validatePatient } from './logic'
import type { PatientDraft } from './logic'
import { TagEditor } from './TagEditor'
import { useDraft } from './useDraft'

type TextKey = Exclude<keyof PatientDraft, 'sex' | 'birthDate'>

/** A demographic text field that autosaves when valid. */
function DemoField({ patient, k, label, type = 'text' }: { patient: Patient; k: TextKey; label: string; type?: string }) {
  const { draft, setDraft, flush } = useDraft(patient[k], v => {
    if (!validatePatient({ ...patient, [k]: v })[k]) actions.updatePatient(patient.id, { [k]: v.trim() })
  })
  const error = validatePatient({ ...patient, [k]: draft })[k]
  return (
    <Field label={label} error={error}>
      <input name={k} type={type} className="input" value={draft} aria-invalid={!!error} onChange={e => setDraft(e.target.value)} onBlur={flush} onKeyDown={e => { if (e.key === 'Enter') flush() }} />
    </Field>
  )
}

export function PatientDetails({ patient }: { patient: Patient }) {
  const patients = useApp(s => s.patients)
  const suggestions = useMemo(() => tagCounts(Object.values(patients)).map(t => t.tag), [patients])
  const birthError = validatePatient({ birthDate: patient.birthDate, firstName: 'x' }).birthDate
  const notes = useDraft(patient.notes, v => actions.updatePatient(patient.id, { notes: v }))
  const age = formatAge(patient.birthDate)
  const [today] = useState(todayIso)
  return (
    <div className="pt-details" data-testid="patient-details">
      <section className="pt-details-sec">
        <h3>Personal data</h3>
        <div className="pt-form-grid">
          <DemoField key={`l${patient.id}`} patient={patient} k="lastName" label="Last name" />
          <DemoField key={`f${patient.id}`} patient={patient} k="firstName" label="First name" />
          <Field label="Birth date" error={birthError} hint={age ? `Age ${age}` : undefined}>
            <input
              name="birthDate" type="date" className="input" value={patient.birthDate ?? ''} max={today}
              onChange={e => { const v = e.target.value || null; if (!validatePatient({ birthDate: v, firstName: 'x' }).birthDate) actions.updatePatient(patient.id, { birthDate: v }) }}
            />
          </Field>
          <Field label="Sex">
            <select name="sex" className="select" value={patient.sex ?? ''} onChange={e => actions.updatePatient(patient.id, { sex: (e.target.value || null) as Patient['sex'] })}>
              <option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
            </select>
          </Field>
          <DemoField key={`o${patient.id}`} patient={patient} k="occupation" label="Occupation" />
        </div>
      </section>
      <section className="pt-details-sec">
        <h3>Contact</h3>
        <div className="pt-form-grid">
          <DemoField key={`e${patient.id}`} patient={patient} k="email" label="Email" type="email" />
          <DemoField key={`p${patient.id}`} patient={patient} k="phone" label="Phone" type="tel" />
          <div className="pt-span-all"><DemoField key={`a${patient.id}`} patient={patient} k="address" label="Address" /></div>
        </div>
      </section>
      <section className="pt-details-sec">
        <h3>Tags</h3>
        <TagEditor tags={patient.tags} onChange={tags => actions.updatePatient(patient.id, { tags })} suggestions={suggestions} />
      </section>
      <section className="pt-details-sec">
        <h3>Notes</h3>
        <textarea
          className="textarea pt-details-notes" aria-label="Patient notes" rows={8} value={notes.draft} placeholder="Allergies, current medication, family history, practical notes…"
          onChange={e => notes.setDraft(e.target.value)} onBlur={notes.flush}
        />
      </section>
      <p className="pt-dim pt-details-foot">Changes save automatically. Created {formatDateTime(patient.createdAt)} · last change {formatDateTime(patient.updatedAt)}</p>
    </div>
  )
}
