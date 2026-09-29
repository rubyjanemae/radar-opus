import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const view = (page: Page) => page.getByTestId('analysis-view')
const headers = (page: Page) => view(page).locator('.an-hcell')
const RUBRICS = [191, 3774, 7914, 28632, 4559, 73029, 70850, 5739, 25321].map(i => `publicum:${i}`)

async function newCase(page: Page) {
  const panel = page.getByTestId('clipboard-panel')
  await panel.getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByLabel('First name').fill('Anna')
  await dialog.getByLabel('Last name').fill('Keller')
  await dialog.getByRole('button', { name: 'Create case' }).click()
}

async function dropRubrics(page: Page, refs: string[]) {
  await page.evaluate(refs => {
    const el = document.querySelector('.cbp-list')!
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', refs.join('\n'))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, refs)
}

async function analysedCase(page: Page, refs = RUBRICS) {
  await newCase(page)
  await dropRubrics(page, refs)
  await expect(page.getByTestId('clipboard-panel').locator('.cbp-row')).toHaveCount(refs.length)
  await page.keyboard.press('F8')
  await expect(view(page)).toBeVisible()
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
}

test.beforeEach(async ({ page }) => { await openApp(page) })

test('F8 without a case explains instead of opening an empty tab', async ({ page }) => {
  // the app seeds a demo case: close it first
  await page.getByTestId('clipboard-panel').getByRole('button', { name: 'Switch case' }).click()
  await page.getByRole('menuitem', { name: 'Close case' }).click()
  await page.keyboard.press('F8')
  await expect(page.locator('.toast')).toContainText('No active case')
  await expect(view(page)).toHaveCount(0)
})

test('empty clipboard shows guidance, then updates live as rubrics arrive', async ({ page }) => {
  await newCase(page)
  await page.keyboard.press('F8')
  await expect(view(page)).toContainText('Nothing to analyse yet')
  await dropRubrics(page, RUBRICS.slice(0, 2))
  await expect(view(page).locator('.an-row')).toHaveCount(2, { timeout: 20_000 })
  await dropRubrics(page, RUBRICS.slice(2, 3))
  await expect(view(page).locator('.an-row')).toHaveCount(3)
  await expect(view(page).locator('.an-corner')).toContainText('3 symptoms')
})

test('grid ranks remedies, strategy menu re-ranks and is checked', async ({ page }) => {
  await analysedCase(page)
  await expect(view(page).getByRole('grid')).toHaveAttribute('aria-rowcount', '10')
  const first = headers(page).first()
  await expect(first.locator('.an-rank')).toHaveText('1')
  await expect(first.locator('.an-score')).toHaveText(/^\d+\/\d+$/)
  // header scores are sorted descending by symptoms then degrees
  const scores = await headers(page).locator('.an-score').allTextContents()
  const keyed = scores.slice(0, 10).map(s => s.split('/').map(Number))
  for (let i = 1; i < keyed.length; i++) expect(keyed[i - 1][0] * 1000 + keyed[i - 1][1]).toBeGreaterThanOrEqual(keyed[i][0] * 1000 + keyed[i][1])

  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Small rubrics \(Organon/ }).click()
  await expect(view(page).getByRole('button', { name: /Analysis method: Small rubrics \(Organon/ })).toBeVisible()
  await expect(first.locator('.an-score')).not.toHaveText(/\//)
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: /Small rubrics \(Organon/ })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')

  // undo restores the previous strategy (options are case data)
  await page.keyboard.press('Control+z')
  await expect(view(page).getByRole('button', { name: /Analysis method: Sum of symptoms \(sort degrees\)/ })).toBeVisible()
})

test('keyboard grid navigation and drill-down panel', async ({ page }) => {
  await analysedCase(page)
  await view(page).locator('.an-corner').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-cell="-1:1"]')).toBeFocused()
  // cells name their remedy and symptom for screen readers
  await expect(page.locator('[data-cell="0:0"]')).toHaveAttribute('aria-label', /^\S+, MIND - anxiety, night: (grade \d|absent)$/)
  await page.keyboard.press('Enter')
  const panel = page.getByTestId('remedy-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.an-panel-rank')).toHaveText('#2')
  const pts = await panel.locator('tbody .an-term-pts').allTextContents()
  const total = await panel.locator('tfoot .an-term-pts').textContent()
  expect(pts.reduce((s, x) => s + Number(x), 0)).toBeCloseTo(Number(total), 5)
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-cell="0:1"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('symptom row highlights remedies in it; remedy box jumps to a remedy', async ({ page }) => {
  await analysedCase(page)
  await view(page).locator('.an-label').nth(2).click()
  await expect(view(page).locator('.an-symbar')).toContainText('HEAD - pain, morning')
  await expect(view(page).locator('.an-row.selected')).toHaveCount(1)
  await view(page).getByRole('button', { name: 'Clear symptom highlight' }).click()
  await expect(view(page).locator('.an-symbar')).toHaveCount(0)

  const box = view(page).getByRole('combobox', { name: 'Jump to remedy in analysis' })
  await box.fill('lyc')
  await expect(view(page).getByRole('option').first()).toContainText('Lyc')
  await box.press('Enter')
  await expect(page.getByTestId('remedy-panel').locator('h3')).toHaveText('Lyc')
  await expect(view(page).locator('.an-hcell.selected .an-abbrev')).toHaveText('Lyc')
})

test('exclude, show in position, intensity toggle and filters', async ({ page }) => {
  await analysedCase(page)
  const top = await headers(page).first().locator('.an-abbrev').textContent()
  await headers(page).first().click()
  await page.getByTestId('remedy-panel').getByRole('button', { name: 'Exclude' }).click()
  await expect(view(page).locator('.an-pill')).toContainText('1 excluded')
  await expect(headers(page).first().locator('.an-abbrev')).not.toHaveText(top!)
  await view(page).getByRole('button', { name: 'Show excluded remedies in position' }).click()
  await expect(headers(page).first().locator('.an-abbrev')).toHaveText(top!)
  await expect(headers(page).first()).toHaveClass(/excl/)
  await expect(headers(page).first().locator('.an-rank')).toHaveText('–')
  await view(page).getByRole('button', { name: 'Include all excluded remedies' }).click()
  await expect(view(page).locator('.an-pill')).toHaveCount(0)

  // intensity toggle
  const intensity = view(page).getByRole('button', { name: 'Use symptom intensity' })
  await expect(intensity).toHaveAttribute('aria-pressed', 'true')
  await intensity.click()
  await expect(intensity).toHaveAttribute('aria-pressed', 'false')

  // family filter (the Filter button defers to the families feature): limit to Plants
  await view(page).getByRole('button', { name: 'Filter remedies' }).click()
  const fam = page.getByRole('dialog', { name: 'Family filter' })
  const find = fam.getByLabel('Find family')
  await find.fill('plants')
  await find.press('ArrowDown')
  await page.keyboard.press('Space')
  await fam.getByTestId('fam-apply').click()
  await expect(fam).toBeHidden()
  await expect(view(page).locator('.an-pillbar')).toContainText('Limited: Plants')
  const toolbarHeight = await view(page).locator('.an-toolbar').evaluate(e => e.getBoundingClientRect().height)

  // the analysis's own picker: exclude a remedy and require a minimum coverage
  await view(page).getByRole('button', { name: 'Filter options' }).click()
  await page.getByRole('menuitem', { name: 'Include / exclude remedies…' }).click()
  const pick = page.getByRole('dialog', { name: 'Filter remedies' })
  await pick.getByRole('tab', { name: 'Exclude' }).click()
  // checkbox 0 is "In this analysis only"; 1 is the first remedy
  await pick.getByRole('checkbox').nth(1).check()
  await pick.getByLabel('Minimum symptoms covered').fill('3')
  await pick.getByRole('button', { name: 'Apply' }).click()
  await expect(view(page).locator('.an-pillbar')).toContainText('1 excluded')
  await expect(view(page).locator('.an-pillbar')).toContainText('≥ 3 symptoms')
  // pills live below the toolbar, so the toolbar keeps its height
  expect(await view(page).locator('.an-toolbar').evaluate(e => e.getBoundingClientRect().height)).toBe(toolbarHeight)

  await page.keyboard.press('Control+k')
  await page.keyboard.type('Remove all remedy filters')
  await page.keyboard.press('Enter')
  await expect(view(page).locator('.an-pillbar')).toHaveCount(0)
})

test('remedy box pins a remedy beyond the limit as an extra column', async ({ page }) => {
  await analysedCase(page)
  await view(page).getByRole('combobox', { name: 'Remedies shown' }).selectOption('10')
  await expect(headers(page)).toHaveCount(10)
  const lastRanked = await headers(page).nth(9).locator('.an-abbrev').textContent()
  // pick a remedy ranked beyond the top 10 from the remedy box
  const box = view(page).getByRole('combobox', { name: 'Jump to remedy in analysis' })
  await box.fill('a')
  const options = view(page).getByRole('option')
  await expect(options.first()).toBeVisible()
  const ranks = (await options.locator('.an-rbox-rank').allTextContents()).map(Number)
  const k = ranks.findIndex(r => r > 10)
  expect(k).toBeGreaterThanOrEqual(0)
  const target = (await options.nth(k).locator('strong').textContent())!
  const rank = String(ranks[k])
  await options.nth(k).click()
  await expect(headers(page)).toHaveCount(11)
  await expect(headers(page).nth(9).locator('.an-abbrev')).toHaveText(lastRanked!)
  const pinned = headers(page).nth(10)
  await expect(pinned).toHaveClass(/pinned/)
  await expect(pinned.locator('.an-abbrev')).toHaveText(target)
  await expect(pinned.locator('.an-rank')).toHaveText(rank)
  await expect(pinned).toBeFocused()
  await expect(page.getByTestId('remedy-panel').locator('h3')).toHaveText(target)
  // the same remedy is appended in bars too, and unpinning removes it
  await page.keyboard.press('b')
  await expect(view(page).locator('.an-bar-row.pinned .an-bar-abbrev')).toHaveText(target)
  await view(page).getByRole('button', { name: `Unpin ${target}` }).click()
  await expect(view(page).locator('.an-bar-row.pinned')).toHaveCount(0)
})

test('bars and cards views, keyboard view switching', async ({ page }) => {
  await analysedCase(page)
  await view(page).locator('.an-corner').click()
  await page.keyboard.press('b')
  await expect(view(page).getByRole('radio', { name: 'Bars' })).toHaveAttribute('aria-checked', 'true')
  const bars = view(page).locator('.an-bar-row')
  await expect(bars.first()).toBeVisible()
  expect(await bars.first().locator('.an-bseg').count()).toBeGreaterThan(5)
  // focus follows the view switch, so the keyboard keeps working without the mouse
  await expect(bars.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(bars.nth(1)).toBeFocused()
  await page.keyboard.press('c')
  await expect(view(page).locator('.an-card').first()).toBeFocused()
  await page.keyboard.press('g')
  await expect(view(page).locator('.an-grid [data-cell][tabindex="0"]')).toBeFocused()
  await page.keyboard.press('b')
  await expect(bars.first()).toBeFocused()
  await bars.first().locator('.an-bar-abbrev').click()
  await expect(page.getByTestId('remedy-panel')).toBeVisible()
  await view(page).getByRole('radio', { name: 'Cards' }).click()
  await expect(view(page).locator('.an-card').first()).toContainText('#1')
  await view(page).locator('.an-card').first().focus()
  await page.keyboard.press('g')
  await expect(view(page).getByRole('grid')).toBeVisible()
})

test('export CSV and print', async ({ page }) => {
  await analysedCase(page)
  const dl = page.waitForEvent('download')
  await view(page).getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Export analysis as CSV' }).click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/^Keller-Anna-.*\.csv$/)
  const text = (await (await file.createReadStream()).toArray()).join('')
  expect(text).toContain('Symptom,Clipboard,Intensity,Flags,Rubric size')
  expect(text).toContain('"MIND - anxiety, night",Clipboard 1,1,,105')

  await page.evaluate(() => {
    (window as unknown as { __printed: string }).__printed = ''
    window.print = () => { (window as unknown as { __printed: string }).__printed = document.querySelector('.an-print-root')?.textContent ?? '' }
  })
  await view(page).locator('.an-corner').click()
  await page.keyboard.press('Control+p')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string }).__printed)).toContain('MIND - anxiety, night')
  // outside a print command the app is not hidden, so a browser-menu print is not blank
  await expect(page.locator('.an-print-root')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveClass(/an-printing/)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.shell')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })
})

test('compare remedies and the analysis dock', async ({ page }) => {
  await analysedCase(page)
  await view(page).getByRole('button', { name: 'Compare remedies' }).click()
  const dialog = page.getByRole('dialog', { name: 'Compare remedies' })
  await expect(dialog.locator('.an-pill')).toHaveCount(4)
  await expect(dialog.locator('tbody tr')).toHaveCount(9)
  await dialog.getByRole('button', { name: /^Remove / }).first().click()
  await expect(dialog.locator('.an-pill')).toHaveCount(3)
  await dialog.getByRole('combobox', { name: 'Add remedy…' }).fill('Sep')
  await dialog.getByRole('combobox', { name: 'Add remedy…' }).press('Enter')
  await expect(dialog.locator('.an-pill')).toHaveCount(4)
  await dialog.getByRole('tab', { name: 'Case chapters' }).click()
  await expect(dialog.locator('tbody tr').first()).toContainText('Mind')
  await dialog.getByRole('tab', { name: 'Sphere of action' }).click()
  await expect(dialog.locator('tfoot')).toContainText('Rubrics')
  await dialog.getByRole('button', { name: 'Done' }).click()

  await page.keyboard.press('Control+j')
  const dock = page.getByTestId('analysis-dock')
  await expect(dock.locator('.an-dock-bar')).toHaveCount(15)
  await expect(dock.locator('.an-hcell')).toHaveCount(15)
  // bars are stacked by grade, carry the score and select the remedy in the analysis tab
  const bar = dock.locator('.an-dock-bar').nth(4)
  await expect(bar).toHaveAttribute('title', /\d+\/\d+\ngrade/)
  expect(await bar.locator('.an-dock-stack > span').count()).toBeGreaterThan(0)
  const abbrev = (await bar.getAttribute('aria-label'))!.split(', ')[1]
  await bar.click()
  await expect(page.getByTestId('remedy-panel').locator('h3')).toHaveText(abbrev)
})
