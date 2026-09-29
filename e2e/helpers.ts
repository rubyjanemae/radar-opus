import type { Page } from '@playwright/test'

/**
 * Load the app with a fresh profile and wait until the shell is ready.
 * The first run seeds the demo practice (with an active case); pass `EMPTY` for a clean first run.
 */
export const SEEDED = '/'
export const EMPTY = '/?seed=empty'
export async function openApp(page: Page, path = SEEDED) {
  await page.goto(path)
  await page.evaluate(() => new Promise<void>(res => { const r = indexedDB.deleteDatabase('radar-opus'); r.onsuccess = r.onerror = r.onblocked = () => res() }))
  await page.goto(path)
  await page.waitForSelector('.shell', { timeout: 30_000 })
}
