import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './helpers'

/** The two-column book: flow, stepping, tooltips, references and the take bar overlay. */

const doc = '.tab-doc[data-active]'

async function openBook(page: Page) {
  await openApp(page)
  if (!(await page.locator('.rv-scroll').count())) await page.getByRole('button', { name: 'Open repertory' }).first().click()
  await expect(page.locator(`${doc} .rv-row`).first()).toBeVisible()
  await page.locator(`${doc} .rv-scroll`).focus()
}

const go = (page: Page, i: number) => page.evaluate(async i => {
  const m = await (window as unknown as { __radarModules: { store: () => Promise<{ useApp: { getState: () => { activeTabId: string } }; actions: { navigateRubric: (t: string, i: number) => void } }> } }).__radarModules.store()
  m.actions.navigateRubric(m.useApp.getState().activeTabId, i)
}, i)

/**
 * How the two columns stand: the last rubric showing at the bottom of column 1, the first at the top
 * of column 2, and whether any box inside the book is scrolled on its own.
 */
const flow = (page: Page) => page.evaluate(sel => {
  const d = document.querySelector(sel)!
  const clip = d.querySelector('.rv-clip1')!.getBoundingClientRect()
  const c2 = d.querySelector('.rv-col2')!.getBoundingClientRect()
  const rows = (s: string, top: number, bottom: number) => [...d.querySelectorAll<HTMLElement>(`${s} .rv-blk`)]
    .map(e => ({ i: Number(e.dataset.rubric), r: e.getBoundingClientRect() }))
    .filter(x => x.r.bottom > top + 1 && x.r.top < bottom - 1)
    .sort((a, b) => a.r.top - b.r.top)
  const r1 = rows('.rv-col1', clip.top, clip.top + clip.height)
  const r2 = rows('.rv-col2', c2.top, c2.bottom)
  const scrolled = [...d.querySelectorAll<HTMLElement>('.rv-cols, .rv-cols *')].some(e => e.scrollTop || e.scrollLeft)
  return { c1Last: r1.at(-1)?.i ?? -1, c2First: r2[0]?.i ?? -1, c2Top: r2[0] ? r2[0].r.top - c2.top : 0, scrolled }
}, doc)

test('column 2 always continues column 1, even when something scrolls a column-2 row into view', async ({ page }) => {
  await openBook(page)
  const book = page.locator(`${doc} .rv-scroll`)
  const box = (await book.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 200)
  const continues = async () => {
    const f = await flow(page)
    expect(f.scrolled).toBe(false)
    expect([f.c1Last, f.c1Last + 1]).toContain(f.c2First)
  }
  await expect.poll(async () => (await flow(page)).c1Last).toBeGreaterThan(-1)
  await continues()
  // a row rendered ahead in column 2 (below the page) is scrolled into view, as find in page or focus would
  const target = await page.evaluate(sel => {
    const d = document.querySelector(sel)!
    const bottom = d.querySelector('.rv-col2')!.getBoundingClientRect().bottom
    const row = [...d.querySelectorAll<HTMLElement>('.rv-col2 .rv-blk')].filter(e => e.getBoundingClientRect().top > bottom).at(-1)
    row?.scrollIntoView()
    return row ? Number(row.dataset.rubric) : -1
  }, doc)
  expect(target).toBeGreaterThan(0)
  await page.waitForTimeout(300)
  await continues()
  // ... and the flow holds after more wheeling and stepping
  await page.mouse.wheel(0, 150)
  await page.waitForTimeout(300)
  await continues()
  await book.focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  await continues()
})

test('Down leaves the page still while the next rubric starts on it', async ({ page }) => {
  await openBook(page)
  const book = page.locator(`${doc} .rv-scroll`)
  // a rubric whose next few rubrics stand lower down column 1
  await go(page, 1)
  await book.focus()
  await page.waitForTimeout(300)
  const top0 = await book.evaluate(e => e.scrollTop)
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    expect(await book.evaluate(e => e.scrollTop)).toBe(top0)
  }
  // the last rubric starting on the page: one more Down brings the next one on, scrolling as little as needed
  const last = await page.evaluate(sel => {
    const d = document.querySelector(sel)!
    const c2 = d.querySelector('.rv-col2')!.getBoundingClientRect()
    const rows = [...d.querySelectorAll<HTMLElement>('.rv-col2 .rv-row')].filter(e => { const r = e.getBoundingClientRect(); return r.top >= c2.top && r.top + 14 <= c2.bottom })
    return Number(rows.at(-1)!.dataset.rubric)
  }, doc)
  // selected in place (as a click does), not by a jump: a jump to a rubric running past the page shows it at the top
  await page.evaluate(async i => {
    const m = await (window as unknown as { __radarModules: { store: () => Promise<{ useApp: { getState: () => { activeTabId: string } }; actions: { updateTab: (t: string, p: object) => void } }> } }).__radarModules.store()
    m.actions.updateTab(m.useApp.getState().activeTabId, { rubric: i })
  }, last)
  await page.waitForTimeout(300)
  expect(await book.evaluate(e => e.scrollTop)).toBe(top0)
  await book.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => book.evaluate(e => e.scrollTop)).toBeGreaterThan(top0)
})

test('remedy tooltips follow the pointer only, never the keyboard', async ({ page }) => {
  await openBook(page)
  const rem = page.locator(`${doc} .rv-col1 .rv-rem`).nth(5)
  const r = (await rem.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await expect(page.locator('.rv-tip')).toBeVisible()
  // arrowing hides it, and the page moving under the still pointer does not bring it back
  await page.locator(`${doc} .rv-scroll`).focus()
  for (let k = 0; k < 25; k++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400)
  await expect(page.locator('.rv-tip')).toHaveCount(0)
  // nor any hover underline: the remedy now under the still pointer is drawn plain
  const under = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y)?.closest('.rv-rem:not(.g4)')
    return el ? getComputedStyle(el).textDecorationLine : 'none'
  }, [r.x + r.width / 2, r.y + r.height / 2])
  expect(under).toBe('none')
})

test('a chapter heading folds its own remedies under "(n)"; the first rubric follows the band in column 1', async ({ page }) => {
  await openBook(page)
  await go(page, 0)
  const head = page.locator(`${doc} .rv-row.rv-chapter`).first()
  const more = head.locator('.rv-chrems')
  await expect(more).toHaveText(/^\(\d+\)$/)
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await expect(head.locator('.rv-chline')).toHaveCount(0)
  // the first level-1 rubric starts right under the heading band, in column 1
  const next = page.locator(`${doc} .rv-col1 .rv-row[data-rubric="1"]`)
  await expect(next).toBeVisible()
  const hb = (await head.boundingBox())!, nb = (await next.boundingBox())!
  expect(nb.y - (hb.y + hb.height)).toBeLessThan(4)
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await expect(head.locator('.rv-chline .rv-rem').first()).toBeVisible()
  // the heading's "(n)" counts the list once: the paragraph starts with the remedies
  await expect(head.locator('.rv-chline .rv-count')).toHaveCount(0)
  // the context menu toggles it from the keyboard
  await page.locator(`${doc} .rv-scroll`).focus()
  await page.keyboard.press('Shift+F10')
  const item = page.getByRole('menuitemcheckbox', { name: 'Show chapter remedies in the book' })
  await expect(item).toHaveAttribute('aria-checked', 'true')
  await item.click()
  await expect(head.locator('.rv-chline')).toHaveCount(0)
})

test('sub-toolbar toggles: remedy counts and notes in the book', async ({ page }) => {
  await openBook(page)
  await go(page, 1)
  const tools = page.locator(`${doc} .rv-tools`)
  const counts = tools.getByRole('button', { name: 'Remedy counts' })
  await expect(counts).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator(`${doc} .rv-row.rv-current .rv-count`)).toBeVisible()
  await counts.click()
  await expect(counts).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(`${doc} .rv-count`)).toHaveCount(0)
  await counts.click()
  await expect(page.locator(`${doc} .rv-row.rv-current .rv-count`)).toBeVisible()
  // the counts toggle carries a caret: its menu holds the book display toggles
  await tools.getByRole('button', { name: 'Book display options' }).click()
  const countsItem = page.getByRole('menuitemcheckbox', { name: 'Remedy counts' })
  await expect(countsItem).toHaveAttribute('aria-checked', 'true')
  await countsItem.click()
  await expect(counts).toHaveAttribute('aria-pressed', 'false')
  await counts.click()
  await expect(counts).toHaveAttribute('aria-pressed', 'true')
  const notes = tools.getByRole('button', { name: 'Show rubric notes' })
  await expect(notes).toHaveAttribute('aria-pressed', 'true')
  await page.locator(`${doc} .rv-scroll`).focus()
  await page.keyboard.press('ControlOrMeta+Shift+M')
  await page.getByRole('dialog').getByRole('textbox').fill('seen in two cases')
  await page.getByRole('dialog').getByRole('button', { name: /^Save/ }).click()
  await expect(page.locator(`${doc} .rv-row.rv-current .rv-note`)).toHaveText('seen in two cases')
  await notes.click()
  await expect(notes).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(`${doc} .rv-note`)).toHaveCount(0)
  // the gutter still marks the rubric that has one
  await expect(page.locator(`${doc} .rv-row.rv-current .rv-mark-note`)).toBeVisible()
})

test('Kent: a reference the data cut off is muted, and Return on it says why it does not jump', async ({ page }) => {
  await openBook(page)
  await page.evaluate(async () => {
    const r = await (window as unknown as { __radarModules: { registry: () => Promise<{ runCommand: (id: string) => boolean }> } }).__radarModules.registry()
    r.runCommand('repertory.open.kent-de')
  })
  await expect(page.locator(`${doc} .rv-row`).first()).toBeVisible()
  await go(page, 1710)
  const see = page.locator(`${doc} .rv-row.rv-current .rv-see`)
  await expect(see).toHaveText('(siehe … )')
  await expect(see).toHaveClass(/rv-see-dead/)
  await expect(see).toHaveAttribute('title', 'Reference target not in this repertory')
  const grey = await see.evaluate(e => getComputedStyle(e).color)
  const blue = await page.locator(`${doc} .rv-main .rv-text`).first().evaluate(e => getComputedStyle(e).color)
  expect(grey).not.toBe(blue)
  await page.locator(`${doc} .rv-scroll`).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast').last()).toContainText('reference target not in this repertory')
  await expect(page.locator(`${doc} .rv-crumb-last`)).toHaveText('Grobheit')
  // a whole reference stays blue and followable
  await go(page, 18534)
  await expect(page.locator(`${doc} .rv-row.rv-current .rv-see`)).not.toHaveClass(/rv-see-dead/)
})

test('typing + opens the take bar over the book: the columns do not move', async ({ page }) => {
  await openBook(page)
  await go(page, 5)
  const book = page.locator(`${doc} .rv-scroll`)
  await book.focus()
  await page.waitForTimeout(300)
  const before = { h: await book.evaluate(e => e.clientHeight), top: await book.evaluate(e => e.scrollTop), flow: await flow(page) }
  await page.keyboard.type('+1')
  await expect(page.getByRole('dialog', { name: 'Take rubric' })).toBeVisible()
  expect(await book.evaluate(e => e.clientHeight)).toBe(before.h)
  expect(await book.evaluate(e => e.scrollTop)).toBe(before.top)
  const after = await flow(page)
  expect(after.c2First).toBe(before.flow.c2First)
  expect(Math.abs(after.c2Top - before.flow.c2Top)).toBeLessThan(1)
  await page.keyboard.press('Escape')
})

test('a selected chapter: the band covers the heading only; the globe switches repertory', async ({ page }) => {
  await openBook(page)
  await go(page, 0)
  const head = page.locator(`${doc} .rv-chapter.rv-current`).first()
  await expect(head).toBeVisible()
  const band = await head.evaluate(e => parseFloat(getComputedStyle(e, '::before').height))
  const heading = await head.locator('.rv-chhead').evaluate(e => e.getBoundingClientRect().height)
  expect(Math.abs(band - heading)).toBeLessThan(1.5)
  await page.locator(`${doc} .rv-tools`).getByRole('button', { name: 'Repertory and language' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitemcheckbox', { checked: true }).or(menu.getByRole('menuitemradio', { checked: true })).first()).toBeVisible()
  await menu.getByText(/Kent/i).first().click()
  await expect(page.locator('.tab-doc[data-active] .rv-crumbs')).toBeVisible()
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText(/Kent/i)
})
