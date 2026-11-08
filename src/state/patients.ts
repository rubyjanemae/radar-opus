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
  /** RadarOpus administration extras (optional: older records lack them). Code defaults to the creation rank. */
  code?: string
  personalCode?: string
  idCard?: string
  birthTime?: string
  owner?: string
  /** Veterinary patients: 'animal' (the patients list's dog radio); absent means human. */
  species?: 'human' | 'animal'
  animalName?: string
  /** "Case sent to Clificol" (the patients list filter). */
  clificol?: boolean
  /** Picture of the patient card: a small JPEG data URL. */
  photo?: string | null
  nextContact?: string
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

/** A saved analysis of a consultation (Analysis › Save current analysis / Recall an existing analysis). */
export interface SavedAnalysis {
  id: string
  name: string
  savedAt: number
  clipboards: Clipboard[]
  analysis: AnalysisOptions
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
  /** The consultation text as formatted in the patient tab's rich-text editor; `notes` is its plain text. */
  notesHtml?: string
  assessment: string
  clipboards: Clipboard[]
  analysis: AnalysisOptions
  prescriptions: Prescription[]
  /** Response to the previous prescription (follow-ups). */
  response?: RemedyResponse
  /** Analysis › Save current analysis: named snapshots of the clipboards and analysis options, oldest first. */
  savedAnalyses?: SavedAnalysis[]
  /** The saved analysis the current one was saved as or recalled from (numbers the analysis tab's title). */
  currentAnalysisId?: string
  createdAt: number
  updatedAt: number
}
