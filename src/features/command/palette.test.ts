import { describe, expect, it } from 'vitest'
import type { Command } from '../../commands/registry'
import type { Patient } from '../../state/patients'
import { fuzzy, markPositions } from './fuzzy'
import { paletteItems, parseMode } from './model'
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

  it('shows recent commands first when empty, enabled before disabled', () => {
    const commands = [cmd('a', 'Alpha'), cmd('b', 'Beta', { enabled: () => false }), cmd('c', 'Gamma'), cmd('h', 'Hidden', { hidden: true })]
    const s = paletteItems(input({ commands, recent: ['c', 'zzz'] }))
    expect(s.map(x => x.key)).toEqual(['recent', 'commands'])
    expect(s[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['c'])
    expect(s[1].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['a', 'b'])
    expect(s[1].items[1].disabled).toBe(true)
  })

  it('ranks commands by fuzzy score with a recent-use boost', () => {
    const commands = [cmd('x', 'Zoom out'), cmd('y', 'Zoom in'), cmd('z', 'Reset zoom')]
    const s = paletteItems(input({ mode: 'commands', text: 'zoom', commands, recent: ['y'] }))
    expect(s[0].items.map(i => i.kind === 'command' && i.command.id)).toEqual(['y', 'x', 'z'])
  })

  it('finds commands by keywords and category', () => {
    const commands = [cmd('t', 'Dark', { keywords: 'theme' })]
    const s = paletteItems(input({ mode: 'commands', text: 'theme', commands }))
    expect(s[0].items).toHaveLength(1)
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
})
