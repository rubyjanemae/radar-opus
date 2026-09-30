import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Catalog } from '../../data/catalog'
import type { MateriaMedicaEntry } from '../../data/types'
import { RemedyResolver, normToken, parseAltNames } from './resolve'
import { buildCitations, buildCitationsChunked, buildDocs, groupRelations, parseRelationships, plainText, titleCase } from './text'
import type { Citation, MMDoc, Relation, RelationKind } from './text'

export interface BookItem {
  remedyId: number
  abbrev: string
  title: string
  commonName: string
  /** Upper-case initial for the A–Z index. */
  letter: string
  /** Lower-cased abbrev, name, heading and common name for the filter box. */
  haystack: string
  /** Normalised abbreviation ("nat m") and names (heading, remedy name, aliases, common name) for ranking. */
  abbrevKey: string
  names: string[]
  commonKey: string
}

/**
 * Filter the book's remedy list, best matches first: exact abbreviation, then abbreviation or
 * name prefix, then a word of a name (or the common name) starting with the query, then any
 * substring (every word of the query must occur). Ties keep book (alphabetical) order.
 */
export function filterItems(items: BookItem[], query: string): BookItem[] {
  const q = normToken(query)
  if (!q) return items
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored: { it: BookItem; tier: number; i: number }[] = []
  items.forEach((it, i) => {
    if (!words.every(w => it.haystack.includes(w)) && !it.names.some(n => n.includes(q)) && !it.commonKey.includes(q) && !it.abbrevKey.startsWith(q)) return
    let tier = 4
    if (it.abbrevKey === q) tier = 0
    else if (it.abbrevKey.startsWith(q) || it.names.some(n => n.startsWith(q))) tier = 1
    else if (it.names.some(n => n.includes(' ' + q)) || it.commonKey.startsWith(q) || it.commonKey.includes(' ' + q)) tier = 2
    else if (it.names.some(n => n.includes(q)) || it.commonKey.includes(q)) tier = 3
    scored.push({ it, tier, i })
  })
  return scored.sort((a, b) => a.tier - b.tier || a.i - b.i).map(x => x.it)
}

/**
 * The loaded Boericke book plus lazily built derived data (remedy resolver, search docs,
 * citations, relationships). One instance per catalog.
 */
export class MMBook {
  readonly catalog: Catalog
  readonly entries: Map<number, MateriaMedicaEntry>
  readonly items: BookItem[]
  readonly info: NonNullable<Catalog['mmInfo']>
  private _resolver: RemedyResolver | null = null
  private _docs: MMDoc[] | null = null
  private _citations: Map<number, Citation[]> | null = null
  private readonly relations = new Map<number, { kind: RelationKind; remedies: number[]; clauses: Relation[] }[]>()

  constructor(catalog: Catalog, entries: Map<number, MateriaMedicaEntry>) {
    this.catalog = catalog
    this.entries = entries
    this.info = catalog.mmInfo ?? { abbrev: 'boericke', lang: 'en', title: 'Pocket Manual of Homoeopathic Materia Medica', author: 'William Boericke', year: 1906, publisher: '', license: 'Public domain' }
    this.items = [...entries.values()].map(e => {
      const r = catalog.remedy(e.remedyId)
      // a missing chapter heading ("None" in the source) falls back to the remedy name
      if (!e.heading?.trim() || /^none$/i.test(e.heading.trim())) e.heading = r.name.toUpperCase()
      const title = titleCase(e.heading)
      return {
        remedyId: e.remedyId, abbrev: r.abbrev, title, commonName: commonName(e.commonName),
        letter: (title[0] ?? '#').toUpperCase(),
        haystack: `${r.abbrev} ${r.name} ${r.altName ?? ''} ${e.heading} ${commonName(e.commonName)}`.toLowerCase(),
        abbrevKey: normToken(r.abbrev),
        names: [e.heading, r.name, ...parseAltNames(r.altName)].map(normToken).filter(Boolean),
        commonKey: normToken(commonName(e.commonName)),
      }
    }).sort((a, b) => a.title.localeCompare(b.title))
  }

  get resolver(): RemedyResolver {
    if (!this._resolver) this._resolver = new RemedyResolver(this.catalog.remedies.values(), [...this.entries.values()].map(e => [e.remedyId, e.heading]))
    return this._resolver
  }

  get docs(): MMDoc[] {
    if (!this._docs) this._docs = buildDocs(this.items.map(i => this.entries.get(i.remedyId)!))
    return this._docs
  }

  /** Monograph sections citing each remedy. */
  get citations(): Map<number, Citation[]> {
    if (!this._citations) this._citations = buildCitations(this.items.map(i => this.entries.get(i.remedyId)!), this.resolver)
    return this._citations
  }

  private _citing: Promise<Map<number, Citation[]>> | null = null
  private readonly citationListeners = new Set<() => void>()

  /** The citations if they have been built, else null (never builds). */
  citationsIfReady(): Map<number, Citation[]> | null { return this._citations }

  /** Build the citations in time slices (no long task); repeated calls share one build. */
  warmCitations(): Promise<Map<number, Citation[]>> {
    if (this._citations) return Promise.resolve(this._citations)
    this._citing ??= buildCitationsChunked(this.items.map(i => this.entries.get(i.remedyId)!), this.resolver).then(c => {
      this._citations ??= c
      for (const fn of this.citationListeners) fn()
      return this._citations
    }, e => { this._citing = null; throw e })
    return this._citing
  }

  /** Subscribe to "citations are ready". */
  onCitations = (fn: () => void): (() => void) => {
    this.citationListeners.add(fn)
    return () => { this.citationListeners.delete(fn) }
  }

  has(remedyId: number | null | undefined): boolean { return remedyId != null && this.entries.has(remedyId) }

  relationships(remedyId: number) {
    let r = this.relations.get(remedyId)
    if (!r) {
      const e = this.entries.get(remedyId)
      const sec = e?.sections.filter(s => /relation/i.test(s.heading)) ?? []
      r = groupRelations(sec.flatMap(s => parseRelationships(s.text, this.resolver, remedyId)))
      this.relations.set(remedyId, r)
    }
    return r
  }

  /** "Boericke, Pocket Manual … (1906) · Public domain" */
  get sourceLine(): string {
    const i = this.info
    return `${i.author}, ${titleCase(i.title)} (${i.year})${i.publisher ? `, ${i.publisher}` : ''} · ${i.license}`
  }
}

const books = new WeakMap<Catalog, MMBook>()
const pending = new WeakMap<Catalog, Promise<MMBook>>()

export function loadBook(catalog: Catalog): Promise<MMBook> {
  const hit = books.get(catalog)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(catalog)
  if (!p) {
    p = catalog.loadMateriaMedica().then(entries => {
      const b = new MMBook(catalog, entries)
      books.set(catalog, b)
      // the remedy window's "Cited by" needs a scan of the whole book: do it in idle time, in slices
      const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      const warm = () => { void b.warmCitations().catch(() => {}) }
      if (idle) idle(warm, { timeout: 5000 }); else setTimeout(warm, 0)
      return b
    })
    p.catch(() => pending.delete(catalog))
    pending.set(catalog, p)
  }
  return p
}

export function bookIfLoaded(catalog: Catalog): MMBook | null { return books.get(catalog) ?? null }

/** Load the book on demand; `retry` re-attempts after an error. */
export function useBook(catalog: Catalog): { book: MMBook | null; error: Error | null; retry: () => void } {
  const [state, setState] = useState<{ book: MMBook | null; error: Error | null }>(() => ({ book: books.get(catalog) ?? null, error: null }))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (state.book) return
    let alive = true
    loadBook(catalog).then(book => alive && setState({ book, error: null }), error => alive && setState({ book: null, error: error instanceof Error ? error : new Error(String(error)) }))
    return () => { alive = false }
  }, [catalog, attempt, state.book])
  return { ...state, retry: () => { setState({ book: null, error: null }); setAttempt(a => a + 1) } }
}


/** Boericke subtitles carry markdown emphasis ("**(EOSIN)**"): the words without the markers. */
export function commonName(s: string): string {
  return plainText(s).replace(/\s+/g, ' ').trim()
}

const noop = () => () => {}

/** A book's citations for a component: null until built (the build is started in slices); re-renders when ready. */
export function useCitations(book: MMBook | null): Map<number, Citation[]> | null {
  const ready = useSyncExternalStore(book ? book.onCitations : noop, () => book?.citationsIfReady() ?? null, () => book?.citationsIfReady() ?? null)
  useEffect(() => { if (book && !ready) void book.warmCitations().catch(() => {}) }, [book, ready])
  return ready
}
