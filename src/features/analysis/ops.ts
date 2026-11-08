import type { Catalog } from '../../data/catalog'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import type { AnalysisOptions, StrategyId } from '../../engine/model'
import { actions, selectActiveConsultation, selectActiveTab, useApp } from '../../state/store'
import type { AnalysisTab, AnalysisViewMode } from '../../state/workspace'
import { getDialog } from '../../shell/dialogs'
import { downloadBlob } from '../../ui/files'
import { openPrescription } from '../patients/ops'
import { consultationsOldestFirst } from '../patients/panel'
import type { Consultation, SavedAnalysis } from '../../state/patients'
import { uid } from '../../state/ids'
import type { ExportMeta } from './labels'
import { sourceFor } from './source'
import { analysedOptions, analysisViewGrade, analyzeCached, repertoriesOf } from './useAnalysis'

const st = () => useApp.getState()
let catalogRef: Catalog | null = null
export function setAnalysisCatalog(c: Catalog) { catalogRef = c }
function catalog(): Catalog {
  if (!catalogRef) throw new Error('Analysis catalog not set')
  return catalogRef
}

/** Kinds of family filter dialogs the families feature may register; the first registered one is used. */
export const FAMILY_FILTER_DIALOGS = ['families.filter']
export const REMEDY_FILTER_DIALOG = 'analysis.remedyFilter'
export const COMPARE_DIALOG = 'analysis.compare'

export const LIMITS = [10, 20, 30, 50, 100, 200, 100000]

export function activeAnalysisTab(): AnalysisTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'analysis' ? t : null
}

/**
 * Consultation that analysis and family-filter commands act on: the active case, else the active
 * analysis tab's case, else the case of the most recent analysis tab. An analysis tab bound to
 * another case says so in a banner (see AnalysisView), and its own toolbar acts on its own case.
 * Shared by the families feature, so the family filter and the analysis filters always agree.
 */
export function targetConsultationId(s: ReturnType<typeof st> = st()): string | null {
  const c = selectActiveConsultation(s)
  if (c) return c.id
  const a = selectActiveTab(s)
  const t = a?.kind === 'analysis' ? a : null
  if (t && s.consultations[t.consultationId]) return t.consultationId
  for (let i = s.tabs.length - 1; i >= 0; i--) {
    const x = s.tabs[i]
    if (x.kind === 'analysis' && s.consultations[x.consultationId]) return x.consultationId
  }
  return null
}

/** The analysis tab of a consultation, when one is open. */
export function analysisTabOf(consultationId: string): AnalysisTab | null {
  return (st().tabs.find(t => t.kind === 'analysis' && t.consultationId === consultationId) as AnalysisTab | undefined) ?? null
}

/** True when the visible tab is the analysis of this consultation (nothing to "open"). */
export function isAnalysisVisible(consultationId: string): boolean {
  return activeAnalysisTab()?.consultationId === consultationId
}

/** Open (or focus) the analysis tab of a consultation, moving keyboard focus into it. */
/** `symptomsOnly`: F7 shows the symptom pane alone; every other way in (F8, remedy jumps) shows symptoms and remedies. */
export function openAnalysisFor(consultationId: string, remedy?: number, symptomsOnly = false) {
  if (!st().consultations[consultationId]) return
  // notifications about the previous step (a take's "Taken … · Undo") would cover the grid's lower right;
  // the analysis window shows none (RadarOpus), and Edit › Undo still undoes the step
  for (const t of st().toasts) actions.dismissToast(t.id)
  actions.openTab({ kind: 'analysis', consultationId })
  const t = activeAnalysisTab()
  if (!t) return
  if (!!t.symptomsOnly !== symptomsOnly) actions.updateTab<AnalysisTab>(t.id, { symptomsOnly })
  if (remedy !== undefined) requestReveal(t.id, remedy)
  else requestFocus(t.id)
}

/** Rebind an analysis tab to the active case (or show that case's own analysis tab when it has one). */
export function switchToActiveCase(tab: AnalysisTab) {
  const active = selectActiveConsultation(st())
  if (!active || active.id === tab.consultationId) return
  const other = analysisTabOf(active.id)
  if (other) { actions.activateTab(other.id); requestFocus(other.id); return }
  actions.updateTab<AnalysisTab>(tab.id, { consultationId: active.id, remedy: null, symptom: null, pinnedRemedies: null })
  requestFocus(tab.id)
}

export function targetOptions(): AnalysisOptions | null {
  const id = targetConsultationId()
  return id ? st().consultations[id]?.analysis ?? null : null
}

export function setOptions(patch: Partial<AnalysisOptions>, consultationId = targetConsultationId()) {
  if (consultationId) actions.setAnalysis(consultationId, patch)
}

/* Focus requests: move keyboard focus into an analysis tab once its content is rendered (F8). */
const pendingFocus = new Set<string>()
const focusListeners = new Set<(tabId: string) => void>()
export function requestFocus(tabId: string) {
  pendingFocus.add(tabId)
  focusListeners.forEach(fn => fn(tabId))
}
export function takeFocus(tabId: string): boolean { return pendingFocus.delete(tabId) }
export function onFocusRequest(fn: (tabId: string) => void) {
  focusListeners.add(fn)
  return () => { focusListeners.delete(fn) }
}

/* Strategy parameter drawer requests (analysis.params): toggle the "Advanced" drawer of an analysis tab. */
const paramsListeners = new Set<(tabId: string) => void>()
export function toggleParams(tabId = activeAnalysisTab()?.id) {
  if (tabId) paramsListeners.forEach(fn => fn(tabId))
}
export function onParamsRequest(fn: (tabId: string) => void) {
  paramsListeners.add(fn)
  return () => { paramsListeners.delete(fn) }
}

/* Reveal requests: a remedy to select, pin (when beyond the limit), scroll to and focus in an analysis tab. */
const pendingReveal = new Map<string, number>()
const revealListeners = new Set<(tabId: string, remedyId: number) => void>()
export function requestReveal(tabId: string, remedyId: number) {
  pendingReveal.set(tabId, remedyId)
  revealListeners.forEach(fn => fn(tabId, remedyId))
}
/** The reveal waiting for a tab, left in place (takeReveal consumes it). */
export function peekReveal(tabId: string): number | undefined {
  return pendingReveal.get(tabId)
}
export function takeReveal(tabId: string): number | undefined {
  const r = pendingReveal.get(tabId)
  pendingReveal.delete(tabId)
  return r
}
export function onReveal(fn: (tabId: string, remedyId: number) => void) {
  revealListeners.add(fn)
  return () => { revealListeners.delete(fn) }
}

export function openAnalysis(remedy?: number, symptomsOnly = false) {
  const id = targetConsultationId()
  if (!id) {
    actions.toast('No active case. Create or open a case to analyse its symptoms.', 'info', { label: 'New case', run: () => actions.openDialog('clipboard.newCase') })
    return
  }
  openAnalysisFor(id, remedy, symptomsOnly)
}

/** Remedy box / external jumps: select the remedy and append it as a pinned column when it is not shown. */
export function pinAndSelect(tab: AnalysisTab, remedyId: number) {
  const pinned = [...(tab.pinnedRemedies ?? []).filter(x => x !== remedyId), remedyId].slice(-5)
  actions.updateTab<AnalysisTab>(tab.id, { remedy: remedyId, pinnedRemedies: pinned })
}

export function unpin(tab: AnalysisTab, remedyId?: number) {
  actions.updateTab<AnalysisTab>(tab.id, { pinnedRemedies: remedyId === undefined ? null : (tab.pinnedRemedies ?? []).filter(x => x !== remedyId) })
}

const optionsOf = (id: string | null) => (id ? st().consultations[id]?.analysis ?? null : null)

export function setStrategy(strategy: StrategyId, consultationId = targetConsultationId()) { setOptions({ strategy }, consultationId) }

/**
 * Analysis › Select your default analysis method: the method new analyses start with (settings), which
 * the current case's analysis also switches to so the choice shows at once.
 */
export function setDefaultStrategy(strategy: StrategyId, consultationId = targetConsultationId()) {
  actions.setSettings({ defaultStrategy: strategy })
  if (consultationId && optionsOf(consultationId)?.strategy !== strategy) setStrategy(strategy, consultationId)
}

export function toggleIntensity(consultationId = targetConsultationId()) {
  const o = optionsOf(consultationId)
  if (o) setOptions({ useIntensity: o.useIntensity === false }, consultationId)
}

export function toggleShowExcluded(consultationId = targetConsultationId()) {
  const o = optionsOf(consultationId)
  if (o) setOptions({ showExcluded: !o.showExcluded }, consultationId)
}

export function setView(view: AnalysisViewMode) {
  const t = activeAnalysisTab()
  // choosing a display brings the remedies back after "symptoms only" (F7)
  if (t) actions.updateTab<AnalysisTab>(t.id, { view, symptomsOnly: false })
}

export function hasFilter(o: AnalysisOptions | null = targetOptions()): boolean {
  return !!o && (o.remedyFilter !== null || o.excludedRemedies.length > 0 || (o.highlight?.length ?? 0) > 0 || o.minCoverage > 0)
}

/** Family filter dialog kind, when the families feature registered one. */
export function familyFilterDialog(): string | null {
  return FAMILY_FILTER_DIALOGS.find(k => getDialog(k)) ?? null
}

/** Toolbar filter button: the family filter when available, else the remedy picker. */
export function openFilter(id = targetConsultationId()) {
  if (!id) return
  actions.openDialog(familyFilterDialog() ?? REMEDY_FILTER_DIALOG, { consultationId: id })
}

/** analysis.remedies: the analysis's own include / exclude / highlight picker with minimum coverage. */
export function openRemedyFilter(id = targetConsultationId()) {
  if (id) actions.openDialog(REMEDY_FILTER_DIALOG, { consultationId: id })
}

export function clearFilter(consultationId = targetConsultationId()) {
  setOptions({ remedyFilter: null, filterLabel: null, filterGroups: null, excludedRemedies: [], highlight: null, highlightLabel: null, highlightGroups: null, minCoverage: 0 }, consultationId)
}

export function toggleExcluded(remedyId: number, consultationId = targetConsultationId()) {
  const c = consultationId ? st().consultations[consultationId] : null
  if (!c) return
  const ex = c.analysis.excludedRemedies
  setOptions({ excludedRemedies: ex.includes(remedyId) ? ex.filter(x => x !== remedyId) : [...ex, remedyId] }, c.id)
}

export function openCompare(remedies?: number[], id = targetConsultationId()) {
  if (id) actions.openDialog(COMPARE_DIALOG, { consultationId: id, initial: remedies })
}

/**
 * Prescribe a remedy from the analysis: the patients package's add-prescription flow shows the case's
 * new-prescription form with the remedy filled in and focused.
 */
export function prescribe(remedyId: number, consultationId = targetConsultationId()) {
  if (!consultationId || !st().consultations[consultationId]) return
  openPrescription(consultationId, remedyId)
}

/** Strategy parameters of a case (§6): a full set replaces the saved one; null restores the defaults. */
export function setParams(params: AnalysisOptions['params'] | null, consultationId = targetConsultationId()) {
  setOptions({ params: params ?? undefined }, consultationId)
}

export function openRemedyTab(remedyId: number) { actions.openTab({ kind: 'remedy', remedyId }) }
export function openMateriaMedica(remedyId: number) { actions.openTab({ kind: 'materia-medica', remedyId, query: '' }) }

/** Consultation of print / export: the visible analysis tab's (what the user is looking at), else the target case. */
function outputConsultationId(): string | null {
  const t = activeAnalysisTab()
  return t && st().consultations[t.consultationId] ? t.consultationId : targetConsultationId()
}

export type ComputedAnalysis = { result: AnalysisResult; rows: AnalysisRow[]; meta: ExportMeta; consultationId: string }

/** The analysis of a case for commands (loads referenced repertories first; shares the views' cache). */
export async function computeTarget(id = outputConsultationId()): Promise<ComputedAnalysis | null> {
  const c0 = id ? st().consultations[id] : null
  if (!c0) return null
  const cat = catalog()
  await Promise.all(repertoriesOf(c0.clipboards).map(a => cat.loadRepertory(a).catch(() => null)))
  const c = st().consultations[c0.id] ?? c0
  const result = analyzeCached(sourceFor(cat), cat, c.clipboards, analysedOptions(c, st().activeClipboardId), { minGrade: analysisViewGrade(c.analysis) })
  const p = st().patients[c.patientId]
  const title = `${p ? `${p.lastName}${p.firstName ? `, ${p.firstName}` : ''}` : 'Case'} · ${c.title} · ${c.date}`
  const meta: ExportMeta = {
    title,
    clipboardName: cbId => c.clipboards.find(x => x.id === cbId)?.name ?? '',
    remedyAbbrev: r => cat.remedy(r).abbrev,
    remedyName: r => cat.remedy(r).name,
  }
  return { result, rows: result.rows, meta, consultationId: c.id }
}

/* CSV / PNG export and printing are loaded on demand: F8 never pays for them. */
const loadExport = () => import('./export')

export async function exportCsv(id?: string) {
  const t = await computeTarget(id)
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to export: the analysed clipboards are empty', 'info'); return }
  const { analysisCsv, safeFileName } = await loadExport()
  downloadBlob(new Blob(['﻿' + analysisCsv(t.result, t.rows, t.meta)], { type: 'text/csv;charset=utf-8' }), `${safeFileName(t.meta.title)}.csv`)
  actions.toast('Analysis exported as CSV', 'success')
}

/** Edit › Copy analysis: the analysis table as tab-separated text on the system clipboard. */
export async function copyAnalysis(id?: string) {
  const t = await computeTarget(id)
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to copy: the analysed clipboards are empty', 'info'); return }
  const { analysisText } = await loadExport()
  try {
    await navigator.clipboard.writeText(analysisText(t.result, t.rows, t.meta))
    actions.toast('Analysis copied', 'success')
  } catch {
    actions.toast('Copy failed: the browser did not allow access to the clipboard', 'error')
  }
}

/** Longest mail body handed to the mail program (mailto: links beyond ~2000 characters are cut or refused). */
const MAIL_BODY_MAX = 1800

/** Analysis › Send current analysis by email: opens the mail program with the analysis as the message text. */
export async function emailAnalysis(id?: string) {
  const t = await computeTarget(id)
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to send: the analysed clipboards are empty', 'info'); return }
  const { analysisText } = await loadExport()
  let body = analysisText(t.result, t.rows, t.meta)
  if (body.length > MAIL_BODY_MAX) {
    const cut = body.lastIndexOf('\n', MAIL_BODY_MAX)
    body = `${body.slice(0, cut > 0 ? cut : MAIL_BODY_MAX)}\n…\n(Shortened: Edit › Copy analysis copies the whole analysis.)`
  }
  window.location.href = `mailto:?subject=${encodeURIComponent(t.meta.title)}&body=${encodeURIComponent(body)}`
}

export async function exportPng(id?: string) {
  const t = await computeTarget(id)
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to export: the analysed clipboards are empty', 'info'); return }
  try {
    const { analysisPng, safeFileName } = await loadExport()
    downloadBlob(await analysisPng(t.result, t.rows.slice(0, 120), t.meta), `${safeFileName(t.meta.title)}.png`)
    actions.toast('Analysis exported as PNG', 'success')
  } catch (e) {
    actions.toast(e instanceof Error ? e.message : 'PNG export failed', 'error')
  }
}

export async function printAnalysis(id?: string) {
  const t = await computeTarget(id)
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to print: the analysed clipboards are empty', 'info'); return }
  const { printResult } = await import('./print')
  printResult(t)
}

/* Analysis › Save current analysis / Recall an existing analysis / Show old analysis with old Remedy */
export const SAVE_DIALOG = 'analysis.save'
export const RECALL_DIALOG = 'analysis.recall'
export const DEFAULT_METHOD_DIALOG = 'analysis.defaultMethod'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** The case the save / recall commands act on: the visible analysis tab's, else the target case. */
function savedTarget(): Consultation | null {
  const id = activeAnalysisTab()?.consultationId ?? targetConsultationId()
  return id ? st().consultations[id] ?? null : null
}

export function canSaveAnalysis(): boolean { return !!savedTarget()?.clipboards.some(cb => cb.symptoms.length > 0) }
export function canRecallAnalysis(): boolean { return (savedTarget()?.savedAnalyses?.length ?? 0) > 0 }
export function openSaveAnalysis() { const c = savedTarget(); if (c) actions.openDialog(SAVE_DIALOG, { consultationId: c.id }) }
export function openDefaultMethod() { actions.openDialog(DEFAULT_METHOD_DIALOG, {}) }
export function openRecallAnalysis() { const c = savedTarget(); if (c) actions.openDialog(RECALL_DIALOG, { consultationId: c.id }) }

/** Store a named snapshot of the case's clipboards and analysis options; it becomes the current analysis. */
export function saveAnalysis(consultationId: string, name: string): SavedAnalysis | null {
  const c = st().consultations[consultationId]
  if (!c) return null
  const saved: SavedAnalysis = { id: uid('an'), name: name.trim(), savedAt: Date.now(), clipboards: clone(c.clipboards), analysis: clone(c.analysis) }
  actions.updateConsultation(c.id, { savedAnalyses: [...(c.savedAnalyses ?? []), saved], currentAnalysisId: saved.id })
  actions.toast(`Analysis ${(c.savedAnalyses?.length ?? 0) + 1} saved`, 'success')
  return saved
}

/** Replace the case's clipboards and analysis options by a saved analysis (one undo step). */
export function recallAnalysis(consultationId: string, savedId: string): boolean {
  const c = st().consultations[consultationId]
  const saved = c?.savedAnalyses?.find(a => a.id === savedId)
  if (!c || !saved) return false
  const clipboards = clone(saved.clipboards)
  actions.updateConsultation(c.id, { clipboards, analysis: clone(saved.analysis), currentAnalysisId: saved.id })
  const s = st()
  if (s.activeConsultationId === c.id && !clipboards.some(cb => cb.id === s.activeClipboardId) && clipboards[0]) actions.setActiveClipboard(clipboards[0].id)
  openAnalysisFor(c.id)
  return true
}

export function deleteSavedAnalysis(consultationId: string, savedId: string) {
  const c = st().consultations[consultationId]
  if (!c?.savedAnalyses?.some(a => a.id === savedId)) return
  const rest = c.savedAnalyses.filter(a => a.id !== savedId)
  actions.updateConsultation(c.id, { savedAnalyses: rest.length ? rest : undefined, currentAnalysisId: c.currentAnalysisId === savedId ? undefined : c.currentAnalysisId })
}

/** The patient's previous consultation and the remedy prescribed there (its last prescription). */
export function oldAnalysis(): { consultationId: string; remedyId: number } | null {
  const c = savedTarget()
  if (!c) return null
  const list = consultationsOldestFirst(st().consultations, c.patientId)
  const i = list.findIndex(x => x.id === c.id)
  for (let j = i - 1; j >= 0; j--) {
    const rx = list[j].prescriptions[list[j].prescriptions.length - 1]
    if (rx) return { consultationId: list[j].id, remedyId: rx.remedyId }
  }
  return null
}

/** Open the previous consultation's analysis with the remedy prescribed then selected and scrolled into view. */
export function showOldAnalysis() {
  const o = oldAnalysis()
  if (o) openAnalysisFor(o.consultationId, o.remedyId)
}
