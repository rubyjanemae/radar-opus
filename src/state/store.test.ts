import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, combinedFlags, onTabClosed, pruneHistory, sameValue, selectActiveClipboard, selectActiveConsultation, symptomEditLabel, useApp } from './store'
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
      expect(st().patients).toEqual(before.patients)
      expect(st().consultations).toEqual(before.consultations)
      // records the step did not touch keep their objects
      for (const [id, c] of Object.entries(st().consultations)) if (sameValue(c, before.consultations[id])) expect(c).toBe(before.consultations[id])
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
    expect(st().patients).toEqual(before.patients)
    expect(st().consultations).toEqual(before.consultations)
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
    expect(st().consultations).toEqual(before)
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
  it('split parts keep the source label, note and flags', () => {
    withCase()
    const id = actions.addSymptom(clipboard().id, { rubrics: ['r:7', 'r:8'], label: 'Fear, worse at night', note: 'n', group: 'a', exclusive: true, weight: 3 })!
    actions.splitSymptom(clipboard().id, id)
    const parts = clipboard().symptoms.slice(-2)
    expect(parts.map(p => p.rubrics[0])).toEqual(['r:7', 'r:8'])
    expect(parts.every(p => p.label === 'Fear, worse at night' && p.note === 'n')).toBe(true)
    expect(parts.every(p => p.group === 'a' && p.exclusive && p.weight === 3 && p.combine === 'union')).toBe(true)
    expect(new Set(parts.map(p => p.id)).size).toBe(2)
    actions.undo()
    expect(clipboard().symptoms.at(-1)!.id).toBe(id)
  })

  it('combine inherits the first part label and group, and the highest weight', () => {
    withCase()
    const [a, b] = clipboard().symptoms
    actions.updateSymptom(clipboard().id, a.id, { label: 'Only A', group: 'a' })
    actions.updateSymptom(clipboard().id, b.id, { label: 'B', group: 'b', weight: 3 })
    actions.combineSymptoms(clipboard().id, [a.id, b.id], 'intersection')
    const merged = clipboard().symptoms[0]
    expect(merged.rubrics).toEqual(['r:1', 'r:2'])
    expect(merged).toMatchObject({ combine: 'intersection', group: 'a', weight: 3, label: 'Only A', eliminatory: false, exclusive: false })
  })

  it.each([
    ['all excluding: excluding', [{ exclusive: true }, { exclusive: true }], { eliminatory: false, exclusive: true }],
    ['one excluding, one plain: plain', [{ exclusive: true }, {}], { eliminatory: false, exclusive: false }],
    ['one excluding, one eliminative: eliminative', [{ exclusive: true }, { eliminatory: true }], { eliminatory: true, exclusive: false }],
    ['one eliminative, one plain: eliminative', [{ eliminatory: true }, {}], { eliminatory: true, exclusive: false }],
    ['first eliminative, rest excluding: eliminative', [{ eliminatory: true }, { exclusive: true }, { exclusive: true }], { eliminatory: true, exclusive: false }],
  ] as const)('combine never carries both eliminative and excluding (%s)', (_, flags, expected) => {
    withCase()
    const syms = clipboard().symptoms.slice(0, flags.length)
    syms.forEach((x, i) => actions.updateSymptom(clipboard().id, x.id, { eliminatory: false, exclusive: false, ...flags[i] }))
    actions.combineSymptoms(clipboard().id, syms.map(x => x.id), 'union')
    expect(clipboard().symptoms[0]).toMatchObject(expected)
    expect(combinedFlags(flags.map(f => ({ eliminatory: false, exclusive: false, ...f })))).toEqual(expected)
  })

  it('combine of unlabelled parts has no label', () => {
    withCase()
    const [a, b] = clipboard().symptoms
    actions.updateSymptoms(clipboard().id, [a.id, b.id], { group: 'c' })
    actions.combineSymptoms(clipboard().id, [a.id, b.id], 'union')
    expect(clipboard().symptoms[0].group).toBe('c')
    expect(clipboard().symptoms[0].label).toBeUndefined()
    expect(clipboard().symptoms[0].exclusive).toBe(false)
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

describe('undo labels name the symptom edit', () => {
  it.each([
    [{ weight: 0 }, 1, 'Set intensity 0'],
    [{ weight: 3 }, 4, 'Set intensity 3 (4 symptoms)'],
    [{ eliminatory: true, exclusive: false }, 1, 'Mark eliminative'],
    [{ eliminatory: false }, 1, 'Clear eliminative'],
    [{ exclusive: true, eliminatory: false }, 1, 'Mark excluding'],
    [{ exclusive: false }, 2, 'Clear excluding (2 symptoms)'],
    [{ causal: true }, 1, 'Mark causal'],
    [{ group: 'b' }, 1, 'Set group B'],
    [{ group: null }, 1, 'Clear group'],
    [{ note: 'x' }, 1, 'Edit note'],
    [{ note: undefined }, 1, 'Remove note'],
  ] as const)('%o on %i symptom(s) is "%s"', (patch, n, label) => {
    expect(symptomEditLabel(patch, n)).toBe(label)
  })

  it('the history entry and the undo toast carry the label', () => {
    withCase()
    actions.updateSymptoms(clipboard().id, [clipboard().symptoms[0].id], { weight: 0 })
    expect(st().past.at(-1)!.label).toBe('Set intensity 0')
    actions.updateSymptoms(clipboard().id, [clipboard().symptoms[0].id], { eliminatory: true, exclusive: false })
    expect(st().past.at(-1)!.label).toBe('Mark eliminative')
    actions.undo()
    expect(st().toasts.at(-1)!.text).toBe('Undone: Mark eliminative')
  })
})

describe('undo is per record', () => {
  it('undo writes back only the records the step changed', () => {
    const { pid, cid } = withCase()
    actions.addRubrics(['r:9'])
    // another source replaces an unrelated patient and adds a consultation (e.g. adopted from another tab)
    const other = { ...st().patients[pid], id: 'p-other', lastName: 'Other', notes: 'from B' }
    useApp.setState(s => ({ patients: { ...s.patients, [other.id]: other } }))
    actions.undo()
    expect(st().patients['p-other']).toBe(other)
    expect(st().consultations[cid].clipboards[0].symptoms.map(x => x.rubrics[0])).toEqual(['r:1', 'r:2', 'r:3'])
    actions.redo()
    expect(st().consultations[cid].clipboards[0].symptoms).toHaveLength(4)
    expect(st().patients['p-other']).toBe(other)
  })

  it('pruneHistory drops only the steps that touch replaced records', () => {
    const { pid, cid } = withCase()
    actions.addRubrics(['r:9'])
    actions.updatePatient(pid, { notes: 'mine' })
    expect(st().past).toHaveLength(2)
    pruneHistory({ patients: [pid], consultations: [] })
    expect(st().past.map(e => e.label)).toEqual(['Take rubric'])
    pruneHistory({ patients: [], consultations: [cid] })
    expect(st().past).toHaveLength(0)
  })
})

describe('lastRepertoryTabId', () => {
  it('records the repertory tab last activated, not other kinds', () => {
    useApp.setState({ lastRepertoryTabId: null, tabs: [{ id: 'r1', kind: 'repertory' }, { id: 'm1', kind: 'mm' }, { id: 'r2', kind: 'repertory' }] as unknown as Tab[] })
    actions.activateTab('r2')
    expect(st().lastRepertoryTabId).toBe('r2')
    actions.activateTab('m1')
    expect(st().lastRepertoryTabId).toBe('r2')
    actions.activateTab('r1')
    expect(st().lastRepertoryTabId).toBe('r1')
  })
})
