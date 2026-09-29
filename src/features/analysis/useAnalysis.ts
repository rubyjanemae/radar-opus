import { useEffect, useMemo, useState } from 'react'
import type { Catalog } from '../../data/catalog'
import { useCatalog } from '../../data/CatalogContext'
import { analyze } from '../../engine/analysis'
import type { AnalysisResult } from '../../engine/analysis'
import type { Clipboard } from '../../engine/model'
import { useApp } from '../../state/store'
import type { Consultation } from '../../state/patients'
import { sourceFor } from './source'
import type { CatalogSource } from './source'

/** Repertories referenced by any symptom of these clipboards. */
export function repertoriesOf(clipboards: Clipboard[]): string[] {
  const out = new Set<string>()
  for (const cb of clipboards) for (const s of cb.symptoms) for (const r of s.rubrics) out.add(r.slice(0, r.lastIndexOf(':')))
  return [...out].sort()
}

export type LoadState = { status: 'ready' } | { status: 'loading'; pending: string[] } | { status: 'error'; failed: string[]; retry: () => void }

/** Load repertories on demand; re-renders as each arrives. */
export function useRepertoriesLoaded(catalog: Catalog, abbrevs: string[]): LoadState & { version: number } {
  const key = abbrevs.join('|')
  const [version, setVersion] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    setFailed([])
    for (const a of key ? key.split('|') : []) {
      if (catalog.repertory(a)) continue
      catalog.loadRepertory(a).then(
        () => { if (alive) setVersion(v => v + 1) },
        () => { if (alive) setFailed(f => (f.includes(a) ? f : [...f, a])) },
      )
    }
    return () => { alive = false }
  }, [catalog, key, attempt])
  const list = key ? key.split('|') : []
  const pending = list.filter(a => !catalog.repertory(a))
  if (failed.length) return { status: 'error', failed, retry: () => setAttempt(x => x + 1), version }
  if (pending.length) return { status: 'loading', pending, version }
  return { status: 'ready', version }
}

export interface LiveAnalysis {
  consultation: Consultation | null
  result: AnalysisResult | null
  load: LoadState
  source: CatalogSource
  catalog: Catalog
}

/** Live analysis of a consultation: recomputed whenever its clipboards or options change. */
export function useAnalysis(consultationId: string | null): LiveAnalysis {
  const catalog = useCatalog()
  const source = sourceFor(catalog)
  const consultation = useApp(s => (consultationId ? s.consultations[consultationId] ?? null : null))
  const clipboards = consultation?.clipboards
  const options = consultation?.analysis
  const reps = useMemo(() => repertoriesOf(clipboards ?? []), [clipboards])
  const load = useRepertoriesLoaded(catalog, reps)
  const result = useMemo(
    () => (clipboards && options ? analyze(source, clipboards, options) : null),
    // load.version: re-run when a repertory arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, clipboards, options, load.version, load.status],
  )
  return { consultation, result, load, source, catalog }
}
