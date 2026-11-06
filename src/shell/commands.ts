import type { Catalog } from '../data/catalog'
import { getCommand, isEnabled, registerCommands, runCommand } from '../commands/registry'
import { actions, selectActiveTab, useApp } from '../state/store'
import type { RepertoryTab } from '../state/workspace'
import { chrome } from './chrome'
import { returnFocusFromChrome } from './focus'
import { activeDocumentElement } from './TabHost'

/**
 * Show or hide part of the window chrome; when the keyboard was in the part that goes away (or is
 * lost), it continues in the active document.
 */
function toggleChrome(region: string, toggle: () => void) {
  const a = document.activeElement
  const inside = a instanceof Element && !!a.closest(region)
  toggle()
  if (inside) returnFocusFromChrome('body')
  else returnFocusFromChrome('.statusbar')
}

const st = () => useApp.getState()

/** The print commands the active document may offer, in order of preference. */
const PRINTERS = ['analysis.print', 'mm.print']

/** The repertory tab the user was last in (the book a Back from another document returns to). */
let lastBookId: string | null = null
function lastBook(): RepertoryTab | null {
  const s = st()
  const books = s.tabs.filter((t): t is RepertoryTab => t.kind === 'repertory')
  return books.find(t => t.id === lastBookId) ?? books[books.length - 1] ?? null
}
const inBook = () => selectActiveTab(st())?.kind === 'repertory'

/**
 * The step out of another document: Back from the analysis (say) returns to the book and remembers that
 * document, so Forward from the book leads back to it. It lapses once the book moves on (its own history
 * changes), another tab is chosen, or that document is closed.
 */
let docStep: { bookId: string; docId: string; back: number[]; forward: number[]; focus: WeakRef<HTMLElement> | null } | null = null
function pendingDocStep(): string | null {
  if (!docStep) return null
  const s = st()
  const book = selectActiveTab(s)
  const ok = book?.kind === 'repertory' && book.id === docStep.bookId && book.back === docStep.back && book.forward === docStep.forward
    && s.tabs.some(t => t.id === docStep!.docId)
  return ok ? docStep.docId : null
}

/**
 * Toolbar / View menu Back and Forward. In a book they step its history (nav.back / nav.forward), and
 * Forward first returns to the document a Back left. From another document Back returns to the book and
 * its rubric; Forward has nothing ahead there and is disabled (it never does what Back does).
 */
function stepCommand(dir: 'back' | 'forward') {
  const id = dir === 'back' ? 'nav.back' : 'nav.forward'
  const base = () => getCommand(id)
  return {
    id: `shell.${dir}`, title: dir === 'back' ? 'Go back' : 'Go forward', category: 'View', hidden: true,
    keys: [dir === 'back' ? 'Alt+ArrowLeft' : 'Alt+ArrowRight'],
    enabled: () => {
      if (inBook()) {
        if (dir === 'forward' && pendingDocStep()) return true
        const c = base(); return !!c && isEnabled(c)
      }
      return dir === 'back' && !!lastBook()
    },
    run: () => {
      if (inBook()) {
        const doc = dir === 'forward' ? pendingDocStep() : null
        if (doc) {
          // the document stayed mounted: the keyboard comes back to the element it left (the pane it was in)
          const prefer = docStep!.focus?.deref() ?? null
          docStep = null; actions.activateTab(doc); returnFocusFromChrome('body', prefer); return
        }
        runCommand(id)
        return
      }
      if (dir === 'forward') return
      const from = selectActiveTab(st())
      const b = lastBook()
      if (!b || !from) return
      const a = document.activeElement
      const focus = a instanceof HTMLElement && activeDocumentElement()?.contains(a) ? new WeakRef(a) : null
      docStep = { bookId: b.id, docId: from.id, back: b.back, forward: b.forward, focus }
      actions.activateTab(b.id)
      returnFocusFromChrome('body')
    },
  }
}

/** Window chrome commands (RadarOpus View / Window menus and the status strip links). */
export function register(_catalog: Catalog) {
  void _catalog
  useApp.subscribe(s => {
    const t = selectActiveTab(s)
    if (t?.kind === 'repertory') lastBookId = t.id
    if (docStep && t?.id !== docStep.bookId) docStep = null
  })
  registerCommands([
    stepCommand('back'),
    stepCommand('forward'),
    {
      id: 'view.toc', title: 'Table of contents', category: 'View', keys: ['Mod+F2', 'Mod+B'], allowInInput: true, keywords: 'toc navigator chapters repertories',
      checked: () => st().layout.showTree,
      run: () => toggleChrome('.pane-left', () => actions.setLayout({ showTree: !st().layout.showTree })),
    },
    {
      id: 'view.expandToc', title: 'Expand Toc', category: 'View', keywords: 'table of contents wide',
      enabled: () => st().layout.showTree, checked: () => chrome.get().tocExpanded,
      run: () => chrome.set({ tocExpanded: !chrome.get().tocExpanded }),
    },
    {
      id: 'view.toolbars', title: 'Toolbars and clipboards', category: 'View', keywords: 'hide show toolbar clipboard strip chrome',
      checked: () => !chrome.get().hideBars,
      run: () => toggleChrome('.toolbar, .clipstrip, .pane-right', () => chrome.set({ hideBars: !chrome.get().hideBars })),
    },
    {
      id: 'window.closeAll', title: 'Close all windows', category: 'View', keywords: 'close all tabs documents',
      enabled: () => st().tabs.some(t => !t.pinned),
      run: () => { for (const t of st().tabs) if (!t.pinned) actions.closeTab(t.id) },
    },
    {
      // the toolbar's Print: what the active document prints, else the page itself
      id: 'file.print', title: 'Print', category: 'File', keywords: 'print page',
      run: () => {
        const id = PRINTERS.find(p => { const c = getCommand(p); return !!c && isEnabled(c) })
        if (id) runCommand(id)
        else window.print()
      },
    },
  ])
}
