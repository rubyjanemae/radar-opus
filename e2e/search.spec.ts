import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { EMPTY, openApp, settle, withinBudget } from './helpers'

const crumbs = (page: Page) => page.locator('.rv-crumbs')
const searchTabs = (page: Page) => page.locator('.tabstrip [role=tab][data-kind=search]')

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
  await expect(page.locator('.toast').filter({ hasText: /Taken 2 rubrics|2 rubrics taken/ })).toBeVisible()

  // summary: clicking a remedy bar filters the results
  const bar = page.locator('.srch-sum .srch-barrow').first()
  const abbrev = (await bar.locator('.srch-barlabel').textContent())!
  await bar.click()
  await expect(page.locator('.srch-chip')).toContainText(`with ${abbrev}`)
  await page.locator('.srch-chip').click()
  await expect(page.locator('.srch-chip')).toBeHidden()
  // a new query clears the remedy filter and puts the cursor back on the first hit
  await bar.click()
  await expect(page.locator('.srch-chip')).toBeVisible()
  await q.fill('head pain night ! occiput')
  await expect(page.locator('.srch-desc')).toHaveText('head and pain and night and not occiput')
  await expect(page.locator('.srch-chip')).toBeHidden()
  await q.fill('head pain night ! forehead')
  await expect(page.locator('.srch-desc')).toHaveText('head and pain and night and not forehead')

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
  await page.locator('.srch-sum').getByRole('tab', { name: 'Compare (2)' }).click()
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

test('command palette: typing stays under a frame budget; enabled() runs once per open; token scrim', async ({ page }) => {
  await ready(page)
  // count one command's enabled() calls across a whole palette session
  await page.evaluate(async () => {
    const { getCommand } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.registry()
    const c = getCommand('app.settings')!
    const orig = c.enabled
    ;(window as unknown as { __en: number }).__en = 0
    c.enabled = () => { (window as unknown as { __en: number }).__en++; return orig ? orig() : true }
  })
  await page.keyboard.press('Control+k')
  const pal = page.getByRole('dialog', { name: 'Command palette' })
  await expect(pal).toBeVisible()
  await withinBudget(() => typeInPalette(page, 'settings zoom'), times => {
    console.log(`palette keystroke to paint: max ${Math.max(...times).toFixed(0)} ms, median ${times.slice().sort((a, b) => a - b)[times.length >> 1].toFixed(0)} ms`)
    // dev build of React is several times slower than production; production target is < 50 ms
    expect(times.slice().sort((a, b) => a - b)[times.length >> 1]).toBeLessThan(50)
    expect(Math.max(...times)).toBeLessThan(200)
  })
  expect(await page.evaluate(() => (window as unknown as { __en: number }).__en)).toBeLessThanOrEqual(1)
  const bg = await page.locator('.pal-backdrop').evaluate(el => getComputedStyle(el).backgroundColor)
  const scrim = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--scrim)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c })
  expect(bg).toBe(scrim)
  await page.keyboard.press('Escape')
})

/** Type into the open palette one character at a time: ms from each input event to the next paint. */
function typeInPalette(page: Page, text: string): Promise<number[]> {
  return page.evaluate(async text => {
    const inp = document.querySelector<HTMLInputElement>('.pal-input')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(inp, '')
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => requestAnimationFrame(() => setTimeout(r)))
    const out: number[] = []
    for (const ch of text) {
      const t = performance.now()
      setter.call(inp, inp.value + ch)
      inp.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => requestAnimationFrame(() => setTimeout(r)))
      out.push(performance.now() - t)
    }
    return out
  }, text)
}

test('command palette with 2,000 patients: keystrokes stay fast, patient matches are capped', async ({ page }) => {
  await ready(page)
  await page.evaluate(async () => {
    const { actions } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    const now = Date.now()
    const ps = []
    for (let i = 0; i < 2000; i++) ps.push({ id: `bulk${i}`, firstName: `Anna${i}`, lastName: `Bulkowska${i}`, birthDate: '1980-01-01', sex: 'female', email: '', phone: '', address: '', occupation: '', notes: '', tags: [], createdAt: now, updatedAt: now - i })
    actions.insertCaseData(ps as never, [] as never)
  })
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await settle(page)
  // every one of 2,000 names matches "bulk": mixed mode shows a short patient section
  await withinBudget(() => typeInPalette(page, 'bulk anna'), times => {
    console.log(`palette, 2k patients: max ${Math.max(...times).toFixed(0)} ms, median ${times.slice().sort((a, b) => a - b)[times.length >> 1].toFixed(0)} ms`)
    // production target: every keystroke < 50 ms (unit-tested on the model); dev React needs headroom
    expect(times.slice().sort((a, b) => a - b)[times.length >> 1]).toBeLessThan(60)
    expect(Math.max(...times)).toBeLessThan(250)
  })
  await expect(page.locator('.pal-list [role=option]', { hasText: /Bulkowska/ }).first()).toBeVisible()
  expect(await page.locator('.pal-list [role=option]', { hasText: /Bulkowska/ }).count()).toBeLessThanOrEqual(5)
  // patient mode lists more, still capped
  await withinBudget(() => typeInPalette(page, '@bulk'), times => expect(Math.max(...times)).toBeLessThan(250))
  await expect.poll(() => page.locator('.pal-list [role=option]', { hasText: /Bulkowska/ }).count()).toBeGreaterThan(5)
  expect(await page.locator('.pal-list [role=option]').count()).toBeLessThanOrEqual(100)
  await page.keyboard.press('Escape')
})

test('quick find: remedy abbreviations first, one Esc restores focus, recent items when empty', async ({ page }) => {
  await ready(page)
  const book = page.locator('.rv-scroll')
  await book.focus()
  const box = page.getByRole('combobox', { name: 'Quick find' })
  const list = page.getByRole('listbox', { name: 'Quick find results' })

  // an exact abbreviation puts the remedy first, so Enter opens it (and the box is cleared)
  await page.keyboard.press('Control+f')
  await page.keyboard.type('sulph')
  await expect(list.getByRole('option').first()).toHaveClass(/qf-remedy/)
  await expect(list.getByRole('option').first()).toContainText('Sulphur')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: /Sulph/ }).first()).toHaveAttribute('aria-selected', 'true')
  await expect(box).toHaveValue('')

  // ordinary words still list rubrics first
  await page.getByRole('tab', { name: /Mind/ }).first().click()
  await book.focus()
  await page.keyboard.press('Control+f')
  await page.keyboard.type('fear night')
  await expect(list.getByRole('option').first()).toHaveClass(/qf-rubric/)

  // one Esc closes the dropdown, clears the box and returns focus to the book
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()
  await expect(box).toHaveValue('')
  await expect(book).toBeFocused()

  // an empty box offers recent searches and recent rubrics
  await page.keyboard.press('Control+f')
  await page.keyboard.type('head pain')
  await page.keyboard.press('Enter')
  await expect(crumbs(page).locator('.rv-crumb-last')).toHaveText('pain')
  await page.keyboard.press('Control+f')
  await expect(list.getByRole('group', { name: 'Recent searches' })).toContainText('head pain')
  await expect(list.getByRole('group', { name: 'Recent rubrics' }).getByRole('option').first()).toContainText('Head, pain')
  await page.keyboard.press('Enter')
  await expect(box).toHaveValue('head pain')
})

test('search view at 1152x720: every result action visible, summary collapses and returns', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await ready(page)
  await page.keyboard.press('F4')
  await page.getByRole('combobox', { name: 'Search query' }).fill('fear night')
  const bar = page.locator('.srch-bar-row')
  await expect(page.locator('.srch-total')).toContainText('rubrics')
  const barBox = (await bar.boundingBox())!
  for (const name of ['More take options', 'Open', 'Show remedies', 'Result summary', 'Export CSV']) {
    const b = (await bar.getByRole('button', { name, exact: true }).boundingBox())!
    expect(b.x + b.width, name).toBeLessThanOrEqual(barBox.x + barBox.width)
    expect(b.y + b.height, name).toBeLessThanOrEqual(barBox.y + barBox.height)
  }
  // the summary starts hidden when it would squeeze the results, and the toggle brings it back
  const summaryBtn = bar.getByRole('button', { name: 'Result summary' })
  if (await page.locator('.srch-sum').count() === 0) {
    await expect(summaryBtn).toHaveAttribute('aria-pressed', 'false')
    await summaryBtn.click()
  }
  await expect(page.locator('.srch-sum')).toBeVisible()
  await expect(summaryBtn).toHaveAttribute('aria-pressed', 'true')
  const sum = (await page.locator('.srch-sum').boundingBox())!
  const tabs = page.locator('.srch-sum-tabs button')
  for (let i = 0; i < await tabs.count(); i++) {
    const t = (await tabs.nth(i).boundingBox())!
    expect(t.x + t.width).toBeLessThanOrEqual(sum.x + sum.width + 0.5)
  }
})

test('F5 picker: text clear of the icon, no-match feedback, chapters grouped by repertory', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('F5')
  const picker = page.getByRole('combobox', { name: 'Remedy' })
  await expect(picker).toBeFocused()
  const pad = await picker.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))
  const icon = (await page.locator('.srch-rp-icon').boundingBox())!
  const input = (await picker.boundingBox())!
  expect(input.x + pad).toBeGreaterThan(icon.x + icon.width)
  await picker.pressSequentially('xyzq')
  await expect(page.getByText('No remedy matches “xyzq”')).toBeVisible()
  await picker.fill('')
  await picker.pressSequentially('lach')
  await page.keyboard.press('Enter')
  await page.getByRole('combobox', { name: 'Search scope' }).selectOption('all')
  await expect(page.locator('.srch-sum .srch-bargroup')).toHaveCount(2)
})

test('command palette: empty state order, keyword reasons, leaving a prefix mode', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('F4')
  await page.getByRole('tab', { name: /Mind/ }).first().click()
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('Control+k')
  const pal = page.getByRole('dialog', { name: 'Command palette' })
  await expect(pal.locator('.pal-head').first()).toHaveText('Open tabs')
  await expect(pal.locator('.pal-opt.disabled')).toHaveCount(0)
  // keyword-only matches come after title matches and show the keyword
  await page.keyboard.type('take')
  await expect(pal.getByRole('option').first()).toContainText('Take')
  await expect(pal.locator('.pal-why').first()).toBeVisible()
  // select-all + typing replaces the mode chip too
  await page.keyboard.press('Control+a')
  await page.keyboard.type('/fear')
  await expect(pal.locator('.pal-mode')).toHaveText('Rubrics')
  await page.keyboard.press('Control+a')
  await page.keyboard.type('zoom in')
  await expect(pal.locator('.pal-mode')).toHaveCount(0)
  await expect(pal.getByRole('option').first()).toContainText('Zoom in')
  // the chip's close button leaves the mode and keeps the text
  await page.keyboard.press('Control+a')
  await page.keyboard.type('#lach')
  await pal.getByRole('button', { name: 'Leave remedies mode' }).click()
  await expect(pal.locator('.pal-mode')).toHaveCount(0)
  await expect(pal.getByRole('combobox')).toHaveValue('lach')
})

test('search results: live count, no controls inside options, combined take is one undo step', async ({ page }) => {
  await openApp(page, EMPTY)
  await page.keyboard.press('F4')
  const q = page.getByRole('combobox', { name: 'Search query' })
  await q.fill('head pain night')
  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByRole('option').first()).toBeVisible()
  // the count is announced politely; options hold no nested interactive controls (axe nested-interactive)
  await expect(page.locator('.srch-bar-row [role=status]')).toHaveText(/^\d+ rubrics$/)
  expect(await results.locator('[role=option] :is(input, button, a, [tabindex])').count()).toBe(0)
  // the tick box still selects with a click
  await results.getByRole('option').nth(1).locator('.srch-cb').click()
  await expect(results.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
  await results.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Space')
  await expect(page.locator('.srch-total')).toContainText('2 selected')
  // no case yet: taking creates the case and the symptom, and one undo removes both
  await page.getByRole('button', { name: 'More take options' }).click()
  await page.getByRole('menuitem', { name: 'Take as one combined symptom' }).click()
  await expect(page.locator('.statusbar')).toContainText('1 symptom')
  await results.focus()
  await page.keyboard.press('Control+z')
  await expect(page.locator('.statusbar')).not.toContainText('symptom')
  // nothing matches: said in the live region, shown outside the listbox
  await q.fill('zzqqx')
  await expect(page.locator('.srch-bar-row [role=status]')).toHaveText('No rubric matches “zzqqx”.')
  await expect(results).toHaveCount(0)
})

test('F5 opens at once and fills from the remedy index; ? opens search only outside text fields', async ({ page }) => {
  await ready(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('F5')
  const picker = page.getByRole('combobox', { name: 'Remedy' })
  await expect(picker).toBeFocused()
  // '?' typed in a field is text, not a shortcut
  await picker.pressSequentially('?')
  await expect(picker).toHaveValue('?')
  await expect(searchTabs(page)).toHaveCount(1)
  await picker.fill('')
  await picker.pressSequentially('sulph')
  await page.keyboard.press('Enter')
  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.locator('.srch-head').first()).toContainText('Mind')
  // Home lands on the first rubric, not on the chapter header above it
  await results.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('Home')
  await expect(results.locator('.srch-row.cursor')).toHaveAttribute('role', 'option')
  // from the workspace '?' opens a word search
  await page.getByRole('tab', { name: /Mind/ }).first().click()
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('?')
  await expect(page.getByRole('combobox', { name: 'Search query' })).toBeFocused()
})

test('a repertory that failed to load is requested again by Retry', async ({ page }) => {
  let block = true
  await page.route(/rep-kent-de\.json/, r => (block ? r.abort() : r.continue()))
  await openApp(page, EMPTY)
  await page.keyboard.press('F4')
  await page.getByRole('combobox', { name: 'Search query' }).fill('angst')
  await page.getByRole('combobox', { name: 'Search scope' }).selectOption('all')
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible({ timeout: 15_000 })
  block = false
  await retry.click()
  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.srch-pend')).toHaveCount(0)
  await expect(results).toContainText(/Angst/i)
})

test('search results: set positions and a grade breakdown that is not colour alone', async ({ page }) => {
  await openApp(page, EMPTY)
  await page.keyboard.press('F4')
  await page.getByRole('combobox', { name: 'Search query' }).fill('fear night')
  const results = page.getByRole('listbox', { name: 'Search results' })
  const first = results.getByRole('option').first()
  await expect(first).toHaveAttribute('aria-posinset', '1')
  const total = (await page.locator('.srch-total b').first().textContent())!.replace(/\D/g, '')
  await expect(first).toHaveAttribute('aria-setsize', total)
  // each remedy bar names its grade breakdown, prints grade numerals and shows the breakdown on focus
  const bar = page.locator('.srch-sum .srch-barrow').first()
  await expect(bar).toHaveAttribute('aria-label', /^\S+ \d+: grade \d \d+(, grade \d \d+)*$/)
  await expect(bar.locator('.srch-seg-n').first()).toHaveText(/^[1-4]$/)
  await bar.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(bar.locator('.srch-barbreak')).toBeVisible()
  await expect(page.locator('.srch-legend .srch-seg-n')).toHaveText(['4', '3', '2', '1'])
})

test('F4 results: Enter focuses the first result, + take bar takes like the book, Backspace and F3 act on the list', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('F4')
  const q = page.getByRole('combobox', { name: 'Search query' })
  await expect(q).toBeFocused()
  await q.pressSequentially('fear night')
  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByRole('option').first()).toContainText('night')
  // while the caret is in the box, no row looks focused
  const cursorRow = results.locator('.srch-row.cursor')
  await expect(cursorRow).toHaveCSS('box-shadow', 'none')
  // Enter: the list takes the focus on the first result
  await q.press('Enter')
  await expect(results).toBeFocused()
  await expect(cursorRow).toHaveAttribute('aria-posinset', '1')
  await expect(cursorRow).not.toHaveCSS('box-shadow', 'none')
  // `+2` takes the cursor row with intensity 2; Enter in the bar takes, it does not open the book
  const tabsBefore = await page.locator('.tabstrip [role=tab]').count()
  await page.keyboard.press('ArrowDown')
  const second = (await cursorRow.locator('.srch-path').textContent())!
  await page.keyboard.press('+')
  const bar = page.getByRole('dialog', { name: 'Take rubric' })
  await expect(bar).toBeVisible()
  await page.keyboard.type('2')
  await expect(bar).toContainText('×2')
  await page.keyboard.press('Enter')
  await expect(bar).toBeHidden()
  await expect(page.locator('.toast').filter({ hasText: /Taken Mind - .*night/ }).last()).toBeVisible()
  await expect(results).toBeFocused()
  await expect(page.locator('.tabstrip [role=tab]')).toHaveCount(tabsBefore)
  await expect(page.locator('.tabstrip [role=tab][aria-selected=true]')).toHaveAttribute('data-kind', 'search')
  expect(second).toContain('night')
  // selected rows: `+1>2` takes all of them into clipboard 2
  await page.keyboard.press('Home')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.keyboard.press('=')
  await expect(bar).toContainText('2 selected rubrics')
  await page.keyboard.type('1>2')
  await page.keyboard.press('Enter')
  // the take toast merges quick takes: it names clipboard 2 as a target now
  await expect(page.locator('.toast').filter({ hasText: /2 → / }).last()).toBeVisible()
  // Backspace goes back to the query; F3 opens Find at the rubric under the cursor
  await page.keyboard.press('Backspace')
  await expect(q).toBeFocused()
  await q.press('Enter')
  await expect(results).toBeFocused()
  await page.keyboard.press('F3')
  await expect(page.getByRole('dialog').filter({ hasNot: page.locator('.rv-takebar') }).first()).toBeVisible()
})

test('F4 and quick find typing never block the main thread for long', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const w = window as unknown as { __lt: number[] }
    w.__lt = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lt.push(e.duration) }).observe({ type: 'longtask' })
  })
  await page.keyboard.press('F4')
  const q = page.getByRole('combobox', { name: 'Search query' })
  await expect(page.locator('.srch-empty strong')).toContainText('Search rubrics by words')
  await settle(page)
  await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = [] })
  await q.pressSequentially('pain a', { delay: 50 })
  await expect(page.locator('.srch-desc')).toContainText('pain and a')
  await page.keyboard.press('Control+f')
  await expect(page.getByRole('combobox', { name: 'Quick find' })).toBeFocused()
  await settle(page)
  await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = [] })
  await page.keyboard.type('he', { delay: 50 })
  await expect(page.getByRole('listbox', { name: 'Quick find results' }).locator('.qf-rubric').first()).toBeVisible()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('pa', { delay: 50 })
  await expect(page.getByRole('listbox', { name: 'Quick find results' }).locator('.qf-rubric').first()).toBeVisible()
  await settle(page)
  const lt = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt)
  // the e2e server runs React in development mode (several times slower than the build, where the
  // longest task measured is well under 50 ms): the budget allows for that overhead only
  expect(Math.max(0, ...lt)).toBeLessThan(120)
})
