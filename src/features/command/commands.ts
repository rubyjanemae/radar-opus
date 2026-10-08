import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions } from '../../state/store'
import { setInitialQuery } from './model'

const openWith = (prefix: string) => () => { setInitialQuery(prefix); actions.setCommandPalette(true) }

/** Palette entry points with a pre-selected mode. The palette itself opens with app.palette (core). */
export function register(_catalog: Catalog) {
  registerCommands([
    { id: 'palette.commands', title: 'Show all commands…', category: 'Tools', keywords: 'palette actions', run: openWith('>') },
    { id: 'palette.rubrics', title: 'Go to rubric…', category: 'Tools', keywords: 'palette rubric jump', run: openWith('/') },
    { id: 'palette.remedies', title: 'Go to remedy…', category: 'Tools', keywords: 'palette remedy info', run: openWith('#') },
    { id: 'palette.patients', title: 'Go to patient…', category: 'Tools', keywords: 'palette patient case', run: openWith('@') },
  ])
}
