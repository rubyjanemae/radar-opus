import { useEffect, useState } from 'react'
import { Catalog } from './data/catalog'
import { CatalogProvider } from './data/CatalogContext'
import { installKeybindings } from './commands/registry'
import { registerCoreCommands } from './commands/core'
import { hydrate, startAutosave } from './state/persist'
import { seedWorkspace } from './seed/seed'
import { Shell } from './shell/Shell'
import './ui/ui.css'
import './shell/shell.css'

type Boot = { phase: 'loading'; step: string } | { phase: 'ready'; catalog: Catalog } | { phase: 'error'; message: string }

export default function App() {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading', step: 'Loading remedies…' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const catalog = await Catalog.load()
        setBoot({ phase: 'loading', step: 'Restoring workspace…' })
        const hadState = await hydrate()
        setBoot({ phase: 'loading', step: 'Opening repertory…' })
        await catalog.loadRepertory(catalog.repertoryInfos[0]?.abbrev ?? 'publicum')
        if (!hadState) await seedWorkspace(catalog)
        registerCoreCommands(catalog)
        startAutosave()
        if (!cancelled) setBoot({ phase: 'ready', catalog })
      } catch (e) {
        if (!cancelled) setBoot({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => installKeybindings(), [])

  if (boot.phase === 'error') {
    return (
      <div className="boot">
        <div className="boot-card">
          <div className="boot-logo">R</div>
          <h1>Radar Opus could not start</h1>
          <p className="boot-err">{boot.message}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    )
  }
  if (boot.phase === 'loading') {
    return (
      <div className="boot" aria-busy="true">
        <div className="boot-card">
          <div className="boot-logo">R</div>
          <div className="boot-bar"><span /></div>
          <p>{boot.step}</p>
        </div>
      </div>
    )
  }
  return (
    <CatalogProvider catalog={boot.catalog}>
      <Shell />
    </CatalogProvider>
  )
}
