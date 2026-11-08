import type { Catalog } from '../data/catalog'
import { actions, useApp } from '../state/store'
import { buildDemoPractice } from './build'
import { buildRoStart, RO_START } from './roStart'

/**
 * `?seed=empty` in the URL skips the demo practice (clean first run); `?seed=case` also opens the demo
 * Pulsatilla case with its filled clipboards (a fixture for tests and demos); `?seed=ro` reproduces
 * RadarOpus's start state for side-by-side comparisons (roStart.ts). Without either the demo
 * patients are in the Patients list but no case is open, so the clipboards start empty like RadarOpus's.
 */
function seedMode(): 'empty' | 'case' | 'demo' | 'ro' {
  try {
    const v = new URLSearchParams(location.search).get('seed')
    return v === 'empty' ? 'empty' : v === 'case' ? 'case' : v === 'ro' ? 'ro' : 'demo'
  } catch { return 'demo' }
}

/**
 * First-run workspace: a synthetic demo practice (patients, consultations, clipboards
 * filled with real Publicum rubrics) and a single document tab, the Publicum repertory at Mind (RadarOpus
 * opens one book window; the patients list opens when the user asks for it). No case is active, so the
 * clipboard strip starts empty with clipboard 1 marked; `?seed=case` activates the Pulsatilla case.
 * `demo: false` (signed-in accounts, whose records sync to the cloud) opens the tab only.
 */
export async function seedWorkspace(catalog: Catalog, opts: { demo?: boolean } = {}) {
  const abbrev = catalog.repertoryInfos.find(r => r.abbrev === 'publicum')?.abbrev ?? catalog.repertoryInfos[0]?.abbrev ?? 'publicum'
  const rep = catalog.repertory(abbrev)
  const s = useApp.getState()
  const mode = seedMode()
  if (rep && opts.demo !== false && mode === 'ro' && !Object.keys(s.patients).length && !s.tabs.length) {
    const ro = buildRoStart(rep, Date.now())
    const c = ro.consultation
    // Direct state write: the start state is the starting point, not an undoable edit.
    useApp.setState({
      patients: { [ro.patient.id]: ro.patient }, consultations: { [c.id]: c },
      activeConsultationId: c.id, activeClipboardId: c.clipboards[RO_START.activeClipboard]?.id ?? null, selectedSymptomIds: [],
      recentSearches: [RO_START.lastSearch],
    })
    // RadarOpus's three windows: the patient, the repertory (in front) and the analysis, which shows the
    // title it was saved with ("Oefen Casus -") until it is shown again
    actions.openTab({ kind: 'patient', patientId: ro.patient.id, section: 'consultations' }, { reuse: false })
    actions.openTab({ kind: 'repertory', repertory: abbrev, rubric: ro.rubric, back: [], forward: [] }, { reuse: false })
    const repTab = useApp.getState().activeTabId
    actions.openTab({ kind: 'analysis', consultationId: c.id, restoredTitle: `${RO_START.firstName} ${RO_START.lastName} -` }, { reuse: false })
    if (repTab) actions.activateTab(repTab)
    return
  }
  if (rep && opts.demo !== false && mode !== 'empty' && !Object.keys(s.patients).length) {
    const demo = buildDemoPractice({ rep, remedyId: a => catalog.remedyByAbbrev.get(a.toLowerCase())?.id, now: Date.now() })
    const active = mode === 'case' && demo.activeConsultationId ? demo.consultations[demo.activeConsultationId] : null
    // Direct state write: the demo practice is the starting point, not an undoable edit.
    useApp.setState({
      patients: demo.patients, consultations: demo.consultations,
      activeConsultationId: active?.id ?? null, activeClipboardId: active?.clipboards[0]?.id ?? null, selectedSymptomIds: [],
    })
  }
  if (!useApp.getState().tabs.length) {
    actions.openTab({ kind: 'repertory', repertory: abbrev, rubric: 0, back: [], forward: [] }, { reuse: false })
  }
}
