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
