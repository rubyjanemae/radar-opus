/**
 * Pure row models of the table of contents' other lists (References, Remedies, Families, Bookmarks):
 * flat rows with a depth, shown by TocList. No React.
 */

export interface ListRow {
  key: string
  depth: number
  label: string
  /** Secondary text after the label (a remedy's name, a bookmark's book). */
  sub?: string
  /** Has children: a disclosure triangle; `open` says whether they are shown. */
  expandable?: boolean
  open?: boolean
  /** What a row is, for its glyph: section header, book, remedy, family group, bookmark folder, bookmark. */
  kind: 'section' | 'book' | 'remedy' | 'group' | 'folder' | 'bookmark'
  lang?: string
}

/** Case- and accent-insensitive fold. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface RemedyItem { id: number; abbrev: string; name: string }

/**
 * Remedies matching a query: abbreviations starting with it first, then names starting with it, then
 * any word of the name starting with it; each tier alphabetical by abbreviation. No query: all, by abbreviation.
 */
export function filterRemedies(list: readonly RemedyItem[], query: string): RemedyItem[] {
  const q = foldText(query.trim())
  const byAbbrev = (a: RemedyItem, b: RemedyItem) => a.abbrev.localeCompare(b.abbrev, 'en', { sensitivity: 'base' })
  if (!q) return [...list].sort(byAbbrev)
  const tiers: RemedyItem[][] = [[], [], []]
  for (const r of list) {
    const a = foldText(r.abbrev), n = foldText(r.name)
    if (a.startsWith(q)) tiers[0].push(r)
    else if (n.startsWith(q)) tiers[1].push(r)
    else if (n.split(/[^a-z0-9]+/).some(w => w.startsWith(q))) tiers[2].push(r)
  }
  return tiers.flatMap(t => t.sort(byAbbrev))
}

/** Index of the row the cursor moves to; null when it stays. */
export function stepCursor(count: number, at: number, key: 'up' | 'down' | 'home' | 'end' | 'pageUp' | 'pageDown', page = 10): number | null {
  if (count === 0) return null
  const from = at < 0 ? 0 : at
  const to = key === 'up' ? from - 1 : key === 'down' ? (at < 0 ? 0 : from + 1) : key === 'home' ? 0 : key === 'end' ? count - 1
    : key === 'pageUp' ? from - page : from + page
  const clamped = Math.max(0, Math.min(count - 1, to))
  return clamped === at ? null : clamped
}

/** Parent row of row k (the nearest row above with a smaller depth), -1 for a top-level row. */
export function parentOf(rows: readonly ListRow[], k: number): number {
  const d = rows[k]?.depth ?? 0
  for (let i = k - 1; i >= 0; i--) if (rows[i].depth < d) return i
  return -1
}

/** Type-ahead: the next row (after `at`, wrapping) whose label starts with `text`. */
export function findTyped(rows: readonly ListRow[], at: number, text: string): number | null {
  const t = foldText(text)
  if (!t || rows.length === 0) return null
  const start = text.length > 1 ? Math.max(0, at) : at + 1
  for (let n = 0; n < rows.length; n++) {
    const i = (start + n) % rows.length
    if (foldText(rows[i].label).startsWith(t)) return i
  }
  return null
}
