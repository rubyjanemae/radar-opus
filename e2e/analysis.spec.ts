import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp, settle, waitForSaved, showClipboardPane, menubar } from './helpers'

const view = (page: Page) => page.getByTestId('analysis-view')
const headers = (page: Page) => view(page).locator('.an-hcell')
/** Symptom lines of the grid's symptom pane (the clipboard header bars are `.an-cbrow`). */
const symRows = (page: Page) => view(page).locator('.an-row:not(.an-cbrow)')
const symLabels = (page: Page) => symRows(page).locator('.an-label')
/** The footer's "N symptom(s) / M remedies" box. */
const countBox = (page: Page) => view(page).locator('.an-footer .an-count')
const remedyTotal = async (page: Page) => Number(((await countBox(page).locator('strong').nth(1).textContent()) ?? '').replace(/\D/g, ''))
/** Run a command by its title through the command palette. */
async function runPalette(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
}
/** Pick an entry of a toolbar menu button. */
async function toolbarMenu(page: Page, button: string | RegExp, item: string | RegExp) {
  await view(page).getByRole('button', { name: button }).click()
  await page.getByRole('menu').getByRole('menuitem').or(page.getByRole('menu').getByRole('menuitemcheckbox')).filter({ hasText: item }).first().click()
}
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

test.beforeEach(async ({ page }) => { await openApp(page); await showClipboardPane(page) })

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
  await expect(symRows(page)).toHaveCount(2, { timeout: 20_000 })
  // one salmon header bar for the clipboard, symptoms numbered within it
  await expect(view(page).locator('.an-cbrow')).toHaveText('1. Clipboard 1')
  await expect(symLabels(page).first().locator('.an-sym-n')).toHaveText('1.')
  // RadarOpus form: chapter and first level in capitals, " - " between levels
  await expect(symLabels(page).first().locator('.an-label-text')).toHaveText('MIND - ANXIETY - night')
  // the grey triangle opens the symptom's detail line (its repertory; size and intensity are on the line itself) and closes it again
  await symLabels(page).first().locator('.an-sdisc').click()
  await expect(view(page).locator('.an-inforow')).toHaveText('Repertorium Publicum')
  await expect(symLabels(page).first()).toHaveAttribute('aria-expanded', 'true')
  await symLabels(page).first().locator('.an-sdisc').click()
  await expect(view(page).locator('.an-inforow')).toHaveCount(0)
  await dropRubrics(page, RUBRICS.slice(2, 3))
  await expect(symRows(page)).toHaveCount(3)
  await expect(countBox(page)).toHaveText(/^3 symptom\(s\) \/ [\d,]+ remedies$/)
})

test('grid ranks remedies, strategy menu re-ranks and is checked', async ({ page }) => {
  await analysedCase(page)
  // header row + clipboard bar + 9 symptoms
  await expect(view(page).getByRole('grid')).toHaveAttribute('aria-rowcount', '11')
  const first = headers(page).first()
  await expect(first.locator('.an-rank')).toHaveText('1')
  // the default method, Prominence, prints one score row (100 / 120 / 160 points per grade 1 / 2 / 3), sorted descending
  await expect(view(page).locator('.an-fstrategy')).toHaveText('Prominence')
  await expect(first.locator('.an-score')).toHaveText(/^\d+$/)
  await expect(first.locator('.an-score2')).toHaveCount(0)
  const scores = (await headers(page).locator('.an-score').allTextContents()).slice(0, 10).map(Number)
  for (let i = 1; i < scores.length; i++) expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
  expect(scores[0] % 20).toBe(0)
  // Sum of symptoms (sorted degrees) prints two score rows: symptoms, then degrees
  await toolbarMenu(page, /Analysis method/, /Sum of symptoms \(sorted degrees\)/)
  await expect(first.locator('.an-score2')).toHaveText(/^\d+$/)
  const sym = await headers(page).locator('.an-score').allTextContents()
  const deg = await headers(page).locator('.an-score2').allTextContents()
  const keyed = sym.slice(0, 10).map((x, k) => [Number(x), Number(deg[k])])
  for (let i = 1; i < keyed.length; i++) expect(keyed[i - 1][0] * 1000 + keyed[i - 1][1]).toBeGreaterThanOrEqual(keyed[i][0] * 1000 + keyed[i][1])

  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Small rubrics \(SPF\)/ }).click()
  await expect(view(page).getByRole('button', { name: /Analysis method: Small rubrics \(Organon/ })).toBeVisible()
  await expect(first.locator('.an-score2')).toHaveCount(0)
  await expect(view(page).locator('.an-fstrategy')).toContainText('Small rubrics (SPF)')
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: /Small rubrics \(SPF\)/ })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')

  // undo restores the previous strategy (options are case data)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(view(page).getByRole('button', { name: /Analysis method: Sum of symptoms \(sort degrees\)/ })).toBeVisible()
})

test('Analysis › Select your default analysis method sets the default for new analyses', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 2))
  await (await menubar(page)).getByRole('menuitem', { name: 'Analysis' }).click()
  // a submenu of RadarOpus's methods; choosing one makes it the default
  await page.getByRole('menuitem', { name: 'Select your default analysis method' }).hover()
  const methods = page.getByRole('menu', { name: 'Select your default analysis method' })
  await methods.getByRole('menuitemcheckbox', { name: 'Small rubrics (SPF)', exact: true }).click()
  // the current analysis switches too
  await expect(view(page).locator('.an-fstrategy')).toHaveText('Small rubrics (SPF)')
  // a new case starts with it (its analysis opens in a tab of its own)
  await newCase(page)
  await dropRubrics(page, RUBRICS.slice(0, 1))
  await page.keyboard.press('F8')
  await expect(page.locator('[data-testid="analysis-view"]:visible .an-fstrategy')).toHaveText('Small rubrics (SPF)')
  await (await menubar(page)).getByRole('menuitem', { name: 'Analysis' }).click()
  await page.getByRole('menuitem', { name: 'Select your default analysis method' }).hover()
  await expect(methods.getByRole('menuitemcheckbox', { name: 'Small rubrics (SPF)', exact: true })).toHaveAttribute('aria-checked', 'true')
  // Escape changes nothing
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(methods).toBeHidden()
  await expect(page.locator('[data-testid="analysis-view"]:visible .an-fstrategy')).toHaveText('Small rubrics (SPF)')
})

test('keyboard grid navigation and drill-down panel', async ({ page }) => {
  await analysedCase(page)
  await view(page).locator('.an-corner').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-cell="-1:1"]')).toBeFocused()
  // cells name their remedy and symptom for screen readers
  // line 0 is the clipboard's header bar, line 1 the first symptom
  await expect(page.locator('[data-cell="1:0"]')).toHaveAttribute('aria-label', /^\S+, MIND - ANXIETY - night: (grade \d|absent)$/)
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
  // down from the header: the clipboard bar (it has no remedy cells), then the first symptom in the same column
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-cell="0:-1"]')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-cell="1:1"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})

test('symptom pane keys: 0–4 set the intensity, Delete removes (undoable); the drill-down keeps the pane width', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 2))
  const weight = symLabels(page).first().locator('.an-weight')
  await expect(weight).toHaveText('1')
  const score = headers(page).first().locator('.an-score')
  const before = Number(await score.textContent())
  await symLabels(page).first().focus()
  await page.keyboard.press('3')
  await expect(weight).toHaveText('3')
  await expect.poll(async () => Number(await headers(page).first().locator('.an-score').textContent())).toBeGreaterThan(before)
  // 0 ignores the symptom; the pane stays, so another digit brings it back
  await page.keyboard.press('0')
  await expect(weight).toHaveText('0')
  await expect(symLabels(page).first()).toBeFocused()
  await page.keyboard.press('1')
  await expect(weight).toHaveText('1')
  // the context menu offers the same edits
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menu').getByRole('menuitem', { name: /Remove symptom/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await symLabels(page).first().focus()
  await page.keyboard.press('Delete')
  await expect(symRows(page)).toHaveCount(1)
  await expect(countBox(page)).toContainText(/^1 symptom\(s\)/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(symRows(page)).toHaveCount(2)
  // the remedy drill-down takes its room from the remedy columns, not from the symptom pane
  const label = () => view(page).getByRole('grid').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--an-label')))
  const w0 = await label()
  await headers(page).first().click()
  await expect(page.getByTestId('remedy-panel')).toBeVisible()
  expect(await label()).toBe(w0)
})

test('an open context menu keeps its keys from the grid; Escape returns to the cell with its ring', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 2))
  const first = symLabels(page).first()
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await expect(first).toBeFocused()
  const grid = view(page).getByRole('grid')
  await expect(grid).toHaveClass(/an-keyed/)
  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu', { name: 'Context menu' })
  await expect(menu).toBeFocused()
  // arrows, digits and Delete belong to the menu: the grid cursor and the case do not change
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('3')
  await page.keyboard.press('Delete')
  await expect(menu).toBeFocused()
  await expect(symRows(page)).toHaveCount(2)
  await expect(first.locator('.an-weight')).toHaveText('1')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(first).toBeFocused()
  await expect(grid).toHaveClass(/an-keyed/)
})

test('symptoms only (F7 without the clipboard pane) hides the remedy columns, F8 brings them back; the toolbar moves with arrow keys', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 2))
  await expect(headers(page).first()).toBeVisible()
  // the clipboard pane is open in these tests, where F7 focuses it: the command F7 runs without it
  await runPalette(page, 'Show analysis with symptoms only')
  await expect(headers(page)).toHaveCount(0)
  await expect(symRows(page)).toHaveCount(2)
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible()
  const tb = view(page).getByRole('toolbar', { name: 'Analysis toolbar' })
  await tb.getByRole('button', { name: 'Display and remedies shown' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tb.getByRole('button', { name: /^Analysis method/ })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tb.getByRole('button', { name: 'Display and remedies shown' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tb.getByRole('button', { name: 'Display and remedies shown' })).toBeFocused()
})

test('symptom row highlights remedies in it; Search remedy marks columns and jumps to a remedy', async ({ page }) => {
  await analysedCase(page)
  // the highlight is shown in place: the grid does not move under the pointer (no banner above it)
  const y0 = (await symLabels(page).nth(2).boundingBox())!.y
  await symLabels(page).nth(2).click()
  await expect(view(page).locator('.an-row.selected')).toHaveCount(1)
  await expect(view(page).locator('.an-row.selected .an-label-text')).toHaveText('HEAD - PAIN - morning')
  expect((await symLabels(page).nth(2).boundingBox())!.y).toBe(y0)
  await expect(view(page).locator('.an-hcell.hit').first()).toBeAttached()
  // a second click (or Escape) clears it
  await symLabels(page).nth(2).click()
  await expect(view(page).locator('.an-row.selected')).toHaveCount(0)

  const box = view(page).getByRole('combobox', { name: 'Search remedy' })
  await box.fill('lyc')
  // RadarOpus's completer lists the column abbreviation ("lyc."), matched on its start
  await expect(view(page).locator('#an-rbox-list').getByRole('option').first()).toHaveText('lyc.')
  // typing marks the matching columns
  await expect(view(page).locator('.an-hcell.found .an-abbrev').first()).toHaveText('lyc.')
  await box.press('Enter')
  await expect(page.getByTestId('remedy-panel').locator('h3')).toHaveText('Lyc')
  await expect(view(page).locator('.an-hcell.selected .an-abbrev')).toHaveText('lyc.')
})

test('exclude, show in position, intensity toggle and filters', async ({ page }) => {
  await analysedCase(page)
  await expect(view(page).locator('.an-toolbar [aria-pressed="true"]')).toHaveCount(0)
  const top = await headers(page).first().locator('.an-abbrev').textContent()
  await headers(page).first().click()
  await page.getByTestId('remedy-panel').getByRole('button', { name: 'Exclude' }).click()
  await expect(view(page).locator('.an-pill')).toContainText('1 excluded')
  await expect(headers(page).first().locator('.an-abbrev')).not.toHaveText(top!)
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Show excluded remedies in position/ }).click()
  await expect(headers(page).first().locator('.an-abbrev')).toHaveText(top!)
  await expect(headers(page).first()).toHaveClass(/excl/)
  await expect(headers(page).first().locator('.an-rank')).toHaveText('–')
  await view(page).getByRole('button', { name: 'Include all excluded remedies' }).click()
  await expect(view(page).locator('.an-pill')).toHaveCount(0)

  // intensity toggle: in the method menu (the toolbar shows no pressed button by default, RadarOpus)
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' }).click()
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' })).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')

  // family filter (the Filter button defers to the families feature): limit to Plants
  await toolbarMenu(page, 'Remedy filters', 'Family filter…')
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
  await toolbarMenu(page, 'Remedy filters', 'Include / exclude remedies…')
  const pick = page.getByRole('dialog', { name: 'Filter remedies' })
  await pick.getByRole('tab', { name: 'Exclude' }).click()
  // checkbox 0 is "In this analysis only"; 1 is the first remedy
  await pick.getByRole('checkbox').nth(1).check()
  await pick.getByLabel('Minimum symptoms covered').fill('3')
  await pick.getByRole('button', { name: 'Apply' }).click()
  await expect(view(page).locator('.an-pillbar')).toContainText('1 excluded')
  await expect(view(page).locator('.an-pillbar')).toContainText('≥ 3 symptoms')
  // pills live in the footer's remedy-filter box, so the toolbar keeps its height
  expect(await view(page).locator('.an-toolbar').evaluate(e => e.getBoundingClientRect().height)).toBe(toolbarHeight)

  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('Remove all remedy filters')
  await page.keyboard.press('Enter')
  await expect(view(page).locator('.an-pillbar')).toHaveText('All remedies')
})

test('Search remedy pins a remedy beyond the limit as an extra column', async ({ page }) => {
  await analysedCase(page)
  await toolbarMenu(page, 'Display and remedies shown', 'Top 10')
  await expect(headers(page)).toHaveCount(10)
  const lastRanked = await headers(page).nth(9).locator('.an-abbrev').textContent()
  // pick a remedy ranked beyond the top 10 from the Search remedy field
  const box = view(page).getByRole('combobox', { name: 'Search remedy' })
  await box.fill('a')
  const options = view(page).locator('#an-rbox-list').getByRole('option')
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
  // columns print the abbreviation as the book does: lower case with a final dot
  await expect(pinned.locator('.an-abbrev')).toHaveText(`${target.toLowerCase().replace(/\.$/, '')}.`)
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
  // the display menu shows the current display checked and switches it
  await view(page).getByRole('button', { name: 'Display and remedies shown' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Bars' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemcheckbox', { name: 'Remedy cards' }).click()
  await expect(view(page).locator('.an-card').first()).toContainText('#1')
  await view(page).locator('.an-card').first().focus()
  await page.keyboard.press('g')
  await expect(view(page).getByRole('grid')).toBeVisible()
})

test('export CSV and print', async ({ page }) => {
  await analysedCase(page)
  const dl = page.waitForEvent('download')
  await view(page).getByRole('button', { name: 'Display and remedies shown' }).click()
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
  await page.keyboard.press('ControlOrMeta+p')
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
  await view(page).getByRole('button', { name: 'Display and remedies shown' }).click()
  await page.getByRole('menuitem', { name: 'Compare remedies…' }).click()
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

  await runPalette(page, 'Analysis preview dock')
  const dock = page.getByTestId('analysis-dock')
  // the dock steps aside while the analysis tab is visible, and returns on another tab
  await expect(dock).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+5')
  await expect(page.getByTestId('families-view')).toBeVisible()
  await expect(dock.locator('.an-dock-bar')).toHaveCount(15)
  await expect(dock.locator('.an-hcell').first()).toBeVisible()
  // bars are stacked by grade, carry the score and select the remedy in the analysis tab
  const bar = dock.locator('.an-dock-bar').nth(4)
  await expect(bar).toHaveAttribute('title', /: \d+(\/\d+)?\ngrade/)
  expect(await bar.locator('.an-dock-stack > span').count()).toBeGreaterThan(0)
  const abbrev = (await bar.getAttribute('aria-label'))!.split(', ')[1]
  await bar.click()
  await expect(page.getByTestId('remedy-panel').locator('h3')).toHaveText(abbrev)
})

test('F8 focuses the grid; panel and highlighted symptom survive a tab switch', async ({ page }) => {
  await analysedCase(page)
  // the first symptom's first cell (line 0 is the clipboard bar)
  const cell = page.locator('[data-cell="1:0"]')
  await expect(cell).toBeFocused()
  // no focus ring on opening (RadarOpus): it shows only once a key moves inside the grid
  const ring = (sel: string) => page.locator(sel).evaluate(e => getComputedStyle(e).outlineStyle)
  expect(await ring('[data-cell="1:0"]')).toBe('none')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-cell="1:1"]')).toBeFocused()
  expect(await ring('[data-cell="1:1"]')).not.toBe('none')
  // PageUp from a symptom line stops at the first line, not on the column headers
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('PageUp')
  await expect(page.locator('[data-cell="0:-1"]')).toBeFocused()
  await page.keyboard.press('PageUp')
  await expect(page.locator('[data-cell="-1:1"]')).toBeFocused()
  await headers(page).nth(2).click()
  await symLabels(page).nth(1).click()
  const panel = page.getByTestId('remedy-panel')
  await expect(panel).toBeVisible()
  const abbrev = await panel.locator('h3').textContent()
  await page.keyboard.press('ControlOrMeta+5')
  await expect(page.getByTestId('families-view')).toBeVisible()
  await page.keyboard.press('F8')
  await expect(panel.locator('h3')).toHaveText(abbrev!)
  await expect(view(page).locator('.an-row.selected .an-label-text')).toHaveText('MIND - IRRITABILITY')
  await expect(view(page).locator('.an-grid [data-cell][tabindex="0"]')).toBeFocused()
  // hiding the tab fires no blur: coming back with F8 after a key showed the ring still opens without one
  await page.keyboard.press('ArrowRight')
  expect(await ring('.an-grid [data-cell][tabindex="0"]')).not.toBe('none')
  await page.keyboard.press('ControlOrMeta+5')
  await expect(page.getByTestId('families-view')).toBeVisible()
  await page.keyboard.press('F8')
  await expect(view(page).locator('.an-grid [data-cell][tabindex="0"]')).toBeFocused()
  expect(await ring('.an-grid [data-cell][tabindex="0"]')).toBe('none')
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
  await page.getByRole('tab', { name: / - \d+ -\s+Anna Keller/ }).click()
  const banner = view(page).getByTestId('analysis-other-case')
  await expect(banner).toContainText('Keller, Anna')
  await expect(banner).toContainText('Meier, Ben')
  // the toolbar keeps acting on this tab's case: its strategy changes, the active case's does not
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await page.getByRole('menuitemcheckbox', { name: /Small rubrics \(SPF\)/ }).click()
  await expect(view(page).getByRole('button', { name: /Analysis method: Small rubrics/ })).toBeVisible()
  await banner.getByRole('button', { name: 'Switch to active case' }).click()
  await expect(view(page).getByTestId('analysis-other-case')).toHaveCount(0)
  await expect(view(page)).toContainText('Nothing to analyse yet')
  await expect(view(page).getByRole('button', { name: /Analysis method: Prominence/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Analysis/ })).toHaveCount(1)
})

test('many clipboards: the display menu lists them, the toolbar keeps one 37px row', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  for (let i = 0; i < 11; i++) {
    await runPalette(page, 'New clipboard')
    // a new clipboard opens its name for editing: commit it
    const input = page.getByTestId('clipboard-panel').locator('input:focus')
    if (await input.count()) await input.press('Enter')
  }
  const toolbar = view(page).locator('.an-toolbar')
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(41)
  const button = view(page).getByRole('button', { name: 'Display and remedies shown' })
  await button.click()
  const menu = page.getByRole('menu', { name: 'Display' })
  await expect(menu.getByRole('menuitemcheckbox', { name: /^(\d+\. Clipboard|All clipboards)/ })).toHaveCount(13)
  await expect(menu.getByRole('menuitemcheckbox', { name: /^1\. Clipboard 1 \(3\)/ })).toHaveAttribute('aria-checked', 'true')
  await menu.getByRole('menuitemcheckbox', { name: 'All clipboards' }).click()
  await button.click()
  await expect(page.getByRole('menu', { name: 'Display' }).getByRole('menuitemcheckbox', { name: /^1\. Clipboard 1 \(3\)/ })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  // every toolbar button shares one height
  const shown = (els: Element[]) => els.filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().height))
  for (const h of await toolbar.locator('.an-tb-btn:not(.an-round)').evaluateAll(shown)) expect(h).toBe(34)
})

test('clipboard header bar: disclosure folds its symptoms, the close box takes it out of the analysis', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
  const bars = view(page).locator('.an-cbrow')
  await expect(bars).toHaveCount(2)
  await expect(bars.first()).toHaveText('1. Mentals & generals')
  const before = await symRows(page).count()
  const head = bars.first().locator('[role="rowheader"]')
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => symRows(page).count()).toBeLessThan(before)
  // the keyboard toggles it back
  await head.focus()
  await page.keyboard.press('Space')
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  await expect(symRows(page)).toHaveCount(before)
  // the close box removes the second clipboard from the analysis (Undo brings it back)
  await bars.nth(1).getByRole('button', { name: 'Remove Particulars from the analysis' }).click()
  await expect(bars).toHaveCount(1)
  // keyboard focus stays in the analysis, on the grid
  await expect.poll(() => view(page).evaluate(v => v.contains(document.activeElement) && document.activeElement !== document.body)).toBe(true)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(bars).toHaveCount(2)
  // removing every analysed clipboard: focus lands on the empty state's button
  await bars.nth(1).getByRole('button', { name: 'Remove Particulars from the analysis' }).click()
  await bars.first().getByRole('button', { name: 'Remove Mentals & generals from the analysis' }).click()
  const all = view(page).getByRole('button', { name: 'Analyse all clipboards' })
  await expect(all).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(bars).toHaveCount(2)
})

test('grid virtualises rows and columns', async ({ page }) => {
  const many = Array.from({ length: 60 }, (_, i) => `publicum:${191 + i * 1117}`)
  await analysedCase(page, many)
  await toolbarMenu(page, 'Display and remedies shown', 'All remedies')
  // header row + clipboard bar + 60 symptoms
  await expect(view(page).getByRole('grid')).toHaveAttribute('aria-rowcount', '62')
  const rendered = await view(page).locator('.an-row').count()
  expect(rendered).toBeLessThan(60)
  const cols = await view(page).locator('.an-hcell').count()
  expect(cols).toBeLessThan(100)
  // the remedy columns scroll sideways
  const grid = view(page).getByRole('grid')
  expect(await grid.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  // keyboard focus reaches rows and columns that were not rendered
  await view(page).locator('.an-corner').click()
  await page.keyboard.press('Control+End')
  const last = Number(await grid.getAttribute('aria-colcount')) - 2
  await expect(page.locator(`[data-cell="60:${last}"]`)).toBeFocused()
  expect(await grid.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await page.keyboard.press('Home')
  await expect(page.locator('[data-cell="60:-1"]')).toBeFocused()
})

test('dock scores are never clipped; its bars are list items', async ({ page }) => {
  await runPalette(page, 'Analysis preview dock')
  const dock = page.getByTestId('analysis-dock')
  // the dock shows the top 15 as bars; its grid renders the columns that fit the pane
  await expect(dock.locator('.an-dock-bar')).toHaveCount(15, { timeout: 20_000 })
  await expect(dock.locator('.an-hcell').first()).toBeVisible()
  // each score fits its column, which leaves room for five characters
  for (const f of await dock.locator('.an-score').evaluateAll(els => els.map(e => ({ t: e.textContent, over: e.scrollWidth - e.clientWidth, w: e.parentElement!.getBoundingClientRect().width })))) {
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
  // the filter menu button: a full 24px target, same focus rules
  const more = view(page).getByRole('button', { name: 'Remedy filters' })
  const box = (await more.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(24)
  expect(box.height).toBeGreaterThanOrEqual(24)
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  const exportBtn = view(page).getByRole('button', { name: 'Polarity' })
  await exportBtn.click()
  await page.keyboard.press('Escape')
  await expect(exportBtn).toBeFocused()
})

test('at 1152px the toolbar keeps one row, the clipboard pane folds away; the symptom pane keeps its width', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
  await analysedCase(page)
  // the ~300px clipboard pane collapses while the analysis is shown at <= 1200px
  await expect(page.getByTestId('clipboard-panel')).toHaveCount(0)
  const toolbar = view(page).locator('.an-toolbar')
  const tops = await toolbar.locator(':scope > *').evaluateAll(els => [...new Set(els.filter(e => e.getClientRects().length && e.getBoundingClientRect().width > 0).map(e => Math.round(e.getBoundingClientRect().top)))])
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(6)
  expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(41)
  // the footer names the method in full
  await expect(view(page).locator('.an-fstrategy')).toHaveText('Prominence')
  // symptom pane >= 200px; the remedy columns scroll sideways
  const g = await view(page).getByRole('grid').evaluate(el => ({ w: el.clientWidth, label: parseFloat(getComputedStyle(el).getPropertyValue('--an-label')), sw: el.scrollWidth }))
  expect(g.label).toBeGreaterThanOrEqual(200)
  expect(g.label).toBeLessThanOrEqual(326)
  expect(g.sw).toBeGreaterThan(g.w)
  // the analysis describes itself in its own footer; the desktop's status strip holds only its links (RadarOpus)
  await expect(page.locator('.statusbar')).not.toContainText('Sympt + Deg')
  // leaving the analysis reopens the pane it folded
  await page.getByRole('tab', { name: /^Repertorium Publicum/ }).click()
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
  // reopening it by hand on the analysis is respected
  await page.locator('.tab-main[data-kind="analysis"]').click()
  await expect(page.getByTestId('clipboard-panel')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+B')
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
})

test('narrow analysis toolbars keep the scoring toggles in the method menu; sideways scrolling rests on whole columns', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  // a narrow window: the side panes become overlays and the analysis has under 760px
  await page.setViewportSize({ width: 740, height: 720 })
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' })
  await expect(item).toHaveAttribute('aria-checked', 'true')
  await item.click()
  await view(page).getByRole('button', { name: /Analysis method/ }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Use symptom intensity' })).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')
  const grid = view(page).getByRole('grid')
  await grid.evaluate(el => el.scrollTo({ left: 40, behavior: 'instant' }))
  await expect.poll(() => grid.evaluate(el => el.scrollLeft % 25)).toBe(0)
  // End scrolls to the very end (room for the last leaning abbreviation), which is a whole column too
  await symLabels(page).first().focus()
  await page.keyboard.press('End')
  await expect.poll(() => grid.evaluate(el => el.scrollWidth - el.clientWidth - el.scrollLeft)).toBe(0)
  expect(await grid.evaluate(el => el.scrollLeft % 25)).toBe(0)
})

test('remedy panel: resizable, fixed number columns, short labels; Prescribe opens the prefilled form', async ({ page }) => {
  // wide enough that the panel sits beside the grid (narrow analysis tabs show it as an overlay)
  await page.setViewportSize({ width: 1800, height: 900 })
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
  // the gear opens the parameters too
  await view(page).getByRole('button', { name: 'Strategy parameters' }).click()
  const drawer = view(page).getByTestId('analysis-params')
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.an-params-group.used legend')).toHaveText(/Kent hierarchy/)
  const total = await remedyTotal(page)
  await drawer.getByLabel('Must cover strong symptoms').check()
  await expect.poll(() => remedyTotal(page)).toBeLessThan(total)
  await expect(symRows(page).nth(1).locator('.an-flag.f-e')).toHaveAttribute('title', /Kent: must cover intensity/)
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
  await expect.poll(() => remedyTotal(page)).toBe(total)
})

test('"Limit the analysis to a view" applies before scoring, to the analysis only', async ({ page }) => {
  await analysedCase(page, RUBRICS.slice(0, 3))
  const size = Number(await symRows(page).first().locator('.an-size').textContent())
  await expect(view(page).locator('.an-flimit')).toHaveText('No limitation')
  await view(page).getByRole('combobox', { name: 'Limit the analysis to a view' }).selectOption({ label: 'Grades 3 and 4' })
  await expect(view(page).locator('.an-pill.view')).toContainText('Grades 3 and 4')
  await expect(view(page).locator('.an-cell.k1, .an-cell.k2')).toHaveCount(0)
  expect(await view(page).locator('.an-cell.k3, .an-cell.k4').count()).toBeGreaterThan(0)
  const viewSize = Number(await symRows(page).first().locator('.an-size').textContent())
  expect(viewSize).toBeLessThan(size)
  // the repertory book keeps showing every grade: the limit belongs to the analysis
  await page.getByRole('tab', { name: /^Repertorium Publicum/ }).click()
  await expect.poll(() => page.locator('#document-panel .g1').count()).toBeGreaterThan(0)
  await page.locator('.tab-main[data-kind="analysis"]').click()
  await view(page).getByRole('button', { name: 'Remove the view limitation' }).click()
  await expect(view(page).locator('.an-pill.view')).toHaveCount(0)
  await expect(view(page).getByRole('combobox', { name: 'Limit the analysis to a view' })).toHaveValue('1')
  await expect(symRows(page).first().locator('.an-size')).toHaveText(String(size))
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

test('Search remedy scrolls a marked column beyond the right edge into view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
  const grid = view(page).locator('.an-grid')
  expect(await grid.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true)
  // the last ranked column lies beyond the right edge: searching for it scrolls it into view
  await toolbarMenu(page, 'Display and remedies shown', 'Top 50')
  await expect(view(page).getByRole('grid')).toHaveAttribute('aria-colcount', '51')
  await grid.evaluate(e => e.scrollTo({ left: e.scrollWidth, behavior: 'instant' }))
  const lastCol = view(page).locator('.an-hcell[aria-colindex="51"]')
  await expect(lastCol).toHaveCount(1)
  const lastAbbrev = (await lastCol.locator('.an-abbrev').textContent())!
  await grid.evaluate(e => e.scrollTo({ left: 0, behavior: 'instant' }))
  await view(page).getByRole('combobox', { name: 'Search remedy' }).fill(lastAbbrev)
  await expect(view(page).locator('.an-hcell.found').first()).toBeVisible()
  await expect.poll(() => grid.evaluate(e => e.scrollLeft)).toBeGreaterThan(0)
  // Escape clears the field and the marks, and the keyboard goes back to the grid
  await page.keyboard.press('Escape')
  await expect(view(page).locator('.an-hcell.found')).toHaveCount(0)
  await expect(view(page).locator('.an-grid [data-cell][tabindex="0"]')).toBeFocused()
})

test('RadarOpus layout: rank and score rows, grade badges with their number, four footer boxes', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible({ timeout: 20_000 })
  // 25px remedy columns
  const lefts = await headers(page).evaluateAll(els => els.slice(0, 3).map(e => e.getBoundingClientRect().left))
  expect(lefts[1] - lefts[0]).toBe(25)
  // every badge prints its grade
  const badge = view(page).locator('.an-cell.k3').first()
  expect(await badge.evaluate(e => getComputedStyle(e, '::before').content)).toBe('"3"')
  // symptom lines read "n. LABEL … (size) intensity"
  const first = symLabels(page).first()
  await expect(first.locator('.an-sym-n')).toHaveText('1.')
  expect(await first.locator('.an-size').evaluate(e => getComputedStyle(e, '::before').content)).toBe('"("')
  const boxes = view(page).locator('.an-footer .an-fbox')
  await expect(boxes).toHaveCount(4)
  await expect(boxes.nth(0)).toHaveText(/^\d+ symptom\(s\) \/ [\d,]+ remedies$/)
  await expect(boxes.nth(1)).toHaveText('Prominence')
  // four boxes of one width
  const bw = await boxes.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)))
  expect(Math.max(...bw) - Math.min(...bw)).toBeLessThanOrEqual(1)
  // abbreviations as the book prints them: lower case, final dot
  await expect(headers(page).first().locator('.an-abbrev')).toHaveText(/^[a-z][a-z0-9-]*\.$/)
  // the horizontal scrollbar runs under the remedy pane only, from the divider to the right edge
  const label = await view(page).getByRole('grid').evaluate(el => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).getPropertyValue('--an-label')))
  const bar = (await view(page).getByTestId('analysis-hscroll').boundingBox())!
  expect(Math.abs(bar.x - label)).toBeLessThanOrEqual(1)
  // its arrow steps one remedy column
  await view(page).getByTestId('analysis-hscroll').locator('.an-hbar-btn.right').click()
  await expect.poll(() => view(page).getByRole('grid').evaluate(el => el.scrollLeft)).toBe(25)
  await expect(boxes.nth(2)).toHaveText('No limitation')
  await expect(boxes.nth(3)).toHaveText('All remedies')
  // a small fixed thumb, as in RadarOpus
  expect(Math.round((await view(page).getByTestId('analysis-hscroll').locator('.an-hbar-thumb').boundingBox())!.width)).toBe(27)
  // RadarOpus draws the vertical scrollbar and the symptom pane's own one only while the lines overflow
  const overflows = await view(page).getByRole('grid').evaluate(el => el.scrollHeight - el.clientHeight > 1)
  await expect(view(page).getByTestId('analysis-vscroll')).toHaveCount(overflows ? 1 : 0)
  await expect(view(page).getByTestId('analysis-symptom-hscroll')).toHaveCount(overflows ? 1 : 0)
  if (overflows) {
    // the symptom pane's scrollbar sits left of the divider; its arrow slides the symptom texts
    const sbar = (await view(page).getByTestId('analysis-symptom-hscroll').boundingBox())!
    expect(sbar.x + sbar.width).toBeLessThanOrEqual(label)
    await view(page).getByTestId('analysis-symptom-hscroll').locator('.an-hbar-btn.right').click()
    await expect.poll(() => view(page).getByRole('grid').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--an-lx') || '0'))).toBeGreaterThan(0)
    // the vertical scrollbar runs down beside both horizontal ones
    const vb = (await view(page).getByTestId('analysis-vscroll').boundingBox())!
    expect(Math.abs(vb.y + vb.height - (bar.y + bar.height))).toBeLessThanOrEqual(1)
  }
  // the symptom line has a spoken name with its parts separated
  await expect(first).toHaveAttribute('aria-label', /^1\. MIND - .+, \d+ remedies, intensity \d/)
  // Prominence has no parameters: the gear opens the analysis settings instead
  await expect(view(page).getByRole('button', { name: 'Strategy parameters' })).toHaveCount(0)
  await view(page).getByRole('button', { name: 'Analysis settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
  // Edit › Copy analysis puts the table on the system clipboard
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await runPalette(page, 'Copy analysis')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Analysis\t/)
  // double click on a symptom shows its rubric in the book's open tab (no second tab for the same book)
  const bookTabs = page.locator('.tab-main[data-kind="repertory"]')
  await first.dblclick({ position: { x: 120, y: 8 } })
  await expect(page.locator('.tab-main[aria-selected="true"]')).toHaveAttribute('data-kind', 'repertory')
  const n = await bookTabs.count()
  await page.locator('.tab-main[data-kind="analysis"]').click()
  await symLabels(page).first().dblclick({ position: { x: 120, y: 8 } })
  await expect(page.locator('.tab-main[aria-selected="true"]')).toHaveAttribute('data-kind', 'repertory')
  expect(await bookTabs.count()).toBe(n)
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
  // the grid fills the pane at once: every one of the top 30 columns, or every column up to the right edge
  const box = await view(page).locator('.an-grid').boundingBox()
  const last = await headers(page).evaluateAll(els => Math.max(...els.map(e => e.getBoundingClientRect().right)))
  const count = await headers(page).count()
  expect(count === 30 || last >= box!.x + box!.width - 40).toBe(true)
  await expect(page.locator('.save-ind')).toHaveAttribute('data-state', 'saved', { timeout: 5000 })
})

test('analysis toolbar: count in the footer, controls share their heights', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible()
  // the remedy count reads "N symptom(s) / 125 remedies" once there is a result, never a bare "…"
  await expect(countBox(page)).toHaveText(/^\d+ symptom\(s\) \/ \d[\d,]* remedies$/)
  const tb = view(page).getByRole('toolbar', { name: 'Analysis toolbar' })
  for (const [sel, h] of [['.an-select', 22], ['.an-menu-btn', 34], ['.an-rbox-input', 22]] as const) {
    expect(await tb.locator(sel).first().evaluate(e => e.getBoundingClientRect().height), sel).toBe(h)
  }
})

test('switching displays answers fast; cards are virtualised', async ({ page }) => {
  await page.keyboard.press('F8')
  await expect(headers(page).first()).toBeVisible()
  // the bars and cards code is prefetched in idle time after the grid shows (fetched and evaluated, with its imports)
  await settle(page)
  await expect.poll(() => page.evaluate(() => ['AnalysisBars', 'AnalysisCards'].every(m => performance.getEntriesByType('resource').some(e => e.name.includes(m))))).toBe(true)
  await expect(view(page)).toHaveAttribute('data-views', 'ready', { timeout: 20_000 })
  await view(page).locator('.an-grid [data-cell][tabindex="0"]').focus()
  // ms until the display is on screen
  const timeSwitch = (key: string, sel: string) => page.evaluate(([key, sel]) => new Promise<number>(done => {
    const t0 = performance.now()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    const tick = () => { if (document.querySelector(sel)) done(performance.now() - t0); else requestAnimationFrame(tick) }
    tick()
  }), [key, sel] as const)
  // a production build shows each display within 100 ms (about 30-70 ms); the dev server's React runs several times slower
  const dev = await page.evaluate(() => !!document.querySelector('script[src*="@vite/client"]'))
  for (const [key, sel] of [['b', '.an-keep.on .an-bar-row'], ['c', '.an-keep.on .an-card'], ['g', '.an-keep.on .an-hcell'], ['c', '.an-keep.on .an-card']] as const) {
    const shown = await timeSwitch(key, sel)
    expect(shown, `${key} shown`).toBeLessThan(dev ? 400 : 100)
  }
  // All remedies: thousands of remedies, only the visible card rows are in the DOM
  await toolbarMenu(page, 'Display and remedies shown', 'All remedies')
  await expect(countBox(page)).not.toHaveText('Loading…')
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
