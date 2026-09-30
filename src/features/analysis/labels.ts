import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'

/* Small, eagerly loaded helpers shared by the views; the heavy CSV/PNG code in export.ts is loaded on demand. */

export interface ExportMeta {
  title: string
  clipboardName: (id: string) => string
  remedyAbbrev: (id: number) => string
  remedyName: (id: number) => string
}

/** Short flag string of a column: E eliminative, X excluding, group letter, C causal, 0 ignored. */
export function symptomFlags(s: ResolvedSymptom): string {
  const f: string[] = []
  if (s.role === 'ignored') f.push('0')
  if (s.symptom.eliminatory) f.push('E')
  if (s.symptom.exclusive) f.push('X')
  if (s.symptom.group) f.push(s.symptom.group.toUpperCase())
  if (s.symptom.causal) f.push('C')
  return f.join(' ')
}

export const EXCLUSION_LABEL: Record<NonNullable<AnalysisRow['excluded']>, string> = {
  manual: 'excluded by you',
  filter: 'outside the remedy filter',
  excluding: 'in an excluding symptom',
  eliminative: 'missing an eliminative symptom',
  coverage: 'too few symptoms covered',
}

/** Why a row is excluded, naming the responsible symptom line when there is one. */
export function exclusionText(result: Pick<AnalysisResult, 'symptoms'>, row: Pick<AnalysisRow, 'excluded' | 'excludedBy'>): string {
  if (!row.excluded) return ''
  const line = row.excludedBy ? result.symptoms.find(s => s.symptom.id === row.excludedBy || s.members.some(m => m.id === row.excludedBy)) : undefined
  if (row.excluded === 'eliminative' && line) return `missing eliminative symptom: ${line.label}`
  if (row.excluded === 'excluding' && line) return `in excluding symptom: ${line.label}`
  return EXCLUSION_LABEL[row.excluded]
}
