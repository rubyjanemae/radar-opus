import type { Page } from '@playwright/test'

/** Load the app with a fresh profile and wait until the shell is ready. */
export async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await page.evaluate(() => new Promise<void>(res => { const r = indexedDB.deleteDatabase('radar-opus'); r.onsuccess = r.onerror = r.onblocked = () => res() }))
  await page.goto(path)
  await page.waitForSelector('.shell', { timeout: 30_000 })
}
