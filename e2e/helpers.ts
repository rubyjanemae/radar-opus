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
