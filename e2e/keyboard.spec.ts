import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const crumbs = (page: Page) => page.locator('.tab-doc[data-active] .rv-crumbs .rv-crumb-last')
const takeBar = (page: Page) => page.getByRole('dialog', { name: 'Take rubric' })
const selectedTab = (page: Page) => page.locator('.tab-main[aria-selected="true"]')

async function openBook(page: Page) {
  await openApp(page)
  if (!(await page.locator('.rv-scroll').count())) await page.getByRole('button', { name: 'Open repertory' }).first().click()
  await expect(page.locator('.rv-row').first()).toBeVisible()
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
}

test('bare + then ArrowDown takes the rubric at intensity 1 and moves on', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await expect(crumbs(page)).toHaveText('morning')
  await page.keyboard.type('+')
  await expect(takeBar(page)).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(takeBar(page)).toHaveCount(0)
  const toast = page.locator('.toast').filter({ hasText: 'Taken Mind - morning' })
  await expect(toast).toBeVisible()
  await expect(toast).toContainText(/· ×1 → \S/)
  await expect(toast).not.toContainText('(')
  await expect(crumbs(page)).not.toHaveText('morning')
  await expect(page.locator('.tab-doc[data-active] .rv-scroll')).toBeFocused()
})

test('F8 from the take bar commits the take, then opens the analysis', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+2')
  await page.keyboard.press('F8')
  await expect(page.locator('.toast').filter({ hasText: /Taken Mind - morning · ×2/ })).toBeVisible()
  await expect(page.getByTestId('analysis-view')).toBeVisible()
})

test('an invalid command is dropped by F2, which still opens Find', async ({ page }) => {
  await openBook(page)
  await page.keyboard.type('+9')
  await page.keyboard.press('F2')
  await expect(takeBar(page)).toHaveCount(0)
  await expect(page.locator('.toast').filter({ hasText: 'Taken' })).toHaveCount(0)
  await expect(page.getByRole('dialog').first()).toBeVisible()
})

test('Ctrl+1..5 open documents and Ctrl+6..9 switch tabs from inside a text field', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('Control+f')
  await expect(page.locator(':focus')).toHaveAttribute('type', /text|search/)
  await page.keyboard.press('Escape')
  // documents from a text field
  for (const [key, name] of [['Control+2', /Materia medica|Boericke/], ['Control+3', /Patients/], ['Control+1', /Repertories/]] as const) {
    await page.keyboard.press('Control+f')
    await page.keyboard.type('fear')
    await page.keyboard.press(key)
    await expect(selectedTab(page)).toHaveAccessibleName(name)
    await page.keyboard.press('Escape')
  }
  const count = await page.locator('.tab-main').count()
  expect(count).toBeGreaterThanOrEqual(3)
  await page.keyboard.press('Control+f')
  await page.keyboard.press('Control+9')
  await expect(page.locator('.tab-main').nth(count - 1)).toHaveAttribute('aria-selected', 'true')
})

test('Escape in a form field returns focus to the document list', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+3')
  const search = page.locator('.tab-doc[data-active] .pt-search-input')
  await search.focus()
  await page.keyboard.press('Escape')
  await expect(search).not.toBeFocused()
  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('tabindex', /0|-1/)
  expect(await focused.evaluate(el => !!el.closest('.pane-center .tab-content') && !['INPUT', 'TEXTAREA'].includes(el.tagName))).toBe(true)
})

test('copy rubric text is on Ctrl+Shift+Y', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Control+Shift+Y')
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('morning')
})
