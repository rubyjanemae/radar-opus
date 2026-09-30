import { createStore, promisifyRequest } from 'idb-keyval'
import type { UseStore } from 'idb-keyval'
import { actions, pruneHistory, sameValue, useApp } from './store'
import type { AppState } from './store'
import type { Consultation, Patient } from './patients'
import { PERSISTED_FIELDS, RestoreError, SCHEMA_VERSION, WORKSPACE_FIELDS, sanitizeLayout, sanitizePersisted, sanitizeSettings, sanitizeWorkspace } from './sanitize'
import type { PersistedState, SanitizeResult, WorkspaceState } from './sanitize'

export { RestoreError, SCHEMA_VERSION, sanitizePersisted }
export type { PersistedState, SanitizeResult }

/*
 * Storage layout (IndexedDB "radar-opus", object store "workspace"):
 *   workspace       small blob: schema version, tabs, layout, settings, bookmarks, notes, active ids
 *   p:<patientId>   one patient
 *   c:<consultId>   one consultation (clipboards, analysis, prescriptions)
 *   state-v1        legacy single blob (migrated to the keys above on first start)
 * Autosave writes the workspace key only when its fields change and a record only when its
 * object reference changed since the last flush, so navigating never re-saves case data.
 */
export const WS_KEY = 'workspace'
export const LEGACY_KEY = 'state-v1'
export const BACKUP_KEY = 'backup:before-import'
/** Prefix of the raw copy saved before a repair rewrites or deletes stored records (`backup:before-repair:<ISO time>`). */
export const REPAIR_BACKUP_PREFIX = 'backup:before-repair:'
const P = 'p:'
const C = 'c:'

// ───────────────────────── backend ─────────────────────────

/** Key-value storage used by persistence (IndexedDB in the app; an in-memory map in tests). */
export interface PersistBackend {
  get(key: string): Promise<unknown>
  /** All [key, value] pairs whose key starts with `prefix`. */
  getPrefix(prefix: string): Promise<[string, unknown][]>
  /** One atomic write: puts and deletes in a single transaction. */
  write(puts: [string, unknown][], dels: string[]): Promise<void>
  entries(): Promise<[string, unknown][]>
  clear(): Promise<void>
}

function idbBackend(): PersistBackend {
  let db: UseStore | null = null
  const store = (): UseStore => (db ??= createStore('radar-opus', 'workspace'))
  const range = (prefix: string) => IDBKeyRange.bound(prefix, prefix + '￿')
  return {
    get: key => store()('readonly', s => promisifyRequest(s.get(key))),
    getPrefix: prefix => store()('readonly', async s => {
      const [keys, values] = await Promise.all([promisifyRequest(s.getAllKeys(range(prefix))), promisifyRequest(s.getAll(range(prefix)))])
      return keys.map((k, i): [string, unknown] => [String(k), values[i]])
    }),
    write: (puts, dels) => store()('readwrite', s => {
      for (const [k, v] of puts) s.put(v, k)
      for (const k of dels) s.delete(k)
      return promisifyRequest(s.transaction)
    }),
    entries: () => store()('readonly', async s => {
      const [keys, values] = await Promise.all([promisifyRequest(s.getAllKeys()), promisifyRequest(s.getAll())])
      return keys.map((k, i): [string, unknown] => [String(k), values[i]])
    }),
    clear: () => store()('readwrite', s => { s.clear(); return promisifyRequest(s.transaction) }),
  }
}

let backend: PersistBackend | null = typeof indexedDB === 'undefined' ? null : idbBackend()
/** Replace the storage backend (tests); null runs without persistence. */
export function setPersistBackend(b: PersistBackend | null) { backend = b; flushed = emptyFlushed(); pendingBackup = null }

// ───────────────────────── save status ─────────────────────────

/** pending: changes waiting for the debounce; readonly: another tab owns the workspace. */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'readonly'
let status: SaveStatus = 'idle'
const listeners = new Set<(s: SaveStatus) => void>()
export const saveStatus = {
  get: () => status,
  subscribe(fn: (s: SaveStatus) => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
}
function setStatus(s: SaveStatus) { if (s !== status) { status = s; listeners.forEach(fn => fn(s)) } }

// ───────────────────────── snapshots ─────────────────────────

export function pickPersisted(s: AppState): PersistedState {
  return Object.fromEntries(PERSISTED_FIELDS.map(k => [k, s[k]])) as PersistedState
}
export function pickWorkspace(s: AppState | PersistedState): WorkspaceState {
  return Object.fromEntries(WORKSPACE_FIELDS.map(k => [k, s[k]])) as WorkspaceState
}

/** What this tab believes is on disk: record key → the object last written or read (by reference). */
/**
 * Record keys → values, kept in one map per key prefix so a diff only walks its own collection and can
 * tell "nothing was deleted" from a count instead of scanning every key.
 */
class Records {
  readonly byPrefix = new Map<string, Map<string, unknown>>([[P, new Map()], [C, new Map()]])
  private of(k: string) { return this.byPrefix.get(k.startsWith(P) ? P : C)! }
  get(k: string) { return this.of(k).get(k) }
  has(k: string) { return this.of(k).has(k) }
  set(k: string, v: unknown) { this.of(k).set(k, v) }
  delete(k: string) { this.of(k).delete(k) }
  keys() { return [...this.byPrefix.get(P)!.keys(), ...this.byPrefix.get(C)!.keys()] }
}
interface Flushed { workspace: WorkspaceState | null; records: Records; patients: unknown; consultations: unknown }
const emptyFlushed = (): Flushed => ({ workspace: null, records: new Records(), patients: null, consultations: null })
let flushed: Flushed = emptyFlushed()

function markFlushed(state: PersistedState) {
  const records = new Records()
  for (const p of Object.values(state.patients)) records.set(P + p.id, p)
  for (const c of Object.values(state.consultations)) records.set(C + c.id, c)
  flushed = { workspace: pickWorkspace(state), records, patients: state.patients, consultations: state.consultations }
}
/** Placeholder for a disk record whose content must be rewritten (or deleted) on the next flush. */
const DIRTY = Symbol('dirty')

interface Diff { puts: [string, unknown][]; dels: string[]; workspace: WorkspaceState | null }

function diffState(s: PersistedState): Diff {
  const puts: [string, unknown][] = []
  const dels: string[] = []
  const ws = pickWorkspace(s)
  const wsChanged = !flushed.workspace || WORKSPACE_FIELDS.some(k => ws[k] !== flushed.workspace![k])
  if (wsChanged) puts.push([WS_KEY, { version: SCHEMA_VERSION, ...ws }])
  // Dirty records only: a record is written when its object is not the one last written or read (edits
  // in the store replace the object), so one edit at 2,000+ patients writes one record.
  const diffRecords = (prefix: string, next: Record<string, { id: string }>, prevObj: unknown) => {
    if (next === prevObj) return
    const known = flushed.records.byPrefix.get(prefix)!
    let kept = 0
    for (const id in next) {
      const k = prefix + id
      const was = known.get(k)
      if (was !== undefined) kept++
      if (was !== next[id]) puts.push([k, next[id]])
    }
    // Every known key is still present: nothing to delete, no second pass.
    if (kept === known.size) return
    for (const k of known.keys()) if (!(k.slice(prefix.length) in next)) dels.push(k)
  }
  diffRecords(P, s.patients, flushed.patients)
  diffRecords(C, s.consultations, flushed.consultations)
  return { puts, dels, workspace: wsChanged ? ws : null }
}

function applyFlushed(d: Diff, s: PersistedState) {
  for (const [k, v] of d.puts) if (k !== WS_KEY) flushed.records.set(k, v)
  for (const k of d.dels) flushed.records.delete(k)
  if (d.workspace) flushed.workspace = d.workspace
  flushed.patients = s.patients
  flushed.consultations = s.consultations
}

/** Unsaved differences between memory and disk (a read-only tab warns before closing with these). */
export function hasUnsavedChanges(): boolean {
  if (!backend) return false
  const d = diffState(pickPersisted(useApp.getState()))
  return d.dels.length > 0 || d.puts.some(([k]) => k !== WS_KEY)
}

// ───────────────────────── load ─────────────────────────

interface Loaded extends SanitizeResult {
  diskKeys: string[]
  /** The stored values as read (before repair), by key; kept for the repair backup and to tell clean records from repaired ones. */
  raw: Map<string, unknown>
}

/** Read and validate what is stored. Returns null on a first run; throws RestoreError when unusable. */
async function loadFromDisk(onWorkspace?: (ws: Record<string, unknown>) => void): Promise<Loaded | null> {
  if (!backend) return null
  let ws: unknown
  try { ws = await backend.get(WS_KEY) } catch (e) { throw new RestoreError(`The saved workspace could not be read: ${e instanceof Error ? e.message : String(e)}`) }
  if (ws === undefined) {
    const legacy = await backend.get(LEGACY_KEY)
    if (legacy === undefined) return null
    const res = sanitizePersisted(legacy)
    // Migrate the single blob to the split layout in one transaction, then it is gone (a repaired blob is kept as a backup).
    const puts: [string, unknown][] = [[WS_KEY, { version: SCHEMA_VERSION, ...pickWorkspace(res.state) }]]
    for (const p of Object.values(res.state.patients)) puts.push([P + p.id, p])
    for (const c of Object.values(res.state.consultations)) puts.push([C + c.id, c])
    if (res.repairs.length) puts.push([REPAIR_BACKUP_PREFIX + new Date().toISOString(), repairBackup([[LEGACY_KEY, legacy]], res.repairs)])
    await backend.write(puts, [LEGACY_KEY])
    // The migrated records are what is on disk now: all clean.
    const raw = new Map<string, unknown>(puts.filter(([k]) => k.startsWith(P) || k.startsWith(C)))
    return { ...res, diskKeys: [...raw.keys()], raw }
  }
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) throw new RestoreError('The saved workspace is not a valid object')
  onWorkspace?.(ws as Record<string, unknown>)
  const [pe, ce] = await Promise.all([backend.getPrefix(P), backend.getPrefix(C)])
  const res = sanitizePersisted({
    ...(ws as Record<string, unknown>),
    patients: Object.fromEntries(pe.map(([k, v]) => [k.slice(P.length), v])),
    consultations: Object.fromEntries(ce.map(([k, v]) => [k.slice(C.length), v])),
  })
  return { ...res, diskKeys: [...pe, ...ce].map(([k]) => k), raw: new Map([[WS_KEY, ws], ...pe, ...ce]) }
}

function repairBackup(entries: Iterable<[string, unknown]>, repairs: string[]) {
  return { savedAt: new Date().toISOString(), reason: 'Saved data was repaired on load; these are the records as they were stored before the repair.', repairs, entries: Object.fromEntries(entries) }
}

/**
 * What this tab knows about the disk after loading. Records the repair left unchanged match the disk;
 * repaired records are rewritten on the next flush, and only keys that yielded no record at all (unreadable)
 * are deleted. When a repair will rewrite or delete anything, the original raw values are saved to a
 * backup key in the same transaction as that first write.
 */
function trackLoaded(loaded: Loaded, state: PersistedState = loaded.state) {
  markFlushed(state)
  if (!loaded.repairs.length) {
    for (const k of loaded.diskKeys) if (!flushed.records.has(k)) flushed.records.set(k, DIRTY)
    return
  }
  // Rewrite after a repair: the (small) workspace key, and every record not stored as it is now.
  flushed.workspace = null
  flushed.patients = flushed.consultations = null
  const onDisk = new Set(loaded.diskKeys)
  for (const k of flushed.records.keys()) if (!onDisk.has(k)) flushed.records.delete(k)
  const touched: [string, unknown][] = []
  for (const k of loaded.diskKeys) {
    const rec = flushed.records.get(k)
    const raw = loaded.raw.get(k)
    if (rec !== undefined && sameValue(rec, raw)) continue
    // repaired (rewritten) or unreadable / stored under another key (deleted): keep the stored value
    touched.push([k, raw])
    flushed.records.set(k, DIRTY)
  }
  const ws = loaded.raw.get(WS_KEY)
  if (ws !== undefined) touched.unshift([WS_KEY, ws])
  // (a migrated legacy blob was backed up by the migration itself)
  if (touched.length) pendingBackup = [REPAIR_BACKUP_PREFIX + new Date().toISOString(), repairBackup(touched, loaded.repairs)]
}

/** Raw copy of repaired records, written together with the first flush that changes them. */
let pendingBackup: [string, unknown] | null = null

function applyState(state: PersistedState) {
  useApp.setState({ ...state, selectedSymptomIds: [], past: [], future: [], hydrated: true })
}

/**
 * Load the saved workspace: the small workspace key first (layout and settings apply at once),
 * then the patient and consultation records. Returns false on a first run (nothing saved).
 * Throws RestoreError when the saved data cannot be used; the app then offers reset / raw export.
 */
export async function hydrate(onStep?: (step: string) => void): Promise<boolean> {
  const loaded = await loadFromDisk(ws => {
    useApp.setState({ layout: sanitizeLayout(ws.layout), settings: sanitizeSettings(ws.settings) })
    onStep?.('Loading cases…')
  })
  if (!loaded) {
    flushed = emptyFlushed()
    useApp.setState({ hydrated: true })
    return false
  }
  applyState(loaded.state)
  // Repaired records are rewritten on the first flush (after a raw backup); clean records are known to match the disk.
  trackLoaded(loaded)
  if (loaded.repairs.length) announceRepairs(loaded.repairs)
  return true
}

/** Toast after a repair on load, offering the raw stored data (including the pre-repair backup) as a file. */
function announceRepairs(repairs: string[]) {
  console.warn('Radar Opus repaired the saved workspace:', repairs)
  actions.toast(
    `Some saved data could not be read and was repaired (${repairs.length} item${repairs.length === 1 ? '' : 's'}); the original was backed up`,
    'info',
    { label: 'Export raw data', run: () => { void downloadRawData() } },
    15000,
  )
}

/** Save everything stored (unvalidated) as a JSON file. */
export async function downloadRawData(): Promise<void> {
  try {
    const { downloadBlob } = await import('../ui/files')
    downloadBlob(await exportRawData(), `radar-opus-raw-${new Date().toISOString().slice(0, 10)}.json`)
  } catch (e) {
    actions.toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
  }
}

/**
 * Take over the stored workspace after another tab released it. Records come from disk unless this
 * tab holds a newer edit (updatedAt) or a record it created; records deleted elsewhere stay deleted
 * unless edited here. This tab keeps its own tabs and focus.
 */
export async function adoptDiskState(): Promise<void> {
  const loaded = await loadFromDisk()
  const s = useApp.getState()
  const diskState = loaded?.state
  const known = flushed.records
  // `seen` is the disk content as this tab will know it; unchanged records keep this tab's objects.
  const merge = <T extends Patient | Consultation>(mem: Record<string, T>, disk: Record<string, T>, prefix: string) => {
    const out: Record<string, T> = {}
    const seen: Record<string, T> = {}
    for (const d of Object.values(disk)) {
      const m = mem[d.id]
      const same = m && known.get(prefix + m.id) === m && m.updatedAt === d.updatedAt
      out[d.id] = seen[d.id] = same ? m : d
    }
    for (const m of Object.values(mem)) {
      const d = disk[m.id]
      const editedHere = known.get(prefix + m.id) !== m
      if (d ? editedHere && m.updatedAt > d.updatedAt : editedHere) out[m.id] = m
    }
    return { out, seen }
  }
  const pm = merge(s.patients, diskState?.patients ?? {}, P)
  const cm = merge(s.consultations, diskState?.consultations ?? {}, C)
  const patients = pm.out
  const consultations = cm.out
  const ws = diskState ?? pickPersisted(s)
  const workspace = sanitizeWorkspace({
    tabs: s.tabs, activeTabId: s.activeTabId, activeConsultationId: s.activeConsultationId, activeClipboardId: s.activeClipboardId, layout: s.layout,
    settings: ws.settings, bookmarks: ws.bookmarks, rubricNotes: ws.rubricNotes, remedyNotes: ws.remedyNotes, recentSearches: ws.recentSearches,
    recentRubrics: ws.recentRubrics,
  }, patients, consultations)
  // Keep this tab's tab objects where they are still valid, so its views do not remount.
  const tabs = workspace.tabs.map(t => s.tabs.find(x => x.id === t.id) ?? t)
  const state = { ...workspace, tabs, patients, consultations }
  if (loaded) trackLoaded(loaded, { ...loaded.state, patients: pm.seen, consultations: cm.seen })
  else flushed = emptyFlushed()
  // Undo steps that touch a record replaced from disk would revert another tab's edit: drop them.
  pruneHistory({ patients: replacedIds(s.patients, patients), consultations: replacedIds(s.consultations, consultations) })
  useApp.setState({ ...state, hydrated: true })
  if (loaded?.repairs.length) announceRepairs(loaded.repairs)
}

/** Ids whose record differs between two collections (added, removed or changed in content). */
function replacedIds<T>(before: Record<string, T>, after: Record<string, T>): string[] {
  const out: string[] = []
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[id], b = after[id]
    if (a !== b && !sameValue(a, b)) out.push(id)
  }
  return out
}

// ───────────────────────── autosave ─────────────────────────

let suspended = false
let writable = true
let autosave: { dispose: () => void; flushNow: () => Promise<void>; schedule: () => void } | null = null
const savedListeners = new Set<() => void>()
/** Called after every successful write (the instance module tells read-only tabs to refresh). */
export function onSaved(fn: () => void) { savedListeners.add(fn); return () => { savedListeners.delete(fn) } }

/** Stop writing the workspace (used before wiping storage and reloading). */
export function suspendAutosave() { suspended = true; autosave?.dispose() }

/** Allow or stop writes (another tab owns the workspace while false). */
export function setWritable(on: boolean) {
  writable = on
  if (!on) setStatus('readonly')
  else { setStatus('saved'); autosave?.schedule() }
}

/** Write pending changes now (tab handover, pagehide). */
export function flushNow(): Promise<void> { return autosave?.flushNow() ?? Promise.resolve() }

const idle = (fn: () => void): (() => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (w.requestIdleCallback) { const h = w.requestIdleCallback(fn, { timeout: 1000 }); return () => w.cancelIdleCallback?.(h) }
  const h = setTimeout(fn, 0)
  return () => clearTimeout(h)
}

/**
 * Autosave: after a change, wait 400 ms, then diff in an idle callback and write only what changed.
 * Flushes immediately on pagehide / when the page is hidden. Returns a disposer.
 */
export function startAutosave(): () => void {
  if (autosave) return autosave.dispose
  let debounce: ReturnType<typeof setTimeout> | null = null
  let cancelIdle: (() => void) | null = null
  let writing: Promise<void> | null = null
  /** The write queued behind the one in flight: callers awaiting a flush get the one that covers their state. */
  let followUp: Promise<void> | null = null
  const cancel = () => {
    if (debounce) { clearTimeout(debounce); debounce = null }
    if (cancelIdle) { cancelIdle(); cancelIdle = null }
  }

  const flush = (): Promise<void> => {
    cancel()
    if (suspended || !writable || !backend) return Promise.resolve()
    if (writing) {
      // Serialize: never drop a flush requested mid-write (a restore or pagehide right after an edit).
      followUp ??= writing.then(() => { followUp = null; return flush() })
      return followUp
    }
    const snap = pickPersisted(useApp.getState())
    const d = diffState(snap)
    if (!d.puts.length && !d.dels.length) { setStatus('saved'); return Promise.resolve() }
    setStatus('saving')
    // The raw copy of repaired records goes in the same transaction as the first write that changes them.
    const backup = pendingBackup
    writing = backend.write(backup ? [backup, ...d.puts] : d.puts, d.dels).then(
      () => { if (pendingBackup === backup) pendingBackup = null; applyFlushed(d, snap)
        // More work queued (an edit made while this write was in flight) keeps the status on 'pending'.
        setStatus(debounce || cancelIdle || followUp ? 'pending' : 'saved'); savedListeners.forEach(fn => fn()) },
      e => { console.error('Autosave failed', e); setStatus(followUp ? 'pending' : 'error') },
    ).finally(() => { writing = null })
    return writing
  }

  const schedule = () => {
    if (suspended) return
    if (!backend) { setStatus('error'); return }
    if (!writable) { setStatus('readonly'); return }
    setStatus('pending')
    if (debounce) clearTimeout(debounce)
    if (cancelIdle) { cancelIdle(); cancelIdle = null }
    debounce = setTimeout(() => { debounce = null; cancelIdle = idle(() => { cancelIdle = null; void flush() }) }, 400)
  }

  let seen = pickPersisted(useApp.getState())
  const unsub = useApp.subscribe(s => {
    if (!s.hydrated) return
    if (PERSISTED_FIELDS.every(k => s[k] === seen[k])) return
    seen = pickPersisted(s)
    schedule()
  })
  const onHide = () => { if (debounce || cancelIdle || status === 'pending') void flush() }
  const onVisibility = () => { if (document.visibilityState === 'hidden') onHide() }
  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', onVisibility)

  const dispose = () => {
    cancel()
    unsub()
    window.removeEventListener('pagehide', onHide)
    document.removeEventListener('visibilitychange', onVisibility)
    autosave = null
  }
  autosave = { dispose, flushNow: flush, schedule }
  // First run (seeded demo) or repaired data: nothing or stale data on disk yet.
  const d = diffState(pickPersisted(useApp.getState()))
  if (d.puts.length || d.dels.length || !backend) schedule()
  else if (writable) setStatus('saved')
  else setStatus('readonly')
  return dispose
}

// ───────────────────────── export / import / reset ─────────────────────────

export async function exportWorkspace(): Promise<Blob> {
  const state = { version: SCHEMA_VERSION, ...pickPersisted(useApp.getState()) }
  const data = { format: 'radar-opus-workspace', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state }
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

/** Everything stored for this app, unvalidated (rescue export when the workspace cannot be restored). */
export async function exportRawData(): Promise<Blob> {
  const entries = backend ? await backend.entries() : []
  const data = { format: 'radar-opus-raw', exportedAt: new Date().toISOString(), entries: Object.fromEntries(entries) }
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

/** Parse and validate a workspace backup file. Throws with a readable message when it is not usable. */
export function parseWorkspaceFile(text: string): SanitizeResult {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('Not a Radar Opus workspace file (the file is not valid JSON)') }
  const d = data as { format?: unknown; version?: unknown; state?: unknown } | null
  if (!d || d.format !== 'radar-opus-workspace' || !d.state || typeof d.state !== 'object' || Array.isArray(d.state)) throw new Error('Not a Radar Opus workspace file')
  const state = d.state as Record<string, unknown>
  try {
    // Files written before the split layout carry no schema version in the state (file format 1 = schema 1).
    return sanitizePersisted({ version: typeof state.version === 'number' ? state.version : typeof d.version === 'number' ? d.version : 1, ...state })
  } catch (e) {
    throw new Error(`The workspace file cannot be restored: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export interface ImportSummary { patients: number; consultations: number; repairs: string[] }

/**
 * Restore a workspace backup: validate first (invalid files change nothing), ask to confirm the
 * replacement, save the current workspace as a backup, then apply. The success toast offers Undo.
 * Returns false when the user cancelled.
 */
export async function importWorkspace(text: string, confirm: (summary: ImportSummary) => Promise<boolean>): Promise<boolean> {
  const { state, repairs } = parseWorkspaceFile(text)
  const summary = { patients: Object.keys(state.patients).length, consultations: Object.keys(state.consultations).length, repairs }
  if (!(await confirm(summary))) return false
  const before = pickPersisted(useApp.getState())
  if (backend) {
    try { await backend.write([[BACKUP_KEY, { savedAt: new Date().toISOString(), state: { version: SCHEMA_VERSION, ...before } }]], []) } catch (e) {
      throw new Error(`The current workspace could not be backed up, so nothing was changed (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  applyState(state)
  // Write the restored workspace now (serialized behind any save in flight), so a pending autosave of
  // the replaced state flushed on pagehide can never land after it.
  await flushNow()
  actions.toast(
    `Workspace restored: ${summary.patients} patient${summary.patients === 1 ? '' : 's'}, ${summary.consultations} consultation${summary.consultations === 1 ? '' : 's'}${repairs.length ? ` (${repairs.length} item${repairs.length === 1 ? '' : 's'} repaired)` : ''}`,
    'success',
    { label: 'Undo', run: () => { applyState(before); void flushNow(); actions.toast('Previous workspace put back', 'info') } },
    10000,
  )
  return true
}

/** Delete the stored workspace (all records). The caller reloads. */
export async function clearStoredWorkspace(): Promise<void> {
  suspendAutosave()
  await backend?.clear()
}
