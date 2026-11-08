import { memo, useEffect } from 'react'
import { useContextMenu } from '../ui/Menu'
import { historyItems } from './history'

type Opener = () => void
let opener: Opener | null = null

/** Open RadarOpus's History popup (toolbar History, View › History). */
export function openHistoryPopup() { opener?.() }
export const historyPopupMounted = () => opener !== null

/** The last mouse press/release, so a click-opened popup can open where the pointer is. */
let pointer: { x: number; y: number; t: number } | null = null
const track = (e: PointerEvent) => { if (e.pointerType !== 'touch' || e.isPrimary) pointer = { x: e.clientX, y: e.clientY, t: performance.now() } }

/**
 * Where RadarOpus puts the popup: like Qt's `QMenu::exec(QCursor::pos())` its top-left corner sits at the mouse
 * pointer, so a click on the History button (or on View › History) opens it just below-right of the click.
 * Opened from the keyboard (no click just now) it falls back to the spot RadarOpus showed with the pointer
 * away from the toolbar: about 45% of the window's width and 41% of its height (left 661, top 369 at 1470x895).
 * A list too long for the space below moves up so it ends at the window's bottom edge, as RadarOpus's does.
 */
function anchor(): { x: number; y: number } {
  if (pointer && performance.now() - pointer.t < 800) return { x: Math.round(pointer.x), y: Math.round(pointer.y) }
  return { x: Math.round(window.innerWidth * 0.45), y: Math.round(window.innerHeight * 0.412) }
}

/** The brown History popup, owned by the shell so it opens with the toolbars hidden too. */
export const HistoryPopup = memo(function HistoryPopup() {
  const cm = useContextMenu()
  useEffect(() => {
    const fn: Opener = () => cm.openAt(document.body, historyItems(), 'tb-history-menu', anchor())
    opener = fn
    return () => { if (opener === fn) opener = null }
  })
  useEffect(() => {
    window.addEventListener('pointerdown', track, true)
    window.addEventListener('pointerup', track, true)
    return () => { window.removeEventListener('pointerdown', track, true); window.removeEventListener('pointerup', track, true) }
  }, [])
  return cm.element
})
