import { describe, expect, it, vi } from 'vitest'
import { Suspense } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { failedModuleUrl, isChunkLoadError, lazyRetry } from './lazyRetry'
import { ErrorBoundary } from './ErrorBoundary'

describe('lazyRetry', () => {
  it('imports again after a failed import when the error boundary retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let calls = 0
    const load = vi.fn(() => {
      calls++
      return calls === 1
        ? Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
        : Promise.resolve({ Hello: () => <p>hello</p> })
    })
    const Hello = lazyRetry(load, m => m.Hello)
    render(<ErrorBoundary label="Doc"><Suspense fallback={<p>loading</p>}><Hello /></Suspense></ErrorBoundary>)
    expect(await screen.findByText('Doc could not be loaded')).toBeTruthy()
    // a chunk error offers a reload besides Retry
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeTruthy()
    // React re-renders after a rejection: that must not start another import by itself
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(await screen.findByText('hello')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reads the failed module URL and recognises chunk errors', () => {
    expect(failedModuleUrl(new TypeError('Failed to fetch dynamically imported module: http://x/assets/A-1.js'))).toBe('http://x/assets/A-1.js')
    expect(failedModuleUrl(new TypeError('error loading dynamically imported module: http://x/a.js'))).toBe('http://x/a.js')
    expect(failedModuleUrl(new Error('boom'))).toBeNull()
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
  })
})
