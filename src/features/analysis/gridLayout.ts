/**
 * Width of the analysis grid's symptom (label) column for a scroll box `width` px wide showing `nc`
 * remedy columns of `col` px. Pure, so the layout rules are unit-tested.
 *
 * - Narrow boxes: the label shrinks towards `min` (never below it) so more remedy columns show.
 * - Few remedies: the label grows into the width the columns leave unused (up to `max`).
 * - When the columns overflow, the label absorbs the remainder so the visible columns end on a whole
 *   cell: the right edge never cuts a remedy column in half (scrolling snaps by whole columns too).
 */
export function gridLabelWidth(width: number, nc: number, o: { base: number; col: number; min: number; max: number }): number {
  if (!width) return o.base
  const fit = Math.max(o.min, Math.min(o.base, width * 0.4), Math.min(o.max, width - nc * o.col))
  let label = Math.round(fit)
  if (label + nc * o.col > width) {
    const cols = Math.max(0, width - label)
    label += cols % o.col
  }
  return label
}
