import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions } from '../../state/store'
import { registerLazyDialog } from '../../shell/dialogs'
import { registerRubricSource } from '../repertory/ops'
import { bookIfLoaded, loadBook } from './book'
import { activeMMTab, activeRemedyTab, canHistory, contextRemedy, historyMove, installTabStateCleanup, keepMMFocus, openMM, openRemedy, printMonograph, selectedRemedyRubric, setMMCatalog, toggleList, toggleShowAbbrevs, useMMUi } from './ops'
import { warmRemedyIndex } from './remedyIndexAccess'

export const REMEDY_PICKER = 'mm.remedyPicker'

export function register(catalog: Catalog) {
  setMMCatalog(catalog)
  registerLazyDialog(REMEDY_PICKER, () => import('./RemedyPicker'), m => m.RemedyPickerDialog)
  installTabStateCleanup()
  registerRubricSource('remedy', () => { const ref = selectedRemedyRubric(); return ref ? [ref] : null })
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
  // remedy → rubric indexes (remedy window counts, F5 remedy search) are built in idle time after a
  // repertory loads; the index module itself is imported then too, not at startup
  catalog.onRepertoryLoaded(rep => idle(() => { void warmRemedyIndex(rep).catch(() => {}) }))
  // download (not parse) the book while idle; it is parsed on first need (MM tab, remedy window, picker)
  if (typeof window !== 'undefined') idle(() => catalog.prefetchMateriaMedica())

  const hasMonograph = () => { const id = contextRemedy(); return id != null && !!bookIfLoaded(catalog)?.has(id) }

  registerCommands([
    {
      // Alt+1..9 select clipboards, so the browser-safe alternates (Ctrl+digit switches browser tabs) add Shift
      id: 'mm.open', title: 'Materia medica', category: 'Tools', keys: ['Mod+2', 'Alt+Shift+2'], allowInInput: true, keywords: 'references boericke book library reader',
      run: () => {
        const t = activeRemedyTab()
        if (!t) { openMM(); return }
        // the book may not be parsed yet: open the monograph of the remedy in view once it is
        void loadBook(catalog).then(b => openMM(b.has(t.remedyId) ? t.remedyId : undefined), () => openMM())
      },
    },
    {
      id: 'mm.search', title: 'Search materia medica…', category: 'Tools', keys: ['Mod+Alt+M'], allowInInput: true, keywords: 'full text boericke find words',
      run: () => openMM(undefined, { focusSearch: true }),
    },
    {
      id: 'remedy.open', title: 'Remedies…', category: 'Tools', keys: ['Mod+4', 'Alt+Shift+4'], allowInInput: true, keywords: 'remedy list information picker lookup riw',
      run: () => actions.openDialog(REMEDY_PICKER),
    },
    {
      id: 'mm.openRemedyInMM', title: 'Read remedy in materia medica', category: 'Tools', keywords: 'boericke monograph',
      enabled: () => !!activeRemedyTab() && hasMonograph(), run: () => { const id = contextRemedy(); if (id != null) openMM(id) },
    },
    {
      id: 'mm.remedyInfo', title: 'Remedy information', category: 'Tools', keywords: 'riw remedy window',
      enabled: () => !!activeMMTab()?.remedyId, run: () => { const id = contextRemedy(); if (id != null) openRemedy(id) },
    },
    {
      id: 'mm.print', title: 'Print monograph…', category: 'File', keys: ['Mod+P'], scopeLabel: 'in the materia medica', allowInInput: true,
      enabled: () => (!!activeMMTab() || !!activeRemedyTab()) && hasMonograph(), run: () => { const id = contextRemedy(); if (id != null) void printMonograph(id) },
    },
    {
      id: 'mm.toggleAbbrevs', title: 'Show remedy abbreviations in text', category: 'View', keywords: 'materia medica links abbreviation space',
      enabled: () => !!activeMMTab(), checked: () => useMMUi.getState().showAbbrevs, run: toggleShowAbbrevs,
    },
    {
      id: 'mm.toggleList', title: 'Show remedy list (materia medica)', category: 'View', keywords: 'materia medica side panel index hide',
      enabled: () => !!activeMMTab(), checked: () => !useMMUi.getState().listHidden, run: toggleList,
    },
    // Alt+←/→ while focus is in the materia medica view (nav.back/forward serve the repertory);
    // scoped so they never compete with the global bindings elsewhere
    {
      id: 'mm.back', title: 'Back (materia medica)', category: 'Tools', keys: ['Alt+ArrowLeft'], scope: '.mm-view', scopeLabel: 'in the materia medica',
      enabled: () => canHistory(activeMMTab()?.id, -1), run: () => { const t = activeMMTab(); if (t) keepMMFocus(() => historyMove(t.id, -1)) },
    },
    {
      id: 'mm.forward', title: 'Forward (materia medica)', category: 'Tools', keys: ['Alt+ArrowRight'], scope: '.mm-view', scopeLabel: 'in the materia medica',
      enabled: () => canHistory(activeMMTab()?.id, 1), run: () => { const t = activeMMTab(); if (t) keepMMFocus(() => historyMove(t.id, 1)) },
    },
  ])
}
