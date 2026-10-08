import { memo, startTransition, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { useApp, actions } from '../state/store'
import { Splitter } from '../ui/Splitter'
import { Toasts } from '../ui/Toasts'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { MenuBar } from './MenuBar'
import { Toolbar } from './Toolbar'
import { TabStrip, TAB_PANEL_ID, tabDomId } from './TabStrip'
import { StatusBar } from './StatusBar'
import { TabDeck } from './TabHost'
import { tabTitle } from './tabTitle'
import { Navigator as NavigatorView } from '../features/repertory/Navigator'
import { ClipboardPanel as ClipboardPanelView } from '../features/clipboard/ClipboardPanel'
import { CommandPalette } from '../features/command/CommandPalette'
import { DEFAULT_LAYOUT } from '../state/workspace'
import { DialogHost } from './DialogHost'
import { preloadDialogs } from './dialogs'
import { lazyRetry } from '../ui/lazyRetry'
import { WorkspaceChrome as WorkspaceChromeView } from '../features/workspace/WorkspaceChrome'
import { fitSidePanes, MIN_CLIPBOARD_WIDTH, MIN_TREE_WIDTH } from '../features/workspace/responsive'
import { useCatalog } from '../data/CatalogContext'

// The panes take no props: memo keeps shell re-renders (layout drags, window resizes) from re-rendering
// them; each re-renders only on the store slices it subscribes to itself.
const Navigator = memo(NavigatorView)
const ClipboardPanel = memo(ClipboardPanelView)
// the analysis preview dock (hidden by default) brings the analysis grid: its own chunk, loaded when shown
const AnalysisDock = memo(lazyRetry(() => import('../features/analysis/AnalysisDock'), m => m.AnalysisDock))
const WorkspaceChrome = memo(WorkspaceChromeView)

/** Startup's idle work (word and remedy indexes, row estimates) runs first; then dialog chunks load. */
const PRELOAD_DIALOGS_AFTER_MS = 1500

const subscribeResize = (fn: () => void) => { window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn) }
const viewportWidth = () => window.innerWidth
const viewportHeight = () => window.innerHeight

/** Visually hidden page heading naming the app and the open document (for screen-reader navigation). */
const DocumentHeading = memo(function DocumentHeading() {
  const catalog = useCatalog()
  const title = useApp(s => {
    const t = s.tabs.find(x => x.id === s.activeTabId)
    return t ? tabTitle(t, catalog, s).title : null
  })
  useEffect(() => { document.title = title ? `${title} · Radar Opus` : 'Radar Opus' }, [title])
  return <h1 className="sr-only">Radar Opus{title ? `: ${title}` : ''}</h1>
})

/** Startup mount stage: 0 chrome, 1 side panes, 2 document. Advances one task at a time, once per page. */
let startupStage = 0
function useStartupStage(): number {
  const [stage, setStage] = useState(startupStage)
  useEffect(() => {
    if (stage >= 2) return
    const t = setTimeout(() => startTransition(() => { startupStage = Math.max(startupStage, stage + 1); setStage(startupStage) }), 0)
    return () => clearTimeout(t)
  }, [stage])
  return stage
}

export function Shell() {
  const layout = useApp(s => s.layout)
  const theme = useApp(s => s.settings.theme)
  const density = useApp(s => s.settings.density)
  const fontScale = useApp(s => s.settings.fontScale)
  const activeTabId = useApp(s => s.activeTabId)
  // the analysis preview dock steps aside while an analysis tab is visible (it would only repeat it)
  const analysisVisible = useApp(s => s.tabs.find(x => x.id === s.activeTabId)?.kind === 'analysis')
  const paletteOpen = useApp(s => s.commandPaletteOpen)
  // startup mounts in three renders, each its own task: the window chrome, then the side panes, then
  // the open document, so the app's first layout is split instead of one long task (each deferred
  // render follows at once; the pane frames keep their size meanwhile, so nothing shifts)
  const stage = useStartupStage()
  const panesMounted = stage >= 1, documentMounted = stage >= 2
  const vw = useSyncExternalStore(subscribeResize, viewportWidth, () => 1440)
  const vh = useSyncExternalStore(subscribeResize, viewportHeight, () => 900)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    root.dataset.density = density
    root.style.fontSize = `${Math.round(13 * fontScale)}px`
    root.style.setProperty('--fs', `${Math.round(13 * fontScale)}px`)
  }, [theme, density, fontScale])

  // lazily registered dialogs: fetch their chunks in idle time once the workspace is up
  useEffect(() => { preloadDialogs(PRELOAD_DIALOGS_AFTER_MS) }, [])

  const maxSide = Math.max(360, Math.floor(vw * 0.45))
  // below the saved widths the side panes shrink so the document keeps its minimum width
  const fit = fitSidePanes(vw, layout)

  return (
    // data-ready: every startup stage is mounted (end-to-end tests wait for it)
    <div className="shell" data-ready={documentMounted || undefined}>
      <header className="shell-header">
        <DocumentHeading />
        <ErrorBoundary label="The menu bar" compact><MenuBar /></ErrorBoundary>
        <ErrorBoundary label="The toolbar" compact><Toolbar /></ErrorBoundary>
      </header>
      <div className="shell-main">
        {layout.showTree && (
          <aside className="pane pane-left" style={{ width: fit.tree }} aria-label="Repertory navigator">
            {panesMounted && <ErrorBoundary label="The navigator"><Navigator /></ErrorBoundary>}
            <Splitter
              orientation="vertical" label="Resize navigator" value={fit.tree} min={MIN_TREE_WIDTH} max={maxSide}
              onChange={v => actions.setLayout({ treeWidth: v })} onReset={() => actions.setLayout({ treeWidth: DEFAULT_LAYOUT.treeWidth })}
            />
          </aside>
        )}
        <main className="pane pane-center" aria-label="Documents">
          <TabStrip />
          <div className="pane-center-body">
            <div
              className="tab-content"
              id={TAB_PANEL_ID}
              role={activeTabId ? 'tabpanel' : undefined}
              aria-labelledby={activeTabId ? tabDomId(activeTabId) : undefined}
            >
              {activeTabId ? (documentMounted && <TabDeck activeTabId={activeTabId} />) : <EmptyWorkspace />}
            </div>
            {layout.showAnalysisDock && !analysisVisible && (
              <>
                <Splitter
                  orientation="horizontal" label="Resize analysis dock" value={layout.analysisHeight} min={120} max={Math.floor(vh * 0.7)}
                  direction={-1} onChange={v => actions.setLayout({ analysisHeight: v })} onReset={() => actions.setLayout({ analysisHeight: DEFAULT_LAYOUT.analysisHeight })}
                />
                <section className="analysis-dock" style={{ height: layout.analysisHeight }} aria-label="Analysis preview">
                  <ErrorBoundary label="The analysis preview"><Suspense fallback={null}><AnalysisDock /></Suspense></ErrorBoundary>
                </section>
              </>
            )}
          </div>
        </main>
        {layout.showClipboard && (
          <aside className="pane pane-right" style={{ width: fit.clipboard }} aria-label="Clipboards">
            <Splitter
              orientation="vertical" label="Resize clipboard panel" value={fit.clipboard} min={MIN_CLIPBOARD_WIDTH} max={maxSide} direction={-1}
              onChange={v => actions.setLayout({ clipboardWidth: v })} onReset={() => actions.setLayout({ clipboardWidth: DEFAULT_LAYOUT.clipboardWidth })}
            />
            {panesMounted && <ErrorBoundary label="The clipboards"><ClipboardPanel /></ErrorBoundary>}
          </aside>
        )}
      </div>
      <ErrorBoundary label="The status bar" compact><StatusBar /></ErrorBoundary>
      {paletteOpen && <ErrorBoundary label="The command palette" fallback={() => null} onError={e => { actions.setCommandPalette(false); actions.toast(`The command palette hit an error: ${e.message}`, 'error') }}><CommandPalette onClose={() => actions.setCommandPalette(false)} /></ErrorBoundary>}
      <SafeDialogHost />
      <ErrorBoundary label="The workspace chrome" fallback={() => null} onError={e => actions.toast(`The welcome tour hit an error: ${e.message}`, 'error')}><WorkspaceChrome /></ErrorBoundary>
      <Toasts />
    </div>
  )
}

/** The dialog host behind its own boundary; the next dialog opened clears a previous failure. */
function SafeDialogHost() {
  const dialog = useApp(s => s.dialog)
  return (
    <ErrorBoundary label="The dialog host" resetKey={dialog} fallback={() => null}
      onError={e => { actions.closeDialog(); actions.toast(`A dialog hit an error: ${e.message}`, 'error') }}>
      <DialogHost />
    </ErrorBoundary>
  )
}

function EmptyWorkspace() {
  return (
    <div className="empty-workspace">
      <div className="empty-mark" aria-hidden="true">R</div>
      <h2>No document open</h2>
      <p>Open a repertory, a patient or the materia medica to begin.</p>
      <div className="empty-actions">
        <button className="btn btn-primary" data-autofocus onClick={() => actions.openTab({ kind: 'repertory', repertory: useApp.getState().settings.defaultRepertory, rubric: 0, back: [], forward: [] }, { reuse: false })}>Open repertory</button>
        <button className="btn" onClick={() => actions.openTab({ kind: 'patients' })}>Patients</button>
        <button className="btn" onClick={() => actions.setCommandPalette(true)}>Command palette</button>
      </div>
    </div>
  )
}
