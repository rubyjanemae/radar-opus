import { beforeEach, describe, expect, it } from 'vitest'
import { Catalog } from '../../data/catalog'
import { actions, selectActiveConsultation, useApp } from '../../state/store'
import { DEFAULT_TAKE } from './take'
import { clipboardMembership, currentRefs, ensureClipboard, subtreeRefs, setRepertoryCatalog, takeRefs, toggleBookmark } from './ops'
import { tinyRepertory } from './fixtures'

const rep = tinyRepertory()
const catalog = new Catalog([
  { id: 1, abbrev: 'Acon', name: 'Aconitum napellus', altName: null },
  { id: 2, abbrev: 'Ars', name: 'Arsenicum album', altName: null },
  { id: 3, abbrev: 'Bell', name: 'Belladonna', altName: null },
], [rep.info])
;(catalog as unknown as { loaded: Map<string, unknown> }).loaded.set('t', rep)
setRepertoryCatalog(catalog)

const consultation = () => selectActiveConsultation(useApp.getState())!

beforeEach(() => {
  useApp.setState({ patients: {}, consultations: {}, activeConsultationId: null, activeClipboardId: null, selectedSymptomIds: [], past: [], future: [], toasts: [], bookmarks: [], tabs: [], activeTabId: null })
})

describe('taking rubrics', () => {
  it('creates an unsaved case when there is no consultation', () => {
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE })).toBe(1)
    const c = consultation()
    expect(useApp.getState().patients[c.patientId].lastName).toBe('Unsaved case')
    expect(c.clipboards[0].symptoms[0]).toMatchObject({ rubrics: ['t:2'], weight: 1 })
  })
  it('does not duplicate, but updates the weight of an existing symptom', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE })).toBe(0)
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE, weight: 3 })).toBe(1)
    expect(consultation().clipboards[0].symptoms).toHaveLength(1)
    expect(consultation().clipboards[0].symptoms[0].weight).toBe(3)
  })
  it('applies qualifications and group letters', () => {
    takeRefs(['t:3'], { ...DEFAULT_TAKE, weight: 2, eliminatory: true, group: 'a', causal: true })
    expect(consultation().clipboards[0].symptoms[0]).toMatchObject({ weight: 2, eliminatory: true, exclusive: false, group: 'a', causal: true })
  })
  it('takes a rubric with its sub-rubrics as one combined symptom', () => {
    expect(subtreeRefs(rep, 1)).toEqual(['t:1', 't:2', 't:3'])
    takeRefs(['t:1'], { ...DEFAULT_TAKE, subRubrics: true })
    const s = consultation().clipboards[0].symptoms[0]
    expect(s.rubrics).toEqual(['t:1', 't:2', 't:3'])
    expect(s.combine).toBe('union')
    expect(s.label).toMatch(/with 2 sub-rubrics/)
  })
  it('creates clipboards up to the requested number and keeps the active one', () => {
    takeRefs(['t:4'], { ...DEFAULT_TAKE, clipboard: 3 })
    const c = consultation()
    expect(c.clipboards).toHaveLength(3)
    expect(c.clipboards[2].symptoms[0].rubrics).toEqual(['t:4'])
    expect(useApp.getState().activeClipboardId).toBe(c.clipboards[0].id)
    expect(ensureClipboard(2)?.id).toBe(c.clipboards[1].id)
  })
  it('reports clipboard membership per rubric', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    takeRefs(['t:2', 't:3'], { ...DEFAULT_TAKE, clipboard: 2 })
    const m = clipboardMembership(consultation())
    expect(m.get('t:2')?.map(x => x.n)).toEqual([1, 2])
    expect(m.get('t:3')?.map(x => x.n)).toEqual([2])
    expect(m.get('t:4')).toBeUndefined()
  })
  it('undo removes a take', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    actions.undo()
    expect(consultation().clipboards[0].symptoms).toHaveLength(0)
  })
})

describe('current rubric and bookmarks', () => {
  it('uses the active repertory tab', () => {
    actions.openTab({ kind: 'repertory', repertory: 't', rubric: 3, back: [], forward: [] }, { reuse: false })
    expect(currentRefs()).toEqual(['t:3'])
  })
  it('toggles a bookmark with the rubric path as label', () => {
    toggleBookmark('t:2')
    expect(useApp.getState().bookmarks[0]).toMatchObject({ ref: 't:2', label: 'Mind - fear - alone', folder: 'General' })
    toggleBookmark('t:2')
    expect(useApp.getState().bookmarks).toHaveLength(0)
  })
})
