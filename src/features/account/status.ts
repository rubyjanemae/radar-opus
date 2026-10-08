/*
 * Account and sync state for the shell (status bar, save indicator, commands). No Supabase import here,
 * so the shell does not pull the client into the main bundle.
 */
export type SyncState = 'off' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error'
export interface AccountStatus { email: string | null; sync: SyncState; queued: number; message: string }

let status: AccountStatus = { email: null, sync: 'off', queued: 0, message: '' }
const listeners = new Set<() => void>()
export const accountStatus = {
  get: () => status,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
}
export function setAccountStatus(patch: Partial<AccountStatus>) {
  const next = { ...status, ...patch }
  if ((Object.keys(next) as (keyof AccountStatus)[]).every(k => next[k] === status[k])) return
  status = next
  listeners.forEach(fn => fn())
}
