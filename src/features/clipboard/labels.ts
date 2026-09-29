import { useEffect, useState } from 'react'
import type { Catalog } from '../../data/catalog'
import type { RubricRef } from '../../data/types'
import { parseRubricRef } from './logic'

export interface RubricLabel {
  repertory: string
  loaded: boolean
  /** Chapter name (shown in caps). */
  chapter: string
  /** Path below the chapter. */
  rest: string
  full: string
}

export function rubricLabel(catalog: Catalog, ref: RubricRef): RubricLabel {
  const { repertory, index } = parseRubricRef(ref)
  const r = catalog.resolve(ref)
  if (!r) return { repertory, loaded: false, chapter: repertory, rest: `rubric ${index}`, full: ref }
  const [root, ...below] = r.rep.lineage(r.index)
  const chapter = r.rep.text(root)
  const rest = below.map(i => r.rep.text(i)).join(', ')
  return { repertory, loaded: true, chapter, rest, full: rest ? `${chapter.toUpperCase()} - ${rest}` : chapter.toUpperCase() }
}

/** Load the given repertories; returns how many are ready so callers re-render when one arrives. */
export function useRepertoriesReady(catalog: Catalog, abbrevs: string[]): { ready: number; failed: string[] } {
  const key = [...new Set(abbrevs)].sort().join('|')
  const [, bump] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    for (const a of key ? key.split('|') : []) {
      if (catalog.repertory(a)) continue
      catalog.loadRepertory(a).then(
        () => { if (alive) bump(x => x + 1) },
        () => { if (alive) setFailed(f => f.includes(a) ? f : [...f, a]) },
      )
    }
    return () => { alive = false }
  }, [catalog, key])
  return { ready: (key ? key.split('|') : []).filter(a => catalog.repertory(a)).length, failed }
}
