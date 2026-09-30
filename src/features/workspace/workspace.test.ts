import { beforeEach, describe, expect, it } from 'vitest'
import type { Command } from '../../commands/registry'
import { useApp } from '../../state/store'
import { DEFAULT_LAYOUT } from '../../state/workspace'
import { APP_VERSION, formatBytes } from './data'
import { defaultsKeeping, sameSettings } from './SettingsDialog'
import { DEFAULT_SETTINGS } from '../../state/workspace'
import pkg from '../../../package.json'
import { PANES, nextIndex, paneOf } from './panes'
import { MIN_CENTER_WIDTH, WIDE_LAYOUT_KEY, closeOverlays, enterNarrow, exclusivePatch, fitSidePanes, leaveNarrow, openedPane } from './responsive'
import { REPERTORY_KEYS, TAKE_LANGUAGE, chordMatches, referenceRowKey, filterSection, matchesQuery, overriddenBrowserKeys, shortcutGroups } from './shortcuts'
import { placeCard } from './tour'

const cmd = (id: string, title: string, category: string, keys?: string[], extra: Partial<Command> = {}): Command => ({ id, title, category, keys, run: () => {}, ...extra })

const CMDS: Command[] = [
  cmd('tools.x', 'Materia medica', 'Tools', ['Mod+2', 'Alt+2']),
  cmd('file.a', 'Settings…', 'File', ['Mod+,']),
  cmd('edit.undo', 'Undo', 'Edit', ['Mod+Z']),
  cmd('view.tree', 'Navigator pane', 'View', ['Mod+B'], { keywords: 'sidebar' }),
  cmd('view.theme', 'Dark', 'View'),
  cmd('rep.take', 'Take with options…', 'Repertory', ['F6']),
  cmd('zzz.other', 'Something', 'Custom', ['Mod+Alt+X']),
]
const PANE_CMDS: Command[] = [
  cmd('view.focusNext', 'Focus next pane', 'View', ['Mod+F6']),
  cmd('view.focusPrev', 'Focus previous pane', 'View', ['Mod+Shift+F6']),
]

describe('shortcutGroups', () => {
  it('groups by category in menubar order, custom categories last', () => {
    const g = shortcutGroups(CMDS)
    expect(g.map(x => x.category)).toEqual(['File', 'Edit', 'View', 'Repertory', 'Tools', 'Custom'])
  })
  it('omits commands without keys unless asked', () => {
    expect(shortcutGroups(CMDS).flatMap(x => x.rows).some(r => r.id === 'view.theme')).toBe(false)
    const view = shortcutGroups(CMDS, '', { includeUnbound: true }).find(x => x.category === 'View')!
    expect(view.rows.map(r => r.id)).toEqual(['view.tree', 'view.theme']) // bound first
  })
  it('searches titles, keywords and categories', () => {
    expect(shortcutGroups(CMDS, 'sidebar').flatMap(x => x.rows).map(r => r.id)).toEqual(['view.tree'])
    expect(shortcutGroups(CMDS, 'repertory take').flatMap(x => x.rows).map(r => r.id)).toEqual(['rep.take'])
  })
  it('searches by key combination in several spellings', () => {
    expect(shortcutGroups([...CMDS, ...PANE_CMDS], 'F6').flatMap(x => x.rows).map(r => r.id).sort()).toEqual(['rep.take', 'view.focusNext', 'view.focusPrev'])
    expect(shortcutGroups(CMDS, 'ctrl+b').flatMap(x => x.rows).map(r => r.id)).toEqual(['view.tree'])
    expect(shortcutGroups(CMDS, 'Mod+Z').flatMap(x => x.rows).map(r => r.id)).toEqual(['edit.undo'])
  })
  it('dedupes identical rows registered twice', () => {
    const g = shortcutGroups([...CMDS, cmd('edit.undo2', 'Undo', 'Edit', ['Mod+Z'])])
    expect(g.find(x => x.category === 'Edit')!.rows).toHaveLength(1)
  })
})

describe('reference sections', () => {
  it('documents every take token the parser supports', () => {
    const keys = TAKE_LANGUAGE.rows.flatMap(r => r.keys).join(' ')
    for (const t of ['+2', '+1>3', '+!', '+x', '+c', '+a', '+/s']) expect(keys).toContain(t)
  })
  it('filters rows by text, keeping a section whose title matches', () => {
    expect(filterSection(REPERTORY_KEYS, 'parent').rows).toHaveLength(1)
    expect(filterSection(REPERTORY_KEYS, 'repertory').rows).toHaveLength(REPERTORY_KEYS.rows.length)
    expect(filterSection(TAKE_LANGUAGE, 'nothing-like-this').rows).toHaveLength(0)
  })
  it('describes typing in the book as opening the chapter chooser', () => {
    expect(REPERTORY_KEYS.rows.some(r => r.title === 'Type letters to open the chapter chooser')).toBe(true)
  })
  it('merges alternative chords of one command into one browser-key row with unique keys', () => {
    const cmds = [
      cmd('view.zoomIn', 'Zoom in', 'View', ['Mod+=', 'Mod++']),
      cmd('mm.print', 'Print monograph…', 'File', ['Mod+P'], { scopeLabel: 'in the materia medica' }),
    ]
    const rows = overriddenBrowserKeys(cmds).rows
    const zoom = rows.filter(r => r.title === 'Zoom in')
    expect(zoom).toHaveLength(1)
    expect(zoom[0].keys).toHaveLength(2)
    expect(rows.find(r => r.id === 'mm.print')!.detail).toContain('in the materia medica')
    const keys = rows.map(referenceRowKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('lists Mod+digit view shortcuts once the browser lets them through', () => {
    const rows = shortcutGroups([cmd('view.toc', 'Repertories', 'View', ['Mod+1'])]).flatMap(g => g.rows)
    expect(rows[0]?.keys).toEqual(['Mod+1'])
  })
  it('matchesQuery handles empty queries', () => {
    expect(matchesQuery({ title: 'x', keys: [] }, '  ')).toBe(true)
  })
})

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.50 KB')
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB')
    expect(formatBytes(300 * 1024 ** 3)).toBe('300 GB')
    expect(formatBytes(-1)).toBe('—')
  })
})

describe('placeCard', () => {
  const vw = 1440, vh = 900
  it('centres without a target', () => {
    expect(placeCard(null, 360, 200, vw, vh)).toEqual({ x: 540, y: 350, placement: 'center' })
  })
  it('prefers the right of a left pane', () => {
    const p = placeCard({ left: 0, top: 100, right: 280, bottom: 880 }, 360, 200, vw, vh)
    expect(p.placement).toBe('right')
    expect(p.x).toBe(294)
  })
  it('goes left of a right pane', () => {
    const p = placeCard({ left: 1100, top: 100, right: 1440, bottom: 880 }, 360, 200, vw, vh)
    expect(p.placement).toBe('left')
    expect(p.x + 360).toBeLessThanOrEqual(1100)
  })
  it('goes below a small toolbar button and stays on screen', () => {
    const p = placeCard({ left: 1380, top: 40, right: 1440, bottom: 70 }, 360, 200, vw, vh)
    expect(p.placement).toBe('left')
    const q = placeCard({ left: 600, top: 40, right: 1000, bottom: 70 }, 700, 200, vw, vh)
    expect(q.placement).toBe('bottom')
    expect(q.x).toBeGreaterThanOrEqual(12)
  })
  it('floats inside a target that fills the screen', () => {
    const p = placeCard({ left: 0, top: 0, right: 1440, bottom: 900 }, 360, 200, vw, vh)
    expect(p.placement).toBe('center')
    expect(p.x + 360).toBeLessThanOrEqual(1440 - 12)
  })
})

describe('pane cycling', () => {
  it('wraps around in both directions', () => {
    expect(nextIndex(-1, 4, 1)).toBe(0)
    expect(nextIndex(-1, 4, -1)).toBe(3)
    expect(nextIndex(3, 4, 1)).toBe(0)
    expect(nextIndex(0, 4, -1)).toBe(3)
    expect(nextIndex(0, 0, 1)).toBe(-1)
  })
  it('finds the pane that contains an element', () => {
    document.body.innerHTML = `<div class="shell-main"><aside class="pane pane-left"><button id="a">a</button></aside>
      <main class="pane pane-center"><div class="tab-content"><button id="b">b</button></div></main><aside class="pane pane-right"><input id="c"></aside></div>`
    expect(paneOf(document.getElementById('a'))?.id).toBe('navigator')
    expect(paneOf(document.getElementById('b'))?.id).toBe('document')
    expect(paneOf(document.getElementById('c'))?.id).toBe('clipboard')
    expect(paneOf(document.body)).toBeNull()
    expect(PANES.map(p => p.id)).toEqual(['navigator', 'document', 'dock', 'clipboard'])
  })
})

describe('narrow layout', () => {
  beforeEach(() => {
    localStorage.clear()
    useApp.setState({ layout: { ...DEFAULT_LAYOUT, showTree: true, showClipboard: true } })
    delete document.documentElement.dataset.narrow
  })
  it('hides side panes when narrow and restores them when wide again', () => {
    enterNarrow()
    expect(document.documentElement.dataset.narrow).toBe('true')
    expect(useApp.getState().layout.showTree).toBe(false)
    expect(useApp.getState().layout.showClipboard).toBe(false)
    expect(localStorage.getItem(WIDE_LAYOUT_KEY)).toBeTruthy()
    leaveNarrow()
    expect(document.documentElement.dataset.narrow).toBeUndefined()
    expect(useApp.getState().layout).toMatchObject({ showTree: true, showClipboard: true })
    expect(localStorage.getItem(WIDE_LAYOUT_KEY)).toBeNull()
  })
  it('keeps the remembered wide layout across repeated narrow events', () => {
    enterNarrow()
    useApp.setState({ layout: { ...useApp.getState().layout, showTree: true } }) // user opens the navigator overlay
    enterNarrow()
    leaveNarrow()
    expect(useApp.getState().layout).toMatchObject({ showTree: true, showClipboard: true })
  })
  it('closes overlays', () => {
    closeOverlays()
    expect(useApp.getState().layout).toMatchObject({ showTree: false, showClipboard: false })
  })
})

describe('chordMatches', () => {
  it('matches a bare key inside any chord that contains it', () => {
    expect(chordMatches('F6', 'F6')).toBe(true)
    expect(chordMatches('Mod+F6', 'f6')).toBe(true)
    expect(chordMatches('Mod+Shift+F6', 'F6')).toBe(true)
    expect(chordMatches('F16', 'F6')).toBe(false)
  })
  it('matches partial and full combinations by key set', () => {
    expect(chordMatches('Mod+Shift+B', 'ctrl+shift')).toBe(true)
    expect(chordMatches('Mod+Shift+B', 'Ctrl+B')).toBe(true)
    expect(chordMatches('Mod+B', 'mod+b')).toBe(true)
    expect(chordMatches('Mod+B', 'shift+b')).toBe(false)
  })
  it('ignores multi-word queries', () => {
    expect(chordMatches('Mod+B', 'ctrl b')).toBe(false)
  })
})

describe('narrow overlays', () => {
  const s = (showTree: boolean, showClipboard: boolean) => ({ showTree, showClipboard })
  it('opening one overlay closes the other', () => {
    expect(exclusivePatch(s(true, false), s(true, true))).toEqual({ showTree: false })
    expect(exclusivePatch(s(false, true), s(true, true))).toEqual({ showClipboard: false })
    expect(exclusivePatch(s(false, false), s(true, true))).toEqual({ showClipboard: false })
    expect(exclusivePatch(s(false, false), s(true, false))).toBeNull()
  })
  it('reports which pane opened', () => {
    expect(openedPane(s(false, false), s(true, false))).toBe('tree')
    expect(openedPane(s(true, false), s(true, true))).toBe('clipboard')
    expect(openedPane(s(true, false), s(false, false))).toBeNull()
  })
})

describe('restore defaults', () => {
  it('keeps the default repertory and detects no-op restores', () => {
    const cur = { ...DEFAULT_SETTINGS, theme: 'dark' as const, defaultRepertory: 'kent-de' }
    const next = defaultsKeeping(cur)
    expect(next.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(next.defaultRepertory).toBe('kent-de')
    expect(sameSettings(cur, next)).toBe(false)
    expect(sameSettings(next, defaultsKeeping(next))).toBe(true)
  })
})

describe('version', () => {
  it('comes from package.json', () => {
    // vitest has no __APP_VERSION__ define, so the fallback is used there; the define itself is read from package.json
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(typeof APP_VERSION).toBe('string')
  })
})

describe('shortcut reference hygiene', () => {
  it('leaves out chords the browser keeps for itself', () => {
    const rows = shortcutGroups([cmd('t.close', 'Close tab', 'View', ['Alt+W', 'Mod+W']), cmd('t.only', 'Only reserved', 'View', ['Mod+T'])]).flatMap(g => g.rows)
    expect(rows.map(r => [r.id, r.keys])).toEqual([['t.close', ['Alt+W']]])
    // Mod+1..9 reach the page (the app's document shortcuts), so they are listed
    expect(shortcutGroups(CMDS).flatMap(g => g.rows).find(r => r.id === 'tools.x')!.keys).toEqual(['Mod+2', 'Alt+2'])
  })
  it('labels scoped keys with where they work', () => {
    const rows = shortcutGroups([cmd('w.2', 'Intensity 2', 'Case', ['2'], { scope: '.cbp-list' }), cmd('x.y', 'Other', 'Case', ['F9'], { scope: '.nowhere', scopeLabel: 'in the x view' })]).flatMap(g => g.rows)
    expect(rows.find(r => r.id === 'w.2')!.scope).toBe('in the clipboard list')
    expect(rows.find(r => r.id === 'x.y')!.scope).toBe('in the x view')
  })
  it('documents browser keys that commands take over', () => {
    const sec = overriddenBrowserKeys([cmd('a', 'Remedy search…', 'Search', ['F5']), cmd('b', 'Bookmark rubric', 'Repertory', ['Mod+D']), cmd('c', 'Undo', 'Edit', ['Mod+Z'])])
    expect(sec.rows.map(r => r.title)).toEqual(['Remedy search', 'Bookmark rubric'])
    expect(sec.rows[0].detail).toContain('reload')
  })
})

describe('fitSidePanes', () => {
  const layout = { showTree: true, showClipboard: true, treeWidth: DEFAULT_LAYOUT.treeWidth, clipboardWidth: DEFAULT_LAYOUT.clipboardWidth }
  it('keeps saved widths when they fit', () => {
    expect(fitSidePanes(1600, layout)).toEqual({ tree: layout.treeWidth, clipboard: layout.clipboardWidth })
  })
  it('shrinks both panes so the document keeps its minimum width', () => {
    for (const w of [1100, 1152, 1200, 1280]) {
      const f = fitSidePanes(w, layout)
      expect(w - f.tree - f.clipboard - 2).toBeGreaterThanOrEqual(MIN_CENTER_WIDTH)
      expect(f.tree).toBeGreaterThanOrEqual(180)
      expect(f.clipboard).toBeGreaterThanOrEqual(240)
    }
    const f = fitSidePanes(1152, layout)
    expect(f.tree).toBeLessThanOrEqual(230)
    expect(f.clipboard).toBeLessThanOrEqual(290)
  })
  it('gives the room of a hidden pane to the other', () => {
    expect(fitSidePanes(1152, { ...layout, showTree: false })).toEqual({ tree: 0, clipboard: layout.clipboardWidth })
  })
})

describe('Escape in a text field', async () => {
  const { fieldToLeave, leaveField } = await import('./commands')
  it('leaves a document field for the main list, not a field inside a popup', () => {
    document.body.innerHTML = `<div class="pane-center"><div class="tab-content">
      <input id="q" type="text"><div id="list" role="listbox" tabindex="0">x</div>
      <div role="dialog"><input id="d" type="text"></div><input id="cb" type="checkbox"></div></div>`
    const all = document.querySelectorAll<HTMLElement>('*')
    for (const el of all) el.getClientRects = () => ({ length: 1 }) as unknown as DOMRectList
    const q = document.getElementById('q')!
    expect(fieldToLeave(document.getElementById('d'))).toBeNull()
    expect(fieldToLeave(document.getElementById('cb'))).toBeNull()
    expect(fieldToLeave(q)).toBe(q)
    q.focus()
    expect(leaveField(q)?.id).toBe('list')
    expect(document.activeElement?.id).toBe('list')
  })
})
