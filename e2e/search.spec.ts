import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const crumbs = (page: Page) => page.locator('.rv-crumbs')
const searchTabs = (page: Page) => page.getByRole('tab').filter({ has: page.locator('.tab-sub', { hasText: /Search/ }) })

async function ready(page: Page) {
  await openApp(page)
  if (!(await page.locator('.rv-scroll').count())) await page.getByRole('button', { name: 'Open repertory' }).first().click()
  await expect(page.locator('.rv-row').first()).toBeVisible()
}

test('quick find: type-ahead, open, take and escape', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Control+f')
  const box = page.getByRole('combobox', { name: 'Quick find' })
  await expect(box).toBeFocused()
  await box.pressSequentially('fear night')
  const list = page.getByRole('listbox', { name: 'Quick find results' })
  await expect(list.getByRole('option').first()).toContainText('night')
  await expect(list.locator('.qf-head').first()).toContainText('Mind')
  // Alt+Enter takes into the clipboard without leaving the box
  await page.keyboard.press('Alt+Enter')
  await expect(page.locator('.toast').filter({ hasText: /Taken Mind - fear - night/ })).toBeVisible()
  // Enter opens the rubric in the repertory
  await page.keyboard.press('Enter')
  await expect(list).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('night')
  // remedies are offered too, and Esc closes the dropdown
  await page.keyboard.press('Control+f')
  await page.keyboard.type('nat-m')
  await expect(list.locator('.qf-remedy').first()).toContainText('Natrium')
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  // Ctrl+Enter opens a full search tab
  await page.keyboard.press('Control+f')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('head pain')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('combobox', { name: 'Search query' })).toHaveValue('head pain')
  await expect(page.locator('.srch-total')).toContainText('rubrics')
})

test('F4 search: operators, selection, take and summary filter', async ({ page }) => {
  await ready(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('F4')
  const q = page.getByRole('combobox', { name: 'Search query' })
  await expect(q).toBeFocused()
  await q.fill('head pain night')
  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByRole('option').first()).toContainText('Head, pain, night')
  await expect(results.locator('mark').first()).toBeVisible()
  const total = Number((await page.locator('.srch-total b').first().textContent())!.replace(/\D/g, ''))
  expect(total).toBeGreaterThan(50)

  // NOT narrows the results
  await q.fill('head pain night ! forehead')
  await expect(page.locator('.srch-desc')).toHaveText('head and pain and night and not forehead')
  const narrowed = Number((await page.locator('.srch-total b').first().textContent())!.replace(/\D/g, ''))
  expect(narrowed).toBeLessThan(total)

  // syntax errors are reported
  await q.fill('fear |')
  await expect(page.locator('.srch-err')).toContainText('Nothing after')
  await q.fill('head pain night')

  // keyboard: Enter moves to the list, Space ticks, Take takes the ticked rubrics
  await q.press('Enter')
  await expect(results).toBeFocused()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(page.locator('.srch-total')).toContainText('2 selected')
  await page.getByRole('button', { name: /^Take 2/ }).click()
  await expect(page.locator('.toast').filter({ hasText: /Taken 2 rubrics/ })).toBeVisible()

  // summary: clicking a remedy bar filters the results
  const bar = page.locator('.srch-sum .srch-barrow').first()
  const abbrev = (await bar.locator('.srch-barlabel').textContent())!
  await bar.click()
  await expect(page.locator('.srch-chip')).toContainText(`with ${abbrev}`)
  await page.locator('.srch-chip').click()
  await expect(page.locator('.srch-chip')).toBeHidden()

  // Enter on a result opens it in the repertory
  await results.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('night')
})

test('F4 scope: all repertories and chapter; recent searches', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('F4')
  const q = page.getByRole('combobox', { name: 'Search query' })
  await q.fill('angst')
  await q.press('Enter')
  await page.getByRole('combobox', { name: 'Search scope' }).selectOption('all')
  await expect(page.locator('.srch-repbadge').first()).toBeVisible()
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option').first()).toBeVisible()
  await page.getByRole('combobox', { name: 'Search scope' }).selectOption('chapter')
  await page.getByRole('combobox', { name: 'Chapter' }).selectOption({ label: 'Mind' })
  await q.fill('fear night')
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option').first()).toContainText('Mind')
  await q.fill('')
  await expect(page.getByRole('list', { name: 'Recent searches' })).toContainText('angst')
})

test('F5 remedy search with grade filter and chapter jump', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('F5')
  const picker = page.getByRole('combobox', { name: 'Remedy' })
  await expect(picker).toBeFocused()
  await picker.pressSequentially('lach')
  await page.keyboard.press('Enter')
  await expect(picker).toHaveValue(/Lach — Lachesis/)
  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.locator('.srch-head').first()).toContainText('Mind')
  const all = Number((await page.locator('.srch-total b').first().textContent())!.replace(/\D/g, ''))
  await page.getByRole('combobox', { name: 'Minimum grade' }).selectOption('3')
  await expect.poll(async () => Number((await page.locator('.srch-total b').first().textContent())!.replace(/\D/g, ''))).toBeLessThan(all)
  await expect(results.locator('.srch-grade').first()).toHaveClass(/g3|g4/)
  await page.getByRole('spinbutton', { name: 'Maximum rubric size' }).fill('5')
  await expect(results.locator('.srch-count').first()).toHaveText(/^[1-5]$/)
  // chapter summary jumps
  await page.locator('.srch-sum').getByRole('tab', { name: 'Chapters' }).click()
  await expect(page.locator('.srch-sum .srch-barrow').first()).toBeVisible()
})

test('multiple search tabs and graphical comparison', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('F4')
  await page.getByRole('combobox', { name: 'Search query' }).fill('head pain night')
  await page.keyboard.press('Control+Shift+F')
  await expect(searchTabs(page)).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Search query' }).fill('vertigo morning')
  await page.locator('.srch-sum').getByRole('tab', { name: /Compare 2 searches/ }).click()
  await expect(page.locator('.srch-legend-searches li')).toHaveCount(2)
  await expect(page.locator('.srch-sum .srch-barrow').first()).toContainText('2/2')
})

test('command palette: commands, prefixes, remedies, rubrics, focus restore', async ({ page }) => {
  await ready(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('Control+k')
  const pal = page.getByRole('dialog', { name: 'Command palette' })
  await expect(pal).toBeVisible()
  await page.keyboard.type('>zoom in')
  await expect(pal.locator('.pal-mode')).toHaveText('Commands')
  await expect(pal.getByRole('option').first()).toContainText('Zoom in')
  await page.keyboard.press('Escape')
  await expect(pal).toBeHidden()
  await expect(page.locator('.rv-scroll')).toBeFocused()

  // run a command: toggling the navigator pane
  const nav = page.getByRole('complementary', { name: 'Repertory navigator' })
  const had = await nav.count()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('navigator pane')
  await page.keyboard.press('Enter')
  await expect(nav).toHaveCount(had ? 0 : 1)

  // remedies with '#'
  await page.keyboard.press('Control+k')
  await page.keyboard.type('#nat-m')
  await expect(pal.getByRole('option').first()).toContainText('Natrium')

  // rubrics as you type
  await page.keyboard.press('Control+a')
  await page.keyboard.type('/fear night')
  await expect(pal.getByRole('option').first()).toContainText('night')
  await page.keyboard.press('Enter')
  await expect(pal).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('night')

  // mouse: clicking an item runs it; recent commands come first
  await page.keyboard.press('Control+k')
  await expect(pal.locator('.pal-head').first()).toHaveText('Recently used')
  await pal.getByRole('option', { name: /Navigator pane/ }).click()
  await expect(nav).toHaveCount(had ? 1 : 0)
})
