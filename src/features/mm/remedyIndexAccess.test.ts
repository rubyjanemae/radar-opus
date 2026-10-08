import { describe, expect, it } from 'vitest'
import { tinyRepertory } from '../repertory/fixtures'
import { loadRemedyIndexModule, remedyIndexIfReady, remedyIndexModuleLoaded, remedyIndexNow, warmRemedyIndex } from './remedyIndexAccess'

describe('remedy index access (lazy module)', () => {
  it('answers nothing and throws on a synchronous build until the module is imported', async () => {
    const rep = tinyRepertory()
    expect(remedyIndexModuleLoaded()).toBe(false)
    expect(remedyIndexIfReady(rep)).toBeNull()
    expect(() => remedyIndexNow(rep)).toThrow(/not loaded/)
    await loadRemedyIndexModule()
    expect(remedyIndexModuleLoaded()).toBe(true)
    expect(remedyIndexIfReady(rep)).toBeNull()
    const ix = remedyIndexNow(rep)
    expect(remedyIndexIfReady(rep)).toBe(ix)
  })

  it('warms the index, importing the module first', async () => {
    const rep = tinyRepertory()
    const ix = await warmRemedyIndex(rep, true)
    expect(remedyIndexIfReady(rep)).toBe(ix)
    expect(ix.range(1)[1]).toBeGreaterThan(ix.range(1)[0])
  })
})
