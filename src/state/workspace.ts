import type { RubricRef } from '../data/types'

export type TabKind = 'repertory' | 'analysis' | 'materia-medica' | 'remedy' | 'patients' | 'patient' | 'search' | 'families'

export interface TabBase { id: string; kind: TabKind; pinned?: boolean }
export interface RepertoryTab extends TabBase { kind: 'repertory'; repertory: string; rubric: number; back: number[]; forward: number[] }
export interface AnalysisTab extends TabBase { kind: 'analysis'; consultationId: string }
export interface MateriaMedicaTab extends TabBase { kind: 'materia-medica'; remedyId: number | null; query: string }
export interface RemedyTab extends TabBase { kind: 'remedy'; remedyId: number }
export interface PatientsTab extends TabBase { kind: 'patients' }
export interface PatientTab extends TabBase { kind: 'patient'; patientId: string }
export interface SearchTab extends TabBase { kind: 'search'; query: string; repertories: string[] }
export interface FamiliesTab extends TabBase { kind: 'families'; group: string | null }

export type Tab = RepertoryTab | AnalysisTab | MateriaMedicaTab | RemedyTab | PatientsTab | PatientTab | SearchTab | FamiliesTab

export interface Bookmark {
  id: string
  ref: RubricRef
  label: string
  folder: string
  createdAt: number
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  density: 'compact' | 'comfortable'
  fontScale: number
  /** How remedies print in rubric view. */
  remedyStyle: 'abbrev' | 'name'
  /** Hide grade-1 remedies in the book view (Radar "degree filter"). */
  minGradeShown: 1 | 2 | 3
  defaultRepertory: string
  showRemedyCounts: boolean
  analysisLimit: number
}

export interface Layout {
  treeWidth: number
  clipboardWidth: number
  analysisHeight: number
  showTree: boolean
  showClipboard: boolean
  showAnalysisDock: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  density: 'compact',
  fontScale: 1,
  remedyStyle: 'abbrev',
  minGradeShown: 1,
  defaultRepertory: 'publicum',
  showRemedyCounts: true,
  analysisLimit: 30,
}

export const DEFAULT_LAYOUT: Layout = {
  treeWidth: 280,
  clipboardWidth: 340,
  analysisHeight: 300,
  showTree: true,
  showClipboard: true,
  showAnalysisDock: false,
}

/** A tab description before it has an id (distributes over the Tab union). */
export type NewTab = Tab extends infer T ? (T extends Tab ? Omit<T, 'id'> & { id?: string } : never) : never
