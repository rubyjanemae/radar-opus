import { describe, expect, it } from 'vitest'
import { actions, useApp } from '../../state/store'
import { applyDefaultMix, deleteMix, saveMix, setDefaultMix, unsetDefaultMix, withMix } from './ops'
import { sanitizeLayout } from '../../state/sanitize'

describe('document mixes', () => {
  it('replaces a mix of the same name', () => {
    expect(withMix([{ name: 'Kent', keys: ['rep:a'] }, { name: 'B', keys: [] }], { name: ' kent ', keys: ['rep:b'] }))
      .toEqual([{ name: 'B', keys: [] }, { name: 'kent', keys: ['rep:b'] }])
  })
  it('saves the checked documents, sets and clears the default, restores it at startup', () => {
    actions.setLayout({ tocChecked: [], docMixes: [], defaultDocMix: '' })
    expect(saveMix('Mine')).toBe(false)
    actions.setLayout({ tocChecked: ['rep:publicum', 'rep:kent-de'] })
    expect(saveMix('Mine')).toBe(true)
    setDefaultMix('Mine')
    expect(useApp.getState().layout.defaultDocMix).toBe('Mine')
    actions.setLayout({ tocChecked: [] })
    applyDefaultMix()
    expect(useApp.getState().layout.tocChecked).toEqual(['rep:publicum', 'rep:kent-de'])
    unsetDefaultMix()
    expect(useApp.getState().layout.defaultDocMix).toBe('')
    setDefaultMix('Mine')
    deleteMix('Mine')
    expect(useApp.getState().layout).toMatchObject({ docMixes: [], defaultDocMix: '' })
  })
  it('sanitizes saved mixes', () => {
    expect(sanitizeLayout({ docMixes: [{ name: 'A', keys: ['rep:x', 3] }, { name: '' }, 'x'], defaultDocMix: 'Z' })).toMatchObject({ docMixes: [{ name: 'A', keys: ['rep:x'] }], defaultDocMix: '' })
  })
})
