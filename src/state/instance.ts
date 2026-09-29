import { adoptDiskState, flushNow, hasUnsavedChanges, onSaved, setWritable } from './persist'
import { actions } from './store'

/*
 * One writer per browser profile. The first tab takes an exclusive Web Lock and saves; any other tab
 * opens read-only (a banner says so) and queues for the lock. When the writer closes, or hands over
 * on request ("Edit in this tab"), the next tab takes the lock, merges what is on disk with its own
 * edits per record (updatedAt) and starts saving. Nothing is overwritten blindly.
 */

const LOCK = 'radar-opus:workspace-writer'
const CHANNEL = 'radar-opus:instances'

export type InstanceMode = 'writer' | 'readonly'
let mode: InstanceMode = 'writer'
const listeners = new Set<() => void>()
export const instanceMode = {
  get: () => mode,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
}
function setMode(m: InstanceMode) { if (m !== mode) { mode = m; listeners.forEach(fn => fn()) } }

let release: (() => void) | null = null
let channel: BroadcastChannel | null = null
let waiting = false
let handingOver = false

const locks = (): LockManager | undefined => (typeof navigator !== 'undefined' ? navigator.locks : undefined)

type Message = { type: 'handover' } | { type: 'saved' }
function post(m: Message) { try { channel?.postMessage(m) } catch { /* channel closed */ } }

/** Hold the lock until release() is called. Resolves with whether it was granted. */
function requestLock(ifAvailable: boolean, onGranted?: () => void): Promise<boolean> {
  const lm = locks()!
  return new Promise(resolve => {
    lm.request(LOCK, { ifAvailable }, lock => {
      if (!lock) { resolve(false); return undefined }
      resolve(true)
      onGranted?.()
      return new Promise<void>(r => { release = r })
    }).catch(() => resolve(false))
  })
}

/** Queue for the lock; when granted this tab takes over saving. */
function waitForLock() {
  if (waiting) return
  waiting = true
  void requestLock(false, () => {
    waiting = false
    void (async () => {
      try {
        await adoptDiskState()
        setWritable(true)
        setMode('writer')
        actions.toast('This tab now saves changes to the workspace', 'success')
      } catch (e) {
        console.error(e)
        actions.toast('Could not take over the workspace in this tab; reload to try again', 'error')
      }
    })()
  })
}

async function onMessage(e: MessageEvent<Message>) {
  const m = e.data
  if (m?.type === 'handover' && mode === 'writer' && release && !handingOver) {
    handingOver = true
    try {
      await flushNow()
      setWritable(false)
      setMode('readonly')
      const r = release
      release = null
      r()
      waitForLock()
      actions.toast('Another tab took over editing; this tab is now read-only', 'info', undefined, 6000)
    } finally { handingOver = false }
  } else if (m?.type === 'saved' && mode === 'readonly' && !hasUnsavedChanges()) {
    // Follow the writer's saves while this tab has nothing of its own to keep.
    try { await adoptDiskState() } catch (err) { console.error(err) }
  }
}

/**
 * Decide whether this tab may write. Call before hydrate(); read-only tabs load the saved data but
 * never write until they get the lock. Without Web Locks (old browsers, tests) the tab is the writer.
 */
export async function claimWorkspace(): Promise<InstanceMode> {
  if (!locks()) return mode
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = e => { void onMessage(e) }
  }
  onSaved(() => post({ type: 'saved' }))
  window.addEventListener('beforeunload', e => { if (mode === 'readonly' && hasUnsavedChanges()) e.preventDefault() })
  if (await requestLock(true)) { setMode('writer'); return mode }
  setWritable(false)
  setMode('readonly')
  waitForLock()
  return mode
}

/** Ask the tab that holds the workspace to save and hand it to this one. */
export function requestHandover() { post({ type: 'handover' }) }
