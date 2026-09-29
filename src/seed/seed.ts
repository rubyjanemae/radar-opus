import type { Catalog } from '../data/catalog'
import { actions, useApp } from '../state/store'

/** First-run workspace: opens the default repertory. Demo patients are added by the seed feature. */
export async function seedWorkspace(catalog: Catalog) {
  const rep = catalog.repertoryInfos[0]?.abbrev ?? 'publicum'
  if (!useApp.getState().tabs.length) actions.openTab({ kind: 'repertory', repertory: rep, rubric: 0, back: [], forward: [] }, { reuse: false })
}
