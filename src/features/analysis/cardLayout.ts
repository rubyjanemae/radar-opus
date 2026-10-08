/** Padding around the card grid and the gap between cards (px). */
export const CARD_PAD = 10
export const CARD_GAP = 8
/** Narrowest a card gets; wider boxes fit more columns, and the cards share the rest. */
export const CARD_MIN_W = 230

/**
 * Columns of the virtualised card grid in a box `width` px wide, and each card's width: as many
 * `CARD_MIN_W` cards as fit, sharing the leftover width (what `repeat(auto-fill, minmax(230px, 1fr))` did).
 * Pure, so the layout is unit-tested.
 */
export function cardLayout(width: number): { cols: number; cardW: number } {
  const inner = Math.max(0, width - 2 * CARD_PAD)
  const cols = Math.max(1, Math.floor((inner + CARD_GAP) / (CARD_MIN_W + CARD_GAP)))
  const cardW = Math.max(0, Math.floor((inner - (cols - 1) * CARD_GAP) / cols))
  return { cols, cardW }
}
