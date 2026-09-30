import { Component, startTransition, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Catalog } from './data/catalog'
import { CatalogProvider } from './data/CatalogContext'
import { installKeybindings, registerCommands } from './commands/registry'
import { registerCoreCommands } from './commands/core'
import { claimWorkspace, instanceMode, requestHandover } from './state/instance'
import { clearStoredWorkspace, exportRawData, hydrate, RestoreError, startAutosave } from './state/persist'
import { Shell } from './shell/Shell'
import { downloadBlob } from './ui/files'
import { installModalGuard } from './ui/modal'
import './ui/ConfirmDialog'
import './ui/ui.css'
import './shell/shell.css'
import './app.css'

type Boot =
  | { phase: 'loading'; step: string }
  | { phase: 'ready'; catalog: Catalog }
  | { phase: 'error'; message: string; restore: boolean }

/*
 * Boot runs once per page (module-level promise): StrictMode's double effect and remounts reuse it,
 * so there is one autosave subscription and one command registration.
 */
let bootPromise: Promise<Catalog> | null = null
let stepListener: ((step: string) => void) | null = null
const step = (s: string) => stepListener?.(s)

/** Let the browser paint and handle input between startup steps (scheduler.yield where supported). */
function yieldToMain(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (sch?.yield) return sch.yield()
  return new Promise(resolve => setTimeout(resolve, 0))
}

async function boot(): Promise<Catalog> {
  const catalog = await Catalog.load()
  step('Restoring workspace…')
  await claimWorkspace()
  const hadState = await hydrate(step)
  step('Opening repertory…')
  await catalog.loadRepertory(catalog.repertoryInfos[0]?.abbrev ?? 'publicum')
  if (!hadState) {
    // The demo practice builder is only needed on a first run: keep it out of the main bundle.
    const { seedWorkspace } = await import('./seed/seed')
    await seedWorkspace(catalog)
  }
  // each startup step in its own task, so none of them adds to the first render's task
  await yieldToMain()
  registerCoreCommands(catalog)
  registerCommands([{
    id: 'app.focusNotification', title: 'Focus notification action', category: 'View', keys: ['Alt+N'], allowInInput: true,
    keywords: 'toast undo notification', enabled: () => !!document.querySelector('.toasts .toast-action'), run: () => { focusLatestToastAction() },
  }])
  startAutosave()
  await yieldToMain()
  return catalog
}

function bootOnce(): Promise<Catalog> { return (bootPromise ??= boot()) }

async function exportRaw() {
  try { downloadBlob(await exportRawData(), `radar-opus-raw-${new Date().toISOString().slice(0, 10)}.json`) } catch (e) { alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`) }
}

async function resetWorkspace() {
  if (!confirm('Delete the saved workspace (patients, consultations, tabs and settings) and start again? Export the raw data first if you may need it.')) return
  try { await clearStoredWorkspace() } finally { location.reload() }
}

/** Startup failure card; when saved data is the cause it offers a rescue export and a reset. */
function BootError({ message, restore }: { message: string; restore: boolean }) {
  return (
    <div className="boot">
      <div className="boot-card" role="alert">
        <div className="boot-logo">R</div>
        <h1>{restore ? 'Your saved workspace could not be restored' : 'Radar Opus could not start'}</h1>
        <p className="boot-err">{message}</p>
        {restore && <p className="app-boot-hint">Export the raw data to keep a copy, then reset the workspace to start again.</p>}
        <div className="app-boot-actions">
          {restore && <button className="btn" onClick={() => void exportRaw()}>Export raw data</button>}
          {restore && <button className="btn" onClick={() => void resetWorkspace()}>Reset workspace</button>}
          <button className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    </div>
  )
}

/** A render crash anywhere in the shell (e.g. data the validator missed) shows the rescue card, not a blank page. */
class ShellBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  render() {
    return this.state.error ? <BootError message={this.state.error.message} restore /> : this.props.children
  }
}

/** Shown while another tab owns the workspace: this tab reads but never writes. */
function InstanceBanner() {
  const mode = useSyncExternalStore(instanceMode.subscribe, instanceMode.get)
  return mode === 'readonly' ? <ReadOnlyBanner /> : null
}

function ReadOnlyBanner() {
  const [asked, setAsked] = useState(false)
  return (
    <div className="app-instance-banner" role="status">
      <span><strong>Read-only:</strong> Radar Opus is open in another tab. Changes made here are not saved until this tab takes over.</span>
      <button className="btn btn-primary" disabled={asked} onClick={() => { setAsked(true); requestHandover() }}>{asked ? 'Taking over…' : 'Edit in this tab'}</button>
    </div>
  )
}

/** Alt+N: focus the newest toast's action button (Undo and the like). */
function focusLatestToastAction() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.toasts .toast-action')
  buttons[buttons.length - 1]?.focus()
}

export default function App() {
  const [state, setState] = useState<Boot>({ phase: 'loading', step: 'Loading remedies…' })

  useEffect(() => {
    let cancelled = false
    stepListener = s => { if (!cancelled) setState({ phase: 'loading', step: s }) }
    bootOnce().then(
      // a transition: the first render of the workspace is time-sliced instead of one long task
      catalog => { if (!cancelled) startTransition(() => setState({ phase: 'ready', catalog })) },
      e => { if (!cancelled) setState({ phase: 'error', message: e instanceof Error ? e.message : String(e), restore: e instanceof RestoreError }) },
    )
    return () => { cancelled = true }
  }, [])

  useEffect(() => installKeybindings(), [])

  if (state.phase === 'error') return <BootError message={state.message} restore={state.restore} />
  if (state.phase === 'loading') {
    return (
      <div className="boot" aria-busy="true">
        <div className="boot-card">
          <div className="boot-logo">R</div>
          <div className="boot-bar"><span /></div>
          <p>{state.step}</p>
        </div>
      </div>
    )
  }
  return (
    <ShellBoundary>
      <CatalogProvider catalog={state.catalog}>
        <AppFrame />
      </CatalogProvider>
    </ShellBoundary>
  )
}

/** The app root: made inert while a modal overlay (portalled outside it) is open. */
function AppFrame() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => (ref.current ? installModalGuard(ref.current) : undefined), [])
  return (
    <div className="app-frame" ref={ref}>
      <InstanceBanner />
      <Shell />
    </div>
  )
}
