import type { Repertory } from '../../data/repertory'
import type { RemedyIndex } from './remedyIndex'

/*
 * Boot-path access to the remedy → rubric index. The index module (and its build) is imported on
 * first need, not with the app: code that runs at startup (commands, search ops, the word-search
 * engine behind QuickFind) goes through here, and search treats "module not loaded yet" as a target
 * that is still being prepared (search/ops `prepare` awaits `loadRemedyIndexModule`).
 */

type Mod = typeof import('./remedyIndex')
let mod: Mod | null = null
let loading: Promise<Mod> | null = null

/** Import the remedy index module (once; a failed import can be retried). */
export function loadRemedyIndexModule(): Promise<Mod> {
  return (loading ??= import('./remedyIndex').then(m => (mod = m), e => { loading = null; throw e }))
}

/** True once the module is imported, so `remedyIndexNow` can answer synchronously. */
export function remedyIndexModuleLoaded(): boolean { return mod !== null }

/** The remedy index of `rep` if it has been built, else null (never builds, never imports). */
export function remedyIndexIfReady(rep: Repertory): RemedyIndex | null {
  return mod ? mod.remedyIndexIfReady(rep) : null
}

/**
 * The remedy index of `rep`, built now if needed. The module must be loaded (callers check
 * `remedyIndexModuleLoaded`, or `prepare` awaited it): otherwise this throws.
 */
export function remedyIndexNow(rep: Repertory): RemedyIndex {
  if (!mod) throw new Error('The remedy index is not loaded yet')
  return mod.remedyIndex(rep)
}

/** Build the index off the critical path (see remedyIndex.ts `warmRemedyIndex`), importing the module first. */
export function warmRemedyIndex(rep: Repertory, urgent = false): Promise<RemedyIndex> {
  return loadRemedyIndexModule().then(m => m.warmRemedyIndex(rep, urgent))
}
