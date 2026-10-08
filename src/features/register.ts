import type { Catalog } from '../data/catalog'
import * as analysis from './analysis/commands'
import * as clipboard from './clipboard/commands'
import * as repertory from './repertory/commands'
import * as search from './search/commands'
import * as command from './command/commands'
import * as patients from './patients/commands'
import * as mm from './mm/commands'
import * as workspace from './workspace/commands'
import * as families from './families/commands'
import * as account from './account/commands'

/**
 * Each feature exports `register(catalog)` from its commands.ts, which registers
 * its commands and dialogs. Add new features here.
 */
const features: { register: (catalog: Catalog) => void }[] = [analysis, clipboard, repertory, search, command, patients, mm, workspace, families, account]

export function registerFeatureCommands(catalog: Catalog) {
  for (const f of features) f.register(catalog)
}
