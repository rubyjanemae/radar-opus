/**
 * Advance widths of Verdana's capitals, digits and the few signs chapter names use, in 1/1000 em.
 * Anything else counts as a wide capital.
 */
const W: Record<string, number> = {
  A: 684, B: 686, C: 698, D: 771, E: 632, F: 575, G: 775, H: 751, I: 421, J: 455, K: 693, L: 557, M: 843,
  N: 748, O: 787, P: 603, Q: 787, R: 695, S: 684, T: 616, U: 732, V: 684, W: 989, X: 685, Y: 615, Z: 685,
  ' ': 352, '&': 706, '-': 431, ',': 364, '.': 364, '(': 454, ')': 454, '/': 454, "'": 269,
}
const width = (s: string) => { let w = 0; for (const c of s) w += W[c] ?? W[c.normalize('NFD').charAt(0)] ?? 760; return w }
/**
 * The widest cut a tile caption keeps before its "." (1/1000 em): between "URINARY" (4590), which
 * RadarOpus keeps, and "EXPECTO" (4653), which it shortens to "EXPECT.".
 */
const CUT_WIDTH = 4620

/**
 * The name a chapter tile shows: "Genitalia male" reads "male Genitalia", so the two genitalia
 * chapters stay apart ("MALE GE.", "FEMALE ."). The Navigation window's type-ahead matches this
 * name, so typing M finds the tile captioned "MALE GE.", as in RadarOpus.
 */
export function chapterShownName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  const m = /^(.+) (male|female|männlich|weiblich)$/i.exec(n)
  return m ? `${m[2]} ${m[1]}` : n
}

/**
 * Short UPPERCASE caption of a chapter tile in the Navigation window, like RadarOpus: names of up
 * to seven characters stay whole ("VERTIGO", "ABDOMEN"); longer ones keep as many of their first
 * seven characters as fit the caption width and end in "." ("RESPIRA.", "EXTERN.", "GENERA.").
 * The cut is taken as it falls, a space included ("FEMALE ."), as RadarOpus does.
 */
export function chapterCaption(name: string, max = 7): string {
  const n = chapterShownName(name).toUpperCase()
  if (n.length <= max) return n
  let k = max
  while (k > 1 && width(n.slice(0, k)) > CUT_WIDTH) k--
  return `${n.slice(0, k)}.`
}

/** Letters of the Navigation window's letter row. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** First characters of `names` that are not plain letters A..Z, in first-seen order (for the "…" menu). */
export function otherInitials(names: readonly string[]): string[] {
  const out: string[] = []
  for (const n of names) {
    const c = n.trim().charAt(0).toLowerCase()
    if (c && !/[a-z]/.test(c) && !out.includes(c)) out.push(c)
  }
  return out
}
