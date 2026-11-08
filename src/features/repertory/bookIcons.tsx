/**
 * Glyphs of the book's sub-toolbar, drawn after RadarOpus's coloured pictures (original artwork):
 * binoculars, clipboard, globe, pie, the remedy jar, the person, the tags, the ruled page and the
 * jar with a plus, the double gear and the round "?". Colours are the book tokens (book.css --rb-ic-*),
 * so dark mode follows (outside the book they fall back to the --ro-icon-* theme colours).
 */
import type { ReactNode } from 'react'

export type BookIconProps = { size?: number; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }

const BLUE = 'var(--rb-ic-blue, var(--ro-icon-blue))'
const GOLD = 'var(--rb-ic-gold, var(--ro-icon-amber))'
const GREY = 'var(--rb-ic-grey, var(--ro-icon-grey))'
const LIGHT = 'var(--rb-ic-light)'
const PAPER = 'var(--rb-paper, var(--ro-win))'
const PEACH = 'var(--rb-ic-peach)'
const BROWN = 'var(--rb-ic-brown)'
const PLUS = 'var(--rb-ic-plus)'
const SKIN = 'var(--rb-ic-skin)'
const TAN = 'var(--rb-ic-tan)'

function Svg({ size = 24, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ fill: 'none', stroke: 'none' }}>{children}</svg>
}

/** Binoculars: two grey barrels with blue lenses. */
export function BinocularsIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="9.6" y="9" width="4.8" height="4.4" rx="1" style={{ fill: GREY }} />
      <path d="M3.2 9.4c.3-2 1.4-3 2.9-3s2.6 1 2.9 3l1 6.4H2.2z" style={{ fill: GREY }} />
      <path d="M14.9 9.4c.3-2 1.4-3 2.9-3s2.6 1 2.9 3l1 6.4H13.9z" style={{ fill: GREY }} />
      <circle cx="6.2" cy="15.6" r="4.6" style={{ fill: GREY }} />
      <circle cx="17.8" cy="15.6" r="4.6" style={{ fill: GREY }} />
      <circle cx="6.2" cy="15.8" r="3" style={{ fill: BLUE, stroke: PAPER, strokeWidth: 0.9 }} />
      <circle cx="17.8" cy="15.8" r="3" style={{ fill: BLUE, stroke: PAPER, strokeWidth: 0.9 }} />
      <circle cx="5.3" cy="14.9" r=".9" style={{ fill: PAPER }} />
      <circle cx="16.9" cy="14.9" r=".9" style={{ fill: PAPER }} />
    </Svg>
  )
}

/** Clipboard: a tan board with a grey clip and a ruled sheet. */
export function ClipboardIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2.6" y="4" width="13.4" height="18.4" rx="1.4" style={{ fill: TAN }} />
      <path d="M6.6 5.6V3.8c0-.8.6-1.4 1.4-1.4h.5a1.6 1.6 0 0 1 3.2 0h.5c.8 0 1.4.6 1.4 1.4v1.8z" style={{ fill: PAPER, stroke: GREY, strokeWidth: 0.9 }} />
      <rect x="8.2" y="10.2" width="10.6" height="12.4" style={{ fill: PAPER, stroke: GREY, strokeWidth: 0.9 }} />
      {[13.4, 16, 18.6].map(y => <path key={y} d={`M10.2 ${y}h6.6`} style={{ stroke: GREY, strokeWidth: 1 }} />)}
    </Svg>
  )
}

/** Globe: a blue sphere with golden continents. */
export function GlobeIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="10" style={{ fill: BLUE }} />
      <path d="M6.2 4.4c1.8.4 3.2 1.4 3.4 3-.2 1.2-1.4 1.6-1.2 2.8.3 1.4 2.2 1.4 2.4 3 .1 1.6-1 2.6-.8 4.4-1.6-.4-2.4-2-2.8-3.6-.3-1.4-1.6-2-2.6-2.6-.8-.6-.8-1.8-.4-2.8.4-1.4 1-2.8 2-4.2z" style={{ fill: GOLD }} />
      <path d="M13.4 3.4c1.6.8 2 2.2 3.4 2.4 1.4.2 2.8 1.4 3.4 3-1 .4-2.2-.2-3 .4-.8.8.2 2.4-.6 3.4-.8.8-2 .2-2.6-.8-.6-1.2.4-2.2-.2-3.2-.6-1-2-1.4-2.2-2.6 0-1.2.8-2 1.8-2.6z" style={{ fill: GOLD }} />
      <path d="M15.6 15c1.2-.2 2.4.4 2.8 1.6-.2 1.4-1.4 2.6-2.8 3.2-.6-1.4-.8-3.2 0-4.8z" style={{ fill: GOLD }} />
      <circle cx="12" cy="12" r="10" style={{ stroke: 'color-mix(in srgb, var(--rb-ic-blue) 70%, black)', strokeWidth: 0.6 }} />
    </Svg>
  )
}

/** Pie: a gold, a blue and a grey slice, the grey one pulled out. */
export function PieIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 2.2A9.6 9.6 0 0 1 21.6 11.8H12z" style={{ fill: GOLD }} />
      <path d="M11 3.2v9.6h9.6A9.6 9.6 0 1 1 11 3.2z" style={{ fill: BLUE }} />
      <path d="M13 13.8h8.4a8.4 8.4 0 0 1-3.4 6.6z" style={{ fill: GREY }} />
      <path d="M12 2.2A9.6 9.6 0 0 1 21.6 11.8H12z" style={{ stroke: 'color-mix(in srgb, var(--rb-ic-gold) 70%, black)', strokeWidth: 0.4 }} />
    </Svg>
  )
}

/** Remedy jar: a clear jar with a dark lid and golden pills. */
export function JarIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="7" y="1.6" width="10" height="2.4" rx=".6" style={{ fill: GREY }} />
      <path d="M8 4.4v1.4c-2 1.2-3 2.6-3 4.6v9.2c0 1.2.8 2 2 2h10c1.2 0 2-.8 2-2v-9.2c0-2-1-3.4-3-4.6V4.4" style={{ fill: 'color-mix(in srgb, var(--rb-paper) 25%, transparent)', stroke: GREY, strokeWidth: 1.5, strokeLinejoin: 'round' }} />
      <ellipse cx="10.2" cy="18.4" rx="2.6" ry="1.7" style={{ fill: GOLD, stroke: 'color-mix(in srgb, var(--rb-ic-gold) 70%, black)', strokeWidth: 0.5 }} />
      <ellipse cx="13.8" cy="16.6" rx="2.6" ry="1.7" style={{ fill: GOLD, stroke: 'color-mix(in srgb, var(--rb-ic-gold) 70%, black)', strokeWidth: 0.5 }} />
      <ellipse cx="12.6" cy="19.4" rx="2.4" ry="1.5" style={{ fill: GOLD, stroke: 'color-mix(in srgb, var(--rb-ic-gold) 70%, black)', strokeWidth: 0.5 }} />
    </Svg>
  )
}

/** Person: a pale head over grey shoulders with a blue tie. */
export function PersonIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="7" r="5" style={{ fill: SKIN }} />
      <path d="M10.2 14.2C7 14.2 5 16 5 18.4c0 1.6 1 2.6 2.6 2.6M13.8 14.2c3.2 0 5.2 1.8 5.2 4.2 0 1.6-1 2.6-2.6 2.6" style={{ stroke: GREY, strokeWidth: 1.5, strokeLinecap: 'round' }} />
      <path d="M11.3 15.6h1.4l.4 1.2-.6 4.4h-.9l-.7-4.4z" style={{ fill: BLUE }} />
    </Svg>
  )
}

/** Tags: two blue tag outlines, one behind the other. */
export function TagsIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6.4 2.6h6.2l8.8 8.8-6.2 6.2-8.8-8.8z" style={{ stroke: BLUE, strokeWidth: 1.5, strokeLinejoin: 'round' }} />
      <path d="M3 6h6.2l8.8 8.8-6.2 6.2L3 12.2z" style={{ fill: 'color-mix(in srgb, var(--rb-paper) 20%, transparent)', stroke: BLUE, strokeWidth: 1.6, strokeLinejoin: 'round' }} />
      <circle cx="6.4" cy="9.4" r="1.3" style={{ stroke: BLUE, strokeWidth: 1.2 }} />
    </Svg>
  )
}

/** A brownish plus at the lower right of a picture. */
function Plus() {
  return <path d="M18.6 14.6v7.6M14.8 18.4h7.6" style={{ stroke: PLUS, strokeWidth: 2.6 }} />
}

/** Ruled page with a plus: a peach sheet in a brown frame, lines across, a fold down the middle. */
export function PagePlusIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="2.6" y="2.6" width="15.4" height="17.4" style={{ fill: PEACH, stroke: BROWN, strokeWidth: 1.3 }} />
      {[5.4, 7.4, 9.4, 11.4, 13.4, 15.4, 17.4].map(y => <path key={y} d={`M4.4 ${y}h11.8`} style={{ stroke: BROWN, strokeWidth: 0.7 }} />)}
      <path d="M10.3 3.4v15.8" style={{ stroke: BROWN, strokeWidth: 0.6 }} />
      <Plus />
    </Svg>
  )
}

/** Jar with a plus: a peach jar with a brown lid and a grid of dots. */
export function JarPlusIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="5.4" y="1.8" width="8.8" height="2.2" rx=".6" style={{ fill: PLUS }} />
      <path d="M6.2 4.2v1.2C4.4 6.4 3.6 7.6 3.6 9.4v10c0 1 .6 1.6 1.6 1.6h9.2c1 0 1.6-.6 1.6-1.6v-10c0-1.8-.8-3-2.6-4V4.2z" style={{ fill: PEACH, stroke: BROWN, strokeWidth: 1.2, strokeLinejoin: 'round' }} />
      {[9, 11.2, 13.4, 15.6, 17.8].flatMap(y => [6, 8.2, 10.4, 12.6].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r=".55" style={{ fill: BROWN }} />))}
      <Plus />
    </Svg>
  )
}

/** A gear outline (n teeth) as a path, centre (cx, cy), outer radius r. */
function gear(cx: number, cy: number, r: number, n: number): string {
  const inner = r * 0.74
  const pts: string[] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const w = Math.PI / n
    for (const [ang, rad] of [[a - w * 0.55, inner], [a - w * 0.35, r], [a + w * 0.35, r], [a + w * 0.55, inner]] as const) {
      pts.push(`${(cx + Math.cos(ang) * rad).toFixed(2)} ${(cy + Math.sin(ang) * rad).toFixed(2)}`)
    }
  }
  return `M${pts.join('L')}Z`
}

const BIG = gear(9.2, 14.6, 8, 8)
const SMALL = gear(18.2, 5.8, 4.8, 7)

/** Settings: a big and a small grey gear. */
export function GearsIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <path d={BIG} style={{ fill: GREY }} />
      <circle cx="9.2" cy="14.6" r="2.6" style={{ fill: 'var(--rb-tools)' }} />
      <path d={SMALL} style={{ fill: GREY }} />
      <circle cx="18.2" cy="5.8" r="1.5" style={{ fill: 'var(--rb-tools)' }} />
    </Svg>
  )
}

/** Help: a grey ring with a question mark. */
export function HelpIcon({ size, className }: BookIconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="9.4" style={{ stroke: LIGHT, strokeWidth: 1.7 }} />
      <path d="M9 9.4c0-1.8 1.4-3 3.1-3s3.1 1.1 3.1 2.8c0 2.4-3.1 2.4-3.1 4.6v.6" style={{ stroke: LIGHT, strokeWidth: 2, strokeLinecap: 'round' }} />
      <circle cx="12.1" cy="17.4" r="1.25" style={{ fill: LIGHT }} />
    </Svg>
  )
}

/** The solid black triangle RadarOpus puts at a menu button's lower right. */
export function MenuTriangle({ className }: { className?: string }) {
  return (
    <svg width="9" height="5" viewBox="0 0 9 5" className={className} aria-hidden="true">
      <path d="M0 0h9L4.5 5z" style={{ fill: 'var(--rb-views-caret)' }} />
    </svg>
  )
}
