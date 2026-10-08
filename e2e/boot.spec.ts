import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

/* Startup: heavy features are code-split and load on first use, not with the app. */

const scripts = (page: Page) => page.evaluate(() =>
  performance.getEntriesByType('resource').map(e => e.name.replace(location.origin, '')).filter(n => /\.(js|tsx?)(\?|$)/.test(n)))
// AnalysisView and its AnalysisGrid are prefetched at idle time after boot (so the first F8 is fast), so they
// are not listed here; the dock, the report, the tour and the dialogs must not come with the app.
const HEAVY = /AnalysisDock|CaseReport|WelcomeTour|remedyIndex(\.ts|-)|FindDialog|SettingsDialog|RemedyPicker|FamilyFilterDialog|TakeOptionsDialog/

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { performance.setResourceTimingBufferSize(5000) })
})

test('boot does not load the analysis grid, case report, welcome tour, remedy index or dialogs', async ({ page }) => {
  await openApp(page)
  // at startup (every stage mounted): none of the split-off modules
  const loaded = await scripts(page)
  expect(loaded.length).toBeGreaterThan(0)
  expect(loaded.filter(n => HEAVY.test(n))).toEqual([])
  // later, idle time preloads the small dialogs, the analysis tab and builds the remedy index, but the
  // dock, the case report and the tour still wait for first use
  await expect.poll(async () => (await scripts(page)).some(n => /AnalysisView/.test(n)), { timeout: 15_000 }).toBe(true)
  const later = await scripts(page)
  expect(later.filter(n => /AnalysisDock|CaseReport|WelcomeTour/.test(n))).toEqual([])
})

test('lazy dialogs open on first use: find, settings, remedies, case report', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('.rv')).toBeVisible()
  // F2 right after boot: the find dialog loads, opens with its input focused
  await page.keyboard.press('F2')
  const find = page.locator('[data-dialog="repertory.find"]')
  await expect(find).toBeVisible()
  await expect(find.locator('input').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(find).toBeHidden()
  await expect(page.locator('.dialog-loading')).toHaveCount(0)

  await page.keyboard.press('Control+4')
  await expect(page.locator('[data-dialog="mm.remedyPicker"]')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+,')
  await expect(page.locator('[data-dialog="workspace.settings"]').first()).toBeVisible()
  await page.keyboard.press('Escape')

  expect((await scripts(page)).some(n => /CaseReport/.test(n))).toBe(false)
  await page.evaluate(async () => {
    const { runCommand } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.registry()
    runCommand('case.report')
  })
  await expect(page.getByRole('dialog').filter({ hasText: /report/i }).first()).toBeVisible()
  expect((await scripts(page)).some(n => /CaseReport/.test(n))).toBe(true)
})

test('the analysis preview dock loads its grid when shown', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('.rv')).toBeVisible()
  await page.keyboard.press('Control+j')
  await expect(page.locator('.analysis-dock')).toBeVisible()
  await expect(page.locator('.analysis-dock [role="grid"]').first()).toBeVisible()
})

test('the welcome tour loads when started', async ({ page }) => {
  await openApp(page)
  await expect(page.locator('.rv')).toBeVisible()
  expect((await scripts(page)).some(n => /WelcomeTour/.test(n))).toBe(false)
  await page.evaluate(async () => {
    const { runCommand } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.registry()
    runCommand('help.welcome')
  })
  await expect(page.getByRole('dialog').first()).toBeVisible()
  expect((await scripts(page)).some(n => /WelcomeTour/.test(n))).toBe(true)
})

test('keys typed while a dialog is still loading reach it once it opens', async ({ page }) => {
  // hold the find dialog's chunk back so the keys arrive before it can open
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  await page.route(/FindDialog/, async route => { await held; await route.continue() })
  await openApp(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('F2')
  const loading = page.locator('.dialog-loading')
  await expect(loading).toHaveAttribute('aria-busy', 'true')
  await expect(loading).toBeFocused()
  await page.keyboard.type('mi')
  await page.keyboard.press('Enter')
  await page.keyboard.type('weep')
  await page.keyboard.press('Enter')
  // the workspace did not see the keys: no search tab, no chapter jump
  await expect(page.getByRole('tab', { name: /Search/ })).toHaveCount(0)
  release()
  const dlg = page.getByRole('dialog', { name: 'Find rubric' })
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText(/weeping/)
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(page.locator('.rv-row[aria-selected="true"]').first()).toContainText(/weeping/i)
})

test('Escape while a dialog is loading cancels it and gives focus back', async ({ page }) => {
  await page.route(/SettingsDialog/, () => new Promise(() => {}))
  await openApp(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('Control+,')
  await expect(page.locator('.dialog-loading')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.dialog-loading')).toHaveCount(0)
  await expect(page.locator('.rv-scroll')).toBeFocused()
})
