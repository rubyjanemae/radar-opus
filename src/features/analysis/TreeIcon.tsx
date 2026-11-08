/**
 * The families (remedy filter) menu icon, drawn after RadarOpus's full-colour tree: a round teal-green crown
 * of overlapping lobes over a tan trunk that forks into it. Colours come from the analysis theme variables
 * (--an-tree-*), so dark mode follows.
 */
export function TreeIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="an-tree-ic">
      {/* a short, thick trunk flaring at the foot and forking into the crown */}
      <path d="M8.4 23.6 Q10.4 22.6 10.5 19.6 L10.1 15.2 L7.4 12.4 L9 11.9 L11.4 14.3 L12.6 11.2 L14.2 11.7 L13.4 15.4 L13.6 19.6 Q13.7 22.6 15.8 23.6 Z" fill="var(--an-tree-trunk)" />
      {/* a broad, bushy canopy (as wide as the map icon): lobes all round a solid core */}
      <g fill="var(--an-tree-leaf)" stroke="var(--an-tree-edge)" strokeWidth=".5">
        <circle cx="4.4" cy="10.6" r="3.9" />
        <circle cx="19.6" cy="10.6" r="3.9" />
        <circle cx="5.6" cy="5.8" r="3.9" />
        <circle cx="18.4" cy="5.8" r="3.9" />
        <circle cx="9.4" cy="3.6" r="3.4" />
        <circle cx="14.6" cy="3.6" r="3.4" />
        <circle cx="7.6" cy="14" r="3.3" />
        <circle cx="16.4" cy="14" r="3.3" />
        <circle cx="12" cy="14.6" r="2.8" />
      </g>
      <ellipse cx="12" cy="9" rx="9.6" ry="6.2" fill="var(--an-tree-leaf)" />
      {/* lighter leaf flecks */}
      <g fill="var(--an-tree-hi)">
        <circle cx="7.4" cy="6" r="1.1" />
        <circle cx="13.6" cy="4.6" r="1" />
        <circle cx="17.4" cy="8.4" r="1" />
        <circle cx="5" cy="10.8" r=".9" />
        <circle cx="10.6" cy="10.4" r=".9" />
        <circle cx="15.6" cy="12.4" r=".8" />
      </g>
      {/* the trunk's fork shows in front of the crown's lower edge */}
      <path d="M10.2 16.6 L8.6 14.4 L9.8 14 L11.4 15.6 L12.8 13.4 L14 13.9 L13.4 16.6 Z" fill="var(--an-tree-trunk)" />
    </svg>
  )
}
