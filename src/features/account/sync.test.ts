import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { flushNow, hydrate, setPersistBackend, startAutosave } from '../../state/persist'
import type { PersistBackend } from '../../state/persist'
import { useApp } from '../../state/store'
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS } from '../../state/workspace'
import { accountStatus } from './status'

/** Fake case_records table behind a minimal PostgREST-like builder. */
const server = vi.hoisted(() => ({
  rows: new Map<string, { kind: string; id: string; data: unknown; deleted: boolean; updated_at: string }>(),
  clock: 1000,
  failPush: false,
  upserts: [] as { kind: string; id: string; deleted: boolean }[][],
}))
vi.mock('./client', () => {
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + server.clock++ * 1000).toISOString()
  return {
    supabase: () => ({
      from: () => ({
        upsert: (rows: { kind: string; id: string; data: unknown; deleted: boolean }[]) => ({
          select: async () => {
            if (server.failPush) return { data: null, error: new Error('Failed to fetch') }
            server.upserts.push(rows.map(r => ({ kind: r.kind, id: r.id, deleted: r.deleted })))
            const out = rows.map(r => { const v = { kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, updated_at: stamp() }; server.rows.set(r.kind + r.id, v); return v })
            return { data: out.map(({ kind, id, updated_at }) => ({ kind, id, updated_at })), error: null }
          },
        }),
        select: () => {
          let since: string | null = null
          const q = {
            gt: (_c: string, v: string) => { since = v; return q },
            order: () => q,
            range: async (from: number, to: number) => {
              const all = [...server.rows.values()].filter(r => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at))
              return { data: all.slice(from, to + 1), error: null }
            },
          }
          return q
        },
      }),
      auth: { signOut: async () => ({}) },
    }),
  }
})

const patient = (id: string, updatedAt = 1, lastName = id) => ({ id, firstName: 'A', lastName, birthDate: null, sex: null, email: '', phone: '', address: '', occupation: '', notes: '', tags: [], createdAt: 1, updatedAt })

function memoryBackend(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  const b: PersistBackend = {
    get: async k => data.get(k),
    getPrefix: async p => [...data].filter(([k]) => k.startsWith(p)),
    write: async (puts, dels) => { for (const [k, v] of puts) data.set(k, v); for (const k of dels) data.delete(k) },
    entries: async () => [...data],
    clear: async () => { data.clear() },
  }
  return { b, data }
}

const user = { id: 'user-1', email: 'doc@example.com' } as User
let dispose: (() => void) | null = null

beforeEach(() => {
  server.rows.clear(); server.upserts.length = 0; server.failPush = false
  useApp.setState({
    hydrated: false, patients: {}, consultations: {}, tabs: [], activeTabId: null, layout: DEFAULT_LAYOUT, settings: DEFAULT_SETTINGS,
    bookmarks: [], rubricNotes: {}, remedyNotes: {}, recentSearches: [], activeConsultationId: null, activeClipboardId: null, past: [], future: [], toasts: [], dialog: null,
  })
})
afterEach(async () => { (await import('./sync')).stopSync(); dispose?.(); dispose = null; setPersistBackend(null) })

async function boot(local: Record<string, unknown>) {
  const mem = memoryBackend({ workspace: { version: 2 }, ...local })
  setPersistBackend(mem.b)
  await hydrate()
  dispose = startAutosave()
  const sync = await import('./sync')
  await sync.startSync(user)
  return { mem, sync }
}

describe('cloud sync engine (mocked Supabase)', () => {
  it('migrates local patients on first sign-in and pulls server patients', async () => {
    server.rows.set('patientsrv', { kind: 'patient', id: 'srv', data: patient('srv'), deleted: false, updated_at: '2026-01-01T00:00:00.000Z' })
    const { mem, sync } = await boot({ 'p:loc': patient('loc') })
    expect(useApp.getState().patients.srv?.lastName).toBe('srv')
    await sync.pushNow()
    expect(server.upserts.flat()).toEqual([{ kind: 'patient', id: 'loc', deleted: false }])
    expect(useApp.getState().toasts.some(t => /Uploading 1 patient/.test(t.text))).toBe(true)
    expect(accountStatus.get().sync).toBe('synced')
    // the pulled record reaches IndexedDB but is not pushed back
    await flushNow()
    expect(mem.data.has('p:srv')).toBe(true)
    await sync.pushNow()
    expect(server.upserts.flat().map(r => r.id)).toEqual(['loc'])
  })

  it('pushes edits and deletes (as tombstones) after the local flush', async () => {
    const { sync } = await boot({ 'p:a': patient('a'), 'p:b': patient('b') })
    await sync.pushNow()
    server.upserts.length = 0
    const { b: _drop, ...rest } = useApp.getState().patients
    useApp.setState({ patients: { ...rest, a: patient('a', 5, 'edited') } })
    await flushNow()
    await sync.pushNow()
    expect(server.upserts.flat().sort((x, y) => x.id.localeCompare(y.id))).toEqual([{ kind: 'patient', id: 'a', deleted: false }, { kind: 'patient', id: 'b', deleted: true }])
    expect(sync.unsyncedCount()).toBe(0)
  })

  it('queues failed pushes, shows offline, and retries', async () => {
    const { mem, sync } = await boot({})
    server.failPush = true
    useApp.setState({ patients: { n: patient('n', 9) } })
    await flushNow()
    await sync.pushNow()
    expect(sync.unsyncedCount()).toBe(1)
    expect(accountStatus.get().sync).toBe('offline')
    expect((mem.data.get('sync:meta') as { queue: Record<string, number> }).queue).toHaveProperty('p:n')
    server.failPush = false
    await sync.pushNow()
    expect(sync.unsyncedCount()).toBe(0)
    expect(accountStatus.get().sync).toBe('synced')
  })

  it('incremental pulls apply remote edits and tombstones', async () => {
    const { sync } = await boot({ 'p:a': patient('a') })
    await sync.pushNow()
    server.rows.set('patienta', { kind: 'patient', id: 'a', data: patient('a', 50, 'remote'), deleted: false, updated_at: '2026-06-01T00:00:00.000Z' })
    await sync.pullNow()
    expect(useApp.getState().patients.a.lastName).toBe('remote')
    server.rows.set('patienta', { kind: 'patient', id: 'a', data: {}, deleted: true, updated_at: '2026-06-02T00:00:00.000Z' })
    await sync.pullNow()
    expect(useApp.getState().patients.a).toBeUndefined()
  })
})
