import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { registerDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { actions, useApp } from '../../state/store'
import { DEFAULT_TAKE } from './take'
import type { TakeOptions } from './take'
import {
  activeRepertoryTab, bookmarkOf, copyRubric, currentRefs, currentRubric, goParent, goToRef, openFind, openNote,
  openTakeOptions, setRepertoryCatalog, takeRefs, toggleBookmark,
} from './ops'
import { FindDialog } from './FindDialog'
import { TakeOptionsDialog } from './TakeOptionsDialog'
import { NoteDialog } from './NoteDialog'
import { BookmarksDialog } from './BookmarksDialog'

/** Keys that only fire while focus is in the book view or the navigator. */
export const REPERTORY_SCOPE = '.rv, .rnav'

const hasRubric = () => currentRefs().length > 0
const noTextSelection = () => { const sel = window.getSelection(); return !sel || sel.isCollapsed || !sel.toString().trim() }
const take = (o: Partial<TakeOptions>) => takeRefs(currentRefs(), { ...DEFAULT_TAKE, ...o })

export function register(catalog: Catalog) {
  setRepertoryCatalog(catalog)
  registerDialog('repertory.find', FindDialog as DialogComponent)
  registerDialog('repertory.take', TakeOptionsDialog as DialogComponent)
  registerDialog('repertory.note', NoteDialog as DialogComponent)
  registerDialog('repertory.bookmarks', BookmarksDialog as DialogComponent)

  registerCommands([
    // navigation
    {
      id: 'nav.back', title: 'Back', category: 'Repertory', keys: ['Alt+ArrowLeft'],
      enabled: () => (activeRepertoryTab()?.back.length ?? 0) > 0,
      run: () => { const t = activeRepertoryTab(); if (t) actions.historyBack(t.id) },
    },
    {
      id: 'nav.forward', title: 'Forward', category: 'Repertory', keys: ['Alt+ArrowRight'],
      enabled: () => (activeRepertoryTab()?.forward.length ?? 0) > 0,
      run: () => { const t = activeRepertoryTab(); if (t) actions.historyForward(t.id) },
    },
    {
      id: 'nav.parent', title: 'Up to parent rubric', category: 'Repertory', keys: ['Backspace'], scope: REPERTORY_SCOPE,
      enabled: () => { const c = currentRubric(); return !!c && c.rep.parent(c.index) >= 0 },
      run: () => { const c = currentRubric(); if (c) goParent(c.tab, c.rep) },
    },
    { id: 'nav.chapter', title: 'Find rubric…', category: 'Repertory', keys: ['F2'], keywords: 'chapter go to navigate', run: () => openFind(false) },
    { id: 'nav.findHere', title: 'Find from current rubric…', category: 'Repertory', keys: ['F3'], enabled: () => !!currentRubric(), run: () => openFind(true) },
    {
      // Space only on the rubric list itself: on a button, radio or select inside the book it keeps its native meaning
      id: 'repertory.cycleDisplay', title: 'Cycle rubric display', category: 'Repertory', keys: ['Space'], scope: '.rv-scroll', scopeLabel: 'in the rubric list',
      keywords: 'count remedies names space',
      enabled: () => !!activeRepertoryTab(),
      run: () => cycleDisplay(),
    },
    {
      id: 'repertory.toc', title: 'Repertories (table of contents)', category: 'Repertory', keys: ['Mod+1'], keywords: 'toc library books',
      run: () => actions.openTab({ kind: 'repertories' }),
    },
    {
      id: 'repertory.new', title: 'New repertory tab', category: 'Repertory',
      run: () => { const c = currentRubric(); void goToRef(c ? c.rep.ref(c.index) : `${useApp.getState().settings.defaultRepertory}:0`, { newTab: true }) },
    },

    // taking
    { id: 'rubric.add', title: 'Take rubric', category: 'Repertory', keys: ['Insert'], keywords: 'add clipboard symptom take', enabled: hasRubric, run: () => void take({ weight: 1 }) },
    { id: 'rubric.add.w2', title: 'Take with intensity 2', category: 'Repertory', enabled: hasRubric, run: () => void take({ weight: 2 }) },
    { id: 'rubric.add.w3', title: 'Take with intensity 3', category: 'Repertory', enabled: hasRubric, run: () => void take({ weight: 3 }) },
    { id: 'rubric.add.w4', title: 'Take with intensity 4', category: 'Repertory', enabled: hasRubric, run: () => void take({ weight: 4 }) },
    { id: 'rubric.takeOptions', title: 'Take with options…', category: 'Repertory', keys: ['F6'], enabled: hasRubric, run: () => openTakeOptions(currentRefs()) },

    // rubric utilities
    {
      id: 'rubric.copy', title: 'Copy rubric with remedies', category: 'Repertory', keys: ['Mod+C'], scope: REPERTORY_SCOPE,
      enabled: () => hasRubric() && noTextSelection(), run: () => { const r = currentRefs()[0]; if (r) void copyRubric(r, true) },
    },
    {
      id: 'rubric.copyText', title: 'Copy rubric text', category: 'Repertory', keys: ['Mod+Shift+C'], scope: REPERTORY_SCOPE,
      enabled: () => hasRubric() && noTextSelection(), run: () => { const r = currentRefs()[0]; if (r) void copyRubric(r, false) },
    },
    {
      id: 'rubric.bookmark', title: 'Bookmark rubric', category: 'Repertory', keys: ['Mod+D'], enabled: hasRubric,
      checked: () => { const r = currentRefs()[0]; return !!r && !!bookmarkOf(r) },
      run: () => { const r = currentRefs()[0]; if (r) toggleBookmark(r) },
    },
    { id: 'rubric.note', title: 'Rubric note…', category: 'Repertory', keys: ['Mod+Shift+M'], enabled: hasRubric, run: () => { const r = currentRefs()[0]; if (r) openNote(r) } },
    { id: 'rubric.openNewTab', title: 'Open rubric in new tab', category: 'Repertory', enabled: hasRubric, run: () => { const r = currentRefs()[0]; if (r) void goToRef(r, { newTab: true }) } },
    { id: 'bookmarks.open', title: 'Bookmarks…', category: 'Repertory', keys: ['Mod+Shift+D'], run: () => actions.openDialog('repertory.bookmarks') },
  ])
}

/** Space: remedy count only → abbreviations → full names → count only. */
export function cycleDisplay() {
  const t = activeRepertoryTab()
  if (!t) return
  const s = useApp.getState().settings
  if (t.display === 'count') { actions.updateTab(t.id, { display: 'remedies' }); actions.setSettings({ remedyStyle: 'abbrev' }) }
  else if (s.remedyStyle === 'abbrev') actions.setSettings({ remedyStyle: 'name' })
  else actions.updateTab(t.id, { display: 'count' })
}
