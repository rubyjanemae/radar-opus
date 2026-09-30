import type { Repertory } from '../../data/repertory'
import type { Bookmark } from '../../state/workspace'
import type { AppState } from '../../state/store'
import { matchChapters } from './take'

/** Flatten the visible tree rows: chapters, then children of expanded nodes, in book order. */
export function flattenTree(rep: Pick<Repertory, 'children'>, chapters: readonly number[], expanded: ReadonlySet<number>): number[] {
  const out: number[] = []
  const walk = (i: number) => {
    out.push(i)
    if (expanded.has(i)) for (const c of rep.children(i)) walk(c)
  }
  for (const c of chapters) walk(c)
  return out
}

/**
 * Visible tree rows (as flattenTree) with each row's position among its siblings and the number of
 * siblings (aria-posinset / aria-setsize): chapters among the chapters listed, a sub-rubric among
 * all children of its parent, whatever part of the list is rendered.
 */
export function treeRows(rep: Pick<Repertory, 'children'>, chapters: readonly number[], expanded: ReadonlySet<number>): { rows: number[]; pos: number[]; size: number[] } {
  const rows: number[] = [], pos: number[] = [], size: number[] = []
  const walk = (i: number, p: number, n: number) => {
    rows.push(i); pos.push(p); size.push(n)
    if (!expanded.has(i)) return
    const kids = rep.children(i)
    kids.forEach((c, k) => walk(c, k + 1, kids.length))
  }
  chapters.forEach((c, k) => walk(c, k + 1, chapters.length))
  return { rows, pos, size }
}

/** Items at a find level: chapters when parent is -1, else the children of parent, filtered by type-ahead. */
export function levelItems(rep: Pick<Repertory, 'chapters' | 'children' | 'text'>, parent: number, query: string): number[] {
  const ids = parent < 0 ? [...rep.chapters] : rep.children(parent)
  if (!query.trim()) return ids
  return matchChapters(ids.map(id => ({ id, name: rep.text(id) })), query).map(x => x.id)
}

/** Folders in use plus locally created (still empty) ones, sorted with "General" first. */
export function bookmarkFolders(bookmarks: Pick<Bookmark, 'folder'>[], extra: string[] = []): string[] {
  const set = new Set([...bookmarks.map(b => b.folder), ...extra])
  return [...set].sort((a, b) => (a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b)))
}

/**
 * Order in which breadcrumb items fold away when the path does not fit. Items are
 * [repertory title, chapter, …levels, leaf]. The repertory title goes first, then the middle
 * levels left to right, then the chapter; the last two items (parent and leaf) never fold.
 */
export function crumbCollapseOrder(items: number): number[] {
  if (items <= 1) return []
  const keep = Math.max(1, items - 2) // indexes >= keep stay
  const out = [0]
  for (let x = 2; x < keep; x++) out.push(x)
  if (keep > 1) out.push(1)
  return out
}

/** Maximal runs of consecutive hidden indexes in [0, items). */
export function hiddenRuns(items: number, hidden: Set<number>): number[][] {
  const runs: number[][] = []
  let cur: number[] = []
  for (let x = 0; x < items; x++) {
    if (hidden.has(x)) cur.push(x)
    else if (cur.length) { runs.push(cur); cur = [] }
  }
  if (cur.length) runs.push(cur)
  return runs
}

export interface Crumb { label: string; ref: string | null }
/** One piece of the symptom path: a visible level, or a fold holding hidden levels. `x` is the level index. */
export type CrumbSegment =
  | { kind: 'item'; x: number; label: string; ref: string | null; last: boolean }
  | { kind: 'fold'; x: number; items: (Crumb & { x: number })[] }

/**
 * The symptom path as segment data: each level is shown whole unless hidden, and each run of
 * consecutive hidden levels folds into one segment. Pure; the component maps segments to JSX.
 */
export function crumbSegments(items: readonly Crumb[], hidden: Set<number>): CrumbSegment[] {
  const out: CrumbSegment[] = []
  let fold: (Crumb & { x: number })[] | null = null
  items.forEach((c, x) => {
    if (hidden.has(x)) {
      if (!fold) { fold = []; out.push({ kind: 'fold', x, items: fold }) }
      fold.push({ ...c, x })
      return
    }
    fold = null
    out.push({ kind: 'item', x, label: c.label, ref: c.ref, last: x === items.length - 1 })
  })
  return out
}

/**
 * Concise accessible name of a rubric row: its path, its remedy count and its marks, e.g.
 * "Mind, morning, 200 remedies, in clipboard 1". The remedy list is not part of it.
 */
const countFormat = new Intl.NumberFormat('en')
export function rubricLabel(path: readonly string[], remedies: number, marks: { clipboards?: readonly number[]; bookmarked?: boolean; note?: boolean } = {}): string {
  const parts = [path.join(', ')]
  if (remedies > 0) parts.push(`${countFormat.format(remedies)} ${remedies === 1 ? 'remedy' : 'remedies'}`)
  const cb = marks.clipboards ?? []
  if (cb.length) parts.push(`in clipboard${cb.length > 1 ? 's' : ''} ${cb.join(' and ')}`)
  if (marks.bookmarked) parts.push('bookmarked')
  if (marks.note) parts.push('has a note')
  return parts.join(', ')
}

/**
 * Where Find opens. F3 (`from`): at the current rubric's level, i.e. its sub-rubrics listed with the
 * first one highlighted; a rubric without sub-rubrics opens at its parent's level with itself
 * highlighted. "Stay in chapter" opens inside the current chapter; else the chapters are listed.
 */
export function findInitial(rep: Pick<Repertory, 'size' | 'parent' | 'children' | 'childCountOf' | 'lineage' | 'chapterRoot'>, o: { from: number; current: number; stay: boolean }): { level: number; active: number } {
  const { from, current, stay } = o
  if (from >= 0 && from < rep.size) {
    if (rep.childCountOf(from)) return { level: from, active: rep.children(from)[0] ?? -1 }
    return { level: rep.parent(from), active: from }
  }
  if (stay && current >= 0 && current < rep.size) {
    const line = rep.lineage(current)
    return { level: line[0], active: line[1] ?? rep.children(line[0])[0] ?? -1 }
  }
  return { level: -1, active: current >= 0 && current < rep.size ? rep.chapterRoot(current) : -1 }
}

/** Split a Find query into its filter and a trailing take command: "fear+2" → fear, +2. */
export function splitFindQuery(q: string): { filter: string; take: string | null } {
  const i = q.search(/[+=]/)
  return i < 0 ? { filter: q, take: null } : { filter: q.slice(0, i), take: q.slice(i) }
}

/**
 * How many breadcrumb items to fold (in `order`, see crumbCollapseOrder) so the path fits `avail`
 * px, from the items' natural widths: the smallest count that fits, or all of `order` (then the
 * remaining crumbs shrink with ellipses). Each hidden run becomes one "…" button of `foldW`; every
 * item or run after the first is preceded by a separator of `sepW`. Pure: no layout is read.
 */
export function crumbFoldCount(widths: readonly number[], order: readonly number[], avail: number, sepW: number, foldW: number): number {
  const total = (hidden: Set<number>) => {
    let w = 0
    for (const run of hiddenRuns(widths.length, hidden)) w += foldW + (run[0] > 0 ? sepW : 0)
    widths.forEach((x, i) => { if (!hidden.has(i)) w += x + (i > 0 ? sepW : 0) })
    return w
  }
  for (let n = 0; n < order.length; n++) if (total(new Set(order.slice(0, n))) <= avail) return n
  return order.length
}

/** Expanded nodes after following `rubric`: its ancestors open; entering another chapter folds the previous one. */
export function followExpanded(rep: Pick<Repertory, 'lineage' | 'subtreeEndOf'>, expanded: ReadonlySet<number>, rubric: number, prevChapter: number | null): ReadonlySet<number> {
  const line = rep.lineage(rubric)
  const chapter = line[0]
  let next: Set<number> | null = null
  const edit = () => (next ??= new Set(expanded))
  if (prevChapter != null && prevChapter !== chapter) {
    const end = rep.subtreeEndOf(chapter)
    for (const n of expanded) if (n < chapter || n >= end) edit().delete(n)
  }
  for (const a of line.slice(0, -1)) if (!expanded.has(a)) edit().add(a)
  return next ?? expanded
}

/**
 * The repertory tab the navigator shows: the active tab when it is a repertory, else the last
 * repertory tab read (or any open one), so it stays useful for jumping back into the book.
 * Returns an id, so the navigator re-renders only when the followed tab changes.
 */
export function selectNavigatorTabId(s: AppState): string | null {
  const active = s.tabs.find(t => t.id === s.activeTabId)
  if (active?.kind === 'repertory') return active.id
  return (s.tabs.find(t => t.id === s.lastRepertoryTabId && t.kind === 'repertory') ?? s.tabs.find(t => t.kind === 'repertory'))?.id ?? null
}

// ───────────── Find: paths and deeper matches ─────────────

type FindRep = Pick<Repertory, 'size' | 'chapters' | 'depth' | 'text' | 'subtreeEndOf'>

/** Lower-cased rubric texts per repertory, built once (Find scans a whole chapter or book per keystroke). */
const lowerTexts = new WeakMap<object, string[]>()
function lowerText(rep: FindRep, i: number): string {
  let t = lowerTexts.get(rep)
  if (!t) { t = new Array<string>(rep.size); lowerTexts.set(rep, t) }
  return (t[i] ??= rep.text(i).toLowerCase())
}

/** Whether a word of `text` (lower case) starts with `token`. */
export function wordStarts(text: string, token: string): boolean {
  if (!token) return false
  for (let at = text.indexOf(token); at >= 0; at = text.indexOf(token, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true
  }
  return false
}

/** Split a Find filter into lower-cased words ("head pain forehead" → head, pain, forehead). */
export function findTokens(filter: string): string[] {
  return filter.toLowerCase().split(/[\s,›>/]+/).filter(Boolean)
}

/** One deeper Find match: a rubric below the level, with the part of its path below the level. */
export interface DeepMatch { id: number; path: number[] }

/**
 * Rubrics below `level` (the chapters when -1) whose path from the level matches the words in order:
 * "head pain forehead" finds Head › pain › forehead. Each word matches the start of a word of one
 * path segment (a segment may take several words, and segments that take none are skipped); the
 * rubric itself must take the last word. At the chapter level the chapter must take the first word.
 * `within` narrows the search to that subtree (the current context). In book order, at most `limit`.
 */
export function pathMatches(rep: FindRep, level: number, filter: string, opts: { within?: number; limit?: number } = {}): DeepMatch[] {
  const tokens = findTokens(filter)
  const limit = opts.limit ?? 200
  if (!tokens.length) return []
  const root = opts.within != null && opts.within >= 0 ? opts.within : level
  const ranges: [number, number, number][] = root >= 0
    ? [[root + 1, rep.subtreeEndOf(root), rep.depth(root) + 1]]
    : rep.chapters.map(c => [c, rep.subtreeEndOf(c), 0] as [number, number, number])
  // words the context's own path (from the level down to `within`) already takes
  let pre = 0
  if (root !== level && root >= 0) {
    const segs: number[] = []
    for (let r = root; r >= 0 && r !== level; ) { segs.unshift(r); const d = rep.depth(r); let p = r - 1; while (p >= 0 && rep.depth(p) >= d) p--; r = p }
    for (const s of segs) pre = take(lowerText(rep, s), tokens, pre)
  }
  const out: DeepMatch[] = []
  const taken: number[] = [] // words taken down to each depth (relative)
  const stack: number[] = [] // the path below the level, by relative depth
  for (const [lo, hi, base] of ranges) {
    for (let i = lo; i < hi && out.length < limit; i++) {
      const d = rep.depth(i) - base
      const before = d === 0 ? pre : taken[d - 1]
      if (before >= tokens.length) { i = rep.subtreeEndOf(i) - 1; continue }
      const after = take(lowerText(rep, i), tokens, before)
      // at the chapter level the chapter must take the first word, else nothing below it matches
      if (root < 0 && d === 0 && after === before) { i = rep.subtreeEndOf(i) - 1; continue }
      taken[d] = after
      stack[d] = i
      if (after === tokens.length && after > before) out.push({ id: i, path: stack.slice(0, d + 1) })
    }
  }
  return out
}

/** Words taken greedily in order by one path segment, from word `from`. */
function take(text: string, tokens: string[], from: number): number {
  let t = from
  while (t < tokens.length && wordStarts(text, tokens[t])) t++
  return t
}
