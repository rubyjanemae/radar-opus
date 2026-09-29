import type { Catalog } from '../data/catalog'
import type { AppState } from '../state/store'
import type { Tab } from '../state/workspace'

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
      return { title: 'Analysis', subtitle: p ? `${p.lastName} · ${c!.title}` : 'Missing case' }
    }
    case 'materia-medica':
      return { title: 'Materia Medica', subtitle: tab.remedyId != null ? catalog.remedy(tab.remedyId).name : undefined }
    case 'remedy':
      return { title: catalog.remedy(tab.remedyId).abbrev, subtitle: catalog.remedy(tab.remedyId).name }
    case 'patients':
      return { title: 'Patients' }
    case 'patient': {
      const p = s.patients[tab.patientId]
      return { title: p ? `${p.lastName}, ${p.firstName}` : 'Deleted patient' }
    }
    case 'search':
      if (tab.mode === 'remedy') return tab.remedyId != null ? { title: catalog.remedy(tab.remedyId).abbrev, subtitle: 'Remedy search' } : { title: 'Remedy search' }
      return { title: tab.query ? `“${tab.query}”` : 'Search', subtitle: 'Search' }
    case 'families':
      return { title: 'Families & kingdoms' }
  }
}
