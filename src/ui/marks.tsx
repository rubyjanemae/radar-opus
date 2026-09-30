/*
 * Small grade and group markers shared by the analysis grid, its dialogs, the remedy panel and the
 * printouts. Kept out of AnalysisGrid so a dialog that shows a grade does not pull the whole grid
 * (and everything it imports) into its chunk. Styles: `.an-flag` / `.an-mark` in analysis.css.
 */

/** Group letter marker: a small orange rounded square with the lowercase letter (same marker as the clipboard). */
export function GroupMark({ letter }: { letter: string }) {
  return <span className="an-flag f-g" title={`Group ${letter.toLowerCase()}: calculated as one symptom with the other symptoms of this group`}>{letter.toLowerCase()}</span>
}

/** Grade mark: bar height (1–4 steps) plus colour, never colour alone. */
export function GradeMark({ g }: { g: number }) {
  if (!g) return null
  return <span className={`an-mark m${g}`} aria-hidden="true" />
}
