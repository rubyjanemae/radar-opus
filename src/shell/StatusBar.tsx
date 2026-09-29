import { useCatalog } from '../data/CatalogContext'
import { useApp, selectActiveTab, selectActiveConsultation, selectActiveClipboard } from '../state/store'
import { formatKeys } from '../commands/registry'

export function StatusBar() {
  const catalog = useCatalog()
  const tab = useApp(selectActiveTab)
  const consultation = useApp(selectActiveConsultation)
  const clipboard = useApp(selectActiveClipboard)
  const selected = useApp(s => s.selectedSymptomIds.length)

  let left = 'Ready'
  if (tab?.kind === 'repertory') {
    const rep = catalog.repertory(tab.repertory)
    if (rep) left = `${rep.info.title}  ·  ${rep.path(tab.rubric)}  ·  ${rep.remedyCount(tab.rubric)} remedies`
  }
  const total = consultation?.clipboards.reduce((n, cb) => n + cb.symptoms.length, 0) ?? 0

  return (
    <footer className="statusbar" aria-label="Status">
      <span className="status-main" title={left}>{left}</span>
      <span className="status-spacer" />
      {clipboard && <span className="status-item"><span className="status-swatch" style={{ background: clipboard.color }} />{clipboard.name}: {clipboard.symptoms.length} symptoms{selected ? ` (${selected} selected)` : ''}</span>}
      {consultation && <span className="status-item">{total} in case</span>}
      <span className="status-item">{catalog.repertoryInfos.reduce((n, r) => n + r.rubricCount, 0).toLocaleString()} rubrics · {catalog.remedies.size.toLocaleString()} remedies</span>
      <span className="status-item status-hint"><span className="kbd">{formatKeys('Mod+K')}</span> commands</span>
    </footer>
  )
}
