import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const panel = (page: Page) => page.getByTestId('clipboard-panel')
const rows = (page: Page) => panel(page).locator('.cbp-row')

async function newCase(page: Page) {
  await panel(page).getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByLabel('First name').fill('Anna')
  await dialog.getByLabel('Last name').fill('Keller')
  await dialog.getByRole('button', { name: 'Create case' }).click()
  await expect(panel(page).locator('.cbp-case-patient')).toHaveText('Keller, Anna')
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
})

test('keyboard editing: intensity, qualifications, group, scoping', async ({ page }) => {
  await newCase(page)
  await dropRubrics(page, ['publicum:120', 'publicum:5000', 'publicum:30000'])
  await expect(rows(page)).toHaveCount(3)
  await expect(panel(page).getByRole('tab', { selected: true })).toContainText('3')

  await rows(page).nth(0).click()
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
  await expect(rows(page).nth(0)).toContainText('Intersection of 2 rubrics')

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
  await page.locator('.toast-action', { hasText: 'Undo' }).click()
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
  await expect(chips).toHaveCount(1)
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
