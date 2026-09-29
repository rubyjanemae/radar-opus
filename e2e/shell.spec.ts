import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('shell boots with menubar, toolbar, tabs and status bar', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Open documents' })).toBeVisible()
  await expect(page.getByLabel('Status')).toContainText('rubrics')
})
