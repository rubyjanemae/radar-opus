import type { RubricRef } from '../data/types'
import type { StrategyId } from '../engine/model'

export type TabKind = 'repertory' | 'analysis' | 'materia-medica' | 'remedy' | 'patients' | 'patient' | 'search' | 'families' | 'repertories' | 'maps'

export interface TabBase { id: string; kind: TabKind; pinned?: boolean }
export interface RepertoryTab extends TabBase {
  kind: 'repertory'; repertory: string; rubric: number; back: number[]; forward: number[]
  /** Space cycle: 'count' hides remedies in the book view (remedy style comes from settings). */
  display?: 'count' | 'remedies'
  /** Rubrics dwelt on or acted on in this tab, most recent first (navigator Recent list). */
  recent?: number[]
}
/** Table of contents of the installed repertories. */
export interface RepertoriesTab extends TabBase { kind: 'repertories'; selected?: string }
export type AnalysisViewMode = 'grid' | 'bars' | 'cards'
export interface AnalysisTab extends TabBase {
  kind: 'analysis'; consultationId: string
  /** Result display (default grid). */
  view?: AnalysisViewMode
  /** Remedy shown in the drill-down panel. */
  remedy?: number | null
  /** Symptom line highlighted (index into the analysed symptoms). */
  symptom?: number | null
  /** Remedies appended as extra columns because they rank beyond the display limit (remedy box jumps). */
  pinnedRemedies?: number[] | null
  /** Analysis › Show current analysis with symptoms only (F7): the symptom pane without remedy columns. */
  symptomsOnly?: boolean
  /**
   * The title a window restored at startup carries until it is first shown (RadarOpus restores the
   * analysis window as "<patient> -"; shown, it takes the analysis heading). Cleared by TabHost.
   */
  restoredTitle?: string
}
export interface MateriaMedicaTab extends TabBase { kind: 'materia-medica'; remedyId: number | null; query: string }
export interface RemedyTab extends TabBase { kind: 'remedy'; remedyId: number }
export interface PatientsTab extends TabBase { kind: 'patients' }
export interface PatientTab extends TabBase {
  kind: 'patient'; patientId: string
  /** Consultation shown in the editor (default: the latest). */
  consultationId?: string | null
  /** Sub-view: consultations timeline + editor, or the patient's details. */
  section?: 'consultations' | 'details'
}
export interface SearchTab extends TabBase {
  kind: 'search'; query: string
  /** Repertories searched; for scope 'all' this is ignored (every installed repertory). */
  repertories: string[]
  /** 'text' = F4 word search (default), 'remedy' = F5 remedy search. */
  mode?: 'text' | 'remedy'
  scope?: 'repertory' | 'all' | 'chapter'
  /** Chapter root rubric id in repertories[0] when scope is 'chapter'. */
  chapter?: number
  /** Hide results whose parent rubric also matches. */
  collapse?: boolean
  // remedy search
  remedyId?: number | null
  minGrade?: number
  maxSize?: number
  maxCo?: number
}
export interface FamiliesTab extends TabBase {
  kind: 'families'; group: string | null
  /** Remedy selected in the group's remedy table. */
  remedy?: number | null
}

/** View › Maps: the current analysis on a map (features/maps). */
export interface MapsTab extends TabBase {
  kind: 'maps'; map: 'periodic' | 'kingdoms'
  /** The element or kingdom whose remedies the side list shows. */
  selected?: string | null
  /** How many leading remedies count as the analysis's top (default 30). */
  top?: number
}

export type Tab = RepertoryTab | RepertoriesTab | AnalysisTab | MateriaMedicaTab | RemedyTab | PatientsTab | PatientTab | SearchTab | FamiliesTab | MapsTab

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
  /** Print rubric notes under their rubric in the book (the gutter mark shows either way). */
  showRubricNotes: boolean
  analysisLimit: number
  /** Strategy for new consultations. */
  defaultStrategy: StrategyId
  /** Turn off animations regardless of the OS preference. */
  reduceMotion: boolean
}

export interface Layout {
  treeWidth: number
  clipboardWidth: number
  analysisHeight: number
  showTree: boolean
  showClipboard: boolean
  showAnalysisDock: boolean
  /** Table of contents: keys of the expanded tree rows (sections, documents). */
  tocOpen: string[]
  /** Table of contents: keys of the checked documents. */
  tocChecked: string[]
  /** File › Save selection as a document mix: named sets of checked documents (features/docmix). */
  docMixes: DocMix[]
  /** File › Select a default document mix: the mix checked at startup ('' none). */
  defaultDocMix: string
}

/** A named selection of documents of the table of contents (RadarOpus's document mix). */
export interface DocMix { name: string; keys: string[] }

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  density: 'compact',
  fontScale: 1,
  remedyStyle: 'abbrev',
  minGradeShown: 1,
  defaultRepertory: 'publicum',
  showRemedyCounts: true,
  showRubricNotes: true,
  analysisLimit: 100000,
  defaultStrategy: 'graded-prominence',
  reduceMotion: false,
}

export const DEFAULT_LAYOUT: Layout = {
  treeWidth: 400,
  clipboardWidth: 340,
  analysisHeight: 300,
  // RadarOpus starts with the table of contents on show, on the Patients list (status strip: "Hide the
  // table of contents (cmd+F2)", "Expand Toc"; the toolbar's Patients button checked)
  showTree: true,
  // RadarOpus shows clipboards as the left strip and in the analysis window: the clipboard pane is opt-in (F7, View menu)
  showClipboard: false,
  showAnalysisDock: false,
  tocOpen: ['sec:reps', 'sec:fams'],
  tocChecked: [],
  docMixes: [],
  defaultDocMix: '',
}

/** A tab description before it has an id (distributes over the Tab union). */
export type NewTab = Tab extends infer T ? (T extends Tab ? Omit<T, 'id'> & { id?: string } : never) : never
