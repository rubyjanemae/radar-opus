import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKUP_KEY, LEGACY_KEY, RestoreError, SCHEMA_VERSION, WS_KEY, exportWorkspace, flushNow, hydrate, importWorkspace, parseWorkspaceFile,
  sanitizePersisted, saveStatus, setPersistBackend, startAutosave,
} from './persist'
import type { PersistBackend } from './persist'
import { actions, useApp } from './store'
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS } from './workspace'

/** In-memory backend recording every write. */
function memoryBackend(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  const writes: { puts: string[]; dels: string[] }[] = []
  const b: PersistBackend = {
    get: async k => data.get(k),
    getPrefix: async p => [...data].filter(([k]) => k.startsWith(p)),
    write: async (puts, dels) => { writes.push({ puts: puts.map(([k]) => k), dels }); for (const [k, v] of puts) data.set(k, v); for (const k of dels) data.delete(k) },
    entries: async () => [...data],
    clear: async () => { data.clear() },
  }
  return { b, data, writes }
}

const patient = (id: string, extra: Record<string, unknown> = {}) => ({ id, firstName: 'A', lastName: id, birthDate: null, sex: null, email: '', phone: '', address: '', occupation: '', notes: '', tags: [], createdAt: 1, updatedAt: 1, ...extra })
const consultation = (id: string, patientId: string, extra: Record<string, unknown> = {}) => ({
  id, patientId, date: '2026-01-01', title: 'C', kind: 'first', complaint: '', notes: '', assessment: '',
  clipboards: [{ id: `${id}-cb`, name: 'Clipboard 1', color: '#2f6fdb', symptoms: [{ id: 's1', rubrics: ['r:1'], combine: 'union', weight: 1, eliminatory: false, exclusive: false, group: null, causal: false, addedAt: 1 }] }],
  analysis: { strategy: 'kent', clipboardIds: [`${id}-cb`], remedyFilter: null, excludedRemedies: [], minCoverage: 0, limit: 30 },
  prescriptions: [], createdAt: 1, updatedAt: 1, ...extra,
})
const legacy = (extra: Record<string, unknown> = {}) => ({
  patients: { p1: patient('p1') }, consultations: { c1: consultation('c1', 'p1') },
  tabs: [{ id: 't1', kind: 'patient', patientId: 'p1' }, { id: 't2', kind: 'analysis', consultationId: 'c1' }], activeTabId: 't2',
  layout: { treeWidth: 300 }, settings: { theme: 'dark' }, bookmarks: [], rubricNotes: {}, remedyNotes: {}, recentSearches: [],
  activeConsultationId: 'c1', activeClipboardId: 'c1-cb', ...extra,
})

let dispose: (() => void) | null = null
beforeEach(() => {
  useApp.setState({
    hydrated: false, patients: {}, consultations: {}, tabs: [], activeTabId: null, layout: DEFAULT_LAYOUT, settings: DEFAULT_SETTINGS,
    bookmarks: [], rubricNotes: {}, remedyNotes: {}, recentSearches: [], activeConsultationId: null, activeClipboardId: null, past: [], future: [], toasts: [], dialog: null,
  })
})
afterEach(() => { dispose?.(); dispose = null; setPersistBackend(null) })

describe('sanitizePersisted', () => {
  it('merges partial layout and settings onto defaults and adds the schema version', () => {
    const { state } = sanitizePersisted({ layout: { treeWidth: 310, showTree: 'yes' }, settings: { theme: 'dark', density: 'huge' } })
    expect(state.layout).toEqual({ ...DEFAULT_LAYOUT, treeWidth: 310 })
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it.each([
    ['tabs: null', { tabs: null }],
    ['tabs: {}', { tabs: {} }],
  ])('repairs %s to an empty tab list', (_, extra) => {
    const { state, repairs } = sanitizePersisted(legacy(extra))
    expect(state.tabs).toEqual([])
    expect(state.activeTabId).toBeNull()
    expect(repairs.length).toBeGreaterThan(0)
  })

  it('drops tabs of unknown kind or pointing at missing records', () => {
    const { state } = sanitizePersisted(legacy({
      tabs: [{ id: 'a', kind: 'weird' }, { id: 'b', kind: 'patient', patientId: 'nobody' }, { id: 'c', kind: 'analysis', consultationId: 'gone' }, { id: 'd', kind: 'patients' }, 'junk'],
      activeTabId: 'a',
    }))
    expect(state.tabs.map(t => t.id)).toEqual(['d'])
    expect(state.activeTabId).toBe('d')
  })

  it('repairs a consultation without clipboards or analysis fields', () => {
    const c = consultation('c1', 'p1') as Record<string, unknown>
    delete c.clipboards
    c.analysis = { strategy: 'kent' }
    const { state } = sanitizePersisted(legacy({ consultations: { c1: c } }))
    const out = state.consultations.c1
    expect(out.clipboards).toHaveLength(1)
    expect(out.clipboards[0].symptoms).toEqual([])
    expect(out.analysis).toMatchObject({ strategy: 'kent', excludedRemedies: [], remedyFilter: null, minCoverage: 0, limit: 30, clipboardIds: [out.clipboards[0].id] })
    expect(state.activeClipboardId).toBe(out.clipboards[0].id)
  })

  it('drops bad records: non-objects, orphan consultations, symptoms without rubrics', () => {
    const c = consultation('c1', 'p1')
    c.clipboards[0].symptoms.push({ id: 's2', rubrics: [] } as never)
    const { state } = sanitizePersisted(legacy({ patients: { p1: patient('p1'), bad: 42 }, consultations: { c1: c, c2: consultation('c2', 'ghost'), c3: null } }))
    expect(Object.keys(state.patients)).toEqual(['p1'])
    expect(Object.keys(state.consultations)).toEqual(['c1'])
    expect(state.consultations.c1.clipboards[0].symptoms.map(s => s.id)).toEqual(['s1'])
  })

  it('rejects data it cannot use', () => {
    expect(() => sanitizePersisted('garbage')).toThrow(RestoreError)
    expect(() => sanitizePersisted(null)).toThrow(RestoreError)
    expect(() => sanitizePersisted({ patients: [1, 2] })).toThrow(RestoreError)
    expect(() => sanitizePersisted({ version: SCHEMA_VERSION + 1 })).toThrow(/newer version/)
  })
})

describe('hydrate', () => {
  it('returns false on a first run', async () => {
    setPersistBackend(memoryBackend().b)
    expect(await hydrate()).toBe(false)
    expect(useApp.getState().hydrated).toBe(true)
  })

  it('migrates the legacy state-v1 blob to split keys', async () => {
    const m = memoryBackend({ [LEGACY_KEY]: legacy() })
    setPersistBackend(m.b)
    expect(await hydrate()).toBe(true)
    expect(m.data.has(LEGACY_KEY)).toBe(false)
    expect([...m.data.keys()].sort()).toEqual(['c:c1', 'p:p1', WS_KEY])
    expect(m.data.get(WS_KEY)).toMatchObject({ version: SCHEMA_VERSION, activeTabId: 't2' })
    expect((m.data.get(WS_KEY) as Record<string, unknown>).patients).toBeUndefined()
    const s = useApp.getState()
    expect(s.settings.theme).toBe('dark')
    expect(s.layout).toEqual({ ...DEFAULT_LAYOUT, treeWidth: 300 })
    expect(s.activeConsultationId).toBe('c1')
  })

  it.each([
    ['tabs: null', { tabs: null }],
    ['tabs: {}', { tabs: {} }],
    ['tab kind weird', { tabs: [{ id: 'x', kind: 'weird' }] }],
  ])('restores with %s', async (_, extra) => {
    setPersistBackend(memoryBackend({ [LEGACY_KEY]: legacy(extra) }).b)
    expect(await hydrate()).toBe(true)
    expect(useApp.getState().tabs).toEqual([])
    expect(useApp.getState().patients.p1).toBeDefined()
  })

  it('throws RestoreError for an unusable workspace key', async () => {
    setPersistBackend(memoryBackend({ [WS_KEY]: 'garbage' }).b)
    await expect(hydrate()).rejects.toThrow(RestoreError)
  })
})

describe('autosave writes only what changed', () => {
  async function boot() {
    const m = memoryBackend({ [WS_KEY]: { version: SCHEMA_VERSION, ...legacy(), patients: undefined, consultations: undefined }, 'p:p1': patient('p1'), 'p:p2': patient('p2'), 'c:c1': consultation('c1', 'p1') })
    setPersistBackend(m.b)
    await hydrate()
    dispose = startAutosave()
    m.writes.length = 0
    return m
  }

  it('navigation writes the workspace key only', async () => {
    const m = await boot()
    actions.openTab({ kind: 'repertory', repertory: 'r', rubric: 0, back: [], forward: [] })
    const tab = useApp.getState().activeTabId!
    actions.navigateRubric(tab, 5)
    expect(saveStatus.get()).toBe('pending')
    await flushNow()
    expect(m.writes).toEqual([{ puts: [WS_KEY], dels: [] }])
    expect(saveStatus.get()).toBe('saved')
  })

  it('a case edit writes that consultation only; a deletion deletes its records', async () => {
    const m = await boot()
    actions.addRubrics(['r:2'])
    await flushNow()
    expect(m.writes).toEqual([{ puts: ['c:c1'], dels: [] }])
    m.writes.length = 0
    actions.deletePatient('p1')
    await flushNow()
    expect(m.writes[0].dels.sort()).toEqual(['c:c1', 'p:p1'])
    expect(m.writes[0].puts).toEqual([WS_KEY]) // tabs and active ids changed too
    expect(m.data.has('p:p2')).toBe(true)
  })

  it('debounces, then flushes in an idle callback; the disposer removes listeners and the subscription', async () => {
    vi.useFakeTimers()
    try {
      const m = await boot()
      actions.setSettings({ fontScale: 1.1 })
      vi.advanceTimersByTime(300)
      expect(m.writes).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1500)
      expect(m.writes).toEqual([{ puts: [WS_KEY], dels: [] }])
      dispose!(); dispose = null
      actions.setSettings({ fontScale: 1.2 })
      await vi.advanceTimersByTimeAsync(3000)
      window.dispatchEvent(new Event('pagehide'))
      expect(m.writes).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })

  it('flushes on pagehide', async () => {
    const m = await boot()
    actions.setSettings({ fontScale: 1.3 })
    window.dispatchEvent(new Event('pagehide'))
    await Promise.resolve(); await Promise.resolve()
    expect(m.writes).toEqual([{ puts: [WS_KEY], dels: [] }])
  })
})

describe('import', () => {
  const file = (state: unknown) => JSON.stringify({ format: 'radar-opus-workspace', version: 1, state })

  it('rejects invalid files without applying or asking', async () => {
    setPersistBackend(memoryBackend().b)
    useApp.setState({ patients: { keep: patient('keep') as never } })
    const confirm = vi.fn(async () => true)
    await expect(importWorkspace('not json', confirm)).rejects.toThrow(/not valid JSON/)
    await expect(importWorkspace(JSON.stringify({ hello: 1 }), confirm)).rejects.toThrow(/Not a Radar Opus workspace/)
    await expect(importWorkspace(file({ patients: 'x' }), confirm)).rejects.toThrow(/cannot be restored/)
    expect(confirm).not.toHaveBeenCalled()
    expect(useApp.getState().patients.keep).toBeDefined()
  })

  it('does nothing when the confirmation is declined', async () => {
    const m = memoryBackend()
    setPersistBackend(m.b)
    useApp.setState({ patients: { keep: patient('keep') as never } })
    expect(await importWorkspace(file(legacy()), async () => false)).toBe(false)
    expect(useApp.getState().patients.keep).toBeDefined()
    expect(m.data.size).toBe(0)
  })

  it('backs up the current workspace, applies the sanitized file with settings merged onto defaults, and can be undone', async () => {
    const m = memoryBackend()
    setPersistBackend(m.b)
    useApp.setState({ patients: { keep: patient('keep') as never } })
    const summary = vi.fn()
    expect(await importWorkspace(file(legacy({ settings: { density: 'comfortable' }, tabs: [{ kind: 'weird' }] })), async s => { summary(s); return true })).toBe(true)
    expect(summary.mock.calls[0][0]).toMatchObject({ patients: 1, consultations: 1 })
    const s = useApp.getState()
    expect(s.patients.keep).toBeUndefined()
    expect(s.patients.p1).toBeDefined()
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, density: 'comfortable' })
    expect(s.tabs).toEqual([])
    expect((m.data.get(BACKUP_KEY) as { state: { patients: Record<string, unknown> } }).state.patients.keep).toBeDefined()
    s.toasts.at(-1)!.action!.run()
    expect(useApp.getState().patients.keep).toBeDefined()
  })

  it('round-trips an export', async () => {
    setPersistBackend(memoryBackend({ [LEGACY_KEY]: legacy() }).b)
    await hydrate()
    const text = await (await exportWorkspace()).text()
    const { state, repairs } = parseWorkspaceFile(text)
    expect(repairs).toEqual([])
    expect(state.consultations.c1.clipboards[0].symptoms).toHaveLength(1)
  })
})
