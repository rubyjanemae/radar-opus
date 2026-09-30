// @vitest-environment node
// Pure logic: no DOM needed, so skip the jsdom setup.
import { describe, expect, it } from 'vitest'
import { childComparator, duplicatePaths, foldConnectors, linkParents, parseClock, timeSlot } from '../../scripts/lib/rubric-tree.mjs'
import type { TreeNode } from '../../scripts/lib/rubric-tree.mjs'

const sorted = (lang: string, parent: string | null, texts: string[]) =>
  texts.map(text => ({ text })).sort(childComparator(lang, parent)).map(n => n.text)

describe('parseClock', () => {
  it('reads English hours and ranges', () => {
    expect(parseClock('3 a.m.')).toEqual({ start: 180, end: null })
    expect(parseClock('12 p.m.')).toEqual({ start: 720, end: null })
    expect(parseClock('12 a.m.')).toEqual({ start: 0, end: null })
    expect(parseClock('10 a.m. to 2 p.m.')).toEqual({ start: 600, end: 840 })
    expect(parseClock('7 to 8 p.m.')).toEqual({ start: 1140, end: 1200 })
    expect(parseClock('4-8 p.m.')).toEqual({ start: 960, end: 1200 })
    expect(parseClock('11 a.m. to 3 p.m. h')).toEqual({ start: 660, end: 900 })
    expect(parseClock('5 p.m., in bed')).toEqual({ start: 1020, end: null })
  })
  it('reads "h-mm" hours ("2-30 p.m." is 14:30), keeping "4-8 p.m." a range', () => {
    expect(parseClock('2-30 p.m.')).toEqual({ start: 870, end: null })
    expect(parseClock('12-30 p.m.')).toEqual({ start: 750, end: null })
    expect(parseClock('6-15 p.m., while eating')).toEqual({ start: 1095, end: null })
    expect(parseClock('1-30 a.m. to 2-30 a.m.')).toEqual({ start: 90, end: 150 })
    expect(parseClock('8-30 to 9 a.m.')).toEqual({ start: 510, end: 540 })
    expect(parseClock('4-8 p.m.')).toEqual({ start: 960, end: 1200 })
    expect(parseClock('10-12 a.m.')!.start).toBe(600)
    expect(sorted('en', 'afternoon', ['3 p.m.', '2-30 p.m.', '2 p.m.', '1-30 p.m.'])).toEqual(['1-30 p.m.', '2 p.m.', '2-30 p.m.', '3 p.m.'])
  })
  it('reads German hours', () => {
    expect(parseClock('15 Uhr', 'de')).toEqual({ start: 900, end: null })
    expect(parseClock('9 Uhr bis 13 Uhr', 'de')).toEqual({ start: 540, end: 780 })
    expect(parseClock('2 bis 3 Uhr', 'de')).toEqual({ start: 120, end: 180 })
    expect(parseClock('24 Uhr', 'de')).toEqual({ start: 0, end: null })
  })
  it('ignores texts that are not clock times', () => {
    for (const t of ['2nd molar', '3 hours after', 'until 10 a.m.', 'agg.', '13 p.m.']) expect(parseClock(t)).toBeNull()
    expect(parseClock('alle 14 Tage', 'de')).toBeNull()
  })
})

describe('timeSlot', () => {
  it('knows the periods in both languages, including Kent-de "am Tage"', () => {
    expect(timeSlot('Daytime', 'en')).toBe(0)
    expect(timeSlot('am Tage', 'de')).toBe(0)
    expect(timeSlot('tagsüber', 'de')).toBe(0)
    expect(timeSlot('nachts', 'de')).toBe(6)
    expect(timeSlot('bed', 'en')).toBe(-1)
  })
})

describe('childComparator', () => {
  it('lists periods, then hours chronologically, then the rest alphabetically', () => {
    expect(sorted('en', 'pain', ['walking', 'evening', '11 a.m.', 'morning', 'agg.', '3 a.m.', 'daytime', '10 p.m.']))
      .toEqual(['daytime', 'morning', 'evening', '3 a.m.', '11 a.m.', '10 p.m.', 'agg.', 'walking'])
  })
  it('counts the hours of a period from its start (night: 10 p.m. … midnight … 5 a.m.)', () => {
    expect(sorted('en', 'night', ['5 a.m.', 'amel.', '1 a.m.', 'midnight', '11 p.m.', '10 p.m.', '1 a.m. to 10 a.m.', 'bed']))
      .toEqual(['10 p.m.', '11 p.m.', 'midnight', '1 a.m.', '1 a.m. to 10 a.m.', '5 a.m.', 'amel.', 'bed'])
    expect(sorted('en', 'forenoon', ['11 a.m.', '9 a.m. to 1 p.m.', '10 a.m.', '9 a.m. to 12 p.m.', '8 a.m.']))
      .toEqual(['8 a.m.', '9 a.m. to 12 p.m.', '9 a.m. to 1 p.m.', '10 a.m.', '11 a.m.'])
  })
  it('orders German hours and puts "am Tage" first', () => {
    expect(sorted('de', 'Angst', ['nachts', 'Abendessen, nach dem', 'am Tage', 'morgens', '15 Uhr']))
      .toEqual(['am Tage', 'morgens', 'nachts', '15 Uhr', 'Abendessen, nach dem'])
    expect(sorted('de', 'nachts', ['2 Uhr', 'Bett, im', 'Mitternacht', '22 Uhr', '1 Uhr']))
      .toEqual(['22 Uhr', 'Mitternacht', '1 Uhr', '2 Uhr', 'Bett, im'])
  })
  it('sorts numbers inside texts numerically', () => {
    expect(sorted('en', 'x', ['10 years', '2 years'])).toEqual(['2 years', '10 years'])
  })
})

describe('foldConnectors', () => {
  type N = TreeNode & { rem: string }
  const node = (text: string, rem: string, children: N[] = []): N => {
    const n: N = { text, rem, children, parent: null }
    for (const c of children) c.parent = n
    return n
  }
  const same = (a: N, b: N) => a.rem === b.rem

  it('merges a sole connector child with the same remedies and re-parents its children', () => {
    const night = node('night', 'x'), alone = node('alone', 'y')
    const of = node('of', 'abc', [night, alone])
    const death = node('death', 'abc', [of])
    const mind = node('Mind', '', [node('fear', 'abcd', [death])])
    expect(foldConnectors([mind], 'en', same)).toBe(1)
    expect(death.text).toBe('death, of')
    expect(death.children).toEqual([night, alone])
    expect(night.parent).toBe(death)
    expect(of.mergedInto).toBe(death)
  })
  it('keeps connectors that differ, have siblings, or are not connectors', () => {
    const a = node('stool', 'ab', [node('during', 'a')]) // different remedies
    const b = node('fever', 'ab', [node('during', 'ab'), node('after', 'b')]) // siblings
    const c = node('evening', 'ab', [node('agg.', 'ab')]) // a modality, not a connector
    const root = node('Mind', '', [a, b, c])
    expect(foldConnectors([root], 'en', same)).toBe(0)
    expect([a.text, b.text, c.text]).toEqual(['stool', 'fever', 'evening'])
  })
  it('never folds into a chapter root and handles chains', () => {
    const when = node('when', 'q')
    const alone = node('alone', 'q', [when])
    const root = node('Mind', 'q', [node('of', 'q', [alone])])
    expect(foldConnectors([root], 'en', same)).toBe(1)
    expect(root.text).toBe('Mind')
    expect(alone.text).toBe('alone, when')
  })
  it('uses the German connector list for German books', () => {
    const suppe = node('Suppe', 'r', [node('nach', 'r')])
    foldConnectors([node('Magen', '', [suppe])], 'de', same)
    expect(suppe.text).toBe('Suppe, nach')
  })
})

describe('linkParents', () => {
  const rows = (paths: string[]) => paths.map((path, i) => ({ path, oid: i }))
  const tree = (paths: string[], min = 3) => {
    const { roots, synthetic } = linkParents(rows(paths), () => ({ oid: -1 }), { lang: 'en', minChildren: min })
    const show = (n: (typeof roots)[number]): string => n.children.length ? `${n.text}${n.synthetic ? '*' : ''}(${n.children.map(show).join(' ')})` : n.text
    return { out: roots.map(show).join(' '), synthetic }
  }

  it('creates a synthetic heading for a missing path that groups several sub-rubrics', () => {
    const { out, synthetic } = tree(['Mind', 'Mind, anger, evening', 'Mind, anger, morning', 'Mind, anger, violent', 'Mind, fear'])
    expect(out).toBe('Mind(fear anger*(evening morning violent))') // the build sorts siblings afterwards
    expect(synthetic.map(s => s.path)).toEqual(['Mind, anger'])
    expect(synthetic[0]).toMatchObject({ oid: -1, synthetic: true })
  })

  it('keeps a comma in the text when the missing path holds too few sub-rubrics (false split)', () => {
    expect(tree(['Skin', 'Skin, tingling, warm', 'Skin, tingling, cold']).out).toBe('Skin(tingling, warm tingling, cold)')
  })

  it('attaches to the longest existing prefix and nests headings', () => {
    const { out, synthetic } = tree([
      'Head', 'Head, pain', 'Head, pain, forehead, a', 'Head, pain, forehead, b', 'Head, pain, forehead, c, x', 'Head, pain, forehead, c, y', 'Head, pain, forehead, c, z',
    ])
    expect(out).toBe('Head(pain(forehead*(a b c*(x y z))))')
    expect(synthetic).toHaveLength(2)
  })

  it('never makes a heading of a connector phrase ("eating, after")', () => {
    expect(tree(['Stomach', 'Stomach, nausea', 'Stomach, nausea, eating, after, a', 'Stomach, nausea, eating, after, b', 'Stomach, nausea, eating, after, c'], 3).out)
      .toBe('Stomach(nausea(eating, after, a eating, after, b eating, after, c))')
  })

  it('merges duplicate paths into the first node and reports them', () => {
    const { out } = tree(['A', 'A, b', 'A, b', 'A, c'])
    expect(out).toBe('A(b c)')
    expect(duplicatePaths(rows(['A', 'A, b', 'A, b', 'A, c', 'A, c', 'A, c']))).toEqual([{ path: 'A, c', count: 3 }, { path: 'A, b', count: 2 }])
  })
})
