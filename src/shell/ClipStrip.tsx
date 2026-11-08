import { memo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatKeys } from '../commands/registry'
import { actions, useApp, selectActiveConsultation } from '../state/store'
import { ensureClipboard, takeRefs } from '../features/repertory/ops'
import { DEFAULT_TAKE } from '../features/repertory/take'
import { chromeBackgroundMouseDown, keepFocus, returnFocusFromChrome } from './focus'
import { RUBRIC_MIME, parseRubricDrop } from '../features/clipboard/logic'

/**
 * A clipboard glyph (original line art): a slim board with a heavier bottom edge, a clip with a ring on
 * top, and two ticks on a clipboard that the analysis includes.
 */
function ClipIcon({ checked }: { checked: boolean }) {
  return (
    <svg className="clip-slot-icon" width="22" height="31" viewBox="0 0 22 31" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="clip-board" d="M1.3 6.5h19.4v23H1.3z" strokeWidth="1.6" />
      <path className="clip-board-foot" d="M1.3 29.4h19.4" strokeWidth="2.6" strokeLinecap="butt" />
      <path className="clip-ring" d="M8.6 4.4a2.4 2.4 0 0 1 4.8 0" strokeWidth="1.5" />
      <rect className="clip-clip" x="6" y="4.4" width="10" height="3.8" rx="1.4" strokeWidth="1.4" />
      {checked && <path className="clip-tick" d="M6.2 14.6l2.6 2.6 6-5.8M6.2 22.2l2.6 2.6 6-5.8" strokeWidth="2.2" />}
    </svg>
  )
}

/** RadarOpus shows three clipboard slots; a case with more clipboards shows them all. */
const MIN_SLOTS = 3
/** The strip's width (shell.css .clipstrip). */
export const CLIP_STRIP_WIDTH = 36
const SEP = '\u0001'

/**
 * The vertical clipboard strip at the desktop's left edge: one clipboard icon per clipboard of the
 * active case with its symptom count under it; the active clipboard's count is bold, and the icons of
 * the clipboards the analysis includes carry two ticks. A click makes it
 * the active clipboard (an empty slot creates that clipboard, starting an unsaved case if none is open);
 * a rubric dropped on a slot is taken into that clipboard.
 */
export const ClipStrip = memo(function ClipStrip() {
  // id, name and symptom count per clipboard: the strip re-renders only when one of those changes
  // id, name, symptom count and whether the analysis includes it, per clipboard
  const keys = useApp(useShallow(s => { const c = selectActiveConsultation(s); return c?.clipboards.map(cb => [cb.id, cb.name, cb.symptoms.length, c.analysis.clipboardIds.includes(cb.id) ? 1 : 0].join(SEP)) ?? [] }))
  const activeId = useApp(s => { const c = selectActiveConsultation(s); return c ? (c.clipboards.find(cb => cb.id === s.activeClipboardId) ?? c.clipboards[0])?.id ?? null : null })
  const listRef = useRef<HTMLDivElement>(null)
  const clips = keys.map(k => { const [id, name, n, inA] = k.split(SEP); return { id, name, count: Number(n), inAnalysis: inA === '1' } })
  const slots = Math.max(MIN_SLOTS, clips.length)

  const choose = (i: number) => {
    const cb = clips[i]
    if (cb) { actions.setActiveClipboard(cb.id); return }
    // quietly: RadarOpus just moves the bold count, with no word about the case behind the clipboards;
    // activating a clipboard does not add it to the analysis (its icon gets no ticks)
    const made = ensureClipboard(i + 1, { quiet: true, inAnalysis: false })
    if (made) actions.setActiveClipboard(made.id)
  }

  return (
    // a landmark of its own, beside the navigator and the document window
    <aside className="clipstrip" aria-label="Clipboard strip" onMouseDown={e => chromeBackgroundMouseDown(e)}>
      <div className="clipstrip-slots" role="toolbar" aria-label="Clipboards" aria-orientation="vertical" ref={listRef}
        onKeyDown={e => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
          const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.clip-slot') ?? [])]
          const at = btns.indexOf(document.activeElement as HTMLButtonElement)
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : Math.max(0, Math.min(btns.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))
          e.preventDefault()
          btns[next]?.focus()
        }}
      >
        {Array.from({ length: slots }, (_, i) => {
          const cb = clips[i]
          // RadarOpus always marks a clipboard: with no case (or no clipboard yet) slot 1, where a take goes
          const active = cb ? cb.id === activeId : !activeId && i === 0
          // RadarOpus marks two things independently: the ticks show a clipboard the analysis includes
          // (with no case yet, slot 1: a new case analyses its first clipboard), the bold count the active one
          const checked = cb ? cb.inAnalysis : !activeId && i === 0
          const name = cb?.name ?? `Clipboard ${i + 1}`
          const count = cb?.count ?? 0
          const key = i < 9 ? ` (${formatKeys(`Alt+${i + 1}`)})` : ''
          return (
            <button
              key={cb?.id ?? `slot-${i}`}
              className={`clip-slot${active ? ' active' : ''}`}
              // roving tab stop: the active clipboard (or the first slot)
              tabIndex={active ? 0 : -1}
              aria-pressed={active}
              aria-label={`${i + 1}. ${name}, ${count} symptom${count === 1 ? '' : 's'}${checked ? ', in the analysis' : ''}`}
              title={cb ? `${i + 1}. ${name}: ${count} symptom${count === 1 ? '' : 's'}${checked ? ' (in the analysis)' : ''}${key}` : `Clipboard ${i + 1}${key}`}
              // like the toolbar: a click selects the clipboard and leaves the keyboard in the document
              onMouseDown={keepFocus}
              onClick={() => { choose(i); returnFocusFromChrome('.clipstrip') }}
              onDragOver={e => { if (e.dataTransfer.types.includes(RUBRIC_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('drop') } }}
              onDragLeave={e => e.currentTarget.classList.remove('drop')}
              onDrop={e => {
                e.currentTarget.classList.remove('drop')
                const refs = parseRubricDrop(e.dataTransfer.getData(RUBRIC_MIME))
                if (!refs.length) return
                e.preventDefault()
                // the standard take: recents, the take toast with Undo, into this slot's clipboard
                takeRefs(refs, { ...DEFAULT_TAKE, clipboard: i + 1 })
              }}
            >
              <ClipIcon checked={checked} />
              {/* RadarOpus prints the symptom count under a clipboard that has symptoms; an empty one (or a slot with no case) stays blank */}
              <span className="clip-slot-count" aria-hidden="true">{cb && count ? count : ''}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
})
