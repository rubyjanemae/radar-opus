import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { Repertory } from '../../data/repertory'
import { actions } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { DEFAULT_TAKE } from './take'
import { takeRefs } from './ops'
import { rubricName, seeTarget, splitSee } from './logic'
import { revealAtTop } from './revealTop'

/** The part of the book's virtualiser the keyboard map needs: the rubrics at the top of column 1 and the bottom of column 2. */
export interface BookVirtual {
  page: () => { first: number; last: number }
  /** Whether a rubric is entirely on the page. */
  isVisible: (i: number) => boolean
  /** Scroll a rubric to the top of column 1 ('top'), just onto the page ('nearest'), or only when its first line is off the page ('step'). */
  reveal: (i: number, how: 'top' | 'nearest' | 'step') => void
}

export interface BookKeyContext {
  scrollRef: RefObject<HTMLElement | null>
  /** First rubric of the shown chapter and the number of rubrics in it (chapter heading included). */
  start: number
  count: number
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
 * arrows (book order, across chapters), Enter on a "(see …)" rubric to the rubric referred to, Enter/→ into a rubric, ←/Backspace up, PageUp/PageDown by page
 * (both columns), Home/End (chapter; with Ctrl the book), Ctrl+Enter
 * take, `+`/`=` take bar, letters open the chapter chooser, Shift+F10/ContextMenu the rubric menu.
 * Esc (clear the remedy highlight) and Alt+↑/↓ (rubrics with it) are registered commands.
 * Modified PageUp/PageDown (Alt, Ctrl, Meta) are left to the shell (tab switching).
 */
export function useBookKeys(tab: RepertoryTab, rep: Repertory, v: BookVirtual, ctx: BookKeyContext) {
  const rubric = Math.max(0, Math.min(rep.size - 1, tab.rubric))
  const { scrollRef, start, count } = ctx
  const select = (i: number, history = false) => selectRubric(tab, rep, i, history)

  /**
   * PageDown: the rubric after the page (both columns; the last one when it is cut off), PageUp: a
   * page back. The new rubric starts the page (top of column 1), so each press turns a whole page.
   */
  const pageStep = (dir: 1 | -1) => {
    const { first, last } = v.page()
    const span = Math.max(1, last - first)
    const next = dir > 0 ? Math.max(rubric + 1, v.isVisible(last) ? last + 1 : last) : Math.min(rubric - 1, first - span)
    const target = Math.max(0, Math.min(rep.size - 1, next))
    if (target === rubric) return
    v.reveal(target, 'top')
    select(target)
  }

  return (e: ReactKeyboardEvent) => {
    if (e.target !== scrollRef.current) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key
    if (e.altKey && k.startsWith('Arrow')) return // history and highlight commands
    let handled = true
    let see = -1
    if (k === 'ArrowDown' && !mod) select(rubric + 1)
    else if (k === 'ArrowUp' && !mod) select(rubric - 1)
    else if (k === 'Enter' && !mod && !e.shiftKey && !e.altKey && (see = seeTarget(rep, rubric)) >= 0) {
      // Return on a "(see …)" rubric follows the reference: the referred rubric starts the page
      select(see, true)
      revealAtTop(rep.ref(see))
    } else if (k === 'Enter' && !mod && !e.shiftKey && !e.altKey && !rep.childCountOf(rubric) && splitSee(rep.text(rubric))) {
      // a reference the data cut off (or whose rubric it lacks): say so instead of doing nothing
      // named as the symptom path names it: chapter and main rubric in capitals ("MIND - RUDENESS - children")
      const path = rep.lineage(rubric).map((r, x) => { const t = rubricName(rep.text(r)); return x <= 1 ? t.toLocaleUpperCase() : t }).join(' - ')
      actions.toast(`${path}: reference target not in this repertory`, 'info', undefined, 2500)
    } else if ((k === 'ArrowRight' || (k === 'Enter' && !mod)) && !e.shiftKey && !e.altKey) {
      if (rep.childCountOf(rubric)) select(rubric + 1, true)
      else handled = k === 'Enter'
    } else if (k === 'Enter' && mod) void takeRefs([rep.ref(rubric)], DEFAULT_TAKE)
    else if (k === 'ArrowLeft' && !mod) { const p = rep.parent(rubric); if (p >= 0) select(p, true) }
    else if ((k === 'PageDown' || k === 'PageUp') && !e.altKey && !mod) pageStep(k === 'PageDown' ? 1 : -1)
    else if ((k === 'Home' || k === 'End') && !e.altKey) select(k === 'Home' ? (mod ? 0 : start) : (mod ? rep.size - 1 : start + count - 1))
    // RadarOpus: `=` takes at once with the default options; `+` starts the mini-language (`+2`, `+1>3`, `+!`)
    else if (k === '=' && !mod && !e.altKey) void takeRefs([rep.ref(rubric)], DEFAULT_TAKE)
    else if (k === '+' && !mod && !e.altKey) ctx.openTakeBar(k)
    else if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) ctx.openMenu(rubric)
    else if (/^[a-z]$/i.test(k) && !mod && !e.altKey) ctx.openChooser(k)
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }
}
