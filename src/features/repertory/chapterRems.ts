import { create } from 'zustand'
import type { RubricRef } from '../../data/types'

/**
 * Chapter headings whose own remedy list is unfolded in the book. Some OOREP chapter roots carry
 * remedies (Mind 479, Vertigo 367); RadarOpus never prints a list at chapter level, so the book
 * shows the heading band alone with a "(n)" expander and the level-1 rubrics right under it.
 * A reading aid like the remedy highlight: not case data, not saved.
 */
const useChapterRems = create<{ open: ReadonlySet<RubricRef> }>(() => ({ open: new Set() }))

export const useOpenChapterRems = (): ReadonlySet<RubricRef> => useChapterRems(s => s.open)
export const chapterRemsOpen = (ref: RubricRef): boolean => useChapterRems.getState().open.has(ref)
export function toggleChapterRems(ref: RubricRef, open = !chapterRemsOpen(ref)) {
  useChapterRems.setState(s => {
    if (s.open.has(ref) === open) return s
    const next = new Set(s.open)
    if (open) next.add(ref)
    else next.delete(ref)
    return { open: next }
  })
}
