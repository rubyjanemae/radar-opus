import { describe, expect, it } from 'vitest'
import type { Grade } from '../../data/types'
import { analyze } from '../../engine/analysis'
import type { RubricSource } from '../../engine/analysis'
import type { AnalysisOptions, Clipboard, Symptom } from '../../engine/model'
import { tinyRepertory } from '../repertory/fixtures'
import { caseChapterCoverage, initialCompare, sphereOfAction } from './compare'
import { analysisCsv, safeFileName, symptomFlags } from './export'
import { repertoriesOf } from './useAnalysis'

const R: Record<string, [number, Grade][]> = { 't:1': [[1, 3], [2, 1]], 't:2': [[1, 4]], 't:6': [[1, 1], [3, 3]] }
const src: RubricSource = { grades: r => (R[r] ? new Map(R[r]) : null), label: r => (r === 't:1' ? 'MIND - fear, "night"' : `L ${r}`), remedyName: id => ['', 'Acon', 'Bell', 'Calc'][id] }
const sym = (ref: string, p: Partial<Symptom> = {}): Symptom => ({ id: ref, rubrics: [ref], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0, ...p })
const cbs: Clipboard[] = [{ id: 'c1', name: 'Mind', color: '#000', symptoms: [sym('t:1', { weight: 2, eliminatory: true }), sym('t:2', { group: 'a', causal: true }), sym('t:6', { weight: 0 })] }]
const opts: AnalysisOptions = { strategy: 'sum-symptoms-degrees', clipboardIds: ['c1'], remedyFilter: null, excludedRemedies: [2], minCoverage: 0, limit: 10, showExcluded: true }
const meta = { title: 'Keller, Anna · First', clipboardName: () => 'Mind', remedyAbbrev: (id: number) => ['', 'Acon', 'Bell', 'Calc'][id], remedyName: (id: number) => ['', 'Aconitum', 'Belladonna', 'Calcarea'][id] }

describe('export', () => {
  const result = analyze(src, cbs, opts)
  it('flags', () => {
    expect(result.symptoms.map(symptomFlags)).toEqual(['E', 'A C', '0'])
  })
  it('CSV: symptoms as rows, remedies as ranked columns, quoted fields', () => {
    const csv = analysisCsv(result, result.rows, meta)
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Analysis,"Keller, Anna · First",Strategy,Sum of symptoms (sort degrees),Intensity,on')
    expect(lines[2]).toBe('Symptom,Clipboard,Intensity,Flags,Rubric size,Acon,Bell')
    expect(lines[4]).toBe('Rank,,,,,1,(excluded by you)')
    expect(lines[5]).toBe('Score,,,,,3/10,2/2')
    expect(lines[8]).toBe('"MIND - fear, ""night""",Mind,2,E,2,3,1')
    expect(lines[9]).toBe('[a] L t:2,Mind,1,A C,1,4,')
    expect(lines[10]).toBe('L t:6,Mind,0,0,2,1,')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('safe file names', () => {
    expect(safeFileName('Keller, Anna · First / 2026-09-29')).toBe('Keller-Anna-First-2026-09-29')
    expect(safeFileName('///')).toBe('analysis')
  })
})

describe('compare', () => {
  const rep = tinyRepertory()
  it('sphere of action counts rubrics per chapter', () => {
    // Acon(1): fear, alone (Mind), pain (Head); Calc(3): night (Mind), pain (Head)
    const s = sphereOfAction(rep, [1, 3])
    expect(s.chapters).toEqual(['Mind', 'Head'])
    expect(s.counts).toEqual([[2, 1], [1, 1]])
    expect(s.totals).toEqual([3, 2])
  })
  it('case chapters with coverage per remedy', () => {
    const result = analyze(src, cbs, { ...opts, excludedRemedies: [], showExcluded: false })
    const ch = caseChapterCoverage(result, [1, 2], ref => (ref === 't:6' ? 'Head' : 'Mind'))
    // t:6 is ignored (weight 0) so only Mind appears
    expect(ch).toEqual([{ chapter: 'Mind', total: 2, covered: [2, 1], degrees: [7, 1] }])
  })
  it('initial selection: given list, else top 4 ranked', () => {
    const result = analyze(src, cbs, { ...opts, excludedRemedies: [], showExcluded: false })
    expect(initialCompare(result, [3, 3, 1])).toEqual([3, 1])
    expect(initialCompare(result)).toEqual([1, 2])
    expect(initialCompare(null)).toEqual([])
  })
  it('repertories referenced by clipboards', () => {
    expect(repertoriesOf([{ id: 'x', name: '', color: '', symptoms: [sym('kent-de:4'), sym('publicum:9'), { ...sym('a:1'), rubrics: ['publicum:3', 'kent-de:1'] }] }])).toEqual(['kent-de', 'publicum'])
  })
})
