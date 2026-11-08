import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { registerLazyDialog } from '../../shell/dialogs'
import { actions, useApp } from '../../state/store'
import { applyDefaultMix, unsetDefaultMix } from './ops'

const layout = () => useApp.getState().layout

export function register(_catalog: Catalog) {
  void _catalog
  registerLazyDialog('docmix.save', () => import('./DocMixDialogs'), m => m.SaveMixDialog)
  registerLazyDialog('docmix.pick', () => import('./DocMixDialogs'), m => m.PickMixDialog)
  applyDefaultMix()
  registerCommands([
    {
      id: 'docmix.save', title: 'Save selection as a document mix', category: 'File', keywords: 'document mix selection checked documents repertories save',
      enabled: () => layout().tocChecked.length > 0, run: () => actions.openDialog('docmix.save'),
    },
    {
      id: 'docmix.recall', title: 'Recall a document mix', category: 'File', keywords: 'document mix open recall',
      enabled: () => layout().docMixes.length > 0, run: () => actions.openDialog('docmix.pick', { mode: 'recall' }),
    },
    {
      id: 'docmix.default', title: 'Select a default document mix', category: 'File', keywords: 'document mix default startup',
      enabled: () => layout().docMixes.length > 0, run: () => actions.openDialog('docmix.pick', { mode: 'default' }),
    },
    {
      id: 'docmix.unsetDefault', title: 'Unselect current default document mix', category: 'File', keywords: 'document mix default clear',
      enabled: () => !!layout().defaultDocMix, run: unsetDefaultMix,
    },
  ])
}
