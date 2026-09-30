import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const crumbs = (page: Page) => page.locator('.rv-crumbs')
// open documents stay mounted (hidden) when another tab is active: look inside the active one
const current = (page: Page) => page.locator('.tab-doc[data-active] .rv-row.rv-current')

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
  await expect(page.locator('.toast').filter({ hasText: 'Taken Mind - morning' })).toBeVisible()
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
  const dlg = page.getByRole('dialog', { name: 'Find rubric' })
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
  const here = page.getByRole('dialog', { name: 'Find from current rubric' })
  await expect(here.locator('.rfind-crumb.on')).toHaveText('alone')
  await expect(here.locator('.rfind-row').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(here).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('alone')
})

test('Find: + after a filter takes the highlighted rubric; Esc shows the last highlighted rubric; no match offers search', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F3') // on the Mind chapter heading: Mind's rubrics
  const dlg = page.getByRole('dialog', { name: 'Find from current rubric' })
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText('Mind')
  await page.keyboard.type('noon+2')
  await expect(dlg.locator('.rfind-take')).toContainText('Enter takes noon (×2)')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').filter({ hasText: 'Taken Mind - noon' })).toBeVisible()
  await expect(dlg).toBeVisible()
  await expect(dlg.locator('.rfind-input')).toHaveValue('noon')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('aftern')
  await expect(dlg.locator('.rfind-row.active')).toContainText('afternoon')
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('afternoon')
  await expect(page.locator('.rv-scroll')).toBeFocused()
  // no match: the list collapses to one actionable row
  await page.keyboard.press('F2')
  await page.keyboard.type('zzqqx')
  const find = page.getByRole('dialog', { name: 'Find rubric' })
  await expect(find.locator('[role=status]')).toHaveText('No match at this level')
  await expect(find.getByRole('option', { name: /Search all rubrics for .zzqqx./ })).toBeVisible()
  await expect(find.locator('.rfind-list')).toHaveCount(0)
})

test('book keys: Space only on the list, Alt+PageDown switches tabs, concise accessible names', async ({ page }) => {
  await openBook(page)
  const seg = page.getByRole('radiogroup', { name: /Rubric display/ })
  const checked = seg.locator('[aria-checked=true]')
  const before = await checked.getAttribute('aria-label')
  await checked.focus()
  await page.keyboard.press('Space')
  await expect(checked).toHaveAttribute('aria-label', before!)
  // roving radiogroup: arrows move and select
  await page.keyboard.press('ArrowRight')
  await expect(seg.locator('[aria-checked=true]')).toBeFocused()
  expect(await seg.locator('[aria-checked=true]').getAttribute('aria-label')).not.toBe(before)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await expect(current(page)).toHaveAttribute('aria-label', /^Mind, morning, \d+ remedies/)
  const mode = await seg.locator('[aria-checked=true]').getAttribute('aria-label')
  await page.keyboard.press('Space')
  expect(await seg.locator('[aria-checked=true]').getAttribute('aria-label')).not.toBe(mode)
  // options: position in the whole chapter, not the rendered window
  await expect(current(page)).toHaveAttribute('aria-posinset', '2')
  const size = Number(await current(page).getAttribute('aria-setsize'))
  expect(size).toBeGreaterThan(1000)
  await page.keyboard.press('End')
  await expect(current(page)).toHaveAttribute('aria-posinset', String(size))
  await page.keyboard.press('Home')
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
  await page.getByRole('combobox', { name: 'Repertory' }).first().selectOption('kent-de')
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
  // take into a new clipboard, then the toast's Undo removes exactly that take
  await page.locator('.tab-doc[data-active] .rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+1>5')
  await page.keyboard.press('Enter')
  await expect(current(page).locator('.rv-clip')).toHaveText('5')
  await page.locator('.toast').filter({ hasText: 'Clipboard 5' }).getByRole('button', { name: 'Undo' }).click()
  await expect(current(page).locator('.rv-clip')).toHaveCount(0)
})

test('space cycles the display and the grade filter hides remedies', async ({ page }) => {
  await openBook(page)
  const seg = page.getByRole('radiogroup', { name: /Rubric display/ })
  await expect(seg.getByRole('radio', { name: 'Abbrev' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Space')
  await expect(seg.getByRole('radio', { name: 'Names' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Space')
  await expect(seg.getByRole('radio', { name: 'Count' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.rv-rem')).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(seg.getByRole('radio', { name: 'Abbrev' })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('Minimum grade shown').selectOption('3')
  await expect(page.locator('.rv-rem.g1')).toHaveCount(0)
  await expect(page.locator('.rv-hidden').first()).toBeVisible()
})

test('bookmark, note and bookmarks manager', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Control+d')
  const bm = page.getByRole('region', { name: 'Bookmarks' })
  await expect(bm.getByRole('button', { name: 'Mind - morning' })).toBeVisible()
  await expect(current(page).locator('.rv-mark-bm')).toBeVisible()
  await page.keyboard.press('Control+Shift+M')
  await page.getByRole('textbox', { name: 'Note' }).fill('Check modalities')
  await page.keyboard.press('Control+Enter')
  await expect(current(page).locator('.rv-note')).toHaveText('Check modalities')
  await page.keyboard.press('Control+Shift+D')
  const mgr = page.getByRole('dialog', { name: 'Bookmarks' })
  await expect(mgr).toBeVisible()
  await mgr.getByRole('button', { name: 'Rename bookmark' }).click()
  await mgr.getByLabel('Bookmark label').fill('Morning aggravation')
  await mgr.getByLabel('Bookmark label').press('Enter')
  await expect(mgr.locator('.rbm-label')).toHaveText('Morning aggravation')
  await mgr.getByRole('button', { name: 'Close' }).last().click()
  await expect(bm.getByRole('button', { name: 'Morning aggravation' })).toBeVisible()
})

test('navigator follows the book and navigates it', async ({ page }) => {
  await openBook(page)
  const tree = page.getByRole('tree')
  await tree.getByRole('treeitem', { name: /^Head/ }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Head')
  await page.keyboard.press('ArrowRight')
  await expect(tree.getByRole('treeitem', { name: /^Head/ })).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(crumbs(page)).toContainText('Head')
  await expect(crumbs(page).locator('.rv-crumb-last')).not.toHaveText('Head')
  await page.getByLabel('Filter chapters').fill('sto')
  await expect(tree.getByRole('treeitem', { name: /^Stomach/ })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: /^Mind/ })).toHaveCount(0)
  await page.getByLabel('Filter chapters').press('Enter')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Stomach')
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
  await expect(page.locator('.toast').filter({ hasText: 'excluding' })).toBeVisible()
  const rem = page.locator('.rv-row[data-rubric="1"] .rv-rem').first()
  await rem.click()
  await expect(page.locator('.rv-hlbar')).toBeVisible()
  await rem.dblclick()
  await expect(page.getByRole('tablist', { name: 'Open documents' }).getByRole('tab', { selected: true })).not.toContainText('Mind')
})

test('drag a rubric onto a toolbar clipboard chip', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('Insert') // creates the unsaved case and the first chip
  const chip = page.locator('.clip-chip').first()
  await expect(chip).toBeVisible()
  await page.locator('.rv-row[data-rubric="3"]').dragTo(chip)
  // a drop is the standard take into that chip's clipboard
  await expect(page.locator('.toast').last()).toContainText(/forenoon/)
  await expect(page.locator('.rv-row[data-rubric="3"] .rv-clip')).toHaveText('1')
})

test('Ctrl+1 opens the repertories table of contents', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('Control+1')
  await expect(page.getByRole('listbox', { name: 'Repertories' })).toBeVisible()
  await page.locator('.rtoc-chapter', { hasText: 'Vertigo' }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('Vertigo')
})

const inView = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('.tab-doc[data-active] .rv-current')!.getBoundingClientRect()
  const s = document.querySelector('.tab-doc[data-active] .rv-scroll')!.getBoundingClientRect()
  return { top: Math.round(c.top - s.top), fully: c.top >= s.top - 1 && c.bottom <= s.bottom + 1 }
})

test('display changes keep the current rubric where it was', async ({ page }) => {
  await openBook(page)
  await page.locator('.rv-seg button', { hasText: 'Count' }).click()
  await page.locator('.rv-scroll').focus()
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown')
  const before = await inView(page)
  expect(before.fully).toBe(true)
  await page.locator('.rv-seg button', { hasText: 'Abbrev' }).click()
  // the row stays where it was (to the pixel: the new heights are fractional, scroll positions whole)
  await expect.poll(async () => { const now = await inView(page); return now.fully && Math.abs(now.top - before.top) <= 1 }).toBe(true)
  await page.locator('.rv-scroll').focus()
  for (const _ of [1, 2, 3]) {
    await page.keyboard.press('Space')
    await expect.poll(async () => (await inView(page)).fully).toBe(true)
  }
  await page.selectOption('.rv-grade', '3')
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
  await page.keyboard.press('Control+1')
  const open = page.locator('.rtoc-head .btn')
  await expect(open).toBeVisible()
  const [btn, detail] = await Promise.all([open.boundingBox(), page.locator('.rtoc-detail').boundingBox()])
  expect(btn!.x + btn!.width).toBeLessThanOrEqual(detail!.x + detail!.width)
})

test('recent list fills from reading and acting; navigator marks the menu row', async ({ page }) => {
  await openBook(page)
  const recent = page.getByRole('region', { name: 'Recent rubrics' }).locator('.rnav-link')
  await page.keyboard.press('ArrowDown')
  // dwelling on a rubric records it (after about a second)
  await expect(recent).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Control+d')
  await expect(recent).toHaveCount(2)
  await expect(recent.first()).toHaveAttribute('aria-current', 'location')
  await recent.nth(1).click()
  await expect(page.locator('.rv-crumb-last')).toHaveText('morning')
  const row = page.locator('.rnav-row').nth(5)
  await row.click({ button: 'right' })
  await expect(row).toHaveClass(/menu-target/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.rnav-row.menu-target')).toHaveCount(0)
})

test('taking again never downgrades; F6 shows what is already on the clipboard', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('+3a')
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').last()).toContainText('Taken Mind - morning')
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
  await expect(page.locator('.toast').last()).toContainText('Updated Mind - morning')
})

test('Find: Esc and Go to after opening a level land on the opened rubric', async ({ page }) => {
  await openBook(page)
  await page.keyboard.press('F2')
  const dlg = page.getByRole('dialog', { name: 'Find rubric' })
  await page.keyboard.type('mi')
  await page.keyboard.press('Enter') // opens Mind: its first rubric is highlighted by Find, not by the reader
  await page.keyboard.type('weep')
  await page.keyboard.press('Enter') // opens "weeping"
  await expect(dlg.locator('.rfind-crumb.on')).toHaveText(/weeping/)
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText(/^weeping/)
  // Go to, same rule; once the reader moves inside the level, the highlighted rubric wins
  await page.keyboard.press('F3')
  const here = page.getByRole('dialog', { name: 'Find from current rubric' })
  await page.keyboard.press('ArrowDown')
  const second = (await here.locator('.rfind-row.active .rfind-text').textContent())!
  await here.getByRole('button', { name: 'Go to' }).click()
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText(second)
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

test('count display badges every rubric; tree items carry level and position', async ({ page }) => {
  await openBook(page)
  await page.locator('.rv-seg button', { hasText: 'Count' }).click()
  await expect(page.locator('.rv-count-zero').first()).toHaveText('–')
  const tree = page.getByRole('tree')
  const head = tree.getByRole('treeitem', { name: /^Head/ })
  await expect(head).toHaveAttribute('aria-level', '1')
  const setsize = Number(await head.getAttribute('aria-setsize'))
  expect(setsize).toBeGreaterThan(20)
  await expect(tree.getByRole('treeitem', { name: /^Mind/ })).toHaveAttribute('aria-posinset', '1')
  const w = (el: Element) => getComputedStyle(el).fontWeight
  expect(await head.evaluate(w)).toBe('500')
  expect(await tree.getByRole('treeitem', { name: /^Mind/ }).evaluate(w)).toBe('700')
})

test('navigator and repertory dialogs pass axe (list roles, contrast) in both themes', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await openBook(page)
    await page.keyboard.press('ArrowDown')
    // Bookmarks is empty on a first run: its hint must not sit inside a role=list
    await expect(page.getByRole('region', { name: 'Bookmarks' }).locator('.rnav-hint')).toBeVisible()
    const nav = await new AxeBuilder({ page }).include('.rnav').include('.tab-doc[data-active] .rv-row.rv-current')
      .withRules(['aria-required-children', 'aria-required-parent', 'color-contrast']).analyze()
    expect(nav.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
    await page.keyboard.press('F2')
    const find = page.getByRole('dialog', { name: 'Find rubric' })
    await expect(find.locator('.rfind-row.active .rfind-count')).toBeVisible()
    const fr = await new AxeBuilder({ page }).include('.rfind-list').withRules(['color-contrast']).analyze()
    expect(fr.violations.map(v => v.id)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(find).toBeHidden()
    await page.locator('.rv-scroll').focus()
    await page.keyboard.press('Control+Shift+M')
    await expect(page.locator('.rnote-keys')).toBeVisible()
    const note = await new AxeBuilder({ page }).include('.rnote-keys').withRules(['color-contrast']).analyze()
    expect(note.violations.map(v => v.id)).toEqual([])
    await page.keyboard.press('Escape')
  }
})

test('ArrowDown in the book stays under a frame budget (p95 < 33 ms)', async ({ page }) => {
  await openBook(page)
  const times = await page.evaluate(async () => {
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
  })
  const sorted = times.slice(10).sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  console.log(`ArrowDown p95 ${p95.toFixed(1)} ms`)
  expect(p95).toBeLessThan(33)
})
