/** Original glyphs of the patients panel header and the patient tab toolbars (after the RadarOpus icons). */
import type { ReactNode } from 'react'

/** Points of a gear outline: `n` teeth between radii `ri` and `ro` around (cx, cy). */
function gear(cx: number, cy: number, ro: number, ri: number, n: number) {
  const pts: string[] = []
  const step = (Math.PI * 2) / n
  for (let k = 0; k < n; k++) {
    const a = k * step - Math.PI / 2
    for (const [da, r] of [[-0.3, ri], [-0.17, ro], [0.17, ro], [0.3, ri]] as const) {
      const t = a + da * step * 1.6
      pts.push(`${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`)
    }
  }
  return `M${pts.join('L')}Z`
}
const hole = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
const COGS = `${gear(5.8, 9.2, 5.2, 3.7, 8)}${hole(5.8, 9.2, 1.7)}${gear(11.2, 3.9, 3.3, 2.3, 6)}${hole(11.2, 3.9, 1)}`
const COG = `${gear(7.5, 7.5, 6.6, 4.8, 9)}${hole(7.5, 7.5, 2.1)}`

/** Refresh: two solid blue curved arrows chasing each other round a loop (reset and search again). */
const REFRESH_A = 'M3.4 11.2V8a3.6 3.6 0 0 1 3.6-3.6h.6'
const REFRESH_B = 'M12.6 5.8V9a3.6 3.6 0 0 1-3.6 3.6h-.6'
export function PtpRefreshGlyph() {
  return (
    <svg viewBox="0 0 16 17" width="16" height="17" aria-hidden="true" className="ptp-refreshg">
      <path d={REFRESH_A} className="ptp-refresh-arc" />
      <path d={REFRESH_B} className="ptp-refresh-arc" />
      <path d="M7.4 1.4 11.4 4.4 7.4 7.4z" className="ptp-refresh-head" />
      <path d="M8.6 9.6 4.6 12.6 8.6 15.6z" className="ptp-refresh-head" />
    </svg>
  )
}

/** Search options, closed: two grey gears. */
export function PtpCogsGlyph() {
  return (
    <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true" className="ptp-cogsg">
      <path d={COGS} fillRule="evenodd" />
    </svg>
  )
}

/** Search options, open: one larger blue gear with a small red cross. */
export function PtpGearActiveGlyph() {
  return (
    <svg viewBox="0 0 17 17" width="17" height="17" aria-hidden="true" className="ptp-gearong">
      <path d={COG} fillRule="evenodd" className="ptp-gearon-cog" />
      <path d="M11.6 11.6l4 4M15.6 11.6l-4 4" className="ptp-gearon-x" />
    </svg>
  )
}

/* ───────────── patient tab: sub-tabs, consultation toolbar, format bar (original drawings) ───────────── */

const svg = (cls: string, size: number, children: ReactNode, vb = 24) => (
  <svg className={`pvg ${cls}`} viewBox={`0 0 ${vb} ${vb}`} width={size} height={size} aria-hidden="true">{children}</svg>
)

/** Administrative sub-tab: an ID card. */
export const AdminTabGlyph = () => svg('pvg-admin', 16, <>
  <rect x="1.5" y="4" width="21" height="16" rx="1.5" className="pvg-card" />
  <rect x="4" y="7.5" width="6" height="8" className="pvg-card-photo" />
  <path d="M12.5 9h7M12.5 12h7M12.5 15h5" className="pvg-card-lines" />
</>)
/** Consultations sub-tab: a stethoscope. */
export const ConsultTabGlyph = () => svg('pvg-steth', 16, <>
  <path d="M5 2.5v6a5 5 0 0 0 10 0v-6" className="pvg-steth-tube" />
  <path d="M10 13.5v2.5a4.5 4.5 0 0 0 9 0v-3" className="pvg-steth-tube" />
  <circle cx="19" cy="11" r="2.4" className="pvg-steth-bell" />
</>)

export const SaveGlyph = () => svg('pvg-save', 24, <>
  <path d="M3 3h15l3 3v15H3z" className="pvg-save-body" />
  <rect x="7" y="3" width="9" height="6" className="pvg-save-shutter" />
  <rect x="6" y="13" width="12" height="8" className="pvg-save-label" />
</>)
export const PencilGlyph = () => svg('pvg-pencil', 24, <>
  <path d="M4 20l1.2-4.6L16.6 4a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" className="pvg-pencil-body" />
  <path d="M4 20l1.2-4.6 3.4 3.4z" className="pvg-pencil-tip" />
</>)
export const JarGlyph = () => svg('pvg-jar', 24, <>
  <rect x="7" y="2" width="10" height="3.5" rx="1" className="pvg-jar-lid" />
  <path d="M7.5 5.5h9v2.5c2 1 2.5 2.2 2.5 4v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8c0-1.8.5-3 2.5-4z" className="pvg-jar-glass" />
  <circle cx="10" cy="17" r="2.2" className="pvg-jar-pill" /><circle cx="14.2" cy="17.6" r="2" className="pvg-jar-pill" /><circle cx="12.3" cy="14.4" r="1.9" className="pvg-jar-pill" />
</>)
export const CaduceusGlyph = () => svg('pvg-caduceus', 24, <>
  <path d="M12 3v19" className="pvg-cad-staff" />
  <path d="M12 6c-3-2.2-6.5-2.2-9-.6 2.6.2 5 1 7 2.6M12 6c3-2.2 6.5-2.2 9-.6-2.6.2-5 1-7 2.6" className="pvg-cad-wing" />
  <path d="M8.5 9.5c0 1.6 7 1.6 7 3.4s-7 1.8-7 3.6 7 1.8 7 3.4" className="pvg-cad-snake" />
  <circle cx="12" cy="3.2" r="1.4" className="pvg-cad-knob" />
</>)
export const BalanceGlyph = () => svg('pvg-balance', 24, <>
  <path d="M12 3v17M7 21h10M4 6.5h16" className="pvg-bal-beam" />
  <path d="M4 7 1.5 13h5zM20 7l-2.5 6h5z" className="pvg-bal-arm" />
  <path d="M1.5 13a2.5 1.6 0 0 0 5 0zM17.5 13a2.5 1.6 0 0 0 5 0z" className="pvg-bal-pan" />
</>)
export const GridGlyph = () => svg('pvg-grid', 24, <>
  <rect x="2.5" y="3.5" width="19" height="17" className="pvg-grid-frame" />
  <rect x="2.5" y="3.5" width="19" height="3.5" className="pvg-grid-head" />
  <path d="M2.5 11h19M2.5 15h19M7.5 7v13.5M12 7v13.5M16.5 7v13.5" className="pvg-grid-lines" />
</>)
export const NewConsultGlyph = () => svg('pvg-newc', 24, <>
  <path d="M3 18.5l1-3.8L14.4 4.3a1.8 1.8 0 0 1 2.5 0l.6.6a1.8 1.8 0 0 1 0 2.5L7 17.7z" className="pvg-pencil-body" />
  <path d="M14.4 4.3l1.3-1.3a1.8 1.8 0 0 1 2.5 0l.6.6a1.8 1.8 0 0 1 0 2.5l-1.3 1.3z" className="pvg-newc-eraser" />
  <path d="M18.5 14v8M14.5 18h8" className="pvg-newc-plus" />
</>)
export const SyringeGlyph = () => svg('pvg-syringe', 24, <>
  <path d="M15.5 3.5l5 5M18 6l-2.5 2.5" className="pvg-syr-plunger" />
  <path d="M15 6.5l2.5 2.5-9 9-3.6.6.6-3.6z" className="pvg-syr-barrel" />
  <path d="M5.5 18.5 2.5 21.5" className="pvg-syr-needle" />
</>)
export const FlaskGlyph = () => svg('pvg-flask', 24, <>
  <path d="M9 2.5h6M10 2.5v6.2L4.2 19a2 2 0 0 0 1.8 3h12a2 2 0 0 0 1.8-3L14 8.7V2.5" className="pvg-flask-glass" />
  <path d="M6.6 15h10.8l2.4 4a1.4 1.4 0 0 1-1.2 2.2H5.4A1.4 1.4 0 0 1 4.2 19z" className="pvg-flask-liquid" />
</>)
export const FreeFieldsGlyph = () => svg('pvg-free', 24, <>
  <rect x="2.5" y="4" width="15" height="18" rx="1" className="pvg-free-pad" />
  <path d="M5 2.5v3M8.5 2.5v3M12 2.5v3M15 2.5v3" className="pvg-free-rings" />
  <path d="M8 18l.8-3 9-9a1.6 1.6 0 0 1 2.2 2.2l-9 9z" className="pvg-free-pen" />
</>)
export const DoubleChevronGlyph = () => svg('pvg-dchev', 12, <path d="M2 2.5 6 6l4-3.5M2 7l4 3.5L10 7" className="pvg-dchev-path" />, 12)

/* format bar (16 px) */
export const CopyGlyph = () => svg('pvg-fmt', 16, <><rect x="2" y="2" width="8" height="10" className="pvg-fmt-paper" /><rect x="6" y="5" width="8" height="10" className="pvg-fmt-paper" /></>, 16)
export const CutGlyph = () => svg('pvg-fmt', 16, <><circle cx="4.5" cy="12" r="2.3" className="pvg-fmt-ring" /><circle cx="11.5" cy="12" r="2.3" className="pvg-fmt-ring" /><path d="M6 10.2 12 1.5M10 10.2 4 1.5" className="pvg-fmt-blade" /></>, 16)
export const PasteGlyph = () => svg('pvg-fmt', 16, <><rect x="2" y="3" width="10" height="12" rx="1" className="pvg-fmt-board" /><rect x="4.5" y="1.5" width="5" height="3" rx="1" className="pvg-fmt-clip" /><rect x="7" y="7" width="7" height="8" className="pvg-fmt-paper" /></>, 16)
export const UndoGlyph = () => svg('pvg-undo', 16, <><path d="M4 7h6.5a3.5 3.5 0 0 1 0 7H7" className="pvg-arrow-line" /><path d="M6.5 3.5 2.8 7l3.7 3.5z" className="pvg-arrow-head" /></>, 16)
export const RedoGlyph = () => svg('pvg-redo', 16, <><path d="M12 7H5.5a3.5 3.5 0 0 0 0 7H9" className="pvg-arrow-line" /><path d="M9.5 3.5 13.2 7l-3.7 3.5z" className="pvg-arrow-head" /></>, 16)
export const ColorGlyph = ({ color }: { color: string }) => (
  <svg className="pvg pvg-color" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3.5 12 7 2.5h2l3.5 9.5M5 8.5h6" className="pvg-color-a" />
    <rect x="1.5" y="13" width="13" height="2.5" style={{ fill: color }} />
  </svg>
)
export const AlignGlyph = ({ how }: { how: 'left' | 'center' | 'right' | 'justify' }) => {
  const rows: [number, number][] = how === 'left' ? [[2, 12], [2, 8], [2, 12], [2, 7]] : how === 'center' ? [[2, 12], [4, 8], [2, 12], [4.5, 7]]
    : how === 'right' ? [[2, 12], [6, 8], [2, 12], [7, 7]] : [[2, 12], [2, 12], [2, 12], [2, 12]]
  return svg('pvg-fmt', 16, <path d={rows.map(([x, w], i) => `M${x} ${3.5 + i * 3}h${w}`).join('')} className="pvg-fmt-lines" />, 16)
}
export const TableGlyph = ({ op }: { op: 'insert' | 'row' | 'delete' }) => svg('pvg-table', 16, <>
  <rect x="1.5" y="2.5" width="13" height="11" className="pvg-table-frame" />
  <path d="M1.5 6.2h13M1.5 9.8h13M6 2.5v11M10.5 2.5v11" className="pvg-table-lines" />
  {op === 'insert' && <rect x="1.5" y="9.8" width="13" height="3.7" className="pvg-table-new" />}
  {op === 'row' && <path d="M1 8h8M6.5 5.5 9.5 8l-3 2.5" className="pvg-table-arrow" />}
  {op === 'delete' && <path d="M1.5 3.5l5 5M6.5 3.5l-5 5" className="pvg-table-x" />}
</>, 16)
