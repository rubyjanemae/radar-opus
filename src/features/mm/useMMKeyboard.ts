import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { BookItem } from './book'
import type { MMHit } from './text'
import { openRemedy, toggleList, toggleShowAbbrevs, useMMUi } from './ops'

/** Type-ahead: letters typed within this many ms extend the prefix. */
export const TYPEAHEAD_MS = 800

function isEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export interface MMKeyboardContext {
  remedyId: number | null
  hasEntry: boolean
  items: BookItem[]
  selectedIndex: number
  letters: Map<string, number>
  hits: MMHit[]
  hitSel: number
  markSection: number | null
  sideMode: 'list' | 'results'
  hasTerms: boolean
  pageSize: number
  refs: {
    list: RefObject<HTMLDivElement | null>
    reader: RefObject<HTMLElement | null>
    search: RefObject<HTMLInputElement | null>
    az: RefObject<HTMLElement | null>
    hits: { scrollToIndex: (i: number) => void }
  }
  go: (remedyId: number) => void
  step: (dir: 1 | -1) => void
  openHit: (h: MMHit, index: number) => void
  openSections: () => void
  /** Scroll so the item is the top row and select it. */
  jumpTo: (i: number) => void
  openRemedyMenu: (anchor: HTMLElement, remedyId: number) => void
  /** Context menu for text selected in the reader; returns false when nothing is selected. */
  openSelectionMenu: () => boolean
}

/**
 * Keyboard handling of the materia medica view: view-level single keys (j/k, /, s, n/N, i, l,
 * Space; Alt+←/→ are the scoped mm.back/forward commands), the remedy list (arrows, paging, type-ahead), the A–Z index and the results list.
 */
export function useMMKeyboard(c: MMKeyboardContext) {
  const typeahead = useRef({ text: '', at: 0 })
  const typeaheadActive = () => Date.now() - typeahead.current.at < TYPEAHEAD_MS && typeahead.current.text.length > 0

  const moveSelection = (delta: number, abs?: number) => {
    if (!c.items.length) return
    const base = c.selectedIndex < 0 ? (delta > 0 ? -1 : c.items.length) : c.selectedIndex
    const i = Math.max(0, Math.min(c.items.length - 1, abs ?? base + delta))
    c.go(c.items[i].remedyId)
  }

  const jumpToLetter = (L: string) => { const at = c.letters.get(L); if (at !== undefined) c.jumpTo(at) }

  /** The first remedy whose title (then abbreviation) starts with the typed prefix; one repeated letter cycles. */
  const typeAhead = (ch: string) => {
    const now = Date.now()
    const t = typeahead.current
    const text = (now - t.at < TYPEAHEAD_MS ? t.text : '') + ch.toLowerCase()
    typeahead.current = { text, at: now }
    const find = (p: string) => {
      let i = c.items.findIndex(it => it.title.toLowerCase().startsWith(p))
      if (i < 0) i = c.items.findIndex(it => it.abbrev.toLowerCase().startsWith(p))
      return i
    }
    let i = find(text)
    if (text.length > 1 && [...text].every(x => x === text[0])) {
      const same = c.items.map((it, k) => [it, k] as const).filter(([it]) => it.title.toLowerCase().startsWith(text[0])).map(([, k]) => k)
      if (same.length) i = same[(text.length - 1) % same.length]
    }
    if (i >= 0) c.jumpTo(i)
  }

  const onRootKey = (e: ReactKeyboardEvent) => {
    if (e.defaultPrevented) return
    if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target)) return
    if (e.key === '/') { e.preventDefault(); c.refs.search.current?.focus(); c.refs.search.current?.select() }
    else if (e.key === 'j' || e.key === 'k') {
      e.preventDefault()
      if (c.sideMode === 'results' && c.hits.length) c.step(e.key === 'j' ? 1 : -1)
      else moveSelection(e.key === 'j' ? 1 : -1)
    } else if (e.key === 's' && c.hasEntry) { e.preventDefault(); c.openSections() }
    else if (e.key === 'n' && c.hasTerms) { e.preventDefault(); c.step(1) }
    else if (e.key === 'N' && c.hasTerms) { e.preventDefault(); c.step(-1) }
    else if (e.key === 'i' && c.remedyId != null) { e.preventDefault(); openRemedy(c.remedyId) }
    else if (e.key === 'l') {
      e.preventDefault()
      toggleList()
      requestAnimationFrame(() => (useMMUi.getState().listHidden ? c.refs.reader.current : c.refs.list.current)?.focus({ preventScroll: true }))
    }
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { if (c.openSelectionMenu()) e.preventDefault() }
    else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); toggleShowAbbrevs() }
  }

  const onListKey = (e: ReactKeyboardEvent) => {
    const k = e.key
    if (e.altKey) return
    if (k === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
    else if (k === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
    else if (k === 'Home') { e.preventDefault(); moveSelection(0, 0) }
    else if (k === 'End') { e.preventDefault(); moveSelection(0, c.items.length - 1) }
    else if (k === 'PageDown') { e.preventDefault(); moveSelection(c.pageSize) }
    else if (k === 'PageUp') { e.preventDefault(); moveSelection(-c.pageSize) }
    else if (k === 'Enter' && c.remedyId != null) { e.preventDefault(); if (e.shiftKey) openRemedy(c.remedyId); else c.refs.reader.current?.focus() }
    // type-ahead: letters jump to the first remedy with that prefix (j/k keep moving; Shift+J/K type J/K)
    else if (/^[a-z]$/i.test(k) && !e.ctrlKey && !e.metaKey && !((k === 'j' || k === 'k') && !typeaheadActive())) { e.preventDefault(); e.stopPropagation(); typeAhead(k) }
    else if ((k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) && (c.remedyId != null || c.items.length)) {
      e.preventDefault()
      // the active option: the current remedy, else the first one (the list shows it active while focused)
      const rid = c.selectedIndex >= 0 && c.remedyId != null ? c.remedyId : c.items[0].remedyId
      const row = c.refs.list.current?.querySelector<HTMLElement>(`[data-rid="${rid}"]`) ?? c.refs.list.current
      if (row) c.openRemedyMenu(row, rid)
    }
  }

  /** A–Z index: one tab stop; arrows move between letters, Enter/Space jump, a letter jumps directly. */
  const onAzKey = (e: ReactKeyboardEvent) => {
    const btns = [...(c.refs.az.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    let ni = -1
    if (e.altKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') ni = Math.min(btns.length - 1, i + 1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ni = Math.max(0, i - 1)
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = btns.length - 1
    else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); jumpToLetter(e.key.toUpperCase()); return }
    if (ni < 0) return
    e.preventDefault()
    e.stopPropagation()
    btns[ni]?.focus()
  }

  const onHitsKey = (e: ReactKeyboardEvent) => {
    if (!c.hits.length || e.altKey) return
    const cur = c.markSection !== null && c.remedyId != null ? c.hits.findIndex(h => h.remedyId === c.remedyId && h.section === c.markSection) : c.hitSel
    let ni: number | null = null
    if (e.key === 'ArrowDown') ni = Math.min(c.hits.length - 1, cur + 1)
    else if (e.key === 'ArrowUp') ni = Math.max(0, cur - 1)
    else if (e.key === 'Home') ni = 0
    else if (e.key === 'End') ni = c.hits.length - 1
    if (ni === null) return
    e.preventDefault()
    c.refs.hits.scrollToIndex(ni)
    c.openHit(c.hits[ni], ni)
  }

  return { onRootKey, onListKey, onAzKey, onHitsKey, jumpToLetter }
}
