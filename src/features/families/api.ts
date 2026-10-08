/**
 * Public API of the families feature for other features.
 *
 *   const idx = await loadFamilies()          // fetches public/data/families.json once
 *   groupsOfRemedy(id)                        // [] until loaded; primary group first, kingdom last
 *
 * Group ids are stable strings: `k:<kingdom>`, `plant:family:<Family>`, `plant:order:<Order>`,
 * `mineral:el:<Symbol>`, `mineral:salt:<salt>`, `animal:<group>`, `nosode:<type>`, `theme:<id>` …
 */
import { useEffect, useSyncExternalStore } from 'react'
import { FamilyIndex } from './model'
import type { FamiliesFile, Node } from './model'

export type { FamilyGroup, Node as FamilyNode } from './model'
export { FamilyIndex } from './model'

const URL_ = `${import.meta.env.BASE_URL}data/families.json`

let index: FamilyIndex | null = null
let pending: Promise<FamilyIndex> | null = null
let error: Error | null = null
let version = 0
const listeners = new Set<() => void>()
const bump = () => { version++; listeners.forEach(l => l()) }

/** Load (once) and index the family classification. */
export function loadFamilies(): Promise<FamilyIndex> {
  if (index) return Promise.resolve(index)
  if (!pending) {
    error = null
    pending = fetch(URL_)
      .then(r => { if (!r.ok) throw new Error(`Could not load families.json (${r.status})`); return r.json() as Promise<FamiliesFile> })
      .then(f => { index = new FamilyIndex(f); bump(); return index })
      .catch((e: unknown) => { error = e instanceof Error ? e : new Error(String(e)); pending = null; bump(); throw error })
    bump()
  }
  return pending
}

export function familiesIfLoaded(): FamilyIndex | null { return index }

/** Groups containing a remedy, most useful first (primary group, other leaves, lineage, kingdom). Empty until loaded. */
export function groupsOfRemedy(remedyId: number): Node[] { return index ? index.groupsOfRemedy(remedyId) : [] }

export function onFamiliesChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

/** React hook: the index (null while loading), the load error and a retry. Starts loading on first use. */
export function useFamilies(): { index: FamilyIndex | null; error: Error | null; loading: boolean; retry: () => void } {
  useSyncExternalStore(onFamiliesChanged, () => version, () => version)
  useEffect(() => { if (!index && !pending && !error) void loadFamilies().catch(() => { /* surfaced through `error` */ }) }, [])
  return { index, error, loading: !index && !error, retry: () => { error = null; void loadFamilies().catch(() => {}) } }
}
