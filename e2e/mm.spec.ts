import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

const reader = (page: Page) => page.locator('.mm-reader')

async function openMM(page: Page) {
  await openApp(page)
  await page.keyboard.press('Control+2')
  await expect(page.getByRole('listbox', { name: 'Boericke remedies' })).toBeVisible()
}

test('materia medica: list, filter, keyboard and section jump', async ({ page }) => {
  await openMM(page)
  await expect(reader(page).locator('.mm-welcome')).toContainText('Pocket Manual')
  // j/k move through the list
  await page.keyboard.press('j')
  await expect(reader(page).locator('.mm-head h1')).toHaveText(/ABIES CANADENSIS/)
  await page.keyboard.press('j')
  await expect(reader(page).locator('.mm-head h1')).toHaveText(/ABIES NIGRA/)
  await page.keyboard.press('k')
  await expect(reader(page).locator('.mm-head h1')).toHaveText(/ABIES CANADENSIS/)
  // filter by abbreviation, Enter opens
  await page.getByRole('textbox', { name: 'Filter remedies' }).fill('nat-m')
  await page.keyboard.press('Enter')
  await expect(reader(page).locator('.mm-head h1')).toHaveText('NATRIUM MURIATICUM')
  await expect(page.getByRole('listbox', { name: 'Boericke remedies' })).toBeFocused()
  // letters in the list type ahead, so the section key is used from the reader (Enter focuses it)
  await page.keyboard.press('Enter')
  await expect(reader(page)).toBeFocused()
  // section menu jumps to Relationship
  await page.keyboard.press('s')
  await page.getByRole('menu', { name: 'Sections' }).locator('.menu-item', { hasText: 'Relationship' }).click()
  const rel = reader(page).locator('section.mm-sec', { has: page.locator('h2', { hasText: 'Relationship' }) })
  await expect(rel).toBeInViewport()
  // remedy links inside the text resolve Boericke shorthand
  await expect(rel.locator('button.mm-rem', { hasText: 'Apis' })).toBeVisible()
  await rel.locator('button.mm-rem', { hasText: 'Sepia' }).click()
  await expect(reader(page).locator('.mm-head h1')).toHaveText('SEPIA OFFICINALIS')
  // back returns to Nat-m
  await page.locator('.mm-toolbar').getByRole('button', { name: 'Back', exact: true }).click()
  await expect(reader(page).locator('.mm-head h1')).toHaveText('NATRIUM MURIATICUM')
  await page.locator('.mm-toolbar').getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(reader(page).locator('.mm-head h1')).toHaveText('SEPIA OFFICINALIS')
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(reader(page).locator('.mm-head h1')).toHaveText('NATRIUM MURIATICUM')
  await expect(reader(page).locator('.mm-source')).toContainText('Public domain')
})

test('materia medica: full-text search with hits and next/previous', async ({ page }) => {
  await openMM(page)
  await page.keyboard.press('/')
  const box = page.getByRole('textbox', { name: 'Search the materia medica' })
  await expect(box).toBeFocused()
  await box.fill('craving salt')
  const hits = page.getByRole('listbox', { name: 'Search results' })
  await expect(hits.getByRole('option').first()).toBeVisible()
  await expect(hits).toContainText('Nat-m')
  // Enter goes to the first hit and marks it
  await box.press('Enter')
  await expect(reader(page).locator('mark.mm-hit.current')).toBeVisible()
  const first = await reader(page).locator('.mm-head h1').textContent()
  const count = page.locator('.mm-search-count')
  await expect(count).toHaveText(/^1\/\d+$/)
  // keep going: eventually moves to another remedy
  for (let i = 0; i < 8; i++) await box.press('Enter')
  await expect(reader(page).locator('.mm-head h1')).not.toHaveText(first!)
  // clicking a hit opens that remedy at the section
  await hits.getByRole('option').filter({ hasText: 'Nat-m' }).click()
  await expect(reader(page).locator('.mm-head h1')).toHaveText('NATRIUM MURIATICUM')
  await expect(reader(page).locator('mark.mm-hit.current')).toBeInViewport()
  // Esc clears the search
  await box.press('Escape')
  await expect(box).toHaveValue('')
  await expect(reader(page).locator('mark.mm-hit')).toHaveCount(0)
})

test('remedy picker (Ctrl+4) and the remedy information window', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+4')
  const dlg = page.getByRole('dialog', { name: 'Remedies' })
  await expect(dlg).toBeVisible()
  await page.keyboard.type('natrum mur')
  await expect(dlg.getByRole('option').first()).toContainText('Nat-m')
  await page.keyboard.press('Enter')
  await expect(dlg).toBeHidden()
  const view = page.locator('.ri-view')
  await expect(view.locator('h1')).toHaveText('Natrium Muriaticum')
  await expect(view).toContainText('Boericke keynotes')

  // relationships parsed from Boericke
  await view.getByRole('tab', { name: /Relationships/ }).click()
  const comp = view.locator('.ri-relgroup', { hasText: 'Complementary' })
  await expect(comp.locator('.ri-chip')).toHaveText([/Apis/, /Sep/, /Ign/])
  // clicking a related remedy shows it in the same window; Back returns
  await comp.locator('.ri-chip', { hasText: 'Sep' }).click()
  await expect(view.locator('h1')).toHaveText('Sepia Officinalis')
  await view.getByRole('button', { name: 'Back to previous remedy' }).click()
  await expect(view.locator('h1')).toHaveText('Natrium Muriaticum')

  // repertory profile: counts, grade distribution, chapters, keynote rubrics
  await page.keyboard.press('3')
  await expect(view.getByRole('tab', { name: /Repertory profile/ })).toHaveAttribute('aria-selected', 'true')
  await expect(view.locator('.ri-tile-num')).toHaveText(/\d/, { timeout: 30_000 })
  await expect(view.locator('.ri-ch-row').first()).toBeVisible()
  const kn = view.getByRole('listbox', { name: 'Keynote rubrics' })
  await expect(kn.getByRole('option').first()).toBeVisible()
  // chapter filter narrows the keynotes
  const chapter = (await view.locator('.ri-ch-row .ri-ch-name').nth(1).textContent())!
  await view.locator('.ri-ch-row').nth(1).click()
  await expect(kn.getByRole('option').first()).toHaveAttribute('title', new RegExp(`^${chapter}`))
  // Enter opens the rubric in a repertory tab
  await kn.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab.active, [role="tab"][aria-selected="true"]').first()).toBeVisible()
  await expect(page.locator('.ri-view')).toBeHidden()

  // Open in MM from the remedy window
  await page.keyboard.press('Control+4')
  await page.keyboard.type('sepia')
  await page.keyboard.press('Alt+Enter')
  await expect(reader(page).locator('.mm-head h1')).toHaveText('SEPIA OFFICINALIS')
})

test('remedy without a monograph shows a helpful state', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+4')
  await page.keyboard.type('Accipiter')
  await page.keyboard.press('Enter')
  const view = page.locator('.ri-view')
  await expect(view.locator('.ri-nomono')).toContainText('No monograph in Boericke')
  await expect(view.getByRole('button', { name: /Open in MM/ })).toBeDisabled()
})

/** Rows of a virtual list that are inside its viewport. */
async function rowsInView(page: Page, list: string, row: string): Promise<string[]> {
  return page.locator(list).evaluate((el, row) => {
    const r = el.getBoundingClientRect()
    return [...el.querySelectorAll<HTMLElement>(row)].filter(x => { const b = x.getBoundingClientRect(); return b.bottom > r.top + 1 && b.top < r.bottom - 1 }).map(x => x.textContent ?? '')
  }, row)
}

test('materia medica: lists keep rendering after their side tab is re-opened', async ({ page }) => {
  await openMM(page)
  const list = page.getByRole('listbox', { name: 'Boericke remedies' })
  await page.getByRole('tab', { name: /Results/ }).click()
  await page.getByRole('tab', { name: /Remedies/ }).click()
  await list.evaluate(el => { el.scrollTop = 3000 })
  await expect.poll(async () => (await rowsInView(page, '.mm-list', '.mm-row')).length).toBeGreaterThan(10)
  expect((await rowsInView(page, '.mm-list', '.mm-row'))[0]).not.toMatch(/^Abies/)

  // a filter with no match, then cleared: the selected remedy is shown in a filled list
  const filter = page.getByRole('textbox', { name: 'Filter remedies' })
  await filter.fill('sulph')
  await filter.press('Enter')
  await expect(reader(page).locator('.mm-head h1')).toHaveText('SULPHUR')
  await filter.fill('zzzz')
  await expect(list).toContainText('No remedy matches')
  await filter.fill('')
  await expect.poll(async () => (await rowsInView(page, '.mm-list', '.mm-row')).some(t => t.startsWith('Sulph'))).toBe(true)
  expect((await rowsInView(page, '.mm-list', '.mm-row')).length).toBeGreaterThan(10)

  // the hit list survives a side tab round trip too
  await list.focus()
  await page.keyboard.press('/')
  await page.keyboard.type('pain')
  const hits = page.getByRole('listbox', { name: 'Search results' })
  await expect(hits.getByRole('option').first()).toBeVisible()
  await page.getByRole('tab', { name: /Remedies/ }).click()
  await page.getByRole('tab', { name: /Results/ }).click()
  await hits.evaluate(el => { el.scrollTop = 20_000 })
  await expect.poll(async () => (await rowsInView(page, '.mm-hits', '.mm-hit-row')).length).toBeGreaterThan(5)
})

test('materia medica: ranked filter, hit-only highlights, abbreviations and print focus', async ({ page }) => {
  await openMM(page)
  const filter = page.getByRole('textbox', { name: 'Filter remedies' })
  await filter.fill('lach')
  await expect(page.locator('.mm-row').first()).toContainText('Lach')
  await filter.press('Enter')
  await expect(reader(page).locator('.mm-head h1')).toHaveText('LACHESIS MUTUS')
  await filter.fill('ars')
  await expect(page.locator('.mm-row').first().locator('.mm-row-abbr')).toHaveText('Ars')

  // in-page matches follow the hit list: only hit sections are marked
  await filter.fill('nat-m')
  await filter.press('Enter')
  await page.keyboard.press('/')
  await page.keyboard.type('craving salt')
  const hits = page.getByRole('listbox', { name: 'Search results' })
  await hits.getByRole('option').filter({ hasText: 'Nat-m' }).first().click()
  await expect(reader(page).locator('mark.mm-hit.current')).toBeVisible()
  const marked = await reader(page).locator('mark.mm-hit').evaluateAll(ms => [...new Set(ms.map(m => m.closest('section')?.querySelector('h2')?.textContent ?? 'Introduction'))])
  expect(marked).toEqual(['Stomach'])
  await expect(reader(page).locator('mark.mm-hit.current')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Search the materia medica' }).press('Escape')

  // plain remedy lists in Relationship sections are links; Space shows their abbreviations
  await filter.fill('sulph')
  await filter.press('Enter')
  const rel = reader(page).locator('section.mm-sec', { has: page.locator('h2', { hasText: 'Relationship' }) })
  await expect(rel.locator('button.mm-rem', { hasText: /^Lyc$/ })).toBeVisible()
  await expect(rel.locator('button.mm-rem', { hasText: /^calcarea$/ })).toHaveAttribute('data-abbr', 'Calc')
  await reader(page).focus()
  await page.keyboard.press('Space')
  await expect(reader(page)).toHaveClass(/mm-show-abbr/)
  await page.keyboard.press('Space')
  await expect(reader(page)).not.toHaveClass(/mm-show-abbr/)

  // after printing, focus is back in the app and shortcuts work
  await page.keyboard.press('Control+p')
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('IFRAME')
  await page.keyboard.press('Control+4')
  await expect(page.getByRole('dialog', { name: 'Remedies' })).toBeVisible()
})

test('materia medica: monographs are filed under the right remedies', async ({ page }) => {
  await openMM(page)
  const filter = page.getByRole('textbox', { name: 'Filter remedies' })
  for (const [q, heading] of [['acet-ac', 'ACETICUM ACIDUM'], ['lac-ac', 'LACTICUM ACIDUM'], ['ind', 'INDIUM METALLICUM'], ['irid', 'IRIDIUM METALLICUM'], ['just', 'JUSTICIA ADHATODA'], ['juni-c', 'JUNIPERUS COMMUNIS']]) {
    await filter.fill(q)
    await filter.press('Enter')
    await expect(reader(page).locator('.mm-head h1')).toHaveText(heading)
  }
})

test.describe('remedy information window at 1152x720', () => {
  test.use({ viewport: { width: 1152, height: 720 } })

  test('fits with the side panes open; keynotes survive a repertory switch; keys work after tab switch', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('Control+4')
    await page.keyboard.type('sulphur')
    await page.keyboard.press('Enter')
    const view = page.locator('.ri-view')
    await expect(view.locator('h1')).toHaveText('Sulphur')
    // name and actions on their own rows, secondary actions in a More menu
    const head = await view.locator('.ri-head').boundingBox()
    expect(head!.height).toBeLessThan(110)
    await view.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menu').getByText('Copy remedy name')).toBeVisible()
    await page.keyboard.press('Escape')
    // alt name not clipped to "Also"
    await expect(view.locator('.ri-alts')).toContainText('Sulfur')

    await page.keyboard.press('3')
    const kn = view.getByRole('listbox', { name: 'Keynote rubrics' })
    await expect(kn.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
    expect((await kn.boundingBox())!.width).toBeGreaterThan(400)
    const seg = view.getByRole('radio', { name: /Kent/ })
    const segBox = (await seg.boundingBox())!
    expect(segBox.height).toBeLessThan(30)
    await seg.click()
    await expect(kn.getByRole('option').first()).toBeVisible({ timeout: 30_000 })
    await kn.evaluate(el => { el.scrollIntoView(); el.scrollTop = 3000 })
    await expect.poll(async () => (await rowsInView(page, '.ri-kn-list', '.ri-kn-row')).length).toBeGreaterThan(8)

    // leave the tab and come back through the tab strip: section keys work straight away
    await page.getByRole('tab', { name: /Mind/ }).first().click()
    await page.getByRole('tab', { name: /Sulph/ }).first().click()
    await page.keyboard.press('2')
    await expect(page.locator('.ri-view').getByRole('tab', { name: /Relationships/ })).toHaveAttribute('aria-selected', 'true')
    const compare = page.locator('.ri-relgroup', { hasText: 'Compare' }).first()
    for (const ab of ['Lyc', 'Sep', 'Puls', 'Calc']) await expect(compare.locator('.ri-chip b', { hasText: new RegExp(`^${ab}$`) })).toBeVisible()
    // chip abbreviations never wrap
    const tall = await page.locator('.ri-chip').evaluateAll(cs => cs.filter(c => c.getBoundingClientRect().height > 26).length)
    expect(tall).toBe(0)
  })
})

test('relationships that trailed other sections are parsed (Ars, Lyc→Calc, Calc inimical Sulph)', async ({ page }) => {
  await openApp(page)
  const view = page.locator('.ri-view')
  const open = async (q: string, name: string) => {
    await page.keyboard.press('Control+4')
    await page.keyboard.type(q)
    await page.keyboard.press('Enter')
    await expect(view.locator('h1')).toHaveText(name)
    await view.getByRole('tab', { name: 'Relationships' }).click()
  }
  const group = (kind: string) => view.locator(`.ri-rel-${kind}`)
  await open('ars', 'Arsenicum Album')
  for (const ab of ['Rhus-t', 'Carb-v', 'Phos', 'Thuj', 'Sec']) await expect(group('complementary').locator('.ri-chip b', { hasText: new RegExp(`^${ab}$`) })).toBeVisible()
  for (const ab of ['Op', 'Chin', 'Hep', 'Nux-v']) await expect(group('antidotes').locator('.ri-chip b', { hasText: new RegExp(`^${ab}$`) })).toBeVisible()
  await expect(group('compare').locator('.ri-chip b', { hasText: /^Kali-p$/ })).toBeVisible()
  await open('lyc', 'Lycopodium Clavatum')
  await expect(group('complementary').locator('.ri-chip b', { hasText: /^Calc$/ })).toBeVisible()
  await open('calc', 'Calcarea Carbonica')
  await expect(group('inimical').locator('.ri-chip b')).toHaveText(['Bry', 'Sulph'])
  // and the MM section menu lists Relationship for Ars
  await page.keyboard.press('Control+2')
  const filter = page.getByRole('textbox', { name: 'Filter remedies' })
  await filter.fill('ars')
  await filter.press('Enter')
  await expect(reader(page).locator('.mm-head h1')).toHaveText('ARSENICUM ALBUM')
  await expect(page.locator('.mm-outline')).toContainText('Relationship')
})

test('materia medica: A–Z index and type-ahead', async ({ page }) => {
  await openMM(page)
  const list = page.getByRole('listbox', { name: 'Boericke remedies' })
  const topRow = async () => (await rowsInView(page, '.mm-list', '.mm-row'))[0]
  await page.getByRole('navigation', { name: 'Alphabetical index' }).getByRole('button', { name: 'Remedies starting with P', exact: true }).click()
  await expect(list).toBeFocused()
  await expect(reader(page).locator('.mm-head h1')).toHaveText(/^P/)
  await expect.poll(topRow).toMatch(/^\S+\s*P/)
  await expect(list.locator('.mm-row.on')).toHaveText(await topRow())
  // type-ahead in the list
  await page.keyboard.type('sep', { delay: 30 })
  await expect(reader(page).locator('.mm-head h1')).toHaveText('SEPIA OFFICINALIS')
  // j/k still move; Shift+K types a K
  await page.waitForTimeout(900)
  await page.keyboard.press('j')
  await expect(reader(page).locator('.mm-head h1')).not.toHaveText('SEPIA OFFICINALIS')
  await page.waitForTimeout(900)
  await page.keyboard.press('Shift+K')
  await expect(reader(page).locator('.mm-head h1')).toHaveText(/^K/)
  // the index is one tab stop after the list; arrows move, Enter jumps
  await list.focus()
  await page.keyboard.press('Tab')
  const az = page.getByRole('navigation', { name: 'Alphabetical index' })
  await expect(az.locator('button:focus')).toHaveText('K')
  await page.keyboard.press('ArrowDown')
  await expect(az.locator('button:focus')).toHaveText('L')
  await page.keyboard.press('Enter')
  await expect(reader(page).locator('.mm-head h1')).toHaveText(/^L/)
  await expect(list).toBeFocused()
})

test('materia medica: search the repertory for selected text', async ({ page }) => {
  await openMM(page)
  const filter = page.getByRole('textbox', { name: 'Filter remedies' })
  await filter.fill('nat-m')
  await filter.press('Enter')
  const p = reader(page).locator('.mm-intro p')
  await p.evaluate(el => {
    const text = el.firstChild!.firstChild ?? el.firstChild!
    const node = text.nodeType === 3 ? text : (text as Element).firstChild!
    const r = document.createRange(); r.setStart(node, 0); r.setEnd(node, 12)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(r)
  })
  await p.click({ button: 'right', position: { x: 10, y: 8 } })
  const menu = page.getByRole('menu', { name: 'Context menu' })
  await expect(menu).toContainText('Search repertory for “The prolonge”')
  await menu.getByText(/Search repertory for/).click()
  await expect(page.locator('.srch [data-search-input]')).toHaveValue('The prolonge')
})

for (const vp of [{ width: 1440, height: 900 }, { width: 1152, height: 720 }]) {
  test.describe(`at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp })

    test('remedy window shows the full name; MM toolbar controls stay reachable', async ({ page }) => {
      await openApp(page)
      await page.keyboard.press('Control+4')
      await page.keyboard.type('nat-m')
      await page.keyboard.press('Enter')
      const h1 = page.locator('.ri-view h1')
      await expect(h1).toHaveText('Natrium Muriaticum')
      expect(await h1.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().width > 0)).toBe(true)
      await expect(page.locator('.ri-common')).toBeVisible()
      expect(await page.locator('.ri-common').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)

      // Ctrl+2 from the remedy window opens its monograph
      await page.keyboard.press('Control+2')
      await expect(reader(page).locator('.mm-head h1')).toHaveText('NATRIUM MURIATICUM')
      const view = (await page.locator('.mm-view').boundingBox())!
      for (const b of await page.locator('.mm-toolbar button').all()) {
        const box = (await b.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(view.x + view.width + 0.5)
      }
      // the reader keeps a readable measure
      const perLine = await page.locator('.mm-intro p').evaluate(p => {
        const r = document.createRange(); r.selectNodeContents(p)
        return p.textContent!.length / new Set([...r.getClientRects()].map(x => Math.round(x.top))).size
      })
      expect(perLine).toBeGreaterThanOrEqual(45)
      const more = page.locator('.mm-toolbar').getByRole('button', { name: 'More', exact: true })
      if (await more.count()) {
        await more.click()
        await page.getByRole('menu').getByText('Remedy information').click()
        await expect(page.locator('.ri-view h1')).toHaveText('Natrium Muriaticum')
      } else {
        await page.locator('.mm-toolbar').getByRole('button', { name: 'Remedy information' }).click()
        await expect(page.locator('.ri-view h1')).toHaveText('Natrium Muriaticum')
      }
    })
  })
}

test('materia medica: the remedy list can be hidden (L) and search shows it again', async ({ page }) => {
  await openMM(page)
  await page.keyboard.press('j')
  await reader(page).focus()
  await page.keyboard.press('l')
  await expect(page.locator('.mm-side')).toHaveCount(0)
  await page.keyboard.press('l')
  await expect(page.locator('.mm-side')).toBeVisible()
  await page.locator('.mm-toolbar').getByRole('button', { name: 'Show remedy list' }).click()
  await expect(page.locator('.mm-side')).toHaveCount(0)
  await page.keyboard.press('/')
  await page.keyboard.type('thirst')
  await expect(page.getByRole('listbox', { name: 'Search results' })).toBeVisible()
})

test('remedy window: families expand into a virtual grid; sources and notes', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Control+4')
  await page.keyboard.type('puls')
  await page.keyboard.press('Enter')
  const view = page.locator('.ri-view')
  await view.getByRole('tab', { name: 'Families' }).click()
  const plants = view.locator('.ri-relgroup', { hasText: /Kingdom: Plant/i })
  const total = Number((await plants.locator('h3 .badge').textContent())!.replace(/\D/g, ''))
  expect(total).toBeGreaterThan(500)
  expect(await plants.locator('.ri-chip').count()).toBeLessThanOrEqual(40)
  await plants.getByRole('button', { name: /Show all/ }).click()
  const grid = plants.getByRole('list')
  await expect(grid.locator('.ri-chip').first()).toBeVisible()
  expect(await grid.locator('.ri-chip').count()).toBeLessThan(200)
  await plants.getByRole('textbox').fill('bellad')
  await expect(grid.locator('.ri-chip b', { hasText: /^Bell$/ })).toBeVisible()

  await view.getByRole('tab', { name: 'Sources & notes' }).click()
  await expect(view.locator('.ri-srctable')).toContainText('Repertorium Publicum')
  await expect(view).toContainText('Public domain')
  const note = view.getByRole('textbox', { name: /Notes on Pulsatilla/ })
  await note.fill('Weeps telling her symptoms.')
  await view.getByRole('tab', { name: 'Overview' }).click()
  await expect(view.locator('.ri-facts')).toContainText('Weeps telling her symptoms.')
  await view.getByRole('tab', { name: 'Sources & notes' }).click()
  await expect(note).toHaveValue('Weeps telling her symptoms.')
})
