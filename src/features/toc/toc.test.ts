import { describe, expect, it } from 'vitest'
import { authorShort, buildRows, docLabel, filterDocs, move, pageMove, parentRow, typeahead } from './model'
import type { Cursor, TocDoc, TocRow } from './model'
import { CHAPTER_ICON_KEYS, chapterIconGroup, chapterIconKey } from './chapterIcons'
import { sanitizeLayout } from '../../state/sanitize'
import { DEFAULT_LAYOUT } from '../../state/workspace'

const rep = (id: string, label: string, lang = 'en'): TocDoc => ({ key: `rep:${id}`, kind: 'rep', id, label, lang })
const fam: TocDoc = { key: 'fam:x', kind: 'fam', id: 'x', label: 'Families doc', lang: 'en' }

describe('toc labels', () => {
  it('formats the author the RadarOpus way', () => {
    expect(authorShort('Vladimir Polony')).toBe('POLONY V.')
    expect(authorShort('J. T. Kent')).toBe('KENT J.')
    expect(authorShort('Boericke')).toBe('BOERICKE')
    expect(authorShort('  ')).toBe('')
    expect(docLabel('J. T. Kent', 'Repertory')).toBe('KENT J. Repertory')
    expect(docLabel('', 'Families')).toBe('Families')
  })

  it('filters documents on every word, ignoring case and accents', () => {
    const docs = [rep('a', 'POLONY V. Repertorium Publicum'), { ...rep('b', 'KENT J. Kents Repertorium'), extra: 'Übersetzung kent-de' }]
    expect(filterDocs(docs, '').map(d => d.id)).toEqual(['a', 'b'])
    expect(filterDocs(docs, 'kent').map(d => d.id)).toEqual(['b'])
    expect(filterDocs(docs, 'repertorium pub').map(d => d.id)).toEqual(['a'])
    expect(filterDocs(docs, 'ubersetzung').map(d => d.id)).toEqual(['b'])
    expect(filterDocs(docs, 'nothing')).toEqual([])
  })
})

describe('toc rows', () => {
  const base = { reps: [rep('a', 'A'), rep('b', 'B')], fams: [fam], chapterCount: (a: string) => (a === 'a' ? 10 : undefined), groups: () => [{ id: 'k:plant', label: 'Plants' }] }

  it('lists sections, documents, a grid of chapters and family groups', () => {
    const rows = buildRows({ ...base, open: new Set(['sec:reps', 'sec:fams', 'rep:a', 'rep:b', 'fam:x']) })
    expect(rows.map(r => r.kind)).toEqual(['section', 'doc', 'grid', 'doc', 'note', 'section', 'doc', 'group'])
    expect(rows[2]).toMatchObject({ kind: 'grid', count: 10 })
    expect(rows[4]).toMatchObject({ kind: 'note', label: 'Loading chapters…' })
  })

  it('hides collapsed sections; filtering opens sections and drops empty ones', () => {
    expect(buildRows({ ...base, open: new Set() }).map(r => r.key)).toEqual(['sec:reps', 'sec:fams'])
    const f = buildRows({ ...base, reps: [rep('b', 'B')], fams: [], open: new Set(), filtering: true })
    expect(f.map(r => r.key)).toEqual(['sec:reps', 'rep:b'])
  })

  it('marks a repertory whose book failed to load', () => {
    const rows = buildRows({ ...base, chapterCount: () => null, open: new Set(['sec:reps', 'rep:a']) })
    expect(rows[2]).toMatchObject({ kind: 'note', label: 'Could not load the chapters' })
  })
})

describe('toc keyboard', () => {
  const rows: TocRow[] = buildRows({
    reps: [rep('a', 'A'), rep('b', 'B')], fams: [fam], open: new Set(['sec:reps', 'sec:fams', 'rep:a']),
    chapterCount: () => 10, groups: () => [],
  })
  const c = (key: string, tile = 0): Cursor => ({ key, tile })

  it('walks rows and the tile grid with Up/Down, keeping the column', () => {
    expect(move(rows, c('rep:a'), 'down')).toEqual(c('rep:a:grid', 0))
    expect(move(rows, c('rep:a:grid', 2), 'down')).toEqual(c('rep:a:grid', 9)) // no tile below 2+7=9? 9 exists
    expect(move(rows, c('rep:a:grid', 3), 'down')).toEqual(c('rep:a:grid', 9)) // last row is short: its last tile
    expect(move(rows, c('rep:a:grid', 8), 'down')).toEqual(c('rep:b'))
    expect(move(rows, c('rep:a:grid', 8), 'up')).toEqual(c('rep:a:grid', 1))
    expect(move(rows, c('rep:a:grid', 1), 'up')).toEqual(c('rep:a'))
    expect(move(rows, c('rep:b'), 'up')).toEqual(c('rep:a:grid', 7))
    expect(move(rows, c('sec:reps'), 'up')).toBeNull()
    expect(move(rows, c('fam:x'), 'end')).toEqual(c('fam:x'))
    expect(move(rows, c('fam:x'), 'home')).toEqual(c('sec:reps'))
  })

  it('Left/Right move between tiles and collapse or expand tree rows', () => {
    expect(move(rows, c('rep:a:grid', 4), 'right')).toEqual(c('rep:a:grid', 5))
    expect(move(rows, c('rep:a:grid', 9), 'right')).toBeNull()
    expect(move(rows, c('rep:a:grid', 4), 'left')).toEqual(c('rep:a:grid', 3))
    expect(move(rows, c('rep:a:grid', 0), 'left')).toEqual(c('rep:a'))
    expect(move(rows, c('rep:a'), 'left')).toEqual({ toggle: 'rep:a', open: false })
    expect(move(rows, c('rep:b'), 'right')).toEqual({ toggle: 'rep:b', open: true })
    expect(move(rows, c('rep:b'), 'left')).toEqual(c('sec:reps'))
    expect(move(rows, c('rep:a'), 'right')).toEqual(c('rep:a:grid', 0))
    expect(move(rows, c('sec:reps'), 'right')).toEqual(c('rep:a'))
    expect(parentRow(rows, rows.findIndex(r => r.key === 'rep:a:grid'))).toBe(1)
  })

  it('a cursor on a row that went away lands on the first row', () => {
    expect(move(rows, c('rep:zzz'), 'down')).toEqual(c('sec:reps'))
  })
})

// node's fs without node typings in the app's tsconfig (as in seed/build.test.ts)
const proc = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(m: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } } }).process
const fs = proc.getBuiltinModule('node:fs')

describe('chapter icons', () => {
  const chapters = (file: string) => {
    const f = JSON.parse(fs.readFileSync(`${proc.cwd()}/public/data/${file}`, 'utf8')) as { chapters: number[]; text: string[] }
    return f.chapters.map(c => f.text[c])
  }

  it('has a glyph for every chapter of the installed repertories', () => {
    for (const file of ['rep-publicum.json', 'rep-kent-de.json']) {
      const missing = chapters(file).filter(n => chapterIconKey(n) === 'book')
      expect(missing, file).toEqual([])
    }
  })

  it('gives English and German chapters the same glyph', () => {
    expect(chapterIconKey('Mind')).toBe(chapterIconKey('Gemüt'))
    expect(chapterIconKey('Genitalia female')).toBe(chapterIconKey('Geschlechtsorgane weiblich'))
    expect(chapterIconKey('External throat')).toBe(chapterIconKey('Hals-Außenseite'))
    expect(chapterIconKey('Unknown chapter')).toBe('book')
    expect(CHAPTER_ICON_KEYS.every(k => chapterIconGroup(k))).toBe(true)
  })
})

describe('toc type-ahead and paging', () => {
  const docs = [rep('a', 'POLONY V. Repertorium Publicum'), rep('k', 'KENT J. Kents Repertorium')]
  const rows = buildRows({ reps: docs, fams: [fam], open: new Set(['sec:reps', 'sec:fams', 'rep:a']), chapterCount: () => 10, groups: () => [] })

  it('jumps to the next row starting with the typed letters, wrapping', () => {
    const start: Cursor = { key: 'sec:reps', tile: 0 }
    expect(typeahead(rows, start, 'k')).toEqual({ key: 'rep:k', tile: 0 })
    expect(typeahead(rows, start, 'f')).toEqual({ key: 'sec:fams', tile: 0 })
    expect(typeahead(rows, { key: 'sec:fams', tile: 0 }, 'f')).toEqual({ key: 'fam:x', tile: 0 })
    expect(typeahead(rows, { key: 'fam:x', tile: 0 }, 'r')).toEqual({ key: 'sec:reps', tile: 0 })
    expect(typeahead(rows, start, 'kent')).toEqual({ key: 'rep:k', tile: 0 })
    expect(typeahead(rows, start, 'zz')).toBeNull()
  })

  it('pages by a number of steps and stops at the ends', () => {
    expect(pageMove(rows, { key: 'sec:reps', tile: 0 }, 'down', 2)).toEqual({ key: 'rep:a:grid', tile: 0 })
    expect(pageMove(rows, { key: 'sec:reps', tile: 0 }, 'down', 50)).toEqual({ key: 'fam:x', tile: 0 })
    expect(pageMove(rows, { key: 'sec:reps', tile: 0 }, 'up', 5)).toBeNull()
  })
})

describe('toc state in the saved workspace', () => {
  it('keeps the expanded rows and checked documents with the layout, dropping what is not a key list', () => {
    expect(sanitizeLayout({}).tocOpen).toEqual(DEFAULT_LAYOUT.tocOpen)
    expect(sanitizeLayout({ tocOpen: ['sec:reps', 'rep:kent', 3], tocChecked: ['rep:kent'] })).toMatchObject({ tocOpen: ['sec:reps', 'rep:kent'], tocChecked: ['rep:kent'] })
    expect(sanitizeLayout({ tocOpen: { a: 1 }, tocChecked: 'rep:kent' })).toMatchObject({ tocOpen: DEFAULT_LAYOUT.tocOpen, tocChecked: [] })
  })
})
