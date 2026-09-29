import { createStore, get as idbGet, set as idbSet } from 'idb-keyval'
import { useApp } from './store'
import type { AppState } from './store'

const DB = createStore('radar-opus', 'workspace')
const KEY = 'state-v1'
const PERSISTED = ['patients', 'consultations', 'tabs', 'activeTabId', 'layout', 'settings', 'bookmarks', 'rubricNotes', 'recentSearches', 'activeConsultationId', 'activeClipboardId'] as const
export type PersistedState = Pick<AppState, (typeof PERSISTED)[number]>

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
let status: SaveStatus = 'idle'
const listeners = new Set<(s: SaveStatus) => void>()
export const saveStatus = {
  get: () => status,
  subscribe(fn: (s: SaveStatus) => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
}
function setStatus(s: SaveStatus) { status = s; listeners.forEach(fn => fn(s)) }

export function pickPersisted(s: AppState): PersistedState {
  return Object.fromEntries(PERSISTED.map(k => [k, s[k]])) as PersistedState
}

/** Load saved workspace; returns false when there is nothing saved (first run). */
export async function hydrate(): Promise<boolean> {
  let saved: Partial<PersistedState> | undefined
  try { saved = await idbGet<Partial<PersistedState>>(KEY, DB) } catch { saved = undefined }
  if (saved) {
    const cur = useApp.getState()
    useApp.setState({ ...saved, layout: { ...cur.layout, ...saved.layout }, settings: { ...cur.settings, ...saved.settings }, hydrated: true })
    return true
  }
  useApp.setState({ hydrated: true })
  return false
}

let timer: ReturnType<typeof setTimeout> | null = null
/** Autosave: debounce writes of persisted slices whenever they change. */
export function startAutosave() {
  let last = pickPersisted(useApp.getState())
  const flush = async () => {
    timer = null
    setStatus('saving')
    try { await idbSet(KEY, pickPersisted(useApp.getState()), DB); setStatus('saved') } catch { setStatus('error') }
  }
  const unsub = useApp.subscribe(s => {
    if (!s.hydrated) return
    const next = pickPersisted(s)
    if (PERSISTED.every(k => next[k] === last[k])) return
    last = next
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 400)
  })
  const onHide = () => { if (timer) { clearTimeout(timer); void flush() } }
  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide() })
  return unsub
}

export async function exportWorkspace(): Promise<Blob> {
  const data = { format: 'radar-opus-workspace', version: 1, exportedAt: new Date().toISOString(), state: pickPersisted(useApp.getState()) }
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

export async function importWorkspace(text: string) {
  const data = JSON.parse(text)
  if (data?.format !== 'radar-opus-workspace' || !data.state) throw new Error('Not a Radar Opus workspace file')
  useApp.setState({ ...data.state, past: [], future: [] })
}
