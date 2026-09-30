import { beforeEach, describe, expect, it } from 'vitest'
import type { Catalog } from '../../data/catalog'
import type { Grade } from '../../data/types'
import type { RubricSource } from '../../engine/analysis'
import type { AnalysisOptions, Clipboard, Symptom } from '../../engine/model'
import { actions, useApp } from '../../state/store'
import type { AnalysisTab } from '../../state/workspace'
import * as familyOps from '../families/ops'
import * as ops from './ops'
import type { CatalogSource } from './source'
import { analyzeCached } from './useAnalysis'

const st = () => useApp.getState()

function twoCases() {
  const pa = actions.createPatient({ firstName: 'Anna', lastName: 'Keller' })
  const a = actions.createConsultation(pa)
  const pb = actions.createPatient({ firstName: 'Ben', lastName: 'Meier' })
  const b = actions.createConsultation(pb)
  return { a, b }
}

beforeEach(() => {
  useApp.setState({ patients: {}, consultations: {}, activeConsultationId: null, activeClipboardId: null, selectedSymptomIds: [], past: [], future: [], toasts: [], tabs: [], activeTabId: null })
})

describe('analysis target', () => {
  it('prefers the active case over the case of the visible analysis tab', () => {
    const { a, b } = twoCases()
    actions.setActiveConsultation(a)
    actions.openTab({ kind: 'analysis', consultationId: a })
    actions.setActiveConsultation(b)
    expect(ops.activeAnalysisTab()?.consultationId).toBe(a)
    expect(ops.targetConsultationId()).toBe(b)
  })

  it('falls back to the visible analysis tab, then to the last analysis tab', () => {
    const { a, b } = twoCases()
    actions.openTab({ kind: 'analysis', consultationId: a })
    actions.openTab({ kind: 'analysis', consultationId: b })
    actions.setActiveConsultation(null)
    expect(ops.targetConsultationId()).toBe(b)
    actions.openTab({ kind: 'patients' })
    expect(ops.targetConsultationId()).toBe(b)
    actions.activateTab(st().tabs.find(t => t.kind === 'analysis' && t.consultationId === a)!.id)
    expect(ops.targetConsultationId()).toBe(a)
  })

  it('families use the very same target, so family and remedy filters agree', () => {
    expect(familyOps.targetConsultationId).toBe(ops.targetConsultationId)
    const { a, b } = twoCases()
    actions.openTab({ kind: 'analysis', consultationId: a })
    actions.setActiveConsultation(b)
    expect(familyOps.targetConsultationId()).toBe(ops.targetConsultationId())
  })

  it('only the registered family dialog kind is offered', () => {
    expect(ops.FAMILY_FILTER_DIALOGS).toEqual(['families.filter'])
  })
})

describe('analysis tabs', () => {
  it('F8 opens, then focuses, the analysis of the active case and requests keyboard focus', () => {
    const { a, b } = twoCases()
    actions.setActiveConsultation(a)
    ops.openAnalysis()
    const first = ops.activeAnalysisTab()!
    expect(first.consultationId).toBe(a)
    expect(ops.takeFocus(first.id)).toBe(true)
    actions.setActiveConsultation(b)
    ops.openAnalysis()
    expect(ops.activeAnalysisTab()!.consultationId).toBe(b)
    actions.setActiveConsultation(a)
    ops.openAnalysis()
    // the existing tab is reused
    expect(ops.activeAnalysisTab()!.id).toBe(first.id)
    expect(st().tabs.filter(t => t.kind === 'analysis')).toHaveLength(2)
  })

  it('switchToActiveCase rebinds the tab, or shows the active case’s own tab', () => {
    const { a, b } = twoCases()
    actions.openTab({ kind: 'analysis', consultationId: a })
    const tab = ops.activeAnalysisTab()!
    actions.updateTab<AnalysisTab>(tab.id, { remedy: 7, symptom: 1, pinnedRemedies: [9] })
    actions.setActiveConsultation(b)
    ops.switchToActiveCase(ops.activeAnalysisTab()!)
    expect(ops.activeAnalysisTab()).toMatchObject({ id: tab.id, consultationId: b, remedy: null, symptom: null, pinnedRemedies: null })

    actions.openTab({ kind: 'analysis', consultationId: a })
    const other = ops.activeAnalysisTab()!
    actions.setActiveConsultation(b)
    ops.switchToActiveCase(other)
    expect(ops.activeAnalysisTab()!.id).toBe(tab.id)
    expect(st().tabs.find(t => t.id === other.id)).toMatchObject({ consultationId: a })
  })

  it('a family filter toast offers the analysis only when it is not already visible', () => {
    const { a } = twoCases()
    expect(familyOps.analysisToastAction(a)?.label).toBe('Open analysis')
    actions.openTab({ kind: 'analysis', consultationId: a })
    expect(familyOps.analysisToastAction(a)).toBeUndefined()
    actions.openTab({ kind: 'patients' })
    expect(familyOps.analysisToastAction(a)?.label).toBe('Show analysis')
  })
})

describe('shared analysis cache', () => {
  const R: Record<string, [number, Grade][]> = { 't:1': [[1, 3], [2, 1]], 'u:2': [[1, 4], [3, 2]] }
  const loaded = new Set(['t'])
  let calls = 0
  const src = {
    grades: (r: string) => { calls++; return loaded.has(r.split(':')[0]) && R[r] ? new Map(R[r]) : null },
    label: (r: string) => r,
    remedyName: (id: number) => String(id),
  } as RubricSource as unknown as CatalogSource
  const catalog = { repertory: (a: string) => (loaded.has(a) ? {} : null) } as unknown as Catalog
  const sym = (ref: string): Symptom => ({ id: ref, rubrics: [ref], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 0 })
  const cbs: Clipboard[] = [{ id: 'c1', name: 'C', color: '#000', symptoms: [sym('t:1'), sym('u:2')] }]
  const opts: AnalysisOptions = { strategy: 'sum-symptoms-degrees', clipboardIds: ['c1'], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 10 }

  it('computes once per clipboards + options, again when options or loaded repertories change', () => {
    const r1 = analyzeCached(src, catalog, cbs, opts)
    const n = calls
    expect(analyzeCached(src, catalog, cbs, opts)).toBe(r1)
    expect(calls).toBe(n)
    const r2 = analyzeCached(src, catalog, cbs, { ...opts, limit: 5 })
    expect(r2).not.toBe(r1)
    expect(r1.total).toBe(2)
    loaded.add('u')
    const r3 = analyzeCached(src, catalog, cbs, opts)
    expect(r3).not.toBe(r1)
    expect(r3.total).toBe(3)
    expect(analyzeCached(src, catalog, cbs, opts)).toBe(r3)
  })
})
