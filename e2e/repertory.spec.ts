import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp, settle, waitForSaved, withinBudget } from './helpers'

/** Open a repertory by its command (View › Open repertory): it activates a tab already showing it. */
async function openRepertoryCmd(page: Page, abbrev: string) {
  await page.evaluate(async a => {
    const r = await (window as unknown as { __radarModules: { registry: () => Promise<{ runCommand: (id: string) => boolean }> } }).__radarModules.registry()
    r.runCommand(`repertory.open.${a}`)
  }, abbrev)
}

const crumbs = (page: Page) => page.locator('.rv-crumbs')
// open documents stay mounted (hidden) when another tab is active: look inside the active one
const current = (page: Page) => page.locator('.tab-doc[data-active] .rv-row.rv-current')

const toc_ = (page: Page) => page.getByRole('tree', { name: 'Table of contents' })
/** The table of contents is hidden on a fresh start (RadarOpus): open it from the status strip. */
async function showToc(page: Page) {
  if (await toc_(page).count()) return
  await page.locator('.statusbar, footer').getByRole('button', { name: /^Show table of contents/ }).first().click()
  await expect(toc_(page)).toBeVisible()
}

/** The workspace's recent rubrics as Quick find offers them in an empty box; closes it and returns to the book. */
async function recentRubrics(page: Page): Promise<string[]> {
  await page.getByRole('combobox', { name: 'Quick find' }).click()
  const group = page.getByRole('listbox', { name: 'Quick find results' }).getByRole('group', { name: 'Recent rubrics' })
  // an empty box lists nothing until something was read: then there is no group to wait for
  await group.waitFor({ timeout: 1000 }).catch(() => {})
  const items = await group.getByRole('option').allTextContents()
  await page.keyboard.press('Escape')
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  return items
}

async function openBook(page: Page) {
  await openApp(page)
  // a repertory tab is open by default; if not, open one from the empty workspace
  if (!(await page.locator('.rv-scroll').count())) await page.getByRole('button', { name: 'Open repertory' }).first().click()
  await expect(page.locator('.rv-row').first()).toBeVisible()
  await page.locator('.rv-scroll').focus()
}

test('book view: keyboard navigation, chapter chooser and parent', async ({ page }) => {
  await openBook(page)
  await expect(crumbs(page)).toContainText('Mind')
  await page.keyboard.press('ArrowDown')
  await expect(crumbs(page)).toContainText('morning')
  await page.keyboard.press('ArrowRight')
  await expect(crumbs(page)).toContainText('and evening, during')
  await page.keyboard.press('Backspace')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('morning')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('and evening, during')
  await page.keyboard.type('he')
  await expect(page.getByRole('dialog', { name: 'Go to chapter' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Head')
  await page.keyboard.press('End')
  await expect(current(page)).toBeVisible()
  await page.keyboard.press('Home')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Head')
})

test('take mini-language creates an unsaved case and marks the rubric', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+2')
  await expect(page.getByRole('dialog', { name: 'Take rubric' })).toContainText('×2')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toasts [role=status] > div').filter({ hasText: 'Taken MIND - MORNING' })).toBeAttached()
  await expect(current(page).locator('.rv-clip')).toHaveText('1')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+1>2!')
  await expect(page.getByRole('dialog', { name: 'Take rubric' })).toContainText('eliminative')
  await page.keyboard.press('Enter')
  await expect(current(page).locator('.rv-clip')).toHaveText('2')
  // Insert takes with intensity 1
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Insert')
  await expect(current(page).locator('.rv-clip')).toHaveText('1')
})

test('F2 hierarchical find and F3 from current rubric', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(dlg).toBeVisible()
  await page.keyboard.type('mi')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fear')
  await page.keyboard.press('Enter')
  await page.keyboard.type('alo')
  await expect(dlg.locator('.rfind-row.active')).toContainText('alone')
  await page.keyboard.press('Shift+Enter')
  await expect(dlg).toBeHidden()
  await expect(crumbs(page)).toContainText('fear')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('alone')
  // F3 opens at the current rubric's level: its sub-rubrics are listed
  await page.keyboard.press('F3')
  const here = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(here.locator('.rfind-crumb.on')).toHaveText('alone')
  await expect(here.locator('.rfind-row').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(here).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('alone')
})

test('Find: + after a filter takes the highlighted rubric; Esc cancels; no match offers search', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F3') // on the Mind chapter heading: Mind's rubrics
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText('Mind')
  await page.keyboard.type('noon+2')
  await expect(dlg.locator('.rfind-take')).toContainText('Enter takes noon (×2)')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toasts [role=status] > div').filter({ hasText: 'Taken MIND - NOON' })).toBeAttached()
  await expect(dlg).toBeVisible()
  await expect(dlg.locator('.rfind-input')).toHaveValue('noon')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('aftern')
  await expect(dlg.locator('.rfind-row.active')).toContainText('afternoon')
  // Esc is Cancel: the book is left where it was and keeps focus
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Mind')
  await expect(page.locator('.rv-scroll')).toBeFocused()
  // Shift+Return shows the highlighted rubric in the book
  await page.keyboard.press('F3')
  await expect(dlg).toBeVisible()
  await page.keyboard.type('aftern')
  await expect(dlg.locator('.rfind-row.active')).toContainText('afternoon')
  await page.keyboard.press('Shift+Enter')
  await expect(dlg).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('afternoon')
  await expect(page.locator('.rv-scroll')).toBeFocused()
  // no match: an empty list (RadarOpus shows nothing extra); Return searches all rubrics
  await page.keyboard.press('F2')
  await page.keyboard.type('zzqqx')
  const find = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(find.locator('[role=status]')).toHaveText('No match at this level')
  await expect(find.locator('.rfind-none')).toBeVisible()
  await expect(find.getByRole('option')).toHaveCount(0)
  // the window floats over the app: no scrim, a click outside does not close it
  await expect(page.locator('.dialog-backdrop')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.mouse.click(5, 450)
  await expect(find).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(find).toBeHidden()
})

test('book keys: Space only on the list, Alt+PageDown switches tabs, concise accessible names', async ({ page }) => {
  await openBook(page)
  const views = page.getByRole('combobox', { name: 'Views' })
  await expect(views).toHaveValue('full')
  // Space on a toolbar toggle presses that toggle only (the book's Space command stays on the list)
  const names = page.getByRole('button', { name: 'Full remedy names' })
  await names.focus()
  await page.keyboard.press('Space')
  await expect(views).toHaveValue('names')
  await expect(names).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await expect(current(page)).toHaveAttribute('aria-label', /^Mind, morning, \d+ remedies/)
  await page.keyboard.press('Space')
  await expect(views).toHaveValue('rubrics')
  // options: position in the whole book, not the rendered window
  await expect(current(page)).toHaveAttribute('aria-posinset', '2')
  const size = Number(await current(page).getAttribute('aria-setsize'))
  expect(size).toBeGreaterThan(1000)
  await page.keyboard.press('Control+End')
  await expect(current(page)).toHaveAttribute('aria-posinset', String(size))
  await page.keyboard.press('Home')
  // a second document to switch to (the seeded workspace opens the book alone); back on the book with
  // the list focused, Alt+PageDown still switches tabs
  await openRepertoryCmd(page, 'kent-de')
  await expect(page.locator('[role=tab][aria-selected=true]').first()).toContainText(/Kent/)
  await page.getByRole('tab', { name: /Repertorium Publicum/ }).first().click()
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  const active = page.locator('[role=tab][aria-selected=true]').first()
  const title = await active.textContent()
  await page.keyboard.press('Alt+PageDown')
  await expect(page.locator('[role=tab][aria-selected=true]').first()).not.toHaveText(title!)
})

test('opening a repertory shows a loading tab, then an error with Retry; other books open beside it', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  let fail = true
  await page.route(/rep-kent-de\.json/, async route => { await gate; if (fail) await route.abort(); else await route.continue() })
  await openBook(page)
  await openRepertoryCmd(page, 'kent-de')
  await expect(page.locator('.rv-loading')).toBeVisible()
  await expect(page.locator('[role=tab][aria-selected=true]').first()).toContainText('Kent')
  release()
  const alert = page.locator('.rv-error')
  await expect(alert).toBeVisible()
  await expect(page.locator('.toast').filter({ hasText: /Could not open Kent/ })).toBeVisible()
  fail = false
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('.tab-doc[data-active] .rv-row').first()).toBeVisible({ timeout: 20_000 })
  // the Publicum tab is still open next to the Kent tab
  await expect(page.locator('[role=tab]').filter({ hasText: 'Mind' })).toHaveCount(1)
  // take into a new clipboard, then Undo removes exactly that take
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+1>5')
  await page.keyboard.press('Enter')
  await expect(current(page).locator('.rv-clip')).toHaveText('5')
  await expect(page.locator('.toasts [role=status]')).toContainText('Clipboard 5')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(current(page).locator('.rv-clip')).toHaveCount(0)
})

test('space cycles the display and the grade filter hides remedies', async ({ page }) => {
  await openBook(page)
  const views = page.getByRole('combobox', { name: 'Views' })
  await expect(views).toHaveValue('full')
  await page.keyboard.press('Space')
  await expect(views).toHaveValue('names')
  await page.keyboard.press('Space')
  await expect(views).toHaveValue('rubrics')
  await expect(page.locator('.rv-rem')).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(views).toHaveValue('full')
  await page.getByRole('button', { name: 'Minimum grade shown' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Grades 3 and 4' }).click()
  await expect(page.locator('.rv-rem.g1')).toHaveCount(0)
  await expect(page.locator('.rv-hidden').first()).toBeVisible()
})

test('bookmark, note and bookmarks manager', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ControlOrMeta+d')
  await expect(current(page).locator('.rv-mark-bm')).toBeVisible()
  // the sub-toolbar's bookmark toggle shows the current rubric is bookmarked
  await expect(page.locator('.tab-doc[data-active] .rv-tools').getByRole('button', { name: 'Bookmark rubric' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ControlOrMeta+Shift+M')
  await page.getByRole('textbox', { name: 'Note' }).fill('Check modalities')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(current(page).locator('.rv-note')).toHaveText('Check modalities')
  await page.keyboard.press('ControlOrMeta+Shift+D')
  const mgr = page.getByRole('dialog', { name: 'Bookmarks' })
  await expect(mgr).toBeVisible()
  await expect(mgr.locator('.rbm-label')).toHaveText('Mind - morning')
  await mgr.getByRole('button', { name: 'Rename bookmark' }).click()
  await mgr.getByLabel('Bookmark label').fill('Morning aggravation')
  await mgr.getByLabel('Bookmark label').press('Enter')
  await expect(mgr.locator('.rbm-label')).toHaveText('Morning aggravation')
  await mgr.getByRole('button', { name: 'Close' }).last().click()
  await expect(mgr).toBeHidden()
  // the renamed bookmark is kept: the manager shows it again
  await page.keyboard.press('ControlOrMeta+Shift+D')
  await expect(mgr.locator('.rbm-label')).toHaveText('Morning aggravation')
})

test('table of contents: chapter tiles open chapters; keyboard walks rows and tiles; the filter narrows documents', async ({ page }) => {
  await openBook(page)
  await showToc(page)
  const toc = toc_(page)
  const rep = toc.getByRole('treeitem', { name: /Repertorium Publicum/ })
  await expect(rep).toHaveAttribute('aria-expanded', 'false')
  await rep.locator('.toc-twist').click()
  await expect(rep).toHaveAttribute('aria-expanded', 'true')
  await toc.getByRole('treeitem', { name: 'Head', exact: true }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Head')
  // the chapter header is at the top of the book
  await expect(current(page)).toContainText(/head/i)
  await expect.poll(async () => (await inView(page)).top).toBeLessThan(60)
  const headTop = (await inView(page)).top
  // the tile of the chapter already shown brings its header back after the book was wheeled away
  await page.locator('.tab-doc[data-active] .rv-scroll').hover()
  await page.mouse.wheel(0, 900)
  // wheeled past it, the header row may be unmounted by the virtualiser: that is out of view too
  await expect.poll(() => page.evaluate(() => {
    // one read: the row can unmount between a count and a measure
    const c = document.querySelector('.tab-doc[data-active] .rv-row.rv-current'), s = document.querySelector('.tab-doc[data-active] .rv-scroll')
    return c && s ? Math.round(c.getBoundingClientRect().top - s.getBoundingClientRect().top) : -Infinity
  })).toBeLessThan(-300)
  await toc.getByRole('treeitem', { name: 'Head', exact: true }).click()
  await expect.poll(async () => (await inView(page)).top).toBe(headTop)
  // Back to a chapter that comes later in the book brings its header back to the top (rows above it
  // were measured meanwhile), and so does Forward
  await toc.getByRole('treeitem', { name: 'Vertigo', exact: true }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Vertigo')
  await page.getByRole('button', { name: /^Back/ }).first().click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Head')
  await expect.poll(async () => (await inView(page)).top).toBe(headTop)
  await page.getByRole('button', { name: /^Forward/ }).first().click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Vertigo')
  await page.getByRole('button', { name: /^Back/ }).first().click()
  await expect.poll(async () => (await inView(page)).top).toBe(headTop)
  await toc.getByRole('treeitem', { name: 'Head', exact: true }).click()
  // the tile hands focus to the book; take it back only once it landed there
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.tab-doc[data-active]'))).toBe(true)
  // Right moves to the next tile, Return opens it, Up returns to the repertory row, Left collapses it
  await toc.focus()
  await page.keyboard.press('ArrowRight')
  await expect(toc.getByRole('treeitem', { name: 'Eye', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Eye')
  await toc.focus()
  await page.keyboard.press('ArrowUp')
  await expect(rep).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(rep).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(rep).toHaveAttribute('aria-expanded', 'true')
  const search = page.getByLabel('Search for a repertory:')
  await search.fill('kent')
  await expect(toc.getByRole('treeitem', { name: /Kents Repertorium/ })).toBeVisible()
  await expect(toc.getByRole('treeitem', { name: /Repertorium Publicum/ })).toHaveCount(0)
  await expect(toc.getByRole('treeitem', { name: /Families of remedies/ })).toHaveCount(0)
  await search.press('Enter')
  await expect(toc).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(current(page)).toContainText(/gemüt/i)
  await expect(page.locator('.toc-foot')).toHaveText('3 document(s) loaded (3 volumes)')
})

test('table of contents: a tile of the chapter already shown is a Back step only when it moves the page; refresh clears the filter and collapses the tree', async ({ page }) => {
  await openBook(page)
  await showToc(page)
  const toc = toc_(page)
  const back = page.getByRole('button', { name: /^Back/ }).first()
  const forward = page.getByRole('button', { name: /^Forward/ }).first()
  const rep = toc.getByRole('treeitem', { name: /Repertorium Publicum/ })
  const book = page.locator('.tab-doc[data-active] .rv-scroll')
  await rep.locator('.toc-twist').click()
  // the book opens on Mind with its heading at the top: the Mind tile moves nothing, so it adds no
  // Back step (a Back that changes nothing visible would be a dead step)
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Mind')
  await expect(back).toBeDisabled()
  const mind = toc.getByRole('treeitem', { name: 'Mind', exact: true })
  await mind.click()
  await expect(book).toHaveJSProperty('scrollTop', 0)
  await page.waitForTimeout(300)
  await expect(back).toBeDisabled()
  await expect(forward).toBeDisabled()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Mind')
  // wheeled away from the heading, the tile brings it back to the top: Back returns to the wheeled page
  await book.evaluate(el => { el.scrollTop = 2500 })
  // the page is told by the rubric row at the top of column 1 (rows measured later shift scrollTop itself)
  const topRow = () => book.evaluate(el => {
    const view = el.getBoundingClientRect().top
    const rows = [...el.querySelectorAll<HTMLElement>('.rv-col1 .rv-row[data-rubric]')].map(r => ({ id: r.dataset.rubric, b: r.getBoundingClientRect() }))
    const r = rows.filter(x => x.b.bottom > view + 0.5).sort((a, b) => a.b.top - b.b.top)[0]
    return r ? `${r.id}@${Math.round(r.b.top - view)}` : ''
  })
  await expect.poll(() => book.evaluate(el => el.scrollTop)).toBeGreaterThan(2000)
  // the columns follow the scroll in the next frames: the page is read once its top row holds still
  let wheeled = ''
  await expect.poll(async () => { const was = wheeled; wheeled = await topRow(); return was === wheeled && wheeled !== '' && !wheeled.startsWith('0@') }, { intervals: [250] }).toBe(true)
  await mind.click()
  await expect(back).toBeEnabled()
  await expect(book).toHaveJSProperty('scrollTop', 0)
  await back.click()
  await expect.poll(topRow).toBe(wheeled)
  await expect(back).toBeDisabled()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Mind')
  // Forward redoes the tile: the heading at the top again
  await forward.click()
  await expect.poll(() => book.evaluate(el => el.scrollTop)).toBe(0)
  await expect(back).toBeEnabled()
  // refresh: the filter is cleared and the repertory collapsed again; the tree takes the focus
  const search = page.getByLabel('Search for a repertory:')
  await search.fill('kent')
  await expect(toc.getByRole('treeitem', { name: /Repertorium Publicum/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh the table of contents' }).click()
  await expect(search).toHaveValue('')
  await expect(rep).toHaveAttribute('aria-expanded', 'false')
  await expect(toc.locator('.toc-tile')).toHaveCount(0)
  await expect(rep).toHaveAttribute('aria-selected', 'true')
  await expect(toc).toBeFocused()
})

test('table of contents in a narrow window: opening a chapter closes the overlay and focuses the book', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 720 })
  await openBook(page)
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('ControlOrMeta+b')
  const toc = toc_(page)
  await expect(toc).toBeVisible()
  await expect(page.locator('.ws-scrim')).toBeVisible()
  await toc.getByRole('treeitem', { name: /Repertorium Publicum/ }).locator('.toc-twist').click()
  await toc.getByRole('treeitem', { name: 'Mind', exact: true }).waitFor()
  await toc.focus()
  // the second tile: a chapter other than the Mind the book already shows, so a real (Back) step
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await expect(page.locator('.ws-scrim')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.tab-doc[data-active]'))).toBe(true)
  await expect(page.getByRole('button', { name: /^Back/ }).first()).toBeEnabled()
})

test('table of contents: cursor starts on the default repertory; type-ahead, paging, checkboxes; hiding hands focus to the book', async ({ page }) => {
  // the RadarOpus reference window width: the panel opens 400 px wide
  await page.setViewportSize({ width: 1470, height: 890 })
  await openBook(page)
  await showToc(page)
  const toc = toc_(page)
  const rep = toc.getByRole('treeitem', { name: /Repertorium Publicum/ })
  const kent = toc.getByRole('treeitem', { name: /Kents Repertorium/ })
  await expect(rep).toHaveAttribute('aria-selected', 'true')
  // a 54 px column pitch, all seven columns inside the panel
  await rep.locator('.toc-twist').click()
  const tiles = toc.locator('.toc-tile')
  await expect(tiles.first()).toBeVisible()
  const [t0, t1, t6, panel] = await Promise.all([tiles.nth(0).boundingBox(), tiles.nth(1).boundingBox(), tiles.nth(6).boundingBox(), page.locator('.toc').boundingBox()])
  expect(Math.round(t1!.x - t0!.x)).toBe(54)
  expect(t6!.x + t6!.width).toBeLessThanOrEqual(panel!.x + panel!.width - 4)
  // a narrow panel keeps 32 px tiles and scrolls the tree sideways; the field takes the label's place
  const spl = (await page.locator('.pane-left > .splitter').first().boundingBox())!
  await page.mouse.move(spl.x + spl.width / 2, spl.y + 200)
  await page.mouse.down()
  await page.mouse.move(panel!.x + 200 + spl.width / 2, spl.y + 200, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => Math.round((await page.locator('.toc').boundingBox())!.width)).toBeLessThan(215)
  const [n6, narrow, field, btns] = await Promise.all([tiles.nth(6).boundingBox(), page.locator('.toc').boundingBox(), page.locator('#toc-search').boundingBox(), page.locator('.toc-hbtns').boundingBox()])
  expect(Math.round(n6!.width)).toBe(32)
  expect(Math.round((await tiles.nth(1).boundingBox())!.x - (await tiles.nth(0).boundingBox())!.x)).toBe(54)
  expect(n6!.x + n6!.width).toBeGreaterThan(narrow!.x + narrow!.width)
  const treeEl = page.locator('.toc-tree')
  expect(await treeEl.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(field!.width).toBeGreaterThan(80)
  expect(btns!.x + btns!.width).toBeLessThanOrEqual(narrow!.x + narrow!.width)
  await page.mouse.move(narrow!.x + 200 + spl.width / 2, spl.y + 200)
  await page.mouse.down()
  await page.mouse.move(spl.x + spl.width / 2, spl.y + 200, { steps: 6 })
  await page.mouse.up()
  // letters jump to the next row starting with them; PageUp/PageDown move by a page
  await toc.focus()
  await page.keyboard.press('k')
  await expect(kent).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('PageUp')
  await expect(toc.getByRole('treeitem', { name: 'Repertories', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('PageDown')
  await expect(toc.getByRole('treeitem', { name: /editorial remedy classification/ })).toHaveAttribute('aria-selected', 'true')
  // the checkbox column: click or Shift+Space; the context menu opens the checked documents
  await kent.locator('.toc-check').click()
  await expect(kent).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Shift+Space')
  await expect(kent).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Shift+Space')
  await kent.click({ button: 'right' })
  await page.getByRole('menu', { name: 'Context menu' }).getByRole('menuitem', { name: 'Open checked documents (1)' }).click()
  await expect(current(page)).toContainText(/gemüt/i)
  // Cmd+F2 with the focus in the tree: the book takes the keyboard focus
  await toc.focus()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(toc).toHaveCount(0)
  await expect(page.locator('.tab-doc[data-active] .rv-scroll')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(toc_(page)).toBeVisible()
})

test('context menu, take with options and remedy interactions', async ({ page }) => {
  await openBook(page)
  await page.locator('.rv-row[data-rubric="1"] .rv-text').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Take with options/ }).click()
  const dlg = page.getByRole('dialog', { name: 'Take with options' })
  await expect(dlg).toContainText('Mind - morning')
  await dlg.getByText('×3').click()
  await dlg.getByText('Excluding').click()
  await dlg.getByRole('button', { name: 'Take' }).click()
  await expect(page.locator('.toasts [role=status]')).toContainText('excluding')
  const rem = page.locator('.rv-row[data-rubric="1"] .rv-rem').first()
  // a single click on a remedy only selects its rubric (as RadarOpus): no highlight bar, the book stays put
  const top = (await page.locator('.tab-doc[data-active] .rv-scroll').boundingBox())!.y
  await rem.click()
  await expect(current(page)).toHaveAttribute('data-rubric', '1')
  await expect(page.locator('.rv-hlbar')).toHaveCount(0)
  expect((await page.locator('.tab-doc[data-active] .rv-scroll').boundingBox())!.y).toBe(top)
  await rem.dblclick()
  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { selected: true })).not.toContainText('Mind')
})

test('drag a rubric onto a clipboard strip slot', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('Insert') // creates the unsaved case and its first clipboard
  const chip = page.locator('.clip-slot').first()
  await expect(chip).toBeVisible()
  // bring forenoon onto the page (the chapter's own remedies fill the first column)
  await page.locator('.rv-scroll').focus()
  for (const _ of [1, 2, 3]) await page.keyboard.press('ArrowDown')
  await page.locator('.rv-row[data-rubric="3"]').dragTo(chip)
  // a drop is the standard take into that chip's clipboard (announced; RadarOpus shows no card)
  await expect(page.locator('.toasts [role=status]')).toContainText(/forenoon/i)
  await expect(page.locator('.rv-row[data-rubric="3"] .rv-clip')).toHaveText('1')
})

test('Ctrl+1 opens the repertories table of contents', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ControlOrMeta+1')
  await expect(page.getByRole('listbox', { name: 'Repertories' })).toBeVisible()
  await page.locator('.rtoc-chapter', { hasText: 'Vertigo' }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Vertigo')
})

// the current rubric is on the page: its start below the top, and its end (in column 2 when it runs
// over from column 1) above the bottom
const inView = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('.tab-doc[data-active] .rv-row.rv-current')!.getBoundingClientRect()
  const end = (document.querySelector('.tab-doc[data-active] .rv-cont.rv-current') ?? document.querySelector('.tab-doc[data-active] .rv-row.rv-current'))!.getBoundingClientRect()
  const s = document.querySelector('.tab-doc[data-active] .rv-scroll')!.getBoundingClientRect()
  return { top: Math.round(c.top - s.top), fully: c.top >= s.top - 1 && end.bottom <= s.bottom + 1 }
})

test('display changes keep the current rubric where it was', async ({ page }) => {
  await openBook(page)
  await page.getByRole('combobox', { name: 'Views' }).selectOption('rubrics')
  await page.locator('.rv-scroll').focus()
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown')
  const before = await inView(page)
  expect(before.fully).toBe(true)
  await page.getByRole('combobox', { name: 'Views' }).selectOption('full')
  // the row stays where it was (to the pixel: the new heights are fractional, scroll positions whole)
  await expect.poll(async () => { const now = await inView(page); return now.fully && Math.abs(now.top - before.top) <= 1 }).toBe(true)
  await page.locator('.rv-scroll').focus()
  for (const _ of [1, 2, 3]) {
    await page.keyboard.press('Space')
    await expect.poll(async () => (await inView(page)).fully).toBe(true)
  }
  await page.getByRole('button', { name: 'Minimum grade shown' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Grades 3 and 4' }).click()
  await expect.poll(async () => (await inView(page)).fully).toBe(true)
})

test('take bar keeps the command and target readable; /s never duplicates', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+2>3a')
  const bar = page.getByRole('dialog', { name: 'Take rubric' })
  const w = async (sel: string) => (await bar.locator(sel).boundingBox())!.width
  expect(await w('.rv-takebar-input')).toBeGreaterThanOrEqual(100)
  expect(await w('.rv-takebar-rubric')).toBeGreaterThanOrEqual(100)
  await expect(bar.locator('.rv-takebar-leaf')).toHaveText('morning')
  expect((await inView(page)).fully).toBe(true)
  await page.keyboard.press('Escape')
  // a leaf: /s acts like a plain take, twice gives one symptom
  await page.keyboard.press('ArrowRight')
  for (const _ of [1, 2]) { await page.keyboard.type('+/s'); await page.keyboard.press('Enter') }
  await expect(page.locator('.toast').last()).toContainText('Already in')
  await expect(page.locator('.toast')).toHaveCount(1)
})

test('narrow pane: whole breadcrumb, readable repertories list', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await openBook(page)
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  const clipped = await page.locator('.rv-crumbs .rv-crumb').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).length)
  expect(clipped).toBe(0)
  await expect(page.locator('.rv-crumb-last')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+1')
  const open = page.locator('.rtoc-head .btn')
  await expect(open).toBeVisible()
  const [btn, detail] = await Promise.all([open.boundingBox(), page.locator('.rtoc-detail').boundingBox()])
  expect(btn!.x + btn!.width).toBeLessThanOrEqual(detail!.x + detail!.width)
})

test('recent list fills from reading and acting; the table of contents marks the menu tile', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  // dwelling on a rubric records it (after about a second)
  await expect.poll(() => recentRubrics(page)).toHaveLength(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ControlOrMeta+d')
  await expect.poll(() => recentRubrics(page)).toHaveLength(2)
  expect((await recentRubrics(page))[1]).toContain('morning')
  await showToc(page)
  const toc = toc_(page)
  await toc.getByRole('treeitem', { name: /Repertorium Publicum/ }).locator('.toc-twist').click()
  const tile = toc.getByRole('treeitem', { name: 'Vertigo', exact: true })
  await tile.click({ button: 'right' })
  await expect(tile).toHaveClass(/menu-target/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.toc .menu-target')).toHaveCount(0)
})

test('taking again never downgrades; F6 shows what is already on the clipboard', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+3a')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toasts [role=status]')).toContainText('Taken MIND - MORNING')
  // a bare + and Insert leave it as it is
  await page.keyboard.type('+')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').last()).toContainText('Already in Clipboard 1')
  await page.keyboard.press('Insert')
  await expect(page.locator('.toast').last()).toContainText('Already in Clipboard 1')
  // F6 prefills intensity and group from the symptom
  await page.keyboard.press('F6')
  const dlg = page.getByRole('dialog', { name: 'Take with options' })
  await expect(dlg.locator('.rtake-already')).toContainText('Already in Clipboard 1')
  await expect(dlg.locator('input[name="rtake-w"][value="3"]')).toBeChecked()
  await expect(dlg.getByRole('combobox').first()).toHaveValue('a')
  await expect(dlg.getByRole('button', { name: 'Update' })).toBeVisible()
  await page.keyboard.press('Escape')
  // an explicit +1 does change it
  await page.locator('.rv-scroll').focus()
  await page.keyboard.type('+1')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toasts [role=status]')).toContainText('Updated MIND - MORNING')
})

test('Find: Esc after opening levels cancels; Go to lands on the highlighted rubric', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(dlg).toBeVisible()
  await page.keyboard.type('mi')
  // Enter acts on the highlighted row: wait for the typed query's results before pressing it
  await expect(dlg.locator('.rfind-tile.active')).toContainText(/^\W*mind/i)
  await page.keyboard.press('Enter') // opens Mind: its first rubric is highlighted by Find, not by the reader
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText(/Mind/)
  await page.keyboard.type('weep')
  await expect(dlg.locator('.rfind-row.active')).toContainText(/weeping/i)
  await page.keyboard.press('Enter') // opens "weeping"
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText(/weeping/)
  await page.keyboard.press('Escape') // Esc is Cancel: the book is unchanged
  await expect(dlg).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Mind')
  await expect(page.locator('.rv-scroll')).toBeFocused()
  // Go to: once the reader moves inside the level, the highlighted rubric wins
  await page.keyboard.press('F3')
  const here = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(here).toBeVisible()
  await expect(here.locator('.rfind-row').nth(1)).toBeVisible()
  await expect(here.locator('.rfind-row.active')).toHaveCount(0)
  const secondRow = (await here.locator('.rfind-row').nth(1).locator('.rfind-text').textContent())!
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(here.locator('.rfind-row.active .rfind-text')).toHaveText(secondRow)
  const second = secondRow
  await here.getByRole('button', { name: 'Go to' }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText(second)
})

test('Find: chapters keep book order, the list is no tab stop, rows have a context menu', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(dlg.locator('.rfind-tile.active')).toBeVisible()
  const all = await dlg.locator('.rfind-tile').evaluateAll(ts => ts.map(t => t.getAttribute('aria-label')))
  await page.keyboard.type('f')
  await expect(dlg.locator('.rfind-tile').first()).toBeVisible()
  const typed = await dlg.locator('.rfind-tile').evaluateAll(ts => ts.map(t => t.getAttribute('aria-label')))
  expect(typed).toEqual(all.filter(n => typed.includes(n)))
  await page.keyboard.press('Backspace')
  await page.keyboard.type('mi')
  await expect(dlg.locator('.rfind-tile.active')).toContainText(/^\W*mind/i)
  await page.keyboard.press('Enter')
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText(/Mind/)
  // Tab leaves the type-ahead for the footer, not for the list
  await page.keyboard.press('Tab')
  await expect(dlg.locator('.rfind-list')).not.toBeFocused()
  await dlg.locator('.rfind-input').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu', { name: 'Context menu' })
  await expect(menu.getByRole('menuitem', { name: /Take with intensity 2/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(dlg).toBeVisible()
  await dlg.locator('.rfind-row.active').click({ button: 'right' })
  await menu.getByRole('menuitem', { name: /^Go to/ }).click()
  await expect(dlg).toBeHidden()
})

test('remedy highlight from the keyboard: Remedies menu, next rubric, Esc clears', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Alt+r')
  const menu = page.getByRole('menu').first()
  await expect(menu).toContainText('Remedies of morning')
  await expect(menu.getByRole('menuitem').first()).toContainText(/\(grade [1-4]\)/)
  await page.keyboard.press('ArrowRight') // submenu of the first remedy
  await page.getByRole('menuitem', { name: 'Highlight in book' }).click()
  const bar = page.getByRole('region', { name: 'Remedy highlight' })
  await expect(bar).toBeVisible()
  await expect(page.locator('.rv-scroll')).toBeFocused()
  const before = await crumbs(page).locator('.rv-crumb-last').textContent()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(crumbs(page).locator('.rv-crumb-last')).not.toHaveText(before!)
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
  // the context menu has the same Remedies submenu
  await current(page).locator('.rv-text').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Remedies \(\d+\)/ }).hover()
  await expect(page.getByRole('menuitem', { name: /\(grade [1-4]\)/ }).first()).toBeVisible()
})

test('rubrics-only view keeps every count; tree items carry level and position', async ({ page }) => {
  await openBook(page)
  await page.getByRole('combobox', { name: 'Views' }).selectOption('rubrics')
  await expect(page.locator('.rv-rem')).toHaveCount(0)
  await expect(page.locator('.rv-row[data-rubric="1"] .rv-count')).toHaveText(/^\(\d+\)$/)
  await showToc(page)
  const toc = toc_(page)
  const rep = toc.getByRole('treeitem', { name: /Repertorium Publicum/ })
  await expect(rep).toHaveAttribute('aria-level', '2')
  await expect(rep).toHaveAttribute('aria-posinset', '1')
  await expect(rep).toHaveAttribute('aria-setsize', '2')
  await rep.locator('.toc-twist').click()
  const head = toc.getByRole('treeitem', { name: 'Head', exact: true })
  await expect(head).toHaveAttribute('aria-level', '3')
  await expect(head).toHaveAttribute('aria-posinset', '3')
  expect(Number(await head.getAttribute('aria-setsize'))).toBeGreaterThan(20)
})

test('table of contents and repertory dialogs pass axe (list roles, contrast) in both themes', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await openBook(page)
    await page.keyboard.press('ArrowDown')
    // the table of contents with a repertory's chapter tiles shown
    await showToc(page)
    const rep = page.locator('.toc-doc').first()
    if (await rep.getAttribute('aria-expanded') !== 'true') await rep.locator('.toc-twist').click()
    await expect(page.locator('.toc-tile').first()).toBeVisible()
    const nav = await new AxeBuilder({ page }).include('.toc').include('.tab-doc[data-active] .rv-row.rv-current')
      .withRules(['aria-required-children', 'aria-required-parent', 'color-contrast']).analyze()
    expect(nav.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
    await page.keyboard.press('F2')
    const find = page.getByRole('dialog', { name: /^Navigation window/ })
    await expect(find.locator('.rfind-tile.active')).toBeVisible()
    const fr = await new AxeBuilder({ page }).include('.rfind-list').withRules(['color-contrast']).analyze()
    expect(fr.violations.map(v => v.id)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(find).toBeHidden()
    await page.locator('.rv-scroll').focus()
    await page.keyboard.press('ControlOrMeta+Shift+M')
    await expect(page.locator('.rnote-keys')).toBeVisible()
    const note = await new AxeBuilder({ page }).include('.rnote-keys').withRules(['color-contrast']).analyze()
    expect(note.violations.map(v => v.id)).toEqual([])
    await page.keyboard.press('Escape')
  }
})

test('ArrowDown in the book stays under a frame budget (median < 20 ms, p95 < 50 ms)', async ({ page }) => {
  await openBook(page)
  await expect(page.locator('.tab-doc[data-active] .rv-row').first()).toBeVisible()
  await settle(page)
  // production target is one 16 ms frame; the dev build and a parallel run add overhead, so a run is
  // retried when load makes it slow, while a regression (every run slow) still fails
  await withinBudget(() => page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('.tab-doc[data-active] .rv-scroll')!
    const out: number[] = []
    for (let n = 0; n < 60; n++) {
      // the key's work: its synchronous render, plus the style and layout it leaves to the next frame
      const t = performance.now()
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }))
      const handled = performance.now() - t
      await new Promise<void>(r => requestAnimationFrame(() => { const a = performance.now(); void el.offsetHeight; out.push(handled + performance.now() - a); r() }))
      await new Promise(r => setTimeout(r, 30))
    }
    return out
  }), times => {
    const sorted = times.slice(10).sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const median = sorted[sorted.length >> 1]
    console.log(`ArrowDown median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`)
    expect(median).toBeLessThan(20)
    expect(p95).toBeLessThan(50)
  })
})

test('repertories list: context menu on right-click, Shift+F10 and the ContextMenu key', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('ControlOrMeta+1')
  const list = page.locator('.rtoc-list')
  await list.focus()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu', { name: 'Context menu' })
  await expect(menu).toBeVisible()
  // focus moves into the menu (active-descendant on the first item)
  await expect(menu).toBeFocused()
  await expect(menu.getByRole('menuitem', { name: /^Open$/ })).toHaveClass(/active/)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(list).toBeFocused()
  await page.keyboard.press('ContextMenu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.rtoc-item').first().click({ button: 'right' })
  await menu.getByRole('menuitem', { name: /^Open$/ }).click()
  await expect(page.locator('.tab-doc[data-active] .rv-row').first()).toBeVisible()
})

test('table of contents: context menus by mouse and keyboard; the star follows the default repertory', async ({ page }) => {
  await openBook(page)
  await showToc(page)
  const toc = toc_(page)
  const kent = toc.getByRole('treeitem', { name: /Kents Repertorium/ })
  await expect(toc.locator('.toc-default')).toHaveCount(1)
  await expect(toc.getByRole('treeitem', { name: /Repertorium Publicum/ }).locator('.toc-default')).toHaveCount(1)
  await kent.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Context menu' })
  await menu.getByRole('menuitem', { name: 'Set as default repertory' }).click()
  await expect(kent.locator('.toc-default')).toHaveCount(1)
  await expect(toc.locator('.toc-default')).toHaveCount(1)
  await toc.focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /^Open$/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(toc).toBeFocused()
  await page.keyboard.press('ContextMenu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
})

test('recent rubrics survive a reload and closing the tab', async ({ page }) => {
  await openBook(page)
  // a book opens at its chapter (MIND), which joins the list too once it has been shown for a second:
  // whether that happens depends on timing, so these checks look at the rubrics below the chapter
  const read = async () => (await recentRubrics(page)).filter(t => t.includes(','))
  await page.keyboard.press('ArrowDown')
  await expect.poll(read).toHaveLength(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ControlOrMeta+d')
  await expect.poll(read).toHaveLength(2)
  const list = await read()
  expect(list[0]).toContain('and evening')
  expect(list[1]).toContain('morning')
  await waitForSaved(page)
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  await expect.poll(read).toEqual(list)
  // the list belongs to the workspace, not the tab: a new tab of the same book shows it too
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  await page.keyboard.press('Alt+w')
  await openRepertoryCmd(page, 'publicum')
  await expect(page.locator('.tab-doc[data-active] .rv-row').first()).toBeVisible()
  await expect.poll(read).toEqual(list)
})

test('F2 Find narrows only the level, by word starts, in alphabetical order; F3 when nothing matches', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  const input = dlg.getByRole('combobox', { name: 'Type ahead' })
  // the chapter level shows only tiles, never rubric rows below them
  await input.fill('h')
  await expect(dlg.locator('.rfind-tile').first()).toBeVisible()
  await expect(dlg.locator('.rfind-row')).toHaveCount(0)
  await input.fill('he')
  await expect(dlg.locator('.rfind-tile.active')).toHaveAttribute('aria-label', 'Head')
  await input.press('Enter')
  // a level just opened: alphabetical, nothing selected; Home / End select the first / last row
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText('Head')
  await expect(dlg.locator('.rfind-row.active')).toHaveCount(0)
  const texts = (await dlg.locator('.rfind-row .rfind-text').allTextContents())
  expect(texts.length).toBeGreaterThan(3)
  expect([...texts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))).toEqual(texts)
  await input.press('End')
  await expect(dlg.locator('.rfind-row.active')).toHaveCount(1)
  await input.press('Home')
  await expect(dlg.locator('.rfind-row.active .rfind-text')).toHaveText(texts[0])
  // typing matches the start of a word only
  await input.fill('pa')
  const rows = await dlg.locator('.rfind-row .rfind-text').allTextContents()
  expect(rows.length).toBeGreaterThan(0)
  for (const r of rows) expect(r.toLowerCase()).toMatch(/(^|[^\p{L}\p{N}])pa/u)
  await input.fill('pain')
  await expect(dlg.locator('.rfind-row.active .rfind-text')).toHaveText(/^pain/)
  await input.press('Enter') // pain has sub-rubrics: its level opens
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText('pain')
  await input.fill('forehead')
  await expect(dlg.locator('.rfind-row.active .rfind-text')).toHaveText(/^forehead/)
  await input.press('Shift+Enter') // Go to: shows it in the book (Enter would open its sub-rubrics)
  await expect(dlg).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('forehead')
  await expect(crumbs(page)).toContainText('pain')
  // nothing at all: an empty list, and F3 looks under the current rubric
  await page.keyboard.press('F2')
  await input.fill('zzqx')
  await expect(dlg.locator('.rfind-none')).toBeVisible()
  await expect(dlg.locator('.rfind-row')).toHaveCount(0)
  await input.fill('')
  await input.press('F3')
  // forehead has sub-rubrics: its level opens, nothing selected yet
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText('forehead')
  await expect(dlg.locator('.rfind-row').first()).toBeVisible()
  await expect(dlg.locator('.rfind-row.active')).toHaveCount(0)
})

test('Navigation window: Go to puts the rubric at the top of column 1 even when it is on screen', async ({ page }) => {
  await openBook(page)
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  const atTop = () => page.evaluate(() => {
    const doc = document.querySelector('.tab-doc[data-active]')!
    const s = doc.querySelector('.rv-scroll')!
    const sel = document.getElementById(s.getAttribute('aria-activedescendant') ?? '')
    const a = sel?.getBoundingClientRect(), c = doc.querySelector('.rv-col1')!.getBoundingClientRect()
    // at the top of column 1, below a sliver (7px) of the line before it, as RadarOpus places jump targets
    return !!a && Math.abs(a.y - c.y - 7) < 2 && Math.abs(a.x - c.x) < 2
  })
  for (const w of ['morn', 'noon']) {
    await page.keyboard.press('F2')
    await page.keyboard.type('mi')
    await expect(dlg.locator('.rfind-tile.active')).toContainText(/^\W*mind/i)
    await page.keyboard.press('Enter')
    await page.keyboard.type(w)
    await expect(dlg.locator('.rfind-row.active')).toContainText(w)
    await dlg.getByRole('button', { name: 'Go to' }).click()
    await expect(dlg).toBeHidden()
    await expect(crumbs(page).locator('.rv-crumb-last')).toContainText(w)
    await expect.poll(atTop).toBe(true)
  }
  // Go to with nothing selected in a level just opened shows its first rubric
  await page.keyboard.press('F2')
  await page.keyboard.type('mi')
  await expect(dlg.locator('.rfind-tile.active')).toContainText(/^\W*mind/i)
  await page.keyboard.press('Enter')
  const first = (await dlg.locator('.rfind-row .rfind-text').first().textContent())!
  await dlg.getByRole('button', { name: 'Go to' }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText(first)
  await expect.poll(atTop).toBe(true)
})

test('Navigation window keeps the typing focus after clicks and menus', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  const input = dlg.getByRole('combobox', { name: 'Type ahead' })
  await expect(dlg.locator('.rfind-tile.active')).toBeVisible()
  const box = (await dlg.locator('.rfind-main').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20)
  await page.keyboard.type('h')
  await expect(input).toHaveValue('h')
  await dlg.getByRole('button', { name: 'Navigation window options' }).click()
  await page.keyboard.press('Escape')
  await page.keyboard.type('e')
  await expect(input).toHaveValue('he')
  await dlg.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.type('a')
  await expect(input).toHaveValue('hea')
  await expect(input).toBeFocused()
})

test('Navigation window: letter row narrows the chapter tiles, Go to opens a chapter level, < goes back up', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: /^Navigation window/ })
  await expect(dlg.getByText('Start typing the first letters of the chapter you wish to see:')).toBeVisible()
  await expect(dlg.locator('.rfind-tile').first()).toHaveClass(/active/)
  await expect(dlg.locator('.rfind-tile').first().locator('.rfind-cap')).toHaveText('MIND')
  // the letter buttons type: only chapters with a word starting with V are left
  await dlg.getByRole('button', { name: 'Type V' }).click()
  await expect(dlg.getByRole('combobox', { name: 'Type ahead' })).toHaveValue('v')
  await expect(dlg.locator('.rfind-tile .rfind-cap')).toHaveText(['VERTIGO', 'VISION'])
  await page.keyboard.press('ArrowRight')
  await expect(dlg.locator('.rfind-tile.active')).toHaveAttribute('aria-label', 'Vision')
  await dlg.getByRole('button', { name: 'Delete last letter' }).click()
  await expect(dlg.getByRole('combobox', { name: 'Type ahead' })).toHaveValue('')
  // Go to on a chapter tile continues one level down in the same window
  await dlg.locator('.rfind-tile', { hasText: 'HEAD' }).click()
  await dlg.getByRole('button', { name: 'Go to' }).click()
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText('Head')
  await expect(dlg.getByText('Start typing the first letters of the rubric you wish to see:')).toBeVisible()
  await expect(dlg.locator('.rfind-row').first()).toBeVisible()
  await dlg.locator('.rfind-upbtn').click()
  await expect(dlg.locator('.rfind-crumb')).toHaveCount(0)
  await expect(dlg.locator('.rfind-tile.active')).toHaveAttribute('aria-label', 'Head')
  // Take ▾ takes the highlighted rubric with the chosen intensity
  await dlg.getByRole('button', { name: /Take/ }).click()
  await page.getByRole('menuitem', { name: 'Take with intensity 3 (+3)' }).click()
  await expect(page.locator('.toasts [role=status]')).toContainText('Taken HEAD')
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(dlg).toBeHidden()
})

test('a click on a rubric that starts above the page selects it without scrolling; a double-click opens the remedy under the pointer', async ({ page }) => {
  await openBook(page)
  const scroller = page.locator('.tab-doc[data-active] .rv-scroll')
  const box = (await scroller.boundingBox())!
  await page.mouse.move(box.x + 300, box.y + 300)
  await page.mouse.wheel(0, 1500)
  await expect.poll(() => scroller.evaluate(e => e.scrollTop)).toBeGreaterThan(1000)
  await page.waitForTimeout(300)
  // a remedy of the rubric cut off at the top of column 1 (wheel on in small steps until one is)
  const find = () => page.evaluate(() => {
    const s = document.querySelector('.tab-doc[data-active] .rv-scroll')!.getBoundingClientRect()
    const row = [...document.querySelectorAll<HTMLElement>('.tab-doc[data-active] .rv-col1 .rv-row')].find(r => r.getBoundingClientRect().y < s.y - 2 && r.getBoundingClientRect().bottom > s.y + 60)
    const rem = row && [...row.querySelectorAll<HTMLElement>('.rv-rem')].find(e => e.getBoundingClientRect().y > s.y + 20)
    if (!row || !rem) return null
    const b = rem.getBoundingClientRect()
    return { rubric: row.dataset.rubric!, rid: rem.dataset.rid!, x: b.x + 3, y: b.y + b.height / 2 }
  })
  let target = await find()
  for (let k = 0; k < 40 && !target; k++) { await page.mouse.wheel(0, 23); await page.waitForTimeout(80); target = await find() }
  expect(target).not.toBeNull()
  const before = await scroller.evaluate(e => e.scrollTop)
  await page.mouse.click(target!.x, target!.y)
  await expect(current(page)).toHaveAttribute('data-rubric', target!.rubric)
  await page.waitForTimeout(200)
  expect(await scroller.evaluate(e => e.scrollTop)).toBe(before)
  await page.mouse.dblclick(target!.x, target!.y)
  await expect.poll(() => page.evaluate(async () => {
    const s = (await (window as unknown as { __radarModules: { store: () => Promise<{ useApp: { getState: () => { tabs: { id: string; kind: string; remedyId?: number }[]; activeTabId: string } } }> } }).__radarModules.store()).useApp.getState()
    const t = s.tabs.find(x => x.id === s.activeTabId)
    return t?.kind === 'remedy' ? String(t.remedyId) : null
  })).toBe(target!.rid)
})

test('Kent: a "(siehe …)" reference is set apart from the name, and Return follows it to the top of column 1', async ({ page }) => {
  await openBook(page)
  await openRepertoryCmd(page, 'kent-de')
  await expect(page.locator('.tab-doc[data-active] .rv-row').first()).toBeVisible()
  const go = (i: number) => page.evaluate(async i => {
    const m = await (window as unknown as { __radarModules: { store: () => Promise<{ useApp: { getState: () => { activeTabId: string } }; actions: { navigateRubric: (t: string, i: number) => void } }> } }).__radarModules.store()
    m.actions.navigateRubric(m.useApp.getState().activeTabId, i)
  }, i)
  // a reference the data cuts off: the name stands alone (path strip too), the reference follows in its own style
  await go(1710)
  await expect(current(page).locator('.rv-text')).toHaveText('Grobheit')
  await expect(current(page).locator('.rv-see')).toHaveText('(siehe … )')
  await expect(page.locator('.tab-doc[data-active] .rv-crumb-last')).toHaveText('Grobheit')
  // a whole reference: Return jumps to the rubric it names, which starts the page
  await go(18534)
  // RadarOpus prints the collapsed marker for every reference; the target is only the tooltip
  await expect(current(page).locator('.rv-see')).toHaveText('(siehe … )')
  await expect(current(page).locator('.rv-see')).toHaveAttribute('title', 'brennend')
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab-doc[data-active] .rv-crumb-last')).toHaveText('brennend')
  await expect.poll(() => page.evaluate(() => {
    const doc = document.querySelector('.tab-doc[data-active]')!
    const a = doc.querySelector('.rv-row.rv-current')!.getBoundingClientRect(), c = doc.querySelector('.rv-col1')!.getBoundingClientRect()
    return Math.abs(a.y - c.y - 7) < 2 && Math.abs(a.x - c.x) < 2
  })).toBe(true)
  // Back returns to the reference
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(current(page).locator('.rv-see')).toHaveAttribute('title', 'brennend')
})

test('the book raises no window errors (resize observers) when the layout changes', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __errs: string[] }
    w.__errs = []
    window.addEventListener('error', e => w.__errs.push(e.message))
  })
  await openBook(page)
  const run = (id: string) => page.evaluate(async id => {
    const r = await (window as unknown as { __radarModules: { registry: () => Promise<{ runCommand: (id: string) => boolean }> } }).__radarModules.registry()
    r.runCommand(id)
  }, id)
  for (let k = 0; k < 2; k++) { await run('view.toc'); await page.waitForTimeout(400) }
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.waitForTimeout(400)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(400)
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  for (let k = 0; k < 20; k++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => (window as unknown as { __errs: string[] }).__errs)).toEqual([])
})
