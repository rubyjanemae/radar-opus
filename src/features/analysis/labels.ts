import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'
import { strategyInfo } from '../../engine/analysis'
import type { StrategyId } from '../../engine/model'

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
  if (s.eliminative) f.push('E')
  if (s.symptom.exclusive) f.push('X')
  if (s.symptom.group) f.push(s.symptom.group.toUpperCase())
  if (s.symptom.causal) f.push('C')
  return f.join(' ')
}

export const EXCLUSION_LABEL: Record<NonNullable<AnalysisRow['excluded']>, string> = {
  manual: 'excluded by you',
  'family-limit': 'outside the remedy filter',
  exclusive: 'in an excluding symptom',
  eliminative: 'missing an eliminative symptom',
  coverage: 'too few symptoms covered',
}

/** Why a row is excluded, naming the responsible symptom line when there is one. */
export function exclusionText(result: Pick<AnalysisResult, 'symptoms'>, row: Pick<AnalysisRow, 'excluded' | 'excludedBy'>): string {
  if (!row.excluded) return ''
  const line = row.excludedBy ? result.symptoms.find(s => s.symptom.id === row.excludedBy || s.members.some(m => m.id === row.excludedBy)) : undefined
  if (row.excluded === 'eliminative' && line) {
    if (line.eliminativeRule === 'must-cover-strong') return `missing strong symptom (Kent: must cover intensity ≥ 3): ${line.label}`
    if (line.eliminativeRule === 'marked-mental') return `missing marked mental symptom (Kent): ${line.label}`
    return `missing eliminative symptom: ${line.label}`
  }
  if (row.excluded === 'exclusive' && line) return `in excluding symptom: ${line.label}`
  return EXCLUSION_LABEL[row.excluded]
}

/** A rubric label split into its chapter and the path below it ("MIND - fear, night" → "MIND", "fear, night"). */
export function splitLabel(label: string): { chapter: string; path: string } {
  const k = label.indexOf(' - ')
  if (k <= 0) return { chapter: '', path: label }
  return { chapter: label.slice(0, k), path: label.slice(k + 3) }
}

/** Short chapter tag: "MIND", "GENER.", "EXTER. THROAT" (the full label stays in the title). */
export function chapterTag(chapter: string): string {
  return chapter.split(/\s+/).map(w => (w.length > 6 ? `${w.slice(0, 5)}.` : w)).join(' ')
}

/**
 * Shorten a rubric path in the middle, keeping its first part and its most specific (last) parts:
 * "pain, head, forehead, extending to, occiput, evening" → "pain, …, occiput, evening".
 */
export function middleEllipsis(path: string, max: number): string {
  if (path.length <= max) return path
  const parts = path.split(', ')
  const last = parts[parts.length - 1]
  if (parts.length < 2 || last.length + 1 >= max) return `…${path.slice(path.length - max + 1)}`
  const first = parts[0]
  const tail: string[] = [last]
  let len = last.length
  for (let k = parts.length - 2; k > 0; k--) {
    if (first.length + 5 + len + 2 + parts[k].length > max) break
    tail.unshift(parts[k])
    len += 2 + parts[k].length
  }
  const head = first.length + 5 + len <= max ? first : first.slice(0, Math.max(1, max - 5 - len))
  return `${head}, …, ${tail.join(', ')}`
}

/** Status bar context of an analysis tab: "Sympt + Deg · 11 symptoms · 125 remedies · Top 30". */
export function analysisStatusText(strategy: StrategyId, result: Pick<AnalysisResult, 'symptoms' | 'total'> | null, limit: number, loading = false): string {
  const n = (k: number, one: string, many: string) => `${k.toLocaleString()} ${k === 1 ? one : many}`
  const parts = [strategyInfo(strategy).short]
  if (loading || !result) parts.push('loading…')
  else parts.push(n(result.symptoms.length, 'symptom', 'symptoms'), n(result.total, 'remedy', 'remedies'))
  parts.push(`Top ${limit >= 100000 ? 'All' : limit}`)
  return parts.join(' · ')
}
