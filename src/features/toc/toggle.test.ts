import { describe, expect, it } from 'vitest'
import { actions, useApp } from '../../state/store'
import { chrome } from '../../shell/chrome'
import { tocChecked, toggleTocView } from './commands'
import { registerCommands } from '../../commands/registry'

describe('toolbar list buttons (RadarOpus)', () => {
  registerCommands([{ id: 'view.toc', title: 'Table of contents', category: 'View', run: () => actions.setLayout({ showTree: !useApp.getState().layout.showTree }) }])
  const checked = () => (['repertories', 'references', 'patients', 'remedies', 'families', 'bookmarks'] as const).filter(tocChecked)
  it('starts with only Patients checked', () => {
    expect(chrome.get().tocChecked).toEqual(['patients'])
    actions.setLayout({ showTree: true })
    expect(checked()).toEqual(['patients'])
  })
  it('checks only the list shown; a click on it hides the table of contents', async () => {
    toggleTocView('repertories')
    expect(checked()).toEqual(['repertories'])
    toggleTocView('references')
    expect(checked()).toEqual(['references'])
    toggleTocView('references')
    await new Promise(r => setTimeout(r, 0))
    expect(useApp.getState().layout.showTree).toBe(false)
    expect(checked()).toEqual([])
    toggleTocView('remedies')
    expect(useApp.getState().layout.showTree).toBe(true)
    expect(checked()).toEqual(['remedies'])
  })
})
