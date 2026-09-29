import { Suspense, lazy, useEffect } from 'react'
import { useApp } from '../state/store'
import { RepertoryView } from '../features/repertory/RepertoryView'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { focusDocument, focusIsLost } from '../features/workspace/panes'
import { TAB_PANEL_ID } from './TabStrip'

// The repertory is the start page and stays in the main bundle; every other document kind loads on first use.
const RepertoriesView = lazy(() => import('../features/repertory/RepertoriesView').then(m => ({ default: m.RepertoriesView })))
const AnalysisView = lazy(() => import('../features/analysis/AnalysisView').then(m => ({ default: m.AnalysisView })))
const MateriaMedicaView = lazy(() => import('../features/mm/MateriaMedicaView').then(m => ({ default: m.MateriaMedicaView })))
const RemedyView = lazy(() => import('../features/mm/RemedyView').then(m => ({ default: m.RemedyView })))
const PatientsView = lazy(() => import('../features/patients/PatientsView').then(m => ({ default: m.PatientsView })))
const PatientView = lazy(() => import('../features/patients/PatientView').then(m => ({ default: m.PatientView })))
const SearchView = lazy(() => import('../features/search/SearchView').then(m => ({ default: m.SearchView })))
const FamiliesView = lazy(() => import('../features/families/FamiliesView').then(m => ({ default: m.FamiliesView })))

/** Placeholder while a document's code loads. */
function DocumentSkeleton() {
  return (
    <div className="doc-skeleton" role="status" aria-label="Loading document">
      <div className="skeleton" style={{ width: '38%', height: 14 }} />
      <div className="skeleton" style={{ width: '72%', height: 10 }} />
      <div className="skeleton" style={{ width: '64%', height: 10 }} />
      <div className="skeleton" style={{ width: '69%', height: 10 }} />
    </div>
  )
}

/**
 * Renders one tab's document. Subscribes to its own tab only, so a change in another tab (or in the
 * shell) does not re-render it. When focus was lost (the previous document was closed), focus moves
 * into this document once it has rendered.
 */
export function TabHost({ tabId }: { tabId: string }) {
  const tab = useApp(s => s.tabs.find(t => t.id === tabId) ?? null)

  useEffect(() => {
    // wait for lazy content (a few frames at most); give up as soon as something else takes focus
    let frames = 0
    let raf = 0
    const tick = () => {
      if (!focusIsLost()) return
      const el = document.getElementById(TAB_PANEL_ID)
      const ready = el && !el.querySelector('.doc-skeleton') && el.childElementCount > 0
      if (ready) { focusDocument(); return }
      if (++frames < 60) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tabId])

  if (!tab) return null
  return (
    <ErrorBoundary label="This document">
      <Suspense fallback={<DocumentSkeleton />}>
        {tab.kind === 'repertory' && <RepertoryView tab={tab} />}
        {tab.kind === 'repertories' && <RepertoriesView tab={tab} />}
        {tab.kind === 'analysis' && <AnalysisView tab={tab} />}
        {tab.kind === 'materia-medica' && <MateriaMedicaView tab={tab} />}
        {tab.kind === 'remedy' && <RemedyView tab={tab} />}
        {tab.kind === 'patients' && <PatientsView />}
        {tab.kind === 'patient' && <PatientView tab={tab} />}
        {tab.kind === 'search' && <SearchView tab={tab} />}
        {tab.kind === 'families' && <FamiliesView tab={tab} />}
      </Suspense>
    </ErrorBoundary>
  )
}
