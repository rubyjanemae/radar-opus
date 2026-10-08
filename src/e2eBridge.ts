/**
 * Module handles for the end-to-end suite (e2e/). Tests reach app state through this instead of
 * importing `/src/...` URLs, which only exist on the dev server, so the same suite runs against the
 * dev server and a production build. Loading is lazy: nothing here runs until a test calls it.
 */
const modules = {
  store: () => import('./state/store'),
  registry: () => import('./commands/registry'),
  patientsView: () => import('./features/patients/PatientsView'),
  patientsLogic: () => import('./features/patients/logic'),
}
export type E2EModules = typeof modules

;(window as unknown as { __radarModules: E2EModules }).__radarModules = modules
