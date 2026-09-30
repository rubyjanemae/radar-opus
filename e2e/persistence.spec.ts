import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp, waitForSaved } from './helpers'

const SHOTS = process.env.SHOTS_DIR

/** Write raw values into the app's IndexedDB store (as an older or corrupted install would have left them). */
async function writeRaw(page: Page, entries: Record<string, unknown>, clear = true) {
  await page.evaluate(async ({ entries, clear }) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('radar-opus')
      r.onupgradeneeded = () => r.result.createObjectStore('workspace')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('workspace', 'readwrite')
      const s = tx.objectStore('workspace')
      if (clear) s.clear()
      for (const [k, v] of Object.entries(entries)) s.put(v, k)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, { entries, clear })
}

async function readKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>(res => {
    const r = indexedDB.open('radar-opus')
    r.onsuccess = () => {
      const req = r.result.transaction('workspace').objectStore('workspace').getAllKeys()
      req.onsuccess = () => { res(req.result.map(String)); r.result.close() }
    }
  }))
}

const patient = { id: 'p1', firstName: 'Ada', lastName: 'Lovelace', birthDate: null, sex: 'female', email: '', phone: '', address: '', occupation: '', notes: '', tags: [], createdAt: 1, updatedAt: 1 }
const consultation = (extra: Record<string, unknown> = {}) => ({
  id: 'c1', patientId: 'p1', date: '2026-01-01', title: 'First consultation', kind: 'first', complaint: 'Headache', notes: '', assessment: '',
  clipboards: [{ id: 'cb1', name: 'Clipboard 1', color: '#2f6fdb', symptoms: [] }],
  analysis: { strategy: 'sum-symptoms-degrees', clipboardIds: ['cb1'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 30 },
  prescriptions: [], createdAt: 1, updatedAt: 1, ...extra,
})
const legacyState = (extra: Record<string, unknown> = {}) => ({
  patients: { p1: patient }, consultations: { c1: consultation() },
  tabs: [{ id: 't1', kind: 'patient', patientId: 'p1' }], activeTabId: 't1', layout: {}, settings: {}, bookmarks: [], rubricNotes: {}, remedyNotes: {},
  recentSearches: [], activeConsultationId: 'c1', activeClipboardId: 'cb1', ...extra,
})

test.describe('restoring saved data', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['tabs: null', { tabs: null }],
    ['tabs: {}', { tabs: {} }],
    ['tab kind weird', { tabs: [{ id: 'w', kind: 'weird' }, { id: 't1', kind: 'patient', patientId: 'p1' }] }],
    ['consultation without clipboards', { consultations: { c1: (() => { const c = consultation(); delete (c as Record<string, unknown>).clipboards; return c })() } }],
  ]
  for (const [name, extra] of cases) {
    test(`boots with ${name} and migrates state-v1 to split keys`, async ({ page }) => {
      await openApp(page)
      // let the first-run save land first: a save still pending would be flushed on pagehide and overwrite the raw data
      await waitForSaved(page)
      await writeRaw(page, { 'state-v1': legacyState(extra) })
      await page.reload()
      await page.waitForSelector('.shell[data-ready]')
      await expect(page.getByLabel('Status')).toContainText('rubrics')
      // the patient survived; open the patients list to see it
      await page.keyboard.press('Control+3')
      await expect(page.locator('.pt-list')).toContainText('Lovelace')
      await waitForSaved(page)
      const keys = await readKeys(page)
      expect(keys).not.toContain('state-v1')
      expect(keys).toEqual(expect.arrayContaining(['workspace', 'p:p1', 'c:c1']))
    })
  }

  test('unusable data shows the rescue card with reset and raw export', async ({ page }) => {
    await openApp(page)
    await waitForSaved(page)
    await writeRaw(page, { workspace: 'garbage', 'p:p1': patient })
    await page.reload()
    const card = page.getByRole('alert')
    await expect(card).toContainText('Your saved workspace could not be restored')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/restore-error.png` })
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Export raw data' }).click()])
    expect(download.suggestedFilename()).toMatch(/^radar-opus-raw-.*\.json$/)
    page.once('dialog', d => void d.accept())
    await Promise.all([page.waitForEvent('load'), card.getByRole('button', { name: 'Reset workspace' }).click()])
    await page.waitForSelector('.shell[data-ready]')
    await expect(page.getByRole('tablist', { name: 'Open documents' })).toBeVisible()
  })
})

test('navigation saves the workspace key only, case edits their record only', async ({ page }) => {
  await openApp(page)
  await waitForSaved(page)
  const writes: string[][] = []
  await page.exposeFunction('__recordWrite', (keys: string[]) => { writes.push(keys) })
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
      ;(window as unknown as { __recordWrite: (k: string[]) => void }).__recordWrite([String(k)])
      return put.call(this, v, k)
    }
  })
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await waitForSaved(page)
  expect(writes.flat().every(k => k === 'workspace')).toBe(true)
  writes.length = 0
  await page.keyboard.press('Insert') // take the rubric into the active case
  await waitForSaved(page)
  const keys = writes.flat()
  expect(keys.filter(k => k.startsWith('c:'))).toHaveLength(1)
  expect(keys.some(k => k.startsWith('p:'))).toBe(false)
})

test('undo names what it undid and restores the active case', async ({ page }) => {
  await openApp(page)
  const status = page.getByLabel('Status')
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Insert')
  await expect(page.locator('.toast').filter({ hasText: /Taken/ })).toBeVisible()
  await page.keyboard.press('Control+z')
  await expect(page.locator('.toast').filter({ hasText: /^Undone: Take/ })).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('.toast').filter({ hasText: /^Redone: Take/ })).toBeVisible()
  await expect(status).toBeVisible()
})

test('toast actions are reachable with Alt+N and stay while focused', async ({ page }) => {
  await page.clock.install()
  await openApp(page)
  await page.locator('.rv-scroll').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Insert')
  const toast = page.locator('.toast').filter({ hasText: /Taken/ })
  await expect(toast).toBeVisible()
  await page.keyboard.press('Alt+n')
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeFocused()
  await page.clock.fastForward(20_000)
  await expect(toast).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/toast-focus.png` })
  await page.keyboard.press('Escape')
  await page.clock.fastForward(20_000)
  await expect(toast).toBeHidden()
})

test('workspace restore asks first, rejects invalid files and can be undone', async ({ page }) => {
  await openApp(page)
  const menu = async () => {
    await page.getByRole('menubar', { name: 'Main menu' }).getByRole('menuitem', { name: 'File', exact: true }).click()
    await page.getByRole('menu').getByRole('menuitem', { name: 'Restore workspace backup…' }).click()
  }
  // invalid file: error toast, nothing changes
  let chooser = page.waitForEvent('filechooser')
  await menu()
  await (await chooser).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'radar-opus-workspace', state: { patients: 'nope' } })) })
  await expect(page.locator('.toast-error')).toContainText('cannot be restored')

  const file = { format: 'radar-opus-workspace', version: 1, state: legacyState({ settings: { theme: 'dark' } }) }
  chooser = page.waitForEvent('filechooser')
  await menu()
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  const dlg = page.getByRole('dialog', { name: 'Restore workspace backup' })
  await expect(dlg).toContainText('1 patient, 1 consultation')
  await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/import-confirm.png` })
  await dlg.getByRole('button', { name: 'Replace workspace' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const toast = page.locator('.toast').filter({ hasText: 'Workspace restored' })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.toast').filter({ hasText: 'Previous workspace put back' })).toBeVisible()
})

test('a restored workspace survives an immediate reload (no stale autosave lands after it)', async ({ page }) => {
  await openApp(page)
  const file = { format: 'radar-opus-workspace', version: 1, state: legacyState({ settings: { theme: 'dark' } }) }
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menubar', { name: 'Main menu' }).getByRole('menuitem', { name: 'File', exact: true }).click()
  await page.getByRole('menu').getByRole('menuitem', { name: 'Restore workspace backup…' }).click()
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await page.getByRole('dialog', { name: 'Restore workspace backup' }).getByRole('button', { name: 'Replace workspace' }).click()
  // the success toast appears only once the restored workspace is written
  await expect(page.locator('.toast').filter({ hasText: 'Workspace restored' })).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('a second tab opens read-only and can take over without losing records', async ({ page, context }) => {
  await openApp(page)
  await waitForSaved(page)
  const second = await context.newPage()
  await second.goto('/')
  await second.waitForSelector('.shell[data-ready]')
  const banner = second.getByRole('status').filter({ hasText: 'Read-only' }).first()
  await expect(second.locator('.app-instance-banner')).toBeVisible()
  await expect(second.locator('.save-ind')).toHaveAttribute('data-state', 'readonly')
  if (SHOTS) await second.screenshot({ path: `${SHOTS}/readonly-banner.png` })
  await expect(banner).toBeVisible()

  // the writer tab creates a patient; the read-only tab follows its saves
  await page.bringToFront()
  await page.keyboard.press('Control+Alt+N')
  const dialog = page.getByRole('dialog', { name: 'New patient' })
  await dialog.getByLabel('Last name').fill('Zebrafinch')
  await dialog.getByRole('button', { name: 'Create patient' }).click()
  await expect(dialog).toBeHidden()
  await waitForSaved(page)

  await second.bringToFront()
  await second.keyboard.press('Control+3')
  await expect(second.locator('.pt-list')).toContainText('Zebrafinch')

  // an edit made while read-only is kept in memory ...
  await second.keyboard.press('Control+Alt+N')
  const dialog2 = second.getByRole('dialog', { name: 'New patient' })
  await dialog2.getByLabel('Last name').fill('Kestrel')
  await dialog2.getByRole('button', { name: 'Create patient' }).click()
  await expect(dialog2).toBeHidden()
  await expect(second.locator('.save-ind')).toHaveAttribute('data-state', 'readonly')

  // ... and merged when this tab takes over: the first tab saves and becomes read-only
  await second.locator('.app-instance-banner').getByRole('button', { name: 'Edit in this tab' }).click()
  await expect(second.locator('.app-instance-banner')).toHaveCount(0)
  await expect(page.locator('.app-instance-banner')).toBeVisible()
  await waitForSaved(second)
  await second.keyboard.press('Control+3')
  await expect(second.locator('.pt-list')).toContainText('Zebrafinch')
  await expect(second.locator('.pt-list')).toContainText('Kestrel')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/readonly-after-handover.png` })

  // both records are on disk: a fresh load of the (now writing) second tab shows them
  await page.close()
  await second.reload()
  await second.waitForSelector('.shell[data-ready]')
  await second.keyboard.press('Control+3')
  await expect(second.locator('.pt-list')).toContainText('Zebrafinch')
  await expect(second.locator('.pt-list')).toContainText('Kestrel')
})

type Bridge = { __radarModules: import('../src/e2eBridge').E2EModules }

test('undo after a tab handover never discards the other tab\'s records', async ({ page, context }) => {
  await openApp(page)
  await waitForSaved(page)
  // tab A takes a rubric into its active case
  const caseA = await page.evaluate(async () => {
    const { actions, useApp } = await (window as unknown as Bridge).__radarModules.store()
    actions.addRubrics(['publicum:120'])
    const s = useApp.getState()
    return { consultation: s.activeConsultationId!, patient: s.consultations[s.activeConsultationId!].patientId }
  })
  await waitForSaved(page)

  // tab B takes over, edits another patient and consultation and creates a patient
  const second = await context.newPage()
  await second.goto('/')
  await second.waitForSelector('.shell[data-ready]')
  await second.locator('.app-instance-banner').getByRole('button', { name: 'Edit in this tab' }).click()
  await expect(second.locator('.app-instance-banner')).toHaveCount(0)
  await expect(page.locator('.app-instance-banner')).toBeVisible()
  const other = await second.evaluate(async (a) => {
    const { actions, useApp } = await (window as unknown as Bridge).__radarModules.store()
    const s = useApp.getState()
    const c = Object.values(s.consultations).find(x => x.patientId !== a.patient)!
    const rx = c.prescriptions.length + 1
    actions.updatePatient(c.patientId, { notes: 'Notes written in tab B' })
    actions.updateConsultation(c.id, { notes: 'Consultation notes from tab B' })
    actions.addPrescription(c.id, { remedyId: 945, potency: '200C', dosage: 'once', date: '2026-09-30', note: 'from tab B' })
    actions.createPatient({ lastName: 'Kestrel', firstName: 'Bea' })
    return { patient: c.patientId, consultation: c.id, rx }
  }, caseA)
  await waitForSaved(second)

  // tab A takes back over and undoes its take: B's records survive, in memory and on disk
  await page.bringToFront()
  await page.locator('.app-instance-banner').getByRole('button', { name: 'Edit in this tab' }).click()
  await expect(page.locator('.app-instance-banner')).toHaveCount(0)
  const check = () => page.evaluate(async ({ a, o }) => {
    const { useApp } = await (window as unknown as Bridge).__radarModules.store()
    const s = useApp.getState()
    return {
      notes: s.patients[o.patient]?.notes, cNotes: s.consultations[o.consultation]?.notes, rx: s.consultations[o.consultation]?.prescriptions.length,
      kestrel: Object.values(s.patients).some(p => p.lastName === 'Kestrel'),
      taken: s.consultations[a.consultation].clipboards.some(cb => cb.symptoms.some(x => x.rubrics.includes('publicum:120'))),
      past: s.past.map(e => e.label),
    }
  }, { a: caseA, o: other })
  await expect.poll(async () => (await check()).kestrel).toBe(true)
  expect((await check()).past).toContain('Take rubric')
  await page.keyboard.press('Control+z')
  await expect(page.locator('.toast').filter({ hasText: 'Undone: Take rubric' })).toBeVisible()
  const after = await check()
  expect(after).toMatchObject({ notes: 'Notes written in tab B', cNotes: 'Consultation notes from tab B', rx: other.rx, kestrel: true, taken: false })
  await waitForSaved(page)
  // B's prescription is shown in A's patient file
  await page.evaluate(async (o) => {
    const { actions } = await (window as unknown as Bridge).__radarModules.store()
    actions.openTab({ kind: 'patient', patientId: o.patient, consultationId: o.consultation })
  }, other)
  await expect(page.locator('.shell')).toContainText('Consultation notes from tab B')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/undo-after-handover.png` })
  await second.close()
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  const reloaded = await check()
  expect(reloaded).toMatchObject({ notes: 'Notes written in tab B', cNotes: 'Consultation notes from tab B', rx: other.rx, kestrel: true, taken: false })
})

test('a corrupt patient record keeps its consultations, backs up the raw data and offers the raw export', async ({ page }) => {
  await openApp(page)
  await waitForSaved(page) // a pending first-run save would overwrite the raw data on pagehide
  const ws = { version: 2, ...legacyState(), patients: undefined, consultations: undefined, tabs: [{ id: 't0', kind: 'patients' }], activeTabId: 't0' }
  await writeRaw(page, { workspace: ws, 'p:p1': 'corrupt-bytes', 'c:c1': consultation({ notes: 'Precious notes' }), 'c:junk': 17 })
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  const toast = page.locator('.toast').filter({ hasText: 'repaired' })
  await expect(toast).toBeVisible()
  await expect(page.locator('.pt-list')).toContainText('Recovered patient')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/recovered-patient.png` })
  const download = page.waitForEvent('download')
  await toast.getByRole('button', { name: 'Export raw data' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^radar-opus-raw-.*\.json$/)
  await waitForSaved(page)
  const keys = await readKeys(page)
  expect(keys).toContain('c:c1')
  expect(keys).toContain('p:p1')
  expect(keys).not.toContain('c:junk')
  const backup = keys.find(k => k.startsWith('backup:before-repair:'))
  expect(backup).toBeDefined()
  const saved = await page.evaluate((key) => new Promise<{ entries: Record<string, unknown> }>(res => {
    const r = indexedDB.open('radar-opus')
    r.onsuccess = () => { const q = r.result.transaction('workspace').objectStore('workspace').get(key); q.onsuccess = () => { res(q.result); r.result.close() } }
  }), backup!)
  expect(saved.entries['p:p1']).toBe('corrupt-bytes')
  expect(saved.entries['c:junk']).toBe(17)
  // the consultation itself is intact
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  await expect(page.locator('.toast').filter({ hasText: 'repaired' })).toHaveCount(0)
  const notes = await page.evaluate(async () => (await (window as unknown as Bridge).__radarModules.store()).useApp.getState().consultations.c1?.notes)
  expect(notes).toBe('Precious notes')
})

test('an unknown saved strategy falls back to the default and the label matches the ranking', async ({ page }) => {
  await openApp(page)
  await waitForSaved(page) // a pending first-run save would overwrite the raw data on pagehide
  const ws = { version: 2, ...legacyState(), patients: undefined, consultations: undefined, tabs: [{ id: 'ta', kind: 'analysis', consultationId: 'c1' }], activeTabId: 'ta' }
  const sym = (id: string, rubric: string, weight: unknown) => ({ id, rubrics: [rubric], combine: 'union', weight, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 1 })
  await writeRaw(page, {
    workspace: ws, 'p:p1': patient,
    'c:c1': consultation({
      clipboards: [{ id: 'cb1', name: 'Clipboard 1', color: '#2f6fdb', symptoms: [sym('s1', 'publicum:120', '3'), sym('s2', 'publicum:5000', 'heavy')] }],
      analysis: { strategy: 'magic-strategy', clipboardIds: ['cb1'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 30, params: { smallRubrics: { threshold: 'x' } } },
    }),
  })
  await page.reload()
  await page.waitForSelector('.shell[data-ready]')
  await expect(page.locator('.toast').filter({ hasText: 'repaired' })).toBeVisible()
  const st = await page.evaluate(async () => {
    const s = (await (window as unknown as Bridge).__radarModules.store()).useApp.getState()
    return { strategy: s.consultations.c1.analysis.strategy, params: s.consultations.c1.analysis.params ?? null, weights: s.consultations.c1.clipboards[0].symptoms.map(x => x.weight) }
  })
  expect(st).toEqual({ strategy: 'sum-symptoms-degrees', params: null, weights: [3, 1] })
  // the analysis names the strategy that ranks
  await expect(page.getByRole('button', { name: 'Analysis method: Sum of symptoms (sort degrees)' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.shell')).not.toContainText('magic-strategy')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/strategy-fallback.png` })
})
