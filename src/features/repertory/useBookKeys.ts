import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { Repertory } from '../../data/repertory'
import { actions } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { indexAt } from './virtual'
import { DEFAULT_TAKE } from './take'
import { takeRefs } from './ops'

/** The parts of the book's virtualiser the keyboard map needs. */
export interface BookVirtual { getOffsets: () => ArrayLike<number>; viewport: { height: number } }

export interface BookKeyContext {
  scrollRef: RefObject<HTMLElement | null>
  /** First rubric of the shown chapter and the number of rubrics in it (chapter heading included). */
  start: number
  count: number
  /** Line height of the book text, px (a page step keeps two lines of context). */
  lineH: number
  openTakeBar: (initial: string) => void
  openChooser: (initial: string) => void
  openMenu: (rubric: number) => void
}

/** Select a rubric in a repertory tab; `history` records the jump for Back/Forward. */
export function selectRubric(tab: RepertoryTab, rep: Repertory, i: number, history = false) {
  const target = Math.max(0, Math.min(rep.size - 1, i))
  if (history) actions.navigateRubric(tab.id, target)
  else if (target !== tab.rubric) actions.updateTab<RepertoryTab>(tab.id, { rubric: target })
}

/**
 * Keyboard map of the book view's rubric list (it only acts on keys pressed on the list itself):
 * arrows, Enter/→ into a rubric, ←/Backspace up, PageUp/PageDown by screenful, Home/End, Ctrl+Enter
 * take, `+`/`=` take bar, letters open the chapter chooser, Shift+F10/ContextMenu the rubric menu.
 * Esc (clear the remedy highlight) and Alt+↑/↓ (rubrics with it) are registered commands.
 * Modified PageUp/PageDown (Alt, Ctrl, Meta) are left to the shell (tab switching).
 */
export function useBookKeys(tab: RepertoryTab, rep: Repertory, v: BookVirtual, ctx: BookKeyContext) {
  const rubric = Math.max(0, Math.min(rep.size - 1, tab.rubric))
  const { scrollRef, start, count, lineH } = ctx
  const select = (i: number, history = false) => selectRubric(tab, rep, i, history)

  const pageStep = (dir: 1 | -1) => {
    const k = rubric - start
    // the viewport height the virtualiser keeps from its ResizeObserver: no layout read on a key press
    const offsets = v.getOffsets()
    const y = offsets[k] + dir * (v.viewport.height - lineH * 2)
    const nk = indexAt(offsets, count, Math.max(0, y))
    select(start + (nk === k ? k + dir : nk))
  }

  return (e: ReactKeyboardEvent) => {
    if (e.target !== scrollRef.current) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    if (e.altKey && k.startsWith('Arrow')) return // history and highlight commands
    let handled = true
    if (k === 'ArrowDown' && !mod) select(rubric + 1)
    else if (k === 'ArrowUp' && !mod) select(rubric - 1)
    else if ((k === 'ArrowRight' || (k === 'Enter' && !mod)) && !e.shiftKey && !e.altKey) {
      if (rep.childCountOf(rubric)) select(rubric + 1, true)
      else handled = k === 'Enter'
    } else if (k === 'Enter' && mod) void takeRefs([rep.ref(rubric)], DEFAULT_TAKE)
    else if (k === 'ArrowLeft' && !mod) { const p = rep.parent(rubric); if (p >= 0) select(p, true) }
    else if ((k === 'PageDown' || k === 'PageUp') && !e.altKey && !mod) pageStep(k === 'PageDown' ? 1 : -1)
    else if ((k === 'Home' || k === 'End') && !e.altKey) select(k === 'Home' ? (mod ? 0 : start) : (mod ? rep.size - 1 : start + count - 1))
    else if ((k === '+' || k === '=') && !mod && !e.altKey) ctx.openTakeBar(k)
    else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) ctx.openMenu(rubric)
    else if (/^[a-z]$/i.test(k) && !mod && !e.altKey) ctx.openChooser(k)
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }
}
