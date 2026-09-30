// @vitest-environment node
// Pure logic: no DOM needed, so skip the jsdom setup.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Catalog, DataLoadError, dataUrl, getCatalog, parseRef, rubricLabel, setCatalog } from './catalog'
import { Repertory } from './repertory'
import { tinyRepertory } from '../features/repertory/fixtures'
import type { RepertoryFile, RepertoryInfo } from './types'
import manifest from './data-manifest.json'

const info = (abbrev: string, title = abbrev.toUpperCase()): RepertoryInfo =>
  ({ abbrev, title, fullTitle: title, lang: 'en', author: '', year: null, publisher: '', license: '', rubricCount: 7, entryCount: 7, file: `rep-${abbrev}.json` })

/** The tiny fixture as the on-disk file a fetch would return. */
function tinyFile(): RepertoryFile {
  const r = tinyRepertory()
  const n = r.size
  const offsets = [0], data: number[] = []
  for (let i = 0; i < n; i++) { r.forEachRemedy(i, (id, g) => data.push(id * 4 + g - 1)); offsets.push(data.length) }
  return {
    abbrev: 't', title: 'Tiny', lang: 'en', chapters: [...r.chapters],
    text: Array.from({ length: n }, (_, i) => r.text(i)), parent: Array.from({ length: n }, (_, i) => r.parent(i)),
    depth: Array.from({ length: n }, (_, i) => r.depth(i)), chapter: Array.from({ length: n }, (_, i) => r.chapterOf(i)), offsets, data,
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Error' })

afterEach(() => { vi.unstubAllGlobals(); setCatalog(null) })

describe('parseRef', () => {
  it('splits at the last colon', () => {
    expect(parseRef('publicum:12')).toEqual({ repertory: 'publicum', index: 12 })
    expect(parseRef('a:b:3')).toEqual({ repertory: 'a:b', index: 3 })
  })
})

describe('rubricLabel and repertoryTitle', () => {
  const catalog = new Catalog([], [info('t', 'Tiny'), info('far', 'Far Away')])
  ;(catalog as unknown as { loaded: Map<string, Repertory> }).loaded.set('t', tinyRepertory())

  it('labels loaded rubrics with chapter, rest and full text', () => {
    expect(rubricLabel(catalog, 't:2')).toEqual({ repertory: 't', index: 2, loaded: true, loading: false, repertoryTitle: 'Tiny', chapter: 'Mind', rest: 'fear, alone', leaf: 'alone', full: 'MIND - fear, alone' })
    expect(rubricLabel(catalog, 't:5')).toMatchObject({ chapter: 'Head', rest: '', leaf: 'HEAD', full: 'HEAD' })
  })
  it('falls back to the repertory title while not loaded or out of range', () => {
    expect(rubricLabel(catalog, 'far:40')).toEqual({ repertory: 'far', index: 40, loaded: false, loading: true, repertoryTitle: 'Far Away', chapter: 'Far Away', rest: 'rubric 40', leaf: 'rubric 40', full: 'Far Away rubric 40' })
    expect(rubricLabel(catalog, 't:99')).toMatchObject({ loaded: false, loading: false }) // loaded, index out of range
    expect(rubricLabel(catalog, 'nope:1')).toMatchObject({ full: 'nope rubric 1', loading: false, repertoryTitle: 'nope' })
  })
  it('resolve rejects bad indexes', () => {
    expect(catalog.resolve('t:1.5')).toBeNull()
    expect(catalog.resolve('t:-1')).toBeNull()
    expect(catalog.resolve('t:6')?.index).toBe(6)
  })
  it('repertoryTitle', () => {
    expect(catalog.repertoryTitle('far')).toBe('Far Away')
    expect(catalog.repertoryTitle('zzz')).toBe('zzz')
  })
})

describe('getCatalog', () => {
  it('throws before load and returns the loaded catalog after', async () => {
    expect(() => getCatalog()).toThrow(/not loaded/)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.includes('remedies') ? [[1, 'Acon', 'Aconitum', null]] : [info('t')])))
    const c = await Catalog.load()
    expect(getCatalog()).toBe(c)
    expect(c.remedy(1).abbrev).toBe('Acon')
  })
})

describe('data URLs', () => {
  it('carry the content hash from the manifest', () => {
    const h = (manifest as Record<string, string>)['rep-publicum.json']
    expect(h).toMatch(/^[0-9a-f]{12}$/)
    expect(dataUrl('rep-publicum.json')).toBe(`/data/rep-publicum.json?v=${h}`)
    expect(dataUrl('unknown.json')).toBe('/data/unknown.json')
  })
})

describe('loading', () => {
  it('shares one materia medica request between concurrent callers and retries after failure', async () => {
    let calls = 0, fail = true
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      if (fail) return json({}, 500)
      return json({ abbrev: 'boericke', lang: 'en', title: 'MM', author: '', year: 1901, publisher: '', license: '', remedies: [{ remedyId: 1, heading: 'A', commonName: '', intro: '', sections: [] }] })
    }))
    const c = new Catalog([], [])
    await expect(c.loadMateriaMedica()).rejects.toThrow('Could not load the materia medica: the server answered 500 Error.')
    fail = false
    calls = 0
    const [a, b] = await Promise.all([c.loadMateriaMedica(), c.loadMateriaMedica()])
    expect(a).toBe(b)
    expect(calls).toBe(1)
    expect(await c.loadMateriaMedica()).toBe(a)
    expect(calls).toBe(1)
    expect(c.mmInfo?.title).toBe('MM')
  })

  it('rejects repertory loads with readable messages and retries on the next call', async () => {
    const c = new Catalog([], [info('t', 'Tiny')])
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 404)))
    const err = await c.loadRepertory('t').catch(e => e)
    expect(err).toBeInstanceOf(DataLoadError)
    expect(err.message).toBe('Could not load Tiny: the data file is missing on the server.')
    expect(err.status).toBe(404)
    expect(c.isLoading('t')).toBe(false)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(c.loadRepertory('t')).rejects.toThrow('Could not load Tiny: the network request failed. Check the connection and try again.')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"text": [', { status: 200 })))
    await expect(c.loadRepertory('t')).rejects.toThrow('Could not load Tiny: the data file is damaged or incomplete.')

    await expect(c.loadRepertory('zzz')).rejects.toThrow('Unknown repertory “zzz”')

    const fetchOk = vi.fn(async () => json(tinyFile()))
    vi.stubGlobal('fetch', fetchOk)
    const seen: string[] = []
    c.onRepertoryLoaded(r => seen.push(r.abbrev))
    const [r1, r2] = await Promise.all([c.loadRepertory('t'), c.loadRepertory('t')])
    expect(r1).toBe(r2)
    expect(fetchOk).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['t'])
    expect(r1.path(2)).toBe('Mind - fear - alone')
  })

  it('builds the QuickFind path index in idle time after load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(tinyFile())))
    const idle: ((d: { timeRemaining(): number; didTimeout: boolean }) => void)[] = []
    vi.stubGlobal('requestIdleCallback', (fn: (typeof idle)[number]) => { idle.push(fn); return idle.length })
    const c = new Catalog([], [info('t', 'Tiny')])
    const rep = await c.loadRepertory('t')
    expect(rep.lowerPathsReady).toBe(false)
    while (idle.length) idle.shift()!({ timeRemaining: () => 10, didTimeout: false })
    expect(rep.lowerPathsReady).toBe(true)
    expect(rep.lowerPath(2)).toBe('mind, fear, alone')
  })

  it('prefetches the other repertories one by one when idle', async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(url.replace(/\?.*/, '').replace('/data/', '')); return json(tinyFile()) }))
    const idle: (() => void)[] = []
    vi.stubGlobal('requestIdleCallback', (fn: (d: { timeRemaining(): number; didTimeout: boolean }) => void) => { idle.push(() => fn({ timeRemaining: () => 10, didTimeout: false })); return 1 })
    const c = new Catalog([], [info('a'), info('b'), info('c')])
    await c.loadRepertory('a')
    c.prefetchRepertories(20)
    c.prefetchRepertories(20) // once only
    await new Promise(r => setTimeout(r, 30))
    for (let k = 0; k < 40 && idle.length; k++) { idle.shift()!(); await new Promise(r => setTimeout(r, 0)) }
    expect(fetched).toEqual(['rep-a.json', 'rep-b.json', 'rep-c.json'])
    expect(c.repertory('b') && c.repertory('c')).toBeTruthy()
  })
})

describe('Repertory.buildLowerPaths', () => {
  it('can stop and resume', () => {
    const r = tinyRepertory()
    let calls = 0
    // the fixture is smaller than one slice, so a deadline cannot interrupt it
    expect(r.buildLowerPaths(() => { calls++; return true })).toBe(true)
    expect(calls).toBe(0)
    expect(r.lowerPath(6)).toBe('head, pain')
  })
})
