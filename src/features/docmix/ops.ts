import { actions, useApp } from '../../state/store'
import type { DocMix } from '../../state/workspace'
import { openRepertory } from '../repertory/ops'
import { openFamilies } from '../families/ops'
import { showTocView } from '../toc/commands'

/**
 * RadarOpus's document mixes (File menu): a named selection of the documents checked in the table of
 * contents' list of repertories. Saving keeps the current selection; recalling checks those documents
 * again and opens them; the default mix is the selection the workspace starts with.
 */
const layout = () => useApp.getState().layout

/** Keys of the documents checked now (`rep:<abbrev>`, `fam:<id>`). */
export const selection = (): string[] => layout().tocChecked

export function mixes(): DocMix[] { return layout().docMixes }

/** Pure: the mix list with `mix` added, replacing one of the same name (case-insensitive). */
export function withMix(list: readonly DocMix[], mix: DocMix): DocMix[] {
  const k = mix.name.trim().toLowerCase()
  return [...list.filter(m => m.name.trim().toLowerCase() !== k), { name: mix.name.trim(), keys: [...mix.keys] }]
}

export function saveMix(name: string): boolean {
  const n = name.trim()
  if (!n || !selection().length) return false
  actions.setLayout({ docMixes: withMix(mixes(), { name: n, keys: selection() }) })
  actions.toast(`Document mix “${n}” saved (${selection().length} documents)`, 'success', undefined, 2500)
  return true
}

export function deleteMix(name: string) {
  const l = layout()
  actions.setLayout({ docMixes: l.docMixes.filter(m => m.name !== name), ...(l.defaultDocMix === name ? { defaultDocMix: '' } : {}) })
}

/** Check the mix's documents in the table of contents and open them. */
export function recallMix(name: string): boolean {
  const mix = mixes().find(m => m.name === name)
  if (!mix) return false
  actions.setLayout({ tocChecked: [...mix.keys] })
  showTocView('repertories')
  for (const k of mix.keys) {
    if (k.startsWith('rep:')) void openRepertory(k.slice(4))
    else if (k.startsWith('fam:')) openFamilies()
  }
  return true
}

export function setDefaultMix(name: string) {
  if (!mixes().some(m => m.name === name)) return
  actions.setLayout({ defaultDocMix: name })
  actions.toast(`“${name}” is the default document mix`, 'info', undefined, 2500)
}

export function unsetDefaultMix() {
  const name = layout().defaultDocMix
  if (!name) return
  actions.setLayout({ defaultDocMix: '' })
  actions.toast(`“${name}” is no longer the default document mix`, 'info', undefined, 2500)
}

/** At startup: the default mix's documents are the checked selection. */
export function applyDefaultMix() {
  const l = layout()
  const mix = l.docMixes.find(m => m.name === l.defaultDocMix)
  if (mix) actions.setLayout({ tocChecked: [...mix.keys] })
}
