import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

/* Analysis strategies added from scoring-spec §4 (P1/P2): each is reachable from the strategy menu and ranks. */

const view = (page: Page) => page.getByTestId('analysis-view')
const headers = (page: Page) => view(page).locator('.an-hcell')
const SHOTS = process.env.SHOTS_DIR
const RUBRICS = [191, 3746, 7862, 28493, 4529, 72742, 70571, 5699, 25192].map(i => `publicum:${i}`)
/** Generalities motion / lying / touch / pressure agg., Mind consolation agg.: each has an "amel." sibling. */
const POLAR = [72865, 72831, 73355, 73110, 850].map(i => `publicum:${i}`)

async function analysedCase(page: Page, refs: string[]) {
  const panel = page.getByTestId('clipboard-panel')
  await panel.getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByLabel('First name').fill('Anna')
  await dialog.getByLabel('Last name').fill('Keller')
  await dialog.getByRole('button', { name: 'Create case' }).click()
  await page.evaluate(refs => {
    const el = document.querySelector('.cbp-list')!
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', refs.join('\n'))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, refs)
  await expect(panel.locator('.cbp-row')).toHaveCount(refs.length)
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
}

async function pick(page: Page, name: RegExp) {
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name }).click()
  await expect(view(page).getByRole('button', { name: new RegExp(`Analysis method: ${name.source}`) })).toBeVisible()
}

const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }

test.beforeEach(async ({ page }) => { await openApp(page) })

test('new strategies are in the menu and rank remedies', async ({ page }) => {
  await analysedCase(page, RUBRICS)
  const first = headers(page).first()

  await pick(page, /Sum of symptoms and degrees/)
  // score = Σ i + Σ i×g, so the first remedy scores more than any symptom count alone
  await expect(first.locator('.an-score')).toHaveText(/^\d+$/)
  const plus = (await headers(page).locator('.an-score').allTextContents()).map(Number)
  for (let i = 1; i < plus.length; i++) expect(plus[i - 1]).toBeGreaterThanOrEqual(plus[i])
  await shot(page, 'sum-plus')

  await pick(page, /Small rubrics \(continuous\)/)
  const cont = (await headers(page).locator('.an-score').allTextContents()).map(Number)
  for (let i = 1; i < cont.length; i++) expect(cont[i - 1]).toBeGreaterThanOrEqual(cont[i])

  await pick(page, /Prominence/)
  await expect(first.locator('.an-score')).toHaveText(/^\d+$/)
  await first.click()
  const panel = page.getByTestId('remedy-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.an-term-f sub', { hasText: 'π' }).first()).toBeVisible()
  // the narrow points column rounds; its titles carry the exact terms, which sum to the total
  const pts = await panel.locator('tbody .an-term-pts').evaluateAll(els => els.map(e => e.getAttribute('title')))
  const total = await panel.locator('tfoot .an-term-pts').getAttribute('title')
  expect(pts.reduce((s, x) => s + Number(x), 0)).toBeCloseTo(Number(total), 2)
  await expect(panel.locator('.an-legend-note')).toContainText('prominence')
  await shot(page, 'prominence-panel')
  await panel.getByRole('button', { name: 'Close details' }).click()

  await pick(page, /Composite/)
  await expect(page.getByTestId('analysis-notes')).toContainText(/Confidence \d+ %.*Case quality (green|amber|red)/)
  await shot(page, 'composite')

  await pick(page, /Segments/)
  await expect(first.locator('.an-score')).toHaveText(/^\d+\/\d+$/)
  await expect(page.getByTestId('analysis-notes')).toContainText('Segments work best with 2–6 clipboards')

  // back to the default: no notes
  await pick(page, /Sum of symptoms \(sort degrees\)/)
  await expect(page.getByTestId('analysis-notes')).toHaveCount(0)
})

test('polarity finds opposite rubrics, marks contraindications and explains PD', async ({ page }) => {
  await analysedCase(page, [...POLAR, RUBRICS[0]])
  await pick(page, /Polarity/)
  await expect(page.getByTestId('analysis-notes')).toHaveCount(0) // 5 polar symptoms: no warning
  const scores = await headers(page).locator('.an-score').allTextContents()
  expect(scores.length).toBeGreaterThan(0)
  // contraindicated remedies ("CI") sort after all others
  const firstCI = scores.findIndex(s => s.startsWith('CI'))
  if (firstCI >= 0) expect(scores.slice(firstCI).every(s => s.startsWith('CI'))).toBe(true)
  await headers(page).first().click()
  const panel = page.getByTestId('remedy-panel')
  await expect(panel.locator('.an-term-f sub', { hasText: 'opp' }).first()).toBeVisible()
  const pts = await panel.locator('tbody .an-term-pts').evaluateAll(els => els.map(e => e.getAttribute('title')))
  const total = await panel.locator('tfoot .an-term-pts').getAttribute('title')
  expect(pts.reduce((s, x) => s + Number(x), 0)).toBeCloseTo(Number(total), 2)
  expect(Number(total)).toBe(Number(scores[0].replace('CI ', '')))
  await shot(page, 'polarity')
})

test('polarity without polar symptoms says so and still ranks', async ({ page }) => {
  await analysedCase(page, RUBRICS)
  await pick(page, /Polarity/)
  await expect(page.getByTestId('analysis-notes')).toContainText('No scored symptom has a polar opposite rubric')
  await expect(headers(page).first().locator('.an-score')).toHaveText(/^\d+$/)
  await shot(page, 'polarity-none')
})

test('a grouped symptom at intensity 0 stays out of its group: no grades, no elimination', async ({ page }) => {
  const [a, b, c] = ['publicum:191', 'publicum:72742', 'publicum:3746']
  await analysedCase(page, [a, b, c])
  const rows = page.getByTestId('clipboard-panel').locator('.cbp-row')
  // group a + b, then b at intensity 0 and eliminative
  await rows.nth(0).click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('g')
  await page.keyboard.press('a')
  await expect(rows.nth(1).locator('.f-g')).toHaveText('a')
  await rows.nth(1).click()
  await page.keyboard.press('0')
  await page.keyboard.press('e')
  await expect(rows.nth(1)).toHaveClass(/ignored/)
  await expect(rows.nth(1).locator('.f-e')).toBeVisible()

  // three lines: the group holds only a, b is its own ignored line, nothing is eliminated
  const labels = view(page).locator('.an-label-text')
  await expect(labels).toHaveCount(3)
  // one group marker (the orange letter), no "[a]" text prefix
  await expect(labels.nth(0)).toHaveText(/^MIND - anxiety, night$/)
  await expect(view(page).locator('.an-row').nth(0).locator('.an-flag.f-g')).toHaveText('a')
  await expect(view(page).locator('.an-corner-rem')).toContainText(/^\d+ remedies/)
  const grouped = await headers(page).locator('.an-score').allTextContents()
  const total = await view(page).locator('.an-corner-rem').textContent()
  await shot(page, 'group-weight0')

  // identical to analysing a and c alone
  await rows.nth(1).click()
  await page.keyboard.press('Delete')
  await expect(labels).toHaveCount(2)
  expect(await headers(page).locator('.an-score').allTextContents()).toEqual(grouped)
  await expect(view(page).locator('.an-corner-rem')).toHaveText(total!)
})
