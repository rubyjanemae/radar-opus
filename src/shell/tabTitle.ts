import type { Catalog } from '../data/catalog'
import type { AppState } from '../state/store'
import type { Tab } from '../state/workspace'
import { patientName } from '../features/patients/logic'

/** "Vladimir Polony" -> "POLONY V.", "J. T. Kent" -> "KENT J. T." (surname in capitals, then initials). */
export function authorShort(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return author.trim().toUpperCase()
  const last = parts[parts.length - 1]
  const initials = parts.slice(0, -1).map(p => (p.endsWith('.') ? p : `${p[0]}.`)).join(' ')
  return `${last.toUpperCase()} ${initials}`
}

export function tabTitle(tab: Tab, catalog: Catalog, s: Pick<AppState, 'patients' | 'consultations'>): { title: string; subtitle?: string } {
  switch (tab.kind) {
    case 'repertory': {
      // the book, as RadarOpus titles a document window ("Title (AUTHOR I.)"); the chapter follows
      const rep = catalog.repertory(tab.repertory)
      const info = catalog.repertoryInfos.find(r => r.abbrev === tab.repertory)
      const book = info ? `${info.title}${info.author ? ` (${authorShort(info.author)})` : ''}` : tab.repertory
      if (!rep) return { title: book }
      return { title: book, subtitle: rep.text(rep.chapterRoot(tab.rubric)) }
    }
    case 'repertories':
      return { title: 'Repertories', subtitle: 'Table of contents' }
    case 'analysis': {
      const c = s.consultations[tab.consultationId]
      const p = c ? s.patients[c.patientId] : null
      // the case is what tells two analysis tabs apart: it leads, the kind follows (the icon shows it too)
      if (!c || !p) return { title: 'Missing case', subtitle: 'Analysis' }
      const who = p.lastName.trim() || p.firstName.trim() || 'Unnamed patient'
      // an unsaved case's patient and consultation share one name: say it once
      return { title: c.title && c.title !== who ? `${who} · ${c.title}` : who, subtitle: 'Analysis' }
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
