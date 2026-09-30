import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Catalog, getCatalog, setCatalog } from './catalog'
import { CatalogProvider, useRepertories, useRepertory } from './CatalogContext'
import type { RepertoryFile, RepertoryInfo } from './types'

const info = (abbrev: string): RepertoryInfo =>
  ({ abbrev, title: `Book ${abbrev}`, fullTitle: '', lang: 'en', author: '', year: null, publisher: '', license: '', rubricCount: 2, entryCount: 1, file: `rep-${abbrev}.json` })
const file = (abbrev: string): RepertoryFile =>
  ({ abbrev, title: abbrev, lang: 'en', chapters: [0], text: ['Mind', 'fear'], parent: [-1, 0], depth: [0, 1], chapter: [0, 0], offsets: [0, 0, 1], data: [4] })

/** fetch stub whose responses the test releases by hand. */
function controlledFetch() {
  const waiting = new Map<string, { ok: () => void; fail: (status: number) => void }>()
  const fetch = vi.fn((url: string) => new Promise<Response>(resolve => {
    const abbrev = /rep-(\w+)\.json/.exec(url)![1]
    waiting.set(abbrev, {
      ok: () => resolve(new Response(JSON.stringify(file(abbrev)))),
      fail: status => resolve(new Response('{}', { status })),
    })
  }))
  return { fetch, release: (a: string, status?: number) => act(async () => { const w = waiting.get(a)!; waiting.delete(a); if (status) w.fail(status); else w.ok() }) }
}

afterEach(() => { vi.unstubAllGlobals(); setCatalog(null) })

const wrap = (catalog: Catalog) => ({ children }: { children: ReactNode }) => <CatalogProvider catalog={catalog} prefetch={false}>{children}</CatalogProvider>

describe('useRepertories', () => {
  it('reports loading, failure with a readable message, retry and ready', async () => {
    const f = controlledFetch()
    vi.stubGlobal('fetch', f.fetch)
    const catalog = new Catalog([], [info('a'), info('b')])
    const { result } = renderHook(({ abbrevs }) => useRepertories(abbrevs), { wrapper: wrap(catalog), initialProps: { abbrevs: ['b', 'a', 'a'] } })
    expect(result.current.status).toBe('loading')
    expect(result.current.pending).toEqual(['a', 'b'])
    expect(f.fetch).toHaveBeenCalledTimes(2)

    await f.release('a')
    await waitFor(() => expect(result.current.pending).toEqual(['b']))
    expect(result.current.version).toBe(1)

    await f.release('b', 404)
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.failed).toEqual(['b'])
    expect(result.current.errors.b).toBe('Could not load Book b: the data file is missing on the server.')

    act(() => result.current.retry())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(3))
    await f.release('b')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.failed).toEqual([])
    expect(result.current.version).toBe(2)
    expect(catalog.repertory('b')?.text(1)).toBe('fear')
  })

  it('is ready at once for loaded repertories and for an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(file('a')))))
    const catalog = new Catalog([], [info('a')])
    await catalog.loadRepertory('a')
    const { result, rerender } = renderHook(({ abbrevs }) => useRepertories(abbrevs), { wrapper: wrap(catalog), initialProps: { abbrevs: ['a'] as string[] } })
    expect(result.current.status).toBe('ready')
    rerender({ abbrevs: [] })
    expect(result.current).toMatchObject({ status: 'ready', pending: [], failed: [] })
  })

  it('returns the same object across renders until a repertory arrives (usable as a dependency)', async () => {
    const f = controlledFetch()
    vi.stubGlobal('fetch', f.fetch)
    const catalog = new Catalog([], [info('a')])
    const { result, rerender } = renderHook(({ abbrevs }) => useRepertories(abbrevs), { wrapper: wrap(catalog), initialProps: { abbrevs: ['a'] as string[] } })
    const first = result.current
    rerender({ abbrevs: ['a', 'a'] }) // a new array with the same repertories
    expect(result.current).toBe(first)
    expect(result.current.retry).toBe(first.retry)
    await f.release('a')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).not.toBe(first)
    const ready = result.current
    rerender({ abbrevs: ['a'] })
    expect(result.current).toBe(ready)
    expect(result.current.retry).toBe(first.retry)
  })
})

describe('CatalogProvider', () => {
  it('makes the catalog the getCatalog() singleton and keeps useRepertory working', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(file('a')))))
    const catalog = new Catalog([], [info('a')])
    const { result } = renderHook(() => useRepertory('a'), { wrapper: wrap(catalog) })
    expect(getCatalog()).toBe(catalog)
    await waitFor(() => expect(result.current.rep?.abbrev).toBe('a'))
  })
})
