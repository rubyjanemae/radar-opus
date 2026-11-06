import { actions, useApp } from '../../state/store'
import type { RepertoryTab } from '../../state/workspace'
import { revealAtTop } from '../repertory/revealTop'

/**
 * A chapter tile for the chapter the book already shows, with the reader scrolled away from its
 * heading, brings the heading back to the top of column 1. That is a jump like any other, so it is
 * a history step: the tab gets a Back entry for the same rubric, and this module keeps the page
 * position it left (the book itself restores pages per rubric, which cannot tell the two apart).
 * Back over such an entry puts the page back where the reader was; Forward brings the heading
 * back to the top. Only a real move is a history step: a tile for the chapter whose heading already
 * sits at the top leaves the page where it is and adds no Back entry (a Back that changes nothing
 * visible is a dead step). RadarOpus's own behaviour for that click is unverified.
 */

/** Where a page was: its scrollTop and the rubric row at the top of column 1 with its distance from the top. */
interface Page { top: number; rubric: string | null; delta: number }
/** `${tabId}:${backDepth}` → the page the book showed before the tile was clicked. */
const pages = new Map<string, Page>()

/** The rubric row at the top of column 1 (rows above settle their heights later, so the row is the anchor). */
function pageOf(el: HTMLElement): Page {
  const view = el.getBoundingClientRect().top
  let best: { rubric: string; delta: number } | null = null
  for (const r of el.querySelectorAll<HTMLElement>('.rv-col1 .rv-row[data-rubric]')) {
    const b = r.getBoundingClientRect()
    if (b.bottom <= view + 0.5) continue
    if (!best || b.top - view < best.delta) best = { rubric: r.dataset.rubric!, delta: b.top - view }
  }
  return { top: el.scrollTop, rubric: best?.rubric ?? null, delta: best?.delta ?? 0 }
}

/** Back to a page: its scrollTop, then the anchor row nudged to where it was while the heights settle. */
function restore(el: HTMLElement, p: Page) {
  el.scrollTop = p.top
  if (p.rubric == null) return
  let frames = 8
  const fix = () => {
    const r = el.querySelector<HTMLElement>(`.rv-col1 .rv-row[data-rubric="${p.rubric}"]`)
    if (r) {
      const d = r.getBoundingClientRect().top - el.getBoundingClientRect().top - p.delta
      if (Math.abs(d) > 0.5) el.scrollTop += d
    }
    if (--frames > 0) requestAnimationFrame(fix)
  }
  requestAnimationFrame(fix)
}
let watching = false

const bookOf = (tabId: string) =>
  document.querySelector<HTMLElement>(`.tab-doc[data-tab-doc="${CSS.escape(tabId)}"][data-active] .rv-scroll`)

function watch() {
  if (watching) return
  watching = true
  useApp.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return
    for (const t of s.tabs) {
      if (t.kind !== 'repertory') continue
      const p = prev.tabs.find(x => x.id === t.id) as RepertoryTab | undefined
      if (!p || p.rubric !== t.rubric) continue
      if (t.back.length === p.back.length - 1 && t.forward.length === p.forward.length + 1) {
        // Back over a same-rubric entry: the page it left
        const page = pages.get(`${t.id}:${p.back.length}`)
        const el = bookOf(t.id)
        if (page && el) restore(el, page)
      } else if (t.back.length === p.back.length + 1 && t.forward.length === p.forward.length - 1 && pages.has(`${t.id}:${t.back.length}`)) {
        // Forward over it: the chapter heading at the top again
        revealAtTop(`${t.repertory}:${t.rubric}`)
      }
    }
  })
}

/**
 * Call right before the tile's navigation (goToRef + revealAtTop) and run the returned commit right
 * after the reveal; it looks one frame later, once the reveal has scrolled. When `tab` already
 * shows `chapter` in the active document and the reveal moved the page, the tab gets the Back
 * entry for the page it left; a reveal that moved nothing (heading already at the top) adds none.
 */
export function noteSameChapterJump(tab: RepertoryTab, chapter: number): () => void {
  if (tab.rubric !== chapter) return () => {}
  const el = bookOf(tab.id)
  if (!el) return () => {}
  const page = pageOf(el)
  // the reveal writes the scroll position in the next frame (its write was queued first)
  return () => requestAnimationFrame(() => {
    if (Math.abs(el.scrollTop - page.top) <= 1) return
    const t = useApp.getState().tabs.find(x => x.id === tab.id) as RepertoryTab | undefined
    // the reader went elsewhere meanwhile: that move made its own history
    if (!t || t.rubric !== chapter || t.back !== tab.back) return
    watch()
    const back = [...tab.back.slice(-99), tab.rubric]
    for (const k of [...pages.keys()]) if (k.startsWith(`${tab.id}:`) && Number(k.slice(tab.id.length + 1)) >= back.length) pages.delete(k)
    pages.set(`${tab.id}:${back.length}`, page)
    actions.updateTab<RepertoryTab>(tab.id, { back, forward: [] })
  })
}
