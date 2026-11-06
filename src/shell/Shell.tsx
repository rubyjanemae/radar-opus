import { memo, startTransition, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useApp, actions } from '../state/store'
import { Splitter } from '../ui/Splitter'
import { Toasts } from '../ui/Toasts'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { MenuBar } from './MenuBar'
import { Toolbar } from './Toolbar'
import { TabStrip, TAB_PANEL_ID, tabDomId } from './TabStrip'
import { StatusBar } from './StatusBar'
import { ClipStrip, CLIP_STRIP_WIDTH } from './ClipStrip'
import { chrome, useChrome } from './chrome'
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
import { commandForEvent, eventToKeys, runCommand } from '../commands/registry'
import { focusIsLost } from '../features/workspace/panes'
import { chromeBackgroundMouseDown } from './focus'

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

/**
 * Width the desktop takes besides the panes' own widths (shell.css): the document window's right margin
 * and borders, the clipboard strip with the gaps (grips) beside it, the table of contents' margins.
 */
function desktopChrome(l: { showTree: boolean; showClipboard: boolean }, strip: boolean): number {
  const left = l.showTree ? 6 + TOC_GAP + (strip ? CLIP_STRIP_WIDTH + STRIP_GAP : 0) : (strip ? CLIP_STRIP_WIDTH + DOC_GAP : 6)
  return 4 + 2 + left + (l.showClipboard ? 8 + 2 : 0)
}
/** Desktop gaps (shell.css): table of contents → strip, strip → document (TOC open: a grip), strip → document (TOC closed). */
const TOC_GAP = 12, STRIP_GAP = 13, DOC_GAP = 15
/** With "Expand Toc" the document window keeps at least this width: a repertory's sub-toolbar at its narrowest, with room to spare. */
const EXPANDED_DOC_MIN = 640

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
  const hideBars = useChrome(c => c.hideBars)
  const tocExpanded = useChrome(c => c.tocExpanded)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    root.dataset.density = density
    root.style.fontSize = `${Math.round(13 * fontScale)}px`
    root.style.setProperty('--fs', `${Math.round(13 * fontScale)}px`)
  }, [theme, density, fontScale])

  // Next window / Previous window (Window menu) work from every document: they are taken before a
  // document's own page keys (the analysis grid, a list) can read Alt+PageDown as PageDown
  // The same for Back / Forward (Alt+←/→) from a document without its own history (the analysis):
  // the grid must not read them as plain ←/→. In a book or the materia medica their own commands win.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'PageDown' && e.key !== 'PageUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const combo = eventToKeys(e)
      if (combo !== 'Alt+PageDown' && combo !== 'Alt+PageUp' && combo !== 'Alt+ArrowLeft' && combo !== 'Alt+ArrowRight') return
      const c = commandForEvent(e, combo)
      if (!c) {
        // the history / window chord is bound but disabled here (Go forward with nothing ahead): it does
        // nothing, as the greyed toolbar button and menu item do, and never reaches a list as a plain ←/→.
        // Only a document's own keys are at stake; a text field keeps its Alt+arrow and a modal dialog its
        // keys, and elsewhere the global dispatcher claims the chord from the browser as before.
        const t = e.target as HTMLElement | null
        if (!(t instanceof HTMLElement) || !t.closest('.tab-doc')) return
        if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
        if (t.closest('[aria-modal="true"]')) return
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (c.id !== 'tab.next' && c.id !== 'tab.prev' && c.id !== 'shell.back' && c.id !== 'shell.forward') return
      e.preventDefault()
      e.stopPropagation()
      runCommand(c.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // lazily registered dialogs: fetch their chunks in idle time once the workspace is up
  useEffect(() => { preloadDialogs(PRELOAD_DIALOGS_AFTER_MS) }, [])

  const maxSide = Math.max(360, Math.floor(vw * 0.45))
  // below the saved widths the side panes shrink so the document keeps its minimum width
  // the desktop's own chrome (margins, window borders, the clipboard strip) comes off the room first
  // the clipboard pane is part of "toolbars and clipboards": hidden with them
  const showClipboard = layout.showClipboard && !hideBars
  const fit = fitSidePanes(vw - desktopChrome({ showTree: layout.showTree, showClipboard }, !hideBars), { ...layout, showClipboard })
  // "Expand Toc": the table of contents takes most of the desktop, the document keeps a readable strip
  // (wide enough that the document window's sub-toolbar, gear and help included, still fits)
  const chromeW = desktopChrome({ showTree: true, showClipboard }, !hideBars)
  const tocWidth = tocExpanded
    ? Math.max(fit.tree, Math.min(Math.floor(vw * 0.6), vw - chromeW - fit.clipboard - EXPANDED_DOC_MIN))
    : fit.tree

  return (
    // data-ready: every startup stage is mounted (end-to-end tests wait for it)
    <div className="shell" data-ready={documentMounted || undefined} data-bars={hideBars ? 'hidden' : undefined}>
      <header className="shell-header" onMouseDown={e => chromeBackgroundMouseDown(e)}>
        <DocumentHeading />
        <ErrorBoundary label="The menu bar" compact><MenuBar /></ErrorBoundary>
        {!hideBars && <ErrorBoundary label="The toolbar" compact><Toolbar /></ErrorBoundary>}
      </header>
      {/* the desktop: the table of contents, the clipboard strip and the document window on terracotta */}
      <div className="shell-main" onMouseDown={e => chromeBackgroundMouseDown(e, true)}>
        {layout.showTree && (
          <aside className="pane pane-left" style={{ width: tocWidth }} aria-label="Table of contents">
            {panesMounted && <ErrorBoundary label="The table of contents"><Navigator /></ErrorBoundary>}
            <Splitter
              orientation="vertical" label="Resize table of contents" value={tocWidth} min={MIN_TREE_WIDTH} max={Math.max(maxSide, tocWidth)}
              onChange={v => { if (chrome.get().tocExpanded) chrome.set({ tocExpanded: false }); actions.setLayout({ treeWidth: v }) }}
              onReset={() => { chrome.set({ tocExpanded: false }); actions.setLayout({ treeWidth: DEFAULT_LAYOUT.treeWidth }) }}
            />
            {/* RadarOpus has a grip on both sides of the clipboard strip: the far one resizes the table of contents too */}
            {!hideBars && (
              <Splitter
                orientation="vertical" label="Resize table of contents" value={tocWidth} min={MIN_TREE_WIDTH} max={Math.max(maxSide, tocWidth)}
                onChange={v => { if (chrome.get().tocExpanded) chrome.set({ tocExpanded: false }); actions.setLayout({ treeWidth: v }) }}
                onReset={() => { chrome.set({ tocExpanded: false }); actions.setLayout({ treeWidth: DEFAULT_LAYOUT.treeWidth }) }}
              />
            )}
          </aside>
        )}
        {!hideBars && <ErrorBoundary label="The clipboard strip" compact><ClipStrip /></ErrorBoundary>}
        <main className="pane pane-center doc-window" aria-label="Documents">
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
        {showClipboard && (
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

/**
 * The document window with nothing open: the plain window with text links that open a document (no
 * accent buttons in the RadarOpus chrome). Closing the last window leaves the keyboard on its first link.
 */
function EmptyWorkspace() {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focusIsLost()) first.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="empty-workspace">
      <h2>No window open</h2>
      <button ref={first} className="empty-link" data-autofocus
        onClick={() => actions.openTab({ kind: 'repertory', repertory: useApp.getState().settings.defaultRepertory, rubric: 0, back: [], forward: [] }, { reuse: false })}>Open repertory</button>
      <button className="empty-link" onClick={() => runCommand('repertory.toc')}>Open list of repertories</button>
      <button className="empty-link" onClick={() => runCommand('mm.open')}>Open list of references</button>
      <button className="empty-link" onClick={() => runCommand('patients.open')}>Open list of patients</button>
    </div>
  )
}
