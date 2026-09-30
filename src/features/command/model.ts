import type { Command } from '../../commands/registry'
import { isEnabled as isEnabledPlain } from '../../commands/registry'
import type { Repertory } from '../../data/repertory'
import type { Remedy, RubricRef } from '../../data/types'
import type { Patient } from '../../state/patients'
import type { RemedyMatch } from '../search/remedies'
import { fuzzy as fuzzyPlain } from './fuzzy'
import type { FuzzyMatch } from './fuzzy'
import { patientName } from '../patients/logic'

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
  | { kind: 'command'; command: Command; positions?: number[]; disabled?: boolean; recent?: boolean; score: number; why?: string }
  | { kind: 'tab'; id: string; title: string; subtitle?: string; positions?: number[]; disabled?: boolean; score: number }
  | { kind: 'patient'; patient: Patient; label: string; positions?: number[]; disabled?: boolean; score: number }
  | { kind: 'remedy'; remedy: Remedy; disabled?: boolean; score: number }
  | { kind: 'rubric'; ref: RubricRef; rep: Repertory; index: number; disabled?: boolean; score: number }
  | { kind: 'search'; query: string; disabled?: boolean; score: number }

export interface Section { key: string; label: string; items: PaletteItem[]; strength: number; pending?: boolean }

export interface PaletteInput {
  mode: Mode
  text: string
  /**
   * Text for the heavier sections (patients, remedies, rubrics). The palette passes a deferred copy
   * of `text` so commands and tabs follow each keystroke while these catch up in the background.
   */
  slowText?: string
  commands: Command[]
  recent: string[]
  /** How often each command was run from the palette (for the empty-query suggestions). */
  counts?: Record<string, number>
  tabs: { id: string; title: string; subtitle?: string; active?: boolean }[]
  patients: Patient[]
  remedies: (q: string) => RemedyMatch[]
  rubrics: (q: string) => { hits: { ref: RubricRef; rep: Repertory; index: number }[]; pending: boolean }
  /** Matcher with cached folded haystacks (the palette builds one per open); defaults to plain `fuzzy`. */
  match?: (q: string, text: string) => FuzzyMatch | null
  /** Enabled test, memoised per open by the palette; defaults to the registry's `isEnabled`. */
  enabled?: (c: Command) => boolean
}

/** Everyday commands suggested on an empty palette before anything has been used. */
const COMMON = ['search.open', 'search.remedy', 'analysis.open', 'patients.open', 'patient.new', 'mm.open', 'app.settings']

const foldWord = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Why a command matched although its title did not: the keyword or category words that
 * start with (or, for longer queries, contain) each query word. Null when there is no such match.
 */
export function keywordReason(q: string, c: Pick<Command, 'title' | 'category' | 'keywords'>): string | null {
  const words = foldWord(q).split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const split = (s: string) => s.split(/[\s,…]+/).filter(Boolean)
  const title = split(c.title)
  const pool = split(`${c.keywords ?? ''} ${c.category}`)
  const find = (list: string[], w: string) => list.find(p => foldWord(p).startsWith(w)) ?? (w.length >= 3 ? list.find(p => foldWord(p).includes(w)) : undefined)
  const found: string[] = []
  let viaKeyword = false
  for (const w of words) {
    if (find(title, w)) continue
    const hit = find(pool, w)
    if (!hit) return null
    viaKeyword = true
    if (!found.includes(hit)) found.push(hit)
  }
  return viaKeyword ? found.join(', ') : null
}


/** Build the palette sections for a query, strongest section first in mixed mode. */
export function paletteItems(inp: PaletteInput): Section[] {
  const { mode, text } = inp
  const fuzzy = inp.match ?? fuzzyPlain
  const isEnabled = inp.enabled ?? isEnabledPlain
  const q = text.trim()
  const all = mode === 'all'
  const sections: Section[] = []
  const lim = (n: number, big: number) => (all ? n : big)
  const slow = inp.slowText ?? text
  const sq = slow.trim()

  // commands
  if (all || mode === 'commands') {
    const visible = inp.commands.filter(c => !c.hidden)
    if (!q) {
      const byId = new Map(visible.map(c => [c.id, c]))
      const recent = inp.recent.map(id => byId.get(id)).filter((c): c is Command => !!c && isEnabled(c)).slice(0, 5)
      if (recent.length) sections.push({ key: 'recent', label: 'Recently used', strength: 3000, items: recent.map(c => ({ kind: 'command', command: c, recent: true, score: 0 })) })
      const shown = new Set(recent)
      if (all) {
        // open tabs come right after the recent commands
        const tabs = inp.tabs.filter(t => !t.active).slice(0, 8)
        if (tabs.length) sections.push({ key: 'tabs', label: 'Open tabs', strength: 2500, items: tabs.map(t => ({ kind: 'tab', id: t.id, title: t.title, subtitle: t.subtitle, score: 0 })) })
        // then the commands used most, else a short list of everyday ones
        const counts = inp.counts ?? {}
        const used = visible.filter(c => !shown.has(c) && (counts[c.id] ?? 0) > 0 && isEnabled(c)).sort((a, b) => counts[b.id] - counts[a.id]).slice(0, 6)
        const common = used.length ? used : COMMON.map(id => byId.get(id)).filter((c): c is Command => !!c && !shown.has(c) && isEnabled(c))
        if (common.length) sections.push({ key: 'frequent', label: used.length ? 'Most used' : 'Suggested', strength: 2200, items: common.map(c => ({ kind: 'command', command: c, score: 0 })) })
        common.forEach(c => shown.add(c))
      }
      // everything else, alphabetically; unavailable commands only when browsing commands on purpose
      const rest = visible.filter(c => !shown.has(c)).map(c => ({ c, on: isEnabled(c) })).filter(x => x.on || !all)
        .sort((a, b) => Number(b.on) - Number(a.on) || a.c.title.localeCompare(b.c.title))
      sections.push({ key: 'commands', label: all ? 'All commands' : 'Commands', strength: 2000, items: rest.map(({ c, on }) => ({ kind: 'command', command: c, disabled: !on, score: 0 })) })
    } else {
      const recentRank = new Map(inp.recent.map((id, i) => [id, i]))
      const scored: PaletteItem[] = []
      for (const c of visible) {
        const m = fuzzy(q, c.title)
        // keyword / category matches are listed below title matches and say why they matched
        const why = m ? undefined : keywordReason(q, c) ?? undefined
        const hit = m ?? (why ? { score: -200 - why.length, positions: [] } : null)
        if (!hit) continue
        const r = recentRank.get(c.id)
        const enabled = isEnabled(c)
        const score = hit.score + (r != null ? 60 - r * 3 : 0) - (enabled ? 0 : 150)
        scored.push({ kind: 'command', command: c, positions: m?.positions, disabled: !enabled, recent: r != null, score, why })
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
  if ((all && sq) || mode === 'patients') {
    const items: PaletteItem[] = []
    for (const p of inp.patients) {
      const label = patientName(p)
      if (!sq) { items.push({ kind: 'patient', patient: p, label, score: p.updatedAt }); continue }
      const m = fuzzy(sq, label) ?? fuzzy(sq, `${p.firstName} ${p.lastName}`)
      if (m) items.push({ kind: 'patient', patient: p, label, positions: fuzzy(sq, label)?.positions, score: m.score })
    }
    items.sort((a, b) => b.score - a.score)
    if (items.length) sections.push({ key: 'patients', label: 'Patients', strength: sq ? items[0].score : 1000, items: items.slice(0, lim(5, 100)) })
  }

  // remedies
  if ((all && sq) || mode === 'remedies') {
    const matches = sq ? inp.remedies(sq) : []
    const items: PaletteItem[] = matches.filter(m => !all || m.score >= 55).map(m => ({ kind: 'remedy', remedy: m.remedy, score: m.score }))
    if (items.length) sections.push({ key: 'remedies', label: 'Remedies', strength: (items[0].score) * 20, items })
  }

  // rubrics
  if ((all && sq.length >= 3) || (mode === 'rubrics' && sq.length >= 2)) {
    const { hits, pending } = inp.rubrics(slow)
    const items: PaletteItem[] = hits.map((h, i) => ({ kind: 'rubric', ref: h.ref, rep: h.rep, index: h.index, score: -i }))
    if (items.length || pending) {
      items.push({ kind: 'search', query: sq, score: -1000 })
      sections.push({ key: 'rubrics', label: 'Rubrics', strength: 1050, items, pending })
    }
  }

  // while the deferred query lags behind the typed text, its sections describe an older query:
  // keep them below everything that matches what is typed now
  if (all && slow !== text) for (const sec of sections) if (SLOW_SECTIONS.has(sec.key)) sec.strength -= 1e9
  if (all) sections.sort((a, b) => b.strength - a.strength)
  return sections
}

const SLOW_SECTIONS = new Set(['patients', 'remedies', 'rubrics'])

/**
 * Memoise a per-command predicate (enabled / checked) for one palette open: each command's callback
 * runs at most once however many keystrokes re-rank the list. Rebuilt when the registry changes.
 */
export function memoPerCommand<T>(fn: (c: Command) => T): (c: Command) => T {
  const cache = new Map<string, T>()
  return c => {
    if (cache.has(c.id)) return cache.get(c.id) as T
    const v = fn(c)
    cache.set(c.id, v)
    return v
  }
}

/** Remember the last result of a function of one string argument (per-keystroke work runs once per query). */
export function lastOf<T>(fn: (q: string) => T): (q: string) => T {
  let key: string | null = null
  let val: T
  return q => {
    if (q !== key) { val = fn(q); key = q }
    return val
  }
}

// ───────────── recent commands & initial query (per-viewer conveniences) ─────────────

const RECENT_KEY = 'palette.recent'

export function recentCommands(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}

const COUNT_KEY = 'palette.counts'

export function commandCounts(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(COUNT_KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number')) as Record<string, number> : {}
  } catch { return {} }
}

export function rememberCommand(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentCommands().filter(x => x !== id)].slice(0, 12)))
    const counts = commandCounts()
    counts[id] = (counts[id] ?? 0) + 1
    // keep the map small: drop the least used beyond 60 entries
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 60)
    localStorage.setItem(COUNT_KEY, JSON.stringify(Object.fromEntries(top)))
  } catch { /* storage blocked */ }
}

let initialQuery = ''
let liveSetter: ((q: string) => void) | null = null
/** Pre-fill the palette (e.g. '#' for remedies): the open palette updates, or the next one starts with it. */
export function setInitialQuery(q: string) { if (liveSetter) liveSetter(q); else initialQuery = q }
export function takeInitialQuery(): string { const q = initialQuery; initialQuery = ''; return q }
/** The mounted palette registers its query setter here. */
export function bindQuerySetter(fn: ((q: string) => void) | null) { liveSetter = fn }
