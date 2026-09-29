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

/** Make sure there is a consultation to take into; creates an "Unsaved case" if needed. */
export function ensureConsultation(): string {
  const s = st()
  const c = selectActiveConsultation(s)
  if (c) return c.id
  const pid = actions.createPatient({ lastName: 'Unsaved case', firstName: '' })
  const cid = actions.createConsultation(pid, { title: 'Unsaved case' })
  actions.toast('Started an unsaved case for your symptoms', 'info')
  return cid
}

/** Resolve a 1-based clipboard number (null = active), creating clipboards up to that number. */
export function ensureClipboard(n: number | null): { id: string; name: string } | null {
  ensureConsultation()
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

/** Take rubrics into a clipboard. Returns the number of symptoms added or updated. */
export function takeRefs(refs: RubricRef[], o: TakeOptions): number {
  if (!refs.length) { actions.toast('No rubric to take', 'error'); return 0 }
  const target = ensureClipboard(o.clipboard)
  if (!target) { actions.toast('No clipboard available', 'error'); return 0 }
  const plain = !o.eliminatory && !o.exclusive && !o.causal && !o.group && !o.subRubrics
  const flags: Partial<Symptom> = { weight: o.weight, eliminatory: o.eliminatory, exclusive: o.exclusive, causal: o.causal, group: o.group }
  let added = 0, updated = 0
  const findExisting = (ref: RubricRef) => {
    const c = selectActiveConsultation(st())
    return c?.clipboards.find(cb => cb.id === target.id)?.symptoms.find(x => x.rubrics.length === 1 && x.rubrics[0] === ref) ?? null
  }
  if (plain) {
    const fresh = refs.filter(r => !findExisting(r))
    const existing = refs.map(findExisting).filter((x): x is Symptom => !!x && x.weight !== o.weight)
    if (fresh.length) added = actions.addRubrics(fresh, { clipboardId: target.id, weight: o.weight })
    if (existing.length) { actions.updateSymptoms(target.id, existing.map(x => x.id), { weight: o.weight }); updated = existing.length }
  } else {
    for (const ref of refs) {
      if (o.subRubrics) {
        const r = resolve(ref)
        const rubrics = r ? subtreeRefs(r.rep, r.index) : [ref]
        if (actions.addSymptom(target.id, { ...flags, rubrics, combine: 'union', label: rubrics.length > 1 ? `${r ? r.rep.text(r.index) : ref} (with ${rubrics.length - 1} sub-rubrics)` : undefined })) added++
        continue
      }
      const ex = findExisting(ref)
      if (ex) { actions.updateSymptoms(target.id, [ex.id], flags); updated++ }
      else if (actions.addSymptom(target.id, { ...flags, rubrics: [ref] })) added++
    }
  }
  const what = refs.length === 1 ? refLabel(refs[0]) : `${refs.length} rubrics`
  if (added + updated === 0) actions.toast(`Already in ${target.name}: ${what}`, 'info')
  else actions.toast(`${updated && !added ? 'Updated' : 'Taken'} ${what} (${describeTake(o, target.name)})`, 'success', { label: 'Undo', run: () => actions.undo() })
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
    actions.toast(withRemedies ? `Copied rubric with ${rem.length} remedies` : 'Copied rubric text', 'success')
  } catch {
    actions.toast('The browser blocked clipboard access', 'error')
  }
}

export function bookmarkOf(ref: RubricRef) { return st().bookmarks.find(b => b.ref === ref) ?? null }

export function toggleBookmark(ref: RubricRef) {
  const b = bookmarkOf(ref)
  if (b) {
    actions.removeBookmark(b.id)
    actions.toast('Bookmark removed', 'info', { label: 'Undo', run: () => actions.addBookmark(b.ref, b.label, b.folder) })
  } else {
    const r = resolve(ref)
    actions.addBookmark(ref, r ? r.rep.path(r.index) : ref)
    actions.toast('Bookmarked', 'success', { label: 'Manage', run: () => actions.openDialog('repertory.bookmarks') })
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
