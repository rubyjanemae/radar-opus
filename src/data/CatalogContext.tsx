import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Catalog } from './catalog'
import type { Repertory } from './repertory'

const Ctx = createContext<Catalog | null>(null)

export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
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
