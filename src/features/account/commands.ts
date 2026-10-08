import type { Catalog } from '../../data/catalog'
import { registerCommands } from '../../commands/registry'
import { actions } from '../../state/store'
import { askConfirm } from '../../ui/ConfirmDialog'
import { accountConfigured } from './env'
import { accountStatus } from './status'

const signedIn = () => !!accountStatus.get().email

/** Account commands: sign out and sync now. Only registered when the app is built with a Supabase project. */
export function register(_catalog: Catalog) {
  if (!accountConfigured) return
  registerCommands([
    {
      id: 'account.syncNow', title: 'Sync now', category: 'File', keywords: 'cloud account upload download refresh',
      enabled: signedIn,
      run: async () => {
        const { syncNow } = await import('./sync')
        try {
          const left = await syncNow()
          actions.toast(left ? `${left} change${left === 1 ? '' : 's'} still waiting to sync` : 'Synced with your account', left ? 'info' : 'success')
        } catch (e) { actions.toast(`Sync failed: ${e instanceof Error ? e.message : String(e)}`, 'error') }
      },
    },
    {
      id: 'account.signOut', title: 'Sign out…', category: 'File', keywords: 'log out logout account',
      enabled: signedIn,
      run: async () => {
        const { signOut } = await import('./sync')
        await signOut(n => askConfirm({
          title: 'Sign out with unsynced changes?',
          message: `${n} change${n === 1 ? ' has' : 's have'} not reached your account yet. Signing out removes patient data from this device, so ${n === 1 ? 'it' : 'they'} will be lost.`,
          detail: 'Cancel, go online and let the changes sync first to keep them.',
          confirmLabel: 'Sign out and discard', danger: true,
        }))
      },
    },
  ])
}
