import { Activity, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { actions, useApp } from '../state/store'
import type { AnalysisTab } from '../state/workspace'
import { RepertoryView } from '../features/repertory/RepertoryView'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { lazyRetry } from '../ui/lazyRetry'
import { focusDocument, focusIsLost } from '../features/workspace/panes'
import { TAB_PANEL_ID } from './TabStrip'

// The repertory is the start page and stays in the main bundle; every other document kind loads on first use.
// lazyRetry: a failed chunk import is retried by the error boundary's Retry instead of failing for good.
const RepertoriesView = lazyRetry(() => import('../features/repertory/RepertoriesView'), m => m.RepertoriesView)
const AnalysisView = lazyRetry(() => import('../features/analysis/AnalysisView'), m => m.AnalysisView)
const MateriaMedicaView = lazyRetry(() => import('../features/mm/MateriaMedicaView'), m => m.MateriaMedicaView)
const RemedyView = lazyRetry(() => import('../features/mm/RemedyView'), m => m.RemedyView)
const PatientsView = lazyRetry(() => import('../features/patients/PatientsView'), m => m.PatientsView)
const PatientView = lazyRetry(() => import('../features/patients/PatientView'), m => m.PatientView)
const SearchView = lazyRetry(() => import('../features/search/SearchView'), m => m.SearchView)
const MapsView = lazyRetry(() => import('../features/maps/MapsView'), m => m.MapsView)
const FamiliesView = lazyRetry(() => import('../features/families/FamiliesView'), m => m.FamiliesView)

/**
 * The analysis is the next document most sessions open (F8): its code loads in idle time after start-up,
 * so the first F8 renders at once instead of showing the loading skeleton while the chunk arrives.
 */
function preloadAnalysisWhenIdle() {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (w.requestIdleCallback) {
    const h = w.requestIdleCallback(() => void AnalysisView.preload(), { timeout: 3000 })
    return () => w.cancelIdleCallback?.(h)
  }
  const t = setTimeout(() => void AnalysisView.preload(), 1500)
  return () => clearTimeout(t)
}

/** How many recently visited documents stay mounted (the active one included). */
export const KEEP_MOUNTED = 3

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

/** The visible document's wrapper inside the tab panel. */
export const activeDocumentElement = (root: Document = document) =>
  root.querySelector<HTMLElement>(`#${TAB_PANEL_ID} > .tab-doc[data-active]`)

/** Focus still sits in a document that was just hidden (the browser has not moved it to <body> yet). */
const focusInHiddenDocument = () => !!document.activeElement?.closest(`#${TAB_PANEL_ID} > .tab-doc:not([data-active])`)

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && !el.closest('[inert]')

/**
 * The document's main list or grid (rubric list, search results, analysis grid, patient list): a view
 * may mark it with `data-main-focus`; otherwise the largest focusable grid, list, tree or table.
 */
export function mainFocusTarget(doc: HTMLElement): HTMLElement | null {
  const marked = [...doc.querySelectorAll<HTMLElement>('[data-main-focus]')].find(visible)
  if (marked) return marked
  let best: HTMLElement | null = null
  let area = 0
  for (const el of doc.querySelectorAll<HTMLElement>('[role="grid"], [role="treegrid"], [role="listbox"], [role="tree"], [role="table"], [role="list"]')) {
    if (!visible(el)) continue
    // the list itself when it takes focus, else its roving item
    const target = el.hasAttribute('tabindex') && el.tabIndex >= 0 ? el
      : el.querySelector<HTMLElement>('[tabindex="0"]')
    if (!target || !visible(target)) continue
    const r = el.getBoundingClientRect()
    if (r.width * r.height > area) { area = r.width * r.height; best = target }
  }
  return best
}

/** Focus the visible document's main list or grid (or its best focus target). */
export function focusActiveDocument(): HTMLElement | null {
  const doc = activeDocumentElement()
  const main = doc && mainFocusTarget(doc)
  if (main) { main.focus({ preventScroll: true }); return main }
  return focusDocument()
}

/**
 * The current focusDocumentWhenReady run: a newer run or cancelDocumentFocus ends the older one.
 * It polls on a timer, not on animation frames: a browser draws no frames while nothing changes on
 * screen (a headless or occluded window), and the wait must not depend on that.
 */
let run = 0
/** Stop a pending focusDocumentWhenReady (keyboard navigation in the tab strip keeps focus on the tabs). */
export function cancelDocumentFocus() { run++ }

/** The element a pending run should focus in its document (see focusDocumentWhenReady's `prefer`). */
let preferred: { tabId: string | null; el: HTMLElement } | null = null

const POLL_MS = 16
/** How long a rendered document without its main list yet waits for it, and how long a run lasts. */
const MAIN_WAIT_MS = 500, GIVE_UP_MS = 1500

/**
 * Move focus into the visible document as soon as it has rendered (its code or its data may still be
 * loading): its main list when that appears within about half a second, else its best focus target.
 * Gives up when something else takes focus or another tab is activated meanwhile, or after 1.5 s.
 * `prefer`: an element of that document to focus instead (where the keyboard was when it was left).
 */
export function focusDocumentWhenReady(prefer: HTMLElement | null = null) {
  const mine = ++run
  const start = document.activeElement
  const tabId = useApp.getState().activeTabId
  // a later run for the same document (the tab host's own, on activation) keeps the preferred element
  if (prefer) preferred = { tabId, el: prefer }
  else if (preferred?.tabId !== tabId) preferred = null
  const t0 = performance.now()
  const tick = () => {
    if (mine !== run) return
    const a = document.activeElement
    if ((!focusIsLost() && !focusInHiddenDocument() && a !== start) || useApp.getState().activeTabId !== tabId) return
    const waited = performance.now() - t0
    const el = activeDocumentElement()
    const ready = el && !el.querySelector('.doc-skeleton') && el.childElementCount > 0 && el.textContent !== ''
    if (ready) {
      const want = preferred?.tabId === tabId ? preferred.el : null
      preferred = null
      if (want && want.isConnected && el.contains(want) && visible(want)) { want.focus({ preventScroll: true }); return }
      // results that load after the view (a search, an analysis) are worth a short wait
      const main = mainFocusTarget(el)
      if (main) { main.focus({ preventScroll: true }); return }
      if (waited >= MAIN_WAIT_MS) { focusDocument(); return }
    }
    if (waited < GIVE_UP_MS) setTimeout(tick, POLL_MS)
    else if (focusIsLost()) focusDocument()
  }
  setTimeout(tick, 0)
}

/**
 * The open documents: the active one plus the last few visited stay mounted, hidden with React's
 * <Activity>, so switching back to a tab shows it at once with its state (scroll, selection, loaded
 * data) instead of mounting it again. Hidden documents are `display: none` and inert, and their effects
 * (window key handlers, timers) are cleaned up until they are shown again.
 */
export function TabDeck({ activeTabId }: { activeTabId: string }) {
  const tabIds = useApp(s => s.tabs.map(t => t.id).join('\n'))
  const [recent, setRecent] = useState<string[]>([activeTabId])
  const live = new Set(tabIds.split('\n'))
  // most recent first; the active tab always leads so it is the first match of any DOM query
  const kept = [activeTabId, ...recent.filter(id => id !== activeTabId && live.has(id))].slice(0, KEEP_MOUNTED)
  const keptKey = kept.join('\n')
  useLayoutEffect(() => {
    setRecent(r => (r.join('\n') === keptKey ? r : keptKey.split('\n')))
  }, [keptKey])

  return (
    <>
      {kept.map(id => {
        const active = id === activeTabId
        // the wrapper sits outside <Activity> so hiding it (display:none, inert) never waits for the hidden tree
        return (
          <div key={id} className="tab-doc" data-tab-doc={id} data-active={active ? '' : undefined} inert={!active}>
            <Activity mode={active ? 'visible' : 'hidden'}>
              <TabHost tabId={id} />
            </Activity>
          </div>
        )
      })}
    </>
  )
}

/**
 * Renders one tab's document. Subscribes to its own tab only, so a change in another tab (or in the
 * shell) does not re-render it. When it is shown and focus was lost (the previous document was closed
 * or hidden), focus moves into its main list once it has rendered.
 */
export function TabHost({ tabId }: { tabId: string }) {
  const tab = useApp(s => s.tabs.find(t => t.id === tabId) ?? null)
  useEffect(preloadAnalysisWhenIdle, [])
  // a window restored under its saved title takes its live title once shown (tabTitle.ts)
  const restored = tab?.kind === 'analysis' && !!tab.restoredTitle
  useEffect(() => { if (restored) actions.updateTab<AnalysisTab>(tabId, { restoredTitle: undefined }) }, [restored, tabId])

  // runs on mount and each time <Activity> shows the document again
  useEffect(() => {
    if (focusIsLost() || focusInHiddenDocument()) focusDocumentWhenReady()
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
        {tab.kind === 'maps' && <MapsView tab={tab} />}
      </Suspense>
    </ErrorBoundary>
  )
}
