import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { registerDialog, registerLazyDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { actions, useApp } from '../../state/store'
import { ConfirmDialog, ImportConflictDialog, NewPatientDialog } from './dialogs'
import * as ops from './ops'

export function register(catalog: Catalog) {
  ops.setCatalog(catalog)
  registerDialog(ops.NEW_PATIENT_DIALOG, NewPatientDialog as unknown as DialogComponent)
  registerDialog(ops.CONFIRM_DIALOG, ConfirmDialog as unknown as DialogComponent)
  // the report pulls the analysis engine's views: its own chunk, loaded when first opened
  registerLazyDialog(ops.REPORT_DIALOG, () => import('./CaseReport'), m => m.CaseReportDialog, { preload: false })
  registerDialog(ops.IMPORT_CONFLICT_DIALOG, ImportConflictDialog as unknown as DialogComponent)

  const hasPatient = () => !!ops.contextPatientId()
  const hasConsultation = () => !!ops.contextConsultationId()

  registerCommands([
    { id: 'patients.open', title: 'Patients', category: 'File', keys: ['Mod+3'], allowInInput: true, keywords: 'patient list database toc', run: () => ops.openPatients() },
    { id: 'patient.new', title: 'New patient…', category: 'File', keys: ['Mod+Alt+N'], allowInInput: true, keywords: 'create add patient', run: ops.newPatient },
    {
      id: 'consultation.new', title: 'New consultation', category: 'File', keys: ['Mod+Alt+C'], allowInInput: true, enabled: hasPatient,
      keywords: 'visit case create', run: () => ops.newConsultation(),
    },
    { id: 'consultation.followUp', title: 'New follow-up (copy clipboards)', category: 'Case', enabled: hasConsultation, keywords: 'duplicate consultation', run: () => ops.newFollowUp() },
    {
      id: 'consultation.activate', title: 'Make active case', category: 'Case', keywords: 'clipboard consultation set active',
      enabled: () => { const id = ops.contextConsultationId(); return !!id && id !== useApp.getState().activeConsultationId },
      run: () => { const id = ops.contextConsultationId(); if (id) ops.makeActive(id) },
    },
    { id: 'consultation.delete', title: 'Delete consultation…', category: 'Case', enabled: hasConsultation, run: () => { const id = ops.contextConsultationId(); if (id) ops.confirmDeleteConsultation(id) } },
    { id: 'patient.open', title: 'Open patient file', category: 'File', enabled: hasPatient, keywords: 'patient record', run: () => { const id = ops.contextPatientId(); if (id) ops.openPatient(id) } },
    { id: 'patient.duplicate', title: 'Duplicate patient', category: 'File', enabled: hasPatient, run: () => { const id = ops.contextPatientId(); if (id) ops.duplicate(id) } },
    { id: 'patient.delete', title: 'Delete patient…', category: 'File', enabled: hasPatient, keywords: 'remove erase', run: () => { const id = ops.contextPatientId(); if (id) ops.confirmDeletePatient(id) } },
    { id: 'file.exportCase', title: 'Export case file…', category: 'File', enabled: hasPatient, keywords: 'patient json save download', run: () => ops.exportCase() },
    { id: 'file.importCase', title: 'Import case file…', category: 'File', keywords: 'patient json open load', run: () => ops.importCase() },
    { id: 'case.report', title: 'Case report…', category: 'File', enabled: hasConsultation, keywords: 'print pdf summary', run: () => ops.openReport() },
    {
      id: 'prescription.add', title: 'Add prescription', category: 'Case', keys: ['Mod+Alt+P'], allowInInput: true, enabled: hasConsultation, keywords: 'remedy potency prescribe',
      run: () => { const id = ops.contextConsultationId(); if (id) ops.openPrescription(id) },
    },
    {
      id: 'patient.details', title: 'Patient details', category: 'File', enabled: () => !!ops.activePatientTab(), keywords: 'demographics edit',
      run: () => { const t = ops.activePatientTab(); if (t) actions.updateTab(t.id, { section: 'details' }) },
    },
  ])
}
