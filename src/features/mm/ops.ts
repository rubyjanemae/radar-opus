import { create } from 'zustand'
import type { Catalog } from '../../data/catalog'
import type { RubricRef } from '../../data/types'
import { actions, onTabClosed, selectActiveTab, useApp } from '../../state/store'
import type { MateriaMedicaTab, RemedyTab } from '../../state/workspace'
import { loadBook } from './book'
import type { MMBook } from './book'
import { parseParagraph } from './text'

let catalogRef: Catalog | null = null
export function setMMCatalog(c: Catalog) { catalogRef = c }
export function mmCatalog(): Catalog {
  if (!catalogRef) throw new Error('Materia medica feature not registered')
  return catalogRef
}

const st = () => useApp.getState()

export function activeMMTab(): MateriaMedicaTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'materia-medica' ? t : null
}
export function activeRemedyTab(): RemedyTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'remedy' ? t : null
}

// ───────────── transient reader state (not persisted) ─────────────

export interface MMUiState {
  /** A section to scroll to once the reader shows `remedyId`. */
  jump: { remedyId: number; section: number | string; nonce: number } | null
  /** Per MM tab reading history (remedy ids). */
  history: Record<string, { back: number[]; forward: number[] }>
  /** Focus the full-text search box of the MM view on next render. */
  focusSearch: number
  /** Show the resolved abbreviation after each remedy link in the text (Space). */
  showAbbrevs: boolean
  /** Hide the remedy list / results panel so the reader gets the whole width (L). */
  listHidden: boolean
}
const ABBR_KEY = 'radar-opus:mm-abbrevs'
function readShowAbbrevs(): boolean {
  try { return localStorage.getItem(ABBR_KEY) === '1' } catch { return false }
}
const LIST_KEY = 'radar-opus:mm-list-hidden'
function readListHidden(): boolean {
  try { return localStorage.getItem(LIST_KEY) === '1' } catch { return false }
}
export const useMMUi = create<MMUiState>(() => ({ jump: null, history: {}, focusSearch: 0, showAbbrevs: readShowAbbrevs(), listHidden: readListHidden() }))

export function setListHidden(hidden: boolean) {
  useMMUi.setState({ listHidden: hidden })
  try { localStorage.setItem(LIST_KEY, hidden ? '1' : '0') } catch { /* private mode */ }
}
export function toggleList() { setListHidden(!useMMUi.getState().listHidden) }

export function toggleShowAbbrevs() {
  const next = !useMMUi.getState().showAbbrevs
  useMMUi.setState({ showAbbrevs: next })
  try { localStorage.setItem(ABBR_KEY, next ? '1' : '0') } catch { /* private mode */ }
}

/** The open MM tab (reused) or a new one. */
function ensureMMTab(): MateriaMedicaTab {
  const existing = st().tabs.find(t => t.kind === 'materia-medica') as MateriaMedicaTab | undefined
  if (existing) { actions.activateTab(existing.id); return existing }
  actions.openTab({ kind: 'materia-medica', remedyId: null, query: '' })
  return activeMMTab()!
}

/** Show a remedy in a MM tab, recording reading history. */
export function navigateMM(tab: MateriaMedicaTab, remedyId: number | null, section: number | string | null = null) {
  if (remedyId !== null && tab.remedyId !== null && tab.remedyId !== remedyId) {
    useMMUi.setState(s => {
      const h = s.history[tab.id] ?? { back: [], forward: [] }
      return { history: { ...s.history, [tab.id]: { back: [...h.back.slice(-99), tab.remedyId!], forward: [] } } }
    })
  }
  if (tab.remedyId !== remedyId) actions.updateTab<MateriaMedicaTab>(tab.id, { remedyId })
  if (remedyId !== null) useMMUi.setState({ jump: { remedyId, section: section ?? -2, nonce: Date.now() } })
}

export function historyMove(tabId: string, dir: -1 | 1) {
  const tab = st().tabs.find(t => t.id === tabId) as MateriaMedicaTab | undefined
  const h = useMMUi.getState().history[tabId]
  if (!tab || !h) return
  const from = dir < 0 ? h.back : h.forward
  if (!from.length) return
  const target = dir < 0 ? from[from.length - 1] : from[0]
  const cur = tab.remedyId
  const next = dir < 0
    ? { back: h.back.slice(0, -1), forward: cur !== null ? [cur, ...h.forward] : h.forward }
    : { back: cur !== null ? [...h.back, cur] : h.back, forward: h.forward.slice(1) }
  useMMUi.setState(s => ({ history: { ...s.history, [tabId]: next } }))
  actions.updateTab<MateriaMedicaTab>(tabId, { remedyId: target })
  useMMUi.setState({ jump: { remedyId: target, section: -2, nonce: Date.now() } })
}

export function canHistory(tabId: string | undefined, dir: -1 | 1): boolean {
  if (!tabId) return false
  const h = useMMUi.getState().history[tabId]
  return !!h && (dir < 0 ? h.back.length : h.forward.length) > 0
}

/**
 * Run a navigation that replaces the page (history back/forward) without dropping keyboard focus
 * to the document: when focus was inside the materia medica view and the focused element goes
 * away (a remedy link in the old text, a button that becomes disabled), the reader takes it.
 */
export function keepMMFocus(fn: () => void) {
  const view = document.activeElement?.closest?.('.mm-view') ?? null
  fn()
  if (!view) return
  requestAnimationFrame(() => {
    const a = document.activeElement as HTMLElement | null
    if (a && a !== document.body && a.isConnected && !(a instanceof HTMLButtonElement && a.disabled)) return
    const root = document.querySelector('.tab-content .mm-view') ?? view
    root.querySelector<HTMLElement>('.mm-reader')?.focus({ preventScroll: true })
  })
}

// ───────────── remedy window state (transient, per tab) ─────────────

export type RemedySection = 'overview' | 'relations' | 'repertory' | 'families' | 'sources'
export interface RemedyTabMemory { section: RemedySection; repertory: string | null; back: number[] }
export const DEFAULT_REMEDY_MEMORY: RemedyTabMemory = { section: 'overview', repertory: null, back: [] }

interface RemedyUiState {
  /** Per remedy tab: section, profile repertory and the remedy back stack; survives tab switches. */
  memory: Record<string, RemedyTabMemory>
  /** Rubric selected in a remedy window's keynote list, for rubric.* commands (take, copy). */
  selectedRubric: RubricRef | null
}
export const useRemedyUi = create<RemedyUiState>(() => ({ memory: {}, selectedRubric: null }))

export function remedyMemory(tabId: string): RemedyTabMemory {
  return useRemedyUi.getState().memory[tabId] ?? DEFAULT_REMEDY_MEMORY
}
export function setRemedyMemory(tabId: string, patch: Partial<RemedyTabMemory>) {
  useRemedyUi.setState(s => ({ memory: { ...s.memory, [tabId]: { ...(s.memory[tabId] ?? DEFAULT_REMEDY_MEMORY), ...patch } } }))
}
export function setSelectedRemedyRubric(ref: RubricRef | null) {
  if (useRemedyUi.getState().selectedRubric !== ref) useRemedyUi.setState({ selectedRubric: ref })
}
export function selectedRemedyRubric(): RubricRef | null { return useRemedyUi.getState().selectedRubric }

/** Drop per-tab reader history and remedy window memory when tabs close. Idempotent. */
let cleanupInstalled = false
export function installTabStateCleanup() {
  if (cleanupInstalled) return
  cleanupInstalled = true
  onTabClosed(tab => {
    if (useMMUi.getState().history[tab.id]) {
      useMMUi.setState(s => { const history = { ...s.history }; delete history[tab.id]; return { history } })
    }
    if (useRemedyUi.getState().memory[tab.id]) {
      useRemedyUi.setState(s => { const memory = { ...s.memory }; delete memory[tab.id]; return { memory } })
    }
  })
}

/**
 * Open the materia medica (reusing its tab). `section` is an index or a heading name
 * ("Relationship", resolved by the reader); -1 = introduction.
 */
export function openMM(remedyId?: number | null, opts: { section?: number | string; query?: string; focusSearch?: boolean } = {}) {
  const tab = ensureMMTab()
  if (opts.query !== undefined) actions.updateTab<MateriaMedicaTab>(tab.id, { query: opts.query })
  if (remedyId != null) navigateMM(useApp.getState().tabs.find(t => t.id === tab.id) as MateriaMedicaTab, remedyId, opts.section ?? null)
  if (opts.focusSearch) useMMUi.setState({ focusSearch: Date.now() })
}

export function openRemedy(remedyId: number) {
  actions.openTab({ kind: 'remedy', remedyId })
}

/** Remedy in focus for MM commands: the MM tab's remedy or the remedy tab's remedy. */
export function contextRemedy(): number | null {
  const t = selectActiveTab(st())
  if (t?.kind === 'materia-medica') return t.remedyId
  if (t?.kind === 'remedy') return t.remedyId
  return null
}

/**
 * Should a view that just opened leave focus where it is? Yes while the user types, works in a
 * dialog or menu, is already inside the view, or moves through the tab strip with the keyboard.
 */
export function focusIsBusy(root: HTMLElement | null): boolean {
  const a = document.activeElement as HTMLElement | null
  if (!a || a === document.body) return false
  if (a.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return true
  if (a.closest('[role="dialog"], [role="menu"]') || root?.contains(a)) return true
  return !!a.closest('[role="tablist"]') && a.matches(':focus-visible')
}

// ───────────── print ─────────────

function esc(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** Standalone printable HTML of one monograph. */
export function monographHtml(book: MMBook, remedyId: number): string {
  const e = book.entries.get(remedyId)
  if (!e) return ''
  const r = book.catalog.remedy(remedyId)
  const para = (text: string, relationship = false) => parseParagraph(text, book.resolver, { relationship, selfId: remedyId })
    .map(s => s.em ? `<em>${esc(s.text)}</em>` : esc(s.text)).join('').replace(/\n/g, '<br>')
  const sections = e.sections.map(s => `<section><h2>${esc(s.heading)}</h2><p>${para(s.text, /relation/i.test(s.heading))}</p></section>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.abbrev)} – ${esc(book.info.author)}</title><style>
    @page { margin: 16mm 18mm; }
    body { font: 10.5pt/1.5 "Source Serif 4", Georgia, serif; color: #000; margin: 0; }
    header { border-bottom: 1pt solid #000; margin-bottom: 10pt; padding-bottom: 6pt; }
    h1 { font-size: 16pt; margin: 0; letter-spacing: .02em; }
    .sub { font-style: italic; color: #333; margin-top: 2pt; }
    .abbr { font: 600 9pt system-ui, sans-serif; color: #444; }
    h2 { font: 700 10pt system-ui, sans-serif; text-transform: uppercase; letter-spacing: .06em; margin: 10pt 0 2pt; }
    p { margin: 0; text-align: justify; hyphens: auto; }
    section { break-inside: avoid-page; }
    footer { margin-top: 14pt; border-top: .5pt solid #888; padding-top: 4pt; font: 8pt system-ui, sans-serif; color: #555; }
  </style></head><body>
    <header><div class="abbr">${esc(r.abbrev)} · ${esc(r.name)}</div><h1>${esc(e.heading)}</h1>${e.commonName ? `<div class="sub">${esc(e.commonName)}</div>` : ''}</header>
    <p>${para(e.intro)}</p>${sections}
    <footer>${esc(book.sourceLine)}. Printed from Radar Opus.</footer>
  </body></html>`
}

/** Print a monograph through an isolated iframe (keeps app print styles out of it). */
export async function printMonograph(remedyId: number) {
  const book = await loadBook(mmCatalog())
  const html = monographHtml(book, remedyId)
  if (!html) { actions.toast('No Boericke monograph for this remedy', 'info'); return }
  document.querySelector('iframe.mm-print-frame')?.remove()
  // printing focuses the iframe; hand focus back afterwards or every app shortcut goes to it
  const prev = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  const restoreFocus = () => {
    const a = document.activeElement
    if (a && a !== document.body && !(a instanceof HTMLIFrameElement)) return // the user already moved on
    const target = prev?.isConnected ? prev : document.querySelector<HTMLElement>('.tab-content .mm-reader, .tab-content .ri-view')
    target?.focus({ preventScroll: true })
  }
  const frame = document.createElement('iframe')
  frame.className = 'mm-print-frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  const w = frame.contentWindow!
  let removed = false
  const cleanup = () => {
    restoreFocus()
    if (removed) return
    removed = true
    frame.remove()
  }
  w.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true })
  setTimeout(() => {
    w.focus()
    w.print()
    // print() blocks until the dialog closes in most browsers: take focus back right away; the
    // frame goes on afterprint (or, if a browser never fires it, after a minute)
    restoreFocus()
    setTimeout(cleanup, 60_000)
  }, 50)
}

// ───────────── remedy family provider (filled by the families feature when present) ─────────────

export interface RemedyGroup {
  /** Classification system, e.g. "Kingdom", "APG IV", "Miasm". */
  system: string
  /** Group label, e.g. "Plant", "Ranunculaceae". */
  label: string
  /** All remedy ids in the group. */
  members: number[]
  /** Open the group in the families view. */
  open?: () => void
}

type FamilyProvider = (remedyId: number) => RemedyGroup[]
let familyProvider: FamilyProvider | null = null
let familyVer = 0
export function familyVersion() { return familyVer }
const familyListeners = new Set<() => void>()

/** The families feature registers how to look up a remedy's kingdom and families. */
export function registerRemedyFamilyProvider(fn: FamilyProvider) {
  familyProvider = fn
  familyVer++
  familyListeners.forEach(l => l())
}
export function remedyGroups(remedyId: number): RemedyGroup[] | null {
  return familyProvider ? familyProvider(remedyId) : null
}
export function onFamilyProvider(fn: () => void) { familyListeners.add(fn); return () => { familyListeners.delete(fn) } }
