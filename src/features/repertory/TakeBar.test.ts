import { describe, expect, it } from 'vitest'
import { replayKey, takeBarKey } from './TakeBar'

describe('takeBarKey', () => {
  it('Escape cancels, Enter takes, Backspace on a bare + cancels', () => {
    expect(takeBarKey({ key: 'Escape' }, '+2')).toBe('cancel')
    expect(takeBarKey({ key: 'Enter' }, '+2')).toBe('take')
    expect(takeBarKey({ key: 'Enter', ctrlKey: true }, '+')).toBe('take')
    expect(takeBarKey({ key: 'Backspace' }, '+')).toBe('cancel')
    expect(takeBarKey({ key: 'Backspace' }, '+2')).toBe('edit')
  })
  it('mini-language characters edit the command', () => {
    for (const k of ['2', '>', '!', 'x', 'a', '/', 's']) expect(takeBarKey({ key: k }, '+'), k).toBe('edit')
    for (const k of ['a', 'c', 'v', 'z']) expect(takeBarKey({ key: k, ctrlKey: true }, '+2'), k).toBe('edit')
  })
  it('F-keys, navigation keys, Insert and shortcut chords end the command and pass through', () => {
    for (const k of ['F2', 'F5', 'F8', 'F12', 'Insert', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']) expect(takeBarKey({ key: k }, '+2'), k).toBe('pass')
    expect(takeBarKey({ key: '1', ctrlKey: true }, '+')).toBe('pass')
    expect(takeBarKey({ key: '2', altKey: true }, '+')).toBe('pass')
  })
  it('caret keys move the caret in a typed command, but pass through on a bare +', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(takeBarKey({ key: k }, '+'), k).toBe('pass')
      expect(takeBarKey({ key: k }, '+2>3'), k).toBe('edit')
      expect(takeBarKey({ key: k, shiftKey: true }, '+'), k).toBe('edit')
    }
  })
  it('replays a key on another element as a bubbling keydown', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let seen = ''
    window.addEventListener('keydown', e => { seen = `${e.ctrlKey ? 'Ctrl+' : ''}${e.key}` }, { once: true })
    replayKey(new KeyboardEvent('keydown', { key: 'F8', ctrlKey: true }), el)
    expect(seen).toBe('Ctrl+F8')
  })
})
