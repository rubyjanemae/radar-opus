import { useDeferredValue, useMemo } from 'react'
import type { Catalog } from '../../data/catalog'
import { useCatalog, useRepertories } from '../../data/CatalogContext'
import { analyze } from '../../engine/analysis'
import type { AnalysisResult, AnalysisViewFilter } from '../../engine/analysis'
import type { AnalysisOptions, Clipboard } from '../../engine/model'
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

/**
 * Load repertories on demand; re-renders as each arrives. A thin adapter over the shared
 * useRepertories hook, kept under this name (and signature) for the patients views.
 */
export function useRepertoriesLoaded(_catalog: Catalog, abbrevs: string[]): LoadState & { version: number } {
  const r = useRepertories(abbrevs)
  if (r.status === 'error') return { status: 'error', failed: r.failed, retry: r.retry, version: r.version }
  if (r.status === 'loading') return { status: 'loading', pending: r.pending, version: r.version }
  return { status: 'ready', version: r.version }
}

export interface LiveAnalysis {
  consultation: Consultation | null
  result: AnalysisResult | null
  /** True while the shown result is older than the case (a newer one is being computed). */
  stale: boolean
  load: LoadState
  source: CatalogSource
  catalog: Catalog
}

/*
 * Shared analysis cache. Clipboards and options are immutable (every edit replaces them), so their
 * references identify an analysis; the key also names the repertories loaded at the time (a symptom
 * of a repertory still loading resolves to nothing) and the repertory view. The dock, the analysis
 * tab, dialogs and commands all read through here, so one F8 computes the analysis once.
 */
const cache = new WeakMap<Clipboard[], WeakMap<AnalysisOptions, { key: string; result: AnalysisResult }>>()

/** The analysis of these clipboards with these options, computed once per (clipboards, options, loaded repertories, view). */
export function analyzeCached(source: CatalogSource, catalog: Catalog, clipboards: Clipboard[], options: AnalysisOptions, view?: AnalysisViewFilter): AnalysisResult {
  const key = `${repertoriesOf(clipboards).filter(a => catalog.repertory(a)).join('|')}#${view?.minGrade ?? 1}`
  let byOptions = cache.get(clipboards)
  if (!byOptions) { byOptions = new WeakMap(); cache.set(clipboards, byOptions) }
  const hit = byOptions.get(options)
  if (hit && hit.key === key) return hit.result
  const result = analyze(source, clipboards, options, view)
  byOptions.set(options, { key, result })
  return result
}

/** The repertory view the analysis follows: the book's minimum grade shown (ANA-024). */
export function useAnalysisMinGrade(): number {
  return useApp(s => s.settings.minGradeShown ?? 1)
}

/**
 * Live analysis of a consultation: recomputed whenever its clipboards, options or the repertory view
 * change. The inputs are deferred, so the edit that caused the change (an intensity key, a strategy
 * pick) paints first and the new ranking follows in a transition.
 */
export function useAnalysis(consultationId: string | null): LiveAnalysis {
  const catalog = useCatalog()
  const source = sourceFor(catalog)
  const consultation = useApp(s => (consultationId ? s.consultations[consultationId] ?? null : null))
  const minGrade = useAnalysisMinGrade()
  const clipboards = useDeferredValue(consultation?.clipboards)
  const options = useDeferredValue(consultation?.analysis)
  const viewGrade = useDeferredValue(minGrade)
  const reps = useMemo(() => repertoriesOf(clipboards ?? []), [clipboards])
  const load = useRepertoriesLoaded(catalog, reps)
  const view = useMemo<AnalysisViewFilter>(() => ({ minGrade: viewGrade }), [viewGrade])
  const result = useMemo(
    () => (clipboards && options ? analyzeCached(source, catalog, clipboards, options, view) : null),
    // load.version: re-run when a repertory arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, catalog, clipboards, options, view, load.version, load.status],
  )
  const stale = clipboards !== consultation?.clipboards || options !== consultation?.analysis || viewGrade !== minGrade
  return { consultation, result, stale, load, source, catalog }
}
