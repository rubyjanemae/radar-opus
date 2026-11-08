import { describe, expect, it } from 'vitest'
import { Catalog } from '../data/catalog'
import type { RepertoryInfo } from '../data/types'
import { allCommands, BROWSER_RESERVED, displayKey, eventToKeys, getCommand, isReserved, normaliseChord } from '../commands/registry'
import { registerCoreCommands } from '../commands/core'
import type { MenuEntry, MenuItem } from '../ui/Menu'
import { resolveMenuItem } from '../ui/Menu'
import { buildMenus } from './menus'

const info = (abbrev: string, title: string): RepertoryInfo => ({
  abbrev, title, fullTitle: title, lang: 'en', author: 'Test', year: 2000, publisher: 'Test', license: 'GPL v3', rubricCount: 0, entryCount: 0, file: `rep-${abbrev}.json`,
})

/** A catalog with no data files: enough for every feature to register its commands. */
function fakeCatalog() {
  return new Catalog(
    [{ id: 1, abbrev: 'Acon.', name: 'Aconitum napellus', altName: null }, { id: 2, abbrev: 'Bell.', name: 'Belladonna', altName: null }],
    [info('publicum', 'Repertorium Publicum'), info('kent-de', 'Kent (deutsch)')],
  )
}

function commandIds(items: MenuItem[], path: string[] = []): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = []
  for (const it of items) {
    if (it.type === 'separator' || it.type === 'label') continue
    const here = [...path, it.label ?? it.command ?? '?']
    if (it.command) out.push({ id: it.command, path: here.join(' › ') })
    for (const id of it.commands ?? []) out.push({ id, path: here.join(' › ') })
    if (it.submenu) out.push(...commandIds(it.submenu, here))
  }
  return out
}

describe('menus', () => {
  const catalog = fakeCatalog()
  // stub network for features that warm data in the background
  globalThis.fetch = (() => Promise.reject(new Error('offline in tests'))) as typeof fetch
  registerCoreCommands(catalog)
  const menus = buildMenus(catalog)
  const refs = menus.flatMap(m => commandIds(m.items, [m.label]))

  it('references only registered commands', () => {
    const missing = refs.filter(r => !getCommand(r.id)).map(r => `${r.id} (${r.path})`)
    expect(missing).toEqual([])
  })

  it('lists RadarOpus\'s methods in the Analysis › Select your default analysis method submenu', () => {
    const analysis = menus.find(m => m.label === 'Analysis')!.items
    const it2 = analysis.find(i => i.type !== 'separator' && i.type !== 'label' && i.label === 'Select your default analysis method')
    const sub = it2 && 'submenu' in it2 ? it2.submenu ?? [] : []
    expect(sub.map(i => ('label' in i ? i.label : undefined))).toEqual([
      'Sum of symptoms (sorted degrees)', 'Sum of degrees (sorted symptoms)', 'Sum of symptoms and degrees', 'Prominence',
      'Small remedies', 'Small rubrics (SPF)', 'Small remedies and small rubrics', 'Sum of symptoms', 'Sum of degrees',
    ])
    for (const i of sub) expect('command' in i ? i.command : '').toMatch(/^analysis\.default\./)
  })

  it('opens the History popup from View › History (a plain item, no submenu)', () => {
    const view = menus.find(m => m.label === 'View')!.items
    const h = view.find(i => i.type !== 'separator' && i.type !== 'label' && i.label === 'History')
    expect(h && 'command' in h ? h.command : null).toBe('view.history')
  })

  it('uses the RadarOpus menu titles in their order', () => {
    expect(menus.map(m => m.label)).toEqual(['RadarOpus', 'File', 'Edit', 'Additions', 'View', 'Search', 'Take', 'Analysis', 'Tools', 'Window', 'Help'])
  })

  it('lists only RadarOpus items, in RadarOpus wording and order', () => {
    // RadarOpus 4.2.7's menu items (menu titles and item wording; the clone shows those it can perform)
    const RO: Record<string, string[]> = {
      RadarOpus: ['About RadarOpus', 'Preferences...', 'Services', 'Hide RadarOpus', 'Hide Others', 'Show All', 'Quit RadarOpus'],
      File: ['Open FreeNotes', 'News', 'Shop', 'Save selection as a document mix', 'Recall a document mix', 'Select a default document mix', 'Unselect current default document mix', 'Create a new patient', 'Create a new consultation', 'Save patient information', 'Export patient information', 'Send current patient to Clificol', 'Create a new repertory', 'Create a new reference', 'Delete personal repertory and references', 'Print', 'Print preview', 'Print setup'],
      Edit: ['Undo', 'Cut...', 'Copy', 'Paste', 'Copy symptom text only', 'Copy analysis', 'Delete selection', 'Select all', 'Unselect all', 'Open pick list of current field', 'Insert the default value', 'Repeat last prescription'],
      Additions: ['Add a remedy including source information', 'Add a remedy', 'Modify the degree of a remedy', 'Remove a remedy', 'Add a symptom level below the current symptom', 'Modify the current symptom level', 'Remove the current symptom level', 'Add a cross-reference', 'Remove a cross-reference', 'Refer the current symptom to another symptom', 'Remove the referral', 'Add or modify a symptom note', 'Remove a symptom note', 'Add or modify a veterinary symptom note', 'Remove a veterinary symptom note', 'Export additions', 'Import additions'],
      View: ['Table of contents', 'Open list of repertories', 'Open list of references', 'Open list of patients', 'List of remedies', 'List of families', 'Bookmarks', 'Go to the open repertories window', 'Go to the open references window', 'Go to the patient window', 'Go back', 'Go forward', 'History', 'Patient administration', 'Patient consultations', 'List of authors and documents', 'Maps'],
      Search: ['Find a rubric', 'Find a rubric starting from the current rubric', 'Search text in the current document', 'Search', 'Advanced search', 'Search in the patient file', 'Family finder', 'EKAPGPS'],
      Take: ['Take with intensity 1', 'Take with intensity 2', 'Take with intensity 3', 'Take with intensity 4', 'Take with default options', 'Take and specify the options'],
      Analysis: ['Show current analysis with symptoms only', 'Show current analysis with symptoms and remedies', 'Limit to a family', 'Save current analysis', 'Recall an existing analysis', 'Start a new analysis (clear all clipboards)', 'Send current analysis by email', 'Show old analysis with old Remedy', 'Select your default analysis method'],
      Tools: ['Deactivate tooltips', 'User accounts', 'AI Homeopathic Partner', 'Database management', 'Take a screenshot'],
      Window: ['Zoom in', 'Zoom out', 'Next window', 'Previous window', 'Close current window', 'Close all windows'],
    }
    RO.Help = ['RadarOpus manual', 'Advised settings manual', 'Shortcuts list', 'Learning center and videos', 'Ask for support', 'Check for program updates (live update)', 'Check for new content (documents, freenotes, additions)', 'Update your license', 'License information', 'Provings.com', 'Clificol', 'Visit RadarOpus.com', 'Contact us', 'Sign up to newsletter', 'Join our Facebook (meta) private group', 'Welcome page', "What's new in this version"]
    for (const m of menus) {
      const labels = m.items.filter(i => i.type !== 'separator' && i.type !== 'label').map(i => i.label ?? i.command)
      const allowed = RO[m.label]
      expect(labels.filter(l => !allowed.includes(l!)), m.label).toEqual([])
      // RadarOpus order
      expect(labels.map(l => allowed.indexOf(l!)), m.label).toEqual([...labels.map(l => allowed.indexOf(l!))].sort((a, b) => a - b))
    }
  })

  it('offers Print and the patient export in File', () => {
    const file = refs.filter(r => r.path.startsWith('File')).map(r => r.id)
    expect(file).toContain('file.exportCase')
    expect(file).toContain('file.print')
  })

  it('keeps the workspace backup under Tools › Database management', () => {
    const tools = refs.filter(r => r.path.startsWith('Tools › Database management')).map(r => r.id)
    for (const id of ['file.exportWorkspace', 'file.importWorkspace', 'file.importCase']) expect(tools).toContain(id)
  })

  it('reaches the table of contents and the window commands from the menus', () => {
    const view = refs.filter(r => r.path.startsWith('View')).map(r => r.id)
    for (const id of ['view.toc', 'repertory.toc']) expect(view).toContain(id)
    const win = refs.filter(r => r.path.startsWith('Window')).map(r => r.id)
    for (const id of ['view.zoomIn', 'view.zoomOut', 'tab.next', 'tab.prev', 'tab.close', 'window.closeAll']) expect(win).toContain(id)
    expect(displayKey(getCommand('view.toc')!.keys)).toBe('Mod+F2')
  })

  it('gives every registered command a title and category', () => {
    for (const c of allCommands()) {
      expect(c.title, c.id).toBeTruthy()
      expect(c.category, c.id).toBeTruthy()
    }
  })

  it('does not bind one shortcut to two always-on commands in the same scope', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const c of allCommands()) {
      if (c.enabled) continue // context-dependent commands may share keys (e.g. Back in the repertory and MM)
      for (const k of c.keys ?? []) {
        const sig = `${k}@${c.scope ?? ''}`
        const other = seen.get(sig)
        if (other && other !== c.id) clashes.push(`${k}: ${other} / ${c.id}`)
        seen.set(sig, c.id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('never shows a browser-reserved chord as a shortcut (menus, tooltips, palette)', () => {
    const shown: string[] = []
    for (const c of allCommands()) {
      const k = displayKey(c.keys)
      if (k && isReserved(k)) shown.push(`${c.id}: ${k}`)
    }
    expect(shown).toEqual([])
    const walk = (items: MenuItem[]): string[] => items.flatMap(it => {
      if ('type' in it && (it.type === 'separator' || it.type === 'label')) return []
      const r = resolveMenuItem(it as MenuEntry)
      return [...(r.keys && isReserved(r.keys) ? [`${r.label}: ${r.keys}`] : []), ...(r.submenu ? walk(r.submenu) : [])]
    })
    expect(menus.flatMap(m => walk(m.items))).toEqual([])
  })

  it('lists browser-safe tab keys first', () => {
    expect(displayKey(getCommand('tab.close')!.keys)).toBe('Alt+W')
    expect(displayKey(getCommand('tab.next')!.keys)).toBe('Alt+PageDown')
    expect(displayKey(getCommand('tab.prev')!.keys)).toBe('Alt+PageUp')
    // Ctrl+Tab never reaches a page, and eventToKeys reports Ctrl as Mod off the Mac
    for (const id of ['tab.next', 'tab.prev']) expect(getCommand(id)!.keys!.some(k => k.startsWith('Ctrl+'))).toBe(false)
  })

  it('treats a reserved chord as reserved in every spelling', () => {
    for (const k of ['Mod+W', 'Mod+PageDown', 'Mod+Shift+P']) expect(BROWSER_RESERVED.has(k)).toBe(true)
    expect(displayKey(['Mod+W'])).toBeUndefined()
  })

  it('shows Mod+1..5 (the page receives them): documents are one chord away', () => {
    for (let i = 1; i <= 9; i++) expect(isReserved(`Mod+${i}`)).toBe(false)
    expect(displayKey(getCommand('repertory.toc')!.keys)).toBe('Mod+1')
    expect(displayKey(getCommand('mm.open')!.keys)).toBe('Mod+2')
    expect(displayKey(getCommand('patients.open')!.keys)).toBe('Mod+3')
  })

  it('lists one File › Print entry for Ctrl+P, named after the enabled print command, enabled like the toolbar Print', () => {
    const file = menus.find(m => m.label === 'File')!.items
    const printing = file.filter(it => !('type' in it && it.type) && resolveMenuItem(it as MenuEntry).keys === 'Mod+P')
    expect(printing).toHaveLength(1)
    const r = resolveMenuItem(printing[0] as MenuEntry)
    // nothing printable is open in a bare test workspace: it prints the page, like the toolbar's Print
    expect(r.label).toBe('Print')
    expect(r.disabled).toBe(false)
  })

  it('follows RadarOpus order in View (History after Go forward) and Window (open windows after Close all windows)', () => {
    const labels = (m: string) => menus.find(x => x.label === m)!.items.map(i => (i.type === 'separator' ? '|' : i.type === 'label' ? i.label : (i.label ?? i.command)))
    const view = labels('View')
    expect(view.slice(view.indexOf('Go back'), view.indexOf('Go back') + 3)).toEqual(['Go back', 'Go forward', 'History'])
    expect(labels('Window').slice(0, 6)).toEqual(['Zoom in', 'Zoom out', 'Next window', 'Previous window', 'Close current window', 'Close all windows'])
  })
})

describe('shortcut normalisation', () => {
  const ev = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent
  it('matches shifted punctuation by its character', () => {
    expect(eventToKeys(ev('+', { ctrlKey: true, shiftKey: true }))).toBe('Mod++')
    expect(eventToKeys(ev('?', { shiftKey: true }))).toBe('?')
    expect(eventToKeys(ev('K', { ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+K')
    expect(eventToKeys(ev('F6', { ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+F6')
  })
  it('normalises registered chords the same way', () => {
    expect(normaliseChord('Shift+?')).toBe('?')
    expect(normaliseChord('Mod+Shift++')).toBe('Mod++')
    expect(normaliseChord('Mod+Shift+=')).toBe('Mod+=')
    expect(normaliseChord('Mod+Shift+K')).toBe('Mod+Shift+K')
    expect(normaliseChord('+')).toBe('+')
    // '?' opens search through a workspace-scoped alias; F4 stays global on search.open
    expect(getCommand('search.openKey')!.keys).toEqual(['?'])
    expect(getCommand('search.openKey')!.scope).toBeTruthy()
    expect(getCommand('search.open')!.keys).toEqual(['F4'])
  })
})

describe('clipboard chip on-colour text', () => {
  it('uses dark text on light fills and white on dark ones', async () => {
    const { onColor } = await import('./color')
    for (const light of ['#e0a100', '#2e9e5b', '#16a2b8', '#e8680c', '#7cb342']) expect(onColor(light), light).toBe('#1c2129')
    for (const dark of ['#2f6fdb', '#8e44ad', '#c2185b', '#5d4037', '#6c757d']) expect(onColor(dark), dark).toBe('#fff')
  })
})

describe('document window titles', () => {
  it('name a book as RadarOpus does: title, then surname in capitals and initials', async () => {
    const { authorShort } = await import('./tabTitle')
    expect(authorShort('Vladimir Polony')).toBe('POLONY V.')
    expect(authorShort('J. T. Kent')).toBe('KENT J. T.')
    expect(authorShort('Boericke')).toBe('BOERICKE')
  })
})
