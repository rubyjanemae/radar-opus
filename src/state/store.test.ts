import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, onTabClosed, selectActiveClipboard, selectActiveConsultation, useApp } from './store'
import type { Tab } from './workspace'

const st = () => useApp.getState()
const consultation = () => selectActiveConsultation(st())!
const clipboard = () => selectActiveClipboard(st())!

function fresh() {
  useApp.setState({
    patients: {}, consultations: {}, tabs: [], activeTabId: null, activeConsultationId: null, activeClipboardId: null,
    selectedSymptomIds: [], past: [], future: [], toasts: [],
  })
}

/** A patient with one consultation holding rubrics r:1..r:3 (history cleared). */
function withCase() {
  const pid = actions.createPatient({ firstName: 'Ada', lastName: 'Test' })
  const cid = actions.createConsultation(pid)
  actions.addRubrics(['r:1', 'r:2', 'r:3'])
  useApp.setState({ past: [], future: [] })
  return { pid, cid }
}

beforeEach(fresh)

describe('undo covers case actions', () => {
  const cases: [string, () => void][] = [
    ['take rubrics', () => actions.addRubrics(['r:9'])],
    ['add symptom', () => actions.addSymptom(clipboard().id, { rubrics: ['r:7', 'r:8'] })],
    ['update symptom', () => actions.updateSymptom(clipboard().id, clipboard().symptoms[0].id, { weight: 3 })],
    ['update symptoms', () => actions.updateSymptoms(clipboard().id, clipboard().symptoms.map(s => s.id), { eliminatory: true })],
    ['remove symptoms', () => actions.removeSymptoms(clipboard().id, [clipboard().symptoms[1].id])],
    ['move symptom', () => actions.moveSymptom(clipboard().id, clipboard().symptoms[0].id, 2)],
    ['reorder', () => actions.reorderSymptoms(clipboard().id, [...clipboard().symptoms].reverse().map(s => s.id))],
    ['combine', () => actions.combineSymptoms(clipboard().id, clipboard().symptoms.slice(0, 2).map(s => s.id), 'union')],
    ['clear clipboard', () => actions.clearClipboard(clipboard().id)],
    ['rename clipboard', () => actions.renameClipboard(clipboard().id, 'Mentals')],
    ['recolor clipboard', () => actions.recolorClipboard(clipboard().id, '#000000')],
    ['add clipboard', () => actions.addClipboard()],
    ['analysis options', () => actions.setAnalysis(consultation().id, { strategy: 'kent', excludedRemedies: [3] })],
    ['prescription', () => actions.addPrescription(consultation().id, { remedyId: 1, potency: '30C', dosage: '', date: '2026-01-01', note: '' })],
    ['edit consultation', () => actions.updateConsultation(consultation().id, { notes: 'better' })],
    ['edit patient', () => actions.updatePatient(consultation().patientId, { notes: 'x' })],
  ]
  for (const [name, run] of cases) {
    it(name, () => {
      withCase()
      const before = { patients: st().patients, consultations: st().consultations }
      run()
      expect(st().past).toHaveLength(1)
      expect(st().consultations === before.consultations && st().patients === before.patients).toBe(false)
      actions.undo()
      expect(st().patients).toBe(before.patients)
      expect(st().consultations).toBe(before.consultations)
      actions.redo()
      expect(st().consultations === before.consultations && st().patients === before.patients).toBe(false)
      expect(st().past).toHaveLength(1)
    })
  }

  it('labels each history entry and toasts what was undone and redone', () => {
    withCase()
    actions.addRubrics(['r:9'])
    expect(st().past.at(-1)!.label).toBe('Take rubric')
    actions.undo()
    expect(st().toasts.at(-1)!.text).toBe('Undone: Take rubric')
    actions.redo()
    expect(st().toasts.at(-1)!.text).toBe('Redone: Take rubric')
  })
})

describe('transaction', () => {
  it('new case + take into clipboard 3 is undone by one Undo', () => {
    const before = { patients: st().patients, consultations: st().consultations }
    actions.transaction(() => {
      const pid = actions.createPatient({ lastName: 'Unsaved case' })
      actions.createConsultation(pid)
      actions.addClipboard()
      const third = actions.addClipboard()!
      actions.addRubrics(['r:5'], { clipboardId: third })
    }, 'Take rubric')
    expect(consultation().clipboards).toHaveLength(3)
    expect(consultation().clipboards[2].symptoms).toHaveLength(1)
    expect(st().past).toHaveLength(1)
    expect(st().past[0].label).toBe('Take rubric')
    actions.undo()
    expect(st().patients).toBe(before.patients)
    expect(st().consultations).toBe(before.consultations)
    expect(st().activeConsultationId).toBeNull()
    expect(st().past).toHaveLength(0)
  })

  it('three qualified refs are undone by one Undo', () => {
    withCase()
    const before = st().consultations
    actions.transaction(() => {
      for (const r of ['r:4', 'r:5', 'r:6']) actions.addSymptom(clipboard().id, { rubrics: [r], weight: 2, eliminatory: true })
    })
    expect(clipboard().symptoms).toHaveLength(6)
    expect(st().past).toHaveLength(1)
    expect(st().past[0].label).toBe('Take symptom')
    actions.undo()
    expect(st().consultations).toBe(before)
  })

  it('nests, returns the value, and records nothing when nothing changed', () => {
    withCase()
    const v = actions.transaction(() => actions.transaction(() => actions.addRubrics(['r:1'])))
    expect(v).toBe(0)
    expect(st().past).toHaveLength(0)
  })

  it('ends the transaction when fn throws', () => {
    withCase()
    expect(() => actions.transaction(() => { actions.addRubrics(['r:4']); throw new Error('boom') })).toThrow('boom')
    actions.addRubrics(['r:5'])
    expect(st().past).toHaveLength(2)
  })
})

describe('focus is part of undo', () => {
  it('undo restores the active consultation and clipboard', () => {
    const { cid } = withCase()
    const cb1 = clipboard().id
    actions.addClipboard()
    expect(st().activeClipboardId).not.toBe(cb1)
    actions.undo()
    expect(st().activeConsultationId).toBe(cid)
    expect(st().activeClipboardId).toBe(cb1)
  })

  it('undoing a new follow-up re-activates the previous case', () => {
    const { pid, cid } = withCase()
    const fu = actions.createConsultation(pid, { kind: 'follow-up', title: 'Follow-up 1' })
    expect(st().activeConsultationId).toBe(fu)
    expect(st().past.at(-1)!.label).toBe('New follow-up')
    actions.undo()
    expect(st().consultations[fu]).toBeUndefined()
    expect(st().activeConsultationId).toBe(cid)
    actions.redo()
    expect(st().activeConsultationId).toBe(fu)
  })
})

describe('deletions', () => {
  it('deletePatient clears the active ids and undo reopens the tabs it closed', () => {
    const { pid, cid } = withCase()
    const other: Tab = { id: 'tab-rep', kind: 'repertory', repertory: 'r', rubric: 0, back: [], forward: [] }
    const ptab: Tab = { id: 'tab-p', kind: 'patient', patientId: pid }
    const atab: Tab = { id: 'tab-a', kind: 'analysis', consultationId: cid }
    useApp.setState({ tabs: [other, ptab, atab], activeTabId: 'tab-p' })
    const closed: string[] = []
    const off = onTabClosed(t => closed.push(t.id))
    actions.deletePatient(pid)
    off()
    expect(st().activeConsultationId).toBeNull()
    expect(st().activeClipboardId).toBeNull()
    expect(st().tabs.map(t => t.id)).toEqual(['tab-rep'])
    expect(closed).toEqual(['tab-p', 'tab-a'])
    actions.undo()
    expect(st().patients[pid]).toBeDefined()
    expect(st().activeConsultationId).toBe(cid)
    expect(st().tabs.map(t => t.id)).toEqual(['tab-rep', 'tab-p', 'tab-a'])
    expect(st().activeTabId).toBe('tab-p')
    actions.redo()
    expect(st().tabs.map(t => t.id)).toEqual(['tab-rep'])
  })

  it('deleting the active follow-up falls back to the latest remaining consultation', () => {
    const { pid } = withCase()
    const older = actions.createConsultation(pid, { date: '2020-01-01' })
    const latest = actions.createConsultation(pid, { date: '2025-06-01' })
    const fu = actions.createConsultation(pid, { date: '2026-01-01', kind: 'follow-up' })
    expect(st().activeConsultationId).toBe(fu)
    actions.deleteConsultation(fu)
    expect(st().activeConsultationId).not.toBe(older)
    expect(st().consultations[st().activeConsultationId!].date >= st().consultations[latest].date).toBe(true)
    expect(st().activeClipboardId).toBe(st().consultations[st().activeConsultationId!].clipboards[0].id)
  })
})

describe('no-op mutations record nothing', () => {
  it('re-taking an existing rubric, same colour, same name, same patch', () => {
    withCase()
    const c = consultation()
    expect(actions.addRubrics(['r:1'])).toBe(0)
    actions.recolorClipboard(clipboard().id, clipboard().color)
    actions.renameClipboard(clipboard().id, clipboard().name)
    actions.updateSymptom(clipboard().id, clipboard().symptoms[0].id, { weight: clipboard().symptoms[0].weight })
    actions.updateConsultation(c.id, { notes: c.notes })
    actions.setAnalysis(c.id, { excludedRemedies: [...c.analysis.excludedRemedies] })
    actions.updatePatient(c.patientId, { firstName: 'Ada' })
    actions.removeSymptoms(clipboard().id, ['missing'])
    expect(st().past).toHaveLength(0)
    expect(consultation()).toBe(c)
    expect(consultation().updatedAt).toBe(c.updatedAt)
  })
})

describe('symptom structure', () => {
  it('split parts drop the combined label', () => {
    withCase()
    const id = actions.addSymptom(clipboard().id, { rubrics: ['r:7', 'r:8'], label: 'Fear (with 1 sub-rubric)', group: 'a' })!
    actions.splitSymptom(clipboard().id, id)
    const parts = clipboard().symptoms.slice(-2)
    expect(parts.map(p => p.rubrics[0])).toEqual(['r:7', 'r:8'])
    expect(parts.every(p => p.label === undefined)).toBe(true)
    expect(parts.every(p => p.group === 'a')).toBe(true)
  })

  it('combine does not inherit the first part label, exclusion or group', () => {
    withCase()
    const [a, b] = clipboard().symptoms
    actions.updateSymptom(clipboard().id, a.id, { label: 'Only A', exclusive: true, group: 'a' })
    actions.updateSymptom(clipboard().id, b.id, { group: 'b', weight: 3 })
    actions.combineSymptoms(clipboard().id, [a.id, b.id], 'intersection')
    const merged = clipboard().symptoms[0]
    expect(merged.rubrics).toEqual(['r:1', 'r:2'])
    expect(merged).toMatchObject({ combine: 'intersection', exclusive: false, group: null, weight: 3 })
    expect(merged.label).toBeUndefined()
  })

  it('combine keeps a group shared by every part', () => {
    withCase()
    const [a, b] = clipboard().symptoms
    actions.updateSymptoms(clipboard().id, [a.id, b.id], { group: 'c' })
    actions.combineSymptoms(clipboard().id, [a.id, b.id], 'union')
    expect(clipboard().symptoms[0].group).toBe('c')
  })

  it('transfer skips (copy) or merges (move) symptoms already in the target and toasts the count', () => {
    withCase()
    const first = clipboard().id
    const second = actions.addClipboard()!
    actions.addRubrics(['r:1'], { clipboardId: second })
    const ids = consultation().clipboards[0].symptoms.map(s => s.id)
    expect(actions.transferSymptoms(first, second, ids, true)).toEqual({ transferred: 2, skipped: 1 })
    expect(st().toasts.at(-1)!.text).toMatch(/1 symptom was already in Clipboard 2: skipped/)
    expect(consultation().clipboards[1].symptoms.map(s => s.rubrics[0])).toEqual(['r:1', 'r:2', 'r:3'])
    const past = st().past.length
    expect(actions.transferSymptoms(first, second, ids, true)).toEqual({ transferred: 0, skipped: 3 })
    expect(st().past.length).toBe(past)
    expect(actions.transferSymptoms(first, second, ids, false)).toEqual({ transferred: 0, skipped: 3 })
    expect(consultation().clipboards[0].symptoms).toHaveLength(0)
    expect(consultation().clipboards[1].symptoms).toHaveLength(3)
  })
})

describe('toasts', () => {
  it('clears the timer on dismiss and pauses while hovered', () => {
    vi.useFakeTimers()
    try {
      actions.toast('hello')
      const id = st().toasts[0].id
      actions.pauseToasts(true)
      vi.advanceTimersByTime(10_000)
      expect(st().toasts).toHaveLength(1)
      actions.pauseToasts(false)
      vi.advanceTimersByTime(3_500)
      expect(st().toasts).toHaveLength(0)
      actions.toast('again')
      actions.dismissToast(st().toasts[0].id)
      expect(vi.getTimerCount()).toBe(0)
      expect(id).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
})
