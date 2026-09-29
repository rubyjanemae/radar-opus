import { beforeEach, describe, expect, it } from 'vitest'
import { actions, selectActiveClipboard, useApp } from '../../state/store'
import * as ops from './ops'

const cb = () => selectActiveClipboard(useApp.getState())!
const ids = () => cb().symptoms.map(s => s.id)

beforeEach(() => {
  useApp.setState({ patients: {}, consultations: {}, activeConsultationId: null, activeClipboardId: null, selectedSymptomIds: [], past: [], future: [], toasts: [] })
  const pid = actions.createPatient({ firstName: 'Test' })
  actions.createConsultation(pid)
  actions.addRubrics(['r:1', 'r:2', 'r:3', 'r:4'])
  ops.setPanelUi({ cursorId: null, anchorId: null, groupPending: false })
})

describe('clipboard ops', () => {
  it('sets weight on the selection', () => {
    actions.setSelectedSymptoms(ids().slice(0, 2))
    ops.setWeight(3)
    expect(cb().symptoms.map(s => s.weight)).toEqual([3, 3, 1, 1])
  })

  it('falls back to the cursor row when nothing is selected', () => {
    ops.setPanelUi({ cursorId: ids()[2] })
    ops.setWeight(0)
    expect(cb().symptoms[2].weight).toBe(0)
  })

  it('eliminative and excluding are mutually exclusive, toggles flip', () => {
    actions.setSelectedSymptoms([ids()[0]])
    ops.toggleFlag('eliminatory')
    expect(cb().symptoms[0].eliminatory).toBe(true)
    ops.toggleFlag('exclusive')
    expect(cb().symptoms[0]).toMatchObject({ eliminatory: false, exclusive: true })
    ops.toggleFlag('exclusive')
    expect(cb().symptoms[0].exclusive).toBe(false)
  })

  it('assigns and clears groups', () => {
    actions.setSelectedSymptoms(ids().slice(1, 3))
    ops.setGroup('B')
    expect(cb().symptoms.map(s => s.group)).toEqual([null, 'b', 'b', null])
    ops.setGroup(null)
    expect(cb().symptoms.every(s => s.group === null)).toBe(true)
  })

  it('moves the selection with ctrl+arrows', () => {
    const [a, b, c, d] = ids()
    actions.setSelectedSymptoms([c])
    ops.moveSelected(-1)
    expect(ids()).toEqual([a, c, b, d])
    expect(ops.canMove(-1)).toBe(true)
    ops.moveSelected(-1)
    expect(ops.canMove(-1)).toBe(false)
  })

  it('removes with an undo toast that restores positions', () => {
    const before = ids()
    actions.setSelectedSymptoms([before[1], before[3]])
    ops.removeSelected()
    expect(ids()).toEqual([before[0], before[2]])
    const toast = useApp.getState().toasts.at(-1)!
    expect(toast.action?.label).toBe('Undo')
    // an unrelated edit after the removal survives the undo
    actions.updateSymptom(cb().id, before[0], { weight: 4 })
    toast.action!.run()
    expect(ids()).toEqual(before)
    expect(cb().symptoms[0].weight).toBe(4)
  })

  it('combines and splits', () => {
    actions.setSelectedSymptoms(ids().slice(0, 2))
    ops.combine('intersection')
    expect(cb().symptoms).toHaveLength(3)
    expect(cb().symptoms[0]).toMatchObject({ rubrics: ['r:1', 'r:2'], combine: 'intersection' })
    expect(ops.canSplit()).toBe(true)
    ops.split()
    expect(cb().symptoms.map(s => s.rubrics[0])).toEqual(['r:1', 'r:2', 'r:3', 'r:4'])
  })

  it('moves and copies to another clipboard', () => {
    const first = cb().id
    const second = actions.addClipboard()!
    actions.setActiveClipboard(first)
    actions.setSelectedSymptoms([ids()[0]])
    ops.transferSelected(second, true)
    expect(cb().symptoms).toHaveLength(4)
    actions.setSelectedSymptoms([ids()[0]])
    ops.transferSelected(second, false)
    expect(cb().symptoms).toHaveLength(3)
    const target = useApp.getState().consultations[useApp.getState().activeConsultationId!].clipboards.find(c => c.id === second)!
    expect(target.symptoms).toHaveLength(2)
  })

  it('cycles and selects clipboards by position', () => {
    const first = cb().id
    const second = actions.addClipboard()!
    ops.selectClipboardAt(0)
    expect(cb().id).toBe(first)
    ops.cycleClipboard(1)
    expect(cb().id).toBe(second)
    ops.cycleClipboard(1)
    expect(cb().id).toBe(first)
  })

  it('clears with undo', () => {
    ops.clearClipboard()
    expect(cb().symptoms).toHaveLength(0)
    useApp.getState().toasts.at(-1)!.action!.run()
    expect(cb().symptoms).toHaveLength(4)
  })

  it('toggles clipboards in the analysis selection, keeping clipboard order', () => {
    const first = cb().id
    const second = actions.addClipboard()!
    const c = () => useApp.getState().consultations[useApp.getState().activeConsultationId!]
    ops.toggleInAnalysis(first)
    expect(c().analysis.clipboardIds).toEqual([second])
    ops.toggleInAnalysis(first)
    expect(c().analysis.clipboardIds).toEqual([first, second])
  })
})
