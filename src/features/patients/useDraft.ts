import { useCallback, useEffect, useRef, useState } from 'react'
import { flushNow } from '../../state/persist'

/**
 * Drafts with uncommitted edits. When the page is hidden, reloaded or closed they commit at once
 * (the idle timer would never fire) and the autosave is asked to write straight after, so text
 * typed a moment before a reload is not lost. The autosave has its own pagehide/visibilitychange
 * listeners, which may run before these: `flushNow` after committing covers either order.
 */
const pending = new Set<() => boolean>()
let listening = false

/** Commit every pending draft; returns how many committed. Exported for tests. */
export function flushAllDrafts(): number {
  let n = 0
  for (const flush of [...pending]) if (flush()) n++
  return n
}

function onLeave() {
  if (flushAllDrafts() > 0) void flushNow()
}
function onVisibility() { if (document.visibilityState === 'hidden') onLeave() }

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  // capture: run as early as possible for events dispatched at the window
  window.addEventListener('pagehide', onLeave, true)
  window.addEventListener('beforeunload', onLeave, true)
  document.addEventListener('visibilitychange', onVisibility, true)
}

/**
 * Local draft for a text field that autosaves: edits commit after `delay` ms of idle
 * typing, on blur, on unmount and when the page is hidden or unloaded, so the store (and undo
 * history) sees one change per pause rather than one per keystroke. External changes (undo,
 * another view) replace the draft while the field is not being edited.
 */
export function useDraft<T>(value: T, commit: (v: T) => void, delay = 600) {
  const [draft, setDraftState] = useState(value)
  const dirty = useRef(false)
  const latest = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(commit)
  commitRef.current = commit
  latest.current = draft

  useEffect(() => {
    if (!dirty.current) setDraftState(value)
  }, [value])

  /** Commit now if there is an uncommitted edit; true when it committed. */
  const commitPending = useCallback((): boolean => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    pending.delete(commitPending)
    if (!dirty.current) return false
    dirty.current = false
    commitRef.current(latest.current)
    return true
  }, [])
  const flush = useCallback(() => { commitPending() }, [commitPending])

  const setDraft = useCallback((v: T) => {
    dirty.current = true
    latest.current = v
    setDraftState(v)
    listen()
    pending.add(commitPending)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [delay, flush, commitPending])

  useEffect(() => flush, [flush])

  return { draft, setDraft, flush, dirty }
}
