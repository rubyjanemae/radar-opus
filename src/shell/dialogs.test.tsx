import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { actions, useApp } from '../state/store'
import { DialogHost } from './DialogHost'
import { getDialog, preloadDialogs, registerLazyDialog } from './dialogs'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => { act(() => actions.closeDialog()); document.body.innerHTML = '' })

describe('lazy dialogs', () => {
  it('imports the dialog on first open, showing a modal loading state meanwhile', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const load = vi.fn(async () => { await gate; return { Hello: ({ name }: { name: string; onClose: () => void }) => <div role="dialog" aria-modal="true" className="hello">Hello {name}</div> } })
    registerLazyDialog('test.hello', load, m => m.Hello, { preload: false })
    expect(getDialog('test.hello')).toBeDefined()
    expect(load).not.toHaveBeenCalled()

    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<DialogHost />) })
    await act(async () => { actions.openDialog('test.hello', { name: 'Ada' }) })
    expect(load).toHaveBeenCalledTimes(1)
    const pending = document.querySelector('.dialog-loading')
    expect(pending?.getAttribute('aria-modal')).toBe('true')
    expect(pending?.getAttribute('aria-busy')).toBe('true')

    await act(async () => { release(); await gate })
    expect(document.querySelector('.dialog-loading')).toBeNull()
    expect(document.querySelector('.hello')?.textContent).toBe('Hello Ada')
    expect(useApp.getState().dialog?.kind).toBe('test.hello')
    act(() => root.unmount())
  })

  it('Escape on the loading state cancels the dialog', async () => {
    registerLazyDialog('test.never', () => new Promise<{ C: () => null }>(() => {}), m => m.C, { preload: false })
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<DialogHost />) })
    await act(async () => { actions.openDialog('test.never') })
    const pending = document.querySelector<HTMLElement>('.dialog-loading')!
    await act(async () => { pending.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(useApp.getState().dialog).toBeNull()
    act(() => root.unmount())
  })

  it('preloads only the dialogs registered for preloading, after the delay, in idle time', async () => {
    vi.useFakeTimers()
    const eager = vi.fn(async () => ({ C: () => null }))
    const heavy = vi.fn(async () => ({ C: () => null }))
    registerLazyDialog('test.eager', eager, m => m.C)
    registerLazyDialog('test.heavy', heavy, m => m.C, { preload: false })
    preloadDialogs(1000)
    await vi.advanceTimersByTimeAsync(900)
    expect(eager).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(6000)
    expect(eager).toHaveBeenCalledTimes(1)
    expect(heavy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
