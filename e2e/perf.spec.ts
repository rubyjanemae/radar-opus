import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

/**
 * Long-task budgets (no task over 50 ms) for scrolling a long chapter and switching repertories.
 * Timing depends on the machine and its load, so these run only with E2E_PERF=1 (on an idle machine).
 */
test.skip(!process.env.E2E_PERF, 'set E2E_PERF=1 to run the long-task budgets')

async function longTasks(page: Page, run: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = [] })
  await run()
  await page.waitForTimeout(600)
  return page.evaluate(() => (window as unknown as { __lt: number[] }).__lt)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: number[] }
    w.__lt = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
  })
})

test('wheel and fling through Extremities stay under 50 ms per task', async ({ page }) => {
  await openApp(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.type('extrem')
  await page.keyboard.press('Enter')
  await expect(page.locator('.rv-crumb-last')).toHaveText('Extremities')
  await page.waitForTimeout(1000)
  const box = (await page.locator('.tab-doc[data-active] .rv-scroll').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const wheel = await longTasks(page, async () => { for (let k = 0; k < 60; k++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(16) } })
  const fling = await longTasks(page, async () => { for (let k = 0; k < 40; k++) { await page.mouse.wheel(0, k < 20 ? 3000 : -2500); await page.waitForTimeout(8) } })
  expect(Math.max(0, ...wheel, ...fling)).toBeLessThanOrEqual(50)
})

test('switching Publicum and Kent-de stays under 50 ms per task', async ({ page }) => {
  await openApp(page)
  const picker = page.getByRole('combobox', { name: 'Repertory' })
  await picker.selectOption('kent-de')
  await expect(page.locator('.tab-doc[data-active] .rv-row').first()).toBeVisible()
  await page.waitForTimeout(1500)
  const tasks: number[] = []
  for (const abbrev of ['publicum', 'kent-de', 'publicum', 'kent-de']) {
    tasks.push(...await longTasks(page, () => picker.selectOption(abbrev).then(() => undefined)))
  }
  expect(Math.max(0, ...tasks)).toBeLessThanOrEqual(50)
})
