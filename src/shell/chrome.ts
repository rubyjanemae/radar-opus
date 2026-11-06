import { useSyncExternalStore } from 'react'

/**
 * Window-chrome switches that belong to this browser rather than to the case data: whether the main
 * toolbar and the clipboard strip are hidden ("Hide toolbars and clipboards") and whether the table of
 * contents is expanded ("Expand Toc"). Kept in localStorage; no undo.
 */
export interface ChromeState { hideBars: boolean; tocExpanded: boolean }

const KEY = 'radar-opus.chrome.v1'
const DEFAULTS: ChromeState = { hideBars: false, tocExpanded: false }

function load(): ChromeState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (!raw) return DEFAULTS
    const v = JSON.parse(raw) as Partial<ChromeState>
    return { hideBars: v.hideBars === true, tocExpanded: v.tocExpanded === true }
  } catch { return DEFAULTS }
}

let state = load()
const listeners = new Set<() => void>()

export const chrome = {
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  set(patch: Partial<ChromeState>) {
    state = { ...state, ...patch }
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage blocked: the switch lasts this session */ }
    for (const fn of listeners) fn()
  },
}

export function useChrome<T>(pick: (s: ChromeState) => T): T {
  return useSyncExternalStore(chrome.subscribe, () => pick(chrome.get()), () => pick(DEFAULTS))
}
