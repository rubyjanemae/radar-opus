import { useSyncExternalStore } from 'react'

/**
 * Window-chrome switches that belong to this browser rather than to the case data: whether the main
 * toolbar and the clipboard strip are hidden ("Hide toolbars and clipboards") and whether the table of
 * contents is expanded ("Expand Toc"). Kept in localStorage; no undo.
 */
export type TocView = 'repertories' | 'references' | 'remedies' | 'families' | 'bookmarks' | 'patients'
export const TOC_VIEWS: readonly TocView[] = ['repertories', 'references', 'remedies', 'families', 'bookmarks', 'patients']
/**
 * tocView: the list the table of contents shows (RadarOpus switches it with the toolbar's list buttons).
 * tocChecked: kept as `[tocView]` (older saves listed several lists); the toolbar checks only the
 * button of the list the table of contents shows (RadarOpus).
 */
export interface ChromeState { hideBars: boolean; tocExpanded: boolean; tocView: TocView; tocChecked: TocView[]; /** Tools › Deactivate tooltips */ tooltipsOff: boolean }

const KEY = 'radar-opus.chrome.v1'
/** RadarOpus starts on the Patients list, its button the only one checked. */
const DEFAULTS: ChromeState = { hideBars: false, tocExpanded: false, tocView: 'patients', tocChecked: ['patients'], tooltipsOff: false }

function load(): ChromeState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (!raw) return DEFAULTS
    const v = JSON.parse(raw) as Partial<ChromeState>
    const tocView = TOC_VIEWS.includes(v.tocView as TocView) ? v.tocView as TocView : DEFAULTS.tocView
    const tocChecked: TocView[] = [tocView]
    return { hideBars: v.hideBars === true, tocExpanded: v.tocExpanded === true, tocView, tocChecked, tooltipsOff: v.tooltipsOff === true }
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
