import type { Catalog } from '../../data/catalog'
import { analyze } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import type { AnalysisOptions, StrategyId } from '../../engine/model'
import { actions, selectActiveConsultation, selectActiveTab, useApp } from '../../state/store'
import type { AnalysisTab, AnalysisViewMode } from '../../state/workspace'
import { getDialog } from '../../shell/dialogs'
import { downloadBlob } from '../../ui/files'
import { analysisCsv, analysisPng, safeFileName } from './export'
import type { ExportMeta } from './export'
import { sourceFor } from './source'
import { repertoriesOf } from './useAnalysis'

const st = () => useApp.getState()
let catalogRef: Catalog | null = null
export function setAnalysisCatalog(c: Catalog) { catalogRef = c }
function catalog(): Catalog {
  if (!catalogRef) throw new Error('Analysis catalog not set')
  return catalogRef
}

/** Kinds of family filter dialogs the families feature may register; the first registered one is used. */
export const FAMILY_FILTER_DIALOGS = ['families.filter', 'families.limit']
export const REMEDY_FILTER_DIALOG = 'analysis.remedyFilter'
export const COMPARE_DIALOG = 'analysis.compare'

export const LIMITS = [10, 20, 30, 50, 100, 200, 100000]

export function activeAnalysisTab(): AnalysisTab | null {
  const t = selectActiveTab(st())
  return t?.kind === 'analysis' ? t : null
}

/** Consultation the analysis commands act on: the active analysis tab's, else the active case. */
export function targetConsultationId(): string | null {
  const t = activeAnalysisTab()
  if (t && st().consultations[t.consultationId]) return t.consultationId
  return selectActiveConsultation(st())?.id ?? null
}

export function targetOptions(): AnalysisOptions | null {
  const id = targetConsultationId()
  return id ? st().consultations[id]?.analysis ?? null : null
}

export function setOptions(patch: Partial<AnalysisOptions>, consultationId = targetConsultationId()) {
  if (consultationId) actions.setAnalysis(consultationId, patch)
}

/* Reveal requests: a remedy to select, pin (when beyond the limit), scroll to and focus in an analysis tab. */
const pendingReveal = new Map<string, number>()
const revealListeners = new Set<(tabId: string, remedyId: number) => void>()
export function requestReveal(tabId: string, remedyId: number) {
  pendingReveal.set(tabId, remedyId)
  revealListeners.forEach(fn => fn(tabId, remedyId))
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

export function openAnalysis(remedy?: number) {
  const id = targetConsultationId()
  if (!id) {
    actions.toast('No active case. Create or open a case to analyse its symptoms.', 'info', { label: 'New case', run: () => actions.openDialog('clipboard.newCase') })
    return
  }
  actions.openTab({ kind: 'analysis', consultationId: id })
  if (remedy !== undefined) {
    const t = activeAnalysisTab()
    if (t) requestReveal(t.id, remedy)
  }
}

/** Remedy box / external jumps: select the remedy and append it as a pinned column when it is not shown. */
export function pinAndSelect(tab: AnalysisTab, remedyId: number) {
  const pinned = [...(tab.pinnedRemedies ?? []).filter(x => x !== remedyId), remedyId].slice(-5)
  actions.updateTab<AnalysisTab>(tab.id, { remedy: remedyId, pinnedRemedies: pinned })
}

export function unpin(tab: AnalysisTab, remedyId?: number) {
  actions.updateTab<AnalysisTab>(tab.id, { pinnedRemedies: remedyId === undefined ? null : (tab.pinnedRemedies ?? []).filter(x => x !== remedyId) })
}

export function setStrategy(strategy: StrategyId) { setOptions({ strategy }) }

export function toggleIntensity() {
  const o = targetOptions()
  if (o) setOptions({ useIntensity: o.useIntensity === false })
}

export function toggleShowExcluded() {
  const o = targetOptions()
  if (o) setOptions({ showExcluded: !o.showExcluded })
}

export function setView(view: AnalysisViewMode) {
  const t = activeAnalysisTab()
  if (t) actions.updateTab<AnalysisTab>(t.id, { view })
}

export function hasFilter(o: AnalysisOptions | null = targetOptions()): boolean {
  return !!o && (o.remedyFilter !== null || o.excludedRemedies.length > 0 || (o.highlight?.length ?? 0) > 0 || o.minCoverage > 0)
}

/** Family filter dialog kind, when the families feature registered one. */
export function familyFilterDialog(): string | null {
  return FAMILY_FILTER_DIALOGS.find(k => getDialog(k)) ?? null
}

/** analysis.filter: the family filter when available, else the remedy picker. */
export function openFilter() {
  const id = targetConsultationId()
  if (!id) return
  actions.openDialog(familyFilterDialog() ?? REMEDY_FILTER_DIALOG, { consultationId: id })
}

/** analysis.remedies: the analysis's own include / exclude / highlight picker with minimum coverage. */
export function openRemedyFilter() {
  const id = targetConsultationId()
  if (id) actions.openDialog(REMEDY_FILTER_DIALOG, { consultationId: id })
}

export function clearFilter() {
  setOptions({ remedyFilter: null, filterLabel: null, excludedRemedies: [], highlight: null, highlightLabel: null, minCoverage: 0 })
}

export function toggleExcluded(remedyId: number, consultationId = targetConsultationId()) {
  const c = consultationId ? st().consultations[consultationId] : null
  if (!c) return
  const ex = c.analysis.excludedRemedies
  setOptions({ excludedRemedies: ex.includes(remedyId) ? ex.filter(x => x !== remedyId) : [...ex, remedyId] }, c.id)
}

export function openCompare(remedies?: number[]) {
  const id = targetConsultationId()
  if (id) actions.openDialog(COMPARE_DIALOG, { consultationId: id, initial: remedies })
}

export function openRemedyTab(remedyId: number) { actions.openTab({ kind: 'remedy', remedyId }) }
export function openMateriaMedica(remedyId: number) { actions.openTab({ kind: 'materia-medica', remedyId, query: '' }) }

/** Compute the analysis synchronously for commands (loads referenced repertories first). */
export async function computeTarget(): Promise<{ result: AnalysisResult; rows: AnalysisRow[]; meta: ExportMeta; consultationId: string } | null> {
  const id = targetConsultationId()
  const c = id ? st().consultations[id] : null
  if (!c) return null
  const cat = catalog()
  await Promise.all(repertoriesOf(c.clipboards).map(a => cat.loadRepertory(a).catch(() => null)))
  const result = analyze(sourceFor(cat), c.clipboards, c.analysis)
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

export async function exportCsv() {
  const t = await computeTarget()
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to export: the analysed clipboards are empty', 'info'); return }
  downloadBlob(new Blob(['﻿' + analysisCsv(t.result, t.rows, t.meta)], { type: 'text/csv;charset=utf-8' }), `${safeFileName(t.meta.title)}.csv`)
  actions.toast('Analysis exported as CSV', 'success')
}

export async function exportPng() {
  const t = await computeTarget()
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to export: the analysed clipboards are empty', 'info'); return }
  try {
    downloadBlob(await analysisPng(t.result, t.rows.slice(0, 120), t.meta), `${safeFileName(t.meta.title)}.png`)
    actions.toast('Analysis exported as PNG', 'success')
  } catch (e) {
    actions.toast(e instanceof Error ? e.message : 'PNG export failed', 'error')
  }
}

type PrintFn = (t: NonNullable<Awaited<ReturnType<typeof computeTarget>>>) => void
let printer: PrintFn | null = null
/** The view module installs the React print renderer (keeps this module free of JSX). */
export function setPrinter(fn: PrintFn) { printer = fn }

export async function printAnalysis() {
  const t = await computeTarget()
  if (!t) return
  if (!t.result.symptoms.length) { actions.toast('Nothing to print: the analysed clipboards are empty', 'info'); return }
  printer?.(t)
}
