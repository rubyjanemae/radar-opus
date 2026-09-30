import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ariaKeyShortcut, claimsChord, eventToKeys, installKeybindings, registerCommands } from './registry'

const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })

describe('eventToKeys: macOS Option chords', () => {
  it('reads Option+letter from the physical key when Option changed the character', () => {
    expect(eventToKeys(ev({ key: '∑', code: 'KeyW', altKey: true }))).toBe('Alt+W')
    expect(eventToKeys(ev({ key: 'Dead', code: 'KeyN', altKey: true }))).toBe('Alt+N')
    expect(eventToKeys(ev({ key: '™', code: 'Digit2', altKey: true }))).toBe('Alt+2')
    expect(eventToKeys(ev({ key: '¡', code: 'Digit1', altKey: true }))).toBe('Alt+1')
    expect(eventToKeys(ev({ key: 'ç', code: 'KeyC', altKey: true, ctrlKey: true }))).toBe('Mod+Alt+C')
  })
  it('keeps e.key for plain letters, arrows and non-Alt chords', () => {
    expect(eventToKeys(ev({ key: 'w', code: 'KeyW', altKey: true }))).toBe('Alt+W')
    expect(eventToKeys(ev({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }))).toBe('Alt+ArrowLeft')
    expect(eventToKeys(ev({ key: 'PageDown', code: 'PageDown', altKey: true }))).toBe('Alt+PageDown')
    expect(eventToKeys(ev({ key: 'k', code: 'KeyK', ctrlKey: true }))).toBe('Mod+K')
  })
})

describe('ariaKeyShortcut', () => {
  it('spells chords in aria-keyshortcuts syntax', () => {
    expect(ariaKeyShortcut('Mod+Shift+K')).toBe('Control+Shift+K')
    expect(ariaKeyShortcut('Alt+W')).toBe('Alt+W')
    expect(ariaKeyShortcut('Mod++')).toBe('Control+Plus')
  })
})

describe('claimsChord', () => {
  it('keeps browser actions from the browser even while typing', () => {
    for (const k of ['Alt+ArrowLeft', 'Alt+ArrowRight', 'F3', 'F6', 'Mod+D', 'Mod+Shift+M', 'Mod+P', 'Mod+1', 'Mod+5', 'Mod+9']) expect(claimsChord(k, true), k).toBe(true)
  })
  it('leaves text editing chords to text fields', () => {
    for (const k of ['Mod+Z', 'Mod+A', 'Mod+B', 'Alt+W', 'Space', 'Backspace']) expect(claimsChord(k, true), k).toBe(false)
    expect(claimsChord('Mod+Z', false)).toBe(true)
    expect(claimsChord('Space', false)).toBe(false)
  })
})

describe('installKeybindings', () => {
  let uninstall: () => void
  const ran: string[] = []
  beforeEach(() => {
    ran.length = 0
    document.body.innerHTML = '<div id="app"><button id="b">x</button><div class="scoped" tabindex="0" id="s"></div></div>'
    registerCommands([
      { id: 't.global', title: 'Global', category: 'Test', keys: ['F8'], allowInInput: true, run: () => { ran.push('global') } },
      { id: 't.off', title: 'Off', category: 'Test', keys: ['Mod+D'], enabled: () => false, run: () => { ran.push('off') } },
      { id: 't.scoped', title: 'Scoped', category: 'Test', keys: ['F6'], scope: '.scoped', run: () => { ran.push('scoped') } },
      { id: 't.back', title: 'Back', category: 'Test', keys: ['Alt+ArrowLeft'], scope: '.scoped', run: () => { ran.push('back') } },
      { id: 't.pal', title: 'Pal', category: 'Test', keys: ['Mod+K'], allowInInput: true, inModal: '.pal', run: () => { ran.push('pal') } },
    ])
    uninstall = installKeybindings()
  })
  afterEach(() => { uninstall(); document.body.innerHTML = '' })

  const press = (target: Element, init: KeyboardEventInit) => { const e = ev(init); target.dispatchEvent(e); return e }
  /** Commands run on a microtask (execute catches their errors). */
  const flush = () => new Promise(r => setTimeout(r, 0))

  it('runs commands and prevents the default', async () => {
    const e = press(document.getElementById('b')!, { key: 'F8' })
    await flush()
    expect(ran).toEqual(['global'])
    expect(e.defaultPrevented).toBe(true)
  })

  it('prevents the default of a bound key even when its command is disabled or out of scope', async () => {
    const b = document.getElementById('b')!
    expect(press(b, { key: 'd', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(press(b, { key: 'F6' }).defaultPrevented).toBe(true)
    expect(press(b, { key: 'ArrowLeft', altKey: true }).defaultPrevented).toBe(true)
    await flush()
    expect(ran).toEqual([])
    press(document.getElementById('s')!, { key: 'ArrowLeft', altKey: true })
    await flush()
    expect(ran).toEqual(['back'])
  })

  it('suppresses global shortcuts while a modal is open', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true" class="dlg"><input id="i"></div>')
    const input = document.getElementById('i')!
    const e = press(input, { key: 'F8' })
    await flush()
    expect(ran).toEqual([])
    // F8 is still kept from the browser, but nothing runs
    expect(e.defaultPrevented).toBe(true)
    // native editing keys keep working in the dialog's fields
    expect(press(input, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(false)
  })

  it('lets a modal declare its own shortcuts (the palette closes with Mod+K)', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true" class="pal"><input id="i"></div>')
    press(document.getElementById('i')!, { key: 'k', ctrlKey: true })
    await flush()
    expect(ran).toEqual(['pal'])
    document.querySelector('.pal')!.className = 'other'
    press(document.getElementById('i')!, { key: 'k', ctrlKey: true })
    await flush()
    expect(ran).toEqual(['pal'])
  })

  it('does not act on keys a handler already took', async () => {
    const b = document.getElementById('b')!
    b.addEventListener('keydown', e => e.preventDefault(), { once: true })
    press(b, { key: 'F8' })
    await flush()
    expect(ran).toEqual([])
  })
})

vi.mock('../state/store', () => ({ actions: { toast: () => {} } }))
