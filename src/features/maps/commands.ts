import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions, selectActiveTab, useApp } from '../../state/store'
import type { MapsTab } from '../../state/workspace'
import { focusDocumentWhenReady } from '../../shell/TabHost'
import { loadFamilies } from '../families/api'
import { MAP_TITLES } from './model'
import type { MapKind } from './model'

const st = () => useApp.getState()
const mapsTab = () => st().tabs.find((t): t is MapsTab => t.kind === 'maps') ?? null

/** Open the Maps window (one per workspace), on `map` when given, else on the map it shows. */
export function openMaps(map?: MapKind) {
  void loadFamilies().catch(() => { /* the view shows the error and a retry */ })
  const t = mapsTab()
  if (t) {
    if (map && t.map !== map) actions.updateTab<MapsTab>(t.id, { map, selected: null })
    actions.activateTab(t.id)
  } else actions.openTab({ kind: 'maps', map: map ?? 'periodic' })
  focusDocumentWhenReady()
}

const showing = (map: MapKind) => { const t = selectActiveTab(st()); return t?.kind === 'maps' && t.map === map }

export function register(_catalog: Catalog) {
  void _catalog
  registerCommands([
    { id: 'maps.open', title: 'Maps', category: 'View', keywords: 'maps periodic table kingdoms minerals plants animals analysis', run: () => openMaps() },
    ...(['periodic', 'kingdoms'] as const).map(map => ({
      id: `maps.${map}`, title: `Maps: ${MAP_TITLES[map]}`, category: 'View', keywords: `maps ${map} analysis`,
      checked: () => showing(map), run: () => openMaps(map),
    })),
  ])
}
