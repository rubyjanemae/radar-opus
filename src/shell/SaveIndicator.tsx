import { useSyncExternalStore } from 'react'
import { Check, CloudOff, Loader2 } from 'lucide-react'
import { saveStatus } from '../state/persist'

export function SaveIndicator() {
  const s = useSyncExternalStore(saveStatus.subscribe, saveStatus.get)
  if (s === 'error') return <span className="save-ind save-err" role="status"><CloudOff size={13} /> Not saved</span>
  if (s === 'saving') return <span className="save-ind" role="status"><Loader2 size={13} className="spin" /> Saving</span>
  return <span className="save-ind" role="status" title="All changes are saved in this browser"><Check size={13} /> Saved</span>
}
