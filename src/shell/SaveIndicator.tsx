import { useSyncExternalStore } from 'react'
import { Check, CircleDot, Cloud, CloudOff, Eye, Loader2 } from 'lucide-react'
import { accountStatus } from '../features/account/status'
import type { AccountStatus } from '../features/account/status'
import { saveStatus } from '../state/persist'

const VIEW = {
  idle: { icon: Check, text: 'Saved', title: 'All changes are saved in this browser', err: false },
  saved: { icon: Check, text: 'Saved', title: 'All changes are saved in this browser', err: false },
  // waiting for the autosave debounce: nothing is being written yet, so no spinner (only 'saving' spins)
  pending: { icon: CircleDot, text: 'Saving', title: 'Changes will be saved in this browser in a moment', err: false },
  saving: { icon: Loader2, text: 'Saving', title: 'Saving changes in this browser', err: false },
  error: { icon: CloudOff, text: 'Not saved', title: 'Changes could not be saved in this browser', err: true },
  readonly: { icon: Eye, text: 'Read-only', title: 'Another tab has this workspace open; changes in this tab are not saved', err: true },
} as const

/** Once saved locally, a signed-in workspace shows the cloud sync state instead of "Saved". */
function syncView(a: AccountStatus) {
  const q = a.queued ? ` (${a.queued} change${a.queued === 1 ? '' : 's'} waiting)` : ''
  switch (a.sync) {
    case 'synced': return { icon: Cloud, text: 'Synced', title: `Saved on this device and synced to ${a.email}`, err: false }
    case 'syncing': return { icon: Loader2, text: 'Syncing', title: `Saved on this device; syncing with ${a.email}`, err: false }
    case 'pending': return { icon: CircleDot, text: 'Syncing', title: `Saved on this device; will sync in a moment${q}`, err: false }
    case 'offline': return { icon: CloudOff, text: 'Offline, will sync', title: `Saved on this device; will sync when the connection is back${q}${a.message ? `. Last error: ${a.message}` : ''}`, err: true }
    case 'error': return { icon: CloudOff, text: 'Sync error', title: `Saved on this device; could not reach your account${a.message ? `: ${a.message}` : ''}`, err: true }
    default: return null
  }
}

/**
 * Autosave state; `data-state` (idle, pending, saving, saved, error, readonly) is what tests wait on.
 * The spinner turns only while a write is in flight; it reads "Saved" as soon as that write resolves.
 * One persistent element whose text changes. It is not a live region: "Saving… Saved" after every
 * edit would be noise. Only a failure is announced, through a hidden alert region that is always present
 * and empty until saving fails.
 */
export function SaveIndicator() {
  const s = useSyncExternalStore(saveStatus.subscribe, saveStatus.get)
  const a = useSyncExternalStore(accountStatus.subscribe, accountStatus.get)
  const local = VIEW[s as keyof typeof VIEW] ?? VIEW.saved
  const v = (s === 'saved' || s === 'idle') ? syncView(a) ?? local : local
  const Icon = v.icon
  return (
    <>
      <span className={`save-ind${v.err ? ' save-err' : ''}`} data-state={s} data-sync={a.sync} title={v.title} aria-live="off">
        <Icon size={13} aria-hidden className={Icon === Loader2 ? 'spin' : undefined} /> {v.text}
      </span>
      <span className="sr-only" role="alert">{s === 'error' ? 'Changes could not be saved in this browser.' : ''}</span>
    </>
  )
}
