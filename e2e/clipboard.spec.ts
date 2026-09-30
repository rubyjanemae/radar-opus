import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp, waitForSaved } from './helpers'

const panel = (page: Page) => page.getByTestId('clipboard-panel')
const rows = (page: Page) => panel(page).locator('.cbp-row')

async function newCase(page: Page) {
  await panel(page).getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByLabel('First name').fill('Anna')
  await dialog.getByLabel('Last name').fill('Keller')
  await dialog.getByRole('button', { name: 'Create case' }).click()
  await expect(panel(page).locator('.cbp-case-patient')).toHaveText('Keller, Anna')
  // the standard flow opened the patient file; go back to the repertory so clicks in the centre pane land on no input
  await expect(page.locator('.tab.active')).toContainText('Keller, Anna')
  await page.locator('.tab', { hasText: 'Mind' }).first().click()
}

/** Simulate dropping rubrics dragged from the repertory. */
async function dropRubrics(page: Page, refs: string[], selector = '.cbp-list') {
  await page.evaluate(([refs, selector]) => {
    const el = document.querySelector(selector as string)!
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', (refs as string[]).join('\n'))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, [refs, selector] as const)
}

const weights = (page: Page) => panel(page).locator('.cbp-int').evaluateAll(els => els.map(e => Number(e.getAttribute('data-weight'))))
const focusedSid = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.sid ?? document.activeElement?.className ?? null)

/** Close whatever case is active (the app may seed a demo case on first run). */
async function closeCase(page: Page) {
  if (await panel(page).locator('.cbp-case-patient').count() === 0) return
  await panel(page).getByRole('button', { name: 'Switch case' }).click()
  await page.getByRole('menuitem', { name: 'Close case' }).click()
  await expect(panel(page)).toContainText('No active case')
}

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('empty states guide to a new case, then to taking rubrics', async ({ page }) => {
  await closeCase(page)
  await expect(panel(page)).toContainText('No active case')
  // the dialog explains an empty name instead of silently doing nothing
  await panel(page).getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByRole('button', { name: 'Create case' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Enter a first or last name.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await newCase(page)
  // nothing to analyse yet
  await expect(panel(page).getByRole('button', { name: /Analyse/ })).toHaveAttribute('aria-disabled', 'true')
  await expect(panel(page)).toContainText('Clipboard 1 is empty')
  await expect(panel(page)).toContainText('F6')
  await expect(panel(page)).toContainText('takes the current rubric at intensity 1')
})

test('wrapped rows keep index, intensity, markers and count on the first text line', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await newCase(page)
  await dropRubrics(page, ['publicum:30000'])
  await expect(rows(page)).toHaveCount(1)
  await rows(page).nth(0).click()
  await page.keyboard.press('e')
  await page.keyboard.press('g')
  await page.keyboard.press('a')
  const row = rows(page).nth(0)
  await expect(row.locator('.cbp-flag.f-e')).toBeVisible()
  // force the text to wrap over several lines
  await panel(page).evaluate(el => { (el as HTMLElement).style.width = '260px' })
  const m = await row.evaluate(r => {
    const top = (sel: string) => { const e = r.querySelector(sel)!.getBoundingClientRect(); return { top: e.top, mid: e.top + e.height / 2, h: e.height } }
    const text = r.querySelector('.cbp-path')!
    const range = document.createRange(); range.selectNodeContents(text)
    const first = range.getClientRects()[0]
    return { lineMid: first.top + first.height / 2, textH: text.getBoundingClientRect().height, idx: top('.cbp-idx'), size: top('.cbp-size'), flag: top('.cbp-flag.f-e') }
  })
  expect(m.textH).toBeGreaterThan(30)
  for (const k of ['idx', 'size', 'flag'] as const) expect(Math.abs(m[k].mid - m.lineMid)).toBeLessThanOrEqual(2)
  await page.screenshot({ path: '/tmp/claude-0/gauntlet/cbp-wrap.png', clip: await row.boundingBox() ?? undefined })
})

test('keyboard editing: intensity, qualifications, group, scoping', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000', 'publicum:30000'])
  await expect(rows(page)).toHaveCount(3)
  await expect(panel(page).getByRole('tab', { selected: true })).toContainText('3')

  await rows(page).nth(0).click()
  await expect(rows(page).nth(0)).toBeFocused()
  await page.keyboard.press('3')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('0')
  await expect.poll(() => weights(page)).toEqual([3, 0, 1])
  await expect(rows(page).nth(1)).toHaveClass(/ignored/)
  await expect(panel(page)).toContainText('2 active')

  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('e')
  await expect(rows(page).nth(1).locator('.f-e')).toBeVisible()
  await expect(rows(page).nth(2).locator('.f-e')).toBeVisible()
  await page.keyboard.press('x')
  await expect(rows(page).nth(1).locator('.f-e')).toHaveCount(0)
  await expect(rows(page).nth(1).locator('.f-x')).toBeVisible()
  await page.keyboard.press('c')
  await page.keyboard.press('g')
  await expect(panel(page)).toContainText('press a letter')
  await page.keyboard.press('b')
  await expect(rows(page).nth(2).locator('.f-g')).toHaveText('b')

  // digits typed outside the panel do not touch symptoms
  await page.locator('.pane-center').first().click({ position: { x: 400, y: 300 } })
  await page.keyboard.press('4')
  await expect.poll(() => weights(page)).toEqual([3, 0, 1])

  // Ctrl+A in the panel selects all, Ctrl+Down moves
  await rows(page).nth(0).click()
  await page.keyboard.press('Control+ArrowDown')
  await expect.poll(() => weights(page)).toEqual([0, 3, 1])
  await page.keyboard.press('Control+a')
  await expect(panel(page)).toContainText('3 selected')
})

test('context menu combine and split, delete with undo, note', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000', 'publicum:30000'])
  await rows(page).nth(0).click()
  await rows(page).nth(1).click({ modifiers: ['Shift'] })
  await rows(page).nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Combine (intersection)' }).click()
  await expect(rows(page)).toHaveCount(2)
  // the head reads as the analysis does: the rubrics joined with ∩ (never "Intersection of 2 rubrics")
  await expect(rows(page).nth(0).locator('.cbp-combined-label')).toHaveText(/^.+ ∩ .+$/)
  await expect(rows(page).nth(0).locator('.cbp-text')).toHaveAttribute('title', /^[A-Z].* - .* ∩ [A-Z].* - .*$/)

  await rows(page).nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Split' }).click()
  await expect(rows(page)).toHaveCount(3)

  await rows(page).nth(2).click()
  await page.keyboard.press('n')
  const dlg = page.getByRole('dialog', { name: 'Symptom note' })
  await dlg.getByLabel('Note').fill('only at night')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(rows(page).nth(2).locator('.cbp-note-tip')).toHaveText('only at night')
  await rows(page).nth(2).locator('.cbp-note').hover()
  await expect(rows(page).nth(2).locator('.cbp-note-tip')).toBeVisible()

  await rows(page).nth(2).focus()
  await page.keyboard.press('Delete')
  await expect(rows(page)).toHaveCount(2)
  await page.locator('.toast', { hasText: 'Symptom removed' }).locator('.toast-action').click()
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(2).locator('.cbp-note')).toBeVisible()
})

test('clipboards: add, rename, switch with Alt+N, move symptoms, drop on chip', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000'])
  await panel(page).getByRole('button', { name: 'New clipboard' }).click()
  await page.keyboard.type('Mentals')
  await page.keyboard.press('Enter')
  const chips = panel(page).getByRole('tab')
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(1)).toContainText('Mentals')
  await expect(chips.nth(1)).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Alt+1')
  await expect(chips.nth(0)).toHaveAttribute('aria-selected', 'true')
  await rows(page).nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to clipboard' }).hover()
  await page.getByRole('menuitem', { name: '2. Mentals' }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(chips.nth(1)).toContainText('1')

  await dropRubrics(page, ['publicum:30000'], '.cbp-chip:nth-child(2)')
  await expect(chips.nth(1).locator('.cbp-chip-count')).toHaveText('2')

  // rename by double-click
  await chips.nth(0).dblclick()
  await page.getByLabel('Clipboard name').fill('Generals')
  await page.getByLabel('Clipboard name').press('Enter')
  await expect(chips.nth(0)).toContainText('Generals')

  await page.keyboard.press('Alt+2')
  await expect(rows(page)).toHaveCount(2)
})

test('F7 focuses the panel and Enter opens the rubric in the repertory', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120'])
  await page.locator('.pane-center').first().click({ position: { x: 400, y: 300 } })
  await page.keyboard.press('F7')
  await expect(rows(page).nth(0)).toBeFocused()
  const path = await rows(page).nth(0).locator('.cbp-rest').innerText()
  await page.keyboard.press('Enter')
  await expect(page.locator('.pane-center').first()).toContainText(path.split(',').pop()!.trim())
})

test('focus stays in the list after Delete, Backspace and context-menu commands', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000', 'publicum:30000', 'publicum:31000'])
  await expect(rows(page)).toHaveCount(4)
  const ids = await rows(page).evaluateAll(els => els.map(e => (e as HTMLElement).dataset.sid))

  await rows(page).nth(0).click()
  await page.keyboard.press('Delete')
  await expect(rows(page)).toHaveCount(3)
  await expect.poll(() => focusedSid(page)).toBe(ids[1])
  await page.keyboard.press('4')
  await expect.poll(() => weights(page)).toEqual([4, 1, 1])

  // Backspace removes too (Mac laptops have no forward Delete); at the end the cursor moves back
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await expect(rows(page)).toHaveCount(2)
  await expect.poll(() => focusedSid(page)).toBe(ids[2])

  // running an item from a submenu closes the menu and returns focus to the row
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Change intensity' }).press('Enter')
  await page.getByRole('menuitemcheckbox', { name: '3' }).click()
  await expect(page.locator('.menu-list')).toHaveCount(0)
  await expect.poll(() => focusedSid(page)).toBe(ids[1])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('2')
  await expect.poll(() => weights(page)).toEqual([3, 2])

  // Remove from the context menu keeps focus in the list
  await rows(page).nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  await expect(rows(page)).toHaveCount(1)
  await expect.poll(() => focusedSid(page)).toBe(ids[2])
  await page.keyboard.press('Delete')
  await expect(rows(page)).toHaveCount(0)
  await expect(panel(page).locator('.cbp-list')).toBeFocused()

  // Ctrl+A from a focused chip selects symptoms, not the page
  await page.locator('.toast-action', { hasText: 'Undo' }).last().click()
  await expect(rows(page)).toHaveCount(1)
  await panel(page).getByRole('tab').first().focus()
  await page.keyboard.press('Control+a')
  await expect(panel(page)).toContainText('1 selected')
  expect(await page.evaluate(() => String(window.getSelection()))).toBe('')
})

test('undo of a deleted clipboard restores it without undoing later edits; clear all', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000'])
  await panel(page).getByRole('button', { name: 'New clipboard' }).click()
  await page.keyboard.type('Mentals')
  await page.keyboard.press('Enter')
  await dropRubrics(page, ['publicum:30000'])
  const chips = panel(page).getByRole('tab')
  await chips.nth(1).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete clipboard' }).click()
  // it holds a symptom: confirm first
  const confirm = page.getByRole('dialog', { name: 'Delete clipboard' })
  await expect(confirm).toContainText('Delete Mentals and its 1 symptom?')
  await confirm.getByRole('button', { name: 'Delete clipboard' }).click()
  await expect(chips).toHaveCount(1)
  // focus stays in the clipboard pane (the remaining chip), not on the page body
  await expect(chips.nth(0)).toBeFocused()
  // a later edit
  await rows(page).nth(0).click()
  await page.keyboard.press('4')
  await page.locator('.toast', { hasText: 'Mentals deleted' }).locator('.toast-action').click()
  await expect(chips).toHaveCount(2)
  await expect(chips.nth(1)).toContainText('Mentals')
  await expect(chips.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(rows(page)).toHaveCount(1)
  await page.keyboard.press('Alt+1')
  await expect.poll(() => weights(page)).toEqual([4, 1])

  // Clear all clipboards from the chip menu, then undo
  await chips.nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Clear all clipboards' }).click()
  const clearAll = page.getByRole('dialog', { name: 'Clear all clipboards' })
  await expect(clearAll).toContainText('Remove all 3 symptoms from 2 clipboards?')
  await clearAll.getByRole('button', { name: 'Clear all' }).click()
  await expect(chips.nth(0).locator('.cbp-chip-count')).toHaveText('0')
  await expect(chips.nth(1).locator('.cbp-chip-count')).toHaveText('0')
  await page.locator('.toast', { hasText: 'All clipboards cleared' }).locator('.toast-action').click()
  await expect(chips.nth(0).locator('.cbp-chip-count')).toHaveText('2')
  await expect(chips.nth(1).locator('.cbp-chip-count')).toHaveText('1')
})

test('case menu keeps its actions reachable with many patients', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await newCase(page)
  await panel(page).getByRole('button', { name: 'Switch case' }).click()
  const menu = page.getByRole('menu', { name: 'Cases' })
  const box = (await menu.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(720)
  for (const name of ['New case…', 'New consultation for this patient', 'Open patient file', 'Close case']) {
    await expect(menu.getByRole('menuitem', { name })).toBeInViewport()
  }
  await menu.getByRole('menuitem', { name: 'New consultation for this patient' }).click()
  await expect(panel(page).locator('.cbp-case-cons')).toContainText('Follow-up')
})

test('Alt+digit keeps keyboard focus in the list; Alt+PageDown reaches the tab strip', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000'])
  await panel(page).getByRole('button', { name: 'New clipboard' }).click()
  await page.keyboard.press('Enter')
  await dropRubrics(page, ['publicum:30000'])
  await page.keyboard.press('Alt+1')
  await rows(page).nth(1).click()
  await page.keyboard.press('Alt+2')
  await expect(panel(page).getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(rows(page).nth(0)).toBeFocused()
  await page.keyboard.press('Alt+1')
  await expect(rows(page).nth(0)).toBeFocused()
  // modified paging keys are not swallowed by the list: they switch tabs
  const active = () => page.locator('.tab.active').first().innerText()
  const before = await active()
  await page.keyboard.press('Alt+PageDown')
  await expect.poll(active).not.toBe(before)
  await page.keyboard.press('Alt+PageUp')
  await expect.poll(active).toBe(before)
})

test('badges pick readable text per clipboard colour; the footer is not a page landmark', async ({ page }) => {
  await newCase(page)
  for (let i = 0; i < 4; i++) {
    await panel(page).getByRole('button', { name: 'New clipboard' }).click()
    await page.keyboard.press('Enter')
  }
  const fg = (i: number) => panel(page).locator('.cbp-chip-num').nth(i).evaluate(el => getComputedStyle(el).color)
  expect(await fg(0)).toBe('rgb(255, 255, 255)') // blue
  expect(await fg(2)).toBe('rgb(28, 33, 41)') // green
  expect(await fg(3)).toBe('rgb(28, 33, 41)') // amber
  expect(await fg(4)).toBe('rgb(255, 255, 255)') // purple
  await expect(panel(page).locator('footer')).toHaveCount(0)
  await expect(panel(page).locator('.cbp-foot')).toBeVisible()
})

test('rows of a repertory still loading show a loading state, then the rubric', async ({ page }) => {
  await page.evaluate(async () => {
    const { actions } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    actions.addRubrics(['kent-de:1200'])
  })
  await expect(rows(page).last()).toContainText(/gemüt/i)
  await waitForSaved(page)
  let release: () => void = () => {}
  await page.route(/rep-kent-de\.json/, async route => { await new Promise<void>(r => { release = r }); await route.continue() })
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  const last = rows(page).last()
  await expect(last.locator('.cbp-loading')).toContainText('Loading Kent')
  await expect(last).not.toContainText('kent-de:1200')
  await expect(last).toHaveAttribute('aria-label', /loading/)
  release()
  await expect(last).toContainText(/gemüt/i)
  await expect(last.locator('.cbp-loading')).toHaveCount(0)
})

test('rubric drops are standard takes: one undo step, recents, toast; the drop point is kept', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000'])
  await expect(rows(page)).toHaveCount(2)
  await expect(page.locator('.toast').last()).toContainText(/Taken 2 rubrics/)
  const first = await rows(page).evaluateAll(els => els.map(e => (e as HTMLElement).dataset.sid))
  // drop two more onto the top half of the first row: they land before it
  await page.evaluate(() => {
    const el = document.querySelector('.cbp-row')!
    const r = el.getBoundingClientRect()
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', 'publicum:30000 publicum:31000')
    for (const type of ['dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + 2 }))
  })
  await expect(rows(page)).toHaveCount(4)
  await expect.poll(() => rows(page).evaluateAll(els => els.map(e => (e as HTMLElement).dataset.sid).slice(2))).toEqual(first)
  // take + reorder is a single undo step
  await rows(page).nth(0).click()
  await page.keyboard.press('Control+z')
  await expect(rows(page)).toHaveCount(2)
  await expect.poll(() => rows(page).evaluateAll(els => els.map(e => (e as HTMLElement).dataset.sid))).toEqual(first)
  // a chip drop takes through the same path, into that clipboard
  await panel(page).getByRole('button', { name: 'New clipboard' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Alt+1')
  await dropRubrics(page, ['publicum:45000'], '.cbp-chip:nth-child(2)')
  await expect(page.locator('.toast').last()).toContainText(/Clipboard 2/)
  await expect(panel(page).getByRole('tab').nth(1).locator('.cbp-chip-count')).toHaveText('1')
  await page.locator('.toast').last().locator('.toast-action', { hasText: /Undo/ }).click()
  await expect(panel(page).getByRole('tab').nth(1).locator('.cbp-chip-count')).toHaveText('0')
})

test('group marker, live prompt region, excluded chip tooltip, wrapping rows', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000'])
  const prompt = panel(page).locator('.cbp-prompt')
  await expect(prompt).toHaveAttribute('role', 'status')
  await expect(prompt).toHaveText('')
  await rows(page).nth(1).click()
  await page.keyboard.press('g')
  await expect(prompt).toContainText('Group: press a letter a–z')
  await page.keyboard.press('D')
  await expect(prompt).toHaveText('')
  const marker = rows(page).nth(1).locator('.f-g')
  await expect(marker).toHaveText('d')
  const box = (await marker.boundingBox())!
  expect(Math.abs(box.width - box.height)).toBeLessThan(4)
  // Ctrl+click takes the clipboard out of the analysis: the chip says how to bring it back
  const chip = panel(page).getByRole('tab').first()
  await chip.click({ modifiers: ['Control'] })
  await expect(chip).toHaveAttribute('title', /Not included in the analysis \(click it in the analysis toolbar to include\)/)
  // long rubric paths wrap instead of being cut off
  await dropRubrics(page, ['publicum:30000'])
  const path = rows(page).nth(2).locator('.cbp-path')
  await expect(path).toContainText('inguinal region, evening')
  const m = await path.evaluate(e => ({ lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)), clipped: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1 }))
  expect(m.lines).toBeGreaterThan(1)
  expect(m.clipped).toBe(false)
})

test('a repertory that fails to load can be retried from the clipboard', async ({ page }) => {
  await page.evaluate(async () => {
    const { actions } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    actions.addRubrics(['kent-de:1200'])
  })
  await expect(rows(page).last()).toContainText(/gemüt/i)
  await waitForSaved(page)
  let fail = true
  await page.route(/rep-kent-de\.json/, route => (fail ? route.abort() : route.continue()))
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  const warn = panel(page).locator('.cbp-warn')
  await expect(warn).toContainText('Could not load')
  fail = false
  await warn.getByRole('button', { name: 'Retry' }).click()
  await expect(warn).toHaveCount(0)
  await expect(rows(page).last()).toContainText(/gemüt/i)
})

test('the empty-state New case button draws its icon in the button colour', async ({ page }) => {
  await closeCase(page)
  const btn = panel(page).locator('.cbp-empty .btn-primary')
  const [stroke, color] = await btn.locator('svg').evaluate(e => [getComputedStyle(e).stroke, getComputedStyle(e.closest('button')!).color])
  expect(stroke).toBe(color)
})
