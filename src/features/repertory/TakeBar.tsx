import { useEffect, useRef, useState } from 'react'
import { ClipboardPlus } from 'lucide-react'
import { describeTake, parseTake } from './take'
import type { TakeOptions } from './take'

/** What a key does in the take bar. */
export type TakeBarKey =
  | 'cancel' // close without taking
  | 'take' // take with the typed options
  | 'edit' // edit the command (the input's native behaviour)
  | 'pass' // take (when the command is valid), close, then run the key as if typed in the book

export interface KeyLike { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }

const PASS_ALWAYS = new Set(['Insert', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'ContextMenu'])
const CARET = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])
/** Chords that edit the text of the command itself (select all, clipboard, undo, word-wise moves). */
const EDIT_CHORD = /^(a|c|v|x|z|y|Backspace|Delete|ArrowLeft|ArrowRight|Home|End)$/i

/**
 * Key routing of the take bar. The bar only holds the `+` mini-language: a key that is not part of it
 * (an F-key, a navigation key, Insert, a shortcut chord) ends the command, taking the rubric when the
 * command is valid, and is then run as usual, so `+` then ↓ takes the rubric and moves on, and `+2`
 * then F8 takes it and opens the analysis.
 */
export function takeBarKey(e: KeyLike, value: string): TakeBarKey {
  const k = e.key
  const mod = !!(e.ctrlKey || e.metaKey)
  if (k === 'Escape') return 'cancel'
  if (k === 'Enter') return 'take'
  if (k === 'Backspace' && !mod && value.length <= 1) return 'cancel'
  if (/^F\d{1,2}$/.test(k)) return 'pass'
  if (PASS_ALWAYS.has(k)) return 'pass'
  // on a bare "+" the caret has nowhere to go: the key is a book key
  if (CARET.has(k)) return !mod && !e.shiftKey && value.trim().length <= 1 ? 'pass' : 'edit'
  if (mod || e.altKey) return mod && !e.altKey && EDIT_CHORD.test(k) ? 'edit' : ['Control', 'Meta', 'Alt', 'Shift', 'AltGraph'].includes(k) ? 'edit' : 'pass'
  return 'edit'
}

/** Copy of a key event to replay on another element. */
export function replayKey(e: KeyboardEvent, target: EventTarget) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey,
    repeat: e.repeat, location: e.location, bubbles: true, cancelable: true, composed: true,
  }))
}

export function TakeBar({ initial, path, onClose, onTake, onPass }: {
  initial: string
  path: string[]
  /** Close the bar; focus goes back to the rubric list. */
  onClose: () => void
  onTake: (o: TakeOptions) => void
  /** Run a key that ended the command, once focus is back on the rubric list. */
  onPass: (e: KeyboardEvent) => void
}) {
  const [value, setValue] = useState(initial)
  const parsed = parseTake(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
  }, [])
  const leaf = path[path.length - 1] ?? ''
  const parents = path.slice(0, -1)
  const status = parsed.ok ? describeTake(parsed.options) : parsed.error
  return (
    <div className="rv-takebar" role="dialog" aria-label="Take rubric">
      <div className="rv-takebar-in">
      <ClipboardPlus size={14} className="rv-takebar-icon" />
      <input
        ref={inputRef}
        className="input rv-takebar-input"
        aria-label="Take command"
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={e => setValue(e.target.value)}
        onBlur={onClose}
        onKeyDown={e => {
          const action = takeBarKey(e, value)
          if (action === 'edit') { e.stopPropagation(); return }
          e.preventDefault()
          e.stopPropagation()
          if (action === 'cancel') onClose()
          else if (action === 'take') { if (parsed.ok) { onClose(); onTake(parsed.options) } }
          else {
            // commit (or drop an invalid command), then the key does what it does in the book
            onClose()
            if (parsed.ok) onTake(parsed.options)
            onPass(e.nativeEvent)
          }
        }}
      />
      <span className="rv-takebar-rubric" title={path.join(' › ')}>
        {parents.length > 0 && <span className="rv-takebar-parents">{parents.join(' › ')} ›&nbsp;</span>}
        <b className="rv-takebar-leaf">{leaf}</b>
      </span>
      <span className={`rv-takebar-status${parsed.ok ? '' : ' err'}`} title={status}>{status}</span>
      <span className="rv-takebar-help"><b>+2</b> intensity · <b>&gt;3</b> clipboard · <b>!</b> elim. · <b>x</b> excl. · <b>a</b> group · <b>/s</b> sub-rubrics · <kbd className="kbd">↵</kbd> take · <kbd className="kbd">Esc</kbd></span>
      </div>
    </div>
  )
}
