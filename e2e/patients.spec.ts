import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, SEEDED } from './helpers'

const list = (page: Page) => page.getByTestId('patients-view')
const rows = (page: Page) => list(page).locator('.pt-body .pt-row')

async function openPatients(page: Page) {
  await page.keyboard.press('Control+3')
  await expect(list(page)).toBeVisible()
}

/** Open the seeded Pulsatilla archetype (the active case). */
async function openActivePatient(page: Page) {
  await openPatients(page)
  await rows(page).filter({ has: page.locator('.pt-active-dot') }).dblclick()
  await expect(page.getByTestId('patient-view')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await openApp(page, SEEDED)
})

test('first run seeds a practice, the repertory and the patients tab, with an active case', async ({ page }) => {
  await expect(page.locator('.tab', { hasText: 'Patients' })).toBeVisible()
  await openPatients(page)
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')
  // the clipboard panel shows the active case
  await expect(page.getByTestId('clipboard-panel')).not.toContainText('No active case')
})

test('search, tag filter and sorting', async ({ page }) => {
  await openPatients(page)
  const search = page.getByLabel('Search patients')
  await search.fill('zzzz-nobody')
  await expect(list(page)).toContainText('No patients match')
  await list(page).getByRole('button', { name: 'Clear filters' }).click()
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')

  await list(page).getByRole('button', { name: /^paediatric/ }).click()
  const status = await list(page).locator('.pt-list-status').innerText()
  const n = Number(/(\d+) of 45/.exec(status)?.[1])
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThan(45)
  for (const tags of await rows(page).locator('.c-tags').allTextContents()) expect(tags).toContain('paediatric')
  await list(page).getByRole('button', { name: /^paediatric/ }).click()

  await list(page).getByRole('button', { name: 'Age' }).click()
  const ages = (await rows(page).locator('.c-age').allInnerTexts()).slice(0, 6).map(a => (a.includes('mo') ? 0 : Number(a)))
  expect([...ages].sort((a, b) => a - b)).toEqual(ages)
  await expect(list(page).getByRole('columnheader', { name: 'Age' })).toHaveAttribute('aria-sort', 'ascending')
})

test('keyboard navigation opens a patient; Shift+F10 opens the row menu', async ({ page }) => {
  await openPatients(page)
  await list(page).locator('.pt-table').focus()
  await page.keyboard.press('ArrowDown')
  const second = await rows(page).nth(1).locator('.pt-name').innerText()
  await expect(rows(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menu')).toContainText('New consultation')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('patient-view').locator('.pt-head-name')).toHaveText(second)
})

test('new patient: validation, then a first consultation opens', async ({ page }) => {
  await page.keyboard.press('Control+Alt+N')
  const dialog = page.getByRole('dialog', { name: 'New patient' })
  await dialog.getByRole('button', { name: 'Create patient' }).click()
  await expect(dialog).toContainText('Enter a first or last name')
  await dialog.getByLabel('First name').fill('Testa')
  await dialog.getByLabel('Last name').fill('Rossiter')
  await dialog.getByLabel('Email').fill('bad-email')
  await dialog.getByRole('button', { name: 'Create patient' }).click()
  await expect(dialog).toContainText('Not a valid email address')
  await dialog.getByLabel('Email').fill('testa@example.com')
  await dialog.getByLabel('Add tag').fill('migraine')
  await dialog.getByLabel('Add tag').press('Enter')
  await dialog.getByRole('button', { name: 'Create patient' }).click()
  const view = page.getByTestId('patient-view')
  await expect(view.locator('.pt-head-name')).toHaveText('Rossiter, Testa')
  await expect(view.locator('.pt-head-meta')).toContainText('migraine')
  await expect(page.getByTestId('consultation-editor')).toBeVisible()
  await expect(page.locator('.pt-ed-title-input')).toHaveValue('First consultation')
  // new consultation is the active case
  await expect(page.locator('.pt-tl-item.selected')).toContainText('Active')
})

test('editing a consultation autosaves and prescriptions can be added and removed', async ({ page }) => {
  await openActivePatient(page)
  const title = page.locator('.pt-ed-title-input')
  await title.fill('Revised follow-up')
  await title.press('Tab')
  await expect(page.locator('.pt-tl-item.selected .pt-tl-title')).toHaveText('Revised follow-up')

  const editor = page.getByTestId('consultation-editor')
  const before = await editor.locator('.pt-rx-table .pt-rx-row:not(.pt-rx-th)').count()
  const remedy = editor.getByRole('combobox', { name: 'Remedy' })
  await remedy.fill('sil')
  await expect(editor.locator('.pt-combo-list').getByRole('option').first()).toContainText('Sil')
  await remedy.press('Enter')
  await editor.getByLabel('Potency', { exact: true }).fill('LM1')
  await editor.getByLabel('Dosage').fill('5 drops daily')
  await editor.getByLabel('Dosage').press('Enter')
  await expect(editor.locator('.pt-rx-table .pt-rx-row:not(.pt-rx-th)')).toHaveCount(before + 1)
  await expect(editor.locator('.pt-rx-table')).toContainText('LM1')
  await editor.getByRole('button', { name: 'Remove Sil LM1' }).click()
  await expect(editor.locator('.pt-rx-table .pt-rx-row:not(.pt-rx-th)')).toHaveCount(before)

  // details: inline validation keeps invalid values out of the record
  await page.getByRole('tab', { name: 'Details' }).click()
  const email = page.getByTestId('patient-details').getByLabel('Email')
  await email.fill('broken@')
  await expect(page.getByTestId('patient-details')).toContainText('Not a valid email address')
  await email.fill('new.address@example.com')
  await email.press('Enter')
  await page.getByRole('tab', { name: /Consultations/ }).click()
  await page.getByRole('tab', { name: 'Details' }).click()
  await expect(page.getByTestId('patient-details').getByLabel('Email')).toHaveValue('new.address@example.com')
})

test('top remedies, follow-up and make active case', async ({ page }) => {
  await openActivePatient(page)
  const editor = page.getByTestId('consultation-editor')
  await expect(editor.locator('.pt-top li').first()).toContainText('Puls')
  const symptoms = await editor.locator('.pt-card-head .badge').first().innerText()
  const count = await page.locator('.pt-tl-item').count()
  await editor.getByRole('button', { name: 'New follow-up' }).click()
  await expect(page.locator('.pt-tl-item')).toHaveCount(count + 1)
  await expect(page.locator('.pt-tl-item.selected')).toContainText('Active')
  await expect(page.getByTestId('consultation-editor').locator('.pt-card-head .badge').first()).toHaveText(symptoms)

  // select an older consultation and make it active
  await page.locator('.pt-tl-item').last().click()
  const btn = page.getByTestId('consultation-editor').getByRole('button', { name: 'Make active case' })
  await btn.click()
  await expect(page.getByTestId('consultation-editor').getByRole('button', { name: 'Active case' })).toBeDisabled()
  await expect(page.locator('.pt-tl-item').last()).toContainText('Active')
})

test('delete a patient with confirmation, then undo', async ({ page }) => {
  await openPatients(page)
  const name = await rows(page).first().locator('.pt-name').innerText()
  await rows(page).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete patient' })
  await expect(confirm).toContainText(name)
  await confirm.getByRole('button', { name: 'Delete patient' }).click()
  await expect(list(page).locator('.pt-list-status')).toContainText('44 patients')
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')
  await expect(rows(page).filter({ hasText: name })).toHaveCount(1)
})

test('export a case file and import it back as a new patient', async ({ page }) => {
  await openActivePatient(page)
  const name = await page.locator('.pt-head-name').innerText()
  const download = page.waitForEvent('download')
  await page.getByTestId('patient-view').getByRole('button', { name: 'Export' }).click()
  const file = await (await download).path()
  const json = JSON.parse(readFileSync(file!, 'utf8'))
  expect(json.format).toBe('radar-opus-case')
  expect(json.version).toBe(1)
  expect(json.consultations.length).toBeGreaterThan(0)
  expect(Object.values(json.rubrics)).toContain('Stomach, thirstless')

  await openPatients(page)
  const chooser = page.waitForEvent('filechooser')
  await list(page).getByRole('button', { name: 'Import' }).click()
  await (await chooser).setFiles(file!)
  const view = page.getByTestId('patient-view')
  await expect(view.locator('.pt-head-name')).toHaveText(name.replace(/^([^,]+),/, '$1 (imported),'))
  await expect(view.locator('.pt-head-meta')).toContainText('imported')
  await expect(page.locator('.pt-tl-item')).toHaveCount(json.consultations.length)
  await openPatients(page)
  await expect(list(page).locator('.pt-list-status')).toContainText('46 patients')
})

test('case report shows full rubric paths, top remedies and prescriptions', async ({ page }) => {
  await openActivePatient(page)
  await page.getByTestId('consultation-editor').getByRole('button', { name: 'Case report' }).click()
  const report = page.getByRole('dialog', { name: 'Case report' })
  await expect(report.locator('.pt-report h1')).toHaveText(await page.locator('.pt-head-name').innerText())
  await expect(report).toContainText('STOMACH - thirstless')
  await expect(report).toContainText('GENERALITIES - air, open, amel.')
  await expect(report.locator('.pt-rp-top tbody tr')).toHaveCount(10)
  await expect(report.locator('.pt-rp-top tbody tr').first()).toContainText('Puls')
  await expect(report).toContainText('Prescriptions')
  await expect(report.getByRole('button', { name: 'Print…' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(report).toBeHidden()
})

test('?seed=empty starts without demo patients and shows the empty state', async ({ page }) => {
  await openApp(page, '/?seed=empty')
  await openPatients(page)
  await expect(list(page)).toContainText('No patients yet')
})

test('Ctrl+3 puts the caret in the search box; ↓ and Enter open a patient without the mouse', async ({ page }) => {
  await page.keyboard.press('Control+3')
  await expect(page.getByLabel('Search patients')).toBeFocused()
  await page.keyboard.type('thirstless') // rubric text of the clipboards is searchable
  await expect(list(page).locator('.pt-list-status')).toContainText(/\d+ of 45 patients/)
  await page.keyboard.press('ArrowDown')
  await expect(list(page).locator('.pt-table')).toBeFocused()
  const first = await rows(page).first().locator('.pt-name').innerText()
  await expect(list(page).locator('.pt-table')).toHaveAttribute('aria-activedescendant', /pt-row-/)
  await expect(rows(page).first()).toHaveAttribute('aria-rowindex', '2')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('patient-view').locator('.pt-head-name')).toHaveText(first)
})

test('list and consultation editor fit a 1152×720 window with both side panes open', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await openPatients(page)
  const spill = await list(page).evaluate(el => {
    const r = el.getBoundingClientRect()
    return [...el.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > r.right + 0.5 && getComputedStyle(e).visibility !== 'hidden' }).length
  })
  expect(spill).toBe(0)
  const body = await list(page).locator('.pt-body').evaluate(el => el.scrollWidth - el.clientWidth)
  expect(body).toBeLessThanOrEqual(0)
  await rows(page).filter({ has: page.locator('.pt-active-dot') }).dblclick()
  const editor = page.getByTestId('consultation-editor')
  const title = await editor.locator('.pt-ed-title-input').boundingBox()
  expect(title!.width).toBeGreaterThan(200)
  const over = await editor.locator('.pt-ed-scroll').evaluate(el => el.scrollWidth - el.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
})

test('follow-ups record the response to the previous remedy (GHHOS)', async ({ page }) => {
  await openActivePatient(page)
  const editor = page.getByTestId('consultation-editor')
  const scale = editor.getByRole('radiogroup', { name: /Glasgow/ })
  await expect(editor.getByLabel('Response to the previous prescription')).toContainText('Evaluating Puls')
  await scale.getByRole('radio', { name: /^\+3 / }).click()
  await expect(scale.getByRole('radio', { name: /^\+3 / })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(scale.getByRole('radio', { name: /^\+4 / })).toHaveAttribute('aria-checked', 'true')
  await expect(scale.getByRole('radio', { name: /^\+4 / })).toBeFocused()
  await expect(page.locator('.pt-tl-item.selected .pt-tl-resp')).toHaveText('+4')
})

test('case report: remedies table lays out as a table and the preview scrolls with the keyboard', async ({ page }) => {
  await openActivePatient(page)
  await page.getByTestId('consultation-editor').getByRole('button', { name: 'Case report' }).click()
  const report = page.getByRole('dialog', { name: 'Case report' })
  await expect(report.locator('.pt-rp-top')).toHaveCSS('display', 'table')
  const scroller = report.getByRole('region', { name: /Report preview/ })
  await expect(scroller).toBeFocused()
  await page.keyboard.press('PageDown')
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(100)
  await page.keyboard.press('Tab')
  await expect(report.getByRole('button', { name: 'Print…' })).toBeFocused()
  await page.keyboard.press('Home') // reading keys still scroll the paper from the toolbar
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0)
})
