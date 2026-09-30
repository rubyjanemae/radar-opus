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

/**
 * Remedy columns not wholly visible to the right of a grid scrolled to `scrollLeft` in a box `width` px
 * wide (label column `label` px, columns `col` px, `nc` of them): the count the "N more remedies" cue shows.
 */
export function hiddenColumnsRight(scrollLeft: number, width: number, label: number, col: number, nc: number): number {
  if (!width || col <= 0) return 0
  return Math.max(0, nc - Math.floor((scrollLeft + width - label + 0.5) / col))
}

/** Columns / rows are rendered in blocks, so scrolling re-renders only when a block boundary is crossed. */
export const COL_BLOCK = 4
export const ROW_BLOCK = 6

export interface Viewport {
  width: number
  height: number
  /** Rendered column range [c0, c1) and row range [r0, r1): the visible range widened to whole blocks. */
  c0: number; c1: number; r0: number; r1: number
  /** More columns to the right (draws the edge fade) and the scrollbar sizes the fade stays clear of. */
  canRight: boolean
  /** Remedy columns wholly or partly beyond the right edge (the "+N" cue). */
  hiddenRight: number
  sbw: number; sbh: number
}

const snapDown = (x: number, b: number) => Math.max(0, Math.floor(x / b) * b)
const snapUp = (x: number, n: number, b: number) => Math.min(n, Math.ceil(x / b) * b)

export type Geom = { label: number; col: number; head: number; row: number; nr: number; nc: number }

/**
 * The rendered ranges of a `w`×`h` scroll box scrolled to (x, y). Pure: the first render computes it from
 * the size of the pane the grid mounts into, so the first commit already draws every visible column and
 * no layout effect has to re-render the whole grid synchronously after it.
 */
export function computeViewport(g: Geom, w: number, h: number, x = 0, y = 0, scrollWidth = g.label + g.nc * g.col, sbw = 0, sbh = 0): Viewport {
  const { label, col, head, row, nr, nc } = g
  return {
    width: w, height: h,
    c0: Math.min(nc, snapDown(Math.floor(x / col), COL_BLOCK)),
    c1: snapUp(Math.ceil((x + Math.max(0, w - label)) / col), nc, COL_BLOCK),
    r0: Math.min(nr, snapDown(Math.floor(y / row), ROW_BLOCK)),
    r1: snapUp(Math.ceil((y + Math.max(0, h - head)) / row), nr, ROW_BLOCK),
    canRight: x + w < scrollWidth - 1,
    hiddenRight: hiddenColumnsRight(x, w, label, col, nc),
    sbw, sbh,
  }
}
