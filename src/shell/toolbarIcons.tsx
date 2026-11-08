/**
 * Toolbar glyphs drawn after RadarOpus's coloured icons (original artwork). Colours come from the theme
 * variables (index.css), so dark mode follows; the lucide line icons read too flat beside the desktop's.
 */
type IconProps = { size?: number; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean }

const BLUE = 'var(--ro-icon-blue)'
const GREY = 'var(--ro-icon-grey)'
const PALE_GREY = 'color-mix(in srgb, var(--ro-icon-grey) 45%, var(--ro-win))'
const PAPER = 'var(--ro-win)'
const SKIN = 'color-mix(in srgb, var(--ro-icon-orange) 40%, color-mix(in srgb, var(--ro-icon-grey) 15%, var(--ro-win)))'
// RadarOpus's patient hair is a light taupe brown
const HAIR = 'color-mix(in srgb, var(--ro-icon-orange) 50%, var(--ro-icon-grey))'
// the rear patient's jacket is a dark blue-grey (slate), not neutral grey
const SLATE = `color-mix(in srgb, ${BLUE} 45%, ${GREY})`
const ROSE = 'color-mix(in srgb, var(--ro-close-x) 45%, var(--ro-win))'

const box = (size: number, className?: string) => ({ width: size, height: size, viewBox: '0 0 24 24', className, 'aria-hidden': true as const })

/**
 * Patients (after RadarOpus's): two people filling the icon. Behind at the upper right a pink head over a
 * blue-grey jacket with a blue tie; in front at the lower left a pink face under a full mop of brown hair
 * with a fringe, in a blue shirt with an open collar.
 */
export function PatientsIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <circle cx="16.6" cy="5.6" r="4.6" style={{ fill: ROSE }} />
      <path d="M8.8 20.6c.2-4.7 3.3-8.2 7.8-8.2s7.2 3.5 7.2 8.2z" style={{ fill: SLATE }} />
      <path d="M15.7 12.3h1.8l-.3 1.1.6 4.6-1.2 1.4-1.2-1.4.6-4.6z" style={{ fill: BLUE }} />
      <circle cx="7.6" cy="8.2" r="5.7" style={{ fill: HAIR }} />
      <path d="M.6 22.8c.3-4.9 3.3-7.8 7.2-7.8s6.9 2.9 7.2 7.8z" style={{ fill: BLUE }} />
      <path d="M5.4 15.3l2.4 3.1 2.4-3.1z" style={{ fill: SKIN }} />
      <ellipse cx="7.8" cy="10.9" rx="3.6" ry="3.9" style={{ fill: SKIN }} />
      <path d="M4.1 10.2c.6-2.3 2.2-3.6 4.3-3.6 1.6 0 2.9.7 3.5 1.9-1.5-.4-3-.1-4.3.9-1.2-.2-2.4.1-3.5.8z" style={{ fill: HAIR }} />
    </svg>
  )
}

/**
 * Bookmarks (after RadarOpus's): a pair of luggage tags, a grey one standing behind at the right and a
 * green one leaning in front at the left, each hanging from a looped grey string.
 */
export function BookmarksIcon({ size = 24, className }: IconProps) {
  const TAG_GREY = `color-mix(in srgb, ${GREY} 85%, ${PAPER})`
  const TAG_GREEN = `color-mix(in srgb, var(--ro-icon-teal) 82%, ${PAPER})`
  const string = { fill: 'none', stroke: TAG_GREY, strokeWidth: 1.6, strokeLinecap: 'round' } as const
  const edge = { fill: 'none', stroke: PAPER, strokeWidth: 2.6, strokeLinecap: 'round' } as const
  // RadarOpus's picture: an upright grey tag behind with its string looped over its top, and in front a
  // tilted green tag (rounded, white-edged) whose grey string hangs down on the left (original glyph)
  const LEFT_LOOP = 'M4.4 17.4V9.4C4.4 5.4 8.8 4.6 10.1 9.4M6.9 17.2v-6.4c0-1.9 1.6-2.3 2.6-.8'
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <rect x="11.6" y="5.2" width="8.6" height="16.2" rx="1.3" style={{ fill: TAG_GREY }} />
      <path d="M13.2 9.2C12.6 4.6 16.6 2.2 17.8 5.4v4" style={edge} />
      <path d="M13.2 9.2C12.6 4.6 16.6 2.2 17.8 5.4v4" style={string} />
      <path d={LEFT_LOOP} style={edge} />
      <path d={LEFT_LOOP} style={string} />
      <rect x="8.7" y="5.4" width="6.4" height="16.6" rx="1.4" transform="rotate(-28 11.9 13.7)" style={{ fill: TAG_GREEN, stroke: PAPER, strokeWidth: 0.9 }} />
      {/* the string runs over the green tag's top into its hole */}
      <path d="M8.2 6.9c.9-.5 1.9.2 2.3 1.4" style={edge} />
      <path d="M8.2 6.9c.9-.5 1.9.2 2.3 1.4" style={string} />
    </svg>
  )
}

/**
 * Back / Forward (after RadarOpus's): a short, chunky blue arrow, a large chevron head (about half the
 * length) on a thick bar, every corner rounded (a same-colour round-joined stroke over the fill).
 * RadarOpus's blue here (#4386ba) is a slightly greyed, darker blue than the other icons' accents.
 */
const ARROW = `color-mix(in srgb, color-mix(in srgb, ${BLUE} 85%, ${GREY}) 92%, ${PAPER})`
const ARROW_STYLE = { fill: ARROW, stroke: ARROW, strokeWidth: 1.4, strokeLinejoin: 'round' } as const

export function BackArrowIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <path d="M1.9 12 7.2 6h5.6l-3.9 4.6h13.4v2.8H8.9l3.9 4.6H7.2z" style={ARROW_STYLE} />
    </svg>
  )
}
export function ForwardArrowIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <path d="M22.1 12 16.8 6h-5.6l3.9 4.6H1.7v2.8h13.4l-3.9 4.6h5.6z" style={ARROW_STYLE} />
    </svg>
  )
}

/**
 * Zoom in / Zoom out (after RadarOpus's): a black-rimmed magnifier with a white lens filled by a bold
 * light-blue plus or minus, on a short heavy black handle.
 */
export function ZoomGlassIcon({ size = 24, className, plus }: IconProps & { plus: boolean }) {
  const INK = 'var(--ro-icon-ink)'
  const SIGN = `color-mix(in srgb, ${BLUE} 85%, ${PAPER})`
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <path d="M14.6 14.6l1.6 1.6" style={{ stroke: INK, strokeWidth: 1.6 }} />
      <path d="M16.6 16.6l4.4 4.4" style={{ stroke: INK, strokeWidth: 3.4, strokeLinecap: 'round' }} />
      <circle cx="9.6" cy="9.6" r="6.6" style={{ fill: PAPER, stroke: INK, strokeWidth: 1.7 }} />
      <path d={plus ? 'M9.6 5.6v8M5.6 9.6h8' : 'M5.4 9.6h8.4'} style={{ stroke: SIGN, strokeWidth: 3, strokeLinecap: 'round' }} />
    </svg>
  )
}

/** History: a spiral notebook with a clock at its upper right. */
export function HistoryBookIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <rect x="4.6" y="5.2" width="12.4" height="16.6" rx="1" style={{ fill: PAPER, stroke: GREY, strokeWidth: 1 }} />
      {[9.5, 12.5, 15.5, 18.5].map(y => <path key={y} d={`M7.6 ${y}h7`} style={{ stroke: PALE_GREY, strokeWidth: 1 }} />)}
      {[7.4, 10.4, 13.4, 16.4, 19.4].map(y => <path key={y} d={`M3.2 ${y}h3`} style={{ stroke: GREY, strokeWidth: 1.2, strokeLinecap: 'round' }} />)}
      <circle cx="17.2" cy="6.6" r="5.2" style={{ fill: PAPER, stroke: GREY, strokeWidth: 1.3 }} />
      <path d="M17.2 3.6v3.2l2.2 1.4" style={{ stroke: BLUE, strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    </svg>
  )
}

/** Print: a grey printer, a sheet with blue lines standing in it. */
export function PrintIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <rect x="6.6" y="1.8" width="10.8" height="9" style={{ fill: PAPER, stroke: GREY, strokeWidth: 0.9 }} />
      {[4.2, 6.2, 8.2].map(y => <path key={y} d={`M8.4 ${y}h7.2`} style={{ stroke: BLUE, strokeWidth: 0.9 }} />)}
      <path d="M3.4 9.6h17.2c.9 0 1.6.7 1.6 1.6v7.2H1.8v-7.2c0-.9.7-1.6 1.6-1.6z" style={{ fill: GREY }} />
      <rect x="5.6" y="16" width="12.8" height="5.4" style={{ fill: PALE_GREY, stroke: GREY, strokeWidth: 0.9 }} />
      <path d="M4 12.4h2" style={{ stroke: PAPER, strokeWidth: 1.2, strokeLinecap: 'round' }} />
    </svg>
  )
}

/** Screenshot: a grey camera with a blue lens. */
export function CameraIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <path d="M8.4 4.6h7.2l1.4 2.4h3.4c1 0 1.8.8 1.8 1.8v10.4c0 1-.8 1.8-1.8 1.8H3.6c-1 0-1.8-.8-1.8-1.8V8.8c0-1 .8-1.8 1.8-1.8H7z" style={{ fill: GREY }} />
      <rect x="3.6" y="5.6" width="2.6" height="1.4" rx=".4" style={{ fill: GREY }} />
      <circle cx="12" cy="13.6" r="5" style={{ fill: PALE_GREY }} />
      <circle cx="12" cy="13.6" r="3.6" style={{ fill: BLUE }} />
      <circle cx="10.8" cy="12.4" r="1" style={{ fill: PAPER }} />
    </svg>
  )
}

/**
 * Repertories (after RadarOpus's): a closed book seen slightly from above, a grey spine at the left,
 * the page block showing over the deep-blue front cover.
 */
export function RepertoriesIcon({ size = 24, className }: IconProps) {
  const COVER = `color-mix(in srgb, ${BLUE} 94%, ${PAPER})`
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <path d="M4.6 3c0-.8.6-1.3 1.4-1.3h2.3v20.6H6c-.8 0-1.4-.6-1.4-1.4z" style={{ fill: `color-mix(in srgb, ${GREY} 82%, ${PAPER})` }} />
      <rect x="8.3" y="1.7" width="10.9" height="1.4" rx=".4" style={{ fill: `color-mix(in srgb, ${BLUE} 75%, ${PAPER})` }} />
      <rect x="8.3" y="3.1" width="10" height="2.3" style={{ fill: PAPER }} />
      <rect x="18.3" y="3.1" width=".9" height="2.3" style={{ fill: COVER }} />
      <rect x="8.3" y="5.4" width="11" height="16.4" rx=".5" style={{ fill: COVER }} />
      <rect x="8.3" y="5.4" width=".7" height="16.4" style={{ fill: `color-mix(in srgb, ${BLUE} 30%, ${PAPER})` }} />
      <rect x="8.3" y="21.6" width="11" height=".7" style={{ fill: `color-mix(in srgb, ${BLUE} 35%, ${PAPER})` }} />
    </svg>
  )
}

/**
 * Maps (after RadarOpus's): a map folded in three panels with zig-zag top and bottom edges, a thick grey
 * outline round a pale rim, and teal land parcels split by pale roads.
 */
export function MapsIcon({ size = 24, className }: IconProps) {
  const LAND = `color-mix(in srgb, var(--ro-icon-teal) 85%, ${PAPER})`
  const RIM = `color-mix(in srgb, var(--ro-icon-teal) 12%, ${PAPER})`
  const EDGE = `color-mix(in srgb, ${GREY} 80%, ${PAPER})`
  return (
    <svg {...box(size, className)} style={{ fill: 'none', stroke: 'none' }}>
      <path d="M1.5 4.7 6.8 3l4.8 2.4 10.7-2.9v15.4l-10.7 2.8-4.8-2.6-5.3 2.1z" style={{ fill: RIM, stroke: EDGE, strokeWidth: 1.6, strokeLinejoin: 'round' }} />
      <path d="M2.8 5.6 6.8 4.3l4.8 2.4L21 4.2V17l-9.4 2.4-4.8-2.6-4 1.6z" style={{ fill: LAND }} />
      <path d="M3 9.4 5.6 10.4 8.2 11.2 11 9.6 12.6 6.4M8.2 11.2 9 15.6 7.6 17.4M9 13.6 13.6 15 16.8 12 21 13.2M13.6 15 14.4 19.4M16.8 12 16 7.6 18.8 4.6M2.8 14.4 5.4 13.4 8.6 12.8" style={{ stroke: RIM, strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    </svg>
  )
}
