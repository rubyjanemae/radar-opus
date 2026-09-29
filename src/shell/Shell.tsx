import { useEffect } from 'react'
import { useApp, actions, selectActiveTab } from '../state/store'
import { Splitter } from '../ui/Splitter'
import { Toasts } from '../ui/Toasts'
import { MenuBar } from './MenuBar'
import { Toolbar } from './Toolbar'
import { TabStrip } from './TabStrip'
import { StatusBar } from './StatusBar'
import { TabHost } from './TabHost'
import { Navigator } from '../features/repertory/Navigator'
import { ClipboardPanel } from '../features/clipboard/ClipboardPanel'
import { AnalysisDock } from '../features/analysis/AnalysisDock'
import { CommandPalette } from '../features/command/CommandPalette'
import { DEFAULT_LAYOUT } from '../state/workspace'
import { DialogHost } from './DialogHost'
import { WorkspaceChrome } from '../features/workspace/WorkspaceChrome'

export function Shell() {
  const layout = useApp(s => s.layout)
  const settings = useApp(s => s.settings)
  const activeTab = useApp(selectActiveTab)
  const paletteOpen = useApp(s => s.commandPaletteOpen)

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.dataset.density = settings.density
    root.style.fontSize = `${Math.round(13 * settings.fontScale)}px`
    root.style.setProperty('--fs', `${Math.round(13 * settings.fontScale)}px`)
  }, [settings.theme, settings.density, settings.fontScale])

  const maxSide = Math.max(360, Math.floor(window.innerWidth * 0.45))

  return (
    <div className="shell">
      <MenuBar />
      <Toolbar />
      <div className="shell-main">
        {layout.showTree && (
          <>
            <aside className="pane pane-left" style={{ width: layout.treeWidth }} aria-label="Repertory navigator">
              <Navigator />
            </aside>
            <Splitter
              orientation="vertical" label="Resize navigator" value={layout.treeWidth} min={180} max={maxSide}
              onChange={v => actions.setLayout({ treeWidth: v })} onReset={() => actions.setLayout({ treeWidth: DEFAULT_LAYOUT.treeWidth })}
            />
          </>
        )}
        <main className="pane pane-center" aria-label="Documents">
          <TabStrip />
          <div className="pane-center-body">
            <div className="tab-content">{activeTab ? <TabHost tab={activeTab} key={activeTab.id} /> : <EmptyWorkspace />}</div>
            {layout.showAnalysisDock && (
              <>
                <Splitter
                  orientation="horizontal" label="Resize analysis dock" value={layout.analysisHeight} min={120} max={Math.floor(window.innerHeight * 0.7)}
                  direction={-1} onChange={v => actions.setLayout({ analysisHeight: v })} onReset={() => actions.setLayout({ analysisHeight: DEFAULT_LAYOUT.analysisHeight })}
                />
                <section className="analysis-dock" style={{ height: layout.analysisHeight }} aria-label="Analysis preview">
                  <AnalysisDock />
                </section>
              </>
            )}
          </div>
        </main>
        {layout.showClipboard && (
          <>
            <Splitter
              orientation="vertical" label="Resize clipboard panel" value={layout.clipboardWidth} min={240} max={maxSide} direction={-1}
              onChange={v => actions.setLayout({ clipboardWidth: v })} onReset={() => actions.setLayout({ clipboardWidth: DEFAULT_LAYOUT.clipboardWidth })}
            />
            <aside className="pane pane-right" style={{ width: layout.clipboardWidth }} aria-label="Clipboards">
              <ClipboardPanel />
            </aside>
          </>
        )}
      </div>
      <StatusBar />
      {paletteOpen && <CommandPalette onClose={() => actions.setCommandPalette(false)} />}
      <DialogHost />
      <WorkspaceChrome />
      <Toasts />
    </div>
  )
}

function EmptyWorkspace() {
  return (
    <div className="empty-workspace">
      <div className="empty-mark">R</div>
      <h2>No document open</h2>
      <p>Open a repertory, a patient or the materia medica to begin.</p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => actions.openTab({ kind: 'repertory', repertory: useApp.getState().settings.defaultRepertory, rubric: 0, back: [], forward: [] }, { reuse: false })}>Open repertory</button>
        <button className="btn" onClick={() => actions.openTab({ kind: 'patients' })}>Patients</button>
        <button className="btn" onClick={() => actions.setCommandPalette(true)}>Command palette</button>
      </div>
    </div>
  )
}
