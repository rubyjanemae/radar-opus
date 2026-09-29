import { describe, expect, it } from 'vitest'
import { registerCommands } from './registry'
import { commandSignature, subscribeCommandState } from './useCommandState'
import { useSearchSel } from '../features/search/ops'
import { usePanelUi } from '../features/clipboard/ops'

describe('command state', () => {
  registerCommands([
    { id: 't.sel', title: 'Needs a ticked result', category: 'Test', run: () => {}, enabled: () => Object.values(useSearchSel.getState().selected).some(x => x.length > 0) },
    { id: 't.cursor', title: 'Needs a clipboard cursor', category: 'Test', run: () => {}, enabled: () => !!usePanelUi.getState().cursorId, checked: () => usePanelUi.getState().groupPending },
  ])

  it('fingerprints enabled and checked flags', () => {
    expect(commandSignature(['t.sel', 't.cursor', 'missing'])).toBe('0,0u,-')
  })

  it('notifies when a feature side store changes, so toolbars do not go stale', () => {
    const seen: string[] = []
    const off = subscribeCommandState(() => seen.push(commandSignature(['t.sel', 't.cursor'])))
    useSearchSel.setState({ selected: { tab1: ['publicum:1'] } })
    usePanelUi.setState({ cursorId: 's1', groupPending: true })
    off()
    usePanelUi.setState({ cursorId: null })
    expect(seen).toEqual(['1,0u', '1,1c'])
  })
})
