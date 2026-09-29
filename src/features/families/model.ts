/**
 * Remedy families: pure data model over public/data/families.json (no React, no fetch).
 * A group's `remedies` already include those of its sub-groups.
 */

export type GroupKind =
  | 'kingdom' | 'clade' | 'order' | 'family' | 'group' | 'category' | 'period' | 'element' | 'series' | 'salt' | 'theme'

export interface FamilyGroup {
  id: string
  name: string
  kind: GroupKind | string
  parent: string | null
  note?: string
  /** All member remedies, sub-groups included, ascending. */
  remedies: number[]
  /** Remedies whose main classification is this group. */
  primary?: number[]
}

export interface FamiliesFile {
  version: number
  source: { id: string; title: string; licence?: string; note?: string; coverage?: number; remedyCount?: number; classified?: number }
  groups: FamilyGroup[]
}

export interface Node extends FamilyGroup {
  depth: number
  children: string[]
  /** Root → this group ids (inclusive). */
  path: string[]
  /** Kingdom (or theme root) id. */
  root: string
}

/** Human label for a group kind, used as the classification "system". */
export const KIND_LABEL: Record<string, string> = {
  kingdom: 'Kingdom', clade: 'Clade', order: 'Order', family: 'Family', group: 'Group', category: 'Category',
  period: 'Period', element: 'Element', series: 'Series', salt: 'Salt', theme: 'Theme',
}

export class FamilyIndex {
  readonly source: FamiliesFile['source']
  readonly nodes: Node[]
  readonly byId: Map<string, Node>
  readonly roots: string[]
  private readonly ofRemedy = new Map<number, string[]>()
  private readonly primaryOf = new Map<number, string>()

  constructor(file: FamiliesFile) {
    this.source = file.source
    this.byId = new Map()
    this.nodes = []
    for (const g of file.groups) {
      const n: Node = { ...g, depth: 0, children: [], path: [], root: g.id }
      this.byId.set(g.id, n)
      this.nodes.push(n)
    }
    this.roots = []
    for (const n of this.nodes) {
      if (n.parent && this.byId.has(n.parent)) this.byId.get(n.parent)!.children.push(n.id)
      else this.roots.push(n.id)
    }
    const walk = (id: string, depth: number, path: string[], root: string) => {
      const n = this.byId.get(id)!
      n.depth = depth
      n.path = [...path, id]
      n.root = root
      for (const c of n.children) walk(c, depth + 1, n.path, root)
    }
    for (const r of this.roots) walk(r, 0, [], r)
    for (const n of this.nodes) {
      for (const r of n.remedies) {
        let l = this.ofRemedy.get(r)
        if (!l) this.ofRemedy.set(r, (l = []))
        l.push(n.id)
      }
      for (const r of n.primary ?? []) this.primaryOf.set(r, n.id)
    }
  }

  get(id: string): Node | undefined { return this.byId.get(id) }

  remediesOf(id: string): number[] { return this.byId.get(id)?.remedies ?? [] }

  /** Every group containing the remedy, in file (tree) order. */
  allGroupsOf(remedyId: number): Node[] {
    return (this.ofRemedy.get(remedyId) ?? []).map(id => this.byId.get(id)!)
  }

  /** The remedy's main classification group (family, cation element …), if any. */
  primaryGroupOf(remedyId: number): Node | undefined {
    const id = this.primaryOf.get(remedyId)
    return id ? this.byId.get(id) : undefined
  }

  kingdomOf(remedyId: number): Node | undefined {
    return this.allGroupsOf(remedyId).find(n => n.kind === 'kingdom')
  }

  /**
   * The groups worth showing for a remedy: its primary group first, then its other most
   * specific groups (leaves of its membership, i.e. no member child), then the kingdom.
   * Pure containers (period list, salt list, themes root) are skipped.
   */
  groupsOfRemedy(remedyId: number): Node[] {
    const all = this.allGroupsOf(remedyId)
    const ids = new Set(all.map(n => n.id))
    const leaves = all.filter(n => n.kind !== 'kingdom' && !n.children.some(c => ids.has(c)))
    const prim = this.primaryGroupOf(remedyId)
    const out: Node[] = []
    if (prim) out.push(prim)
    for (const n of leaves) if (n !== prim) out.push(n)
    // the lineage of the primary group (order, clade …) gives useful broader limits
    if (prim) for (const id of [...prim.path].reverse().slice(1)) {
      const n = this.byId.get(id)!
      if (n.kind !== 'kingdom' && n.kind !== 'category' && !out.includes(n)) out.push(n)
    }
    const k = all.find(n => n.kind === 'kingdom')
    if (k) out.push(k)
    return out
  }

  /** Union of the members of several groups, ascending. */
  union(ids: Iterable<string>): number[] {
    const s = new Set<number>()
    for (const id of ids) for (const r of this.remediesOf(id)) s.add(r)
    return [...s].sort((a, b) => a - b)
  }

  /** Short breadcrumb label: "Plants › Eudicots › Ranunculales › Ranunculaceae". */
  pathLabel(id: string, sep = ' › '): string {
    const n = this.byId.get(id)
    return n ? n.path.map(p => this.byId.get(p)!.name).join(sep) : id
  }
}

export interface TreeRow {
  id: string
  depth: number
  hasChildren: boolean
  expanded: boolean
  /** Search hit (the group itself matches the query). */
  match: boolean
}

/** Normalise for matching: lower case, no diacritics, no punctuation. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9₀-₉]+/g, ' ').trim()
}

/** True when every query word is a prefix of some word of the text ("nat" finds Natrium, not Carbonates). */
export function matches(text: string, query: string): boolean {
  const q = fold(query)
  if (!q) return true
  const words = fold(text).split(' ')
  return q.split(' ').every(w => words.some(x => x.startsWith(w)))
}

/**
 * Visible rows of the tree. Without a query: DFS over expanded nodes.
 * With a query: matching groups plus all their ancestors, fully expanded (collapsing is still honoured for matches' own children).
 */
export function visibleRows(index: FamilyIndex, expanded: ReadonlySet<string>, query = ''): TreeRow[] {
  const rows: TreeRow[] = []
  const q = query.trim()
  if (!q) {
    const walk = (id: string) => {
      const n = index.get(id)!
      const exp = expanded.has(id)
      rows.push({ id, depth: n.depth, hasChildren: n.children.length > 0, expanded: exp, match: false })
      if (exp) for (const c of n.children) walk(c)
    }
    for (const r of index.roots) walk(r)
    return rows
  }
  const hit = new Set<string>()
  const keep = new Set<string>()
  for (const n of index.nodes) {
    if (matches(n.name, q) || (n.note && matches(n.note, q))) {
      hit.add(n.id)
      for (const p of n.path) keep.add(p)
    }
  }
  const walk = (id: string) => {
    const n = index.get(id)!
    const isHit = hit.has(id)
    const kids = n.children.filter(c => keep.has(c))
    // ancestors of hits open automatically; a hit without matching descendants shows its children only when expanded
    const exp = kids.length > 0 || (isHit && expanded.has(id))
    rows.push({ id, depth: n.depth, hasChildren: n.children.length > 0, expanded: exp && (kids.length > 0 || isHit), match: isHit })
    if (!exp) return
    const show = isHit && expanded.has(id) ? n.children : kids
    for (const c of show) walk(c)
  }
  for (const r of index.roots) if (keep.has(r)) walk(r)
  return rows
}

/** Ancestors of a group (excluding itself) – used to reveal a group in the tree. */
export function ancestorsOf(index: FamilyIndex, id: string): string[] {
  const n = index.get(id)
  return n ? n.path.slice(0, -1) : []
}

export interface RemedyLite { id: number; abbrev: string; name: string; altName?: string | null }

/** Remedies matching a query by abbreviation (exact / prefix first) or name; `limit` caps the result (default: all). */
export function searchRemedies(list: Iterable<RemedyLite>, query: string, limit = Infinity): RemedyLite[] {
  const q = fold(query)
  if (!q) return []
  const scored: { r: RemedyLite; s: number }[] = []
  for (const r of list) {
    const a = fold(r.abbrev)
    let s = -1
    if (a === q) s = 0
    else if (a.startsWith(q)) s = 1
    else if (matches(r.name, query)) s = 2
    else if (r.altName && matches(r.altName, query)) s = 3
    if (s >= 0) scored.push({ r, s })
  }
  scored.sort((x, y) => x.s - y.s || x.r.abbrev.localeCompare(y.r.abbrev))
  return scored.slice(0, limit).map(x => x.r)
}

/** Label for a filter built from several groups: "Solanaceae", "Solanaceae + Ranunculaceae", "Solanaceae + 2 more". */
export function unionLabel(index: FamilyIndex, ids: string[]): string {
  const names = ids.map(id => index.get(id)?.name ?? id)
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} + ${names.length - 1} more`
}

/**
 * Classification "system" of a group for display next to its name (e.g. in the remedy window).
 * Nested zoological groups are labelled by their parent ("Snakes: Viperidae", "Reptiles: Snakes"),
 * so a remedy's lineage reads as a chain instead of repeating "Zoological group".
 */
export function systemLabel(n: Node, index?: FamilyIndex): string {
  if (n.kind === 'kingdom') return 'Kingdom'
  if (n.root === 'k:plant') return n.kind === 'family' ? 'Botanical family' : n.kind === 'order' ? 'Botanical order' : 'Plant clade'
  if (n.root === 'k:mineral') {
    if (n.kind === 'element') return 'Element'
    if (n.kind === 'salt') return 'Salt'
    if (n.kind === 'period') return 'Period'
    if (n.id.startsWith('mineral:pgroup:')) return 'Periodic group'
    return 'Mineral group'
  }
  if (n.root === 'k:animal') {
    const parent = n.depth >= 2 && n.parent ? index?.get(n.parent) : undefined
    return parent ? parent.name : 'Zoological group'
  }
  if (n.root === 'k:fungus') return 'Fungal group'
  if (n.root === 'k:nosode') return 'Nosode type'
  if (n.root === 'k:sarcode') return 'Sarcode type'
  if (n.root === 'theme') return 'Theme'
  return KIND_LABEL[n.kind] ?? 'Group'
}

function sameSet(a: readonly number[], b: ReadonlySet<number>): boolean {
  if (a.length !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

/**
 * Split a remedy set into family groups whose union is exactly that set (to pre-check a filter that
 * was built elsewhere, e.g. from the remedy window). Prefers the largest groups and drops groups made
 * redundant by the others; null when the set is not a union of groups.
 */
export function decomposeGroups(index: FamilyIndex, remedies: readonly number[] | null | undefined): string[] | null {
  if (!remedies?.length) return null
  const want = new Set(remedies)
  const exact = groupMatching(index, remedies)
  if (exact) return [exact]
  // groups entirely inside the set; ties keep tree order, so a family beats its same-sized theme duplicate
  const inside = index.nodes.filter(n => n.remedies.length > 0 && n.remedies.length < want.size && n.remedies.every(r => want.has(r)))
  inside.sort((a, b) => b.remedies.length - a.remedies.length)
  const covered = new Set<number>()
  const picked: Node[] = []
  for (const n of inside) {
    if (n.remedies.some(r => !covered.has(r))) {
      picked.push(n)
      for (const r of n.remedies) covered.add(r)
      if (covered.size === want.size) break
    }
  }
  if (covered.size !== want.size) return null
  // drop a pick whose remedies the other picks already cover
  for (let i = picked.length - 1; i >= 0; i--) {
    const others = new Set<number>()
    picked.forEach((p, j) => { if (j !== i) for (const r of p.remedies) others.add(r) })
    if (picked[i].remedies.every(r => others.has(r))) picked.splice(i, 1)
  }
  // present them in tree order
  const order = new Map(index.nodes.map((n, i) => [n.id, i]))
  return picked.map(p => p.id).sort((a, b) => order.get(a)! - order.get(b)!)
}

/**
 * The family groups behind a filter: the stored group ids when they still produce exactly that remedy set
 * (another dialog may have changed the set since), else a decomposition of the set; [] when there is no filter
 * and null when the set is not made of families.
 */
export function groupsOfFilter(index: FamilyIndex, stored: readonly string[] | null | undefined, remedies: readonly number[] | null | undefined): string[] | null {
  if (!remedies?.length) return []
  if (stored?.length && stored.every(id => index.get(id)) && sameSet(index.union(stored), new Set(remedies))) return [...stored]
  return decomposeGroups(index, remedies)
}

/**
 * aria-setsize / aria-posinset of each visible tree row: position among the siblings shown at its level
 * (APG tree pattern for virtualised trees, where the DOM holds only a window of the rows).
 */
export function rowPositions(rows: readonly TreeRow[]): { size: number; pos: number }[] {
  const out: { size: number; pos: number }[] = new Array(rows.length)
  // stack of open levels: indexes of rows sharing a parent
  const stack: number[][] = [[]]
  for (let i = 0; i < rows.length; i++) {
    const level = rows[i].depth - rows[0].depth
    while (stack.length > level + 1) close(stack.pop()!)
    while (stack.length < level + 1) stack.push([])
    stack[level].push(i)
  }
  while (stack.length) close(stack.pop()!)
  function close(sibs: number[]) { sibs.forEach((i, k) => { out[i] = { size: sibs.length, pos: k + 1 } }) }
  return out
}

/** Find the group whose members equal a remedy list (to pre-check the current filter). */
export function groupMatching(index: FamilyIndex, remedies: readonly number[] | null | undefined): string | null {
  if (!remedies?.length) return null
  const sorted = [...remedies].sort((a, b) => a - b)
  for (const n of index.nodes) {
    if (n.remedies.length !== sorted.length) continue
    if (n.remedies.every((r, i) => r === sorted[i])) return n.id
  }
  return null
}

