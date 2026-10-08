import { describe, expect, it } from 'vitest'
import { Catalog } from '../data/catalog'
import { Repertory } from '../data/repertory'
import type { RepertoryFile, RepertoryInfo } from '../data/types'
import { analyze } from '../engine/analysis'
import { CatalogSource } from '../features/analysis/source'
import { tinyRepertory } from '../features/repertory/fixtures'
import { buildDemoPractice, rng } from './build'
import { resolvePath } from './rubrics'
import { fastest } from '../testing/timing'

/** Node's fs without depending on @types/node in the app tsconfig. */
const proc = (globalThis as unknown as { process: { cwd(): string; getBuiltinModule(m: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } } }).process
const fs = proc.getBuiltinModule('node:fs')
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(`${proc.cwd()}/public/data/${f}`, 'utf8')) as T

describe('resolvePath', () => {
  const rep = tinyRepertory()
  it('walks chapter → rubric → sub-rubric, case-insensitively', () => {
    expect(resolvePath(rep, 'Mind')).toBe(0)
    expect(resolvePath(rep, 'mind, FEAR, alone')).toBe(2)
    expect(resolvePath(rep, 'Head, pain')).toBe(6)
  })
  it('returns -1 for unknown paths', () => {
    expect(resolvePath(rep, 'Mind, nonsense')).toBe(-1)
    expect(resolvePath(rep, 'Nowhere')).toBe(-1)
  })
})

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = rng(7), b = rng(7)
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)])
  })
})

describe('demo practice over the real Publicum repertory', () => {
  const infos = read<RepertoryInfo[]>('repertories.json')
  const info = infos.find(i => i.abbrev === 'publicum')!
  const rep = new Repertory(info, read<RepertoryFile>(info.file))
  const rows = read<[number, string, string, string | null][]>('remedies.json')
  const catalog = new Catalog(rows.map(([id, abbrev, name, altName]) => ({ id, abbrev, name, altName })), infos)
  ;(catalog as unknown as { loaded: Map<string, Repertory> }).loaded.set('publicum', rep)
  const remedyId = (a: string) => catalog.remedyByAbbrev.get(a.toLowerCase())?.id
  const now = Date.parse('2026-09-29T12:00:00Z')

  it('builds ~45 patients with 1–6 consultations each, fast', () => {
    resolvePath(rep, 'Mind') // warm the child index outside the timing
    const { ms, result: demo } = fastest(3, () => buildDemoPractice({ rep, remedyId, now }))
    expect(ms).toBeLessThan(300)
    const patients = Object.values(demo.patients)
    expect(patients.length).toBe(45)
    for (const p of patients) {
      const n = Object.values(demo.consultations).filter(c => c.patientId === p.id).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(6)
      expect(p.email).toMatch(/@example\.com$/)
      expect(p.phone).toContain('555-01')
    }
    expect(new Set(patients.map(p => `${p.firstName} ${p.lastName}`)).size).toBe(45)
    expect(patients.some(p => p.tags.includes('paediatric'))).toBe(true)
    expect(patients.some(p => p.tags.includes('acute'))).toBe(true)
    expect(demo.activeConsultationId && demo.consultations[demo.activeConsultationId]).toBeTruthy()
  })

  it('resolves (nearly) every curated rubric path', () => {
    const demo = buildDemoPractice({ rep, remedyId, now })
    expect(demo.missing).toEqual([])
  })

  it('gives archetype patients notes and follow-ups a response to the previous remedy', () => {
    const demo = buildDemoPractice({ rep, remedyId, now })
    for (const id of Object.values(demo.archetypes)) expect(demo.patients[id].notes.length).toBeGreaterThan(40)
    const fus = Object.values(demo.consultations).filter(c => c.kind === 'follow-up' || c.kind === 'phone')
    expect(fus.length).toBeGreaterThan(10)
    for (const c of fus) expect(c.response?.score).toBeTypeOf('number')
  })

  it('dates lie within the past three years and never in the future', () => {
    const demo = buildDemoPractice({ rep, remedyId, now })
    for (const c of Object.values(demo.consultations)) {
      const t = Date.parse(c.date)
      expect(t).toBeLessThanOrEqual(now)
      expect(t).toBeGreaterThan(now - 3.1 * 365 * 86_400_000)
      for (const rx of c.prescriptions) expect(rx.potency).toMatch(/^(\d+C|LM\d+|1M|10M)$/)
    }
  })

  it.each([
    ['puls', 'Puls'], ['ars', 'Ars'], ['sulph', 'Sulph'], ['lyc', 'Lyc'],
    ['natm', 'Nat-m'], ['phos', 'Phos'], ['calc', 'Calc'], ['nux', 'Nux-v'],
  ])('archetype %s analyses to %s', (key, abbrev) => {
    const demo = buildDemoPractice({ rep, remedyId, now })
    const pid = demo.archetypes[key]
    const first = Object.values(demo.consultations).find(c => c.patientId === pid && c.kind === 'first')!
    const src = new CatalogSource(catalog)
    const result = analyze(src, first.clipboards, first.analysis)
    expect(catalog.remedy(result.rows[0].remedyId).abbrev).toBe(abbrev)
  })
})
