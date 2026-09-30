import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openApp, waitForSaved } from './helpers'

test('shell boots with menubar, toolbar, tabs and status bar', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Open documents' })).toBeVisible()
  await expect(page.getByLabel('Status')).toContainText('rubrics')
})

async function freshApp(page: import('@playwright/test').Page, w = 1440, h = 900) {
  await page.setViewportSize({ width: w, height: h })
  await page.addInitScript(() => { try { localStorage.setItem('radar-opus.welcome.v1', 'done') } catch { /* blocked */ } })
  await openApp(page)
  // first-run seeding has settled once autosave has written it
  await waitForSaved(page)
}
const activeInfo = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null
  return { tag: a?.tagName, id: a?.id, role: a?.getAttribute('role'), inDoc: !!a?.closest('#document-panel'), inNav: !!a?.closest('.pane-left'), body: a === document.body }
})

test('tab strip: tabs shrink and scroll inside the document pane; close lives outside role=tab', async ({ page }) => {
  await freshApp(page)
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'New repertory tab' }).click()
  const strip = await page.locator('.tabstrip').boundingBox()
  const right = await page.locator('.pane-right').boundingBox()
  expect(strip!.x + strip!.width).toBeLessThanOrEqual(right!.x + 1)
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
  const bar = page.getByRole('menubar', { name: 'Main menu' })
  expect(await bar.locator('[role=menuitem][tabindex="0"]').count()).toBe(1)
  // only menuitems inside the menubar
  expect(await bar.locator('> :not([role=menuitem])').count()).toBe(0)

  await page.locator('.pane-left [role=treeitem]').first().click()
  const before = await activeInfo(page)
  expect(before.inNav).toBe(true)

  await page.keyboard.press('F10')
  await expect(bar.getByRole('menuitem', { name: 'File' })).toBeFocused()
  await page.keyboard.press('Escape')
  expect(await activeInfo(page)).toEqual(before)

  await page.keyboard.press('F10')
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: 'File' })
  await expect(menu).toBeVisible()
  // the active item is exposed to assistive technology
  const activeId = await menu.getAttribute('aria-activedescendant')
  expect(activeId).toBeTruthy()
  await expect(page.locator(`[id="${activeId}"]`)).toHaveClass(/active/)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  expect(await activeInfo(page)).toEqual(before)

  // a chosen item runs after focus is back: About opens, and closing it restores focus again
  await page.keyboard.press('F10')
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /About/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(await activeInfo(page)).toEqual(before)
})

test('closing a tab with Alt+W moves focus into the next document', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('button', { name: 'New repertory tab' }).click()
  await page.locator('#document-panel').click({ position: { x: 300, y: 200 } })
  await page.keyboard.press('Alt+w')
  await expect.poll(async () => (await activeInfo(page)).inDoc).toBe(true)
})

test('toolbar Take follows ticked search results', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  await waitForSaved(page)
  await page.keyboard.press('F4')
  const input = page.getByPlaceholder(/Words in rubric paths/)
  await input.fill('anxiety')
  const take = page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('button', { name: 'Take rubric' })
  const box = page.locator('.srch-results .srch-cb').first()
  await box.waitFor({ timeout: 20_000 })
  await box.click()
  // ticking a result only changes the search feature's selection store: the toolbar still follows it
  await expect(take).toBeEnabled()
})

test('status bar spells out units; shortcuts reference hides reserved chords', async ({ page }) => {
  await freshApp(page)
  await expect(page.getByLabel('Status')).toContainText(/\d[\d,]* remedies/)
  await expect(page.getByLabel('Status')).toContainText(/\d[\d,]* rubrics/)
  await page.keyboard.press('F1')
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dlg).toBeVisible()
  await expect(dlg).not.toContainText('Ctrl+W')
  await expect(dlg).not.toContainText('Ctrl+Tab')
  await expect(dlg).toContainText('Alt+W')
  await expect(dlg).toContainText('in the clipboard list')
  await expect(dlg).toContainText('Browser keys used by Radar Opus')
  await expect(dlg.locator('kbd', { hasText: /^Shift\+\?$/ })).toHaveCount(0)
})

test('640px wide (200% zoom): toolbar folds, no horizontal page scroll', async ({ page }) => {
  await freshApp(page, 640, 450)
  await expect(page.getByRole('button', { name: 'More tools' })).toBeVisible()
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
  // a minimal devtools hook: count commits in which a named component actually rendered
  await page.addInitScript(() => {
    const w = window as unknown as { __renders: Record<string, number>; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
    w.__renders = {}
    type F = { type: unknown; child: F | null; sibling: F | null; alternate: F | null; memoizedProps: unknown; memoizedState: unknown }
    const seen = new WeakMap<F, { p: unknown; s: unknown }>()
    const nameOf = (t: unknown): string | null => {
      if (typeof t === 'function') return (t as { displayName?: string; name: string }).displayName || (t as { name: string }).name
      const inner = (t as { type?: unknown } | null)?.type
      return typeof inner === 'function' ? nameOf(inner) : null
    }
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject: () => 1, checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
      onCommitFiberRoot(_: unknown, root: { current: F }) {
        const walk = (f: F | null) => {
          for (; f; f = f.sibling) {
            const n = nameOf(f.type)
            if (n) {
              const prev = seen.get(f) ?? (f.alternate ? seen.get(f.alternate) : undefined)
              const rec = { p: f.memoizedProps, s: f.memoizedState }
              if (prev && (prev.p !== rec.p || prev.s !== rec.s)) w.__renders[n] = (w.__renders[n] ?? 0) + 1
              seen.set(f, rec)
              if (f.alternate) seen.set(f.alternate, rec)
            }
            walk(f.child)
          }
        }
        walk(root.current.child)
      },
    }
  })
  await freshApp(page)
  await page.locator('.rv-row').first().click()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(200)
  await page.evaluate(() => { (window as unknown as { __renders: object }).__renders = {} })
  for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(30) }
  await page.waitForTimeout(300)
  const r = await page.evaluate(() => (window as unknown as { __renders: Record<string, number> }).__renders)
  // the book itself did move
  expect(r.RepertoryView ?? 0).toBeGreaterThan(0)
  for (const name of ['MenuBar', 'TabStrip', 'ClipboardPanel', 'AnalysisDock', 'WorkspaceChrome']) expect(r[name] ?? 0, name).toBe(0)
  expect(r.Toolbar ?? 0).toBeLessThanOrEqual(1)
})

test('clipboard chip counts sit inside their chip, beside the number', async ({ page }) => {
  await freshApp(page)
  const chips = page.locator('.clip-chip')
  const n = await chips.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    const chip = await chips.nth(i).boundingBox()
    const sup = await chips.nth(i).locator('sup').boundingBox()
    if (!sup) continue
    expect(sup.x).toBeGreaterThanOrEqual(chip!.x)
    expect(sup.x + sup.width).toBeLessThanOrEqual(chip!.x + chip!.width)
    expect(sup.y).toBeGreaterThanOrEqual(chip!.y)
  }
})

// ───────── P1: modality, key dispatch, tabs, toasts, menus ─────────

const tabCount = (page: import('@playwright/test').Page) => page.locator('.tabstrip [role=tab]').count()
const focusInDialog = (page: import('@playwright/test').Page) => page.evaluate(() => !!document.activeElement?.closest('[role=dialog][aria-modal=true]'))

test('modal dialogs are modal: global shortcuts are suppressed and the app is inert', async ({ page }) => {
  await freshApp(page)
  const before = await tabCount(page)
  await page.keyboard.press('Control+,')
  const settings = page.getByRole('dialog', { name: /Settings/ })
  await expect(settings).toBeVisible()
  await expect(page.locator('.app-frame')).toHaveAttribute('inert', '')
  for (const k of ['F8', 'F4', 'Alt+w', 'Control+b', 'F7', 'Alt+PageDown', 'Control+1', 'Control+k']) {
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
  const find = page.getByRole('dialog', { name: /Find/ })
  await expect(find).toBeVisible()
  await page.keyboard.press('F8')
  await page.keyboard.press('Alt+PageDown')
  expect(await focusInDialog(page)).toBe(true)
  expect(await tabCount(page)).toBe(before)
  await page.keyboard.press('Escape')
  await expect(find).toBeHidden()
  // the palette still toggles itself with Ctrl+K
  await page.keyboard.press('Control+k')
  await expect(page.locator('.pal')).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(page.locator('.pal')).toHaveCount(0)
})

test('claimed keys never reach the browser: Alt+Left, F3, F6, Ctrl+D, Ctrl+Shift+M', async ({ page }) => {
  await freshApp(page)
  // a listener added after the app's dispatcher sees what it decided
  await page.evaluate(() => {
    const w = window as unknown as { __prevented: Record<string, boolean> }
    w.__prevented = {}
    window.addEventListener('keydown', e => { w.__prevented[`${e.altKey ? 'Alt+' : ''}${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`] = e.defaultPrevented })
  })
  // focus outside any view scope (the tab strip), and in a text field
  await page.locator('.tabstrip [role=tab][aria-selected=true]').focus()
  for (const k of ['Alt+ArrowLeft', 'Alt+ArrowRight', 'F3', 'F6', 'Control+d', 'Control+Shift+M']) await page.keyboard.press(k)
  let p = await page.evaluate(() => (window as unknown as { __prevented: Record<string, boolean> }).__prevented)
  for (const k of ['Alt+ArrowLeft', 'Alt+ArrowRight', 'F3', 'F6', 'Ctrl+d', 'Ctrl+Shift+M']) expect(p[k], k).toBe(true)
  await page.getByRole('toolbar', { name: 'Main toolbar' }).locator('.qf-input').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await page.keyboard.press('F3')
  p = await page.evaluate(() => (window as unknown as { __prevented: Record<string, boolean> }).__prevented)
  expect(p['Alt+ArrowLeft']).toBe(true)
  expect(p.F3).toBe(true)
})

test('Ctrl+1..5 are shown as shortcuts in menus', async ({ page }) => {
  await freshApp(page)
  await page.getByRole('menubar').getByRole('menuitem', { name: 'Repertory' }).click()
  const item = page.getByRole('menuitem', { name: 'Repertories (table of contents)' })
  await expect(item).toHaveAttribute('aria-keyshortcuts', 'Control+1')
  await expect(item.locator('.menu-keys')).toHaveText('Ctrl+1')
  await page.keyboard.press('Escape')
  await page.getByRole('menubar').getByRole('menuitem', { name: 'Tools' }).click()
  await expect(page.getByRole('menuitem', { name: 'Materia medica', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+2')
})

test('recently visited documents stay mounted: switching back does not remount the book', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  await page.evaluate(() => { (document.querySelector('.rv') as unknown as { __mark: number }).__mark = 42 })
  const repTab = page.locator('.tabstrip [role=tab][aria-selected=true]')
  const repId = await repTab.getAttribute('id')
  await page.keyboard.press('Control+3') // patients
  await expect(page.locator('.pt-list').first()).toBeVisible()
  // the hidden book is inert and out of view
  await expect(page.locator('.tab-doc:not([data-active])').first()).toHaveAttribute('inert', '')
  // one round trip first (the first reveal also finishes the hidden pre-render)
  const patId = await page.locator('.tabstrip [role=tab][aria-selected=true]').getAttribute('id')
  await page.locator(`[id="${repId}"]`).click()
  await page.locator(`[id="${patId}"]`).click()
  await page.waitForTimeout(300)
  const ms = await page.evaluate(async id => {
    const t0 = performance.now()
    ;(document.getElementById(id!) as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    await new Promise(r => requestAnimationFrame(() => r(null)))
    const rv = document.querySelector('.tab-doc[data-active] .rv') as HTMLElement | null
    return { ms: performance.now() - t0, same: (rv as unknown as { __mark?: number } | null)?.__mark === 42 }
  }, repId)
  expect(ms.same).toBe(true)
  expect(ms.ms).toBeLessThan(100)
})

test('a chunk that failed to load is retried by Retry; Reload app is offered', async ({ page }) => {
  await freshApp(page)
  let block = true
  await page.route(/(features\/families\/|assets\/)FamiliesView/, route => (block ? route.abort() : route.continue()))
  await page.keyboard.press('Control+5')
  const panel = page.locator('.tab-doc[data-active]')
  await expect(panel.getByRole('button', { name: 'Reload app' })).toBeVisible({ timeout: 15_000 })
  block = false
  await panel.getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('.tab-doc[data-active] .fam-view')).toBeVisible({ timeout: 15_000 })
})

test('tab strip keyboard keeps focus on the tabs; clicking the active tab focuses its document', async ({ page }) => {
  await freshApp(page)
  await page.keyboard.press('Control+3')
  await expect(page.locator('.pt-list').first()).toBeVisible()
  const tabs = page.locator('.tabstrip [role=tab]')
  await tabs.first().click()
  // three more documents: the patient list is no longer mounted and mounts again when arrowed to
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'New repertory tab' }).click()
  await tabs.first().click()
  await tabs.first().focus()
  for (const k of ['ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft']) {
    await page.keyboard.press(k)
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role')), k).toBe('tab')
  }
  // a click on the active tab continues in the document's main list
  await page.locator('.tabstrip [role=tab][aria-selected=true]').click()
  await expect.poll(async () => (await activeInfo(page)).inDoc).toBe(true)
  // tabs keep a readable width
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'New repertory tab' }).click()
  const widths = await page.locator('.tabstrip .tab').evaluateAll(els => els.map(e => e.getBoundingClientRect().width))
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(89)
})

test('toasts: permanent live regions, errors assertive, clear of the clipboard footer', async ({ page }) => {
  await freshApp(page)
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
  const toast = page.locator('.toast').filter({ hasText: /Taken/ })
  await expect(toast).toBeVisible()
  // the message is announced by the live region; buttons are outside it
  await expect(page.locator('.toasts [role=status]')).toContainText('Taken')
  expect(await page.locator('.toasts [role=status] button').count()).toBe(0)
  const t = (await toast.boundingBox())!
  const analyse = page.locator('.pane-right').getByRole('button', { name: /Analyse/ })
  const a = (await analyse.boundingBox())!
  expect(t.y + t.height <= a.y || t.x >= a.x + a.width || t.x + t.width <= a.x).toBe(true)
  // the save indicator is one element and not a live region
  await expect(page.locator('.save-ind')).toHaveAttribute('aria-live', 'off')
  expect(await page.locator('.save-ind[role=status]').count()).toBe(0)
})

test('menus: aria-expanded on menu buttons, names without glyphs, focus returns to the trigger', async ({ page }) => {
  await freshApp(page, 700, 700)
  const more = page.getByRole('button', { name: 'More tools' })
  await expect(more).toHaveAttribute('aria-haspopup', 'menu')
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await expect(more).toBeFocused()
  await more.click()
  await page.keyboard.press('Tab')
  await expect(more).toBeFocused()

  await page.getByRole('menubar').getByRole('menuitem', { name: 'View' }).click()
  const theme = page.getByRole('menuitem', { name: 'Theme' })
  await expect(theme).toHaveAttribute('aria-expanded', 'false')
  await theme.hover()
  await expect(theme).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeVisible()
  // the check glyph and shortcut are not part of the name
  await expect(page.getByRole('menuitem', { name: 'Zoom in', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // File: one Print… entry for Ctrl+P
  await page.getByRole('menubar').getByRole('menuitem', { name: 'File' }).click()
  await expect(page.getByRole('menu', { name: 'File' }).locator('[aria-keyshortcuts="Control+P"]')).toHaveCount(1)
  await expect(page.getByRole('menuitem', { name: 'Print…' })).toBeVisible()
})

test('dialogs have no header/footer landmarks', async ({ page }) => {
  await freshApp(page)
  await page.keyboard.press('Control+,')
  const dlg = page.getByRole('dialog', { name: /Settings/ })
  await expect(dlg).toBeVisible()
  expect(await dlg.locator('header, footer').count()).toBe(0)
})

test('toolbar repertory picker: names the last repertory elsewhere; an open repertory is activated', async ({ page }) => {
  await freshApp(page)
  const picker = page.getByRole('toolbar', { name: 'Main toolbar' }).getByRole('combobox', { name: 'Repertory' })
  const current = await picker.evaluate((s: HTMLSelectElement) => s.selectedOptions[0].text)
  const repTabId = await page.locator('.tabstrip [role=tab][aria-selected=true]').getAttribute('id')
  await page.keyboard.press('Control+3')
  await expect(page.locator('.pt-list').first()).toBeVisible()
  await expect(picker).toHaveClass(/tool-select-dim/)
  expect(await picker.evaluate((s: HTMLSelectElement) => s.selectedOptions[0].text)).toBe(current)
  const n = await tabCount(page)
  const value = await picker.evaluate((s: HTMLSelectElement) => [...s.options].find(o => o.text === s.selectedOptions[0].text && o.value)!.value)
  await picker.selectOption(value)
  await expect(page.locator(`[id="${repTabId}"]`)).toHaveAttribute('aria-selected', 'true')
  expect(await tabCount(page)).toBe(n)
})

test('dropping a rubric on a clipboard chip takes it with the standard toast and Undo', async ({ page }) => {
  await freshApp(page)
  await expect(page.locator('.rv-row').first()).toBeVisible()
  const chip = page.locator('.clip-chip').nth(1)
  await chip.evaluate(el => {
    const dt = new DataTransfer()
    dt.setData('application/x-rubric-ref', 'publicum:5')
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  })
  const toast = page.locator('.toast').filter({ hasText: /Taken/ })
  await expect(toast).toBeVisible()
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
})

test('360x640: menus fold into "More menus", no horizontal page scroll', async ({ page }) => {
  await freshApp(page, 360, 640)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  const more = page.getByRole('menubar').getByRole('menuitem', { name: 'More menus' })
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
  await page.keyboard.press('Control+,')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await new AxeBuilder({ page }).withRules(rules).analyze()).violations).toEqual([])
})
