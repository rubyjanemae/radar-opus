import type { Command } from '../../commands/registry'
import { formatKeys, normaliseChord, usableKeys } from '../../commands/registry'

export interface ShortcutRow {
  id: string
  title: string
  category: string
  /** Shortcuts in registry form ("Mod+Shift+K"); empty for commands without one. Never a browser-reserved chord. */
  keys: string[]
  /** Where the keys work when they are limited to one view ("in the clipboard list"). */
  scope?: string
}
export interface ShortcutGroup { category: string; rows: ShortcutRow[] }

/** Menubar order; other categories follow alphabetically. */
export const CATEGORY_ORDER = ['File', 'Edit', 'View', 'Repertory', 'Search', 'Case', 'Analysis', 'Tools', 'Help']

/** Static reference rows (keys handled inside views rather than by registered commands). */
export interface ReferenceRow { keys: string[]; title: string; detail?: string }
export interface ReferenceSection { id: string; title: string; rows: ReferenceRow[] }

export const TAKE_LANGUAGE: ReferenceSection = {
  id: 'take',
  title: 'Take mini-language',
  rows: [
    { keys: ['+ ↵', '= ↵'], title: 'Take the rubric at intensity 1 into the active clipboard' },
    { keys: ['+2'], title: 'Take with intensity 2', detail: 'Intensity is one digit, 0–4; 0 keeps the symptom out of the score.' },
    { keys: ['+1>3'], title: 'Intensity 1 into clipboard 3', detail: 'Clipboards are numbered 1–12.' },
    { keys: ['+!'], title: 'Eliminative symptom', detail: 'Only remedies in this rubric stay in the analysis.' },
    { keys: ['+x'], title: 'Excluding symptom' },
    { keys: ['+c'], title: 'Causal symptom' },
    { keys: ['+a'], title: 'Put the symptom in group a', detail: 'Any letter except c, s and x names a group.' },
    { keys: ['+/s'], title: 'Take together with all sub-rubrics as one symptom' },
    { keys: ['+2>1!a/s'], title: 'Options combine in any order after intensity and clipboard' },
  ],
}

export const REPERTORY_KEYS: ReferenceSection = {
  id: 'repertory',
  title: 'In the repertory',
  rows: [
    { keys: ['↑', '↓'], title: 'Previous or next rubric' },
    { keys: ['→', '↵'], title: 'Open the first sub-rubric' },
    { keys: ['←', '⌫'], title: 'Up to the parent rubric' },
    { keys: ['A–Z'], title: 'Type letters to jump to a sub-rubric', detail: 'In the navigator tree, typing jumps to the next matching rubric.' },
    { keys: ['Space'], title: 'Cycle the display: remedy count, remedies' },
    { keys: ['+', '='], title: 'Open the take bar (see the mini-language)' },
    { keys: [`${formatKeys('Mod')}+↵`], title: 'Take the rubric at intensity 1' },
    { keys: ['PgUp', 'PgDn'], title: 'Page through rubrics' },
    { keys: ['Home', 'End'], title: 'First or last rubric in view' },
    { keys: ['*'], title: 'Expand all children (navigator)' },
  ],
}

export const GENERAL_KEYS: ReferenceSection = {
  id: 'general',
  title: 'Everywhere',
  rows: [
    { keys: ['F10', 'Alt'], title: 'Focus the menu bar' },
    { keys: ['Shift+F10', 'Menu'], title: 'Open the context menu of the focused item' },
    { keys: ['Esc'], title: 'Close the dialog, menu or overlay' },
    { keys: ['Tab', 'Shift+Tab'], title: 'Move between controls' },
  ],
}

export const CLIPBOARD_KEYS: ReferenceSection = {
  id: 'clipboard',
  title: 'In the clipboard list',
  rows: [
    { keys: ['0–4'], title: 'Set the intensity of the selected symptoms', detail: '0 keeps a symptom out of the score.' },
    { keys: ['↑', '↓'], title: 'Move between symptoms; Shift extends the selection' },
    { keys: ['Del'], title: 'Remove the selected symptoms' },
  ],
}

export const REFERENCE_SECTIONS = [TAKE_LANGUAGE, REPERTORY_KEYS, CLIPBOARD_KEYS, GENERAL_KEYS]

/** Human names for the view scopes commands are bound to (CSS selectors in the registry). */
export const SCOPE_LABELS: Record<string, string> = {
  '.cbp-list': 'in the clipboard list',
  '.cbp': 'in the clipboard panel',
  '.rv': 'in the repertory',
  '.srch-results': 'in search results',
  '.fam-view': 'in families & kingdoms',
}

export function scopeLabel(c: Pick<Command, 'scope' | 'scopeLabel'>): string | undefined {
  if (c.scopeLabel) return c.scopeLabel
  if (!c.scope) return undefined
  return SCOPE_LABELS[c.scope] ?? 'in its view'
}

/**
 * Browser shortcuts Radar Opus takes over while it has focus, with what the browser would have done.
 * Listed in the shortcuts reference so nobody is surprised that F5 does not reload.
 */
export const BROWSER_DEFAULTS: Record<string, string> = {
  F1: 'browser help', F3: 'find next on page', F5: 'reload the page', F6: 'focus the address bar', F7: 'caret browsing',
  'Mod+D': 'bookmark this page', 'Mod+Shift+D': 'bookmark all tabs', 'Mod+J': 'downloads', 'Mod+Shift+C': 'inspect element',
  'Mod+F': 'find on page', 'Mod+P': 'print', 'Mod+K': 'search the web', 'Mod+B': 'bookmarks sidebar', 'Mod+Shift+B': 'bookmarks bar',
  'Mod+E': 'search the web', 'Mod+S': 'save the page', 'Mod+H': 'history', 'Mod+Shift+M': 'switch profile',
  'Mod+,': 'browser settings', 'Mod+=': 'zoom in', 'Mod++': 'zoom in', 'Mod+-': 'zoom out', 'Mod+0': 'reset zoom',
  'Alt+ArrowLeft': 'back', 'Alt+ArrowRight': 'forward', 'Mod+[': 'back', 'Mod+]': 'forward', 'Mod+Shift+F': 'full screen',
}

/** Reference rows for the browser shortcuts that registered commands override. */
export function overriddenBrowserKeys(cmds: Command[]): ReferenceSection {
  const rows = new Map<string, ReferenceRow>()
  for (const c of cmds) {
    for (const k of usableKeys(c.keys)) {
      const meaning = BROWSER_DEFAULTS[normaliseChord(k)]
      if (!meaning) continue
      const prev = rows.get(k)
      if (prev) { if (!prev.title.includes(c.title.replace(/…$/, ''))) prev.title += `; ${c.title.replace(/…$/, '')}` }
      else rows.set(k, { keys: [formatKeys(k)], title: c.title.replace(/…$/, ''), detail: `Instead of the browser's ${meaning}${c.scope ? ` (${scopeLabel(c)})` : ''}.` })
    }
  }
  return { id: 'browser', title: 'Browser keys used by Radar Opus', rows: [...rows.values()] }
}

function categoryRank(c: string) {
  const i = CATEGORY_ORDER.indexOf(c)
  return i < 0 ? CATEGORY_ORDER.length : i
}

/** Normalise a query or key label so "ctrl+shift+b", "Ctrl+Shift+B" and "⇧" style inputs compare loosely. */
export function normaliseKeyText(s: string) {
  return s.toLowerCase().replace(/\s+/g, '').replace(/control/g, 'ctrl').replace(/cmd|command|⌘/g, 'ctrl').replace(/⇧/g, 'shift').replace(/⌥|option/g, 'alt')
}

/** Split a chord ("Mod+Shift+F6", "Ctrl+⇧+B") into normalised key tokens. */
export function chordTokens(chord: string): string[] {
  return normaliseKeyText(chord).replace(/mod/g, 'ctrl').split('+').filter(Boolean)
}

/**
 * Does a key query ("F6", "ctrl+b", "shift+f6") match a chord? Every key named in the query must
 * be part of the chord, so "F6" finds Ctrl+F6 and Ctrl+Shift+F6 as well as F6 itself.
 */
export function chordMatches(chord: string, query: string): boolean {
  const q = normaliseKeyText(query).replace(/^mod/, 'ctrl').replace(/\+mod/g, '+ctrl')
  if (!q || /\s/.test(query.trim())) return false
  const want = q.split('+').filter(Boolean)
  if (!want.length) return false
  for (const form of [chord, formatKeys(chord)]) {
    const have = new Set(chordTokens(form))
    if (want.every(w => have.has(w))) return true
  }
  return false
}

/** Does a command match the search text? Matches title, category, id, keywords and the shortcut itself. */
export function matchesQuery(row: { title: string; category?: string; keys: string[]; id?: string; keywords?: string; detail?: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = `${row.title} ${row.category ?? ''} ${row.id ?? ''} ${row.keywords ?? ''} ${row.detail ?? ''}`.toLowerCase()
  const words = q.split(/\s+/)
  if (words.every(w => hay.includes(w))) return true
  // shortcut search: "F6", "ctrl+b", "mod+shift+b"
  return row.keys.some(k => chordMatches(k, q))
}

/**
 * Group registered commands by category for the shortcuts reference.
 * Only commands with a shortcut are listed unless `includeUnbound` is set.
 */
export function shortcutGroups(cmds: Command[], query = '', opts: { includeUnbound?: boolean } = {}): ShortcutGroup[] {
  const byCat = new Map<string, ShortcutRow[]>()
  const seen = new Set<string>()
  for (const c of cmds) {
    // chords the browser keeps for itself never reach the page: leave them out
    const keys = usableKeys(c.keys)
    if (!keys.length && !opts.includeUnbound) continue
    if (!matchesQuery({ ...c, keys }, query)) continue
    // one row per title+keys (e.g. strategy variants with identical labels stay distinct by id when unbound)
    const scope = scopeLabel(c)
    const sig = `${c.category}|${c.title}|${keys.join(',')}|${scope ?? ''}`
    if (keys.length && seen.has(sig)) continue
    seen.add(sig)
    const list = byCat.get(c.category) ?? []
    list.push({ id: c.id, title: c.title, category: c.category, keys, ...(scope && keys.length ? { scope } : {}) })
    byCat.set(c.category, list)
  }
  return [...byCat.entries()]
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
    .map(([category, rows]) => ({ category, rows: rows.sort((a, b) => (a.keys.length ? 0 : 1) - (b.keys.length ? 0 : 1) || a.title.localeCompare(b.title)) }))
}

/** Filter a static reference section by the search text. */
export function filterSection(section: ReferenceSection, query: string): ReferenceSection {
  if (!query.trim()) return section
  const titleHit = section.title.toLowerCase().includes(query.trim().toLowerCase())
  return { ...section, rows: titleHit ? section.rows : section.rows.filter(r => matchesQuery(r, query)) }
}
