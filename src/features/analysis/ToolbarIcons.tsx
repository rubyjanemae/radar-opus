/**
 * The analysis sub-toolbar's small full-colour glyphs, drawn after RadarOpus's (about 18pt, filled, coloured):
 * two overlapping blue windows, a grey chess king, a grey yin-yang, the "analysis ⇄ polarity" swap (a blue
 * bar chart, two blue arrows and a small yin-yang), the horizontal bar list and the double gear. Colours come
 * from the analysis theme variables (--an-ic-*), so dark mode follows.
 */
interface Props { size?: number }

const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const })

/** Display: two overlapping rounded windows, the front one at the lower left. */
export function WindowsIcon({ size = 18 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="8.2" y="3" width="13.3" height="10.4" rx="2.2" fill="var(--an-ic-paper)" stroke="var(--an-ic-blue)" strokeWidth="2" />
      <rect x="2.5" y="9.6" width="13.3" height="10.4" rx="2.2" fill="var(--an-ic-paper)" stroke="var(--an-ic-blue)" strokeWidth="2" />
    </svg>
  )
}

/** Analysis method: a solid grey chess king. */
export function KingIcon({ size = 18 }: Props) {
  return (
    <svg {...svg(size)}>
      <g fill="var(--an-ic-grey)">
        <rect x="11.1" y="0.6" width="1.8" height="4.6" rx=".3" />
        <rect x="9.6" y="1.9" width="4.8" height="1.6" rx=".3" />
        <path d="M8.2 5.6h7.6l-1 3.2H9.2z" />
        <rect x="8.6" y="9.2" width="6.8" height="1.4" rx=".3" />
        <path d="M9.6 11h4.8l1.1 7.4H8.5z" />
        <path d="M7.4 18.8h9.2l1.2 2.2H6.2z" />
        <rect x="5.6" y="21.2" width="12.8" height="2.2" rx=".4" />
      </g>
    </svg>
  )
}

/** The yin-yang: dark and light halves, each with the other's dot, in a dark ring. */
function YinYang({ cx, cy, r, dark, light }: { cx: number; cy: number; r: number; dark: string; light: string }) {
  const h = r / 2
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={light} />
      <path d={`M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${h} ${h} 0 0 1 ${cx} ${cy}A${h} ${h} 0 0 0 ${cx} ${cy - r}z`} fill={dark} />
      <circle cx={cx} cy={cy - h} r={r / 6} fill={dark} />
      <circle cx={cx} cy={cy + h} r={r / 6} fill={light} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={dark} strokeWidth={r / 7} />
    </g>
  )
}

/** Polarity menu: a grey yin-yang. */
export function YinYangIcon({ size = 18 }: Props) {
  return <svg {...svg(size)}><YinYang cx={12} cy={12} r={10.4} dark="var(--an-ic-grey)" light="var(--an-ic-paper)" /></svg>
}

/** Switch between the analysis and the polarity analysis: a blue bar chart, two blue arrows, a yin-yang. */
export function SwapPolarityIcon({ size = 18 }: Props) {
  return (
    <svg {...svg(size)}>
      <g fill="var(--an-ic-blue)">
        <rect x="1" y="1" width="1.7" height="9" />
        <rect x="3.4" y="2.6" width="1.7" height="7.4" />
        <rect x="5.8" y="4.2" width="1.7" height="5.8" />
        <rect x="8.2" y="5.6" width="1.7" height="4.4" />
      </g>
      <rect x=".6" y="10.2" width="10" height=".9" fill="var(--an-ic-grey)" />
      <g stroke="var(--an-ic-blue)" strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path d="M14.4 3.4l6 6M20.4 5.2v4.2h-4.2" />
        <path d="M9.6 20.6l-6-6M3.6 18.8v-4.2h4.2" />
      </g>
      <YinYang cx={17.6} cy={17.6} r={5.6} dark="var(--an-ic-ink)" light="var(--an-ic-paper)" />
    </svg>
  )
}

/** Bars display: a ranked horizontal bar list (amber bars with blue ends) on grey axes. */
export function BarListIcon({ size = 18 }: Props) {
  return (
    <svg {...svg(size)}>
      <g fill="var(--an-ic-amber-2)">
        <rect x="4" y="2.4" width="13" height="3.2" />
        <rect x="4" y="7.9" width="10.6" height="3.2" />
        <rect x="4" y="13.4" width="8.4" height="3.2" />
        <rect x="4" y="18.4" width="6" height="2.4" />
      </g>
      <g fill="var(--an-ic-blue)">
        <rect x="17" y="2.4" width="4" height="3.2" />
        <rect x="14.6" y="7.9" width="3.6" height="3.2" />
        <rect x="12.4" y="13.4" width="3.2" height="3.2" />
      </g>
      <path d="M2.8 1v21.6h18.6" fill="none" stroke="var(--an-ic-grey)" strokeWidth="1.5" />
    </svg>
  )
}

/** Analysis settings: a large and a small gear (RadarOpus's double gear). */
export function DoubleGearIcon({ size = 18 }: Props) {
  const gear = (cx: number, cy: number, r: number, teeth: number) => {
    const pts: string[] = []
    const p = (a: number, rr: number) => pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`)
    const w = Math.PI / teeth
    // square-ish teeth: root, tip, tip, root for each
    for (let i = 0; i < teeth; i++) {
      const a = 2 * w * i
      p(a - w * .55, r * .76); p(a - w * .35, r); p(a + w * .35, r); p(a + w * .55, r * .76)
    }
    return pts.join(' ')
  }
  return (
    <svg {...svg(size)}>
      <g fill="currentColor">
        <polygon points={gear(9, 14.4, 8.8, 8)} />
        <polygon points={gear(18.6, 5.6, 5.2, 6)} />
      </g>
      <circle cx="9" cy="14.4" r="2.8" fill="var(--an-peach)" />
      <circle cx="18.6" cy="5.6" r="1.7" fill="var(--an-peach)" />
    </svg>
  )
}
