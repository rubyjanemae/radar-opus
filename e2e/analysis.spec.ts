import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp, settle, waitForSaved } from './helpers'

const view = (page: Page) => page.getByTestId('analysis-view')
const headers = (page: Page) => view(page).locator('.an-hcell')
const RUBRICS = [191, 3746, 7862, 28493, 4529, 72742, 70571, 5699, 25192].map(i => `publicum:${i}`)

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
  // Enter again keeps the panel open (Space toggles)
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
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
  // columns are virtualised (the score panel takes width): address them by column index
  await expect(view(page).locator('.an-hcell[aria-colindex="11"] .an-abbrev')).toHaveText(lastRanked!)
  const pinned = view(page).locator('.an-hcell[aria-colindex="12"]')
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
  // views stay mounted once shown: the bars come back on the row they were left on
  await page.keyboard.press('b')
  await expect(bars.nth(1)).toBeFocused()
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
  await view(page).getByRole('button', { name: /^More/ }).click()
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
  // below ~1200px the toolbar folds compare, export and print into "More"
  await view(page).getByRole('button', { name: /^More/ }).click()
  await page.getByRole('menuitem', { name: /Compare remedies/ }).click()
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
  // the dock steps aside while the analysis tab is visible, and returns on another tab
  await expect(dock).toHaveCount(0)
  await page.keyboard.press('Control+5')
  await expect(page.getByTestId('families-view')).toBeVisible()
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

test('F8 focuses the grid; panel and highlighted symptom survive a tab switch', async ({ page }) => {
  await analysedCase(page)
  await expect(page.locator('[data-cell="0:0"]')).toBeFocused()
  await headers(page).nth(2).click()
  await view(page).locator('.an-label').nth(1).click()
  const panel = page.getByTestId('remedy-panel')
  await expect(panel).toBeVisible()
  const abbrev = await panel.locator('h3').textContent()
  await page.keyboard.press('Control+5')
  await expect(page.getByTestId('families-view')).toBeVisible()
  await page.keyboard.press('F8')
  await expect(panel.locator('h3')).toHaveText(abbrev!)
  await expect(view(page).locator('.an-symbar')).toContainText('MIND - irritability')
  await expect(view(page).locator('.an-grid [data-cell][tabindex="0"]')).toBeFocused()
})

test('an analysis tab of another case says so; F8 opens the active case', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  const first = view(page)
  await expect(first.getByTestId('analysis-other-case')).toHaveCount(0)
  // a second case becomes the active one: the open tab still shows Keller
  const panel = page.getByTestId('clipboard-panel')
  await panel.getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByLabel('First name').fill('Ben')
  await dialog.getByLabel('Last name').fill('Meier')
  await dialog.getByRole('button', { name: 'Create case' }).click()
  await page.getByRole('tab', { name: /Keller · First consultation Analysis/ }).click()
  const banner = view(page).getByTestId('analysis-other-case')
  await expect(banner).toContainText('Keller, Anna')
  await expect(banner).toContainText('Meier, Ben')
  // the toolbar keeps acting on this tab's case: its strategy changes, the active case's does not
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Small rubrics \(Organon/ }).click()
  await expect(view(page).getByRole('button', { name: /Analysis method: Small rubrics/ })).toBeVisible()
  await banner.getByRole('button', { name: 'Switch to active case' }).click()
  await expect(view(page).getByTestId('analysis-other-case')).toHaveCount(0)
  await expect(view(page)).toContainText('Nothing to analyse yet')
  await expect(view(page).getByRole('button', { name: /Analysis method: Sum of symptoms/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Analysis/ })).toHaveCount(1)
})

test('a dozen clipboards stay inside the toolbar; All stays reachable', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  const chips = view(page).locator('.an-chips .an-chip')
  for (let i = 0; i < 11; i++) {
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    await page.keyboard.type('New clipboard')
    await page.keyboard.press('Enter')
    await expect(chips).toHaveCount(i + 2)
    // a new clipboard opens its name for editing: commit it
    const input = page.getByTestId('clipboard-panel').locator('input:focus')
    if (await input.count()) await input.press('Enter')
  }
  const toolbar = view(page).locator('.an-toolbar')
  await expect(chips).toHaveCount(12)
  const tb = (await toolbar.boundingBox())!
  expect(tb.height).toBeLessThanOrEqual(64)
  const all = view(page).getByRole('button', { name: 'All', exact: true })
  const box = (await all.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(tb.x + tb.width)
  // the strip scrolls; every chip is inside the toolbar horizontally
  const strip = (await view(page).locator('.an-chips').boundingBox())!
  expect(strip.x + strip.width).toBeLessThanOrEqual(tb.x + tb.width)
  await all.click()
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  // every toolbar control shares the 24px height
  const shown = (els: Element[]) => els.filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().height))
  for (const h of await toolbar.locator('.an-tb-btn, .an-chip, .icon-btn, .an-select, .an-seg, .an-rbox').evaluateAll(shown)) expect(h).toBe(24)
})

test('grid virtualises rows and columns', async ({ page }) => {
  const many = Array.from({ length: 60 }, (_, i) => `publicum:${191 + i * 1117}`)
  await analysedCase(page, many)
  await view(page).getByRole('combobox', { name: 'Remedies shown' }).selectOption('100000')
  await expect(view(page).getByRole('grid')).toHaveAttribute('aria-rowcount', '61')
  const rendered = await view(page).locator('.an-row').count()
  expect(rendered).toBeLessThan(60)
  const cols = await view(page).locator('.an-hcell').count()
  expect(cols).toBeLessThan(100)
  // keyboard focus reaches rows and columns that were not rendered
  await view(page).locator('.an-corner').click()
  await expect(view(page).locator('.an-grid-fade')).toHaveCount(1)
  await page.keyboard.press('Control+End')
  const last = Number(await view(page).getByRole('grid').getAttribute('aria-colcount')) - 2
  await expect(page.locator(`[data-cell="59:${last}"]`)).toBeFocused()
  // scrolled to the last column: no more columns to the right, so no edge shadow
  await expect(view(page).locator('.an-grid-fade')).toHaveCount(0)
  await page.keyboard.press('Home')
  await expect(page.locator('[data-cell="59:-1"]')).toBeFocused()
})

test('dock scores are never clipped; its bars are list items', async ({ page }) => {
  await page.keyboard.press('Control+j')
  const dock = page.getByTestId('analysis-dock')
  await expect(dock.locator('.an-hcell')).toHaveCount(15, { timeout: 20_000 })
  for (const f of await dock.locator('.an-score').evaluateAll(els => els.map(e => ({ t: e.textContent, over: e.scrollWidth - e.clientWidth, w: e.getBoundingClientRect().width })))) {
    expect(f.over, `score ${f.t}`).toBeLessThanOrEqual(0)
    expect(f.w).toBeGreaterThanOrEqual(30)
  }
  // columns are 36px apart (a gap between scores), the bars sit over their columns
  const lefts = await dock.locator('.an-hcell').evaluateAll(els => els.slice(0, 3).map(e => e.getBoundingClientRect().left))
  expect(lefts[1] - lefts[0]).toBe(36)
  await expect(dock.locator('ul.an-dock-bars > li > button.an-dock-bar')).toHaveCount(15)
  await expect(dock.locator('[role="listitem"]')).toHaveCount(0)
})

test('toolbar menus return focus: Esc to the button, a choice to the grid; aria-expanded follows', async ({ page }) => {
  await analysedCase(page)
  const strategy = view(page).getByRole('button', { name: /Analysis method/ })
  await expect(strategy).toHaveAttribute('aria-expanded', 'false')
  await strategy.click()
  await expect(strategy).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('menu', { name: 'Analysis method' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(strategy).toBeFocused()
  await expect(strategy).toHaveAttribute('aria-expanded', 'false')
  // Tab closes too, focus stays on the button (never on <body>)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu', { name: 'Analysis method' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('menu', { name: 'Analysis method' })).toHaveCount(0)
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  await strategy.click()
  await page.getByRole('menuitemcheckbox', { name: /Weighted/ }).click()
  await expect(view(page).locator('.an-grid [data-cell][tabindex="0"]')).toBeFocused()
  // the filter split button: a full 24px target, same focus rules
  const more = view(page).getByRole('button', { name: 'Filter options' })
  const box = (await more.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(24)
  expect(box.height).toBeGreaterThanOrEqual(24)
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  const moreActions = view(page).getByRole('button', { name: /^More/ })
  await moreActions.click()
  await page.keyboard.press('Escape')
  await expect(moreActions).toBeFocused()
})

test('at 1152px the toolbar keeps one row, the clipboard pane folds away and the grid ends on whole columns', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
  await analysedCase(page)
  // the ~300px clipboard pane collapses while the analysis is shown at <= 1200px
  await expect(page.getByTestId('clipboard-panel')).toHaveCount(0)
  const toolbar = view(page).locator('.an-toolbar')
  const tops = await toolbar.locator(':scope > *').evaluateAll(els => [...new Set(els.filter(e => e.getClientRects().length && e.getBoundingClientRect().width > 0).map(e => Math.round(e.getBoundingClientRect().top)))])
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(4)
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(36)
  await expect(view(page).getByRole('button', { name: 'Compare remedies' })).toBeHidden()
  // the method name is never truncated
  const name = view(page).locator('.an-strategy-name')
  await expect(name).toHaveText('Sympt + Deg')
  expect(await name.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  expect((await view(page).locator('.an-strategy').boundingBox())!.width).toBeGreaterThanOrEqual(120)
  // symptom column >= 260px; the visible remedy columns are whole 36px cells; a fade marks more columns
  const g = await view(page).getByRole('grid').evaluate(el => ({ w: el.clientWidth, label: parseFloat(getComputedStyle(el).getPropertyValue('--an-label')), sw: el.scrollWidth }))
  expect(g.label).toBeGreaterThanOrEqual(260)
  expect(g.sw).toBeGreaterThan(g.w)
  expect((g.w - g.label) % 36).toBe(0)
  await expect(view(page).locator('.an-grid-fade')).toBeVisible()
  // the status bar describes the analysis
  await expect(page.locator('.status-main')).toHaveText(/^Sympt \+ Deg · 9 symptoms · [\d,]+ remedies · Top 30$/)
  // the tab keeps its kind visible
  const tab = page.locator('.tab-main[data-kind="analysis"]')
  await expect(tab.locator('.tab-sub')).toHaveText('Analysis')
  expect(await tab.locator('.tab-sub').evaluate(e => e.scrollWidth <= e.clientWidth && e.getBoundingClientRect().width > 0)).toBe(true)
  // leaving the analysis reopens the pane it folded; the status bar returns to the repertory context
  await page.getByRole('tab', { name: /^Mind/ }).click()
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
  await expect(page.locator('.status-main')).not.toHaveText(/Sympt \+ Deg/)
  // reopening it by hand on the analysis is respected
  await tab.click()
  await expect(page.getByTestId('clipboard-panel')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+B')
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
})

test('narrow analysis toolbars fold the scoring toggles into More; sideways scrolling rests on whole columns', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  // a narrow window: the side panes become overlays and the analysis has under 760px
  await page.setViewportSize({ width: 740, height: 720 })
  await expect(view(page).locator('.an-strategy-name')).toHaveText('Sympt + Deg')
  await expect(view(page).getByRole('button', { name: 'Use symptom intensity' })).toBeHidden()
  await view(page).getByRole('button', { name: /^More/ }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' })
  await expect(item).toHaveAttribute('aria-checked', 'true')
  await item.click()
  await view(page).getByRole('button', { name: /^More/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' })).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')
  const grid = view(page).getByRole('grid')
  await grid.evaluate(el => el.scrollTo({ left: 50, behavior: 'instant' }))
  await expect.poll(() => grid.evaluate(el => el.scrollLeft % 36)).toBe(0)
})

test('remedy panel: resizable, fixed number columns, short labels; Prescribe opens the prefilled form', async ({ page }) => {
  await analysedCase(page)
  await headers(page).first().click()
  const panel = page.getByTestId('remedy-panel')
  await expect(panel).toBeVisible()
  const w = (await panel.boundingBox())!.width
  expect(w).toBeGreaterThanOrEqual(380)
  expect(w).toBeLessThanOrEqual(420)
  const widths = await panel.locator('thead th').evaluateAll(els => els.slice(1).map(e => Math.round(e.getBoundingClientRect().width)))
  expect(widths).toEqual([28, 36, 32])
  // every breakdown label carries its full text in a title and fits in two lines
  for (const t of await panel.locator('tbody .an-term-label').evaluateAll(els => els.map(e => ({ title: e.getAttribute('title'), h: e.querySelector('.an-term-text')!.getBoundingClientRect().height })))) {
    expect(t.title).toMatch(/ - /)
    expect(t.h).toBeLessThanOrEqual(34)
  }
  const splitter = view(page).getByRole('separator', { name: 'Resize score details' })
  await splitter.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(w) + 10)
  const abbrev = (await panel.locator('h3').textContent())!
  await panel.getByRole('button', { name: 'Prescribe' }).click()
  const input = page.getByTestId('consultation-editor').getByRole('combobox', { name: 'Remedy' })
  await expect(input).toHaveValue(abbrev)
  await expect(input).toBeFocused()
})

test('Advanced strategy parameters: Kent must-cover-strong excludes with a reason, saved with the case, reset', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 4))
  // one strong symptom (intensity 3)
  const rows = page.getByTestId('clipboard-panel').locator('.cbp-row')
  await rows.nth(1).click()
  await page.keyboard.press('3')
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Kent/ }).click()
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Strategy parameters/ }).click()
  const drawer = view(page).getByTestId('analysis-params')
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.an-params-group.used legend')).toHaveText(/Kent hierarchy/)
  const total = Number(await view(page).locator('.an-count strong').textContent())
  await drawer.getByLabel('Must cover strong symptoms').check()
  await expect.poll(async () => Number(await view(page).locator('.an-count strong').textContent())).toBeLessThan(total)
  await expect(view(page).locator('.an-row').nth(1).locator('.an-flag.f-e')).toHaveAttribute('title', /Kent: must cover intensity/)
  // κ mental is editable and re-ranks
  const mental = drawer.getByLabel('κ mental')
  await mental.fill('10')
  await mental.press('Enter')
  await expect(view(page).locator('.an-pill.params')).toBeVisible()
  // saved with the analysis: survives a reload
  await waitForSaved(page)
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
  await view(page).locator('.an-pill.params .an-pill-text').click()
  await expect(drawer.getByLabel('Must cover strong symptoms')).toBeChecked()
  await expect(drawer.getByLabel('κ mental')).toHaveValue('10')
  await drawer.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(drawer.getByLabel('κ mental')).toHaveValue('3')
  await expect(drawer.getByLabel('Must cover strong symptoms')).not.toBeChecked()
  await expect(view(page).locator('.an-pill.params')).toHaveCount(0)
  await expect.poll(async () => Number(await view(page).locator('.an-count strong').textContent())).toBe(total)
})

test('the repertory view (minimum grade) applies before scoring', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  const size = Number(await view(page).locator('.an-row').first().locator('.an-size').textContent())
  await page.keyboard.press('Control+k')
  await page.keyboard.type('Grade 3 and higher')
  await page.keyboard.press('Enter')
  await expect(view(page).locator('.an-pill.view')).toContainText('Grades ≥ 3')
  await expect(view(page).locator('.an-cell.k1, .an-cell.k2')).toHaveCount(0)
  expect(await view(page).locator('.an-cell.k3, .an-cell.k4').count()).toBeGreaterThan(0)
  const viewSize = Number(await view(page).locator('.an-row').first().locator('.an-size').textContent())
  expect(viewSize).toBeLessThan(size)
  await view(page).getByRole('button', { name: 'Show all grades' }).click()
  await expect(view(page).locator('.an-pill.view')).toHaveCount(0)
  await expect(view(page).locator('.an-row').first().locator('.an-size')).toHaveText(String(size))
})

test('first F8 renders the grid fast and autosave settles to Saved', async ({ page }) => {
  // the seeded demo case: F8 straight after start-up
  const t0 = Date.now()
  await page.keyboard.press('F8')
  await expect(view(page)).toBeVisible()
  await expect(headers(page).first()).toBeVisible({ timeout: 10_000 })
  const gridMs = Date.now() - t0
  // generous for CI: about 0.5 s locally; the regression was 8 to 12 s of skeleton
  expect(gridMs).toBeLessThan(4000)
  await expect(page.locator('.save-ind')).toHaveAttribute('data-state', 'saved', { timeout: 3000 })
  await expect(page.locator('.save-ind')).toHaveText(/Saved/)
  await expect(page.locator('.save-ind .spin')).toHaveCount(0)
})

test('overflowing remedy columns show a right-edge cue that scrolls to them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
  const grid = view(page).locator('.an-grid')
  await expect(view(page).locator('.an-grid-fade')).toBeVisible()
  const more = view(page).locator('.an-more-cols')
  await expect(more).toHaveText(/^\d+ more remedies ›$/)
  const hidden = Number((await more.textContent())!.match(/\d+/)![0])
  // the last visible column is whole: it ends at the scroll box's edge
  const box = (await grid.boundingBox())!
  const edges = await headers(page).evaluateAll(els => els.map(e => e.getBoundingClientRect().right))
  const inside = edges.filter(r => r <= box.x + box.width + 0.5)
  expect(Math.abs(Math.max(...inside) - (box.x + (await grid.evaluate(e => e.clientWidth))))).toBeLessThanOrEqual(1)
  await more.click()
  await expect.poll(() => grid.evaluate(e => e.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(async () => Number(((await more.textContent()) ?? '0').match(/\d+/)?.[0] ?? 0)).toBeLessThan(hidden)
})

test('clipboard chips in the analysis toolbar look like the clipboard pane tabs', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
  const chip = view(page).locator('.an-chips .an-chip').first()
  const tab = page.getByTestId('clipboard-panel').locator('.cbp-chip').first()
  const style = (el: Element) => { const s = getComputedStyle(el); return [s.borderRadius, s.height, s.fontSize] }
  expect(await chip.evaluate(style)).toEqual(await tab.evaluate(style))
  await expect(chip.locator('.cbp-chip-num')).toHaveText('1')
  await expect(chip.locator('.cbp-chip-count')).toBeVisible()
})

test('first F8 at 1920×1080 in dark mode shows the grid fast, every visible column in the first commit', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1920)
  await settle(page)
  const t0 = Date.now()
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 10_000 })
  expect(Date.now() - t0).toBeLessThan(4000)
  // the grid fills the pane at once: no column is missing on the right of the visible area
  const box = await view(page).locator('.an-grid').boundingBox()
  const last = await headers(page).evaluateAll(els => Math.max(...els.map(e => e.getBoundingClientRect().right)))
  expect(last).toBeGreaterThanOrEqual(box!.x + box!.width - 40)
  await expect(page.locator('.save-ind')).toHaveAttribute('data-state', 'saved', { timeout: 5000 })
})

test('analysis toolbar: no orphan ellipsis, controls 24px high', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible()
  const tb = view(page).getByRole('toolbar', { name: 'Analysis toolbar' })
  // the remedy count reads "125 remedies" once there is a result, never a bare "…"
  await expect(tb.locator('.an-count')).toHaveText(/^\d[\d,]* remedies$/)
  for (const sel of ['.an-select', '.an-seg', '.an-tb-btn', '.an-rbox']) {
    const h = await tb.locator(sel).first().evaluate(e => e.getBoundingClientRect().height)
    expect(h, sel).toBe(24)
  }
})

test('switching displays answers within 100 ms; cards are virtualised', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible()
  // the bars and cards code is prefetched in idle time after the grid shows
  await settle(page)
  await view(page).getByRole('radio', { name: 'Grid' }).focus()
  // [ms until the segmented control shows the choice, ms until the display is on screen]
  const timeSwitch = (key: string, sel: string) => page.evaluate(([key, sel]) => new Promise<[number, number]>(done => {
    const t0 = performance.now()
    let pressed = 0
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    const tick = () => {
      if (!pressed && document.querySelector('.an-seg [aria-checked="true"]')?.getAttribute('title')?.endsWith(`(${key.toUpperCase()})`)) pressed = performance.now() - t0
      if (pressed && document.querySelector(sel)) done([pressed, performance.now() - t0])
      else requestAnimationFrame(tick)
    }
    tick()
  }), [key, sel] as const)
  // a production build shows each display within 100 ms (about 30-70 ms); the dev server's React runs several times slower
  const dev = await page.evaluate(() => !!document.querySelector('script[src*="@vite/client"]'))
  for (const [key, sel] of [['b', '.an-keep.on .an-bar-row'], ['c', '.an-keep.on .an-card'], ['g', '.an-keep.on .an-hcell'], ['c', '.an-keep.on .an-card']] as const) {
    const [pressed, shown] = await timeSwitch(key, sel)
    expect(pressed, `${key} pressed`).toBeLessThan(100)
    expect(shown, `${key} shown`).toBeLessThan(dev ? 400 : 100)
  }
  // Top All: thousands of remedies, only the visible card rows are in the DOM
  await view(page).getByLabel('Remedies shown').selectOption({ label: 'Top All' })
  await expect(view(page).locator('.an-count strong')).not.toHaveText('')
  const cards = view(page).locator('.an-keep.on .an-card')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeLessThan(120)
  // keyboard: End reaches the last card (rendered on demand), Home the first
  await cards.first().focus()
  await page.keyboard.press('End')
  const lastRank = await view(page).locator('.an-keep.on .an-card:focus .an-card-rank').textContent()
  expect(Number(lastRank!.replace(/\D/g, '') || 0)).toBeGreaterThan(100)
  await page.keyboard.press('Home')
  await expect(view(page).locator('.an-keep.on .an-card:focus')).toContainText('#1')
})
