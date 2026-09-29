import { useMemo } from 'react'
import { BarChart3, LoaderCircle } from 'lucide-react'
import { formatScore, strategyInfo } from '../../engine/analysis'
import { formatKeys, runCommand } from '../../commands/registry'
import { actions, useApp } from '../../state/store'
import { AnalysisGrid } from './AnalysisGrid'
import { useAnalysis } from './useAnalysis'
import * as ops from './ops'
import './analysis.css'

const TOP = 15

/** Bottom dock: compact live top-15 of the active consultation (score bars over a mini grid). */
export function AnalysisDock() {
  const consultationId = useApp(s => s.activeConsultationId)
  const { consultation, result, load, catalog } = useAnalysis(consultationId)
  const rows = useMemo(() => (result?.all.filter(r => !r.excluded).slice(0, TOP)) ?? [], [result])
  const highlight = useMemo(() => (consultation?.analysis.highlight?.length ? new Set(consultation.analysis.highlight) : null), [consultation?.analysis.highlight])

  const openAt = (id: number | null) => ops.openAnalysis(id ?? undefined)
  const head = (
    <div className="pane-head an-dock-head">
      <BarChart3 size={13} />
      <span>Analysis</span>
      {result && <span className="badge" title={strategyInfo(result.strategy).name}>{strategyInfo(result.strategy).short}</span>}
      {result && <span className="an-dock-count">{result.total.toLocaleString()} remedies · top {Math.min(TOP, rows.length)}</span>}
      <span className="grow" />
      <button className="btn btn-sm btn-ghost" onClick={() => runCommand('analysis.open')} disabled={!consultation}>Open analysis <span className="kbd">{formatKeys('F8')}</span></button>
    </div>
  )

  if (!consultation) {
    return <div className="an-dock">{head}<div className="empty-state"><strong>No active case</strong><span>Open or create a case; its analysis previews here live.</span></div></div>
  }
  let body: React.ReactNode
  if (load.status === 'loading') body = <div className="empty-state"><LoaderCircle size={14} className="spin" /><span>Loading repertories…</span></div>
  else if (load.status === 'error') body = <div className="empty-state"><strong>Could not load {load.failed.join(', ')}</strong><button className="btn btn-sm" onClick={load.retry}>Retry</button></div>
  else if (!result?.symptoms.length) body = <div className="empty-state"><strong>No symptoms yet</strong><span>Take rubrics into the clipboards; the ranking appears here as you work.</span></div>
  else if (!rows.length) body = <div className="empty-state"><strong>No remedy remains</strong><span>Eliminative or excluding symptoms and filters removed every remedy.</span></div>
  else {
    const max = Math.max(1e-9, ...rows.map(r => r.points))
    body = (
      <div className="an-dock-body">
        <div className="an-dock-bars" role="list" aria-label="Top remedies">
          {rows.map(r => {
            const rem = catalog.remedy(r.remedyId)
            return (
              <button key={r.remedyId} role="listitem" className={`an-dock-bar${highlight?.has(r.remedyId) ? ' fam' : ''}`} title={`#${r.rank} ${rem.name}: ${formatScore(result.strategy, r)}`} onClick={() => openAt(r.remedyId)}>
                <span className="an-dock-fill" style={{ height: `${Math.max(4, (r.points / max) * 100)}%` }} />
              </button>
            )
          })}
        </div>
        <AnalysisGrid
          compact label="Analysis preview grid"
          result={result} rows={rows} catalog={catalog}
          clipboardColor={id => consultation.clipboards.find(c => c.id === id)?.color ?? 'var(--border)'}
          selectedRemedy={null} selectedSymptom={null} highlight={highlight}
          onSelectRemedy={id => openAt(id)} onSelectSymptom={() => {}}
          onOpenRemedy={id => actions.openTab({ kind: 'remedy', remedyId: id })}
        />
      </div>
    )
  }
  return <div className="an-dock" data-testid="analysis-dock">{head}{body}</div>
}

