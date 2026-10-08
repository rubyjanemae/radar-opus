import { useCallback, useSyncExternalStore } from 'react'
import { useApp } from '../state/store'
import { useSearchSel } from '../features/search/ops'
import { usePanelUi } from '../features/clipboard/ops'
import { useMMUi } from '../features/mm/ops'
import { getCommand, isEnabled, onCommandsChanged } from './registry'

/**
 * Every store a command's `enabled` / `checked` may read. The app store holds most state; the
 * feature side stores hold selections (ticked search results, the clipboard cursor, the MM reader).
 * They are only subscribed to here, never written.
 */
const STORES: { subscribe: (fn: () => void) => () => void }[] = [useApp, useSearchSel, usePanelUi, useMMUi]

/** Subscribe to every store command state can depend on (exported for tests). */
export function subscribeCommandState(fn: () => void) {
  const offs = [...STORES.map(s => s.subscribe(fn)), onCommandsChanged(fn)]
  return () => offs.forEach(off => off())
}

export interface CommandState { enabled: boolean; checked?: boolean }

/** Compact enabled/checked fingerprint of a set of commands; a re-render happens only when it changes. */
export function commandSignature(ids: readonly string[]): string {
  return ids.map(id => {
    const c = getCommand(id)
    if (!c) return '-'
    const checked = c.checked?.()
    return `${isEnabled(c) ? 1 : 0}${checked === undefined ? '' : checked ? 'c' : 'u'}`
  }).join(',')
}

/**
 * Live enabled/checked state of a set of commands. The component re-renders only when one of
 * these flags changes, not on every store update, so toolbars stay quiet while the user moves
 * through a list.
 */
export function useCommandState(ids: readonly string[]): Record<string, CommandState> {
  const key = ids.join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useCallback(() => commandSignature(ids), [key])
  const sig = useSyncExternalStore(subscribeCommandState, snap, snap)
  const parts = sig.split(',')
  const out: Record<string, CommandState> = {}
  ids.forEach((id, i) => {
    const p = parts[i] ?? '-'
    out[id] = { enabled: p[0] === '1', checked: p[1] === 'c' ? true : p[1] === 'u' ? false : undefined }
  })
  return out
}
