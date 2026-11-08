/**
 * The analysis icon (toolbar button and analysis window tab), drawn after RadarOpus's: a grey L-shaped
 * axis with three falling pairs of bars, a pale yellow bar in front of a taller blue one. Colours come
 * from the theme variables, so dark mode follows.
 */
const PAIRS: [number, number, number][] = [
  // x of the yellow bar, top of the blue bar, top of the yellow bar (measured off RadarOpus's 2x toolbar icon)
  [3.1, 1, 6.4],
  [9.5, 5.9, 10.4],
  [16, 7.5, 12.2],
]
const BLUE = { fill: 'var(--ro-icon-blue)' }
const YELLOW = { fill: 'color-mix(in srgb, var(--ro-icon-amber) 55%, #fff)' }
const AXIS = { fill: 'color-mix(in srgb, var(--ro-icon-grey) 80%, #fff)' }

export function AnalysisIcon({ size = 24, className }: { size?: number; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      {PAIRS.map(([x, blueTop, yellowTop]) => (
        <g key={x}>
          <rect style={BLUE} x={x + 1.45} y={blueTop} width="4" height={20 - blueTop} />
          <rect style={YELLOW} x={x} y={yellowTop} width="3.6" height={20 - yellowTop} />
        </g>
      ))}
      <rect style={AXIS} x="0.6" y="1" width="1.35" height="20.7" />
      <rect style={AXIS} x="0.6" y="20.2" width="22.7" height="1.5" />
    </svg>
  )
}
