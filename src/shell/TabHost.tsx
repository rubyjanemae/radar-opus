import type { Tab } from '../state/workspace'
import { RepertoryView } from '../features/repertory/RepertoryView'
import { RepertoriesView } from '../features/repertory/RepertoriesView'
import { AnalysisView } from '../features/analysis/AnalysisView'
import { MateriaMedicaView } from '../features/mm/MateriaMedicaView'
import { RemedyView } from '../features/mm/RemedyView'
import { PatientsView } from '../features/patients/PatientsView'
import { PatientView } from '../features/patients/PatientView'
import { SearchView } from '../features/search/SearchView'
import { FamiliesView } from '../features/families/FamiliesView'
import { ErrorBoundary } from '../ui/ErrorBoundary'

export function TabHost({ tab }: { tab: Tab }) {
  return (
    <ErrorBoundary label="This document">
      {tab.kind === 'repertory' && <RepertoryView tab={tab} />}
      {tab.kind === 'repertories' && <RepertoriesView tab={tab} />}
      {tab.kind === 'analysis' && <AnalysisView tab={tab} />}
      {tab.kind === 'materia-medica' && <MateriaMedicaView tab={tab} />}
      {tab.kind === 'remedy' && <RemedyView tab={tab} />}
      {tab.kind === 'patients' && <PatientsView />}
      {tab.kind === 'patient' && <PatientView tab={tab} />}
      {tab.kind === 'search' && <SearchView tab={tab} />}
      {tab.kind === 'families' && <FamiliesView tab={tab} />}
    </ErrorBoundary>
  )
}
