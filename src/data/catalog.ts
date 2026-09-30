import manifest from './data-manifest.json'
import { parseJsonOffThread, parseRepertory } from './parse'
import { Repertory } from './repertory'
import type { MateriaMedicaEntry, MateriaMedicaFile, Remedy, RepertoryFile, RepertoryInfo, RubricRef } from './types'

const BASE = `${import.meta.env.BASE_URL}data/`
const HASHES: Record<string, string> = manifest

/**
 * URL of a file in public/data. Files listed in the data manifest (scripts/lib/manifest.mjs)
 * carry their content hash, so a server may cache them immutably: new content, new URL.
 */
export function dataUrl(file: string): string {
  const v = HASHES[file]
  return v ? `${BASE}${file}?v=${v}` : BASE + file
}

/** A data file that could not be fetched or read; `message` is written for the user. */
export class DataLoadError extends Error {
  readonly file: string
  readonly status: number | null
  constructor(message: string, file: string, status: number | null, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'DataLoadError'
    this.file = file
    this.status = status
  }
}

async function fetchData(file: string, what: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(dataUrl(file))
  } catch (e) {
    throw new DataLoadError(`Could not load ${what}: the network request failed. Check the connection and try again.`, file, null, e)
  }
  if (!res.ok) {
    const reason = res.status === 404 ? 'the data file is missing on the server' : `the server answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
    throw new DataLoadError(`Could not load ${what}: ${reason}.`, file, res.status)
  }
  return res
}

const damaged = (what: string, file: string, status: number | null, e: unknown) =>
  new DataLoadError(`Could not load ${what}: the data file is damaged or incomplete.`, file, status, e)

async function getJson<T>(file: string, what = file): Promise<T> {
  const res = await fetchData(file, what)
  try { return await res.json() as T } catch (e) { throw damaged(what, file, res.status, e) }
}

/** Fetch a repertory file and parse it off the main thread where possible. */
async function getRepertoryFile(file: string, what: string): Promise<RepertoryFile> {
  const res = await fetchData(file, what)
  let buf: ArrayBuffer
  try { buf = await res.arrayBuffer() } catch (e) { throw new DataLoadError(`Could not load ${what}: the download was interrupted. Try again.`, file, res.status, e) }
  try { return await parseRepertory(buf) } catch (e) { throw damaged(what, file, res.status, e) }
}

/** Longest main-thread slice of a background build (ms): well under a 50 ms long task. */
const IDLE_SLICE_MS = 10

type IdleDeadline = { timeRemaining(): number; didTimeout: boolean }
type IdleGlobal = { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number }

/** Run `fn` when the browser is idle (a timer where requestIdleCallback is missing). */
function whenIdle(fn: (d: IdleDeadline) => void, timeout = 4000) {
  const ric = (globalThis as IdleGlobal).requestIdleCallback
  if (ric) ric(fn, { timeout })
  else setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: false }), 50)
}

let current: Catalog | null = null

/**
 * The app's catalog, for non-React code (commands, ops). Set by Catalog.load() and by
 * CatalogProvider; throws before the catalog exists.
 */
export function getCatalog(): Catalog {
  if (!current) throw new Error('The catalog is not loaded yet')
  return current
}

/** Make `c` what getCatalog() returns (the provider does this; tests may too). */
export function setCatalog(c: Catalog | null) { current = c }

/** All reference data: remedies, repertories (loaded on demand) and materia medica. */
export class Catalog {
  readonly remedies: Map<number, Remedy>
  readonly remedyByAbbrev: Map<string, Remedy>
  readonly repertoryInfos: RepertoryInfo[]
  private readonly loaded = new Map<string, Repertory>()
  private readonly loading = new Map<string, Promise<Repertory>>()
  private mm: Map<number, MateriaMedicaEntry> | null = null
  private mmLoading: Promise<Map<number, MateriaMedicaEntry>> | null = null
  /** A download of the materia medica started ahead of need (not yet parsed). */
  private mmFetch: Promise<Response> | null = null
  private readonly loadedListeners = new Set<(rep: Repertory) => void>()
  private prefetchStarted = false
  mmInfo: Omit<MateriaMedicaFile, 'remedies'> | null = null

  constructor(remedies: Remedy[], infos: RepertoryInfo[]) {
    this.remedies = new Map(remedies.map(r => [r.id, r]))
    this.remedyByAbbrev = new Map(remedies.map(r => [r.abbrev.toLowerCase(), r]))
    this.repertoryInfos = infos
  }

  static async load(): Promise<Catalog> {
    const [rows, infos] = await Promise.all([
      getJson<[number, string, string, string | null][]>('remedies.json', 'the remedy list'),
      getJson<RepertoryInfo[]>('repertories.json', 'the repertory list'),
    ])
    const c = new Catalog(rows.map(([id, abbrev, name, altName]) => ({ id, abbrev, name, altName })), infos)
    current = c
    return c
  }

  remedy(id: number): Remedy {
    return this.remedies.get(id) ?? { id, abbrev: `#${id}`, name: `Unknown remedy ${id}`, altName: null }
  }

  /** Display title of a repertory ("Repertorium Publicum"); the abbreviation when unknown. */
  repertoryTitle(abbrev: string): string {
    return this.repertoryInfos.find(r => r.abbrev === abbrev)?.title ?? abbrev
  }

  /** Called whenever a repertory finishes loading (e.g. to build derived indexes in idle time). */
  onRepertoryLoaded(fn: (rep: Repertory) => void): () => void {
    this.loadedListeners.add(fn)
    return () => { this.loadedListeners.delete(fn) }
  }

  repertory(abbrev: string): Repertory | undefined { return this.loaded.get(abbrev) }

  /** A load in flight for this repertory (not started, finished or failed: false). */
  isLoading(abbrev: string): boolean { return this.loading.has(abbrev) && !this.loaded.has(abbrev) }

  /**
   * Load a repertory once; concurrent calls share the request. A failed load is forgotten so
   * the next call retries. Rejections are DataLoadErrors with a message fit for the user.
   */
  loadRepertory(abbrev: string): Promise<Repertory> {
    const hit = this.loaded.get(abbrev)
    if (hit) return Promise.resolve(hit)
    let p = this.loading.get(abbrev)
    if (!p) {
      const info = this.repertoryInfos.find(r => r.abbrev === abbrev)
      if (!info) return Promise.reject(new DataLoadError(`Unknown repertory “${abbrev}”: it is not part of this library.`, `rep-${abbrev}.json`, null))
      p = getRepertoryFile(info.file, info.title).then(f => {
        let rep: Repertory
        try { rep = new Repertory(info, f) } catch (e) { throw damaged(info.title, info.file, null, e) }
        this.loaded.set(abbrev, rep)
        this.loading.delete(abbrev)
        for (const fn of this.loadedListeners) { try { fn(rep) } catch (e) { console.error(e) } }
        this.scheduleLowerPaths(rep)
        return rep
      })
      p.catch(() => { if (this.loading.get(abbrev) === p) this.loading.delete(abbrev) })
      this.loading.set(abbrev, p)
    }
    return p
  }

  /** Build the QuickFind path index of a freshly loaded repertory in idle slices. */
  private scheduleLowerPaths(rep: Repertory) {
    if (rep.lowerPathsReady) return
    const step = (d: IdleDeadline) => {
      // one short slice per idle callback, also when the callback timed out, so no slice is a long task
      const t0 = performance.now()
      if (!rep.buildLowerPaths(() => performance.now() - t0 > IDLE_SLICE_MS || (!d.didTimeout && d.timeRemaining() < 2))) whenIdle(step)
    }
    whenIdle(step)
  }

  /**
   * After boot, fetch and parse the other repertories one at a time while the browser is idle,
   * so switching repertory later is instant. Starts `delay` ms after the call, once the start-up
   * work (search and remedy indexes) is done, so it never competes with the first keystrokes.
   * Parsing happens off the main thread (see parse.ts). Failures are silent: an explicit load
   * reports them.
   */
  prefetchRepertories(delay = 5000): void {
    if (this.prefetchStarted) return
    this.prefetchStarted = true
    const queue = this.repertoryInfos.map(i => i.abbrev)
    const next = () => {
      const a = queue.shift()
      if (a === undefined) return
      if (this.loaded.has(a)) { next(); return }
      this.loadRepertory(a).catch(() => {}).finally(() => whenIdle(next, 8000))
    }
    setTimeout(() => whenIdle(next, 8000), delay)
  }

  /** Download the materia medica in the background without parsing it; loadMateriaMedica uses the download. */
  prefetchMateriaMedica(): void {
    if (this.mm || this.mmLoading || this.mmFetch) return
    const p = fetchData('mm-boericke.json', 'the materia medica')
    p.catch(() => { if (this.mmFetch === p) this.mmFetch = null })
    this.mmFetch = p
  }

  /** The Boericke materia medica, loaded once; concurrent calls share the request. */
  loadMateriaMedica(): Promise<Map<number, MateriaMedicaEntry>> {
    if (this.mm) return Promise.resolve(this.mm)
    const early = this.mmFetch
    this.mmFetch = null
    const file = 'mm-boericke.json'
    const parse = async (res: Response) => {
      try { return await parseJsonOffThread<MateriaMedicaFile>(await res.arrayBuffer()) } catch (e) { throw damaged('the materia medica', file, res.status, e) }
    }
    this.mmLoading ??= (early ?? fetchData(file, 'the materia medica')).then(parse).then(f => {
      const { remedies, ...info } = f
      this.mmInfo = info
      this.mm = new Map(remedies.map(r => [r.remedyId, r]))
      return this.mm
    }, e => { this.mmLoading = null; throw e })
    return this.mmLoading
  }

  /** Resolve a RubricRef against loaded repertories. */
  resolve(ref: RubricRef): { rep: Repertory; index: number } | null {
    const { repertory, index } = parseRef(ref)
    const rep = this.loaded.get(repertory)
    return rep && Number.isInteger(index) && index >= 0 && index < rep.size ? { rep, index } : null
  }
}

/** Split "<repertory>:<index>" (the repertory abbreviation may itself contain ':'). */
export function parseRef(ref: RubricRef): { repertory: string; index: number } {
  const i = ref.lastIndexOf(':')
  return { repertory: ref.slice(0, i), index: Number(ref.slice(i + 1)) }
}

export interface RubricLabelParts {
  repertory: string
  index: number
  /** The repertory is loaded and the index exists in it. */
  loaded: boolean
  /** The repertory is part of the library but its book has not arrived yet (show a loading state, not the raw ref). */
  loading: boolean
  /** Display title of the repertory ("Repertorium Publicum"; the abbreviation when unknown), for loading and error text. */
  repertoryTitle: string
  /** Chapter as printed ("Mind"); the repertory title while not loaded. */
  chapter: string
  /** Path below the chapter ("fear, death, of"); empty for a chapter. */
  rest: string
  /** The rubric's own text (last path segment; the chapter in caps for a chapter rubric); "rubric <n>" while not loaded. */
  leaf: string
  /** "MIND - fear, death, of" (chapter in caps); "<title> rubric <n>" while not loaded. */
  full: string
}

/** The canonical text of a rubric reference, for lists, reports and exports. */
export function rubricLabel(catalog: Catalog, ref: RubricRef): RubricLabelParts {
  const { repertory, index } = parseRef(ref)
  const r = catalog.resolve(ref)
  const repertoryTitle = catalog.repertoryTitle(repertory)
  if (!r) {
    const loading = !catalog.repertory(repertory) && catalog.repertoryInfos.some(i => i.abbrev === repertory)
    return { repertory, index, loaded: false, loading, repertoryTitle, chapter: repertoryTitle, rest: `rubric ${index}`, leaf: `rubric ${index}`, full: `${repertoryTitle} rubric ${index}` }
  }
  const [root, ...below] = r.rep.lineage(r.index)
  const chapter = r.rep.text(root)
  const rest = below.map(i => r.rep.text(i)).join(', ')
  const leaf = below.length ? r.rep.text(below[below.length - 1]) : chapter.toUpperCase()
  return { repertory, index, loaded: true, loading: false, repertoryTitle, chapter, rest, leaf, full: rest ? `${chapter.toUpperCase()} - ${rest}` : chapter.toUpperCase() }
}
