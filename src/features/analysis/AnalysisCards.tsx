import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Catalog } from '../../data/catalog'
import { formatScore } from '../../engine/analysis'
import type { AnalysisResult, AnalysisRow, ResolvedSymptom } from '../../engine/analysis'
import type { MenuItem } from '../../ui/Menu'
import { useContextMenu } from '../../ui/Menu'
import { GradeMark } from '../../ui/marks'
import { exclusionText } from './labels'
import { cardLayout, CARD_GAP, CARD_PAD } from './cardLayout'

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

/** First guess of a card row's height; the rendered cards correct it (it only grows for a given result and width). */
const CARD_H0 = 150
/** Card rows rendered above and below the visible ones. */
const OVERSCAN = 1

interface CardProps {
  row: AnalysisRow
  k: number
  result: AnalysisResult
  scored: { s: ResolvedSymptom; i: number }[]
  catalog: Catalog
  selected: boolean
  fam: boolean
  pinned: boolean
  selectedSymptom: number | null
  focusable: boolean
  /** Card row and column: the position comes from them and the container's --an-card-h / --an-card-w (CSS), so a new row height re-renders no card. */
  r: number
  c: number
}

/** One remedy card. Memoised: moving the cursor or selecting re-renders only the cards that change. */
const Card = memo(function Card(p: CardProps) {
  const { row, result, scored } = p
  const rem = p.catalog.remedy(row.remedyId)
  const missing = scored.filter(x => !row.grades[x.i])
  const cls = ['an-card']
  if (p.selected) cls.push('selected')
  if (row.excluded) cls.push('excl')
  if (p.fam) cls.push('fam')
  if (p.selectedSymptom != null && !row.grades[p.selectedSymptom]) cls.push('dim')
  if (p.pinned) cls.push('pinned')
  const pct = scored.length ? (row.coverage / scored.length) * 100 : 0
  return (
    <div
      role="listitem"
      className={cls.join(' ')}
      data-remedy={row.remedyId}
      data-k={p.k}
      tabIndex={p.focusable ? 0 : -1}
      style={{ ['--r' as string]: p.r, ['--c' as string]: p.c }}
      aria-label={`${row.rank ? `Rank ${row.rank}, ` : ''}${rem.name}, ${row.coverage} of ${scored.length} symptoms`}
    >
      <div className="an-card-head">
        <span className="an-card-rank">{row.rank ? `#${row.rank}` : '–'}</span>
        {p.pinned && <span className="an-card-pin" title="Beyond the display limit, pinned">pinned</span>}
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
})

/**
 * Remedy cards: coverage meter, per-symptom grade strip and the symptoms each remedy misses. Virtualised by
 * card rows (only the visible rows render), with a roving focus card: arrows move by card and by row.
 */
export const AnalysisCards = memo(function AnalysisCards(p: Props) {
  const { result, rows, catalog } = p
  const ref = useRef<HTMLDivElement>(null)
  const cm = useContextMenu()
  const scored = useMemo(() => result.symptoms.map((s, i) => ({ s, i })).filter(x => x.s.role === 'scored'), [result])
  const [vp, setVp] = useState({ top: 0, height: 600, width: 0 })
  const [active, setActive] = useState(0)
  // a card row's height: grows to the tallest card rendered, starts again for a new result or width
  const [rowH, setRowH] = useState({ key: '', h: CARD_H0 })
  const focusWithin = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setVp(v => (v.top === el.scrollTop && v.height === el.clientHeight && v.width === el.clientWidth ? v : { top: el.scrollTop, height: el.clientHeight, width: el.clientWidth }))
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])

  const { cols, cardW } = cardLayout(vp.width || 800)
  const hKey = `${result.symptoms.length}:${cardW}`
  const cardH = rowH.key === hKey ? rowH.h : CARD_H0
  const pitch = cardH + CARD_GAP
  const nRows = Math.ceil(rows.length / cols)
  const a = Math.max(0, Math.min(active, rows.length - 1))
  const r0 = Math.max(0, Math.floor((vp.top - CARD_PAD) / pitch) - OVERSCAN)
  const r1 = Math.min(nRows, Math.ceil((vp.top + vp.height) / pitch) + OVERSCAN)
  const idx: number[] = []
  for (let k = r0 * cols; k < Math.min(rows.length, r1 * cols); k++) idx.push(k)
  if (rows.length && (a < r0 * cols || a >= r1 * cols)) idx.push(a)

  // cards taller than the guess (long strips, exclusion notes) raise the row height for every card
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let max = 0
    for (const c of el.querySelectorAll<HTMLElement>('.an-card')) max = Math.max(max, c.offsetHeight)
    if (max > cardH) setRowH({ key: hKey, h: max })
  })

  const topOf = (k: number) => CARD_PAD + Math.floor(k / cols) * pitch
  const ensure = (k: number) => {
    const el = ref.current
    if (!el) return
    const y = topOf(k)
    if (y - CARD_PAD < el.scrollTop) el.scrollTop = y - CARD_PAD
    else if (y + cardH + CARD_PAD > el.scrollTop + el.clientHeight) el.scrollTop = y + cardH + CARD_PAD - el.clientHeight
  }
  const go = (k: number) => { const n = Math.max(0, Math.min(rows.length - 1, k)); setActive(n); ensure(n) }

  // move DOM focus to the active card once it is rendered
  useEffect(() => {
    if (!focusWithin.current) return
    const el = ref.current?.querySelector<HTMLElement>(`[data-k="${a}"]`)
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  })

  useEffect(() => {
    if (!p.reveal) return
    const k = rows.findIndex(r => r.remedyId === p.reveal!.remedyId)
    if (k < 0) return
    setActive(k)
    focusWithin.current = true
    const el = ref.current
    if (el) el.scrollTop = Math.max(0, topOf(k) - el.clientHeight / 2 + cardH / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reveal?.nonce])

  const cardAt = (t: EventTarget): number | null => {
    const c = (t as HTMLElement).closest<HTMLElement>('.an-card')
    return c ? Number(c.dataset.k) : null
  }

  return (
    <div
      ref={ref}
      className="an-cards"
      role="list"
      aria-label="Remedy cards"
      onFocus={() => { focusWithin.current = true }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) focusWithin.current = false }}
      onMouseDown={e => { const k = cardAt(e.target); if (k != null) setActive(k) }}
      onClick={e => {
        const k = cardAt(e.target)
        if (k == null) return
        const id = rows[k].remedyId
        p.onSelectRemedy(p.selectedRemedy === id ? null : id)
      }}
      onDoubleClick={e => { const k = cardAt(e.target); if (k != null) p.onOpenRemedy(rows[k].remedyId) }}
      onContextMenu={e => { const k = cardAt(e.target); if (k != null) { setActive(k); cm.open(e, p.remedyMenu(rows[k])) } }}
      onKeyDown={e => {
        if (!rows.length) return
        const page = Math.max(1, Math.floor((ref.current?.clientHeight ?? 300) / pitch)) * cols
        const id = rows[a].remedyId
        let handled = true
        switch (e.key) {
          case 'ArrowRight': go(a + 1); break
          case 'ArrowLeft': go(a - 1); break
          case 'ArrowDown': go(a + cols); break
          case 'ArrowUp': go(a - cols); break
          case 'PageDown': go(a + page); break
          case 'PageUp': go(a - page); break
          case 'Home': go(0); break
          case 'End': go(rows.length - 1); break
          case 'Enter':
            if (e.shiftKey) p.onOpenRemedy(id)
            else p.onSelectRemedy(id)
            break
          case ' ': p.onSelectRemedy(p.selectedRemedy === id ? null : id); break
          case 'F10':
          case 'ContextMenu': {
            if (e.key === 'F10' && !e.shiftKey) { handled = false; break }
            const el = ref.current?.querySelector<HTMLElement>(`[data-k="${a}"]`)
            if (el) cm.openAt(el, p.remedyMenu(rows[a]))
            break
          }
          default: handled = false
        }
        if (handled) { e.preventDefault(); e.stopPropagation() }
      }}
    >
      <div
        className="an-cards-inner"
        style={{ height: nRows ? CARD_PAD * 2 + nRows * pitch - CARD_GAP : 0, ['--an-card-w' as string]: `${cardW}px`, ['--an-card-h' as string]: `${cardH}px` }}
      >
        {idx.map(k => {
          const row = rows[k]
          return (
            <Card
              key={row.remedyId} row={row} k={k} result={result} scored={scored} catalog={catalog}
              selected={row.remedyId === p.selectedRemedy} fam={!!p.highlight?.has(row.remedyId)} pinned={!!p.pinned?.has(row.remedyId)}
              selectedSymptom={p.selectedSymptom} focusable={k === a}
              r={Math.floor(k / cols)} c={k % cols}
            />
          )
        })}
      </div>
      {cm.element}
    </div>
  )
})
