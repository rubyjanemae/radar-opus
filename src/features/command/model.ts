import type { Command } from '../../commands/registry'
import { isEnabled } from '../../commands/registry'
import type { Repertory } from '../../data/repertory'
import type { Remedy, RubricRef } from '../../data/types'
import type { Patient } from '../../state/patients'
import type { RemedyMatch } from '../search/remedies'
import { fuzzy } from './fuzzy'

/** Palette data model: modes, sections and ranking (pure, unit-tested). */

export type Mode = 'all' | 'commands' | 'remedies' | 'patients' | 'rubrics'

export function parseMode(q: string): { mode: Mode; text: string } {
  const c = q[0]
  if (c === '>') return { mode: 'commands', text: q.slice(1) }
  if (c === '#') return { mode: 'remedies', text: q.slice(1) }
  if (c === '@') return { mode: 'patients', text: q.slice(1) }
  if (c === '/') return { mode: 'rubrics', text: q.slice(1) }
  return { mode: 'all', text: q }
}

export type PaletteItem =
  | { kind: 'command'; command: Command; positions?: number[]; disabled?: boolean; recent?: boolean; score: number }
  | { kind: 'tab'; id: string; title: string; subtitle?: string; positions?: number[]; disabled?: boolean; score: number }
  | { kind: 'patient'; patient: Patient; label: string; positions?: number[]; disabled?: boolean; score: number }
  | { kind: 'remedy'; remedy: Remedy; disabled?: boolean; score: number }
  | { kind: 'rubric'; ref: RubricRef; rep: Repertory; index: number; disabled?: boolean; score: number }
  | { kind: 'search'; query: string; disabled?: boolean; score: number }

export interface Section { key: string; label: string; items: PaletteItem[]; strength: number; pending?: boolean }

export interface PaletteInput {
  mode: Mode
  text: string
  commands: Command[]
  recent: string[]
  tabs: { id: string; title: string; subtitle?: string }[]
  patients: Patient[]
  remedies: (q: string) => RemedyMatch[]
  rubrics: (q: string) => { hits: { ref: RubricRef; rep: Repertory; index: number }[]; pending: boolean }
}

export const patientLabel = (p: Patient) => [p.lastName, p.firstName].filter(Boolean).join(', ') || 'Unnamed patient'

/** Build the palette sections for a query, strongest section first in mixed mode. */
export function paletteItems(inp: PaletteInput): Section[] {
  const { mode, text } = inp
  const q = text.trim()
  const all = mode === 'all'
  const sections: Section[] = []
  const lim = (n: number, big: number) => (all ? n : big)

  // commands
  if (all || mode === 'commands') {
    const visible = inp.commands.filter(c => !c.hidden)
    if (!q) {
      const byId = new Map(visible.map(c => [c.id, c]))
      const recent = inp.recent.map(id => byId.get(id)).filter((c): c is Command => !!c).slice(0, 5)
      if (recent.length) sections.push({ key: 'recent', label: 'Recently used', strength: 3000, items: recent.map(c => ({ kind: 'command', command: c, recent: true, disabled: !isEnabled(c), score: 0 })) })
      const rest = visible.filter(c => !recent.includes(c)).map(c => ({ c, on: isEnabled(c) }))
        .sort((a, b) => Number(b.on) - Number(a.on) || a.c.category.localeCompare(b.c.category) || a.c.title.localeCompare(b.c.title))
      sections.push({ key: 'commands', label: 'Commands', strength: 2000, items: rest.map(({ c, on }) => ({ kind: 'command', command: c, disabled: !on, score: 0 })) })
    } else {
      const recentRank = new Map(inp.recent.map((id, i) => [id, i]))
      const scored: PaletteItem[] = []
      for (const c of visible) {
        const m = fuzzy(q, c.title)
        const alt = m ? null : fuzzy(q, `${c.category} ${c.title} ${c.keywords ?? ''}`)
        const hit = m ?? (alt ? { score: alt.score - 400, positions: [] } : null)
        if (!hit) continue
        const r = recentRank.get(c.id)
        const enabled = isEnabled(c)
        const score = hit.score + (r != null ? 60 - r * 3 : 0) - (enabled ? 0 : 150)
        scored.push({ kind: 'command', command: c, positions: m?.positions, disabled: !enabled, recent: r != null, score })
      }
      scored.sort((a, b) => b.score - a.score)
      const items = scored.slice(0, lim(8, 200))
      if (items.length) sections.push({ key: 'commands', label: 'Commands', strength: items[0].score, items })
    }
  }

  // open tabs
  if (all && q) {
    const items: PaletteItem[] = []
    for (const t of inp.tabs) {
      const m = fuzzy(q, t.title) ?? (t.subtitle ? fuzzy(q, `${t.title} ${t.subtitle}`) : null)
      if (m) items.push({ kind: 'tab', id: t.id, title: t.title, subtitle: t.subtitle, positions: m.positions.filter(p => p < t.title.length), score: m.score })
    }
    items.sort((a, b) => b.score - a.score)
    if (items.length) sections.push({ key: 'tabs', label: 'Open tabs', strength: items[0].score - 100, items: items.slice(0, 5) })
  }

  // patients
  if ((all && q) || mode === 'patients') {
    const items: PaletteItem[] = []
    for (const p of inp.patients) {
      const label = patientLabel(p)
      if (!q) { items.push({ kind: 'patient', patient: p, label, score: p.updatedAt }); continue }
      const m = fuzzy(q, label) ?? fuzzy(q, `${p.firstName} ${p.lastName}`)
      if (m) items.push({ kind: 'patient', patient: p, label, positions: fuzzy(q, label)?.positions, score: m.score })
    }
    items.sort((a, b) => b.score - a.score)
    if (items.length) sections.push({ key: 'patients', label: 'Patients', strength: q ? items[0].score : 1000, items: items.slice(0, lim(5, 100)) })
  }

  // remedies
  if ((all && q) || mode === 'remedies') {
    const matches = q ? inp.remedies(q) : []
    const items: PaletteItem[] = matches.filter(m => !all || m.score >= 55).map(m => ({ kind: 'remedy', remedy: m.remedy, score: m.score }))
    if (items.length) sections.push({ key: 'remedies', label: 'Remedies', strength: (items[0].score) * 20, items })
  }

  // rubrics
  if ((all && q.length >= 3) || (mode === 'rubrics' && q.length >= 2)) {
    const { hits, pending } = inp.rubrics(text)
    const items: PaletteItem[] = hits.map((h, i) => ({ kind: 'rubric', ref: h.ref, rep: h.rep, index: h.index, score: -i }))
    if (items.length || pending) {
      items.push({ kind: 'search', query: q, score: -1000 })
      sections.push({ key: 'rubrics', label: 'Rubrics', strength: 1050, items, pending })
    }
  }

  if (all) sections.sort((a, b) => b.strength - a.strength)
  return sections
}

// ───────────── recent commands & initial query (per-viewer conveniences) ─────────────

const RECENT_KEY = 'palette.recent'

export function recentCommands(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}

export function rememberCommand(id: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCommands().filter(x => x !== id)].slice(0, 12))) } catch { /* storage blocked */ }
}

let initialQuery = ''
let liveSetter: ((q: string) => void) | null = null
/** Pre-fill the palette (e.g. '#' for remedies): the open palette updates, or the next one starts with it. */
export function setInitialQuery(q: string) { if (liveSetter) liveSetter(q); else initialQuery = q }
export function takeInitialQuery(): string { const q = initialQuery; initialQuery = ''; return q }
/** The mounted palette registers its query setter here. */
export function bindQuerySetter(fn: ((q: string) => void) | null) { liveSetter = fn }
