import type { RubricRef } from '../../data/types'

/**
 * One-shot "show this rubric at the top of column 1" requests, for jumps that must always land
 * there (the Navigation window's Go to / Return), even when the rubric is already on screen.
 *
 * The caller navigates first (goToRef) and then calls `revealAtTop(ref)`. A book already showing
 * that rubric reveals it at once (listener); a book about to show it takes the request in the
 * layout effect that follows the navigation (`takeRevealTop`).
 */
let pending: { ref: RubricRef; at: number } | null = null
const views = new Set<(ref: RubricRef) => boolean>()

export function revealAtTop(ref: RubricRef) {
  pending = { ref, at: Date.now() }
  for (const v of views) if (v(ref)) { pending = null; return }
}

/** True once for a pending request for `ref` (requests older than two seconds lapse). */
export function takeRevealTop(ref: RubricRef): boolean {
  const p = pending
  if (!p || p.ref !== ref) return false
  pending = null
  return Date.now() - p.at < 2000
}

/** A book view listens: `fn` reveals the ref and returns true when it already shows it in the active tab. */
export function onRevealTop(fn: (ref: RubricRef) => boolean): () => void {
  views.add(fn)
  return () => { views.delete(fn) }
}
