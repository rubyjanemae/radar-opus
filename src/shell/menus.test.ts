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

  it('has menu entries for repertories and strategies', () => {
    expect(refs.some(r => r.id === 'repertory.open.publicum')).toBe(true)
    expect(refs.some(r => r.id.startsWith('analysis.strategy.'))).toBe(true)
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

  it('lists one File › Print… entry for Ctrl+P, named after the enabled print command', () => {
    const file = menus.find(m => m.label === 'File')!.items
    const printing = file.filter(it => !('type' in it && it.type) && resolveMenuItem(it as MenuEntry).keys === 'Mod+P')
    expect(printing).toHaveLength(1)
    const r = resolveMenuItem(printing[0] as MenuEntry)
    // nothing printable is open in a bare test workspace
    expect(r.label).toBe('Print…')
    expect(r.disabled).toBe(true)
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
