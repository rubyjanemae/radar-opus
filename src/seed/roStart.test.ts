import { describe, expect, it } from 'vitest'
import { Repertory } from '../data/repertory'
import type { RepertoryFile, RepertoryInfo } from '../data/types'
import { buildRoStart, RO_START } from './roStart'

const proc = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(m: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } } }).process
const fs = proc.getBuiltinModule('node:fs')
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(`${proc.cwd()}/public/data/${f}`, 'utf8')) as T

describe('RadarOpus start state (?seed=ro)', () => {
  const info = read<RepertoryInfo[]>('repertories.json').find(i => i.abbrev === 'publicum')!
  const rep = new Repertory(info, read<RepertoryFile>(info.file))
  const ro = buildRoStart(rep, Date.parse('2026-11-06T12:00:00'))
  it('is the practice case with clipboards of 24, 18 and 9 distinct rubrics', () => {
    expect([ro.patient.firstName, ro.patient.lastName, ro.patient.birthDate, ro.patient.code]).toEqual(['Oefen', 'Casus', '2000-01-01', '1'])
    expect(ro.consultation.date).toBe(RO_START.consultationDate)
    expect(ro.consultation.clipboards.map(c => c.symptoms.length)).toEqual([24, 18, 9])
    const refs = ro.consultation.clipboards.flatMap(c => c.symptoms.map(s => s.rubrics[0]))
    expect(new Set(refs).size).toBe(51)
    expect(ro.consultation.analysis.clipboardIds).toEqual([ro.consultation.clipboards[0].id])
  })
  it('opens the repertory at MIND - WEARISOME', () => {
    expect(rep.text(ro.rubric).toLowerCase()).toBe('wearisome')
    expect(rep.text(rep.chapterRoot(ro.rubric)).toLowerCase()).toBe('mind')
  })
})
