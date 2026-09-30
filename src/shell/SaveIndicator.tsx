import { useSyncExternalStore } from 'react'
import { Check, CloudOff, Eye, Loader2 } from 'lucide-react'
import { saveStatus } from '../state/persist'

const VIEW = {
  idle: { icon: Check, text: 'Saved', title: 'All changes are saved in this browser', err: false },
  saved: { icon: Check, text: 'Saved', title: 'All changes are saved in this browser', err: false },
  pending: { icon: Loader2, text: 'Saving', title: 'Saving changes in this browser', err: false },
  saving: { icon: Loader2, text: 'Saving', title: 'Saving changes in this browser', err: false },
  error: { icon: CloudOff, text: 'Not saved', title: 'Changes could not be saved in this browser', err: true },
  readonly: { icon: Eye, text: 'Read-only', title: 'Another tab has this workspace open; changes in this tab are not saved', err: true },
} as const

/**
 * Autosave state; `data-state` (idle, pending, saving, saved, error, readonly) is what tests wait on.
 * One persistent element whose text changes. It is not a live region: "Saving… Saved" after every
 * edit would be noise. Only a failure is announced, through a hidden alert region that is always present
 * and empty until saving fails.
 */
export function SaveIndicator() {
  const s = useSyncExternalStore(saveStatus.subscribe, saveStatus.get)
  const v = VIEW[s as keyof typeof VIEW] ?? VIEW.saved
  const Icon = v.icon
  return (
    <>
      <span className={`save-ind${v.err ? ' save-err' : ''}`} data-state={s} title={v.title} aria-live="off">
        <Icon size={13} aria-hidden className={Icon === Loader2 ? 'spin' : undefined} /> {v.text}
      </span>
      <span className="sr-only" role="alert">{s === 'error' ? 'Changes could not be saved in this browser.' : ''}</span>
    </>
  )
}
