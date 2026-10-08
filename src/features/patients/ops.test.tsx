import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { actions, useApp } from '../../state/store'
import { flushNow } from '../../state/persist'
import * as ops from './ops'
import { flushAllDrafts, useDraft } from './useDraft'

vi.mock('../../state/persist', async orig => ({ ...(await orig<typeof import('../../state/persist')>()), flushNow: vi.fn(() => Promise.resolve()) }))

const st = () => useApp.getState()

beforeEach(() => {
  useApp.setState({
    patients: {}, consultations: {}, tabs: [], activeTabId: null, activeConsultationId: null, activeClipboardId: null,
    selectedSymptomIds: [], past: [], future: [], toasts: [],
  })
})

describe('patients ops', () => {
  it('creating a patient with a first consultation is one undo step', () => {
    const id = ops.createPatient({ firstName: 'Ada', lastName: 'Test' }, true)
    expect(st().patients[id]).toBeDefined()
    const cid = st().activeConsultationId!
    expect(st().consultations[cid].patientId).toBe(id)
    expect(st().past).toHaveLength(1)
    expect(st().past[0].label).toBe('New patient')
    actions.undo()
    expect(st().patients[id]).toBeUndefined()
    expect(st().consultations[cid]).toBeUndefined()
  })

  it('deleting the active consultation leaves no active case; undo restores it', () => {
    const pid = actions.createPatient({ firstName: 'Ada', lastName: 'Test' })
    const older = actions.createConsultation(pid, { date: '2025-01-01' })
    const cid = actions.createConsultation(pid, { date: '2026-01-01' })
    expect(st().activeConsultationId).toBe(cid)
    const depth = st().past.length
    ops.deleteConsultation(cid)
    expect(st().consultations[cid]).toBeUndefined()
    expect(st().consultations[older]).toBeDefined()
    expect(st().activeConsultationId).toBeNull()
    expect(st().past).toHaveLength(depth + 1)
    expect(st().toasts.at(-1)?.text).toContain('no case is active')
    actions.undo()
    expect(st().consultations[cid]).toBeDefined()
    expect(st().activeConsultationId).toBe(cid)
  })

  it('deleting another consultation keeps the active case', () => {
    const pid = actions.createPatient({ firstName: 'Ada', lastName: 'Test' })
    const older = actions.createConsultation(pid, { date: '2025-01-01' })
    const cid = actions.createConsultation(pid, { date: '2026-01-01' })
    ops.deleteConsultation(older)
    expect(st().activeConsultationId).toBe(cid)
  })

  it('the delete confirmation names the active case and its open analysis tab', () => {
    const pid = actions.createPatient({ firstName: 'Ada', lastName: 'Test' })
    const cid = actions.createConsultation(pid, { date: '2026-01-01' })
    actions.openTab({ kind: 'analysis', consultationId: cid })
    const open = vi.spyOn(actions, 'openDialog').mockImplementation(() => {})
    ops.confirmDeleteConsultation(cid)
    const msg = (open.mock.calls[0][1] as { message: string }).message
    expect(msg).toContain('It is the active case')
    expect(msg).toContain('analysis tab will close')
    open.mockRestore()
  })
})

describe('useDraft', () => {
  function Field({ onCommit }: { onCommit: (v: string) => void }) {
    const { draft, setDraft } = useDraft<string>('', onCommit)
    return <input aria-label="f" value={draft} onChange={e => setDraft(e.target.value)} />
  }

  it('commits a pending draft at once when the page is hidden or unloaded, then asks autosave to write', () => {
    vi.mocked(flushNow).mockClear()
    const commits: string[] = []
    const { getByLabelText, unmount } = render(<Field onCommit={v => commits.push(v)} />)
    const input = getByLabelText('f') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'typed' } })
    expect(input.value).toBe('typed')
    expect(commits).toEqual([])
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(commits).toEqual(['typed'])
    expect(flushNow).toHaveBeenCalledTimes(1)
    // nothing pending: no second commit
    act(() => { window.dispatchEvent(new Event('beforeunload')) })
    expect(commits).toEqual(['typed'])
    expect(flushAllDrafts()).toBe(0)
    unmount()
  })
})
