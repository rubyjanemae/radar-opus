import type { Catalog } from '../data/catalog'
import { actions, useApp } from '../state/store'
import { buildDemoPractice } from './build'

/** `?seed=empty` in the URL skips the demo practice (clean first run for tests and demos). */
function wantsDemo(): boolean {
  try { return new URLSearchParams(location.search).get('seed') !== 'empty' } catch { return true }
}

/**
 * First-run workspace: a synthetic demo practice (patients, consultations, clipboards
 * filled with real Publicum rubrics), the Publicum repertory at Mind and the patients list,
 * with the Pulsatilla case as the active consultation. `demo: false` (signed-in accounts, whose records
 * sync to the cloud) opens the tabs only.
 */
export async function seedWorkspace(catalog: Catalog, opts: { demo?: boolean } = {}) {
  const abbrev = catalog.repertoryInfos.find(r => r.abbrev === 'publicum')?.abbrev ?? catalog.repertoryInfos[0]?.abbrev ?? 'publicum'
  const rep = catalog.repertory(abbrev)
  const s = useApp.getState()
  if (rep && opts.demo !== false && wantsDemo() && !Object.keys(s.patients).length) {
    const demo = buildDemoPractice({ rep, remedyId: a => catalog.remedyByAbbrev.get(a.toLowerCase())?.id, now: Date.now() })
    const active = demo.activeConsultationId ? demo.consultations[demo.activeConsultationId] : null
    // Direct state write: the demo practice is the starting point, not an undoable edit.
    useApp.setState({
      patients: demo.patients, consultations: demo.consultations,
      activeConsultationId: active?.id ?? null, activeClipboardId: active?.clipboards[0]?.id ?? null, selectedSymptomIds: [],
    })
  }
  if (!useApp.getState().tabs.length) {
    actions.openTab({ kind: 'repertory', repertory: abbrev, rubric: 0, back: [], forward: [] }, { reuse: false })
    const repTab = useApp.getState().activeTabId
    actions.openTab({ kind: 'patients' })
    if (repTab) actions.activateTab(repTab)
  }
}
