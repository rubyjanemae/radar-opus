import type { ComponentType } from 'react'
import { lazyRetry } from '../ui/lazyRetry'

export type DialogComponent = ComponentType<{ onClose: () => void } & Record<string, unknown>>
const registry = new Map<string, DialogComponent>()
/** Imports of lazy dialogs to run ahead of use (see preloadDialogs). */
const preloads = new Map<string, () => Promise<unknown>>()

/** Features register modal dialogs by kind; open them with actions.openDialog(kind, props). */
export function registerDialog(kind: string, c: DialogComponent) { registry.set(kind, c); preloads.delete(kind) }
export function getDialog(kind: string) { return registry.get(kind) }

export interface LazyDialogOptions {
  /**
   * Import the dialog's chunk in idle time after startup (default true), so opening it the first
   * time does not wait on the network. False for dialogs that pull heavy modules (the case report),
   * which then load when first opened.
   */
  preload?: boolean
}

/**
 * Register a dialog whose code lives in its own chunk: the import runs on first open (DialogHost
 * shows a modal "loading" backdrop meanwhile) or earlier in idle time (preloadDialogs). A failed
 * import is retried by the dialog's error boundary (lazyRetry).
 *
 *   registerLazyDialog('repertory.find', () => import('./FindDialog'), m => m.FindDialog)
 */
export function registerLazyDialog<M>(kind: string, load: () => Promise<M>, pick: (m: M) => ComponentType<never>, opts: LazyDialogOptions = {}) {
  registerDialog(kind, lazyRetry(load, pick as unknown as (m: M) => DialogComponent) as unknown as DialogComponent)
  if (opts.preload !== false) preloads.set(kind, load)
}

type IdleDeadlineLike = { timeRemaining(): number; didTimeout: boolean }
type IdleGlobal = { requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, o?: { timeout: number }) => number }

let preloading = false
/**
 * Import the preloadable lazy dialogs one per idle callback (each import evaluates its module, so
 * one at a time keeps every slice short), starting `delay` ms from now so startup's own idle work
 * (indexes, estimates) goes first. Idempotent; failures are ignored (opening retries).
 */
export function preloadDialogs(delay = 0): void {
  if (preloading || typeof window === 'undefined') return
  preloading = true
  if (delay > 0) { setTimeout(() => { preloading = false; preloadDialogs() }, delay); return }
  const queue = [...preloads.values()]
  const ric = (globalThis as IdleGlobal).requestIdleCallback
  const next = () => {
    const load = queue.shift()
    if (!load) return
    void load().catch(() => {}).finally(() => schedule())
  }
  const schedule = () => { if (queue.length) { if (ric) ric(next, { timeout: 5000 }); else setTimeout(next, 200) } }
  schedule()
}
