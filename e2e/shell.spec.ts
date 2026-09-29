import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('shell boots with menubar, toolbar, tabs and status bar', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Open documents' })).toBeVisible()
  await expect(page.getByLabel('Status')).toContainText('rubrics')
})

async function freshApp(page: import('@playwright/test').Page, w = 1440, h = 900) {
  await page.setViewportSize({ width: w, height: h })
  await page.addInitScript(() => { try { localStorage.setItem('radar-opus.welcome.v1', 'done') } catch { /* blocked */ } })
  await openApp(page)
  await page.waitForTimeout(300)
}
const activeInfo = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null
  return { tag: a?.tagName, id: a?.id, role: a?.getAttribute('role'), inDoc: !!a?.closest('#document-panel'), inNav: !!a?.closest('.pane-left'), body: a === document.body }
})

test('tab strip: tabs shrink and scroll inside the document pane; close lives outside role=tab', async ({ page }) => {
  await freshApp(page)
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'New repertory tab' }).click()
  const strip = await page.locator('.tabstrip').boundingBox()
  const right = await page.locator('.pane-right').boundingBox()
  expect(strip!.x + strip!.width).toBeLessThanOrEqual(right!.x + 1)
  await expect(page.locator('.tabstrip')).toHaveClass(/overflowing/)
  await expect(page.getByRole('button', { name: /All \d+ tabs/ })).toBeVisible()
  // the active (newest) tab is scrolled into view
  const active = await page.locator('.tabstrip [role=tab][aria-selected=true]').boundingBox()
  const list = await page.locator('.tabstrip-list').boundingBox()
  expect(active!.x).toBeGreaterThanOrEqual(list!.x - 1)
  expect(active!.x + active!.width).toBeLessThanOrEqual(list!.x + list!.width + 1)
  // no interactive element nested in a tab; tabs control the document panel
  expect(await page.locator('.tabstrip [role=tab] button').count()).toBe(0)
  await expect(page.locator('.tabstrip [role=tab][aria-selected=true]')).toHaveAttribute('aria-controls', 'document-panel')
  await expect(page.locator('#document-panel')).toHaveAttribute('role', 'tabpanel')
  // no horizontal page scroll
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('menubar: one tab stop, Escape and chosen items give focus back', async ({ page }) => {
  await freshApp(page)
  const bar = page.getByRole('menubar', { name: 'Main menu' })
  expect(await bar.locator('[role=menuitem][tabindex="0"]').count()).toBe(1)
  // only menuitems inside the menubar
  expect(await bar.locator('> :not([role=menuitem])').count()).toBe(0)

  await page.locator('.pane-left [role=treeitem]').first().click()
  const before = await activeInfo(page)
  expect(before.inNav).toBe(true)

  await page.keyboard.press('F10')
  await expect(bar.getByRole('menuitem', { name: 'File' })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await activeInfo(page)).toEqual(before)

  await page.keyboard.press('F10')
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: 'File' })
  await expect(menu).toBeVisible()
  // the active item is exposed to assistive technology
  const activeId = await menu.getAttribute('aria-activedescendant')
  expect(activeId).toBeTruthy()
  await expect(page.locator(`[id="${activeId}"]`)).toHaveClass(/active/)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  expect(await activeInfo(page)).toEqual(before)

  // a chosen item runs after focus is back: About opens, and closing it restores focus again
  await page.keyboard.press('F10')
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /About/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(await activeInfo(page)).toEqual(before)
})

test('closing a tab with Alt+W moves focus into the next document', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: 'New repertory tab' }).click()
  await page.locator('#document-panel').click({ position: { x: 300, y: 200 } })
  await page.keyboard.press('Alt+w')
  await expect.poll(async () => (await activeInfo(page)).inDoc).toBe(true)
})

test('toolbar Take follows ticked search results', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  // (starting a search while the background index warm-up begins can stall; wait it out)
  await page.waitForTimeout(2500)
  await page.keyboard.press('F4')
  const input = page.getByPlaceholder(/Words in rubric paths/)
  await input.fill('anxiety')
  const take = page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Take rubric' })
  const box = page.locator('.srch-results .srch-cb').first()
  await box.waitFor({ timeout: 20_000 })
  await box.click()
  // ticking a result only changes the search feature's selection store: the toolbar still follows it
  await expect(take).toBeEnabled()
})

test('status bar spells out units; shortcuts reference hides reserved chords', async ({ page }) => {
  await freshApp(page)
  await expect(page.getByLabel('Status')).toContainText(/\d[\d,]* remedies/)
  await expect(page.getByLabel('Status')).toContainText(/\d[\d,]* rubrics/)
  await page.keyboard.press('F1')
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dlg).toBeVisible()
  await expect(dlg).not.toContainText('Ctrl+W')
  await expect(dlg).not.toContainText('Ctrl+Tab')
  await expect(dlg).toContainText('Alt+W')
  await expect(dlg).toContainText('in the clipboard list')
  await expect(dlg).toContainText('Browser keys used by Radar Opus')
  await expect(dlg.locator('kbd', { hasText: /^Shift\+\?$/ })).toHaveCount(0)
})

test('640px wide (200% zoom): toolbar folds, no horizontal page scroll', async ({ page }) => {
  await freshApp(page, 640, 450)
  await expect(page.getByRole('button', { name: 'More tools' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640)
  const tb = await page.getByRole('toolbar', { name: 'Main toolbar' }).evaluate(el => [el.scrollWidth, el.clientWidth])
  expect(tb[0]).toBeLessThanOrEqual(tb[1])
})

test('1152px: the document pane keeps at least 640px beside both side panes', async ({ page }) => {
  await freshApp(page, 1152, 720)
  const doc = await page.locator('.pane-center').boundingBox()
  expect(doc!.width).toBeGreaterThanOrEqual(639)
})
