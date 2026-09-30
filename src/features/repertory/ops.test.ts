import { beforeEach, describe, expect, it } from 'vitest'
import { Catalog } from '../../data/catalog'
import { actions, selectActiveConsultation, useApp } from '../../state/store'
import { DEFAULT_TAKE } from './take'
import { clipboardMembership, clipboardTitle, currentRefs, ensureClipboard, existingSymptom, highlightRemedy, openRepertory, recentOf, remedyMenuItems, subtreeRefs, setRepertoryCatalog, takePatch, takeRefs, takeToastText, takeUndoLabel, toggleBookmark } from './ops'
import { parseTake } from './take'
import type { TakeOptions } from './take'
import { getHighlight } from './highlight'
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
  useApp.setState({ patients: {}, consultations: {}, activeConsultationId: null, activeClipboardId: null, selectedSymptomIds: [], past: [], future: [], toasts: [], bookmarks: [], tabs: [], activeTabId: null, recentRubrics: [] })
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
  it('does not duplicate a /s take: same rubric set updates the existing symptom', () => {
    takeRefs(['t:1'], { ...DEFAULT_TAKE, subRubrics: true })
    expect(takeRefs(['t:1'], { ...DEFAULT_TAKE, subRubrics: true })).toBe(0)
    expect(takeRefs(['t:1'], { ...DEFAULT_TAKE, subRubrics: true, weight: 3, group: 'b' })).toBe(1)
    const syms = consultation().clipboards[0].symptoms
    expect(syms).toHaveLength(1)
    expect(syms[0]).toMatchObject({ weight: 3, group: 'b' })
  })
  it('a /s take of a leaf acts on the plain rubric symptom', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE, subRubrics: true })).toBe(0)
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE, subRubrics: true, eliminatory: true })).toBe(1)
    const syms = consultation().clipboards[0].symptoms
    expect(syms).toHaveLength(1)
    expect(syms[0]).toMatchObject({ rubrics: ['t:2'], eliminatory: true })
    expect(useApp.getState().toasts.at(-1)?.text).toMatch(/no sub-rubrics/)
  })
  it('keeps one repertory toast on screen and merges successive takes', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    takeRefs(['t:3'], { ...DEFAULT_TAKE })
    takeRefs(['t:4'], { ...DEFAULT_TAKE, weight: 2 })
    const toasts = useApp.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].text).toMatch(/^3 rubrics taken → Clipboard 1 · last: anger ×2$/)
    expect(toasts[0].action?.label).toBe('Undo last')
  })
  it('a merged toast lists where each take went and names the last rubric, never "last: 2 rubrics"', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    takeRefs(['t:3', 't:4'], { ...DEFAULT_TAKE, clipboard: 2 })
    const text = useApp.getState().toasts[0].text
    expect(text).toMatch(/^3 rubrics taken 1 → Clipboard 1, 2 → .+ · last: anger and 1 more ×1$/)
    expect(text).not.toMatch(/last: \d+ rubrics/)
    expect(takeToastText([{ count: 1, target: 'A', last: 'x' }], 'single')).toBe('single')
  })
  it('a single take toast is one line without brackets', () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE, weight: 2 })
    const text = useApp.getState().toasts.at(-1)!.text
    expect(text).toMatch(/^Taken .+ · ×2 → Clipboard 1/)
    expect(text).not.toMatch(/[()]/)
  })
  it('records taken rubrics in the workspace Recent list', () => {
    actions.openTab({ kind: 'repertory', repertory: 't', rubric: 0, back: [], forward: [] }, { reuse: false })
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    takeRefs(['t:3'], { ...DEFAULT_TAKE })
    takeRefs(['t:2'], { ...DEFAULT_TAKE, weight: 2 })
    expect(useApp.getState().recentRubrics).toEqual(['t:2', 't:3'])
    // kept when the tab closes (workspace state, saved by the autosave)
    actions.closeTab(useApp.getState().tabs[0].id)
    expect(useApp.getState().recentRubrics).toEqual(['t:2', 't:3'])
    expect(recentOf(useApp.getState().recentRubrics, 't', [5, 2])).toEqual([2, 3, 5])
    expect(recentOf(['x:1', 't:4'], 't')).toEqual([4])
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
    takeRefs(['t:3'], { ...DEFAULT_TAKE })
    actions.undo()
    expect(consultation().clipboards[0].symptoms.map(x => x.rubrics[0])).toEqual(['t:2'])
  })
  it('a take is one undo step, including the unsaved case and clipboards it created', () => {
    takeRefs(['t:2', 't:3'], { ...DEFAULT_TAKE, clipboard: 3, eliminatory: true })
    expect(useApp.getState().past).toHaveLength(1)
    actions.undo()
    expect(selectActiveConsultation(useApp.getState())).toBeNull()
    expect(Object.keys(useApp.getState().patients)).toHaveLength(0)
  })
  it("the toast's Undo undoes exactly that take, and nothing once the case changed", () => {
    takeRefs(['t:2'], { ...DEFAULT_TAKE })
    takeRefs(['t:3'], { ...DEFAULT_TAKE, clipboard: 2 })
    useApp.getState().toasts.at(-1)!.action!.run()
    const c = consultation()
    expect(c.clipboards[0].symptoms).toHaveLength(1)
    expect(c.clipboards[1]?.symptoms ?? []).toHaveLength(0)
    takeRefs(['t:4'], { ...DEFAULT_TAKE })
    const undo = useApp.getState().toasts.at(-1)!.action!.run
    actions.addRubrics(['t:3'], { clipboardId: c.clipboards[0].id, weight: 1 })
    undo()
    expect(consultation().clipboards[0].symptoms).toHaveLength(3)
  })
})

const parsed = (cmd: string): TakeOptions => { const r = parseTake(cmd); if (!r.ok) throw new Error(r.error); return r.options }

describe('taking again never silently downgrades', () => {
  it('a bare + (or Insert, Ctrl+Enter) on a taken rubric changes nothing and says where it is', () => {
    takeRefs(['t:2'], parsed('+3'))
    expect(takeRefs(['t:2'], parsed('+'))).toBe(0)
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE })).toBe(0)
    expect(consultation().clipboards[0].symptoms[0].weight).toBe(3)
    expect(useApp.getState().toasts.at(-1)?.text).toBe('Already in Clipboard 1: Mind - fear - alone')
  })
  it('only an explicit +N changes the intensity, also down', () => {
    takeRefs(['t:2'], parsed('+3'))
    expect(takeRefs(['t:2'], parsed('+1'))).toBe(1)
    expect(consultation().clipboards[0].symptoms[0].weight).toBe(1)
  })
  it('the mini-language only adds what it names; it keeps the intensity and other qualifications', () => {
    takeRefs(['t:2'], parsed('+3a'))
    expect(takeRefs(['t:2'], parsed('+!'))).toBe(1)
    expect(consultation().clipboards[0].symptoms[0]).toMatchObject({ weight: 3, group: 'a', eliminatory: true })
    expect(takeRefs(['t:2'], parsed('+x'))).toBe(1)
    expect(consultation().clipboards[0].symptoms[0]).toMatchObject({ weight: 3, group: 'a', eliminatory: false, exclusive: true })
  })
  it('the F6 dialog (replace) sets everything it shows, clearing what is unticked', () => {
    takeRefs(['t:2'], parsed('+3!a'))
    expect(takeRefs(['t:2'], { ...DEFAULT_TAKE, weight: 2, weightSet: true, replace: true })).toBe(1)
    expect(consultation().clipboards[0].symptoms[0]).toMatchObject({ weight: 2, eliminatory: false, group: null })
  })
  it('takePatch lists only real changes', () => {
    const x = { id: 's', rubrics: ['t:2'], weight: 2, eliminatory: true, group: 'b' } as unknown as Parameters<typeof takePatch>[0]
    expect(takePatch(x, parsed('+'))).toEqual({})
    expect(takePatch(x, parsed('+2!b'))).toEqual({})
    expect(takePatch(x, parsed('+4'))).toEqual({ weight: 4 })
    expect(takePatch(x, { ...DEFAULT_TAKE, weight: 2, replace: true, weightSet: true, eliminatory: true, group: 'b' })).toEqual({})
  })
  it('finds the existing symptom on a given clipboard (for the F6 prefill)', () => {
    takeRefs(['t:2'], parsed('+2c'))
    expect(existingSymptom(['t:2'], 1)?.symptom).toMatchObject({ weight: 2, causal: true })
    expect(existingSymptom(['t:2'], null)?.n).toBe(1)
    expect(existingSymptom(['t:2'], 2)).toBeNull()
    expect(existingSymptom(['t:3'], 1)).toBeNull()
    expect(clipboardTitle(1, 'Clipboard 1')).toBe('Clipboard 1')
    expect(clipboardTitle(2, 'Particulars')).toBe('Clipboard 2 (Particulars)')
  })
  it('labels the undo step with the full rubric path', () => {
    expect(takeUndoLabel(['t:2'])).toBe('Take Mind - fear, alone')
    expect(takeUndoLabel(['t:0'])).toBe('Take Mind')
    expect(takeUndoLabel(['t:2', 't:3'])).toBe('Take 2 rubrics')
    takeRefs(['t:3'], { ...DEFAULT_TAKE })
    expect(useApp.getState().past.at(-1)?.label).toBe('Take Mind - fear, night')
  })
})

describe('opening repertories and the remedy highlight', () => {
  it('reuses a tab of the same repertory unless a new tab is asked for', async () => {
    await openRepertory('t', 3)
    await openRepertory('t', 4)
    let tabs = useApp.getState().tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0].kind === 'repertory' && tabs[0].rubric).toBe(4)
    await openRepertory('t', 2, { reuse: false })
    tabs = useApp.getState().tabs
    expect(tabs).toHaveLength(2)
    expect(useApp.getState().activeTabId).toBe(tabs[1].id)
  })
  it('lists the remedies of a rubric with grade and highlights one in its book', () => {
    actions.openTab({ kind: 'repertory', repertory: 't', rubric: 1, back: [], forward: [] }, { reuse: false })
    const items = remedyMenuItems('t:1')
    expect(items.map(x => ('label' in x ? x.label : ''))).toEqual(['Acon.  Aconitum napellus (grade 3)', 'ars.  Arsenicum album (grade 1)'])
    const tab = useApp.getState().tabs[0]
    highlightRemedy('t:1', 2)
    expect(getHighlight(tab.id)).toBe(2)
    const again = remedyMenuItems('t:1')[1]
    expect('checked' in again && again.checked).toBe(true)
    highlightRemedy('t:1', null)
    expect(getHighlight(tab.id)).toBeNull()
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
