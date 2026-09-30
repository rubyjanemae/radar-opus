import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Load the app and wait until the shell is ready. Every test gets a fresh browser context (empty
 * IndexedDB), so a single navigation is a clean first run: the demo practice is seeded with an
 * active case. Pass `EMPTY` for a first run without the demo practice.
 */
export const SEEDED = '/'
export const EMPTY = '/?seed=empty'
export async function openApp(page: Page, path = SEEDED) {
  await page.goto(path)
  await page.waitForSelector('.shell[data-ready]', { timeout: 30_000 })
}

/** Wait until autosave has written every change made so far (the status bar indicator reads "saved"). */
export async function waitForSaved(page: Page) {
  await expect(page.locator('.save-ind')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 })
}

/** A minimal React devtools hook: `window.__renders[name]` counts commits in which a named component actually rendered. */
export async function installRenderCounter(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __renders: Record<string, number>; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
    w.__renders = {}
    type F = { type: unknown; child: F | null; sibling: F | null; alternate: F | null; memoizedProps: unknown; memoizedState: unknown }
    const seen = new WeakMap<F, { p: unknown; s: unknown }>()
    const nameOf = (t: unknown): string | null => {
      if (typeof t === 'function') return (t as { displayName?: string; name: string }).displayName || (t as { name: string }).name
      const inner = (t as { type?: unknown } | null)?.type
      return typeof inner === 'function' ? nameOf(inner) : null
    }
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject: () => 1, checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
      onCommitFiberRoot(_: unknown, root: { current: F }) {
        const walk = (f: F | null) => {
          for (; f; f = f.sibling) {
            const n = nameOf(f.type)
            if (n) {
              const prev = seen.get(f) ?? (f.alternate ? seen.get(f.alternate) : undefined)
              const rec = { p: f.memoizedProps, s: f.memoizedState }
              if (prev && (prev.p !== rec.p || prev.s !== rec.s)) w.__renders[n] = (w.__renders[n] ?? 0) + 1
              seen.set(f, rec)
              if (f.alternate) seen.set(f.alternate, rec)
            }
            walk(f.child)
          }
        }
        walk(root.current.child)
      },
    }
  })
}

/** Read and reset the render counts collected by `installRenderCounter`. */
export async function takeRenders(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => { const w = window as unknown as { __renders: Record<string, number> }; const r = w.__renders; w.__renders = {}; return r })
}

/**
 * Wait until the page is idle: an idle callback (bounded) followed by a frame. Use instead of fixed
 * sleeps when a step only needs pending renders, prefetches or idle work to have run.
 */
export async function settle(page: Page, timeout = 3000) {
  await page.evaluate(t => new Promise<void>(done => {
    const frame = () => requestAnimationFrame(() => requestAnimationFrame(() => done()))
    if ('requestIdleCallback' in window) requestIdleCallback(frame, { timeout: t }); else setTimeout(frame, 50)
  }), timeout)
}

/**
 * Open a remedy through the remedy picker (Ctrl+4): waits for the picker, for the query's results
 * and for the remedy window, so a loaded machine does not type into a picker that is still opening.
 */
export async function openRemedy(page: Page, query: string, first?: RegExp | string) {
  await page.keyboard.press('Control+4')
  const dlg = page.getByRole('dialog', { name: 'Remedies' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('Search remedies').fill(query)
  // the first result is the one asked for (the list updates as the query is typed)
  await expect(dlg.getByRole('option').first()).toContainText(first ?? new RegExp(query.replace(/[^a-z]/gi, '').slice(0, 3), 'i'))
  await page.keyboard.press('Enter')
  await expect(dlg).toBeHidden()
  await expect(page.locator('.tab-doc[data-active] .ri-view h1')).toBeVisible()
}

/**
 * Measure a timing budget up to `attempts` times and pass on the first run within it: a single slow
 * run under parallel load is retried, a real regression fails every run.
 */
export async function withinBudget<T>(measure: () => Promise<T>, check: (v: T) => void, attempts = 3) {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    const v = await measure()
    try { check(v); return v } catch (e) { lastErr = e }
  }
  throw lastErr
}
