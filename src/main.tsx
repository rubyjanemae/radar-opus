import './index.css'
import './e2eBridge'

/*
 * Startup in steps, each its own task: React DOM, then the app's modules, then the first render.
 * Evaluating them as one module graph was a single long task right after first paint; split, the
 * browser can paint and handle input between them.
 */

/** Let the browser paint and handle input before the next step (scheduler.yield where supported). */
function yieldToMain(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (sch?.yield) return sch.yield()
  return new Promise(resolve => setTimeout(resolve, 0))
}

async function start() {
  const [{ StrictMode, createElement }, { createRoot }] = await Promise.all([import('react'), import('react-dom/client')])
  await yieldToMain()
  const { default: App } = await import('./App.tsx')
  await yieldToMain()
  createRoot(document.getElementById('root')!).render(createElement(StrictMode, null, createElement(App)))
}

void start()
