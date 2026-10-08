import type { User } from '@supabase/supabase-js'
import { supabase } from './client'
import { setAccountStatus } from './status'
import { ackPush, emptyMeta, enqueue, mergeRemote, outboxRows, parseKey, pullSince, retryDelay, unsyncedLocalKeys } from './syncCore'
import type { Kind, RemoteRow, SyncMeta } from './syncCore'
import { flushNow, onRecordsWritten, persistBackend, suspendAutosave, WS_KEY, SCHEMA_VERSION, pickWorkspace } from '../../state/persist'
import { sanitizePersisted, sanitizeWorkspace } from '../../state/sanitize'
import { actions, pruneHistory, useApp } from '../../state/store'
import type { Consultation, Patient } from '../../state/patients'
import { instanceMode } from '../../state/instance'

/*
 * Cloud sync of patients and consultations with public.case_records. IndexedDB stays the local
 * cache: every successful local flush queues the written / deleted record keys (persisted outbox in
 * `sync:meta`), which are upserted to the server (deletes as deleted=true tombstones). Pulls merge
 * server rows last-write-wins (syncCore.mergeRemote): in full after sign-in, then incrementally on
 * window focus and every 60 s. Failed pushes retry with backoff and when the browser comes back online.
 */

const META_KEY = 'sync:meta'
const TABLE = 'case_records'
const PAGE = 1000
const PULL_EVERY_MS = 60_000

let user: User | null = null
let meta: SyncMeta | null = null
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pullTimer: ReturnType<typeof setInterval> | null = null
let pushing: Promise<void> | null = null
let pushAgain = false
let pulling: Promise<void> | null = null
let stopFns: (() => void)[] = []
/** Records this device just took from the server: their local flush must not be pushed back. */
const fromServer = new Map<string, unknown>()
const removedByServer = new Set<string>()

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

let metaWrite: Promise<void> = Promise.resolve()
function saveMeta() {
  const b = persistBackend()
  const m = meta
  if (!b || !m) return metaWrite
  metaWrite = metaWrite.then(() => b.write([[META_KEY, m]], [])).catch(e => console.error('Sync state not saved', e))
  return metaWrite
}

function updateStatus(busy?: 'syncing') {
  const queued = meta ? Object.keys(meta.queue).length : 0
  if (busy) { setAccountStatus({ sync: 'syncing', queued }); return }
  if (!online()) setAccountStatus({ sync: 'offline', queued, message: '' })
  else if (failures > 0) setAccountStatus({ sync: queued ? 'offline' : 'error', queued })
  else setAccountStatus({ sync: queued ? 'pending' : 'synced', queued, message: '' })
}

function lookup(key: string): unknown {
  const p = parseKey(key)!
  const s = useApp.getState()
  return p.kind === 'patient' ? s.patients[p.id] : s.consultations[p.id]
}

// ───────────────────────── push ─────────────────────────

/** Upsert the outbox, in batches, until it is empty or a request fails. */
export function pushNow(): Promise<void> {
  if (pushing) { pushAgain = true; return pushing }
  pushing = (async () => {
    do {
      pushAgain = false
      while (meta && user && Object.keys(meta.queue).length) {
        if (!online()) { updateStatus(); return }
        const { keys, rows } = outboxRows(meta, lookup)
        const sent = Object.fromEntries(keys.map(k => [k, meta!.queue[k]]))
        updateStatus('syncing')
        const { data, error } = await supabase().from(TABLE)
          .upsert(rows.map(r => ({ owner: user!.id, ...r })), { onConflict: 'owner,kind,id' })
          .select('kind,id,updated_at')
        if (error) throw error
        failures = 0
        meta = ackPush(meta!, sent, (data ?? []) as { kind: Kind; id: string; updated_at: string }[])
        await saveMeta()
      }
    } while (pushAgain)
  })().then(
    () => { updateStatus() },
    e => {
      console.warn('Sync push failed', e)
      failures++
      setAccountStatus({ message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
      updateStatus()
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(() => { retryTimer = null; void pushNow() }, retryDelay(failures))
    },
  ).finally(() => { pushing = null })
  return pushing
}

function onWritten(w: { puts: [string, unknown][]; dels: string[] }) {
  if (!meta) return
  const keys: string[] = []
  for (const [k, v] of w.puts) {
    if (fromServer.get(k) === v) { fromServer.delete(k); continue }
    keys.push(k)
  }
  for (const k of w.dels) {
    if (removedByServer.delete(k)) continue
    keys.push(k)
  }
  if (!keys.length) return
  meta = enqueue(meta, keys, Date.now())
  void saveMeta()
  updateStatus()
  void pushNow()
}

// ───────────────────────── pull ─────────────────────────

async function fetchRows(since: string | null): Promise<RemoteRow[]> {
  const out: RemoteRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase().from(TABLE).select('kind,id,data,deleted,updated_at')
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q.order('updated_at', { ascending: true }).order('kind').order('id').range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as RemoteRow[]))
    if (!data || data.length < PAGE) return out
  }
}

/** Validate server rows the way stored records are validated on load (against the local patients). */
function validator(rows: RemoteRow[]) {
  const s = useApp.getState()
  const raw = { version: SCHEMA_VERSION, patients: { ...s.patients } as Record<string, unknown>, consultations: {} as Record<string, unknown> }
  for (const r of rows) if (!r.deleted) (r.kind === 'patient' ? raw.patients : raw.consultations)[r.id] = r.data
  let clean: { patients: Record<string, Patient>; consultations: Record<string, Consultation> }
  try { clean = sanitizePersisted(raw).state } catch { clean = { patients: {}, consultations: {} } }
  return (kind: Kind, _data: unknown, id: string) => (kind === 'patient' ? clean.patients[id] : clean.consultations[id]) ?? null
}

/** Pull rows changed since the last pull (all rows the first time) and merge them into the workspace. */
export function pullNow(): Promise<void> {
  if (pulling || !meta || !user || !online()) return pulling ?? Promise.resolve()
  if (instanceMode.get() !== 'writer') return Promise.resolve()
  pulling = (async () => {
    updateStatus('syncing')
    const rows = await fetchRows(pullSince(meta!))
    if (!rows.length) { failures = 0; return }
    const s = useApp.getState()
    const res = mergeRemote<Patient, Consultation>({ patients: s.patients, consultations: s.consultations }, rows, meta!, validator(rows))
    meta = res.meta
    if (res.applied.length) applyMerged(res.patients, res.consultations, res.applied)
    await saveMeta()
    failures = 0
  })().then(
    () => { updateStatus(); if (meta && Object.keys(meta.queue).length) void pushNow() },
    e => { console.warn('Sync pull failed', e); failures++; updateStatus() },
  ).finally(() => { pulling = null })
  return pulling
}

function applyMerged(patients: Record<string, Patient>, consultations: Record<string, Consultation>, applied: string[]) {
  const s = useApp.getState()
  for (const k of applied) {
    const v = lookupIn(k, patients, consultations)
    if (v === undefined) removedByServer.add(k)
    else fromServer.set(k, v)
  }
  const ws = sanitizeWorkspace(pickWorkspace(s) as unknown as Record<string, unknown>, patients, consultations)
  const tabs = ws.tabs.map(t => s.tabs.find(x => x.id === t.id) ?? t)
  const pk = applied.filter(k => k.startsWith('p:')).map(k => k.slice(2))
  const ck = applied.filter(k => k.startsWith('c:')).map(k => k.slice(2))
  // An undo step touching a record replaced from the server would revert someone else's edit.
  pruneHistory({ patients: pk, consultations: ck })
  useApp.setState({ ...ws, tabs, patients, consultations })
}
const lookupIn = (k: string, p: Record<string, unknown>, c: Record<string, unknown>) => (k.startsWith('p:') ? p[k.slice(2)] : c[k.slice(2)])

// ───────────────────────── lifecycle ─────────────────────────

async function loadMeta(userId: string): Promise<SyncMeta> {
  const b = persistBackend()
  const m = b ? await b.get(META_KEY).catch(() => undefined) as SyncMeta | undefined : undefined
  if (m && m.userId === userId && m.seen && m.queue) return m
  return emptyMeta(userId)
}

/**
 * Start syncing for the signed-in user after the workspace is hydrated: full pull and merge, then
 * the one-time upload of records made on this device before the first sign-in, then the timers.
 */
export async function startSync(u: User): Promise<void> {
  user = u
  meta = await loadMeta(u.id)
  setAccountStatus({ email: u.email ?? u.id, sync: 'syncing' })
  stopFns.push(onRecordsWritten(onWritten))
  await pullNow()
  if (!meta.migrated) {
    const s = useApp.getState()
    const keys = unsyncedLocalKeys({ patients: s.patients, consultations: s.consultations }, meta).filter(k => !(k in meta!.queue))
    meta = { ...enqueue(meta, keys, Date.now()), migrated: true }
    await saveMeta()
    const n = keys.filter(k => k.startsWith('p:')).length
    if (n) actions.toast(`Uploading ${n} patient${n === 1 ? '' : 's'} from this device to your account`, 'info', undefined, 8000)
  }
  updateStatus()
  void pushNow()
  const onFocus = () => { void pullNow() }
  const onOnline = () => { failures = 0; updateStatus(); void pushNow().then(() => pullNow()) }
  const onOffline = () => updateStatus()
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  pullTimer = setInterval(() => { if (document.visibilityState !== 'hidden') void pullNow() }, PULL_EVERY_MS)
  stopFns.push(() => {
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })
}

/** Stop timers and listeners and forget the session state (sign-out; tests). */
export function stopSync() {
  stopFns.forEach(f => f()); stopFns = []
  meta = null; user = null; failures = 0; fromServer.clear(); removedByServer.clear()
  if (pullTimer) clearInterval(pullTimer)
  if (retryTimer) clearTimeout(retryTimer)
  pullTimer = retryTimer = null
}

/** Push everything now and pull; resolves with the number of changes still not on the server. */
export async function syncNow(): Promise<number> {
  await flushNow()
  await pushNow()
  await pullNow()
  return meta ? Object.keys(meta.queue).length : 0
}

export const unsyncedCount = () => (meta ? Object.keys(meta.queue).length : 0)

/**
 * Sign out: try to push what is pending, ask before discarding changes that did not reach the server,
 * then remove every patient record (and backups holding them) from this device, keep settings and
 * layout, sign out and reload. Returns false when the user cancelled.
 */
export async function signOut(confirm: (unsynced: number) => Promise<boolean>): Promise<boolean> {
  let left = unsyncedCount()
  try { left = await syncNow() } catch { /* offline: counted below */ }
  if (left > 0 && !(await confirm(left))) return false
  stopSync()
  suspendAutosave()
  const b = persistBackend()
  if (b) {
    const s = useApp.getState()
    const ws = sanitizeWorkspace(pickWorkspace(s) as unknown as Record<string, unknown>, {}, {})
    const keys = (await b.entries()).map(([k]) => k).filter(k => k !== WS_KEY)
    await b.write([[WS_KEY, { version: SCHEMA_VERSION, ...ws, activeConsultationId: null, activeClipboardId: null }]], keys)
  }
  meta = null
  user = null
  await supabase().auth.signOut({ scope: 'local' }).catch(e => console.warn('Sign-out request failed', e))
  setAccountStatus({ email: null, sync: 'off', queued: 0 })
  location.reload()
  return true
}
