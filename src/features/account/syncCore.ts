/*
 * Pure sync logic (no Supabase, no store): the outbox queue and the last-write-wins merge of pulled rows.
 *
 * Local records are keyed as in persist.ts: `p:<id>` patients, `c:<id>` consultations. Server rows are
 * public.case_records (kind 'patient' | 'consultation', id, data, deleted, updated_at set by the server).
 */

export type Kind = 'patient' | 'consultation'
export interface RemoteRow { kind: Kind; id: string; data: unknown; deleted: boolean; updated_at: string }
export interface Rec { id: string; updatedAt: number }

export interface SyncMeta {
  /** The account this device's records belong to. */
  userId: string
  /** Highest server updated_at pulled so far (ISO), null before the first full pull. */
  lastPull: string | null
  /** Per record key: the server updated_at of the version this device holds. */
  seen: Record<string, string>
  /** Outbox: record key → local change time (ms) of a change not yet on the server. */
  queue: Record<string, number>
  /** The one-time upload of records made before the first sign-in has run. */
  migrated: boolean
}

export const emptyMeta = (userId: string): SyncMeta => ({ userId, lastPull: null, seen: {}, queue: {}, migrated: false })

export const keyOf = (kind: Kind, id: string) => (kind === 'patient' ? 'p:' : 'c:') + id
export function parseKey(key: string): { kind: Kind; id: string } | null {
  if (key.startsWith('p:')) return { kind: 'patient', id: key.slice(2) }
  if (key.startsWith('c:')) return { kind: 'consultation', id: key.slice(2) }
  return null
}

const ms = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0 }

/** Add changed or deleted record keys to the outbox (keeps the latest change time). */
export function enqueue(meta: SyncMeta, keys: Iterable<string>, now: number): SyncMeta {
  const queue = { ...meta.queue }
  for (const k of keys) if (parseKey(k)) queue[k] = Math.max(queue[k] ?? 0, now)
  return { ...meta, queue }
}

export interface OutRow { kind: Kind; id: string; data: unknown; deleted: boolean }

/** Rows to upsert for queued keys: the current record, or a tombstone when it no longer exists locally. */
export function outboxRows(meta: SyncMeta, lookup: (key: string) => unknown, limit = 200): { keys: string[]; rows: OutRow[] } {
  const keys = Object.keys(meta.queue).slice(0, limit)
  const rows = keys.map(k => {
    const { kind, id } = parseKey(k)!
    const rec = lookup(k)
    return rec === undefined ? { kind, id, data: {}, deleted: true } : { kind, id, data: rec, deleted: false }
  })
  return { keys, rows }
}

/**
 * After a successful push: record the server timestamps and drop each key from the outbox unless it
 * changed again while the push was in flight (its queued time moved past `sentAt`).
 */
export function ackPush(meta: SyncMeta, sent: Record<string, number>, result: { kind: Kind; id: string; updated_at: string }[]): SyncMeta {
  const queue = { ...meta.queue }
  const seen = { ...meta.seen }
  for (const r of result) {
    const k = keyOf(r.kind, r.id)
    seen[k] = r.updated_at
    if (k in sent && queue[k] === sent[k]) delete queue[k]
  }
  return { ...meta, queue, seen }
}

export interface MergeInput<P extends Rec, C extends Rec> {
  patients: Record<string, P>
  consultations: Record<string, C>
}
export interface MergeResult<P extends Rec, C extends Rec> extends MergeInput<P, C> {
  meta: SyncMeta
  /** Record keys whose local value was replaced or removed by a server row. */
  applied: string[]
  /** Server rows that lost to a newer local change (stay queued and are pushed). */
  keptLocal: string[]
}

/**
 * Merge pulled rows into local records, last write wins:
 * - a row whose updated_at this device already holds (seen) is skipped;
 * - a record with no unsynced local change takes the server version (or is removed for a tombstone);
 * - a record changed locally and not yet pushed keeps the local version when its change is newer than
 *   the server's (record updatedAt, or the tombstone's updated_at), otherwise the server wins and the
 *   local change leaves the outbox.
 * `validate` turns row data into a record (null when unusable: the row is ignored).
 */
export function mergeRemote<P extends Rec, C extends Rec>(
  local: MergeInput<P, C>,
  rows: RemoteRow[],
  meta: SyncMeta,
  validate: (kind: Kind, data: unknown, id: string) => P | C | null,
): MergeResult<P, C> {
  let patients = local.patients
  let consultations = local.consultations
  const seen = { ...meta.seen }
  const queue = { ...meta.queue }
  const applied: string[] = []
  const keptLocal: string[] = []
  let lastPull = meta.lastPull
  for (const row of rows) {
    if (row.kind !== 'patient' && row.kind !== 'consultation') continue
    if (!lastPull || ms(row.updated_at) > ms(lastPull)) lastPull = row.updated_at
    const k = keyOf(row.kind, row.id)
    if (seen[k] && ms(row.updated_at) <= ms(seen[k])) continue
    const coll = (row.kind === 'patient' ? patients : consultations) as Record<string, Rec>
    const mine = coll[row.id]
    let rec: P | C | null = null
    if (!row.deleted) {
      rec = validate(row.kind, row.data, row.id)
      if (!rec) continue
    }
    seen[k] = row.updated_at
    if (k in queue) {
      const localTime = mine ? mine.updatedAt : queue[k]
      const remoteTime = rec ? rec.updatedAt : ms(row.updated_at)
      if (localTime > remoteTime) { keptLocal.push(k); continue }
      delete queue[k]
    }
    if (row.deleted) {
      if (!mine) continue
      const next = { ...coll }
      delete next[row.id]
      if (row.kind === 'patient') patients = next as Record<string, P>
      else consultations = next as Record<string, C>
    } else {
      const next = { ...coll, [row.id]: rec! }
      if (row.kind === 'patient') patients = next as Record<string, P>
      else consultations = next as Record<string, C>
    }
    applied.push(k)
  }
  return { patients, consultations, applied, keptLocal, meta: { ...meta, seen, queue, lastPull } }
}

/** Keys of local records the server has never seen (for the one-time upload on first sign-in). */
export function unsyncedLocalKeys(local: MergeInput<Rec, Rec>, meta: SyncMeta): string[] {
  const out: string[] = []
  for (const id in local.patients) if (!meta.seen[keyOf('patient', id)]) out.push(keyOf('patient', id))
  for (const id in local.consultations) if (!meta.seen[keyOf('consultation', id)]) out.push(keyOf('consultation', id))
  return out
}

/** Overlap re-read on incremental pulls: a transaction that started before the last pull may commit after it. */
export const PULL_OVERLAP_MS = 5 * 60_000
export function pullSince(meta: SyncMeta): string | null {
  return meta.lastPull ? new Date(ms(meta.lastPull) - PULL_OVERLAP_MS).toISOString() : null
}

/** Retry delay after failed pushes: 2 s, doubling, capped at 60 s. */
export const retryDelay = (failures: number) => Math.min(60_000, 2000 * 2 ** Math.max(0, failures - 1))
