import type { Catalog } from '../data/catalog'
import type { AppState } from '../state/store'
import type { Tab } from '../state/workspace'
import { patientName } from '../features/patients/logic'

export function tabTitle(tab: Tab, catalog: Catalog, s: Pick<AppState, 'patients' | 'consultations'>): { title: string; subtitle?: string } {
  switch (tab.kind) {
    case 'repertory': {
      const rep = catalog.repertory(tab.repertory)
      const info = catalog.repertoryInfos.find(r => r.abbrev === tab.repertory)
      if (!rep) return { title: info?.title ?? tab.repertory }
      return { title: rep.text(rep.chapterRoot(tab.rubric)), subtitle: info?.title }
    }
    case 'repertories':
      return { title: 'Repertories', subtitle: 'Table of contents' }
    case 'analysis': {
      const c = s.consultations[tab.consultationId]
      const p = c ? s.patients[c.patientId] : null
      // the case is what tells two analysis tabs apart: it leads, the kind follows (the icon shows it too)
      if (!c || !p) return { title: 'Missing case', subtitle: 'Analysis' }
      return { title: `${p.lastName.trim() || p.firstName.trim() || 'Unnamed patient'} · ${c.title}`, subtitle: 'Analysis' }
    }
    case 'materia-medica':
      // short: the open remedy's abbreviation, not its full name (which is in the reader header and the tooltip)
      return { title: 'Materia medica', subtitle: tab.remedyId != null ? catalog.remedy(tab.remedyId).abbrev : undefined }
    case 'remedy':
      return { title: catalog.remedy(tab.remedyId).abbrev, subtitle: catalog.remedy(tab.remedyId).name }
    case 'patients':
      return { title: 'Patients' }
    case 'patient': {
      const p = s.patients[tab.patientId]
      return { title: p ? patientName(p) : 'Deleted patient' }
    }
    case 'search':
      if (tab.mode === 'remedy') return tab.remedyId != null ? { title: catalog.remedy(tab.remedyId).abbrev, subtitle: 'Remedy search' } : { title: 'Remedy search' }
      return tab.query ? { title: `“${tab.query}”`, subtitle: 'Search' } : { title: 'Search' }
    case 'families':
      return { title: 'Families & kingdoms' }
  }
}

/**
 * A case document's title ("Keller · Follow-up 3") truncates in the middle: the patient name gives up
 * width first, so the consultation and the kind label after it ("Analysis") stay readable.
 */
export function splitTabTitle(kind: Tab['kind'], title: string): [string, string] | null {
  if (kind !== 'analysis') return null
  const i = title.indexOf(' · ')
  // the tail's leading space is a no-break space: a flex item drops ordinary leading whitespace
  return i > 0 ? [title.slice(0, i), `\u00a0·\u00a0${title.slice(i + 3)}`] : null
}
