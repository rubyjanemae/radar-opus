import { suspendAutosave } from '../../state/persist'

export const APP_NAME = 'Radar Opus'
/** From package.json via the `__APP_VERSION__` define in vite.config.ts. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'

/** localStorage key for the first-run welcome tour. */
export const WELCOME_KEY = 'radar-opus.welcome.v1'

export function readFlag(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function writeFlag(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* storage blocked: the tour simply shows again next time */ }
}

/** "1.2 MB" style byte formatting. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[u]}`
}

export interface StorageInfo { usage: number | null; quota: number | null; persisted: boolean | null }

export async function storageInfo(): Promise<StorageInfo> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined
  let usage: number | null = null, quota: number | null = null, persisted: boolean | null = null
  try { if (s?.estimate) { const e = await s.estimate(); usage = e.usage ?? null; quota = e.quota ?? null } } catch { /* unsupported */ }
  try { if (s?.persisted) persisted = await s.persisted() } catch { /* unsupported */ }
  return { usage, quota, persisted }
}

export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}

function deleteDb(name: string): Promise<void> {
  return new Promise(res => {
    try {
      const r = indexedDB.deleteDatabase(name)
      r.onsuccess = r.onerror = () => res()
      // an open connection in this page blocks deletion until reload; the request stays queued
      r.onblocked = () => res()
    } catch { res() }
  })
}

/**
 * Wipe everything this app stored (IndexedDB workspace, local preferences) and reload,
 * so the next start seeds the demo patients again.
 */
export async function resetAllData(reload: () => void = () => location.reload()) {
  suspendAutosave()
  const names = new Set(['radar-opus'])
  try {
    const dbs = await (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases?.()
    for (const d of dbs ?? []) if (d.name) names.add(d.name)
  } catch { /* databases() unsupported */ }
  await Promise.all([...names].map(deleteDb))
  try { localStorage.clear() } catch { /* blocked */ }
  try { sessionStorage.clear() } catch { /* blocked */ }
  reload()
}
