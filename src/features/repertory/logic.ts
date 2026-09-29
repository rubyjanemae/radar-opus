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
