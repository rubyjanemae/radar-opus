/**
 * Maps (RadarOpus's toolbar Maps ▾ and View › Maps): the remedies of the current analysis placed on a
 * map of where they come from, the periodic table of the elements or the kingdoms of nature. Pure model
 * over the families index (features/families) and an analysis ranking; no React.
 */
import type { FamilyIndex, FamilyNode } from '../families/api'

export type MapKind = 'periodic' | 'kingdoms'
export const MAP_KINDS: readonly MapKind[] = ['periodic', 'kingdoms']
export const MAP_TITLES: Record<MapKind, string> = { periodic: 'Periodic table', kingdoms: 'Kingdoms' }

/** A remedy's place in the analysis: its 1-based rank among the ranked (included) remedies. */
export type Ranking = ReadonlyMap<number, number>

/** Grid position of element `z` in the 18-column table; lanthanides / actinides on rows 9 and 10 (row 8 is the gap). */
export function periodicPosition(z: number): { row: number; col: number } | null {
  if (!Number.isInteger(z) || z < 1 || z > 118) return null
  if (z === 1) return { row: 1, col: 1 }
  if (z === 2) return { row: 1, col: 18 }
  // first Z of periods 2..7
  const starts = [3, 11, 19, 37, 55, 87]
  let i = starts.length - 1
  while (z < starts[i]) i--
  const period = i + 2
  const k = z - starts[i]
  if (period <= 3) return { row: period, col: k < 2 ? k + 1 : k + 11 }
  if (period <= 5) return { row: period, col: k + 1 }
  // periods 6 and 7: 2 s-block, 15 f-block (lanthanides / actinides incl. La / Ac), then groups 4..18
  if (k < 2) return { row: period, col: k + 1 }
  if (k < 17) return { row: period + 3, col: k + 1 }
  return { row: period, col: k - 13 }
}

export interface ElementCell {
  id: string
  /** Chemical symbol ("Na"). */
  symbol: string
  /** Latin remedy-style name ("Natrium"). */
  name: string
  z: number
  row: number
  col: number
  /** Remedies of this element (salts and compounds included). */
  remedies: number[]
  /** Its remedies ranked in the analysis, best first. */
  ranked: { remedyId: number; rank: number }[]
}

const Z_NOTE = /^Z\s*(\d+)$/
const SYMBOL = /^(.*?)\s*\(([A-Z][a-z]?)\)\s*$/

/** The element groups of the families index, placed on the periodic table, with their remedies' ranks. */
export function elementCells(index: FamilyIndex, ranking: Ranking): ElementCell[] {
  const out: ElementCell[] = []
  for (const n of index.nodes) {
    if (n.kind !== 'element') continue
    const z = Number(Z_NOTE.exec(n.note ?? '')?.[1])
    const pos = periodicPosition(z)
    const m = SYMBOL.exec(n.name)
    if (!pos || !m) continue
    out.push({ id: n.id, symbol: m[2], name: m[1], z, ...pos, remedies: n.remedies, ranked: rankedOf(n.remedies, ranking) })
  }
  return out.sort((a, b) => a.z - b.z)
}

export interface KingdomRow {
  id: string
  name: string
  /** Remedies in this kingdom. */
  size: number
  /** Its remedies ranked in the analysis, best first. */
  ranked: { remedyId: number; rank: number }[]
  /** How many of them rank within the top `top`. */
  inTop: number
}

/** The kingdoms (root groups, themes left out) with their remedies' ranks, in the index's order. */
export function kingdomRows(index: FamilyIndex, ranking: Ranking, top: number): KingdomRow[] {
  return index.roots
    .map(id => index.byId.get(id))
    .filter((n): n is FamilyNode => !!n && n.kind === 'kingdom')
    .map(n => {
      const ranked = rankedOf(n.remedies, ranking)
      return { id: n.id, name: n.name, size: n.remedies.length, ranked, inTop: ranked.filter(r => r.rank <= top).length }
    })
}

function rankedOf(remedies: readonly number[], ranking: Ranking): { remedyId: number; rank: number }[] {
  const out: { remedyId: number; rank: number }[] = []
  for (const r of remedies) { const rank = ranking.get(r); if (rank) out.push({ remedyId: r, rank }) }
  return out.sort((a, b) => a.rank - b.rank)
}

/**
 * Shade step of a cell by its best rank: 3 within the top `top`/3, 2 within the top, 1 ranked further
 * down, 0 not in the analysis. The cell also prints the rank, so the step is never colour alone.
 */
export function heat(bestRank: number | undefined, top: number): 0 | 1 | 2 | 3 {
  if (!bestRank) return 0
  if (bestRank <= Math.max(1, Math.round(top / 3))) return 3
  if (bestRank <= top) return 2
  return 1
}
