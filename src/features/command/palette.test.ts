import { describe, expect, it } from 'vitest'
import type { Command } from '../../commands/registry'
import type { Patient } from '../../state/patients'
import { fuzzy, markPositions } from './fuzzy'
import { keywordReason, paletteItems, parseMode } from './model'
import type { PaletteInput } from './model'

const cmd = (id: string, title: string, extra: Partial<Command> = {}): Command => ({ id, title, category: 'Test', run: () => {}, ...extra })

const patient = (id: string, firstName: string, lastName: string): Patient => ({
  id, firstName, lastName, birthDate: null, sex: null, email: '', phone: '', address: '', occupation: '', notes: '', tags: [], createdAt: 0, updatedAt: 0,
})

function input(over: Partial<PaletteInput>): PaletteInput {
  return {
    mode: 'all', text: '', commands: [], recent: [], tabs: [], patients: [],
    remedies: () => [], rubrics: () => ({ hits: [], pending: false }),
    ...over,
  }
}

describe('fuzzy', () => {
  it('prefers contiguous and word-start matches', () => {
    const a = fuzzy('ana', 'Analyse case')!
    const b = fuzzy('ana', 'Banana')!
    expect(a.score).toBeGreaterThan(b.score)
    expect(a.positions).toEqual([0, 1, 2])
  })
  it('matches initials across words', () => {
    const m = fuzzy('tn', 'Toggle navigator')!
    expect(m.positions).toEqual([0, 7])
    expect(fuzzy('xyz', 'Toggle navigator')).toBeNull()
  })
  it('rejects scattered letter soup', () => {
    expect(fuzzy('lach', 'Clear recent searches')).toBeNull()
  })
  it('ignores case and accents', () => {
    expect(fuzzy('gemut', 'Gemüt')).not.toBeNull()
  })
  it('marks positions for highlighting', () => {
    expect(markPositions('Close tab', [0, 1, 6])).toEqual([
      { text: 'Cl', hit: true }, { text: 'ose ', hit: false }, { text: 't', hit: true }, { text: 'ab', hit: false },
    ])
  })
})

describe('palette model', () => {
  it('parses prefix modes', () => {
    expect(parseMode('>zoom')).toEqual({ mode: 'commands', text: 'zoom' })
    expect(parseMode('#lach')).toEqual({ mode: 'remedies', text: 'lach' })
    expect(parseMode('@smith')).toEqual({ mode: 'patients', text: 'smith' })
    expect(parseMode('/fear')).toEqual({ mode: 'rubrics', text: 'fear' })
    expect(parseMode('fear')).toEqual({ mode: 'all', text: 'fear' })
  })

  it('empty query: recent commands, open tabs, most used, then available commands', () => {
    const commands = [cmd('a', 'Alpha'), cmd('b', 'Beta', { enabled: () => false }), cmd('c', 'Gamma'), cmd('d', 'Delta'), cmd('h', 'Hidden', { hidden: true })]
    const tabs = [{ id: 't1', title: 'Mind', active: true }, { id: 't2', title: 'Search' }]
    const s = paletteItems(input({ commands, recent: ['c', 'zzz'], counts: { d: 4, c: 9, b: 7 }, tabs }))
    expect(s.map(x => x.key)).toEqual(['recent', 'tabs', 'frequent', 'commands'])
    expect(s[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['c'])
    // the active tab is not offered, disabled commands are left out of the browse list
    expect(s[1].items.map(i => i.kind === 'tab' && i.id)).toEqual(['t2'])
    expect(s[2].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['d'])
    expect(s[3].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['a'])
  })

  it('lists disabled commands last when browsing commands with >', () => {
    const commands = [cmd('b', 'Beta', { enabled: () => false }), cmd('a', 'Alpha')]
    const s = paletteItems(input({ mode: 'commands', commands }))
    expect(s[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['a', 'b'])
    expect(s[0].items[1].disabled).toBe(true)
  })

  it('ranks commands by fuzzy score with a recent-use boost', () => {
    const commands = [cmd('x', 'Zoom out'), cmd('y', 'Zoom in'), cmd('z', 'Reset zoom')]
    const s = paletteItems(input({ mode: 'commands', text: 'zoom', commands, recent: ['y'] }))
    expect(s[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['y', 'x', 'z'])
  })

  it('finds commands by keywords, ranks them below title matches and says why', () => {
    const commands = [cmd('k', 'Keyboard shortcuts', { keywords: 'help keys take' }), cmd('t', 'Take rubric'), cmd('d', 'Dark', { keywords: 'theme colours' })]
    const s = paletteItems(input({ mode: 'commands', text: 'take', commands }))
    expect(s[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['t', 'k'])
    const k = s[0].items[1]
    expect(k.kind === 'command' && k.why).toBe('take')
    const t = s[0].items[0]
    expect(t.kind === 'command' && t.why).toBeUndefined()
    // words can mix title and keywords
    const d = paletteItems(input({ mode: 'commands', text: 'dark theme', commands }))
    expect(d[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['d'])
    expect(keywordReason('xyz', commands[0])).toBeNull()
  })

  it('mixes tabs, patients, remedies and rubrics and orders sections by strength', () => {
    const s = paletteItems(input({
      text: 'smi',
      commands: [cmd('a', 'Some important thing')],
      tabs: [{ id: 't1', title: 'Smith, Jane', subtitle: 'Patient' }],
      patients: [patient('p1', 'Jane', 'Smith'), patient('p2', 'Bob', 'Jones')],
    }))
    const keys = s.map(x => x.key)
    expect(keys).toContain('patients')
    expect(keys).toContain('tabs')
    expect(s.find(x => x.key === 'patients')!.items).toHaveLength(1)
    // no rubric section under three characters
    expect(keys).not.toContain('rubrics')
  })

  it('lists all patients in @ mode and only rubrics in / mode', () => {
    const patients = [patient('p1', 'Jane', 'Smith'), patient('p2', 'Bob', 'Jones')]
    expect(paletteItems(input({ mode: 'patients', patients }))[0].items).toHaveLength(2)
    let asked = ''
    const s = paletteItems(input({ mode: 'rubrics', text: 'fe', commands: [cmd('a', 'fear command')], rubrics: q => { asked = q; return { hits: [], pending: true } } }))
    expect(asked).toBe('fe')
    expect(s.map(x => x.key)).toEqual(['rubrics'])
    expect(s[0].pending).toBe(true)
    expect(s[0].items.at(-1)?.kind).toBe('search')
  })

  it('results of a lagging deferred query rank below matches for what is typed now', () => {
    const remedy = { id: 1, abbrev: 'Neg', name: 'Negundium americanum' }
    const remedies = (q: string) => q === 'N' ? [{ remedy, score: 100, field: 'abbrev' }] as never : []
    const commands = [cmd('n', 'New clipboard')]
    // caught up: the remedy match for "N" may lead
    const fresh = paletteItems(input({ text: 'N', slowText: 'N', commands, remedies }))
    expect(fresh[0].key).toBe('remedies')
    // typed on to "New clipboard" while the deferred copy still says "N": the command leads
    const stale = paletteItems(input({ text: 'New clipboard', slowText: 'N', commands, remedies }))
    expect(stale[0].key).toBe('commands')
    expect(stale.map(x => x.key)).toContain('remedies')
  })
})

describe('per-open palette caches', () => {
  it('fuzzyIndex matches like fuzzy and memoPerCommand calls each predicate once', async () => {
    const { fuzzy, fuzzyIndex } = await import('./fuzzy')
    const { memoPerCommand } = await import('./model')
    const m = fuzzyIndex()
    for (const [q, t] of [['tog', 'Toggle dark mode'], ['cafe', 'Café au lait'], ['xyz', 'Open patient'], ['op pa', 'Open patient']] as const)
      expect(m(q, t)).toEqual(fuzzy(q, t))
    let calls = 0
    const en = memoPerCommand(() => { calls++; return true })
    const c = { id: 'a', title: 'A', category: 'X', run: () => {} }
    en(c); en(c); en(c)
    expect(calls).toBe(1)
  })
})
