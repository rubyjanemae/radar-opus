import { describe, expect, it } from 'vitest'
import { ackPush, emptyMeta, enqueue, keyOf, mergeRemote, outboxRows, parseKey, pullSince, retryDelay, unsyncedLocalKeys } from './syncCore'
import type { RemoteRow, Rec, SyncMeta } from './syncCore'

const rec = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ id, updatedAt, ...extra })
const row = (kind: RemoteRow['kind'], id: string, updated_at: string, data: unknown, deleted = false): RemoteRow => ({ kind, id, data, deleted, updated_at })
const ok = (_k: string, data: unknown) => (data && typeof data === 'object' && 'id' in data ? (data as Rec) : null)
const T = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()

describe('keys', () => {
  it('maps kinds to persist prefixes and back', () => {
    expect(keyOf('patient', 'a')).toBe('p:a')
    expect(keyOf('consultation', 'b')).toBe('c:b')
    expect(parseKey('c:b')).toEqual({ kind: 'consultation', id: 'b' })
    expect(parseKey('workspace')).toBeNull()
  })
})

describe('outbox queue', () => {
  it('enqueues record keys only, keeping the latest change time', () => {
    let m = enqueue(emptyMeta('u'), ['p:1', 'workspace', 'c:2'], 100)
    m = enqueue(m, ['p:1'], 50)
    expect(m.queue).toEqual({ 'p:1': 100, 'c:2': 100 })
    m = enqueue(m, ['p:1'], 200)
    expect(m.queue['p:1']).toBe(200)
  })

  it('builds upserts for existing records and tombstones for deleted ones', () => {
    const m = enqueue(emptyMeta('u'), ['p:1', 'c:9'], 1)
    const { keys, rows } = outboxRows(m, k => (k === 'p:1' ? { id: '1' } : undefined))
    expect(keys).toEqual(['p:1', 'c:9'])
    expect(rows).toEqual([
      { kind: 'patient', id: '1', data: { id: '1' }, deleted: false },
      { kind: 'consultation', id: '9', data: {}, deleted: true },
    ])
  })

  it('batches the outbox', () => {
    const m = enqueue(emptyMeta('u'), Array.from({ length: 5 }, (_, i) => `p:${i}`), 1)
    expect(outboxRows(m, () => ({}), 2).keys).toHaveLength(2)
  })

  it('acks pushed keys and keeps keys changed again during the push', () => {
    let m = enqueue(emptyMeta('u'), ['p:1', 'p:2'], 10)
    const sent = { ...m.queue }
    m = enqueue(m, ['p:2'], 20) // edited while in flight
    m = ackPush(m, sent, [{ kind: 'patient', id: '1', updated_at: T(1) }, { kind: 'patient', id: '2', updated_at: T(1) }])
    expect(m.queue).toEqual({ 'p:2': 20 })
    expect(m.seen).toEqual({ 'p:1': T(1), 'p:2': T(1) })
  })

  it('backs off retries up to a minute', () => {
    expect([1, 2, 3, 10].map(retryDelay)).toEqual([2000, 4000, 8000, 60000])
  })
})

describe('mergeRemote (last write wins)', () => {
  const local = () => ({ patients: { a: rec('a', 100, { name: 'local' }) } as Record<string, Rec>, consultations: {} as Record<string, Rec> })

  it('takes server versions of records without local changes and adds new ones', () => {
    const r = mergeRemote(local(), [row('patient', 'a', T(5), rec('a', 50, { name: 'server' })), row('consultation', 'c', T(6), rec('c', 60))], emptyMeta('u'), ok)
    expect((r.patients.a as Rec & { name: string }).name).toBe('server')
    expect(r.consultations.c).toBeDefined()
    expect(r.applied).toEqual(['p:a', 'c:c'])
    expect(r.meta.lastPull).toBe(T(6))
    expect(r.meta.seen['p:a']).toBe(T(5))
  })

  it('keeps a newer unsynced local edit and leaves it queued', () => {
    const meta = enqueue(emptyMeta('u'), ['p:a'], 100)
    const r = mergeRemote(local(), [row('patient', 'a', T(5), rec('a', 90, { name: 'server' }))], meta, ok)
    expect((r.patients.a as Rec & { name: string }).name).toBe('local')
    expect(r.keptLocal).toEqual(['p:a'])
    expect(r.meta.queue['p:a']).toBe(100)
  })

  it('lets a newer server edit win over an older unsynced local edit and drops it from the queue', () => {
    const meta = enqueue(emptyMeta('u'), ['p:a'], 100)
    const r = mergeRemote(local(), [row('patient', 'a', T(5), rec('a', 150, { name: 'server' }))], meta, ok)
    expect((r.patients.a as Rec & { name: string }).name).toBe('server')
    expect(r.meta.queue).toEqual({})
  })

  it('applies tombstones, unless the record was edited locally after the delete', () => {
    const del = row('patient', 'a', new Date(200).toISOString(), {}, true)
    expect(mergeRemote(local(), [del], emptyMeta('u'), ok).patients).toEqual({})
    const edited = { patients: { a: rec('a', 300) }, consultations: {} }
    const r = mergeRemote(edited, [del], enqueue(emptyMeta('u'), ['p:a'], 300), ok)
    expect(r.patients.a).toBeDefined()
    expect(r.keptLocal).toEqual(['p:a'])
  })

  it('a local delete newer than the server edit stays deleted', () => {
    const meta = enqueue(emptyMeta('u'), ['p:z'], 500)
    const r = mergeRemote({ patients: {}, consultations: {} }, [row('patient', 'z', T(1), rec('z', 400))], meta, ok)
    expect(r.patients).toEqual({})
    expect(r.meta.queue['p:z']).toBe(500)
  })

  it('skips rows already held (own pushes echo back) and invalid rows', () => {
    const meta: SyncMeta = { ...emptyMeta('u'), seen: { 'p:a': T(5) } }
    const l = local()
    const r = mergeRemote(l, [row('patient', 'a', T(5), rec('a', 999)), row('patient', 'bad', T(6), 'junk')], meta, ok)
    expect(r.patients).toBe(l.patients)
    expect(r.applied).toEqual([])
    expect(r.meta.seen.bad).toBeUndefined()
    expect(r.meta.lastPull).toBe(T(6))
  })
})

describe('first sign-in migration and pulls', () => {
  it('lists local records the server has not seen', () => {
    const meta: SyncMeta = { ...emptyMeta('u'), seen: { 'p:a': T(1) } }
    expect(unsyncedLocalKeys({ patients: { a: rec('a', 1), b: rec('b', 1) }, consultations: { c: rec('c', 1) } }, meta)).toEqual(['p:b', 'c:c'])
  })
  it('re-reads an overlap window on incremental pulls', () => {
    expect(pullSince(emptyMeta('u'))).toBeNull()
    expect(pullSince({ ...emptyMeta('u'), lastPull: '2026-01-01T00:10:00.000Z' })).toBe('2026-01-01T00:05:00.000Z')
  })
})
