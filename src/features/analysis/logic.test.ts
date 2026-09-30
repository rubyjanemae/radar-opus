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
    expect(lines[9]).toBe('L t:2,Mind,1,A C,1,4,')
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

describe('breakdown labels', () => {
  it('split the chapter off and abbreviate long chapter names', async () => {
    const { chapterTag, splitLabel } = await import('./labels')
    expect(splitLabel('MIND - fear, night')).toEqual({ chapter: 'MIND', path: 'fear, night' })
    expect(splitLabel('MIND')).toEqual({ chapter: '', path: 'MIND' })
    expect(chapterTag('GENERALITIES')).toBe('GENER.')
    expect(chapterTag('MIND')).toBe('MIND')
    expect(chapterTag('EXTERNAL THROAT')).toBe('EXTER. THROAT')
  })
  it('shorten long paths in the middle, keeping the first and the most specific parts', async () => {
    const { middleEllipsis } = await import('./labels')
    expect(middleEllipsis('pain, head', 40)).toBe('pain, head')
    const long = 'pain, forehead, extending to, occiput, and nape, evening, after eating'
    const short = middleEllipsis(long, 40)
    expect(short.length).toBeLessThanOrEqual(40)
    expect(short.startsWith('pain, …, ')).toBe(true)
    expect(short.endsWith('evening, after eating')).toBe(true)
    expect(middleEllipsis('x'.repeat(60), 20)).toHaveLength(20)
  })
})

describe('column scores', () => {
  it('fit a 36px column: the full score up to 5 characters, else the primary value', async () => {
    const { columnScore } = await import('./AnalysisGrid')
    expect(columnScore('16/29', { score: 16 })).toBe('16/29')
    expect(columnScore('100/250', { score: 100 })).toBe('100')
    expect(columnScore('431.8', { score: 431.82 })).toBe('431.8')
    expect(columnScore('1234.5', { score: 1234.5 })).toBe('1235')
  })
})

describe('strategy parameters drawer', () => {
  it('covers every numeric and boolean StrategyParams field except the unassignable SRP weight', async () => {
    const { PARAM_GROUPS } = await import('./ParamsDrawer')
    const { DEFAULT_PARAMS } = await import('../../engine/model')
    const leaves = (o: object, pre: string[] = []): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? leaves(v, [...pre, k]) : [[...pre, k].join('.')]))
    const edited = PARAM_GROUPS.flatMap(g => g.fields.map(f => [g.group, ...f.path].join('.'))).sort()
    expect(edited).toEqual(leaves(DEFAULT_PARAMS).filter(k => k !== 'kent.weights.srp').sort())
  })
  it('custom parameters are detected against the defaults', async () => {
    const { hasCustomParams } = await import('./ParamsDrawer')
    expect(hasCustomParams({ params: undefined })).toBe(false)
    expect(hasCustomParams({ params: { smallRubrics: { threshold: 10 } } })).toBe(false)
    expect(hasCustomParams({ params: { kent: { mustCoverStrong: true } } })).toBe(true)
  })
})
