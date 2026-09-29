import type { Catalog } from '../data/catalog'

/**
 * Each feature exports `register(catalog)` from its commands.ts, which registers
 * its commands and dialogs. Add new features here.
 */
const features: { register: (catalog: Catalog) => void }[] = []

export function registerFeatureCommands(catalog: Catalog) {
  for (const f of features) f.register(catalog)
}
