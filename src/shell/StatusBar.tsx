import { memo } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useApp, selectActiveTab, selectActiveConsultation, selectActiveClipboard } from '../state/store'
import { formatKeys } from '../commands/registry'
import { useStatusContext } from './statusContext'

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

export const StatusBar = memo(function StatusBar() {
  const catalog = useCatalog()
  // narrow selections: the status bar re-renders only when what it shows changes
  const rubric = useApp(s => { const t = selectActiveTab(s); return t?.kind === 'repertory' ? `${t.repertory}:${t.rubric}` : null })
  const clipboard = useApp(selectActiveClipboard)
  const total = useApp(s => selectActiveConsultation(s)?.clipboards.reduce((n, cb) => n + cb.symptoms.length, 0) ?? null)
  const selected = useApp(s => s.selectedSymptomIds.length)
  // what the shown document publishes about itself (an analysis: method, symptoms, remedies, limit)
  const activeTabId = useApp(s => s.activeTabId)
  const docStatus = useStatusContext(s => (s.owner === activeTabId ? s.text : null))

  let left = docStatus ?? 'Ready'
  if (rubric) {
    const sep = rubric.lastIndexOf(':')
    const rep = catalog.repertory(rubric.slice(0, sep))
    const i = Number(rubric.slice(sep + 1))
    if (rep) {
      const subs = rep.subtreeEndOf(i) - i - 1
      left = `${rep.info.title}  ·  ${rep.path(i)}  ·  ${plural(rep.remedyCount(i), 'remedy', 'remedies')}${subs > 0 ? `  ·  ${plural(subs, 'sub-rubric')}` : ''}`
    }
  }
  const allRubrics = catalog.repertoryInfos.reduce((n, r) => n + r.rubricCount, 0)

  return (
    <footer className="statusbar" aria-label="Status">
      <span className="status-main" title={left}>{left}</span>
      <span className="status-spacer" />
      {clipboard && <span className="status-item"><span className="status-swatch" style={{ background: clipboard.color }} aria-hidden="true" />{clipboard.name}: {plural(clipboard.symptoms.length, 'symptom')}{selected ? ` (${selected} selected)` : ''}</span>}
      {total != null && <span className="status-item">{total} in case</span>}
      <span className="status-item status-totals" title={`${catalog.repertoryInfos.length} repertories`}>Library: {plural(allRubrics, 'rubric')} · {plural(catalog.remedies.size, 'remedy', 'remedies')}</span>
      <span className="status-item status-hint"><span className="kbd">{formatKeys('Mod+K')}</span> commands</span>
    </footer>
  )
})
