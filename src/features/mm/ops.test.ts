import { beforeEach, describe, expect, it } from 'vitest'
import { Catalog } from '../../data/catalog'
import type { MateriaMedicaEntry } from '../../data/types'
import { useApp } from '../../state/store'
import type { MateriaMedicaTab } from '../../state/workspace'
import { MMBook } from './book'
import { canHistory, contextRemedy, historyMove, monographHtml, openMM, openRemedy, registerRemedyFamilyProvider, remedyGroups, setMMCatalog, useMMUi } from './ops'

const catalog = new Catalog([
  { id: 1, abbrev: 'Nat-m', name: 'Natrium Muriaticum', altName: null },
  { id: 2, abbrev: 'Sep', name: 'Sepia Officinalis', altName: null },
  { id: 3, abbrev: 'Apis', name: 'Apis Mellifica', altName: null },
], [])
const entries = new Map<number, MateriaMedicaEntry>([
  [1, { remedyId: 1, heading: 'NATRUM MURIATICUM', commonName: 'Chloride of sodium', intro: 'Great *craving* for salt <b>.', sections: [{ heading: 'Mind', text: 'Consolation aggravates.' }, { heading: 'Relationship', text: 'Complementary to *Apis; Sepia*.' }] }],
  [2, { remedyId: 2, heading: 'SEPIA', commonName: 'Inky juice', intro: 'Indifference (*Nat mur*).', sections: [] }],
])
const book = new MMBook(catalog, entries)
setMMCatalog(catalog)

const mmTab = () => useApp.getState().tabs.find(t => t.kind === 'materia-medica') as MateriaMedicaTab | undefined

beforeEach(() => {
  useApp.setState({ tabs: [], activeTabId: null })
  useMMUi.setState({ jump: null, history: {}, focusSearch: 0 })
})

describe('MM book', () => {
  it('lists remedies alphabetically with title-cased headings', () => {
    expect(book.items.map(i => [i.abbrev, i.title, i.letter])).toEqual([['Nat-m', 'Natrum Muriaticum', 'N'], ['Sep', 'Sepia', 'S']])
    expect(book.has(1)).toBe(true)
    expect(book.has(3)).toBe(false)
  })
  it('parses relationships and citations', () => {
    expect(book.relationships(1)).toEqual([{ kind: 'Complementary', remedies: [3, 2], clauses: [expect.objectContaining({ kind: 'Complementary' })] }])
    expect(book.citations.get(1)).toEqual([{ remedyId: 2, section: -1, heading: 'Introduction' }])
    expect(book.citations.get(2)).toEqual([{ remedyId: 1, section: 1, heading: 'Relationship' }])
  })
  it('renders a printable, escaped monograph', () => {
    const html = monographHtml(book, 1)
    expect(html).toContain('<h1>NATRUM MURIATICUM</h1>')
    expect(html).toContain('<em>craving</em>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('<h2>Relationship</h2>')
    expect(html).toContain('Public domain')
    expect(monographHtml(book, 3)).toBe('')
  })
})

describe('MM navigation', () => {
  it('opens one MM tab and keeps reading history', () => {
    openMM(1)
    const id = mmTab()!.id
    expect(mmTab()!.remedyId).toBe(1)
    openMM(2)
    expect(useApp.getState().tabs.filter(t => t.kind === 'materia-medica')).toHaveLength(1)
    expect(mmTab()!.remedyId).toBe(2)
    expect(canHistory(id, -1)).toBe(true)
    expect(contextRemedy()).toBe(2)
    historyMove(id, -1)
    expect(mmTab()!.remedyId).toBe(1)
    expect(canHistory(id, 1)).toBe(true)
    historyMove(id, 1)
    expect(mmTab()!.remedyId).toBe(2)
  })
  it('jumps to a section by name', () => {
    openMM(1, { section: 'relationship' })
    expect(useMMUi.getState().jump).toMatchObject({ remedyId: 1, section: 'relationship' })
  })
  it('opens the remedy window', () => {
    openRemedy(3)
    expect(useApp.getState().tabs.at(-1)).toMatchObject({ kind: 'remedy', remedyId: 3 })
    expect(contextRemedy()).toBe(3)
  })
})

describe('family provider', () => {
  it('is empty until the families feature registers', () => {
    expect(remedyGroups(1)).toBeNull()
    registerRemedyFamilyProvider(id => (id === 1 ? [{ system: 'Kingdom', label: 'Mineral', members: [1] }] : []))
    expect(remedyGroups(1)).toEqual([{ system: 'Kingdom', label: 'Mineral', members: [1] }])
  })
})
