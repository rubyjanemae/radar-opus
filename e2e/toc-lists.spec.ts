import { expect, test } from '@playwright/test'
import { FRESH, openApp } from './helpers'

// The toolbar's list buttons are independent checkboxes (RadarOpus): a fresh start has Repertories,
// References and Patients checked with Patients in front. Checking a list brings it to the front and
// leaves the others checked; unchecking the list in front brings back the one behind it.
test('list buttons are independent checkboxes over a stack of lists', async ({ page }) => {
  await openApp(page, FRESH)
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  const btn = (name: string) => tbar.getByRole('button', { name, exact: true })
  const remedies = btn('Remedies')
  const toc = page.locator('.pane-left')
  for (const name of ['Repertories', 'References', 'Patients']) await expect(btn(name)).toHaveAttribute('aria-pressed', 'true')
  await expect(remedies).toHaveAttribute('aria-pressed', 'false')
  await remedies.click()
  await expect(remedies).toHaveAttribute('aria-pressed', 'true')
  await expect(btn('Patients')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Look for remedy:')).toBeVisible()
  // unchecking it leaves the table of contents open on the Patients list, still checked
  await remedies.click()
  await expect(remedies).toHaveAttribute('aria-pressed', 'false')
  await expect(btn('Patients')).toHaveAttribute('aria-pressed', 'true')
  await expect(toc).toHaveCount(1)
  await expect(page.getByLabel('Look for patient:')).toBeVisible()
  await remedies.click()
  await page.getByLabel('Look for remedy:').fill('puls')
  await page.getByLabel('Look for remedy:').press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab-main[aria-selected=true]')).toContainText('Pulsatilla')

  const families = btn('Families')
  await families.click()
  await expect(families).toHaveAttribute('aria-pressed', 'true')
  await expect(remedies).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('tree', { name: 'Search for a family' }).getByRole('treeitem').first()).toBeVisible()
  // Cmd+F2 hides and shows the table of contents on the same list
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(toc).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(families).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('tree', { name: 'Search for a family' })).toBeVisible()
  // unchecking Families brings back the remedy list opened before it
  await families.click()
  await expect(families).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByLabel('Look for remedy:')).toBeVisible()

  // a checked list behind the front one comes to the front with one click, staying checked
  const references = btn('References')
  await references.click()
  await expect(references).toHaveAttribute('aria-pressed', 'true')
  await expect(remedies).toHaveAttribute('aria-pressed', 'true')
  const refs = page.getByRole('tree', { name: 'Search for a reference' })
  await refs.getByRole('treeitem', { name: /BOERICKE/ }).dblclick()
  await expect(page.locator('.tab-main[aria-selected=true]')).toContainText('Materia medica')
})
