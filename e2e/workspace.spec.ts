import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp, waitForSaved } from './helpers'

async function menu(page: Page, top: string, item: string) {
  await page.getByRole('menubar', { name: 'Main menu' }).getByRole('menuitem', { name: top, exact: true }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: item }).first().click()
}

const html = (page: Page) => page.locator('html')

test('settings: tabs, live changes and keyboard toggle', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+Comma')
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('tab', { name: 'General' })).toBeFocused()

  // theme applies immediately
  await dlg.getByRole('radio', { name: 'Dark' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await dlg.getByRole('radio', { name: 'Light' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  // density
  await dlg.getByRole('radio', { name: 'Comfortable' }).click()
  await expect(html(page)).toHaveAttribute('data-density', 'comfortable')
  // text size slider
  await dlg.getByRole('slider', { name: 'Text size' }).fill('120')
  await expect(dlg.locator('.ws-slider-val')).toHaveText('120%')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.fontSize)).toBe('16px')
  await dlg.getByRole('button', { name: 'Reset text size' }).click()
  await expect(dlg.locator('.ws-slider-val')).toHaveText('100%')
  // reduce motion
  await dlg.getByLabel('Reduce motion').check()
  await expect(html(page)).toHaveAttribute('data-reduce-motion', 'true')

  // arrow keys move between tabs
  await dlg.getByRole('tab', { name: 'General' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(dlg.getByRole('tab', { name: 'Repertory' })).toHaveAttribute('aria-selected', 'true')
  await dlg.getByRole('radio', { name: 'Grade 3+' }).click()
  await expect(dlg.locator('.ws-preview-hidden')).toContainText('hidden')
  await dlg.getByRole('radio', { name: 'Full names' }).click()
  await expect(dlg.locator('.ws-preview-rems')).toContainText('Aconitum napellus')

  await dlg.getByRole('tab', { name: 'Analysis' }).click()
  await dlg.getByLabel('Result limit').selectOption('50')
  await dlg.getByText('Small rubrics (Organon §153)').click()
  await expect(dlg.locator('.ws-strategy.on')).toContainText('Small rubrics')

  // the menu reflects the same settings (one source of truth)
  await page.keyboard.press('Control+Comma')
  await expect(dlg).toBeHidden()
  await page.getByRole('menubar', { name: 'Main menu' }).getByRole('menuitem', { name: 'View', exact: true }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Show remedies' }).hover()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Grade 3 and higher' }).or(page.getByRole('menuitem', { name: /Grade 3 and higher/ }))).toBeVisible()
  await page.keyboard.press('Escape')

  // settings persist across reloads
  await waitForSaved(page)
  await page.reload()
  await page.waitForSelector('.shell')
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expect(html(page)).toHaveAttribute('data-density', 'comfortable')
})

test('keyboard shortcuts: F1, search, cheat sheets and run from the list', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('F1')
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByLabel('Search shortcuts')).toBeFocused()
  for (const cat of ['File', 'Edit', 'View', 'Repertory', 'Help']) await expect(dlg.getByRole('region', { name: cat, exact: true })).toBeVisible()
  await expect(dlg.getByRole('region', { name: 'Take mini-language' })).toContainText('+1>3')
  await expect(dlg.getByRole('region', { name: 'In the repertory' })).toContainText('Space')

  // a key query finds every chord containing that key
  await page.keyboard.type('F6')
  await expect(dlg.locator('.ws-sc-row', { hasText: 'Take with options' })).toBeVisible()
  await expect(dlg.locator('.ws-sc-row', { hasText: 'Focus next pane' })).toBeVisible()
  await expect(dlg.locator('.ws-sc-row', { hasText: 'Focus previous pane' })).toBeVisible()
  // arrow keys move through the results (roving focus), ArrowUp from the top returns to the search box
  // (rows that cannot run here, such as pane cycling behind a modal, are skipped)
  await dlg.getByLabel('Search shortcuts').fill('clipboard')
  const live = dlg.locator('.ws-sc-row:not(:disabled)')
  await page.keyboard.press('ArrowDown')
  await expect(live.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(live.nth(1)).toBeFocused()
  expect(await dlg.locator('.ws-sc-row[tabindex="0"]').count()).toBe(1)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(dlg.getByLabel('Search shortcuts')).toBeFocused()

  await dlg.getByLabel('Search shortcuts').fill('zzqqxx')
  await expect(dlg.getByText('No shortcuts match')).toBeVisible()
  // Esc in a non-empty search clears it first
  await page.keyboard.press('Escape')
  await expect(dlg.getByLabel('Search shortcuts')).toHaveValue('')
  await expect(dlg).toBeVisible()

  // unbound commands on request
  await dlg.getByLabel('Search shortcuts').fill('about')
  await expect(dlg.locator('.ws-sc-row')).toHaveCount(0)
  await dlg.getByLabel('Include commands without a shortcut').check()
  await expect(dlg.locator('.ws-sc-row', { hasText: 'About Radar Opus' })).toBeVisible()

  // click runs the command
  await dlg.getByLabel('Search shortcuts').fill('navigator pane')
  await expect(page.locator('.pane-left')).toBeVisible()
  await dlg.locator('.ws-sc-row', { hasText: 'Navigator pane' }).click()
  await expect(dlg).toBeHidden()
  await expect(page.locator('.pane-left')).toHaveCount(0)
  // Enter in the search box runs the first match
  await page.keyboard.press('F1')
  await dlg.getByLabel('Search shortcuts').fill('navigator pane')
  await page.keyboard.press('Enter')
  await expect(dlg).toBeHidden()
  await expect(page.locator('.pane-left')).toBeVisible()

  // F1 toggles
  await page.keyboard.press('F1')
  await expect(dlg).toBeVisible()
  await page.keyboard.press('F1')
  await expect(dlg).toBeHidden()
})

test('about dialog credits the data sources and licences', async ({ page }) => {
  await openApp(page)
  await menu(page, 'Help', 'About Radar Opus')
  const dlg = page.getByRole('dialog', { name: 'About Radar Opus' })
  await expect(dlg).toBeVisible()
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  await expect(dlg).toContainText(`Version ${pkg.version}`)
  await expect(dlg).toContainText('OOREP')
  await expect(dlg).toContainText('Repertorium Publicum by Vladimir Polony')
  await expect(dlg).toContainText('German translation of Kent')
  await expect(dlg).toContainText('Boericke')
  await expect(dlg.locator('.ws-lic', { hasText: 'GNU GPL v3' }).first()).toBeVisible()
  await expect(dlg.locator('.ws-lic', { hasText: 'Public domain' })).toBeVisible()
  await dlg.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
})

test('welcome tour: shows once on first run, keyboard driven', async ({ page }) => {
  // behave like a normal browser so the first-run tour starts by itself
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
  await openApp(page)
  const card = page.getByRole('dialog', { name: 'Find your way with the navigator' })
  await expect(card).toBeVisible({ timeout: 5000 })
  await expect(card).toContainText('Welcome to Radar Opus')
  await expect(page.locator('.ws-tour-spot')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Read rubrics like the printed book' })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: /Next/ }).click()
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(page.getByRole('dialog', { name: 'Collect symptoms in clipboards' })).toBeVisible()
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(page.getByRole('dialog', { name: 'Analyse the case' })).toBeVisible()
  // global shortcuts do not leak through the modal tour
  await page.keyboard.press('F1')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden()
  await page.getByRole('button', { name: 'Get started' }).click()
  await expect(page.locator('.ws-tour')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('radar-opus.welcome.v1'))).toBe('done')

  await page.reload()
  await page.waitForSelector('.shell')
  // the first-run tour starts 700 ms after the shell mounts; give it that long before checking it stayed away
  const mounted = await page.evaluate(() => performance.now())
  await page.waitForFunction(t => performance.now() - t > 1000, mounted)
  await expect(page.locator('.ws-tour')).toHaveCount(0)

  // can be replayed from Help and dismissed with Escape; panes it opened are restored
  await page.keyboard.press('Control+b')
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await menu(page, 'Help', 'Welcome tour')
  await expect(card).toBeVisible()
  await expect(page.locator('.pane-left')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ws-tour')).toHaveCount(0)
  await expect(page.locator('.pane-left')).toHaveCount(0)
})

test('pane focus cycling with Ctrl+F6', async ({ page }) => {
  await openApp(page)
  const inPane = (sel: string) => page.evaluate(s => !!document.querySelector(s)?.contains(document.activeElement), sel)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Control+F6')
  await expect.poll(() => inPane('.pane-left')).toBe(true)
  await expect(page.getByRole('tree').first()).toBeFocused()
  await page.keyboard.press('Control+F6')
  await expect.poll(() => inPane('.pane-center .tab-content')).toBe(true)
  await page.keyboard.press('Control+F6')
  await expect.poll(() => inPane('.pane-right')).toBe(true)
  await page.keyboard.press('Control+Shift+F6')
  await expect.poll(() => inPane('.pane-center .tab-content')).toBe(true)
  await page.keyboard.press('Control+Shift+F6')
  await expect.poll(() => inPane('.pane-left')).toBe(true)
})

test('narrow window: side panes become overlays', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 })
  await openApp(page)
  await expect(page.locator('html')).toHaveAttribute('data-narrow', 'true')
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await expect(page.locator('.pane-right')).toHaveCount(0)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('Control+b')
  const nav = page.locator('.pane-left')
  const clip = page.locator('.pane-right')
  await expect(nav).toBeVisible()
  expect(await nav.evaluate(el => getComputedStyle(el).position)).toBe('absolute')
  await expect(page.locator('.ws-scrim')).toBeVisible()
  // the overlay takes focus
  await expect.poll(() => nav.evaluate(el => el.contains(document.activeElement))).toBe(true)
  // opening the other overlay closes this one and moves focus there
  await page.keyboard.press('Control+Shift+B')
  await expect(clip).toBeVisible()
  await expect(nav).toHaveCount(0)
  await expect.poll(() => clip.evaluate(el => el.contains(document.activeElement))).toBe(true)
  // Escape closes it and returns focus to the document
  await page.keyboard.press('Escape')
  await expect(clip).toHaveCount(0)
  await expect(page.locator('.ws-scrim')).toHaveCount(0)
  await expect(page.locator('.rv-scroll')).toBeFocused()
  // clicking the scrim closes the overlay
  await page.keyboard.press('Control+b')
  await expect(nav).toBeVisible()
  await page.locator('.ws-scrim').click({ position: { x: 600, y: 300 } })
  await expect(nav).toHaveCount(0)
  // the pane toggles stay reachable in the toolbar; the rest folds into "More tools"
  await expect(page.getByRole('button', { name: 'Navigator pane' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Clipboard pane' })).toBeInViewport()
  await page.getByRole('button', { name: 'More tools' }).click()
  await expect(page.getByRole('menuitem', { name: /Patients/ })).toBeVisible()
  await page.keyboard.press('Escape')
  // widening restores the side-by-side layout
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('html')).not.toHaveAttribute('data-narrow', 'true')
  await expect(page.locator('.pane-left')).toBeVisible()
  await expect(page.locator('.pane-right')).toBeVisible()
})

test('data: storage estimate and reset demo data', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+Comma')
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await dlg.getByRole('radio', { name: 'Dark' }).click()
  await dlg.getByRole('tab', { name: 'Data' }).click()
  await expect(dlg.getByRole('button', { name: 'Export workspace backup…' })).toBeVisible()
  await expect(dlg.getByRole('button', { name: 'Restore workspace backup…' })).toBeVisible()
  await expect(dlg.locator('.ws-storage')).toContainText(/used|does not report/)

  const [download] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Export workspace backup…' }).click()])
  expect(download.suggestedFilename()).toMatch(/^radar-opus-backup-.*\.json$/)

  await dlg.getByRole('button', { name: 'Reset demo data…' }).click()
  const confirm = dlg.getByRole('alertdialog')
  await expect(confirm).toContainText('Erase all data')
  // focus starts on the safe choice; Escape cancels only the confirmation
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('button', { name: 'Reset demo data…' })).toBeFocused()
  await dlg.getByRole('button', { name: 'Reset demo data…' }).click()
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await dlg.getByRole('button', { name: 'Reset demo data…' }).click()
  await waitForSaved(page) // autosave has stored the dark theme, so the reset really erases it
  await Promise.all([page.waitForEvent('load'), dlg.getByRole('button', { name: 'Erase and reload' }).click()])
  await page.waitForSelector('.shell')
  await expect(html(page)).not.toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
})

test('settings: fixed height across tabs, restore defaults can be undone', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+Comma')
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  const done = dlg.getByRole('button', { name: 'Done' })
  const ys: number[] = []
  for (const t of ['General', 'Repertory', 'Analysis', 'Data']) {
    await dlg.getByRole('tab', { name: t }).click()
    ys.push((await done.boundingBox())!.y)
  }
  expect(new Set(ys.map(Math.round)).size).toBe(1)
  // the apply-to-consultation action sits at the top of the Analysis tab
  await dlg.getByRole('tab', { name: 'Analysis' }).click()
  await expect(dlg.locator('.ws-callout')).toBeInViewport()

  await dlg.getByRole('tab', { name: 'General' }).click()
  await dlg.getByRole('radio', { name: 'Dark' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await dlg.getByRole('button', { name: 'Restore defaults' }).click()
  await expect(html(page)).not.toHaveAttribute('data-theme', 'dark')
  await page.locator('.toast', { hasText: 'Settings restored to defaults' }).getByRole('button', { name: 'Undo' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
})

test('book re-flows when the document width changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openApp(page)
  await page.waitForSelector('.rv-row')
  const overlaps = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('.rv-row')].map(r => r.getBoundingClientRect()).sort((a, b) => a.top - b.top)
    let n = 0
    for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 1) n++
    return n
  })
  for (const w of [1152, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 720 })
    await expect.poll(overlaps).toBe(0)
  }
  await page.keyboard.press('Control+b')
  await expect.poll(overlaps).toBe(0)
  // print: rows flow in reading order, chrome is hidden; the screen layout is intact afterwards
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.rv-tools')).toBeHidden()
  await expect(page.locator('.rv-foot')).toBeHidden()
  await expect(page.locator('.toolbar')).toBeHidden()
  expect(await page.locator('.rv-row').first().evaluate(el => getComputedStyle(el).position)).toBe('static')
  await page.emulateMedia({ media: 'screen' })
  await expect.poll(overlaps).toBe(0)
})
