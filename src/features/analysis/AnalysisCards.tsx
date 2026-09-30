import { memo, useEffect, useRef } from 'react'
import type { Catalog } from '../../data/catalog'
import { formatScore } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow } from '../../engine/analysis'
import type { MenuItem } from '../../ui/Menu'
import { useContextMenu } from '../../ui/Menu'
import { GradeMark } from './AnalysisGrid'
import { exclusionText } from './labels'

interface Props {
  result: AnalysisResult
  rows: AnalysisRow[]
  catalog: Catalog
  selectedRemedy: number | null
  selectedSymptom: number | null
  highlight: Set<number> | null
  onSelectRemedy: (id: number | null) => void
  onOpenRemedy: (id: number) => void
  remedyMenu: (row: AnalysisRow) => MenuItem[]
  reveal?: { remedyId: number; nonce: number } | null
  pinned?: Set<number>
}

/** Remedy cards: coverage meter, per-symptom grade strip and the symptoms each remedy misses. */
export const AnalysisCards = memo(function AnalysisCards(p: Props) {
  const { result, rows, catalog } = p
  const ref = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()
  const scored = result.symptoms.map((s, i) => ({ s, i })).filter(x => x.s.role === 'scored')

  useEffect(() => {
    if (!p.reveal) return
    const el = ref.current?.querySelector<HTMLElement>(`[data-remedy="${p.reveal.remedyId}"]`)
    el?.scrollIntoView({ block: 'nearest' })
    el?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reveal?.nonce])

  const cols = () => {
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('.an-card')
    if (!el || !first) return 1
    return Math.max(1, Math.round(el.clientWidth / (first.offsetWidth + 8)))
  }

  return (
    <div
      ref={ref}
      className="an-cards"
      role="list"
      aria-label="Remedy cards"
      onKeyDown={e => {
        const cards = [...(ref.current?.querySelectorAll<HTMLElement>('.an-card') ?? [])]
        const k = cards.indexOf(document.activeElement as HTMLElement)
        if (k < 0) return
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols(), ArrowUp: -cols(), Home: -k, End: cards.length - 1 - k }[e.key]
        if (step !== undefined) {
          e.preventDefault()
          cards[Math.max(0, Math.min(cards.length - 1, k + step))]?.focus()
        } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault()
          cm.openAt(cards[k], p.remedyMenu(rows[k]))
        }
      }}
    >
      {rows.map(row => {
        const rem = catalog.remedy(row.remedyId)
        const missing = scored.filter(x => !row.grades[x.i])
        const cls = ['an-card']
        if (row.remedyId === p.selectedRemedy) cls.push('selected')
        if (row.excluded) cls.push('excl')
        if (p.highlight?.has(row.remedyId)) cls.push('fam')
        if (p.selectedSymptom != null && !row.grades[p.selectedSymptom]) cls.push('dim')
        if (p.pinned?.has(row.remedyId)) cls.push('pinned')
        const pct = scored.length ? (row.coverage / scored.length) * 100 : 0
        return (
          <div
            key={row.remedyId}
            role="listitem"
            className={cls.join(' ')}
            data-remedy={row.remedyId}
            tabIndex={0}
            aria-label={`${row.rank ? `Rank ${row.rank}, ` : ''}${rem.name}, ${row.coverage} of ${scored.length} symptoms`}
            onClick={() => p.onSelectRemedy(p.selectedRemedy === row.remedyId ? null : row.remedyId)}
            onDoubleClick={() => p.onOpenRemedy(row.remedyId)}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); p.onOpenRemedy(row.remedyId) }
              else if (e.key === 'Enter') { e.preventDefault(); p.onSelectRemedy(row.remedyId) }
              else if (e.key === ' ') { e.preventDefault(); p.onSelectRemedy(p.selectedRemedy === row.remedyId ? null : row.remedyId) }
            }}
            onContextMenu={e => cm.open(e, p.remedyMenu(row))}
          >
            <div className="an-card-head">
              <span className="an-card-rank">{row.rank ? `#${row.rank}` : '–'}</span>
              {p.pinned?.has(row.remedyId) && <span className="an-card-pin" title="Beyond the display limit, pinned">pinned</span>}
              <span className="an-card-abbrev">{rem.abbrev}</span>
              <span className="an-card-score">{formatScore(result.strategy, row)}</span>
            </div>
            <div className="an-card-name" title={rem.name}>{rem.name}</div>
            {row.excluded && <div className="an-card-excl">{exclusionText(result, row)}</div>}
            <div className="an-meter" role="img" aria-label={`${row.coverage} of ${scored.length} symptoms`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="an-card-stats">{row.coverage}/{scored.length} symptoms · {row.degrees} degrees</div>
            <div className="an-strip" aria-hidden="true">
              {result.symptoms.map((s, i) => (
                <span key={i} className={`an-strip-cell${s.role !== 'scored' ? ' off' : ''}${p.selectedSymptom === i ? ' on' : ''}`} title={`${s.label}: ${row.grades[i] ? `grade ${row.grades[i]}` : 'absent'}`}>
                  <GradeMark g={row.grades[i]} />
                </span>
              ))}
            </div>
            {missing.length > 0 && (
              <div className="an-card-missing">
                <span className="an-card-missing-h">Missing</span>
                {missing.slice(0, 3).map(x => <span key={x.i} className="an-card-missing-item" title={x.s.label}>{x.s.label}</span>)}
                {missing.length > 3 && <span className="an-card-more">+{missing.length - 3} more</span>}
              </div>
            )}
          </div>
        )
      })}
      {cm.element}
    </div>
  )
})
