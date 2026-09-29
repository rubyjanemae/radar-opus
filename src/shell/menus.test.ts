import { describe, expect, it } from 'vitest'
import { Catalog } from '../data/catalog'
import type { RepertoryInfo } from '../data/types'
import { allCommands, getCommand } from '../commands/registry'
import { registerCoreCommands } from '../commands/core'
import type { MenuItem } from '../ui/Menu'
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
})
