import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const view = (page: Page) => page.getByTestId('families-view')
const tree = (page: Page) => view(page).getByRole('tree', { name: 'Remedy families' })
const search = (page: Page) => view(page).getByLabel('Find families and remedies')
const RUBRICS = [191, 3746, 7862, 28493, 4529, 72742, 70571, 5699, 25192].map(i => `publicum:${i}`)

async function newCase(page: Page) {
  const panel = page.getByTestId('clipboard-panel')
  await panel.getByRole('button', { name: 'New case' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New case' })
  await dialog.getByLabel('First name').fill('Anna')
  await dialog.getByLabel('Last name').fill('Keller')
  await dialog.getByRole('button', { name: 'Create case' }).click()
  await page.evaluate(refs => {
    const el = document.querySelector('.cbp-list')!
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', refs.join('\n'))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, RUBRICS)
  await expect(panel.locator('.cbp-row')).toHaveCount(RUBRICS.length)
}

async function openFamilies(page: Page) {
  await page.keyboard.press('Control+5')
  await expect(tree(page)).toBeVisible({ timeout: 20_000 })
}

async function selectFamily(page: Page, name: string) {
  await search(page).fill(name)
  await search(page).press('Enter')
  await expect(view(page).locator('.fam-title h1')).toHaveText(name)
}

test.beforeEach(async ({ page }) => { await openApp(page) })

test('Ctrl+5 opens the families tree with kingdoms and an overview', async ({ page }) => {
  await openFamilies(page)
  for (const k of ['Plants', 'Minerals', 'Animals', 'Nosodes', 'Sarcodes', 'Imponderabilia']) {
    await expect(tree(page).getByRole('treeitem', { name: new RegExp(`^${k}`) })).toBeVisible()
  }
  await expect(view(page).locator('.fam-overview h1')).toHaveText('Families & kingdoms')
  await expect(view(page).locator('.fam-overview')).toContainText('remedies classified')
})

test('tree is keyboard navigable', async ({ page }) => {
  await openFamilies(page)
  await tree(page).focus()
  await expect(tree(page).locator('.fam-row.on .fam-name')).toHaveText('Plants')
  await page.keyboard.press('ArrowRight') // expand Plants
  await expect(tree(page).getByRole('treeitem', { name: /^Plants/ })).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight') // first child
  await expect(tree(page).locator('.fam-row.on')).toHaveAttribute('aria-level', '2')
  await page.keyboard.press('ArrowLeft') // back to parent
  await expect(tree(page).locator('.fam-row.on .fam-name')).toHaveText('Plants')
  await page.keyboard.press('ArrowLeft') // collapse
  await expect(tree(page).getByRole('treeitem', { name: /^Plants/ })).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('End')
  await expect(tree(page).locator('.fam-row.on .fam-name')).toHaveText('Themes')
  await page.keyboard.press('m') // type-ahead
  await expect(tree(page).locator('.fam-row.on .fam-name')).toHaveText('Minerals')
})

test('search finds families and remedies; a remedy opens in its family', async ({ page }) => {
  await openFamilies(page)
  await selectFamily(page, 'Solanaceae')
  await expect(view(page).locator('.fam-crumbs')).toContainText('Plants')
  await expect(view(page).locator('.fam-crumbs')).toContainText('Solanales')
  const table = view(page).getByRole('grid', { name: 'Remedies of the group' })
  await expect(table.locator('.fam-tr', { hasText: 'Belladonna' })).toBeVisible()
  // rubric counts come from the default repertory
  await expect(table.locator('.fam-tr', { hasText: 'Belladonna' }).locator('.fam-c-total')).toHaveText(/\d+/, { timeout: 30_000 })

  await search(page).fill('nat-m')
  const hits = view(page).getByRole('listbox', { name: 'Matching remedies' })
  await hits.getByRole('option', { name: /Nat-m/ }).first().click()
  await expect(view(page).locator('.fam-title h1')).toHaveText('Natrium (Na)')
  await expect(table.locator('.fam-tr.on')).toContainText('Natrium Muriaticum')
  await table.press('Enter')
  await expect(page.locator('.ri-title h1')).toHaveText('Natrium Muriaticum')
})

test('limit and highlight the analysis from the view, and clear them', async ({ page }) => {
  await newCase(page)
  await openFamilies(page)
  await selectFamily(page, 'Solanaceae')
  await view(page).getByRole('button', { name: 'Limit analysis' }).click()
  await expect(view(page).locator('.fam-pill')).toContainText('Limited to Solanaceae')
  await page.keyboard.press('F8')
  const an = page.getByTestId('analysis-view')
  await expect(an).toContainText('Limited: Solanaceae')
  // every ranked remedy is a Solanaceae member
  const solanaceae = await page.evaluate(async () => {
    const f = await (await fetch('/data/families.json')).json() as { groups: { id: string; remedies: number[] }[] }
    const r = await (await fetch('/data/remedies.json')).json() as [number, string][]
    const ids = new Set(f.groups.find(g => g.id === 'plant:family:Solanaceae')!.remedies)
    return r.filter(x => ids.has(x[0])).map(x => x[1])
  })
  const heads = an.locator('.an-hcell .an-abbrev')
  await expect(heads.first()).toBeVisible({ timeout: 20_000 })
  const abbrevs = await heads.allInnerTexts()
  expect(abbrevs.length).toBeGreaterThan(0)
  for (const a of abbrevs) expect(solanaceae).toContain(a.trim())

  await openFamilies(page)
  await view(page).getByRole('button', { name: 'Highlight in analysis', exact: true }).click()
  await expect(view(page).locator('.fam-pill.hl')).toContainText('Highlighting Solanaceae')
  // the analysis is open in another tab: the toast shows it (not "Open analysis")
  await expect(page.locator('.toast').last()).toContainText('Show analysis')
  await view(page).getByRole('button', { name: 'Remove family limit' }).click()
  await view(page).getByRole('button', { name: 'Remove family highlight' }).click()
  await expect(view(page).locator('.fam-pill')).toHaveCount(0)
})

test('family filter dialog applies several families as a highlight', async ({ page }) => {
  await newCase(page)
  await page.keyboard.press('F8')
  await expect(page.getByTestId('analysis-view')).toBeVisible()
  // the analysis filter command opens the families dialog
  await page.getByTestId('analysis-view').getByRole('button', { name: 'Filter remedies' }).click()
  const dlg = page.getByRole('dialog', { name: 'Family filter' })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('radio', { name: /Highlight/ }).click()
  const find = dlg.getByLabel('Find family')
  await find.fill('ranunculaceae')
  await find.press('ArrowDown')
  await page.keyboard.press('Space')
  await find.fill('solanaceae')
  await find.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(dlg.getByRole('list', { name: 'Selected families' }).locator('li')).toHaveCount(2)
  await expect(dlg.locator('.fam-dlg-sum')).toContainText('Ranunculaceae + Solanaceae')
  await dlg.getByTestId('fam-apply').click()
  await expect(dlg).toBeHidden()
  await expect(page.getByTestId('analysis-view')).toContainText('Ranunculaceae + Solanaceae')
})

test('context menu on a family offers analysis actions (Shift+F10)', async ({ page }) => {
  await openFamilies(page)
  await tree(page).focus()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu')
  await expect(menu).toContainText('Limit analysis to this group')
  await expect(menu).toContainText('Highlight in analysis')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('Ctrl+F and F2 focus the families search when focus is in the view', async ({ page }) => {
  await openFamilies(page)
  await tree(page).focus()
  await page.keyboard.press('F2')
  await expect(search(page)).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0) // not the repertory type-ahead
  await tree(page).focus()
  await page.keyboard.press('Control+F')
  await expect(search(page)).toBeFocused()
  await expect(page.getByPlaceholder('Find rubric or remedy…')).not.toBeFocused()
})

test('search matches word starts and lists every matching remedy', async ({ page }) => {
  await openFamilies(page)
  await search(page).fill('nat')
  const rows = tree(page).locator('.fam-row.match .fam-name')
  await expect(rows.first()).toBeVisible()
  const names = await rows.allInnerTexts()
  expect(names.some(n => /Natrium/.test(n))).toBe(true)
  for (const n of names) expect(n).not.toMatch(/Carbonates|Permanganates|Arsenites/)
  const hits = view(page).locator('.fam-remhits')
  const count = Number(await hits.locator('.pane-head .badge').innerText())
  expect(count).toBeGreaterThan(40) // not capped
  // no group matches: the remedy list takes the pane
  await search(page).fill('bella')
  await expect(view(page).locator('.fam-left.only-remedies')).toBeVisible()
  await expect(hits.getByRole('option', { name: /Belladonna/ })).toBeVisible()
})

test('remedy table header belongs to the grid', async ({ page }) => {
  await openFamilies(page)
  await selectFamily(page, 'Solanaceae')
  const grid = view(page).getByRole('grid', { name: 'Remedies of the group' })
  // five columns; "Classified under" is dropped first when the pane is narrow
  expect(await grid.getByRole('columnheader').count()).toBeGreaterThanOrEqual(4)
  await expect(grid.getByRole('columnheader', { name: 'Rubrics' })).toBeVisible()
  const first = grid.locator('.fam-tr').first()
  await expect(first).toHaveAttribute('aria-rowindex', '2')
  // sorting from the header
  await grid.getByRole('columnheader', { name: 'Remedy' }).getByRole('button').click()
  await expect(grid.getByRole('columnheader', { name: 'Remedy' })).toHaveAttribute('aria-sort', 'ascending')
})

test('stays usable at 1152x720 with both side panels open', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await openFamilies(page)
  await selectFamily(page, 'Solanaceae')
  const layout = await page.evaluate(() => {
    const right = document.querySelector('.fam-right')!.getBoundingClientRect()
    const outside = [...document.querySelectorAll('.fam-th, .fam-td, .fam-actions .btn')]
      .map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && (r.right > right.right + 1 || r.left < right.left - 1)).length
    const cells = [...document.querySelectorAll('.fam-tr:first-child .fam-td')].filter(e => (e as HTMLElement).offsetWidth > 0).length
    return { width: right.width, outside, cells }
  })
  expect(layout.width).toBeGreaterThanOrEqual(280)
  expect(layout.outside).toBe(0)
  expect(layout.cells).toBeGreaterThanOrEqual(4) // abbrev, name, rubrics, G3-4
  await expect(view(page).getByRole('button', { name: 'Limit analysis', exact: true })).toBeVisible()
})

test('family filter dialog: fast keyboard checking, Enter applies, remedy filters reachable', async ({ page }) => {
  await newCase(page)
  await page.setViewportSize({ width: 1152, height: 720 })
  await openFamilies(page)
  await selectFamily(page, 'Solanaceae')
  await view(page).getByRole('button', { name: 'Family filter…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Family filter' })
  const find = dlg.getByLabel('Find family')
  await dlg.locator('.fam-dlg-sel').getByRole('button', { name: 'Remove Solanaceae' }).click()
  await find.fill('snakes')
  await find.press('ArrowDown')
  await page.keyboard.press('Space') // immediately: must check, not type into the search
  await expect(find).toHaveValue('snakes')
  await expect(dlg.getByRole('list', { name: 'Selected families' }).locator('li')).toHaveCount(1)
  // the summary is fully visible at 720px height
  await expect(dlg.locator('.fam-dlg-cur')).toBeInViewport({ ratio: 1 })
  await page.keyboard.press('Enter') // Enter on a checked family applies
  await expect(dlg).toBeHidden()
  await expect(view(page).locator('.fam-pill')).toContainText('Limited to Snakes')
  // Ctrl+Enter applies from anywhere in the dialog
  await view(page).getByRole('button', { name: 'Family filter…' }).click()
  await dlg.getByRole('radio', { name: /Highlight/ }).click()
  await dlg.getByLabel('Find family').focus()
  await page.keyboard.press('Control+Enter')
  await expect(dlg).toBeHidden()
  await expect(view(page).locator('.fam-pill.hl')).toContainText('Highlighting Solanaceae')
  // the analysis's own remedy filter dialog (exclude, minimum coverage) is one click away
  await view(page).getByRole('button', { name: 'Family filter…' }).click()
  await dlg.getByRole('button', { name: /Remedy filters/ }).click()
  await expect(page.getByRole('dialog', { name: 'Filter remedies' })).toBeVisible()
})

test('family filter dialog reopens with the current families in their mode', async ({ page }) => {
  // the seeded demo practice has an active case
  await page.keyboard.press('F8')
  await expect(page.getByTestId('analysis-view')).toBeVisible()
  const dlg = page.getByRole('dialog', { name: 'Family filter' })
  const open = async () => { await page.getByTestId('analysis-view').getByRole('button', { name: 'Filter remedies' }).click(); await expect(dlg).toBeVisible() }
  const selected = () => dlg.getByRole('list', { name: 'Selected families' }).locator('li .fam-ellipsis')
  const apply = dlg.getByTestId('fam-apply')
  const find = dlg.getByLabel('Find family')
  const checkFamily = async (name: string) => { await find.fill(name); await find.press('ArrowDown'); await page.keyboard.press('Space') }

  await open()
  await expect(apply).toBeDisabled() // nothing checked, no filter: nothing to clear
  await dlg.getByRole('radio', { name: /Highlight/ }).click()
  await checkFamily('Liliales')
  await checkFamily('Anacardiaceae')
  await expect(apply).toHaveText('Highlight')
  await page.keyboard.press('Control+Enter')
  await expect(dlg).toBeHidden()

  // reopens in Highlight with both families checked; nothing changed yet
  await open()
  await expect(dlg.getByRole('radio', { name: /Highlight/ })).toHaveAttribute('aria-checked', 'true')
  await expect(selected()).toHaveText(['Liliales', 'Anacardiaceae'])
  await expect(apply).toBeDisabled()
  // Limit has its own (empty) selection and never offers to clear a limit that does not exist
  await dlg.getByRole('radio', { name: /Limit/ }).click()
  await expect(selected()).toHaveCount(0)
  await expect(apply).toBeDisabled()
  await expect(apply).not.toHaveText(/Clear/)
  // back in Highlight, add a third family
  await dlg.getByRole('radio', { name: /Highlight/ }).click()
  await checkFamily('Solanaceae')
  await expect(apply).toHaveText('Update highlight')
  await apply.click()
  await expect(dlg).toBeHidden()
  await expect(page.getByTestId('analysis-view')).toContainText('Liliales + 2 more')

  // unchecking everything offers to clear the highlight, which does exist
  await open()
  await expect(selected()).toHaveCount(3)
  while (await dlg.locator('.fam-dlg-sel li button').count()) await dlg.locator('.fam-dlg-sel li button').first().click()
  await expect(apply).toHaveText('Clear highlight')
  await apply.click()
  await expect(page.getByTestId('analysis-view')).not.toContainText('Liliales')
})

test('keyboard moves between search, tree and matching remedies', async ({ page }) => {
  await openFamilies(page)
  const hits = view(page).getByRole('listbox', { name: 'Matching remedies' })
  // no group matches: ArrowDown goes straight to the remedies
  await search(page).fill('lach')
  await search(page).press('ArrowDown')
  await expect(hits).toBeFocused()
  await expect(hits.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(hits.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp') // past the first remedy: back to the search box
  await expect(search(page)).toBeFocused()
  // groups and remedies: ArrowDown past the last tree row reaches the remedies, ArrowUp returns
  await search(page).fill('natrium')
  await search(page).press('ArrowDown')
  await expect(tree(page)).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await expect(hits).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(tree(page)).toBeFocused()
  // tree items expose their position for screen readers
  const item = tree(page).getByRole('treeitem').first()
  await expect(item).toHaveAttribute('aria-posinset', '1')
  await expect(item).toHaveAttribute('aria-setsize', /\d+/)
})

test('no sub-group is hidden: "+N more" reveals the rest', async ({ page }) => {
  await page.setViewportSize({ width: 1152, height: 720 })
  await openFamilies(page)
  await selectFamily(page, 'Minerals')
  const more = view(page).locator('.fam-chip-more')
  await expect(more).toHaveText(/\+\d+ more/)
  const hidden = Number((await more.innerText()).match(/\d+/)![0])
  const chips = view(page).locator('.fam-children .fam-chip')
  const total = await chips.count()
  expect(await chips.locator('visible=true').count()).toBeGreaterThanOrEqual(total - hidden)
  await more.click()
  await expect(more).toHaveText(/Show less/)
  for (let i = 0; i < total; i++) await expect(chips.nth(i)).toBeInViewport()
  await expect(view(page).getByRole('button', { name: /Rocks, minerals/ })).toBeVisible()
})

test('a load error shows a compact retry block', async ({ page }) => {
  let fail = true
  await page.route('**/data/families.json', r => (fail ? r.fulfill({ status: 500, body: 'error' }) : r.continue()))
  await openApp(page) // reload so the families load goes through the route
  await page.keyboard.press('Control+5')
  const alert = view(page).getByRole('alert')
  await expect(alert).toContainText('Families could not be loaded')
  const box = await alert.boundingBox()
  expect(box!.height).toBeLessThan(160) // grouped, not spread over the pane
  fail = false
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(tree(page)).toBeVisible()
})

test('Ctrl+5 puts focus in the view, so Ctrl+F finds in families', async ({ page }) => {
  await page.keyboard.press('Control+5')
  await expect(view(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.fam-view'))).toBe(true)
  await page.keyboard.press('Control+f')
  await expect(view(page).getByRole('textbox', { name: 'Find families and remedies' })).toBeFocused()
})

test('search goes to the best hit: the family before its order, with the level shown', async ({ page }) => {
  await page.keyboard.press('Control+5')
  const find = view(page).getByRole('textbox', { name: 'Find families and remedies' })
  await find.fill('solan')
  await expect(view(page).locator('.fam-row.match .fam-level')).toHaveText(['Order', 'Family'])
  await find.press('ArrowDown')
  await expect(view(page).locator('.fam-row.on .fam-name')).toHaveText('Solanaceae')
})

test('family filter dialog: ArrowDown selects the first row; nothing to remove is disabled', async ({ page }) => {
  await newCase(page)
  await openFamilies(page)
  await selectFamily(page, 'Solanaceae')
  await view(page).getByRole('button', { name: 'Family filter…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Family filter' })
  for (const name of ['Remove limit', 'Remove highlight']) {
    const b = dlg.getByRole('button', { name })
    await expect(b).toBeDisabled()
    await expect(b).toHaveCSS('cursor', 'not-allowed')
    await expect(b).toHaveCSS('opacity', '0.45')
  }
  const find = dlg.getByLabel('Find family')
  await find.focus()
  await find.press('ArrowDown')
  const tree = dlg.locator('.fam-tree')
  await expect(tree).toBeFocused()
  const firstRow = tree.getByRole('treeitem').first()
  await expect(firstRow).toHaveAttribute('id', (await tree.getAttribute('aria-activedescendant'))!)
})
