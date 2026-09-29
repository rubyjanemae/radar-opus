import { useSyncExternalStore } from 'react'
import { Check, CloudOff, Eye, Loader2 } from 'lucide-react'
import { saveStatus } from '../state/persist'

/** Autosave state; `data-state` (idle, pending, saving, saved, error, readonly) is what tests wait on. */
export function SaveIndicator() {
  const s = useSyncExternalStore(saveStatus.subscribe, saveStatus.get)
  if (s === 'error') return <span className="save-ind save-err" role="status" data-state={s}><CloudOff size={13} /> Not saved</span>
  if (s === 'readonly') return <span className="save-ind save-err" role="status" data-state={s} title="Another tab has this workspace open; changes in this tab are not saved"><Eye size={13} /> Read-only</span>
  if (s === 'saving' || s === 'pending') return <span className="save-ind" role="status" data-state={s}><Loader2 size={13} className="spin" /> Saving</span>
  return <span className="save-ind" role="status" data-state={s} title="All changes are saved in this browser"><Check size={13} /> Saved</span>
}
