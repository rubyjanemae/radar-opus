import { describe, expect, it } from 'vitest'
import type { Symptom } from '../../engine/model'
import { columnAbbrev, paneDetail, paneLabel, panePath, paneSymptomName } from './paneLabel'

const sym = (patch: Partial<Symptom>): Symptom => ({
  id: 's', rubrics: ['publicum:3'], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0, ...patch,
})
// a tiny repertory: 0 Mind > 1 absent-minded > 2 morning, 3 abrupt
const TEXT = ['Mind', 'absent-minded', 'morning', 'abrupt']
const LINEAGE: Record<number, number[]> = { 0: [0], 1: [0, 1], 2: [0, 1, 2], 3: [0, 3] }
const catalog = {
  resolve: (ref: string) => {
    const i = Number(ref.slice(ref.lastIndexOf(':') + 1))
    return ref.startsWith('publicum:') && LINEAGE[i] ? { rep: { lineage: (k: number) => LINEAGE[k], text: (k: number) => TEXT[k] }, index: i } : null
  },
  repertoryInfos: [{ abbrev: 'publicum', title: 'Repertorium Publicum' }],
} as never

describe('symptom pane labels (RadarOpus form)', () => {
  it('chapter and first level in capitals, " - " between levels', () => {
    expect(panePath(['Mind', 'abrupt'])).toBe('MIND - ABRUPT')
    expect(panePath(['Mind', 'absent-minded', 'morning'])).toBe('MIND - ABSENT-MINDED - morning')
    expect(paneLabel(catalog, { members: [sym({ rubrics: ['publicum:3'] })] })).toBe('MIND - ABRUPT')
    expect(paneLabel(catalog, { members: [sym({ rubrics: ['publicum:2'] })] })).toBe('MIND - ABSENT-MINDED - morning')
  })
  it('combined rubrics, groups, own labels and unloaded rubrics', () => {
    expect(paneLabel(catalog, { members: [sym({ rubrics: ['publicum:3', 'publicum:1'], combine: 'intersection' })] })).toBe('MIND - ABRUPT ∩ MIND - ABSENT-MINDED')
    expect(paneLabel(catalog, { members: [sym({ rubrics: ['publicum:3'] }), sym({ rubrics: ['publicum:2'] })] })).toBe('MIND - ABRUPT + MIND - ABSENT-MINDED - morning')
    expect(paneLabel(catalog, { members: [sym({ label: 'Fear of dogs' })] })).toBe('Fear of dogs')
    expect(paneLabel(catalog, { members: [sym({ rubrics: ['kent:9'] })] })).toBe('kent:9')
  })
  it('column abbreviations are lower case with a final dot', () => {
    expect(columnAbbrev('Nux-v')).toBe('nux-v.')
    expect(columnAbbrev('Calc')).toBe('calc.')
    expect(columnAbbrev('abies-c.')).toBe('abies-c.')
  })
  it('the detail line names the repertory, size, intensity and qualifiers', () => {
    const s = sym({ weight: 2, eliminatory: true, group: 'a', note: 'since the accident' })
    expect(paneDetail(catalog, { symptom: s, members: [s], size: 43 })).toBe('Repertorium Publicum · eliminative, group A · since the accident')
    const z = sym({ weight: 0 })
    expect(paneDetail(catalog, { symptom: z, members: [z], size: 1 })).toBe('Repertorium Publicum · ignored (intensity 0)')
  })
  it('the symptom line has a spoken name with its parts separated', () => {
    const s = sym({ weight: 1 })
    expect(paneSymptomName({ symptom: s, members: [s], size: 4 } as never, 1, 'MIND - ABRUPT')).toBe('1. MIND - ABRUPT, 4 remedies, intensity 1')
    const z = sym({ weight: 0, causal: true })
    expect(paneSymptomName({ symptom: z, members: [z], size: 12 } as never, 2, 'MIND - ABSENT-MINDED')).toBe('2. MIND - ABSENT-MINDED, 12 remedies, intensity 0 (ignored), causal')
  })
})
