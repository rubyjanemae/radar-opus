import type { Repertory } from '../../data/repertory'
import type { Bookmark } from '../../state/workspace'
import { matchChapters } from './take'

/** Flatten the visible tree rows: chapters, then children of expanded nodes, in book order. */
export function flattenTree(rep: Pick<Repertory, 'children'>, chapters: readonly number[], expanded: Set<number>): number[] {
  const out: number[] = []
  const walk = (i: number) => {
    out.push(i)
    if (expanded.has(i)) for (const c of rep.children(i)) walk(c)
  }
  for (const c of chapters) walk(c)
  return out
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
