import { describe, expect, it } from 'vitest'
import { decomposeGroups, FamilyIndex, fold, groupMatching, groupsOfFilter, matches, rowPositions, searchRemedies, systemLabel, unionLabel, visibleRows } from './model'
import type { FamiliesFile } from './model'

// node:fs through a dynamic specifier: the app tsconfig has no Node types (paths relative to the repo root, where vitest runs)
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const data = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const file = data('families.json') as FamiliesFile
const remedies = data('remedies.json') as [number, string, string, string | null][]
const byAbbrev = new Map(remedies.map(r => [r[1].toLowerCase(), r[0]]))
const rid = (abbrev: string) => {
  const id = byAbbrev.get(abbrev.toLowerCase())
  if (id === undefined) throw new Error(`no remedy ${abbrev}`)
  return id
}
const idx = new FamilyIndex(file)

// small hand-built fixture for tree logic
const fixture: FamiliesFile = {
  version: 1,
  source: { id: 't', title: 'test' },
  groups: [
    { id: 'k:a', name: 'Plants', kind: 'kingdom', parent: null, remedies: [1, 2, 3, 4] },
    { id: 'o:x', name: 'Solanales', kind: 'order', parent: 'k:a', remedies: [1, 2, 3] },
    { id: 'f:x', name: 'Solanaceae', kind: 'family', parent: 'o:x', remedies: [1, 2], primary: [1, 2] },
    { id: 'f:y', name: 'Convolvulaceae', kind: 'family', parent: 'o:x', remedies: [3], primary: [3] },
    { id: 'f:z', name: 'Rosaceae', kind: 'family', parent: 'k:a', remedies: [4], primary: [4] },
    { id: 'k:b', name: 'Minerals', kind: 'kingdom', parent: null, remedies: [5] },
    { id: 'e:na', name: 'Natrium (Na)', kind: 'element', parent: 'k:b', remedies: [5], primary: [5], note: 'Z 11' },
  ],
}
const fx = new FamilyIndex(fixture)

describe('families.json data', () => {
  it('references only known remedies and valid parents', () => {
    const ids = new Set(remedies.map(r => r[0]))
    const gids = new Set(file.groups.map(g => g.id))
    for (const g of file.groups) {
      if (g.parent) expect(gids.has(g.parent), g.id).toBe(true)
      for (const r of g.remedies) expect(ids.has(r), `${g.id} → ${r}`).toBe(true)
      expect(g.remedies.length, g.id).toBeGreaterThan(0)
    }
  })

  it('children are subsets of their parent', () => {
    const byId = new Map(file.groups.map(g => [g.id, g]))
    for (const g of file.groups) {
      if (!g.parent) continue
      const p = new Set(byId.get(g.parent)!.remedies)
      for (const r of g.remedies) expect(p.has(r), `${g.id} ⊄ ${g.parent}`).toBe(true)
    }
  })

  it('covers at least 95% of remedies with a kingdom, one kingdom each', () => {
    const kingdoms = file.groups.filter(g => g.kind === 'kingdom')
    const count = new Map<number, number>()
    for (const k of kingdoms) for (const r of k.remedies) count.set(r, (count.get(r) ?? 0) + 1)
    expect(count.size / remedies.length).toBeGreaterThanOrEqual(0.95)
    for (const [r, n] of count) expect(n, `remedy ${r} in ${n} kingdoms`).toBe(1)
  })

  it('declares itself an editorial classification', () => {
    expect(file.source.note).toMatch(/editorial/i)
    expect(file.source.note).toMatch(/not copied/i)
  })

  it.each([
    ['Bell', 'plant:family:Solanaceae'],
    ['Stram', 'plant:family:Solanaceae'],
    ['Acon', 'plant:family:Ranunculaceae'],
    ['Puls', 'plant:family:Ranunculaceae'],
    ['Nux-v', 'plant:family:Loganiaceae'],
    ['Lyc', 'plant:family:Lycopodiaceae'],
    ['Cham', 'plant:family:Asteraceae'],
    ['Thuj', 'plant:family:Cupressaceae'],
    ['Lach', 'animal:viperidae'],
    ['Naja', 'animal:elapidae'],
    ['Apis', 'animal:hymenoptera'],
    ['Tarent', 'animal:spiders'],
    ['Sep', 'animal:molluscs'],
    ['Lac-c', 'animal:milks'],
    ['Carc', 'nosode:cancer'],
    ['Med', 'nosode:major'],
    ['Tub', 'nosode:tuberculinic'],
    ['Nat-m', 'mineral:el:Na'],
    ['Nat-m', 'mineral:el:Cl'],
    ['Nat-m', 'mineral:salt:chlorides'],
    ['Calc', 'mineral:el:Ca'],
    ['Calc', 'mineral:salt:carbonates'],
    ['Kali-bi', 'mineral:salt:chromates'],
    ['Aur', 'mineral:elements'],
    ['Merc', 'mineral:elements'],
    ['Hep', 'mineral:salt:sulphides'],
    ['Carb-v', 'theme:carbons'],
    ['Carb-an', 'theme:carbons'],
    ['Nit-ac', 'mineral:acids'],
    ['Sec', 'fungus:asco'],
    ['Agar', 'fungus:basidio'],
    ['Thyr', 'sarcode:hormones'],
    ['Elec', 'impon:energy'],
  ])('%s is in %s', (abbrev, group) => {
    expect(idx.remediesOf(group)).toContain(rid(abbrev))
  })

  it('files the cation element as primary group of a salt', () => {
    expect(idx.primaryGroupOf(rid('Nat-m'))?.id).toBe('mineral:el:Na')
    expect(idx.primaryGroupOf(rid('Calc'))?.id).toBe('mineral:el:Ca')
    expect(idx.primaryGroupOf(rid('Bell'))?.id).toBe('plant:family:Solanaceae')
    expect(idx.primaryGroupOf(rid('Hep'))?.id).toBe('mineral:el:Ca')
  })

  it('keeps uncombined elements out of the salts and files Merc sol as the metal', () => {
    expect(idx.get('mineral:elements')?.parent).toBe('k:mineral')
    expect(idx.get('mineral:salts')?.children).not.toContain('mineral:elements')
    const merc = idx.allGroupsOf(rid('Merc')).map(n => n.id)
    expect(merc).toContain('mineral:el:Hg')
    for (const g of ['mineral:el:N', 'mineral:el:O', 'mineral:salt:oxides']) expect(merc).not.toContain(g)
  })
})

describe('FamilyIndex', () => {
  it('builds depth, path and root', () => {
    const n = fx.get('f:x')!
    expect(n.depth).toBe(2)
    expect(n.path).toEqual(['k:a', 'o:x', 'f:x'])
    expect(n.root).toBe('k:a')
    expect(fx.roots).toEqual(['k:a', 'k:b'])
    expect(fx.pathLabel('f:x')).toBe('Plants › Solanales › Solanaceae')
  })

  it('groupsOfRemedy: primary first, then lineage, kingdom last', () => {
    expect(fx.groupsOfRemedy(1).map(g => g.id)).toEqual(['f:x', 'o:x', 'k:a'])
    expect(fx.groupsOfRemedy(5).map(g => g.id)).toEqual(['e:na', 'k:b'])
    expect(fx.groupsOfRemedy(99)).toEqual([])
  })

  it('real data: Nat-m groups start with Natrium and end with the kingdom', () => {
    const gs = idx.groupsOfRemedy(rid('Nat-m'))
    expect(gs[0].id).toBe('mineral:el:Na')
    expect(gs[gs.length - 1].id).toBe('k:mineral')
    expect(gs.map(g => g.id)).toContain('mineral:salt:chlorides')
  })

  it('union and labels', () => {
    expect(fx.union(['f:x', 'f:y', 'f:z'])).toEqual([1, 2, 3, 4])
    expect(unionLabel(fx, ['f:x'])).toBe('Solanaceae')
    expect(unionLabel(fx, ['f:x', 'f:y'])).toBe('Solanaceae + Convolvulaceae')
    expect(unionLabel(fx, ['f:x', 'f:y', 'f:z'])).toBe('Solanaceae + 2 more')
  })

  it('groupMatching finds a group by exact membership', () => {
    expect(groupMatching(fx, [2, 1])).toBe('f:x')
    expect(groupMatching(fx, [1])).toBeNull()
    expect(groupMatching(fx, null)).toBeNull()
  })

  it('systemLabel', () => {
    expect(systemLabel(idx.get('plant:family:Solanaceae')!)).toBe('Botanical family')
    expect(systemLabel(idx.get('mineral:el:Na')!)).toBe('Element')
    expect(systemLabel(idx.get('k:plant')!)).toBe('Kingdom')
  })

  it('labels a remedy lineage without repeating the zoological system', () => {
    const lach = idx.groupsOfRemedy(rid('Lach')).map(n => systemLabel(n, idx))
    expect(new Set(lach).size).toBe(lach.length)
    expect(lach).toContain('Snakes')
    expect(lach).toContain('Zoological group')
  })
})

describe('visibleRows', () => {
  it('shows roots collapsed and expands on demand', () => {
    expect(visibleRows(fx, new Set()).map(r => r.id)).toEqual(['k:a', 'k:b'])
    const rows = visibleRows(fx, new Set(['k:a', 'o:x']))
    expect(rows.map(r => r.id)).toEqual(['k:a', 'o:x', 'f:x', 'f:y', 'f:z', 'k:b'])
    expect(rows[1]).toMatchObject({ depth: 1, hasChildren: true, expanded: true })
    expect(rows[2]).toMatchObject({ depth: 2, hasChildren: false })
  })

  it('search keeps matches and their ancestors, including a matching child of a matching parent', () => {
    const rows = visibleRows(fx, new Set(), 'solan')
    expect(rows.map(r => r.id)).toEqual(['k:a', 'o:x', 'f:x'])
    expect(rows.filter(r => r.match).map(r => r.id)).toEqual(['o:x', 'f:x'])
  })

  it('search matches notes (element numbers) and nothing when no hit', () => {
    expect(visibleRows(fx, new Set(), 'z 11').filter(r => r.match).map(r => r.id)).toEqual(['e:na'])
    expect(visibleRows(fx, new Set(), 'qqq')).toEqual([])
  })

  it('a matching leaf-parent can be expanded to show all its children', () => {
    const rows = visibleRows(fx, new Set(['o:x']), 'solanales')
    expect(rows.map(r => r.id)).toEqual(['k:a', 'o:x', 'f:x', 'f:y'])
  })
})

describe('text matching', () => {
  it('fold strips accents and punctuation', () => {
    expect(fold('Atténué-Bilié!')).toBe('attenue bilie')
  })
  it('matches word starts only', () => {
    expect(matches('Ranunculaceae', 'ranun')).toBe(true)
    expect(matches('Natrium (Na)', 'na')).toBe(true)
    expect(matches('Arsenites & arsenates', 'arsen')).toBe(true)
    expect(matches('Solanaceae', 'lana')).toBe(false)
    expect(matches('Carbonates', 'nat')).toBe(false)
    expect(matches('Permanganates', 'nat')).toBe(false)
    expect(matches('Solanaceae', 'xy')).toBe(false)
    expect(matches('Anything', '')).toBe(true)
  })
  it('searchRemedies ranks exact abbreviation, then prefix, then name', () => {
    const list = [
      { id: 1, abbrev: 'Nat-m', name: 'Natrium Muriaticum' },
      { id: 2, abbrev: 'Nat', name: 'Natrium' },
      { id: 3, abbrev: 'Sulph', name: 'Sulphur natronatum' },
    ]
    expect(searchRemedies(list, 'nat').map(r => r.id)).toEqual([2, 1, 3])
    expect(searchRemedies(list, '')).toEqual([])
  })
})

describe('reopening a filter: groups behind a remedy set', () => {
  it('decomposes a union of families into those families', () => {
    expect(decomposeGroups(fx, [1, 2])).toEqual(['f:x'])
    expect(decomposeGroups(fx, [1, 2, 4])).toEqual(['f:x', 'f:z'])
    expect(decomposeGroups(fx, [3, 4, 5])).toEqual(['f:y', 'f:z', 'k:b'])
    // the largest groups win: Solanales rather than its two families
    expect(decomposeGroups(fx, [1, 2, 3, 5])).toEqual(['o:x', 'k:b'])
  })

  it('returns null for a set that is not made of groups, and for no set', () => {
    expect(decomposeGroups(fx, [1])).toBeNull()
    expect(decomposeGroups(fx, [1, 4])).toBeNull()
    expect(decomposeGroups(fx, [])).toBeNull()
    expect(decomposeGroups(fx, null)).toBeNull()
  })

  it('keeps the stored groups while they still produce the set', () => {
    expect(groupsOfFilter(fx, ['f:x', 'f:y'], [1, 2, 3])).toEqual(['f:x', 'f:y'])
    // the set was changed elsewhere (e.g. the per-remedy dialog): fall back to decomposing it
    expect(groupsOfFilter(fx, ['f:x', 'f:y'], [1, 2, 4])).toEqual(['f:x', 'f:z'])
    expect(groupsOfFilter(fx, ['gone'], [4])).toEqual(['f:z'])
    expect(groupsOfFilter(fx, null, [1])).toBeNull()
    expect(groupsOfFilter(fx, ['f:x'], null)).toEqual([])
  })

  it('round-trips several real families', () => {
    const ids = ['plant:family:Liliaceae', 'plant:family:Anacardiaceae'].filter(id => idx.get(id))
    if (ids.length === 2) expect(groupsOfFilter(idx, ids, idx.union(ids))).toEqual(ids)
    const sol = idx.nodes.find(n => n.name === 'Solanaceae')!
    const ran = idx.nodes.find(n => n.name === 'Ranunculaceae')!
    const got = decomposeGroups(idx, idx.union([sol.id, ran.id]))!
    expect(idx.union(got)).toEqual(idx.union([sol.id, ran.id]))
  })
})

describe('rowPositions (aria-setsize / aria-posinset)', () => {
  it('counts visible siblings per level', () => {
    const rows = visibleRows(fx, new Set(['k:a', 'o:x']))
    // Plants, Solanales, Solanaceae, Convolvulaceae, Rosaceae, Minerals
    expect(rows.map(r => r.id)).toEqual(['k:a', 'o:x', 'f:x', 'f:y', 'f:z', 'k:b'])
    expect(rowPositions(rows)).toEqual([
      { size: 2, pos: 1 }, { size: 2, pos: 1 }, { size: 2, pos: 1 }, { size: 2, pos: 2 }, { size: 2, pos: 2 }, { size: 2, pos: 2 },
    ])
  })

  it('starts a new sibling set under each parent', () => {
    const rows = visibleRows(fx, new Set(['k:a', 'k:b']))
    expect(rows.map(r => r.id)).toEqual(['k:a', 'o:x', 'f:z', 'k:b', 'e:na'])
    expect(rowPositions(rows).map(p => `${p.pos}/${p.size}`)).toEqual(['1/2', '1/2', '2/2', '2/2', '1/1'])
    expect(rowPositions([])).toEqual([])
  })
})
