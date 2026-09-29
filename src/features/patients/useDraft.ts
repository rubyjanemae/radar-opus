import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local draft for a text field that autosaves: edits commit after `delay` ms of idle
 * typing, on blur and on unmount, so the store (and undo history) sees one change per
 * pause rather than one per keystroke. External changes (undo, another view) replace the
 * draft while the field is not being edited.
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

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (dirty.current) {
      dirty.current = false
      commitRef.current(latest.current)
    }
  }, [])

  const setDraft = useCallback((v: T) => {
    dirty.current = true
    latest.current = v
    setDraftState(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [delay, flush])

  useEffect(() => flush, [flush])

  return { draft, setDraft, flush, dirty }
}
