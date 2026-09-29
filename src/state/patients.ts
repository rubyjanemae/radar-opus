import type { Clipboard, AnalysisOptions } from '../engine/model'

export interface Patient {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  sex: 'female' | 'male' | 'other' | null
  email: string
  phone: string
  address: string
  occupation: string
  notes: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface Prescription {
  id: string
  remedyId: number
  potency: string
  dosage: string
  date: string
  note: string
}

/**
 * Evaluation, at a follow-up, of the effect of the previous prescription:
 * score on the Glasgow Homeopathic Hospital Outcome Scale (-3 major deterioration … +4 cured), plus the practitioner's note.
 */
export interface RemedyResponse {
  score: number | null
  note: string
}

/** One consultation (first visit or follow-up) with its own clipboards and analysis. */
export interface Consultation {
  id: string
  patientId: string
  date: string
  title: string
  kind: 'first' | 'follow-up' | 'acute' | 'phone'
  complaint: string
  notes: string
  assessment: string
  clipboards: Clipboard[]
  analysis: AnalysisOptions
  prescriptions: Prescription[]
  /** Response to the previous prescription (follow-ups). */
  response?: RemedyResponse
  createdAt: number
  updatedAt: number
}
