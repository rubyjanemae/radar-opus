import { createElement, lazy } from 'react'
import type { ComponentProps, ComponentType, FunctionComponent } from 'react'

/** The module URL in a failed dynamic import's message (Chrome and Firefox name it; Safari does not). */
export function failedModuleUrl(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e)
  const m = /(?:Failed to fetch|error loading) dynamically imported module:\s*(\S+)/i.exec(msg)
  return m ? m[1] : null
}

/** True for the error a failed dynamic import throws ("Failed to fetch dynamically imported module", Firefox/Safari spellings too). */
export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload/i.test(msg)
}

let attempt = 0
/** Lazy components whose import failed, waiting for a retry (see retryFailedImports). */
const failed = new Set<() => void>()

/**
 * Let every lazyRetry component whose import failed import again on its next render. ErrorBoundary's
 * Retry calls this before rendering its children again. (A failed component keeps throwing its error
 * until then: React re-renders after a rejection, and importing again on every render would loop.)
 */
export function retryFailedImports() {
  const pending = [...failed]
  failed.clear()
  for (const again of pending) again()
}

/** `url` with a fresh `retry` query parameter, so the browser fetches it again. */
function freshUrl(url: string): string {
  try {
    const u = new URL(url, location.href)
    u.searchParams.set('retry', String(++attempt))
    return u.href
  } catch { return url }
}

/**
 * `React.lazy` that can be retried. A plain lazy component caches its import promise, so once the
 * import is rejected (offline, a deploy replaced the chunk) it throws the same error forever and an
 * ErrorBoundary's Retry cannot recover. This one drops the failed promise when the boundary retries
 * (retryFailedImports): the next render imports again.
 *
 * Browsers also remember a module that failed to fetch, so importing the same URL again fails without
 * a request. When the error names the module's URL, the retry imports it under a fresh query
 * (`?retry=N`) to fetch it anew; `pick` takes the component out of that module.
 *
 *   const FamiliesView = lazyRetry(() => import('./FamiliesView'), m => m.FamiliesView)
 *   const Chart = lazyRetry(() => import('./Chart'))            // default export
 */
/** A thenable already resolved to `value`: React.lazy reads it at once instead of suspending. */
function resolvedThenable<V>(value: V): Promise<V> {
  return { then: (ok?: (v: V) => unknown) => resolvedThenable(ok ? ok(value) : value) } as unknown as Promise<V>
}

/** A lazyRetry component: `preload()` fetches its module ahead of the first render. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LazyRetryComponent<T extends ComponentType<any>> = FunctionComponent<ComponentProps<T>> & { preload: () => Promise<void> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<M, T extends ComponentType<any>>(load: () => Promise<M>, pick?: (m: M) => T): LazyRetryComponent<T> {
  const take = (m: M) => ({ default: pick ? pick(m) : (m as unknown as { default: T }).default })
  let failedUrl: string | null = null
  // the module once imported (by a render or by preload): a lazy component made after that, or first
  // rendered after that, resolves synchronously. A lazy component whose factory returns a promise suspends
  // on its first render even when the module is already here, and React then holds the Suspense fallback
  // for its reveal throttle (about 300 ms).
  let loaded: M | null = null
  let preloading: Promise<void> | null = null
  const again = () => { current = make() }
  const make = () => lazy(() => {
    if (loaded) return resolvedThenable(take(loaded))
    const loading = failedUrl ? import(/* @vite-ignore */ freshUrl(failedUrl)) as Promise<M> : load()
    return loading.then(m => { loaded = m; return take(m) }, (e: unknown) => {
      failedUrl = failedModuleUrl(e) ?? failedUrl
      failed.add(again)
      throw e
    })
  })
  let current = make()
  function LazyRetry(props: ComponentProps<T>) {
    return createElement(current, props)
  }
  /** Import the module now (idle time after start-up), so the first render does not suspend. A failure is left to that render. */
  LazyRetry.preload = () => (preloading ??= load().then(m => { loaded = m }, () => { preloading = null }))
  return LazyRetry
}
