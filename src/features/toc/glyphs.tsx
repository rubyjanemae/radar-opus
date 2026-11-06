/** Small original glyphs of the table of contents: language flags and the document type icons. */

/** A simplified national flag for a document's language; a lettered badge for other languages. */
export function LangFlag({ lang }: { lang: string }) {
  const l = lang.toLowerCase()
  const label = LANG_NAME[l] ?? l.toUpperCase()
  if (l === 'en') return (
    <svg className="toc-flag" viewBox="0 0 20 12" width="17" height="13" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="20" height="12" className="f-blue" />
      <path d="M0 0 20 12M20 0 0 12" className="s-white" strokeWidth="2.4" />
      <path d="M0 0 20 12M20 0 0 12" className="s-red" strokeWidth="0.9" />
      <path d="M10 0v12M0 6h20" className="s-white" strokeWidth="4" />
      <path d="M10 0v12M0 6h20" className="s-red" strokeWidth="2.2" />
    </svg>
  )
  if (l === 'de') return (
    <svg className="toc-flag" viewBox="0 0 20 12" width="17" height="13" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      <rect width="20" height="4" className="f-black" /><rect y="4" width="20" height="4" className="f-red" /><rect y="8" width="20" height="4" className="f-gold" />
    </svg>
  )
  return <span className="toc-flag toc-flag-code" role="img" aria-label={label} title={label}>{l.slice(0, 2).toUpperCase()}</span>
}

const LANG_NAME: Record<string, string> = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', nl: 'Dutch', pt: 'Portuguese' }

/** Closed book (repertory documents): a dark spine, the blue cover and the light page edge on top. */
export function BookGlyph() {
  return (
    <svg className="toc-book" viewBox="0 0 12 14" width="12" height="14" aria-hidden="true">
      <rect x="1.2" y="0.3" width="10.5" height="3" rx="0.9" className="toc-book-pages" />
      <rect x="1.2" y="2.3" width="10.5" height="11.6" rx="0.9" className="toc-book-cover" />
      <rect x="0.3" y="0.6" width="2.4" height="13.3" rx="1" className="toc-book-spine" />
    </svg>
  )
}

/** Small tree (families documents). */
export function TreeGlyph() {
  return (
    <svg className="toc-treeic" viewBox="1.5 0 13 16" width="13" height="16" aria-hidden="true">
      <path d="M7.2 10.5h1.6V15H7.2z" className="toc-treeic-trunk" />
      <path d="M8 1.2c2.2 0 3.6 1.5 3.6 3.2a2.8 2.8 0 0 1 1.4 4.9A3 3 0 0 1 10.3 11H5.7A3 3 0 0 1 3 9.3a2.8 2.8 0 0 1 1.4-4.9C4.4 2.7 5.8 1.2 8 1.2z" className="toc-treeic-crown" />
    </svg>
  )
}

/** Outline star marking the default repertory. */
export function StarGlyph() {
  return (
    <svg className="toc-star" viewBox="1.2 1.1 13.6 13.6" width="14" height="14" aria-hidden="true">
      <path d="M8 1.5l1.9 4.1 4.5.5-3.4 3 1 4.4L8 11.3l-4 2.2 1-4.4-3.4-3 4.5-.5z" />
    </svg>
  )
}

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
const COGS = `${gear(5.6, 9.4, 5, 3.6, 8)}${hole(5.6, 9.4, 1.6)}${gear(11, 3.8, 3.1, 2.2, 6)}${hole(11, 3.8, 0.9)}`

/** The table of contents' header buttons: solid glyphs (refresh arrows, two cogs, ringed question mark). */
export function RefreshGlyph() {
  // two thick blue circular arrows chasing each other, with clear gaps (an original drawing)
  const arc = 'M2.65 8.17A4.5 4.5 0 0 1 9.25 3.1'
  const head = 'M10.25 1.37 11.6 4.5 8.25 4.83Z'
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" className="toc-hglyph">
      <g className="toc-hglyph-arrows">
        <path d={arc} fill="none" strokeWidth="1.8" />
        <path d={head} strokeWidth=".5" />
        <g transform="rotate(180 7 7)">
          <path d={arc} fill="none" strokeWidth="1.8" />
          <path d={head} strokeWidth=".5" />
        </g>
      </g>
    </svg>
  )
}
export function CogsGlyph() {
  return (
    <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true" className="toc-hglyph">
      <path d={COGS} fillRule="evenodd" fill="currentColor" />
    </svg>
  )
}
export function HelpGlyph() {
  return (
    <svg viewBox="0 0 14 14" width="15" height="15" aria-hidden="true" className="toc-hglyph">
      <circle cx="7" cy="7" r="5.9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.1 5.5a1.95 1.95 0 1 1 2.8 1.75c-.55.3-.9.7-.9 1.3v.35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}
