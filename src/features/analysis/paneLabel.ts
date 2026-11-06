import type { Catalog } from '../../data/catalog'
import type { ResolvedSymptom } from '../../engine/analysis'
import type { Symptom } from '../../engine/model'
import { symptomFlags } from '../../engine/model'

/**
 * A rubric path as the analysis window's symptom pane prints it (RadarOpus, like the book's breadcrumb):
 * the chapter and the first level in capitals, deeper levels as printed, joined by " - ":
 * ["Mind", "absent-minded", "morning"] → "MIND - ABSENT-MINDED - morning".
 */
export function panePath(texts: readonly string[]): string {
  return texts.map((t, k) => (k <= 1 ? t.toUpperCase() : t)).join(' - ')
}

type Resolver = Pick<Catalog, 'resolve'>

function memberLabel(catalog: Resolver, s: Pick<Symptom, 'label' | 'rubrics' | 'combine'>): string {
  if (s.label) return s.label
  return s.rubrics.map(ref => {
    const r = catalog.resolve(ref)
    return r ? panePath(r.rep.lineage(r.index).map(i => r.rep.text(i))) : ref
  }).join(s.combine === 'intersection' ? ' ∩ ' : ' ∪ ')
}

/** The symptom pane's text of an analysed line: its rubric(s) in pane form; group members joined by " + ". */
export function paneLabel(catalog: Resolver, s: Pick<ResolvedSymptom, 'members'>): string {
  return s.members.map(m => memberLabel(catalog, m)).join(' + ')
}

/** Abbreviation as the remedy columns print it: lower case with a final dot ("Nux-v" → "nux-v."). */
export function columnAbbrev(abbrev: string): string {
  const a = abbrev.toLowerCase()
  return a.endsWith('.') ? a : `${a}.`
}

/**
 * The detail line an expanded symptom shows under itself: the repertory it comes from, its qualifiers in
 * words and its note ("Repertorium Publicum · eliminative, group A · note"). Size and intensity are on the symptom line.
 */
export function paneDetail(catalog: Pick<Catalog, 'repertoryInfos'>, s: Pick<ResolvedSymptom, 'symptom' | 'members' | 'size'>): string {
  const reps = [...new Set(s.members.flatMap(m => m.rubrics.map(r => r.slice(0, r.lastIndexOf(':')))))]
  const titles = reps.map(a => catalog.repertoryInfos.find(r => r.abbrev === a)?.title ?? a)
  const w = s.symptom.weight
  // the line above already prints "(43) 1" (size, intensity): the detail adds only what it does not show, so it fits the pane
  const parts = [titles.join(', ')]
  if (w === 0) parts.push('ignored (intensity 0)')
  // the qualifiers are read at a non-zero weight (the intensity is printed above)
  const flags = symptomFlags({ ...s.symptom, weight: 1 }, 'long')
  if (flags) parts.push(flags)
  if (s.symptom.note) parts.push(s.symptom.note)
  return parts.join(' · ')
}

/** Accessible name of a pane symptom line: its parts as words, not run together ("1. MIND - ABRUPT, 4 remedies, intensity 1"). */
export function paneSymptomName(s: ResolvedSymptom, n: number, text: string): string {
  const w = s.symptom.weight
  const flags = [
    s.eliminative && 'eliminative', s.symptom.exclusive && 'excluding', s.symptom.group && `group ${s.symptom.group.toUpperCase()}`, s.symptom.causal && 'causal',
    s.missing && 'repertory not loaded',
  ].filter(Boolean)
  return `${n}. ${text}, ${s.size} remedies, ${w === 0 ? 'intensity 0 (ignored)' : `intensity ${w}`}${flags.length ? `, ${flags.join(', ')}` : ''}`
}
