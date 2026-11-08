import type { Consultation, SavedAnalysis } from '../../state/patients'
import { consultationsOldestFirst } from '../patients/panel'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n: number) => String(n).padStart(2, '0')

/** RadarOpus's (C ctime) date: "Sun Nov 1 11:37:07 2026" (day not padded). */
export function ctimeDate(d: Date): string {
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${d.getFullYear()}`
}

/** When a consultation took place: its date (YYYY-MM-DD) at the time of day it was created. */
export function consultationMoment(c: Pick<Consultation, 'date' | 'createdAt'>): Date {
  const t = new Date(c.createdAt)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.date)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], t.getHours(), t.getMinutes(), t.getSeconds()) : t
}

/** The saved analysis the consultation's current analysis is, when it was saved or recalled. */
export function currentSaved(c: Pick<Consultation, 'savedAnalyses' | 'currentAnalysisId'>): SavedAnalysis | null {
  return c.savedAnalyses?.find(a => a.id === c.currentAnalysisId) ?? null
}

/** Number of the current analysis within its consultation: the saved one's rank, else the next free number. */
export function analysisNumber(c: Pick<Consultation, 'savedAnalyses' | 'currentAnalysisId'>): number {
  const list = c.savedAnalyses ?? []
  const i = list.findIndex(a => a.id === c.currentAnalysisId)
  return i >= 0 ? i + 1 : list.length + 1
}

/**
 * RadarOpus titles the analysis document "<consultation no> - <consultation date> - <analysis no> - <analysis name>",
 * e.g. "1 - Sun Nov 1 11:37:07 2026 - 1 -" for an unsaved first analysis of the first consultation.
 */
export function analysisTitle(c: Consultation, all: Record<string, Consultation>): string {
  const no = consultationsOldestFirst(all, c.patientId).findIndex(x => x.id === c.id) + 1
  const name = currentSaved(c)?.name.trim() ?? ''
  return `${no || 1} - ${ctimeDate(consultationMoment(c))} - ${analysisNumber(c)} -${name ? ` ${name}` : ''}`
}

/** Default name offered when saving: the date and time of saving. */
export function defaultSaveName(now: Date): string {
  return ctimeDate(now)
}
