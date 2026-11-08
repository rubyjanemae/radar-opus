import { actions, selectActiveTab, useApp } from '../state/store'
import type { RepertoryTab } from '../state/workspace'
import type { Repertory } from '../data/repertory'
import type { MenuItem } from '../ui/Menu'
import { resolve } from '../features/repertory/ops'

/**
 * A rubric as RadarOpus's History popup names it: the whole path, chapter and first level in capitals,
 * joined by " - ", with two spaces before the last segment ("COUGH - COLD - air -  amel.:"); a rubric that
 * lists remedies ends with ":", a chapter or a heading without remedies does not ("MIND").
 */
export function historyLabel(rep: Repertory, index: number): string {
  const line = rep.lineage(index).map((i, k) => (k <= 1 ? rep.text(i).toUpperCase() : rep.text(i)))
  const text = line.length > 1 ? `${line.slice(0, -1).join(' - ')} -  ${line[line.length - 1]}` : line[0] ?? ''
  // a chapter is named bare, remedies or not ("MIND")
  return line.length > 1 && rep.remedies(index).length ? `${text}:` : text
}

/**
 * The book History follows: the active repertory tab, else the book read last (the one Back returns to).
 * `lastBook` is passed in by the caller that knows it (shell/commands).
 */
let lastBookOf: () => RepertoryTab | null = () => {
  const s = useApp.getState()
  return [...s.tabs].reverse().find((t): t is RepertoryTab => t.kind === 'repertory') ?? null
}
export function setHistoryBook(fn: () => RepertoryTab | null) { lastBookOf = fn }

function historyBook(): RepertoryTab | null {
  const t = selectActiveTab(useApp.getState())
  return t?.kind === 'repertory' ? t : lastBookOf()
}

/** Step a book's history pointer by `delta` (negative: back) without adding entries, as Back / Forward do. */
function step(tabId: string, delta: number) {
  for (let k = 0; k < Math.abs(delta); k++) {
    if (delta < 0) actions.historyBack(tabId)
    else actions.historyForward(tabId)
  }
}

/**
 * History (toolbar button, View menu), as RadarOpus lists it: "Clear History", a rule, then the book's visit
 * log newest first. It is a log, not a set: a rubric read twice is listed twice. Back and Forward move the
 * check mark along it without reordering it; choosing an entry moves there the same way.
 */
export function historyItems(): MenuItem[] {
  const tab = historyBook()
  const rep = tab ? resolve(`${tab.repertory}:${tab.rubric}`)?.rep : undefined
  if (!tab || !rep) return [{ label: 'Clear History', disabled: true }]
  // oldest → newest: back[0] … back[n-1], current, forward[0] … forward[m-1]
  const log = [...tab.back, tab.rubric, ...tab.forward]
  const at = tab.back.length
  const rows: MenuItem[] = []
  for (let i = log.length - 1; i >= 0; i--) {
    const index = log[i]
    rows.push({
      label: historyLabel(rep, index),
      checked: i === at,
      run: () => {
        if (selectActiveTab(useApp.getState())?.id !== tab.id) actions.activateTab(tab.id)
        step(tab.id, i - at)
      },
    })
  }
  return [
    {
      label: 'Clear History',
      disabled: log.length <= 1,
      // the book stays where it is: only the steps behind and ahead go
      run: () => actions.updateTab<RepertoryTab>(tab.id, { back: [], forward: [] }),
    },
    { type: 'separator' },
    ...rows,
  ]
}
