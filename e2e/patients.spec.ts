import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, SEEDED, waitForSaved, withinBudget } from './helpers'

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
  await expect(page.locator('.tab-doc[data-active]').getByTestId('patient-view')).toBeVisible()
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
  // sorting renders in a transition: wait for it before reading the rows
  await expect(list(page).getByRole('columnheader', { name: 'Age' })).toHaveAttribute('aria-sort', 'ascending')
  await expect.poll(async () => {
    const ages = (await rows(page).locator('.c-age').allInnerTexts()).slice(0, 6).map(a => (a.includes('mo') ? 0 : Number(a)))
    return [...ages].sort((a, b) => a - b).join() === ages.join()
  }).toBe(true)
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
  await expect(page.locator('.tab-doc[data-active]').getByTestId('patient-view').locator('.pt-head-name')).toHaveText(second)
})

test('new patient: validation, then a first consultation opens', async ({ page }) => {
  await page.keyboard.press('Control+Alt+N')
  const dialog = page.getByRole('dialog', { name: 'New patient' })
  // surname first, focused on open, Tab moves to the first name ('Surname, First' order)
  await expect(dialog.getByLabel('Last name')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByLabel('First name')).toBeFocused()
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
  const view = page.locator('.tab-doc[data-active]').getByTestId('patient-view')
  await expect(view.locator('.pt-head-name')).toHaveText('Rossiter, Testa')
  await expect(view.locator('.pt-head-meta')).toContainText('migraine')
  await expect(page.getByTestId('consultation-editor')).toBeVisible()
  await expect(page.locator('.pt-ed-title-input')).toHaveValue('First consultation')
  // new consultation is the active case
  await expect(page.locator('.pt-tl-item.selected')).toContainText('Active')
  // the title is filled in: the caret waits in the chief complaint
  await expect(page.locator('.pt-ed-complaint-input')).toBeFocused()
  // patient and first consultation are one undo step
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Control+z')
  await expect(page.locator('.toast').last()).toContainText('Undone: New patient')
  await page.keyboard.press('Control+3')
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')
})

test('text typed just before the page is hidden or reloaded commits at once and is saved', async ({ page }) => {
  await openActivePatient(page)
  const complaint = page.locator('.pt-ed-complaint-input')
  await complaint.fill('Typed right before reload')
  // well inside the 600 ms idle delay: pagehide commits the draft synchronously and asks autosave to write
  const committed = await page.evaluate(async () => {
    const { useApp } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    const s = () => useApp.getState()
    window.dispatchEvent(new Event('pagehide'))
    return s().consultations[s().activeConsultationId!].complaint
  })
  expect(committed).toBe('Typed right before reload')
  await waitForSaved(page)
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  await openActivePatient(page)
  await expect(page.locator('.pt-ed-complaint-input')).toHaveValue('Typed right before reload')
})

test('deleting the active consultation leaves no active case', async ({ page }) => {
  await openActivePatient(page)
  await page.keyboard.press('F8') // open the analysis of the active case, so its tab closes on delete
  await openActivePatient(page)
  await page.locator('.pt-tl-item.selected').click()
  await page.getByTestId('consultation-editor').getByRole('button', { name: 'Delete consultation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete consultation' })
  await expect(dialog).toContainText('It is the active case')
  await expect(dialog).toContainText('Its analysis tab will close')
  await dialog.getByRole('button', { name: 'Delete consultation' }).click()
  await expect(page.locator('.toast').last()).toContainText('no case is active now')
  await expect(page.getByTestId('clipboard-panel')).toContainText('No active case')
  await expect(page.locator('.pt-tl-item .pt-active-pill')).toHaveCount(0)
})

test('switching to the patients tab from the tab strip keeps focus on the tab', async ({ page }) => {
  await openPatients(page)
  await expect(page.getByLabel('Search patients')).toBeFocused()
  const tabs = page.getByRole('tablist', { name: 'Open documents' })
  const patientsTab = tabs.getByRole('tab', { name: /Patients/ })
  // arrow away from Patients and back: focus stays in the tab strip
  await patientsTab.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(patientsTab).toHaveAttribute('aria-selected', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(patientsTab).toHaveAttribute('aria-selected', 'true')
  await expect(patientsTab).toBeFocused()
  await expect(page.getByLabel('Search patients')).not.toBeFocused()
  // Enter moves into the panel
  await page.keyboard.press('Enter')
  await expect(list(page).locator('.pt-table')).toBeFocused()
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

test('export a case file and import it back: the patient on file asks replace, merge or keep both', async ({ page }) => {
  await openActivePatient(page)
  const name = await page.locator('.pt-head-name').innerText()
  const download = page.waitForEvent('download')
  await page.locator('.tab-doc[data-active]').getByTestId('patient-view').getByRole('button', { name: 'Export' }).click()
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
  // the same record is on file: the import asks instead of renaming anything
  const ask = page.getByRole('dialog', { name: 'Patient already on file' })
  await expect(ask).toContainText(name)
  await expect(ask.getByRole('button', { name: 'Merge consultations' })).toBeFocused()
  // merge: every consultation is already there, nothing is duplicated
  await ask.getByRole('button', { name: 'Merge consultations' }).click()
  await expect(page.locator('.toast').last()).toContainText('already on file')
  const view = page.locator('.tab-doc[data-active]').getByTestId('patient-view')
  await expect(view.locator('.pt-head-name')).toHaveText(name)
  await expect(page.locator('.pt-tl-item')).toHaveCount(json.consultations.length)
  await openPatients(page)
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')

  // keep both: a second record with the same name (never "(imported)")
  const chooser2 = page.waitForEvent('filechooser')
  await list(page).getByRole('button', { name: 'Import' }).click()
  await (await chooser2).setFiles(file!)
  await page.getByRole('dialog', { name: 'Patient already on file' }).getByRole('button', { name: 'Keep both' }).click()
  await expect(view.locator('.pt-head-name')).toHaveText(name)
  await expect(view.locator('.pt-head-meta')).toContainText('imported')
  await expect(view.locator('.pt-tl-item')).toHaveCount(json.consultations.length)
  await openPatients(page)
  await expect(list(page).locator('.pt-list-status')).toContainText('46 patients')
  await expect(rows(page).filter({ hasText: name })).toHaveCount(2)
})

test('import with replace overwrites the record on file in one undo step', async ({ page }) => {
  await openActivePatient(page)
  const name = await page.locator('.pt-head-name').innerText()
  const download = page.waitForEvent('download')
  await page.locator('.tab-doc[data-active]').getByTestId('patient-view').getByRole('button', { name: 'Export' }).click()
  const file = await (await download).path()
  // change the record on file, then replace it from the case file
  await page.getByRole('tab', { name: 'Details' }).click()
  const occupation = page.getByTestId('patient-details').getByLabel('Occupation')
  const before = await occupation.inputValue()
  await occupation.fill('Changed here')
  await occupation.press('Enter')
  const chooser = page.waitForEvent('filechooser')
  await page.evaluate(() => document.querySelector<HTMLElement>('body')?.focus())
  await page.keyboard.press('Control+3')
  await list(page).getByRole('button', { name: 'Import' }).click()
  await (await chooser).setFiles(file!)
  await page.getByRole('dialog', { name: 'Patient already on file' }).getByRole('button', { name: 'Replace' }).click()
  await expect(page.locator('.toast').last()).toContainText('Replaced')
  await page.getByRole('tab', { name: 'Details' }).click()
  await expect(page.getByTestId('patient-details').getByLabel('Occupation')).toHaveValue(before)
  await expect(page.locator('.pt-head-name')).toHaveText(name)
  await page.keyboard.press('Control+3')
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')
})

test('deleting a patient from its own page lands on the table; Ctrl+Z restores it', async ({ page }) => {
  await openActivePatient(page)
  const name = await page.locator('.pt-head-name').innerText()
  await page.getByRole('button', { name: 'More patient actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete patient…' }).click()
  await page.getByRole('dialog', { name: 'Delete patient' }).getByRole('button', { name: 'Delete patient' }).click()
  await expect(list(page).locator('.pt-table')).toBeFocused()
  await expect(list(page).locator('.pt-list-status')).toContainText('44 patients')
  await page.keyboard.press('Control+z')
  // undo brings the patient back, with its page
  await expect(page.locator('.tab-doc[data-active]').getByTestId('patient-view').locator('.pt-head-name')).toHaveText(name)
  await openPatients(page)
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')
})

test('Ctrl+Z in the empty or unchanged patients search field is the app undo', async ({ page }) => {
  await openPatients(page)
  const name = await rows(page).first().locator('.pt-name').innerText()
  await rows(page).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  await page.getByRole('dialog', { name: 'Delete patient' }).getByRole('button', { name: 'Delete patient' }).click()
  await expect(list(page).locator('.pt-list-status')).toContainText('44 patients')
  const search = page.getByLabel('Search patients')
  await search.focus()
  await page.keyboard.press('Control+z')
  await expect(list(page).locator('.pt-list-status')).toContainText('45 patients')
  await expect(rows(page).filter({ hasText: name })).toHaveCount(1)
  // once the query was edited, Ctrl+Z is the field's own undo (the app history is untouched)
  await search.focus()
  await page.keyboard.type('ab')
  await page.keyboard.press('Control+z')
  await expect(list(page).locator('.pt-list-status')).toContainText(/of 45 patients|45 patients/)
  await expect(list(page).locator('.pt-list-status')).not.toContainText('44')
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

test('after printing the case report the frame goes and Esc still closes the report', async ({ page }) => {
  // the print dialog cannot be driven headless: print() reports afterprint at once in every frame
  await page.addInitScript(() => { window.print = function (this: Window) { setTimeout(() => this.dispatchEvent(new Event('afterprint')), 50) } })
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  await openActivePatient(page)
  await page.getByTestId('consultation-editor').getByRole('button', { name: 'Case report' }).click()
  const report = page.getByRole('dialog', { name: 'Case report' })
  const print = report.getByRole('button', { name: 'Print…' })
  await expect(print).toBeEnabled()
  await print.click()
  await expect(page.locator('iframe.pt-print-frame')).toHaveCount(0)
  await expect(print).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(report).toBeHidden()
})

test('?seed=empty starts without demo patients and shows the empty state', async ({ browser }) => {
  // a fresh context: the beforeEach run above already saved the demo practice in this page's storage
  const context = await browser.newContext()
  const page = await context.newPage()
  await openApp(page, '/?seed=empty')
  await openPatients(page)
  await expect(list(page)).toContainText('No patients yet')
  await context.close()
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
  await expect(page.locator('.tab-doc[data-active]').getByTestId('patient-view').locator('.pt-head-name')).toHaveText(first)
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

test('timeline top remedies follow the minimum grade shown, like the analysis', async ({ page }) => {
  await openActivePatient(page)
  const editor = page.getByTestId('consultation-editor')
  const agree = async () => {
    const abbrevs = (await editor.locator('.pt-top .pt-top-abbrev').allInnerTexts()).slice(0, 3).map(t => t.replace(' ◆', '').trim())
    await expect(page.locator('.pt-tl-item.selected .pt-tl-top')).toContainText(abbrevs.join(' · '))
  }
  await agree()
  await page.keyboard.press('Control+Comma')
  await page.getByRole('tab', { name: 'Repertory' }).click()
  await page.getByRole('radio', { name: 'Grade 3+' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await agree()
})

for (const theme of ['light', 'dark'] as const) {
  test(`the chosen response score reads at 4.5:1 or better (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await openActivePatient(page)
    const scale = page.getByTestId('consultation-editor').getByRole('radiogroup', { name: /Glasgow/ })
    for (const name of [/^\+3 /, /^[−-]2 /, /^0 /]) {
      const btn = scale.getByRole('radio', { name })
      await btn.click()
      await page.mouse.move(0, 0)
      const ratio = await btn.evaluate(el => {
        const c = document.createElement('canvas').getContext('2d')!
        const rgb = (v: string) => { c.clearRect(0, 0, 1, 1); c.fillStyle = v; c.fillRect(0, 0, 1, 1); return Array.from(c.getImageData(0, 0, 1, 1).data) }
        const base = rgb(getComputedStyle(document.body).backgroundColor)
        let bg = base
        const chain: Element[] = []; for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
        for (const e of chain) { const [r, g, b, a] = rgb(getComputedStyle(e).backgroundColor); const t = a / 255; bg = [r * t + bg[0] * (1 - t), g * t + bg[1] * (1 - t), b * t + bg[2] * (1 - t), 255] }
        const fg = rgb(getComputedStyle(el).color)
        const L = (p: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]) }
        const [a, b] = [L(fg), L(bg)].sort((x, y) => y - x)
        return (a + 0.05) / (b + 0.05)
      })
      expect(ratio, `${name} in ${theme}`).toBeGreaterThanOrEqual(4.5)
    }
  })
}

test('case report: remedies table lays out as a table and the preview scrolls with the keyboard', async ({ page }) => {
  await openActivePatient(page)
  await page.getByTestId('consultation-editor').getByRole('button', { name: 'Case report' }).click()
  const report = page.getByRole('dialog', { name: 'Case report' })
  await expect(report.locator('.pt-rp-top')).toHaveCSS('display', 'table')
  const scroller = report.getByRole('region', { name: /Report preview/ })
  await expect(scroller).toBeFocused()
  await page.keyboard.press('PageDown')
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(100)
  // native PageDown scrolls smoothly: let it finish, or its remaining frames overtake the Home below
  await expect.poll(() => scroller.evaluate(el => new Promise<boolean>(res => {
    const top = el.scrollTop
    setTimeout(() => res(el.scrollTop === top), 150)
  }))).toBe(true)
  await page.keyboard.press('Tab')
  await expect(report.getByRole('button', { name: 'Print…' })).toBeFocused()
  await page.keyboard.press('Home') // reading keys still scroll the paper from the toolbar
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0)
})

test('Ctrl+Alt+P brings the prescription form into view, prefilled with the analysis remedy', async ({ page }) => {
  await openActivePatient(page)
  await page.keyboard.press('Control+Alt+p')
  const input = page.getByTestId('consultation-editor').getByRole('combobox', { name: 'Remedy' })
  await expect(input).toBeFocused()
  const top = (await page.locator('.pt-top li').first().locator('.pt-top-abbrev').innerText()).replace(/[^\w-]/g, '')
  await expect(input).toHaveValue(top)
  const inView = await page.evaluate(() => {
    const f = document.querySelector('.pt-rx-form')!.getBoundingClientRect(), s = document.querySelector('.pt-ed-scroll')!.getBoundingClientRect()
    return f.top >= s.top - 1 && f.bottom <= s.bottom + 1
  })
  expect(inView).toBe(true)
  // from an analysis with a remedy selected, Ctrl+Alt+P prescribes that remedy
  const sep = await page.evaluate(async () => {
    const rows = await (await fetch('/data/remedies.json')).json() as unknown
    const list = (Array.isArray(rows) ? rows : (rows as { remedies: unknown[] }).remedies) as [number, string][]
    const hit = list.find(r => String(r[1]).toLowerCase() === 'sep')!
    const { actions, useApp } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    const cid = useApp.getState().activeConsultationId!
    actions.openTab({ kind: 'analysis', consultationId: cid })
    const tab = useApp.getState().tabs.find(t => t.kind === 'analysis' && t.consultationId === cid)!
    actions.updateTab(tab.id, { remedy: hit[0] } as never)
    return String(hit[1])
  })
  await expect(page.locator('.tab-doc[data-active]').getByTestId('patient-view')).toBeHidden()
  await page.keyboard.press('Control+Alt+p')
  await expect(input).toHaveValue(sep)
  await expect(input).toBeFocused()
})

test('top remedies and the case report state the analysis filters', async ({ page }) => {
  await openActivePatient(page)
  await page.evaluate(async () => {
    const { actions, useApp } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    actions.setAnalysis(useApp.getState().activeConsultationId!, { minCoverage: 2, highlight: [945], highlightLabel: 'Pulsatilla group', excludedRemedies: [5] })
  })
  const notes = page.getByTestId('top-filters')
  await expect(notes).toContainText('Highlighting Pulsatilla group')
  await expect(notes).toContainText('Minimum coverage 2 symptoms')
  await expect(notes).toContainText('Excluding')
  await page.getByTestId('consultation-editor').getByRole('button', { name: 'Case report' }).click()
  const report = page.getByRole('dialog', { name: 'Case report' })
  await expect(report.locator('.pt-rp-filters').first()).toContainText('Highlighting Pulsatilla group · Excluding')
  await expect(report.locator('.pt-rp-filters').first()).toContainText('Minimum coverage 2 symptoms')
})

test('2,000 patients: the list opens and sorts quickly', async ({ page }) => {
  await page.evaluate(async () => {
    const { actions } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    const now = Date.now()
    const ps = [], cs = []
    for (let i = 0; i < 2000; i++) {
      const id = `bulk${i}`
      ps.push({ id, firstName: `First${i}`, lastName: `Bulk${(i * 7919) % 2000}`, birthDate: `19${50 + (i % 50)}-0${1 + (i % 9)}-1${i % 9}`, sex: i % 2 ? 'male' : 'female', email: '', phone: '', address: '', occupation: '', notes: 'bulk', tags: i % 3 ? ['bulk'] : [], createdAt: now, updatedAt: now })
      for (let k = 0; k < 3; k++) cs.push({ id: `${id}-c${k}`, patientId: id, date: `2025-0${1 + k}-1${i % 9}`, title: `Visit ${k}`, kind: 'follow-up', complaint: '', notes: '', assessment: '', clipboards: [{ id: `${id}-cb${k}`, name: 'Clipboard 1', color: '#2f6fdb', symptoms: [{ id: `${id}-s${k}`, rubrics: ['publicum:100'], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: now }] }], analysis: { strategy: 'sum-symptoms-degrees', clipboardIds: [`${id}-cb${k}`], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 30 }, prescriptions: [{ id: `${id}-rx${k}`, remedyId: 945, potency: '30C', dosage: '', date: `2025-0${1 + k}-10`, note: '' }], createdAt: now, updatedAt: now })
    }
    actions.insertCaseData(ps as never, cs as never)
  })
  // open: from the command to the painted list (view module preloaded, as after the first open)
  const openMs = await page.evaluate(async () => {
    const { runCommand } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.registry()
    await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.patientsView()
    const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const t = performance.now()
    runCommand('patients.open')
    while (!document.querySelector('.pt-list .pt-body .pt-row')) await raf2()
    return performance.now() - t
  })
  await expect(list(page).locator('.pt-list-status')).toContainText('2045 patients')
  // sort by each column: the header click commits within a frame budget
  const sortMs = await withinBudget(() => page.evaluate(async () => {
    const times: number[] = []
    for (const label of ['Name', 'Age', 'Last prescription', 'Tags', 'Last visit']) {
      const btn = [...document.querySelectorAll<HTMLButtonElement>('.pt-sort')].find(b => b.textContent?.includes(label))!
      const t = performance.now()
      btn.click()
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      times.push(performance.now() - t)
    }
    return Math.max(...times)
  }), ms => expect(ms).toBeLessThan(500))
  // the derived rows and sort keys themselves (what scales with the practice size)
  const logicMs = await withinBudget(() => page.evaluate(async () => {
    const L = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.patientsLogic()
    const { useApp } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    const s = useApp.getState()
    const ab = (id: number) => String(id)
    L.patientRows(s.patients, s.consultations, ab)
    const t = performance.now()
    const rows = L.patientRows({ ...s.patients }, { ...s.consultations }, ab)
    for (const key of ['name', 'age', 'lastRx', 'tags', 'lastVisit'] as const) L.sortRows(rows, { key, dir: 1 })
    return performance.now() - t
  }), ms => expect(ms).toBeLessThan(120))
  console.log(`2,000 patients: open ${openMs.toFixed(0)} ms, slowest sort ${sortMs.toFixed(0)} ms, rows + 5 sorts ${logicMs.toFixed(0)} ms`)
  // generous bounds (each measured up to three times): this runs on React's development build, several
  // times slower than production, and alongside other suites; logic 120 ms, sort 500 ms, open 1 s
  expect(logicMs).toBeLessThan(120)
  expect(sortMs).toBeLessThan(500)
  expect(openMs).toBeLessThan(1000)
  // reactivation: switch to another tab and back; the sorted list is reused, not rebuilt
  const reactivateMs = await withinBudget(() => page.evaluate(async () => {
    const { actions, useApp } = await (window as unknown as { __radarModules: import('../src/e2eBridge').E2EModules }).__radarModules.store()
    const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    // kept-alive tabs stay mounted but hidden: "shown" means a laid-out row
    const shown = () => { const r = document.querySelector<HTMLElement>('.pt-list .pt-body .pt-row'); return !!r && r.offsetParent !== null }
    const pt = useApp.getState().activeTabId!
    const other = useApp.getState().tabs.find(t => t.id !== pt)!
    actions.activateTab(other.id)
    while (shown()) await raf2()
    const t = performance.now()
    actions.activateTab(pt)
    while (!shown()) await new Promise(r => requestAnimationFrame(r))
    return performance.now() - t
  }), ms => expect(ms).toBeLessThan(400))
  console.log(`2,000 patients: reactivate ${reactivateMs.toFixed(0)} ms`)
  // only the visible window of rows is in the DOM
  expect(await list(page).locator('.pt-body .pt-row').count()).toBeLessThan(120)
  const search = page.getByLabel('Search patients')
  await expect(search).toHaveAttribute('aria-controls', 'pt-grid')
  await expect(page.locator('#pt-grid')).toHaveAttribute('role', 'grid')
  await search.fill('thirstless')
  await expect(list(page).locator('.pt-list-status')).toContainText(/\d+ of 2045 patients/)
})

test('patients list and patient page pass axe (contrast, scroll regions, landmarks) in both themes', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await openPatients(page)
    const list = await new AxeBuilder({ page }).include('[data-testid="patients-view"]').withRules(['color-contrast', 'scrollable-region-focusable']).analyze()
    expect(list.violations.map(v => `${scheme} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
    await rows(page).filter({ has: page.locator('.pt-active-dot') }).dblclick()
    const view = await new AxeBuilder({ page }).include('.pt-timeline').include('[data-testid="clipboard-panel"]').withRules(['color-contrast', 'landmark-unique', 'landmark-no-duplicate-contentinfo']).analyze()
    expect(view.violations.map(v => `${scheme} ${v.id}: ${v.nodes.map(n => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(', ')}`)).toEqual([])
  }
})

test('Alt+3 opens the patient list too', async ({ page }) => {
  await page.keyboard.press('Alt+3')
  await expect(list(page)).toBeVisible()
})
