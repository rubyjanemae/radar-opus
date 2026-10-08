import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Catalog, setCatalog } from './catalog'
import type { Repertory } from './repertory'

const Ctx = createContext<Catalog | null>(null)

/**
 * Provides the catalog to the tree, makes it the getCatalog() singleton and, once the app is
 * up, prefetches the remaining repertories in idle time (`prefetch={false}` turns that off).
 */
export function CatalogProvider({ catalog, children, prefetch = true }: { catalog: Catalog; children: ReactNode; prefetch?: boolean }) {
  setCatalog(catalog)
  useEffect(() => { if (prefetch) catalog.prefetchRepertories() }, [catalog, prefetch])
  return <Ctx.Provider value={catalog}>{children}</Ctx.Provider>
}

export function useCatalog(): Catalog {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCatalog outside CatalogProvider')
  return c
}

/** Load a repertory on demand; returns null while loading. */
export function useRepertory(abbrev: string): { rep: Repertory | null; error: Error | null } {
  const catalog = useCatalog()
  const [state, setState] = useState<{ rep: Repertory | null; error: Error | null }>(() => ({ rep: catalog.repertory(abbrev) ?? null, error: null }))
  useEffect(() => {
    let alive = true
    const hit = catalog.repertory(abbrev)
    if (hit) { setState({ rep: hit, error: null }); return }
    setState({ rep: null, error: null })
    catalog.loadRepertory(abbrev).then(rep => alive && setState({ rep, error: null }), error => alive && setState({ rep: null, error }))
    return () => { alive = false }
  }, [catalog, abbrev])
  return state
}

export interface RepertoriesState {
  /** 'ready': every requested repertory is loaded; 'loading': some are on their way; 'error': none pending, some failed. */
  status: 'ready' | 'loading' | 'error'
  /** Requested abbreviations still loading. */
  pending: string[]
  /** Requested abbreviations whose load failed. */
  failed: string[]
  /** Readable failure message per failed abbreviation. */
  errors: Record<string, string>
  /** Load the failed ones again. */
  retry: () => void
  /** Increases whenever one of the requested repertories arrives: use it as a memo dependency. */
  version: number
}

/**
 * The canonical multi-repertory loader: load several repertories (e.g. every repertory a clipboard
 * refers to), follow their state and retry failures. Order and duplicates in `abbrevs` do not matter.
 * The result is referentially stable: the same object (and the same `pending` / `failed` / `errors`
 * values and `retry` function) until one of the requested repertories arrives or fails, so it can be
 * used directly as a memo or effect dependency.
 */
export function useRepertories(abbrevs: readonly string[]): RepertoriesState {
  const catalog = useCatalog()
  const key = [...new Set(abbrevs)].sort().join('\n')
  const wanted = useMemo(() => (key ? key.split('\n') : []), [key])
  const [version, setVersion] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    for (const a of wanted) {
      if (catalog.repertory(a)) continue
      catalog.loadRepertory(a).then(
        () => {
          if (!alive) return
          setVersion(v => v + 1)
          setErrors(e => { if (!(a in e)) return e; const { [a]: _, ...rest } = e; void _; return rest })
        },
        (e: unknown) => { if (alive) setErrors(prev => ({ ...prev, [a]: e instanceof Error ? e.message : String(e) })) },
      )
    }
    return () => { alive = false }
  }, [catalog, wanted, attempt])

  const retry = useCallback(() => {
    setErrors({})
    setAttempt(n => n + 1)
  }, [])

  const failed = wanted.filter(a => a in errors && !catalog.repertory(a))
  const pending = wanted.filter(a => !catalog.repertory(a) && !(a in errors))
  const failedKey = failed.join('\n')
  const pendingKey = pending.join('\n')
  return useMemo((): RepertoriesState => {
    const f = failedKey ? failedKey.split('\n') : []
    const p = pendingKey ? pendingKey.split('\n') : []
    const shownErrors: Record<string, string> = {}
    for (const a of f) shownErrors[a] = errors[a]
    return { status: p.length ? 'loading' : f.length ? 'error' : 'ready', pending: p, failed: f, errors: shownErrors, retry, version }
  }, [failedKey, pendingKey, errors, retry, version])
}
