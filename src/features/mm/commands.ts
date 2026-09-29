import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions } from '../../state/store'
import { registerDialog } from '../../shell/dialogs'
import type { DialogComponent } from '../../shell/dialogs'
import { registerRubricSource } from '../repertory/ops'
import { bookIfLoaded, loadBook } from './book'
import { activeMMTab, activeRemedyTab, canHistory, contextRemedy, historyMove, openMM, openRemedy, printMonograph, setMMCatalog, toggleList, toggleShowAbbrevs, useMMUi } from './ops'
import { RemedyPickerDialog } from './RemedyPicker'
import { selectedRemedyRubric } from './RemedyView'

export const REMEDY_PICKER = 'mm.remedyPicker'

export function register(catalog: Catalog) {
  setMMCatalog(catalog)
  registerDialog(REMEDY_PICKER, RemedyPickerDialog as unknown as DialogComponent)
  registerRubricSource('remedy', () => (selectedRemedyRubric ? [selectedRemedyRubric] : null))
  // warm the book in the background so MM and remedy windows open instantly
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
  idle(() => { void loadBook(catalog).catch(() => { /* the view shows the error and a retry */ }) })

  const hasMonograph = () => { const id = contextRemedy(); return id != null && !!bookIfLoaded(catalog)?.has(id) }

  registerCommands([
    {
      id: 'mm.open', title: 'Materia medica', category: 'Tools', keys: ['Mod+2'], keywords: 'references boericke book library reader',
      run: () => {
        const t = activeRemedyTab()
        openMM(t && bookIfLoaded(catalog)?.has(t.remedyId) ? t.remedyId : undefined)
      },
    },
    {
      id: 'mm.search', title: 'Search materia medica…', category: 'Tools', keys: ['Mod+Alt+M'], allowInInput: true, keywords: 'full text boericke find words',
      run: () => openMM(undefined, { focusSearch: true }),
    },
    {
      id: 'remedy.open', title: 'Remedies…', category: 'Tools', keys: ['Mod+4'], allowInInput: true, keywords: 'remedy list information picker lookup riw',
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
      id: 'mm.print', title: 'Print monograph…', category: 'File', keys: ['Mod+P'], allowInInput: true,
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
    {
      id: 'mm.back', title: 'Back (materia medica)', category: 'Tools', keys: ['Alt+ArrowLeft'], hidden: true,
      enabled: () => canHistory(activeMMTab()?.id, -1), run: () => { const t = activeMMTab(); if (t) historyMove(t.id, -1) },
    },
    {
      id: 'mm.forward', title: 'Forward (materia medica)', category: 'Tools', keys: ['Alt+ArrowRight'], hidden: true,
      enabled: () => canHistory(activeMMTab()?.id, 1), run: () => { const t = activeMMTab(); if (t) historyMove(t.id, 1) },
    },
  ])
}
