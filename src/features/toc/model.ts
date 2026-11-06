/**
 * Table of contents model (pure): the flat list of tree rows the TOC panel renders and walks with the
 * keyboard, document labels in the RadarOpus style ("KENT J. Repertory") and cursor movement.
 */

export const TILES_PER_ROW = 7

export type SectionId = 'reps' | 'fams'

/** A document listed in the table of contents. */
export interface TocDoc {
  /** Unique key: `rep:<abbrev>` or `fam:<id>`. */
  key: string
  kind: 'rep' | 'fam'
  /** Repertory abbreviation (rep) or family classification id (fam). */
  id: string
  label: string
  lang: string
  /** Searchable text besides the label (full title, abbreviation). */
  extra?: string
}

export type TocRow =
  | { kind: 'section'; key: string; section: SectionId; label: string; open: boolean; depth: 0 }
  | { kind: 'doc'; key: string; doc: TocDoc; open: boolean; expandable: boolean; depth: 1 }
  /** The chapter tiles of an expanded repertory; `count` tiles (0 while the book loads). */
  | { kind: 'grid'; key: string; doc: TocDoc; count: number; depth: 2 }
  /** A child of an expanded families document (a kingdom). */
  | { kind: 'group'; key: string; doc: TocDoc; id: string; label: string; depth: 2 }
  /** Loading / empty placeholder row under an expanded document. */
  | { kind: 'note'; key: string; label: string; depth: 2 }

/** "Vladimir Polony" -> "POLONY V."; "J. T. Kent" -> "KENT J."; empty author -> "". */
export function authorShort(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const surname = parts[parts.length - 1].replace(/[.,]+$/, '')
  const first = parts.length > 1 ? parts[0].replace(/[^\p{L}]/gu, '').charAt(0) : ''
  return `${surname.toLocaleUpperCase()}${first ? ` ${first.toLocaleUpperCase()}.` : ''}`
}

/** "POLONY V. Repertorium Publicum" (the title alone without an author). */
export function docLabel(author: string, title: string): string {
  const a = authorShort(author)
  return a ? `${a} ${title}` : title
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** Documents matching the "Search for a repertory" text (every word must occur). */
export function filterDocs(docs: readonly TocDoc[], query: string): TocDoc[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return [...docs]
  return docs.filter(d => { const hay = fold(`${d.label} ${d.extra ?? ''}`); return words.every(w => hay.includes(w)) })
}

export interface BuildInput {
  reps: readonly TocDoc[]
  fams: readonly TocDoc[]
  /** Open section and document keys. */
  open: ReadonlySet<string>
  /** Chapter count of a loaded repertory (undefined while it loads, null when it failed). */
  chapterCount: (abbrev: string) => number | undefined | null
  /** Top-level groups of a families document (undefined while it loads). */
  groups: (id: string) => { id: string; label: string }[] | undefined
  /** While filtering, sections open regardless of their stored state. */
  filtering?: boolean
}

export function buildRows(x: BuildInput): TocRow[] {
  const rows: TocRow[] = []
  const section = (section: SectionId, label: string, docs: readonly TocDoc[]) => {
    if (x.filtering && !docs.length) return
    const key = `sec:${section}`
    const open = x.filtering || x.open.has(key)
    rows.push({ kind: 'section', key, section, label, open, depth: 0 })
    if (!open) return
    for (const doc of docs) {
      const dOpen = x.open.has(doc.key)
      rows.push({ kind: 'doc', key: doc.key, doc, open: dOpen, expandable: true, depth: 1 })
      if (!dOpen) continue
      if (doc.kind === 'rep') {
        const n = x.chapterCount(doc.id)
        if (n == null) rows.push({ kind: 'note', key: `${doc.key}:note`, label: n === null ? 'Could not load the chapters' : 'Loading chapters…', depth: 2 })
        else rows.push({ kind: 'grid', key: `${doc.key}:grid`, doc, count: n, depth: 2 })
      } else {
        const g = x.groups(doc.id)
        if (!g) rows.push({ kind: 'note', key: `${doc.key}:note`, label: 'Loading…', depth: 2 })
        else for (const c of g) rows.push({ kind: 'group', key: `${doc.key}:${c.id}`, doc, id: c.id, label: c.label, depth: 2 })
      }
    }
  }
  section('reps', 'Repertories', x.reps)
  section('fams', 'Families of remedies', x.fams)
  return rows
}

/** Keyboard cursor: a row key, and the tile index when the row is a chapter grid. */
export interface Cursor { key: string; tile: number }

/** Rows the cursor can stand on (notes are skipped; an empty grid too). */
const focusable = (r: TocRow) => r.kind !== 'note' && !(r.kind === 'grid' && r.count === 0)

/** The parent row index of row k (the nearest row above with a smaller depth), -1 at the top. */
export function parentRow(rows: readonly TocRow[], k: number): number {
  for (let j = k - 1; j >= 0; j--) if (rows[j].depth < rows[k].depth) return j
  return -1
}

function step(rows: readonly TocRow[], k: number, dir: 1 | -1): number {
  for (let j = k + dir; j >= 0 && j < rows.length; j += dir) if (focusable(rows[j])) return j
  return -1
}

const at = (rows: readonly TocRow[], k: number, tile = 0): Cursor => ({ key: rows[k].key, tile })

export type Move = 'up' | 'down' | 'left' | 'right' | 'home' | 'end'

/**
 * Where a key moves the cursor. Up/Down walk rows and the grid's rows of tiles (keeping the column
 * where possible); Left/Right move between tiles, and from a tree row return `toggle` when the row
 * should collapse or expand instead of moving.
 */
export function move(rows: readonly TocRow[], cur: Cursor, m: Move): Cursor | { toggle: string; open: boolean } | null {
  let k = rows.findIndex(r => r.key === cur.key)
  if (k < 0) { const f = step(rows, -1, 1); return f < 0 ? null : at(rows, f) }
  const row = rows[k]
  const tile = row.kind === 'grid' ? Math.min(cur.tile, row.count - 1) : 0
  const cols = TILES_PER_ROW
  if (m === 'home') { const f = step(rows, -1, 1); return f < 0 ? null : at(rows, f) }
  if (m === 'end') {
    const l = step(rows, rows.length, -1)
    if (l < 0) return null
    const r = rows[l]
    return at(rows, l, r.kind === 'grid' ? r.count - 1 : 0)
  }
  if (m === 'down') {
    if (row.kind === 'grid' && tile + cols < row.count) return at(rows, k, tile + cols)
    if (row.kind === 'grid' && Math.floor(tile / cols) < Math.floor((row.count - 1) / cols)) return at(rows, k, row.count - 1)
    const n = step(rows, k, 1)
    return n < 0 ? null : at(rows, n)
  }
  if (m === 'up') {
    if (row.kind === 'grid' && tile - cols >= 0) return at(rows, k, tile - cols)
    const p = step(rows, k, -1)
    if (p < 0) return null
    const r = rows[p]
    if (r.kind === 'grid') {
      // land in the grid's last row, in the same column when it has one
      const lastRow = Math.floor((r.count - 1) / cols) * cols
      return at(rows, p, Math.min(r.count - 1, lastRow + (row.kind === 'grid' ? tile % cols : 0)))
    }
    return at(rows, p)
  }
  if (m === 'right') {
    if (row.kind === 'grid') return tile + 1 < row.count ? at(rows, k, tile + 1) : null
    if ((row.kind === 'section' || (row.kind === 'doc' && row.expandable)) && !row.open) return { toggle: row.key, open: true }
    if (row.kind === 'section' || row.kind === 'doc') {
      const n = k + 1 < rows.length && rows[k + 1].depth > row.depth && focusable(rows[k + 1]) ? k + 1 : -1
      return n < 0 ? null : at(rows, n)
    }
    return null
  }
  // left
  if (row.kind === 'grid' && tile > 0) return at(rows, k, tile - 1)
  if ((row.kind === 'section' || row.kind === 'doc') && row.open) return { toggle: row.key, open: false }
  k = parentRow(rows, k)
  return k < 0 ? null : at(rows, k)
}

/** The text a row is found by when typing its first letters (null for grids and notes). */
export function rowLabel(r: TocRow): string | null {
  if (r.kind === 'section' || r.kind === 'group' || r.kind === 'note') return r.kind === 'note' ? null : r.label
  if (r.kind === 'doc') return r.doc.label
  return null
}

/**
 * Type-ahead: the next row (after the cursor for a single letter, from the cursor for a longer
 * prefix, wrapping around) whose label starts with `text`, ignoring case and accents.
 */
export function typeahead(rows: readonly TocRow[], cur: Cursor, text: string): Cursor | null {
  const t = fold(text)
  if (!t || !rows.length) return null
  const k = Math.max(0, rows.findIndex(r => r.key === cur.key))
  const from = t.length === 1 ? k + 1 : k
  for (let n = 0; n < rows.length; n++) {
    const j = (from + n) % rows.length
    const l = rowLabel(rows[j])
    if (l != null && fold(l).startsWith(t)) return at(rows, j)
  }
  return null
}

/** PageUp / PageDown: `n` steps up or down (rows, or tile rows inside a grid), stopping at the ends. */
export function pageMove(rows: readonly TocRow[], cur: Cursor, dir: 'up' | 'down', n: number): Cursor | null {
  let c: Cursor | null = null
  let p = cur
  for (let i = 0; i < Math.max(1, n); i++) {
    const m = move(rows, p, dir)
    if (!m || 'toggle' in m) break
    c = p = m
  }
  return c
}
