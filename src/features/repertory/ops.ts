import type { Catalog } from '../../data/catalog'
import { parseRef } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { RubricRef } from '../../data/types'
import type { Symptom } from '../../engine/model'
import { actions, selectActiveClipboard, selectActiveConsultation, selectActiveTab, useApp, MAX_CLIPBOARDS } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import type { Consultation } from '../../state/patients'
import type { MenuItem } from '../../ui/Menu'
import { DEFAULT_TAKE, bookAbbrev, describeTake, rubricHtml, rubricPlainText, weightGiven } from './take'
import { alphaRemedies, GRADE_WORD } from './remedies'
import { getHighlight, setHighlight } from './highlight'
import type { TakeOptions } from './take'
import { broadTakeWarning } from '../clipboard/logic'

/**
 * Repertory operations shared by the book view, the navigator, dialogs and commands.
 */

let catalogRef: Catalog | null = null
export function setRepertoryCatalog(c: Catalog) { catalogRef = c }
export function catalog(): Catalog {
  if (!catalogRef) throw new Error('Repertory feature not registered')
  return catalogRef
}

const st = () => useApp.getState()

// ───────────── current rubric ─────────────

/** Other features (search results, analysis) can expose their current rubric(s) to rubric.* commands. */
const sources = new Map<string, () => RubricRef[] | null>()
export function registerRubricSource(tabKind: string, fn: () => RubricRef[] | null) { sources.set(tabKind, fn) }

export function activeRepertoryTab(): RepertoryTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'repertory' ? t : null
}

export function currentRubric(): { rep: Repertory; index: number; tab: RepertoryTab } | null {
  const tab = activeRepertoryTab()
  if (!tab || !catalogRef) return null
  const rep = catalogRef.repertory(tab.repertory)
  if (!rep || tab.rubric < 0 || tab.rubric >= rep.size) return null
  return { rep, index: tab.rubric, tab }
}

/** Rubric refs the rubric.* commands act on. */
export function currentRefs(): RubricRef[] {
  const cur = currentRubric()
  if (cur) return [cur.rep.ref(cur.index)]
  const t = selectActiveTab(st())
  const src = t ? sources.get(t.kind) : undefined
  return src?.() ?? []
}

export function resolve(ref: RubricRef): { rep: Repertory; index: number } | null {
  return catalogRef?.resolve(ref) ?? null
}

export function refLabel(ref: RubricRef): string {
  const r = resolve(ref)
  return r ? r.rep.path(r.index) : ref
}

// ───────────── navigation ─────────────

/**
 * Navigate to a rubric: in the active repertory tab when it shows that book, else in a tab that
 * already shows it, else in a new tab. A tab showing another book is never replaced, so two
 * repertories can stay open side by side.
 */
export async function goToRef(ref: RubricRef, opts: { newTab?: boolean } = {}) {
  const { repertory, index } = parseRef(ref)
  const s = st()
  if (!opts.newTab) {
    const active = selectActiveTab(s)
    if (active?.kind === 'repertory' && active.repertory === repertory) { actions.navigateRubric(active.id, index); return }
    const other = s.tabs.find((t): t is RepertoryTab => t.kind === 'repertory' && t.repertory === repertory)
    if (other) { actions.activateTab(other.id); actions.navigateRubric(other.id, index); return }
  }
  await openRepertory(repertory, index, { reuse: false })
}

export function goParent(tab: RepertoryTab, rep: Repertory) {
  const p = rep.parent(tab.rubric)
  if (p >= 0) actions.navigateRubric(tab.id, p)
}

// ───────────── taking ─────────────

// ───────────── feedback ─────────────

/**
 * The repertory keeps one toast on screen at a time: a new one replaces the previous one, and
 * successive takes merge into a running count, so fast taking never stacks toasts over the book.
 */
let lastToast: { id: string; kind: string; count: number } | null = null
export function featureToast(kind: string, text: (count: number) => string, tone: 'info' | 'success' | 'error', action?: { label: string; run: () => void }, count = 1) {
  const prev = lastToast && st().toasts.some(t => t.id === lastToast!.id) ? lastToast : null
  if (prev) actions.dismissToast(prev.id)
  const total = prev && prev.kind === kind ? prev.count + count : count
  actions.toast(text(total), tone, action)
  const t = st().toasts[st().toasts.length - 1]
  lastToast = t ? { id: t.id, kind, count: total } : null
}

/** Leaf text of a rubric, for short feedback. */
const leafText = (ref: RubricRef) => { const r = resolve(ref); return r ? r.rep.text(r.index) : ref }

/** Short label for a rubric in feedback: the chapter and the last two levels. */
export function refShort(ref: RubricRef): string {
  const r = resolve(ref)
  if (!r) return ref
  const line = r.rep.lineage(r.index).map(i => r.rep.text(i))
  return line.length <= 3 ? line.join(' - ') : `${line[0]} - … - ${line.slice(-2).join(' - ')}`
}

// ───────────── recent rubrics ─────────────

export const MAX_RECENT = 20

/** Rubrics kept in the workspace Recent list (all repertories together). */
export const MAX_RECENT_RUBRICS = 60

/** Most-recent-first list with `item` moved to the front. */
export function pushRecent<T>(list: readonly T[] | undefined, item: T, max = MAX_RECENT): T[] {
  const out = [item, ...(list ?? []).filter(x => x !== item)]
  return out.length > max ? out.slice(0, max) : out
}

/**
 * Record a rubric in the workspace Recent list. It lives in workspace state (`recentRubrics`), which the
 * autosave writes, so it survives reloads and closing the tab; the navigator lists the entries of the
 * repertory it shows.
 */
export function recordRecent(ref: RubricRef) {
  const list = st().recentRubrics
  if (list[0] === ref) return
  useApp.setState({ recentRubrics: pushRecent(list, ref, MAX_RECENT_RUBRICS) })
}

/**
 * The Recent rubrics of one repertory, most recent first. Tabs saved before the list moved to the
 * workspace contribute their own `recent` indexes after the workspace entries.
 */
export function recentOf(list: readonly RubricRef[], repertory: string, legacy: readonly number[] = [], max = MAX_RECENT): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  const add = (i: number) => { if (out.length < max && !seen.has(i)) { seen.add(i); out.push(i) } }
  for (const r of list) { const p = parseRef(r); if (p.repertory === repertory) add(p.index) }
  for (const i of legacy) add(i)
  return out
}

// ───────────── taking ─────────────

/** Make sure there is a consultation to take into; creates an "Unsaved case" if needed. */
export function ensureConsultation(opts: { quiet?: boolean } = {}): string {
  const s = st()
  const c = selectActiveConsultation(s)
  if (c) return c.id
  const pid = actions.createPatient({ lastName: 'Unsaved case', firstName: '' })
  const cid = actions.createConsultation(pid, { title: 'Unsaved case' })
  if (!opts.quiet) featureToast('case', () => 'Started an unsaved case for your symptoms', 'info')
  return cid
}

/**
 * Resolve a 1-based clipboard number (null = active), creating clipboards up to that number.
 * Everything it creates (an unsaved case, clipboards) is one undo step, or part of the caller's.
 */
export function ensureClipboard(n: number | null, opts: { quiet?: boolean } = {}): { id: string; name: string } | null {
  return actions.transaction(() => {
    ensureConsultation(opts)
    let s = st()
    if (n == null) {
      const cb = selectActiveClipboard(s)
      return cb ? { id: cb.id, name: cb.name } : null
    }
    const target = Math.min(n, MAX_CLIPBOARDS)
    const keep = s.activeClipboardId
    let c = selectActiveConsultation(s)
    while (c && c.clipboards.length < target) {
      if (!actions.addClipboard()) break
      s = st()
      c = selectActiveConsultation(s)
    }
    if (keep && st().activeClipboardId !== keep) actions.setActiveClipboard(keep)
    const cb = c?.clipboards[target - 1]
    return cb ? { id: cb.id, name: cb.name } : null
  })
}

/** Descendant rubrics of i (inclusive) that carry remedies. */
export function subtreeRefs(rep: Repertory, i: number): RubricRef[] {
  const out: RubricRef[] = []
  const end = rep.subtreeEndOf(i)
  for (let k = i; k < end; k++) if (k === i || rep.remedyCount(k) > 0) out.push(rep.ref(k))
  return out
}

const sameRubrics = (a: readonly RubricRef[], b: readonly RubricRef[]) => {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(r => set.has(r))
}

/** One take in a merged feedback toast. */
export interface TakeRecord { count: number; target: string; last: string }

/**
 * Text of the take toast. A single take names the rubric; merged takes (fast taking replaces the
 * toast) give the total, where each went, and the last rubric taken.
 */
export function takeToastText(log: readonly TakeRecord[], single: string): string {
  if (log.length <= 1) return single
  const total = log.reduce((n, r) => n + r.count, 0)
  const byTarget = new Map<string, number>()
  for (const r of log) byTarget.set(r.target, (byTarget.get(r.target) ?? 0) + r.count)
  const where = byTarget.size === 1 ? `→ ${[...byTarget.keys()][0]}` : [...byTarget].map(([t, n]) => `${n} → ${t}`).join(', ')
  return `${total} rubrics taken ${where} · last: ${log[log.length - 1].last}`
}

let takeLog: { toastId: string; log: TakeRecord[] } | null = null

/** Is the rubric a chapter, and how many remedies does the take cover (the whole subtree with /s)? */
function takeBreadth(ref: RubricRef, subRubrics: boolean): { chapter: boolean; remedies: number } {
  const r = resolve(ref)
  if (!r) return { chapter: false, remedies: 0 }
  const chapter = r.rep.lineage(r.index).length === 1
  if (!subRubrics) return { chapter, remedies: r.rep.remedies(r.index).length }
  const ids = new Set<number>()
  for (const x of subtreeRefs(r.rep, r.index)) { const y = resolve(x); if (y) y.rep.forEachRemedy(y.index, id => ids.add(id)) }
  return { chapter, remedies: ids.size }
}

/** `warning` (a broad take) leads the toast, which then stays up longer and cannot be merged away by the next take. */
export function takeToast(record: TakeRecord, single: string, undo: () => void, warning = '') {
  const s = st()
  const prev = !warning && takeLog && s.toasts.some(t => t.id === takeLog!.toastId) ? takeLog : null
  if (prev) actions.dismissToast(prev.toastId)
  if (lastToast && lastToast.kind !== 'take' && s.toasts.some(t => t.id === lastToast!.id)) actions.dismissToast(lastToast.id)
  if (warning) {
    // its own toast: a later take must not merge it away before the warning was read
    actions.toast(`${warning} · ${single}`, 'info', { label: 'Undo', run: undo }, 12000)
    takeLog = null; lastToast = null
    return
  }
  const log = [...(prev?.log ?? []), record]
  actions.toast(takeToastText(log, single), 'success', { label: log.length > 1 ? 'Undo last' : 'Undo', run: undo })
  const t = st().toasts[st().toasts.length - 1]
  takeLog = t ? { toastId: t.id, log } : null
  lastToast = t ? { id: t.id, kind: 'take', count: log.length } : null
}

/** "Clipboard 2", or "Clipboard 2 (Particulars)" when the clipboard has a name of its own. */
export function clipboardTitle(n: number, name: string): string {
  const base = `Clipboard ${n}`
  return !name || name === base ? base : `${base} (${name})`
}

/**
 * Undo label of a take: the rubric's full path, the chapter then its levels
 * ("Take Mind - morning, and evening, during").
 */
export function takeUndoLabel(refs: readonly RubricRef[]): string {
  if (refs.length !== 1) return `Take ${refs.length} rubrics`
  const r = resolve(refs[0])
  if (!r) return `Take ${refs[0]}`
  const [chapter, ...levels] = r.rep.lineage(r.index).map(i => r.rep.text(i))
  return `Take ${levels.length ? `${chapter} - ${levels.join(', ')}` : chapter}`
}

/**
 * The symptom of clipboard `n` (1-based, null = active) that holds exactly `rubrics`, with the
 * clipboard's number and name; null when the rubric set is not on that clipboard.
 */
export function existingSymptom(rubrics: readonly RubricRef[], n: number | null): { symptom: Symptom; n: number; name: string } | null {
  const c = selectActiveConsultation(st())
  if (!c || !rubrics.length) return null
  const k = n == null ? c.clipboards.findIndex(cb => cb.id === st().activeClipboardId) : n - 1
  const cb = c.clipboards[k]
  const symptom = cb?.symptoms.find(x => sameRubrics(x.rubrics, rubrics))
  return symptom ? { symptom, n: k + 1, name: cb.name } : null
}

/**
 * The changes a take makes to a symptom already on the clipboard; empty when it would change nothing.
 * A take that did not ask for an intensity keeps the symptom's one; the mini-language only sets the
 * qualifications and group it names, the F6 dialog (`replace`) sets them all.
 */
export function takePatch(x: Symptom, o: TakeOptions): Partial<Symptom> {
  const want: Partial<Symptom> = {}
  if (o.replace || weightGiven(o)) want.weight = o.weight
  if (o.replace) Object.assign(want, { eliminatory: o.eliminatory, exclusive: o.exclusive, causal: o.causal, group: o.group })
  else {
    if (o.eliminatory) Object.assign(want, { eliminatory: true, exclusive: false })
    if (o.exclusive) Object.assign(want, { exclusive: true, eliminatory: false })
    if (o.causal) want.causal = true
    if (o.group) want.group = o.group
  }
  const out: Partial<Symptom> = {}
  if (want.weight !== undefined && want.weight !== x.weight) out.weight = want.weight
  if (want.eliminatory !== undefined && want.eliminatory !== !!x.eliminatory) out.eliminatory = want.eliminatory
  if (want.exclusive !== undefined && want.exclusive !== !!x.exclusive) out.exclusive = want.exclusive
  if (want.causal !== undefined && want.causal !== !!x.causal) out.causal = want.causal
  if (want.group !== undefined && want.group !== (x.group ?? null)) out.group = want.group
  return out
}

/**
 * Take rubrics into a clipboard. Returns the number of symptoms added or updated. The whole take
 * (a new unsaved case, new clipboards, added and updated symptoms) is one undo step. A rubric
 * already on the clipboard only changes by what the take asked for (see takePatch); when nothing
 * changes the toast says where it already is.
 */
export function takeRefs(refs: RubricRef[], o: TakeOptions): number {
  if (!refs.length) { featureToast('error', () => 'No rubric to take', 'error'); return 0 }
  const newCase = !selectActiveConsultation(st())
  const pastBefore = st().past
  const result = actions.transaction(() => takeInto(refs, o), takeUndoLabel(refs))
  if (!result) { featureToast('error', () => 'No clipboard available', 'error'); return 0 }
  const { target, added, updated } = result
  for (const ref of refs.slice(0, 5)) recordRecent(ref)
  const what = refs.length === 1 ? refShort(refs[0]) : `${refs.length} rubrics`
  const leafNote = o.subRubrics && refs.length === 1 && (() => { const r = resolve(refs[0]); return !!r && r.rep.childCountOf(r.index) === 0 })() ? ' · no sub-rubrics' : ''
  const caseNote = newCase ? ' · new unsaved case' : ''
  const broad = broadTakeWarning(refs.map(ref => takeBreadth(ref, o.subRubrics)))
  if (added + updated === 0) { featureToast('same', () => `Already in ${clipboardTitle(target.n, target.name)}: ${what}`, 'info'); return 0 }
  // the history entry this take pushed: Undo only undoes it while it is still the latest change
  const entry = st().past !== pastBefore ? st().past[st().past.length - 1] : null
  const undo = () => {
    const past = st().past
    if (entry && past[past.length - 1] === entry) actions.undo()
    else featureToast('error', () => 'The case changed since this take; use Edit › Undo', 'info')
  }
  const verb = updated && !added ? 'Updated' : 'Taken'
  // a multi-rubric take names its last rubric too ("last: Fear and 2 more", never "last: 3 rubrics")
  // one line, no brackets: "Taken Mind - morning · ×2 · group a → Clipboard 1"
  const how = describeTake({ ...o, clipboard: null })
  const last = `${leafText(refs[refs.length - 1])}${refs.length > 1 ? ` and ${refs.length - 1} more` : ''} ${how}`
  takeToast({ count: added + updated, target: target.name, last }, `${verb} ${what} · ${how} → ${target.name}${leafNote}${caseNote}`, undo, broad)
  return added + updated
}

function takeInto(refs: RubricRef[], o: TakeOptions): { target: { id: string; name: string; n: number }; added: number; updated: number } | null {
  const cb = ensureClipboard(o.clipboard, { quiet: true })
  if (!cb) return null
  const n = (selectActiveConsultation(st())?.clipboards.findIndex(x => x.id === cb.id) ?? -1) + 1
  const target = { ...cb, n }
  const flags: Partial<Symptom> = { weight: o.weight, eliminatory: o.eliminatory, exclusive: o.exclusive, causal: o.causal, group: o.group }
  const plain = !o.eliminatory && !o.exclusive && !o.causal && !o.group && !o.subRubrics
  let added = 0, updated = 0
  const symptoms = () => selectActiveConsultation(st())?.clipboards.find(x => x.id === target.id)?.symptoms ?? []
  /** The symptom holding exactly these rubrics, if any (a plain take and a /s take of a leaf match the same one). */
  const findExisting = (rubrics: RubricRef[]) => symptoms().find(x => sameRubrics(x.rubrics, rubrics)) ?? null
  const fresh: RubricRef[] = []
  for (const ref of refs) {
    const r = o.subRubrics ? resolve(ref) : null
    // with sub-rubrics: one combined symptom; on a leaf this is just the rubric itself
    const rubrics = r ? subtreeRefs(r.rep, r.index) : [ref]
    const ex = findExisting(rubrics)
    if (ex) {
      const patch = takePatch(ex, o)
      if (Object.keys(patch).length) { actions.updateSymptoms(target.id, [ex.id], patch); updated++ }
      continue
    }
    if (plain) { fresh.push(ref); continue }
    const label = rubrics.length > 1 ? `${r ? r.rep.text(r.index) : ref} (with ${rubrics.length - 1} sub-rubrics)` : undefined
    if (actions.addSymptom(target.id, { ...flags, rubrics, combine: 'union', label })) added++
  }
  if (fresh.length) added += actions.addRubrics(fresh, { clipboardId: target.id, weight: o.weight })
  return { target, added, updated }
}

/** Which clipboards (1-based index and colour) of a consultation hold each rubric. */
export function clipboardMembership(c: Consultation | null): Map<RubricRef, { n: number; color: string; name: string }[]> {
  const map = new Map<RubricRef, { n: number; color: string; name: string }[]>()
  c?.clipboards.forEach((cb, i) => {
    for (const sym of cb.symptoms) for (const r of sym.rubrics) {
      const list = map.get(r) ?? []
      if (!list.some(x => x.n === i + 1)) list.push({ n: i + 1, color: cb.color, name: cb.name })
      map.set(r, list)
    }
  })
  return map
}

// ───────────── copy, bookmarks, notes ─────────────

export function sortedRemedies(rep: Repertory, i: number) {
  const cat = catalog()
  return rep.remedies(i).map(e => ({ ...e, abbrev: cat.remedy(e.remedyId).abbrev, name: cat.remedy(e.remedyId).name }))
    .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
}

export async function copyRubric(ref: RubricRef, withRemedies: boolean) {
  const r = resolve(ref)
  if (!r) return
  const path = r.rep.path(r.index)
  const rem = withRemedies ? sortedRemedies(r.rep, r.index) : []
  const text = withRemedies ? rubricPlainText(path, rem) : path
  try {
    if (withRemedies && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([rubricHtml(path, rem)], { type: 'text/html' }),
      })])
    } else await navigator.clipboard.writeText(text)
    recordRecent(ref)
    featureToast('copy', () => (withRemedies ? `Copied rubric with ${rem.length} remedies` : 'Copied rubric text'), 'success')
  } catch {
    featureToast('error', () => 'The browser blocked clipboard access', 'error')
  }
}

export function bookmarkOf(ref: RubricRef) { return st().bookmarks.find(b => b.ref === ref) ?? null }

export function toggleBookmark(ref: RubricRef) {
  const b = bookmarkOf(ref)
  if (b) {
    actions.removeBookmark(b.id)
    featureToast('bookmark', () => 'Bookmark removed', 'info', { label: 'Undo', run: () => actions.addBookmark(b.ref, b.label, b.folder) })
  } else {
    const r = resolve(ref)
    actions.addBookmark(ref, r ? r.rep.path(r.index) : ref)
    recordRecent(ref)
    featureToast('bookmark', () => 'Bookmarked', 'success', { label: 'Manage', run: () => actions.openDialog('repertory.bookmarks') })
  }
}

export const openNote = (ref: RubricRef) => actions.openDialog('repertory.note', { rubricRef: ref })
export const openTakeOptions = (refs: RubricRef[]) => actions.openDialog('repertory.take', { refs })
export const openFind = (fromCurrent: boolean) => {
  const cur = currentRubric()
  const repertory = cur?.tab.repertory ?? activeRepertoryTab()?.repertory ?? st().settings.defaultRepertory
  actions.openDialog('repertory.find', { repertory, from: fromCurrent && cur ? cur.index : -1, current: cur?.index ?? -1 })
}

/**
 * Open a repertory. With `reuse` (the default) a tab already showing that repertory is activated
 * (and moved to `rubric` when one is given); `reuse: false`, the explicit "new tab" action, always
 * opens another tab. A new tab appears at once and shows a loading skeleton while the book loads;
 * when loading fails the tab shows the error with Retry and an error toast says so.
 */
export async function openRepertory(abbrev?: string, rubric?: number, opts: { reuse?: boolean } = {}): Promise<void> {
  const a = abbrev ?? st().settings.defaultRepertory
  if (opts.reuse ?? true) {
    const s = st()
    const active = selectActiveTab(s)
    const existing = active?.kind === 'repertory' && active.repertory === a ? active
      : s.tabs.find((t): t is RepertoryTab => t.kind === 'repertory' && t.repertory === a)
    if (existing) {
      if (s.activeTabId !== existing.id) actions.activateTab(existing.id)
      if (rubric != null && rubric !== existing.rubric) actions.navigateRubric(existing.id, rubric)
      return
    }
  }
  actions.openTab({ kind: 'repertory', repertory: a, rubric: rubric ?? 0, back: [], forward: [] }, { reuse: false })
  try {
    await catalog().loadRepertory(a)
  } catch (e) {
    const title = catalogRef?.repertoryInfos.find(r => r.abbrev === a)?.title ?? a
    actions.toast(`Could not open ${title}: ${e instanceof Error ? e.message : 'load failed'}`, 'error')
  }
}

/** The repertory tab a rubric of this repertory is read in: the active one when it shows it. */
function tabFor(ref: RubricRef): RepertoryTab | null {
  const { repertory } = parseRef(ref)
  const a = activeRepertoryTab()
  if (a?.repertory === repertory) return a
  return st().tabs.find((t): t is RepertoryTab => t.kind === 'repertory' && t.repertory === repertory) ?? null
}

/** Highlight a remedy in the book showing `ref`'s repertory (null clears it). */
export function highlightRemedy(ref: RubricRef, remedyId: number | null) {
  const t = tabFor(ref)
  if (t) setHighlight(t.id, remedyId)
}

/**
 * The remedies of a rubric as menu entries, in book order with their grade; each opens a submenu to
 * highlight the remedy in the book or open its materia medica. Keyboard route to the highlight bar.
 */
export function remedyMenuItems(ref: RubricRef): MenuItem[] {
  const r = resolve(ref)
  if (!r) return []
  const cat = catalog()
  const t = tabFor(ref)
  const hl = t ? getHighlight(t.id) : null
  return alphaRemedies(r.rep, cat, r.index).map(x => {
    const rem = cat.remedy(x.id)
    return {
      label: `${bookAbbrev(rem.abbrev, x.grade)}  ${rem.name} (${GRADE_WORD[x.grade]})`,
      checked: hl === x.id ? true : undefined,
      submenu: [
        hl === x.id
          ? { label: 'Clear highlight', run: () => highlightRemedy(ref, null) }
          : { label: 'Highlight in book', run: () => highlightRemedy(ref, x.id) },
        { label: 'Open remedy', run: () => actions.openTab({ kind: 'remedy', remedyId: x.id }) },
      ],
    }
  })
}

/** Context menu of a rubric in the book view (right-click, Shift+F10, the ContextMenu key). */
export function rubricMenu(ref: RubricRef): MenuItem[] {
  const s = st()
  const c = selectActiveConsultation(s)
  const into = (n: number) => void takeRefs([ref], { ...DEFAULT_TAKE, clipboard: n })
  const count = c?.clipboards.length ?? 0
  return [
    { command: 'rubric.add', label: 'Take' },
    { label: 'Take with intensity', submenu: [2, 3, 4].map(w => ({ command: `rubric.add.w${w}`, label: `Intensity ${w}` })) },
    { command: 'rubric.takeOptions' },
    {
      label: 'Take into clipboard', submenu: [
        ...(c?.clipboards ?? []).map((cb, n) => ({ label: `${n + 1}  ${cb.name} (${cb.symptoms.length})`, run: () => into(n + 1) })),
        ...(count < MAX_CLIPBOARDS ? [{ type: 'separator' as const }, { label: 'New clipboard', run: () => into(count + 1) }] : []),
      ],
    },
    { type: 'separator' },
    (() => {
      const r = resolve(ref)
      const n = r ? r.rep.remedyCount(r.index) : 0
      return n ? { label: `Remedies (${n})`, submenu: remedyMenuItems(ref) } : { label: 'Remedies', disabled: true }
    })(),
    { type: 'separator' },
    { command: 'rubric.copy' },
    { command: 'rubric.copyText' },
    { type: 'separator' },
    { command: 'rubric.bookmark', label: bookmarkOf(ref) ? 'Remove bookmark' : 'Bookmark' },
    { command: 'rubric.note', label: s.rubricNotes[ref] ? 'Edit note…' : 'Add note…' },
    { command: 'rubric.openNewTab' },
    { command: 'nav.findHere', label: 'Find from here…' },
  ]
}
