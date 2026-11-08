import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { FRESH, SEEDED, showToc, installRenderCounter, openApp, settle, takeRenders, waitForSaved, showClipboardPane, menubar } from './helpers'

/** The app labels shortcuts the Mac way (⌘, ⌥, Meta) when the browser runs on macOS. */
const MAC = process.platform === 'darwin'

test('shell boots with menubar, toolbar, tabs and status bar', async ({ page }) => {
  await openApp(page)
  await expect((await menubar(page))).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Open documents' })).toBeVisible()
  await expect(page.getByLabel('Status')).toContainText('table of contents')
})

async function freshApp(page: import('@playwright/test').Page, w = 1440, h = 900) {
  await page.setViewportSize({ width: w, height: h })
  await page.addInitScript(() => { try { localStorage.setItem('radar-opus.welcome.v1', 'done') } catch { /* blocked */ } })
  await openApp(page)
  // first-run seeding has settled once autosave has written it
  await waitForSaved(page)
}
/** Open another repertory tab (Window › New repertory tab) and wait for it. */
async function newRepertoryTab(page: import('@playwright/test').Page) {
  const n = await page.locator('.tabstrip [role=tab]').count()
  await page.evaluate(async () => {
    const r = await (window as unknown as { __radarModules: { registry: () => Promise<{ runCommand: (id: string) => boolean }> } }).__radarModules.registry()
    // after the evaluation returns: a tab switch inside it can lose Chromium's handle on the result
    setTimeout(() => r.runCommand('repertory.new'))
  })
  await expect(page.locator('.tabstrip [role=tab]')).toHaveCount(n + 1)
}
const activeInfo = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null
  return { tag: a?.tagName, id: a?.id, role: a?.getAttribute('role'), inDoc: !!a?.closest('#document-panel'), inNav: !!a?.closest('.pane-left'), body: a === document.body }
})

test('tab strip: tabs shrink and scroll inside the document pane; close lives outside role=tab', async ({ page }) => {
  await freshApp(page)
  for (let i = 0; i < 12; i++) await newRepertoryTab(page)
  const strip = await page.locator('.tabstrip').boundingBox()
  const win = await page.locator('.doc-window').boundingBox()
  expect(strip!.x + strip!.width).toBeLessThanOrEqual(win!.x + win!.width + 1)
  await expect(page.locator('.tabstrip')).toHaveClass(/overflowing/)
  await expect(page.getByRole('button', { name: /All \d+ tabs/ })).toBeVisible()
  // the active (newest) tab is scrolled into view
  const active = await page.locator('.tabstrip [role=tab][aria-selected=true]').boundingBox()
  const list = await page.locator('.tabstrip-list').boundingBox()
  expect(active!.x).toBeGreaterThanOrEqual(list!.x - 1)
  expect(active!.x + active!.width).toBeLessThanOrEqual(list!.x + list!.width + 1)
  // no interactive element nested in a tab; tabs control the document panel
  expect(await page.locator('.tabstrip [role=tab] button').count()).toBe(0)
  await expect(page.locator('.tabstrip [role=tab][aria-selected=true]')).toHaveAttribute('aria-controls', 'document-panel')
  await expect(page.locator('#document-panel')).toHaveAttribute('role', 'tabpanel')
  // no horizontal page scroll
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('menubar: one tab stop, Escape and chosen items give focus back', async ({ page }) => {
  await freshApp(page)
  const bar = (await menubar(page))
  expect(await bar.locator('[role=menuitem][tabindex="0"]').count()).toBe(1)
  // only menuitems inside the menubar
  expect(await bar.locator('> :not([role=menuitem])').count()).toBe(0)

  await showToc(page)
  await page.locator('.pane-left [role=treeitem]').first().click()
  const before = await activeInfo(page)
  expect(before.inNav).toBe(true)

  await page.keyboard.press('F10')
  // the first menu is the application menu (macOS)
  await expect(bar.getByRole('menuitem', { name: 'RadarOpus' })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await activeInfo(page)).toEqual(before)

  await page.keyboard.press('F10')
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: 'RadarOpus' })
  await expect(menu).toBeVisible()
  // the active item is exposed to assistive technology
  const activeId = await menu.getAttribute('aria-activedescendant')
  expect(activeId).toBeTruthy()
  await expect(page.locator(`[id="${activeId}"]`)).toHaveClass(/active/)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  expect(await activeInfo(page)).toEqual(before)

  // a chosen item runs after focus is back: About opens, and closing it restores focus again
  // (RadarOpus › About RadarOpus, the application menu's first item)
  await page.keyboard.press('F10')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /About/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(await activeInfo(page)).toEqual(before)
})

test('closing a tab with Alt+W moves focus into the next document', async ({ page }) => {
  await freshApp(page)
  await newRepertoryTab(page)
  // the book of the first run and the new one
  await expect(page.locator('.tabstrip [role=tab]')).toHaveCount(2)
  await page.locator('#document-panel').click({ position: { x: 300, y: 200 } })
  await page.keyboard.press('Alt+w')
  await expect.poll(async () => (await activeInfo(page)).inDoc).toBe(true)
})

test('Take menu follows ticked search results', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  await waitForSaved(page)
  await page.keyboard.press('F4')
  const input = page.getByPlaceholder(/Words in rubric paths/)
  await input.fill('anxiety')
  const box = page.locator('.srch-results .srch-cb').first()
  await box.waitFor({ timeout: 20_000 })
  await box.click()
  // ticking a result only changes the search feature's selection store: the Take menu still follows it
  await (await menubar(page)).getByRole('menuitem', { name: 'Take', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Take' }).getByRole('menuitem', { name: 'Take with intensity 1', exact: true })).toBeEnabled()
})

test('status strip holds only its links (RadarOpus); shortcuts reference hides reserved chords', async ({ page }) => {
  await freshApp(page)
  const status = page.getByLabel('Status')
  await expect(status.getByRole('button', { name: /table of contents/ })).toBeVisible()
  await expect(status.getByRole('button', { name: 'Hide toolbars and clipboards' })).toBeVisible()
  // no rubric path, clipboard summary or "Saved" badge: the save state is kept for assistive technology only
  await expect(status.locator('.save-ind')).toHaveAttribute('data-state', /idle|saved|pending|saving/)
  expect((await status.locator('.save-ind').boundingBox())!.width).toBeLessThanOrEqual(1)
  // TOC on show at boot (RadarOpus): its "Expand Toc" link is the third
  await expect(status.getByRole('button')).toHaveCount(3)
  await expect(status.getByRole('button', { name: 'Expand Toc' })).toBeVisible()
  await page.keyboard.press('F1')
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dlg).toBeVisible()
  await expect(dlg).not.toContainText('Ctrl+W')
  await expect(dlg).not.toContainText('Ctrl+Tab')
  await expect(dlg).toContainText(MAC ? '⌥W' : 'Alt+W')
  await expect(dlg).toContainText('in the clipboard list')
  await expect(dlg).toContainText('Browser keys used by Radar Opus')
  await expect(dlg.locator('kbd', { hasText: /^Shift\+\?$/ })).toHaveCount(0)
})

test('640px wide (200% zoom): toolbar folds, no horizontal page scroll', async ({ page }) => {
  await freshApp(page, 640, 450)
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  // labels and the tools also in the menu bar (zoom, print, bookmarks, search area) fold away
  await expect(tbar.getByRole('button', { name: 'Repertories', exact: true })).toBeVisible()
  await expect(tbar.getByRole('button', { name: 'History', exact: true })).toBeVisible()
  await expect(tbar.getByRole('button', { name: 'Print', exact: true })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640)
  const tb = await page.getByRole('toolbar', { name: 'Main toolbar' }).evaluate(el => [el.scrollWidth, el.clientWidth])
  expect(tb[0]).toBeLessThanOrEqual(tb[1])
})

test('1152px: the document pane keeps at least 640px beside both side panes', async ({ page }) => {
  await freshApp(page, 1152, 720)
  const doc = await page.locator('.pane-center').boundingBox()
  expect(doc!.width).toBeGreaterThanOrEqual(639)
})

test('moving through rubrics does not re-render the chrome (menubar, toolbar, tab strip, clipboards)', async ({ page }) => {
  await installRenderCounter(page)
  await freshApp(page)
  await page.locator('.rv-row').first().click()
  await page.keyboard.press('ArrowDown')
  await settle(page)
  await takeRenders(page)
  const crumb = page.locator('.tab-doc[data-active] .rv-crumb-last')
  const start = await crumb.textContent()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown')
  await expect(crumb).not.toHaveText(start!)
  await settle(page)
  const r = await takeRenders(page)
  // the book itself did move
  expect(r.RepertoryView ?? 0).toBeGreaterThan(0)
  for (const name of ['MenuBar', 'TabStrip', 'ClipboardPanel', 'AnalysisDock', 'WorkspaceChrome']) expect(r[name] ?? 0, name).toBe(0)
  expect(r.Toolbar ?? 0).toBeLessThanOrEqual(1)
})

test('clipboard strip: three slots, the active one pressed, its count under the icon; a click selects', async ({ page }) => {
  await freshApp(page)
  const strip = page.getByRole('toolbar', { name: 'Clipboards' })
  const slots = strip.locator('.clip-slot')
  expect(await slots.count()).toBeGreaterThanOrEqual(3)
  await expect(strip.locator('.clip-slot[aria-pressed=true]')).toHaveCount(1)
  // the strip sits left of the document window
  const s = (await strip.boundingBox())!, w = (await page.locator('.doc-window').boundingBox())!
  expect(s.x + s.width).toBeLessThanOrEqual(w.x + 1)
  for (let i = 0; i < 2; i++) {
    const icon = (await slots.nth(i).locator('.clip-slot-icon').boundingBox())!
    const count = await slots.nth(i).locator('.clip-slot-count').boundingBox()
    if (count && (await slots.nth(i).locator('.clip-slot-count').textContent())) expect(count.y).toBeGreaterThanOrEqual(icon.y + icon.height - 1)
  }
  // selecting the second clipboard makes it the active one: its count turns bold, the first's regular;
  // the ticks mark the clipboards in the analysis (both, as a new clipboard joins the analysis)
  await page.locator('.rv-scroll').first().focus()
  await slots.nth(1).click()
  await expect(slots.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(slots.nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(slots.nth(1).locator('.clip-slot-count')).toHaveCSS('font-weight', '700')
  await expect(slots.nth(0).locator('.clip-slot-count')).toHaveCSS('font-weight', '400')
  await expect(slots.nth(1).locator('.clip-tick')).toHaveCount(1)
  await expect(slots.nth(0).locator('.clip-tick')).toHaveCount(1)
  // like a toolbar button, the click leaves the keyboard in the document
  await expect.poll(async () => (await activeInfo(page)).inDoc).toBe(true)
  // from the keyboard, arrows move between the slots
  await slots.nth(1).focus()
  await page.keyboard.press('ArrowUp')
  await expect(slots.nth(0)).toBeFocused()
})

test('status strip links toggle the table of contents and the toolbars and clipboards', async ({ page }) => {
  await freshApp(page)
  const status = page.getByLabel('Status')
  // RadarOpus starts with the table of contents on show
  await expect(page.locator('.pane-left')).toBeVisible()
  await status.getByRole('button', { name: /^Hide the table of contents/ }).click()
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await expect(status.getByRole('button', { name: 'Expand Toc' })).toHaveCount(0)
  await status.getByRole('button', { name: /^Show table of contents/ }).click()
  await expect(page.locator('.pane-left')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(page.locator('.pane-left')).toBeVisible()
  // Expand Toc widens the table of contents; Reduce Toc gives the old width back
  const before = (await page.locator('.pane-left').boundingBox())!.width
  await status.getByRole('button', { name: 'Expand Toc' }).click()
  await expect.poll(async () => (await page.locator('.pane-left').boundingBox())!.width).toBeGreaterThan(before + 100)
  await status.getByRole('button', { name: 'Reduce Toc' }).click()
  await expect.poll(async () => (await page.locator('.pane-left').boundingBox())!.width).toBe(before)
  await status.getByRole('button', { name: 'Hide toolbars and clipboards' }).click()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toHaveCount(0)
  await expect(page.getByRole('toolbar', { name: 'Clipboards' })).toHaveCount(0)
  await status.getByRole('button', { name: 'Show toolbars and clipboard icons' }).click()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Clipboards' })).toBeVisible()
  // the opt-in clipboard pane goes with them, and the links leave the keyboard in the document
  await page.keyboard.press('ControlOrMeta+Shift+B')
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
  await status.getByRole('button', { name: 'Hide toolbars and clipboards' }).click()
  await expect(page.getByTestId('clipboard-panel')).toHaveCount(0)
  await expect(status.getByRole('button', { name: 'Show toolbars and clipboard icons' })).not.toBeFocused()
  await status.getByRole('button', { name: 'Show toolbars and clipboard icons' }).click()
  await expect(page.getByTestId('clipboard-panel')).toBeVisible()
})

test('document window: open documents side by side without scroll arrows; no clipboard pane by default', async ({ page }) => {
  await freshApp(page)
  await expect(page.getByTestId('clipboard-panel')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+3')
  await expect(page.locator('.pt-list').first()).toBeVisible()
  await expect(page.locator('.tabstrip')).not.toHaveClass(/overflowing/)
  await expect(page.locator('.tab-scroll')).toHaveCount(0)
  const list = (await page.locator('.tabstrip-list').boundingBox())!
  for (const t of await page.locator('.tabstrip .tab').all()) {
    const b = (await t.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(list.x - 1)
    expect(b.x + b.width).toBeLessThanOrEqual(list.x + list.width + 1)
  }
  // the first tab keeps its natural width; the last fills the rest of the strip (RadarOpus)
  const [first, last] = await page.locator('.tabstrip .tab').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({ x: r.x, w: r.width })))
  expect(Math.abs(first.w - 591)).toBeLessThanOrEqual(1)
  expect(last.x + last.w).toBeGreaterThan(list.x + list.width - 2)
  // the document window runs to the desktop's right edge
  const win = (await page.locator('.doc-window').boundingBox())!
  expect(win.x + win.width).toBeGreaterThan(1440 - 12)
})

test('a toolbar button that switches documents moves focus off a tab left focused by a closed tab menu', async ({ page }) => {
  await freshApp(page)
  const tab = page.locator('.tabstrip [role=tab][aria-selected=true]')
  await tab.focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.locator('.menu-list')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tab).toBeFocused()
  // (References, Remedies, ... are list buttons that switch the table of contents; Patients opens a document)
  await page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Patients', exact: true }).click()
  await expect(page.locator('.tabstrip [role=tab][aria-selected=true]')).toContainText('Patients')
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.tab-doc[data-active]'))).toBe(true)
})

test('main toolbar: one tab stop with arrow keys between buttons; clicks leave the keyboard in the document', async ({ page }) => {
  await freshApp(page)
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  expect(await tbar.locator('.tb-btn[tabindex="0"]').count()).toBe(1)
  await tbar.getByRole('button', { name: 'Repertories', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tbar.getByRole('button', { name: 'References', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tbar.getByRole('button', { name: 'Repertories', exact: true })).toBeFocused()
  // Search area works from the book (it opens a search with that scope); History has no ▾
  await expect(tbar.getByRole('button', { name: 'Search area' })).toBeEnabled()
  await expect(tbar.getByRole('button', { name: 'History menu' })).toHaveCount(0)
  // a toolbar click acts on the book and the book keeps the keyboard
  await page.locator('.rv-row').first().click()
  const book = page.locator('.tab-doc[data-active] .rv-scroll')
  await expect(book).toBeFocused()
  await tbar.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(book).toBeFocused()
  await tbar.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect(book).toBeFocused()  // hiding the table of contents while it has the keyboard hands it to the book
  await showToc(page)
  await page.locator('.toc-tree').focus()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await expect(book).toBeFocused()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(book).toBeFocused()
})

test('Window menu lists the open documents and switches to one', async ({ page }) => {
  await freshApp(page)
  await page.keyboard.press('ControlOrMeta+3')
  await expect(page.locator('.pt-list').first()).toBeVisible()
  await (await menubar(page)).getByRole('menuitem', { name: 'Window', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Window' })
  await expect(menu.getByRole('menuitem', { name: 'Close all windows' })).toBeVisible()
  // one entry per open document, by its tab title (RadarOpus): the first tab's comes right after the rule
  const first = menu.locator('[role=separator] ~ [role^=menuitem]').first()
  await expect(first).toBeVisible()
  await first.click()
  await expect(page.locator('.tabstrip [role=tab]').first()).toHaveAttribute('aria-selected', 'true')
})

// ───────── P1: modality, key dispatch, tabs, toasts, menus ─────────

const tabCount = (page: import('@playwright/test').Page) => page.locator('.tabstrip [role=tab]').count()
const focusInDialog = (page: import('@playwright/test').Page) => page.evaluate(() => !!document.activeElement?.closest('[role=dialog][aria-modal=true]'))

test('modal dialogs are modal: global shortcuts are suppressed and the app is inert', async ({ page }) => {
  await freshApp(page)
  await showToc(page)
  const before = await tabCount(page)
  await page.keyboard.press('ControlOrMeta+,')
  const settings = page.getByRole('dialog', { name: /Settings/ })
  await expect(settings).toBeVisible()
  await expect(page.locator('.app-frame')).toHaveAttribute('inert', '')
  for (const k of ['F8', 'F4', 'Alt+w', 'ControlOrMeta+b', 'F7', 'Alt+PageDown', 'ControlOrMeta+1', 'ControlOrMeta+k']) {
    await page.keyboard.press(k)
    expect(await focusInDialog(page), k).toBe(true)
  }
  await expect(settings).toBeVisible()
  expect(await tabCount(page)).toBe(before)
  await expect(page.locator('.pane-left')).toBeVisible()
  await expect(page.locator('.pal')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect(page.locator('.app-frame')).not.toHaveAttribute('inert', '')

  // the same with Find (F2)
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('F2')
  const find = page.getByRole('dialog', { name: /Find|Navigation window/ })
  await expect(find).toBeVisible()
  await page.keyboard.press('F8')
  await page.keyboard.press('Alt+PageDown')
  expect(await focusInDialog(page)).toBe(true)
  expect(await tabCount(page)).toBe(before)
  await page.keyboard.press('Escape')
  await expect(find).toBeHidden()
  // the palette still toggles itself with Ctrl+K
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('.pal')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('.pal')).toHaveCount(0)
})

test('claimed keys never reach the browser: Alt+Left, F3, F6, Ctrl+D, Ctrl+Shift+M', async ({ page }) => {
  await freshApp(page)
  // a listener added after the app's dispatcher sees what it decided
  await page.evaluate(() => {
    const w = window as unknown as { __prevented: Record<string, boolean> }
    w.__prevented = {}
    window.addEventListener('keydown', e => { w.__prevented[`${e.altKey ? 'Alt+' : ''}${e.ctrlKey ? 'Ctrl+' : ''}${e.metaKey ? 'Meta+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`] = e.defaultPrevented })
  })
  // focus outside any view scope (the tab strip), and in a text field
  await page.locator('.tabstrip [role=tab][aria-selected=true]').focus()
  for (const k of ['Alt+ArrowLeft', 'Alt+ArrowRight', 'F3', 'F6', 'ControlOrMeta+d', 'ControlOrMeta+Shift+M']) await page.keyboard.press(k)
  let p = await page.evaluate(() => (window as unknown as { __prevented: Record<string, boolean> }).__prevented)
  const mod = MAC ? 'Meta+' : 'Ctrl+'
  for (const k of ['Alt+ArrowLeft', 'Alt+ArrowRight', 'F3', 'F6', `${mod}d`, `${mod}Shift+M`]) expect(p[k], k).toBe(true)
  await page.getByRole('toolbar', { name: 'Main toolbar' }).locator('.qf-input').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await page.keyboard.press('F3')
  p = await page.evaluate(() => (window as unknown as { __prevented: Record<string, boolean> }).__prevented)
  expect(p['Alt+ArrowLeft']).toBe(true)
  expect(p.F3).toBe(true)
})

test('Ctrl+1..5 are shown as shortcuts in menus', async ({ page }) => {
  await freshApp(page)
  await (await menubar(page)).getByRole('menuitem', { name: 'View', exact: true }).click()
  const item = page.getByRole('menuitem', { name: 'Open list of repertories' })
  await expect(item).toHaveAttribute('aria-keyshortcuts', MAC ? 'Meta+1' : 'Control+1')
  await expect(item.locator('.menu-keys')).toHaveText(MAC ? '⌘1' : 'Ctrl+1')
  // "Open list of references" is the toolbar References list (table of contents), not the Ctrl+2 book tab
  await page.getByRole('menuitem', { name: 'Open list of references', exact: true }).click()
  await expect(page.locator('.toolbar').getByRole('button', { name: 'References', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('recently visited documents stay mounted: switching back does not remount the book', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  await page.evaluate(() => { (document.querySelector('.rv') as unknown as { __mark: number }).__mark = 42 })
  const repTab = page.locator('.tabstrip [role=tab][aria-selected=true]')
  const repId = await repTab.getAttribute('id')
  await page.keyboard.press('ControlOrMeta+3') // patients
  await expect(page.locator('.pt-list').first()).toBeVisible()
  // the hidden book is inert and out of view
  await expect(page.locator('.tab-doc:not([data-active])').first()).toHaveAttribute('inert', '')
  // one round trip first (the first reveal also finishes the hidden pre-render)
  const patId = await page.locator('.tabstrip [role=tab][aria-selected=true]').getAttribute('id')
  await page.locator(`[id="${repId}"]`).click()
  await page.locator(`[id="${patId}"]`).click()
  await expect(page.locator('.pt-list').first()).toBeVisible()
  await settle(page)
  // the best of three switches: one slow frame on a loaded machine is not a remount
  const ms = await page.evaluate(async ([rep, pat]) => {
    const down = (id: string) => (document.getElementById(id) as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    const frame = () => new Promise(r => requestAnimationFrame(() => r(null)))
    let best = Infinity, same = true
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now()
      down(rep)
      await frame()
      best = Math.min(best, performance.now() - t0)
      const rv = document.querySelector('.tab-doc[data-active] .rv') as HTMLElement | null
      same &&= (rv as unknown as { __mark?: number } | null)?.__mark === 42
      down(pat)
      await frame()
      await new Promise(r => setTimeout(r, 200))
    }
    return { ms: best, same }
  }, [repId!, patId!] as const)
  expect(ms.same).toBe(true)
  expect(ms.ms).toBeLessThan(100)
})

test('a chunk that failed to load is retried by Retry; Reload app is offered', async ({ page }) => {
  await freshApp(page)
  let block = true
  await page.route(/(features\/families\/|assets\/)FamiliesView/, route => (block ? route.abort() : route.continue()))
  await page.keyboard.press('ControlOrMeta+5')
  const panel = page.locator('.tab-doc[data-active]')
  await expect(panel.getByRole('button', { name: 'Reload app' })).toBeVisible({ timeout: 15_000 })
  block = false
  await panel.getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('.tab-doc[data-active] .fam-view')).toBeVisible({ timeout: 15_000 })
})

test('tab strip keyboard keeps focus on the tabs; clicking the active tab focuses its document', async ({ page }) => {
  await freshApp(page)
  await page.keyboard.press('ControlOrMeta+3')
  await expect(page.locator('.pt-list').first()).toBeVisible()
  const tabs = page.locator('.tabstrip [role=tab]')
  await tabs.first().click()
  // three more documents: the patient list is no longer mounted and mounts again when arrowed to
  for (let i = 0; i < 3; i++) await newRepertoryTab(page)
  await tabs.first().click()
  // the click continues in the document once it has rendered; only then take focus back to the tab
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.tab-doc[data-active]'))).toBe(true)
  await tabs.first().focus()
  for (const k of ['ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft']) {
    const before = await page.evaluate(() => document.querySelector('.tabstrip [aria-selected=true]')?.id)
    await page.keyboard.press(k)
    // the key moved the selection (Home from the first tab, End from the last: nothing to wait for)
    if (k === 'ArrowRight' || k === 'ArrowLeft') await expect.poll(() => page.evaluate(() => document.querySelector('.tabstrip [aria-selected=true]')?.id)).not.toBe(before)
    await settle(page)
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role')), { message: k }).toBe('tab')
  }
  // a click on the active tab continues in the document's main list
  await page.locator('.tabstrip [role=tab][aria-selected=true]').click()
  await expect.poll(async () => (await activeInfo(page)).inDoc).toBe(true)
  // tabs keep a readable width
  for (let i = 0; i < 8; i++) await newRepertoryTab(page)
  const widths = await page.locator('.tabstrip .tab').evaluateAll(els => els.map(e => e.getBoundingClientRect().width))
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(89)
})

test('toasts: permanent live regions, errors assertive, clear of the clipboard footer', async ({ page }) => {
  await freshApp(page)
  await showClipboardPane(page)
  await expect(page.locator('.toasts [role=status][aria-live=polite]')).toHaveCount(1)
  await expect(page.locator('.toasts [role=alert]')).toHaveCount(1)
  await page.evaluate(async () => {
    const m = await (window as unknown as { __radarModules: { store: () => Promise<{ actions: { toast: (t: string, tone: string) => void } }> } }).__radarModules.store()
    m.actions.toast('Boom', 'error')
  })
  await expect(page.locator('.toasts [role=alert]')).toContainText('Boom')
  await expect(page.locator('.toasts [role=status]')).not.toContainText('Boom')
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Insert')
  // a take shows no card (RadarOpus has none, only the strip count): it is announced by the live region
  await expect(page.locator('.toasts [role=status]')).toContainText('Taken')
  await expect(page.locator('.toast').filter({ hasText: /Taken/ })).toHaveCount(0)
  // a toast with an action: its message is announced by the live region; buttons are outside it
  await page.evaluate(async () => {
    const m = await (window as unknown as { __radarModules: { store: () => Promise<{ actions: { toast: (t: string, tone: string, a: { label: string; run: () => void }) => void } }> } }).__radarModules.store()
    m.actions.toast('Symptom removed', 'info', { label: 'Undo', run: () => {} })
  })
  const toast = page.locator('.toast').filter({ hasText: 'Symptom removed' })
  await expect(toast).toBeVisible()
  await expect(page.locator('.toasts [role=status]')).toContainText('Symptom removed')
  expect(await page.locator('.toasts [role=status] button').count()).toBe(0)
  const t = (await toast.boundingBox())!
  const analyse = page.locator('.pane-right').getByRole('button', { name: /Analyse/ })
  const a = (await analyse.boundingBox())!
  expect(t.y + t.height <= a.y || t.y >= a.y + a.height || t.x >= a.x + a.width || t.x + t.width <= a.x).toBe(true)
  // it sits on the status strip, below the document window: it never covers the book
  const win = (await page.locator('.doc-window').boundingBox())!
  expect(t.y).toBeGreaterThanOrEqual(win.y + win.height - 1)
  // the save indicator is one element and not a live region
  await expect(page.locator('.save-ind')).toHaveAttribute('aria-live', 'off')
  expect(await page.locator('.save-ind[role=status]').count()).toBe(0)
})

test('menus: aria-expanded on menu buttons, names without glyphs, focus returns to the trigger', async ({ page }) => {
  await freshApp(page, 700, 700)
  // a toolbar button with a ▾ menu: the ▾ opens it, ArrowDown on the button too
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  const caret = tbar.getByRole('button', { name: 'Patients menu' })
  await expect(caret).toHaveAttribute('aria-haspopup', 'menu')
  await caret.click()
  await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible()
  await expect(caret).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('menuitem', { name: 'Create a new patient' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(caret).toHaveAttribute('aria-expanded', 'false')
  const patients = tbar.getByRole('button', { name: 'Patients', exact: true })
  await patients.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(patients).toBeFocused()

  await (await menubar(page)).getByRole('menuitem', { name: 'Analysis' }).click()
  // Select your default analysis method is a submenu of the methods (RadarOpus); Escape closes it
  await page.getByRole('menuitem', { name: 'Select your default analysis method' }).hover()
  const methodMenu = page.getByRole('menu', { name: 'Select your default analysis method' })
  await expect(methodMenu.getByRole('menuitemcheckbox', { name: 'Prominence', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(methodMenu).toBeHidden()
  await page.keyboard.press('Escape')

  // File: one Print entry for Ctrl+P
  await (await menubar(page)).getByRole('menuitem', { name: 'File' }).click()
  await expect(page.getByRole('menu', { name: 'File' }).locator(`[aria-keyshortcuts="${MAC ? 'Meta' : 'Control'}+P"]`)).toHaveCount(1)
  await expect(page.getByRole('menuitem', { name: 'Print', exact: true })).toBeVisible()
})

test('dialogs have no header/footer landmarks', async ({ page }) => {
  await freshApp(page)
  await page.keyboard.press('ControlOrMeta+,')
  const dlg = page.getByRole('dialog', { name: /Settings/ })
  await expect(dlg).toBeVisible()
  expect(await dlg.locator('header, footer').count()).toBe(0)
})

test('opening the open repertory again activates it instead of opening another tab', async ({ page }) => {
  await freshApp(page)
  const repTabId = await page.locator('.tabstrip [role=tab][aria-selected=true]').getAttribute('id')
  await page.keyboard.press('ControlOrMeta+3')
  await expect(page.locator('.pt-list').first()).toBeVisible()
  const n = await tabCount(page)
  await page.evaluate(async () => {
    const r = await (window as unknown as { __radarModules: { registry: () => Promise<{ runCommand: (id: string) => boolean }> } }).__radarModules.registry()
    setTimeout(() => r.runCommand('repertory.open.publicum'))
  })
  await expect(page.locator(`[id="${repTabId}"]`)).toHaveAttribute('aria-selected', 'true')
  expect(await tabCount(page)).toBe(n)
})

test('dropping a rubric on a clipboard slot is a standard take: announced, counted on the strip, undoable', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  const chip = page.locator('.clip-slot').nth(1)
  const count = chip.locator('.clip-slot-count')
  const before = Number((await count.textContent()) || 0)
  await chip.evaluate(el => {
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', 'publicum:5')
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  })
  await expect(page.locator('.toasts [role=status]')).toContainText('Taken')
  // no card (RadarOpus shows none): the slot's count is the feedback, Edit › Undo takes it back
  await expect(page.locator('.toast').filter({ hasText: /Taken/ })).toHaveCount(0)
  await expect(count).toHaveText(String(before + 1))
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => Number((await count.textContent()) || 0)).toBe(before)
})

test('360x640: menus fold into "More menus", no horizontal page scroll', async ({ page }) => {
  await freshApp(page, 360, 640)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  const more = (await menubar(page)).getByRole('menuitem', { name: 'More menus' })
  await expect(more).toBeVisible()
  await more.click()
  await page.getByRole('menuitem', { name: 'Help' }).hover()
  await expect(page.getByRole('menu', { name: 'Help' })).toBeVisible()
})

test('after boot the active document\'s main list has focus', async ({ page }) => {
  await freshApp(page)
  await expect.poll(async () => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null
    return !!a?.closest('#document-panel') && !!a.closest('[role=listbox], [role=grid], [role=tree], [role=list], [role=table], [data-main-focus]')
  })).toBe(true)
  const tag = await page.evaluate(() => document.activeElement?.tagName)
  expect(tag).not.toBe('BUTTON')
})

test('context menus, toasts and dialogs sit in labelled landmarks (axe region, landmark-unique)', async ({ page }) => {
  await freshApp(page)
  await page.locator('.rv-row').first().click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible()
  const rules = ['region', 'landmark-unique', 'landmark-no-duplicate-banner', 'landmark-no-duplicate-contentinfo']
  expect((await new AxeBuilder({ page }).withRules(rules).analyze()).violations).toEqual([])
  await page.keyboard.press('Escape')
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('Insert')
  await expect(page.locator('.toast')).toBeVisible()
  expect((await new AxeBuilder({ page }).withRules(rules).analyze()).violations).toEqual([])
  await page.keyboard.press('ControlOrMeta+,')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await new AxeBuilder({ page }).withRules(rules).analyze()).violations).toEqual([])
})

test('File menu offers the patient export; the toolbar Print menu the case report', async ({ page }) => {
  // the case report needs an open case
  await openApp(page, SEEDED)
  await (await menubar(page)).getByRole('menuitem', { name: 'File' }).click()
  const menu = page.getByRole('menu', { name: 'File' })
  await expect(menu.getByRole('menuitem', { name: 'Export patient information' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Print menu' }).click()
  await page.getByRole('menuitem', { name: /Case report/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('a fresh profile boots like RadarOpus: Patients TOC, one book tab, empty clipboards with clipboard 1 marked', async ({ page }) => {
  await openApp(page, FRESH)
  const status = page.getByLabel('Status')
  // the table of contents on show, on the Patients list (its toolbar button checked)
  await expect(page.locator('.pane-left')).toBeVisible()
  await expect(page.getByLabel('Look for patient:')).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Patients', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(status.getByRole('button', { name: /^Hide the table of contents/ })).toBeVisible()
  await expect(status.getByRole('button', { name: 'Expand Toc' })).toBeVisible()
  // a single document tab, the repertory, whose close box sits at the window's right edge
  await expect(page.locator('.tabstrip .tab')).toHaveCount(1)
  const win = (await page.locator('.doc-window').boundingBox())!
  const close = (await page.locator('.tabstrip .tab .tab-close').boundingBox())!
  expect(close.x + close.width).toBeGreaterThan(win.x + win.width - 30)
  // no case open: no counts, clipboard 1 ticked
  const slots = page.getByRole('toolbar', { name: 'Clipboards' }).locator('.clip-slot')
  for (let i = 0; i < 3; i++) await expect(slots.nth(i).locator('.clip-slot-count')).toHaveText('')
  await expect(slots.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(slots.nth(0).locator('.clip-tick')).toHaveCount(1)
  // cmd+F2 hides and shows the table of contents
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(page.locator('.pane-left')).toHaveCount(0)
  await expect(status.getByRole('button', { name: /^Show table of contents/ })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+F2')
  await expect(page.locator('.pane-left')).toBeVisible()
  await expect(status.getByRole('button', { name: /^Hide the table of contents/ })).toBeVisible()
  // a take fills clipboard 1 of a new case
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Insert')
  await expect(slots.nth(0).locator('.clip-slot-count')).toHaveText('1')
})

test('toolbar Back from the analysis returns to the book and its rubric', async ({ page }) => {
  await openApp(page, FRESH)
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('ArrowDown')
  const path = page.getByRole('navigation', { name: 'Symptom path' })
  await expect(path).toContainText(' - ')
  const crumb = (await path.innerText()).replace(/\s+/g, ' ')
  await page.keyboard.press('Insert')
  await page.keyboard.press('F8')
  await expect(page.locator('.tab.active')).not.toContainText('Repertorium')
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  const back = tbar.getByRole('button', { name: 'Back', exact: true })
  await expect(back).toBeEnabled()
  await back.click()
  await expect(page.locator('.tab.active')).toContainText('Repertorium')
  await expect.poll(async () => (await path.innerText()).replace(/\s+/g, ' ')).toBe(crumb)
  // the analysis stays open beside the book
  await expect(page.locator('.tabstrip .tab')).toHaveCount(2)
})

test('Alt+Left from the analysis grid does what the toolbar Back does; Back and Forward stay full colour when they lead nowhere', async ({ page }) => {
  await openApp(page, FRESH)
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  // a fresh book has no history: RadarOpus still draws both arrows in full colour, and a click does nothing
  const start = (await page.getByRole('navigation', { name: 'Symptom path' }).innerText()).replace(/\s+/g, ' ')
  for (const name of ['Back', 'Forward']) {
    const btn = tbar.getByRole('button', { name, exact: true })
    await expect(btn).toBeEnabled()
    expect(Number(await btn.evaluate(e => getComputedStyle(e).opacity))).toBe(1)
    await btn.click()
    expect((await page.getByRole('navigation', { name: 'Symptom path' }).innerText()).replace(/\s+/g, ' ')).toBe(start)
  }
  await page.locator('.rv-scroll').first().focus()
  await page.keyboard.press('ArrowDown')
  const path = page.getByRole('navigation', { name: 'Symptom path' })
  await expect(path).toContainText(' - ')
  const crumb = (await path.innerText()).replace(/\s+/g, ' ')
  await page.keyboard.press('Insert')
  await page.keyboard.press('F8')
  await expect(page.locator('.tab.active')).not.toContainText('Repertorium')
  // nothing lies ahead of the analysis: Forward does nothing there (it never does what Back does)
  await tbar.getByRole('button', { name: 'Forward', exact: true }).click()
  await expect(page.locator('.tab.active')).not.toContainText('Repertorium')
  await expect(tbar.getByRole('button', { name: 'Back', exact: true })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.an-grid, .analysis, [class^="an-"]'))).toBe(true)
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(page.locator('.tab.active')).toContainText('Repertorium')
  await expect.poll(async () => (await path.innerText()).replace(/\s+/g, ' ')).toBe(crumb)
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.rv-scroll'))).toBe(true)
  // Forward from the book now leads back to the analysis the Back left
  const fwd = tbar.getByRole('button', { name: 'Forward', exact: true })
  await expect(fwd).toBeEnabled()
  await fwd.click()
  await expect(page.locator('.tab.active')).not.toContainText('Repertorium')
})

test('History lists the book visit log newest first, with duplicates; Back and Forward move its check mark', async ({ page }) => {
  await openApp(page, FRESH)
  await page.locator('.rv-scroll').first().focus()
  const path = page.getByRole('navigation', { name: 'Symptom path' })
  const go = (i: number) => page.evaluate(async i => {
    const { useApp, actions, selectActiveTab } = await (window as any).__radarModules.store()
    actions.navigateRubric(selectActiveTab(useApp.getState()).id, i)
  }, i)
  for (const i of [0, 1500, 0, 2400]) await go(i)
  const tbar = page.getByRole('toolbar', { name: 'Main toolbar' })
  const hist = tbar.getByRole('button', { name: 'History', exact: true })
  const box = (await hist.boundingBox())!
  await hist.click({ position: { x: 20, y: 20 } })
  const menu = page.locator('.tb-history-menu')
  // opens in the document window (RadarOpus), below the toolbar, its left edge at ~45% of the window
  const mb = (await menu.boundingBox())!
  expect(mb.y).toBeGreaterThan(box.y + box.height)
  expect(Math.abs(mb.x - page.viewportSize()!.width * 0.45)).toBeLessThan(2)
  const rows = menu.locator('.menu-item')
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toHaveText('Clear History')
  await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'true')
  // two spaces before the last segment; the oldest and third entries are the same chapter top
  expect(await rows.nth(1).locator('.menu-text').textContent()).toMatch(/ - {2}\S/)
  expect(await rows.nth(2).locator('.menu-text').textContent()).toBe(await rows.nth(4).locator('.menu-text').textContent())
  await page.keyboard.press('Escape')
  await tbar.getByRole('button', { name: 'Back', exact: true }).click()
  await hist.click({ position: { x: 20, y: 20 } })
  await expect(rows.nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'false')
  // choosing the oldest entry moves there without reordering the log
  await rows.nth(4).click()
  await hist.click({ position: { x: 20, y: 20 } })
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(4)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(path).not.toContainText(' - ')
})

test('choosing a clipboard in the strip with no case open shows no toast', async ({ page }) => {
  await openApp(page, FRESH)
  const slots = page.getByRole('toolbar', { name: 'Clipboards' }).locator('.clip-slot')
  await slots.nth(1).click()
  await expect(slots.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(300)
  await expect(page.getByText('Started an unsaved case')).toHaveCount(0)
})

test('Expand Toc leaves the whole repertory sub-toolbar visible', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 890 })
  await openApp(page, FRESH)
  await page.keyboard.press('ControlOrMeta+F2')
  await page.getByLabel('Status').getByRole('button', { name: 'Expand Toc' }).click()
  const tools = page.locator('.tab-doc[data-active] .rv-tools')
  await expect.poll(() => tools.evaluate(t => t.scrollWidth - t.clientWidth)).toBeLessThanOrEqual(0)
  const win = (await tools.boundingBox())!
  const last = (await tools.locator(':scope > *').last().boundingBox())!
  expect(last.x + last.width).toBeLessThanOrEqual(win.x + win.width)
})

test('a menu opened with the mouse highlights no item; the keyboard starts on the first', async ({ page }) => {
  await openApp(page, FRESH)
  const bar = (await menubar(page))
  await bar.getByRole('menuitem', { name: 'Analysis' }).click()
  const menu = page.getByRole('menu', { name: 'Analysis' })
  await expect(menu).toBeVisible()
  await expect(menu.locator('.menu-item.active')).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await expect(menu.locator('.menu-item.active')).toHaveCount(1)
  await expect(menu.locator('.menu-item.active')).toContainText('symptoms only')
  await page.keyboard.press('Escape')
})

test('a click on bare chrome or a dimmed button leaves the keyboard in the document', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 890 })
  await openApp(page, FRESH)
  const scroll = page.locator('.tab-doc[data-active] .rv-scroll')
  const targets: [string, () => Promise<{ x: number; y: number }>][] = [
    ['dimmed Back', async () => { const b = (await page.getByRole('button', { name: 'Back', exact: true }).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }],
    ['separator', async () => { const b = (await page.locator('.toolbar .tb-sep').first().boundingBox())!; return { x: b.x + 1, y: b.y + b.height / 2 } }],
    ['empty band', async () => { const b = (await page.locator('.toolbar').boundingBox())!; return { x: b.x + b.width - 6, y: b.y + b.height / 2 } }],
    ['clip strip gap', async () => { const b = (await page.locator('.clipstrip').boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height - 20 } }],
  ]
  for (const [what, at] of targets) {
    await scroll.focus()
    const p = await at()
    await page.mouse.click(p.x, p.y)
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('rv-scroll')), { message: what }).toBe(true)
  }
})
