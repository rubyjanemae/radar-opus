import type { Catalog } from '../../data/catalog'
import { parseRef } from '../../data/catalog'
import type { Repertory } from '../../data/repertory'
import type { RubricRef } from '../../data/types'
import type { Symptom } from '../../engine/model'
import { actions, selectActiveClipboard, selectActiveConsultation, selectActiveTab, useApp, MAX_CLIPBOARDS } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import type { Consultation } from '../../state/patients'
import { describeTake, rubricHtml, rubricPlainText } from './take'
import type { TakeOptions } from './take'

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

/** Navigate to a rubric: in the active repertory tab if it shows that repertory, else in another tab (or a new one). */
export async function goToRef(ref: RubricRef, opts: { newTab?: boolean } = {}) {
  const { repertory, index } = parseRef(ref)
  try { await catalog().loadRepertory(repertory) } catch (e) { actions.toast(e instanceof Error ? e.message : 'Could not load repertory', 'error'); return }
  const s = st()
  const active = selectActiveTab(s)
  if (!opts.newTab && active?.kind === 'repertory') {
    if (active.repertory === repertory) actions.navigateRubric(active.id, index)
    else actions.updateTab(active.id, { repertory, rubric: index, back: [], forward: [] })
    return
  }
  const other = opts.newTab ? undefined : s.tabs.find(t => t.kind === 'repertory' && t.repertory === repertory)
  if (other) { actions.activateTab(other.id); actions.navigateRubric(other.id, index); return }
  actions.openTab({ kind: 'repertory', repertory, rubric: index, back: [], forward: [] }, { reuse: false })
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

const leafOf = (refs: RubricRef[]) => {
  if (refs.length !== 1) return `${refs.length} rubrics`
  const r = resolve(refs[0])
  return r ? r.rep.text(r.index) : refs[0]
}

/** Short label for a rubric in feedback: the chapter and the last two levels. */
export function refShort(ref: RubricRef): string {
  const r = resolve(ref)
  if (!r) return ref
  const line = r.rep.lineage(r.index).map(i => r.rep.text(i))
  return line.length <= 3 ? line.join(' - ') : `${line[0]} - … - ${line.slice(-2).join(' - ')}`
}

// ───────────── recent rubrics ─────────────

export const MAX_RECENT = 20

/** Most-recent-first list with `index` moved to the front. */
export function pushRecent(list: readonly number[] | undefined, index: number, max = MAX_RECENT): number[] {
  const out = [index, ...(list ?? []).filter(x => x !== index)]
  return out.length > max ? out.slice(0, max) : out
}

/** Record a rubric in the Recent list of the repertory tab(s) showing its repertory (active tab first). */
export function recordRecent(ref: RubricRef, tabId?: string) {
  const { repertory, index } = parseRef(ref)
  const s = st()
  const active = selectActiveTab(s)
  const own = tabId ? s.tabs.find((t): t is RepertoryTab => t.id === tabId && t.kind === 'repertory' && t.repertory === repertory) : undefined
  const tab = own ?? (active?.kind === 'repertory' && active.repertory === repertory ? active : s.tabs.find((t): t is RepertoryTab => t.kind === 'repertory' && t.repertory === repertory))
  if (!tab || tab.recent?.[0] === index) return
  actions.updateTab<RepertoryTab>(tab.id, { recent: pushRecent(tab.recent, index) })
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

/** Resolve a 1-based clipboard number (null = active), creating clipboards up to that number. */
export function ensureClipboard(n: number | null, opts: { quiet?: boolean } = {}): { id: string; name: string } | null {
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

/** Take rubrics into a clipboard. Returns the number of symptoms added or updated. */
export function takeRefs(refs: RubricRef[], o: TakeOptions): number {
  if (!refs.length) { featureToast('error', () => 'No rubric to take', 'error'); return 0 }
  const newCase = !selectActiveConsultation(st())
  const target = ensureClipboard(o.clipboard, { quiet: true })
  if (!target) { featureToast('error', () => 'No clipboard available', 'error'); return 0 }
  const flags: Partial<Symptom> = { weight: o.weight, eliminatory: o.eliminatory, exclusive: o.exclusive, causal: o.causal, group: o.group }
  const plain = !o.eliminatory && !o.exclusive && !o.causal && !o.group && !o.subRubrics
  let added = 0, updated = 0
  const symptoms = () => selectActiveConsultation(st())?.clipboards.find(cb => cb.id === target.id)?.symptoms ?? []
  /** The symptom holding exactly these rubrics, if any (a plain take and a /s take of a leaf match the same one). */
  const findExisting = (rubrics: RubricRef[]) => symptoms().find(x => sameRubrics(x.rubrics, rubrics)) ?? null
  const differs = (x: Symptom) => x.weight !== o.weight || !!x.eliminatory !== o.eliminatory || !!x.exclusive !== o.exclusive || !!x.causal !== o.causal || (x.group ?? null) !== o.group
  if (plain) {
    const fresh = refs.filter(r => !findExisting([r]))
    const existing = refs.map(r => findExisting([r])).filter((x): x is Symptom => !!x && x.weight !== o.weight)
    if (fresh.length) added = actions.addRubrics(fresh, { clipboardId: target.id, weight: o.weight })
    if (existing.length) { actions.updateSymptoms(target.id, existing.map(x => x.id), { weight: o.weight }); updated = existing.length }
  } else {
    for (const ref of refs) {
      const r = o.subRubrics ? resolve(ref) : null
      // with sub-rubrics: one combined symptom; on a leaf this is just the rubric itself
      const rubrics = r ? subtreeRefs(r.rep, r.index) : [ref]
      const ex = findExisting(rubrics)
      if (ex) {
        if (differs(ex)) { actions.updateSymptoms(target.id, [ex.id], flags); updated++ }
        continue
      }
      const label = rubrics.length > 1 ? `${r ? r.rep.text(r.index) : ref} (with ${rubrics.length - 1} sub-rubrics)` : undefined
      if (actions.addSymptom(target.id, { ...flags, rubrics, combine: 'union', label })) added++
    }
  }
  for (const ref of refs.slice(0, 5)) recordRecent(ref)
  const what = refs.length === 1 ? refShort(refs[0]) : `${refs.length} rubrics`
  const leafNote = o.subRubrics && refs.length === 1 && (() => { const r = resolve(refs[0]); return !!r && r.rep.childCountOf(r.index) === 0 })() ? ' · no sub-rubrics' : ''
  const caseNote = newCase ? ' · new unsaved case' : ''
  if (added + updated === 0) featureToast('same', () => `Already in ${target.name}: ${what}`, 'info')
  else {
    const verb = updated && !added ? 'Updated' : 'Taken'
    featureToast(
      'take',
      n => n > 1 ? `${n} rubrics taken · last: ${leafOf(refs)} (${describeTake(o, target.name)})` : `${verb} ${what} (${describeTake(o, target.name)}${leafNote}${caseNote})`,
      'success', { label: 'Undo', run: () => actions.undo() }, added + updated,
    )
  }
  return added + updated
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

/** Open a repertory tab: the default one when none is given. */
export async function openRepertory(abbrev?: string, rubric = 0) {
  const a = abbrev ?? st().settings.defaultRepertory
  try { await catalog().loadRepertory(a) } catch (e) { actions.toast(e instanceof Error ? e.message : 'Could not load repertory', 'error'); return }
  actions.openTab({ kind: 'repertory', repertory: a, rubric, back: [], forward: [] }, { reuse: false })
}
