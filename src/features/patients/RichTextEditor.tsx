import { Children, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { actions } from '../../state/store'
import type { Consultation } from '../../state/patients'
import { consultationHtml, htmlToText, sanitizeHtml } from './richtext'
import { AlignGlyph, ColorGlyph, CopyGlyph, CutGlyph, PasteGlyph, RedoGlyph, TableGlyph, UndoGlyph } from './glyphs'

/**
 * RadarOpus's consultation editor: a format bar (clipboard, undo / redo, font, size, bold / italic /
 * underline, text colour, alignment, tables) over a white page of rich text. The text saves itself
 * (sanitised HTML plus its plain text in `notes`) a moment after typing stops, on blur and on Save.
 */

export interface RichTextHandle { flush: () => void; focus: () => void }

export const FONTS = ['Verdana', 'Arial', 'Courier New', 'Georgia', 'Helvetica', 'Tahoma', 'Times New Roman', 'Trebuchet MS']
export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72]
const DEFAULT_FONT = 'Verdana', DEFAULT_SIZE = 11

interface FormatState {
  bold: boolean; italic: boolean; underline: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  font: string; size: number; selection: boolean; table: boolean
}
function B({ title, on, disabled, run, children, cls = '' }: { title: string; on?: boolean; disabled?: boolean; run: () => void; children: ReactNode; cls?: string }) {
  return (
    <button className={`pv-fbtn ${cls}${on ? ' on' : ''}`} title={title} aria-label={title} aria-pressed={on} disabled={disabled}
      onMouseDown={e => e.preventDefault()} onClick={run}>{children}</button>
  )
}

const EMPTY: FormatState = { bold: false, italic: false, underline: false, align: 'left', font: DEFAULT_FONT, size: DEFAULT_SIZE, selection: false, table: false }

export function RichTextEditor({ consultation: c, editable, children, ref, onDirty }: {
  consultation: Consultation; editable: boolean; children?: ReactNode; ref?: Ref<RichTextHandle>
  /** Told when the text gets unsaved changes and when they are saved (the Save button lights up meanwhile). */
  onDirty?: (dirty: boolean) => void
}) {
  const onDirtyRef = useRef(onDirty)
  useLayoutEffect(() => { onDirtyRef.current = onDirty })
  const el = useRef<HTMLDivElement>(null)
  const range = useRef<Range | null>(null)
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)
  const saved = useRef('')
  const [fmt, setFmt] = useState<FormatState>(EMPTY)
  const [color, setColor] = useState('#e00000')
  const colorInput = useRef<HTMLInputElement>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
    const node = el.current
    if (!node || !dirty.current) return
    dirty.current = false
    onDirtyRef.current?.(false)
    const html = sanitizeHtml(node.innerHTML)
    const notes = htmlToText(html)
    saved.current = html
    actions.updateConsultation(c.id, { notesHtml: html, notes })
  }, [c.id])
  useImperativeHandle(ref, () => ({ flush, focus: () => el.current?.focus() }), [flush])

  // the stored text: shown on mount, and again after a change made elsewhere (undo, import)
  const html = consultationHtml(c)
  useLayoutEffect(() => {
    const node = el.current
    if (!node || dirty.current || html === saved.current) return
    node.innerHTML = html
    saved.current = html
  }, [html])
  useEffect(() => () => flush(), [flush])

  const inside = (n: Node | null) => !!n && !!el.current && el.current.contains(n)
  const refresh = useCallback(() => {
    const sel = document.getSelection()
    if (!sel || !sel.rangeCount || !inside(sel.anchorNode)) return
    range.current = sel.getRangeAt(0).cloneRange()
    const anchor = sel.anchorNode?.nodeType === Node.ELEMENT_NODE ? sel.anchorNode as Element : sel.anchorNode?.parentElement ?? null
    const cs = anchor ? getComputedStyle(anchor) : null
    const family = cs?.fontFamily.split(',')[0].replace(/["']/g, '').trim() ?? DEFAULT_FONT
    const q = (cmd: string) => { try { return document.queryCommandState(cmd) } catch { return false } }
    setFmt({
      bold: q('bold'), italic: q('italic'), underline: q('underline'),
      align: q('justifyCenter') ? 'center' : q('justifyRight') ? 'right' : q('justifyFull') ? 'justify' : 'left',
      font: FONTS.find(f => f.toLowerCase() === family.toLowerCase()) ?? family,
      size: cs ? Math.round(parseFloat(cs.fontSize)) : DEFAULT_SIZE,
      selection: !sel.isCollapsed,
      table: !!anchor?.closest('td, th'),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [refresh])

  const changed = () => {
    if (!dirty.current) onDirtyRef.current?.(true)
    dirty.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 600)
  }
  /** Put the caret back where it was (a combo or the colour picker took the focus). */
  const restore = () => {
    const node = el.current
    if (!node) return
    node.focus({ preventScroll: true })
    const sel = document.getSelection()
    if (range.current && sel && inside(range.current.startContainer)) { sel.removeAllRanges(); sel.addRange(range.current) }
  }
  const exec = (cmd: string, value?: string) => {
    if (!editable) return
    restore()
    document.execCommand(cmd, false, value)
    changed(); refresh()
  }
  /** Font size in px: execCommand only knows sizes 1..7, so mark with 7 and rewrite the marks. */
  const setSize = (px: number) => {
    if (!editable) return
    restore()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand('fontSize', false, '7')
    el.current?.querySelectorAll('font[size="7"]').forEach(f => { f.removeAttribute('size'); (f as HTMLElement).style.fontSize = `${px}px` })
    changed(); refresh()
  }
  const cell = () => {
    const n = range.current?.startContainer ?? null
    const e = n?.nodeType === Node.ELEMENT_NODE ? n as Element : n?.parentElement ?? null
    return inside(e) ? e!.closest('td, th') : null
  }
  const insertTable = () => exec('insertHTML', '<table><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><div><br></div>')
  const insertRow = () => {
    const td = cell(); const tr = td?.closest('tr')
    if (!editable || !tr) return
    const row = document.createElement('tr')
    for (let i = 0; i < tr.children.length; i++) { const d = document.createElement('td'); d.appendChild(document.createElement('br')); row.appendChild(d) }
    tr.after(row)
    changed(); refresh()
  }
  const deleteTable = () => {
    const table = cell()?.closest('table')
    if (!editable || !table) return
    table.remove()
    changed(); refresh()
  }
  const paste = async () => {
    if (!editable) return
    try {
      const text = await navigator.clipboard.readText()
      exec('insertText', text)
    } catch { actions.toast('The browser did not allow reading the clipboard: paste with ⌘V / Ctrl+V.', 'info') }
  }
  const copyOrCut = (cmd: 'copy' | 'cut') => {
    restore()
    if (!document.execCommand(cmd)) actions.toast(`Use ${cmd === 'copy' ? '⌘C / Ctrl+C' : '⌘X / Ctrl+X'} to ${cmd} the selection.`, 'info')
    else if (cmd === 'cut') changed()
    refresh()
  }

  const off = !editable
  return (
    <div className="pv-editor">
      <div className="pv-fmt" role="toolbar" aria-label="Text format">
        <B title="Copy" disabled={!fmt.selection} run={() => copyOrCut('copy')}><CopyGlyph /></B>
        <B title="Cut" disabled={off || !fmt.selection} run={() => copyOrCut('cut')}><CutGlyph /></B>
        <B title="Paste" disabled={off} run={() => void paste()}><PasteGlyph /></B>
        <span className="pv-fsep" aria-hidden="true" />
        <B title="Undo typing" disabled={off} run={() => exec('undo')}><UndoGlyph /></B>
        <B title="Redo typing" disabled={off} run={() => exec('redo')}><RedoGlyph /></B>
        <span className="pv-fsep" aria-hidden="true" />
        <span className="pv-combo pv-font">
          <select aria-label="Font" value={FONTS.includes(fmt.font) ? fmt.font : ''} disabled={off} onChange={e => exec('fontName', e.target.value)}>
            {!FONTS.includes(fmt.font) && <option value="">{fmt.font}</option>}
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </span>
        <span className="pv-combo pv-size">
          <select aria-label="Font size" value={String(fmt.size)} disabled={off} onChange={e => setSize(Number(e.target.value))}>
            {!SIZES.includes(fmt.size) && <option value={String(fmt.size)}>{fmt.size}</option>}
            {SIZES.map(s => <option key={s} value={String(s)}>{s}</option>)}
          </select>
        </span>
        <B title="Bold (⌘B)" on={fmt.bold} disabled={off} run={() => exec('bold')} cls="pv-letter pv-b"><span>b</span></B>
        <B title="Italic (⌘I)" on={fmt.italic} disabled={off} run={() => exec('italic')} cls="pv-letter pv-i"><span>i</span></B>
        <B title="Underline (⌘U)" on={fmt.underline} disabled={off} run={() => exec('underline')} cls="pv-letter pv-u"><span>u</span></B>
        <B title="Text colour" disabled={off} run={() => colorInput.current?.click()}><ColorGlyph color={color} /></B>
        <input ref={colorInput} type="color" className="pv-color-input" tabIndex={-1} aria-hidden="true" value={color}
          onChange={e => { setColor(e.target.value); exec('foreColor', e.target.value) }} />
        <span className="pv-fsep" aria-hidden="true" />
        <B title="Align left" on={fmt.align === 'left'} disabled={off} run={() => exec('justifyLeft')}><AlignGlyph how="left" /></B>
        <B title="Centre" on={fmt.align === 'center'} disabled={off} run={() => exec('justifyCenter')}><AlignGlyph how="center" /></B>
        <B title="Align right" on={fmt.align === 'right'} disabled={off} run={() => exec('justifyRight')}><AlignGlyph how="right" /></B>
        <B title="Justify" on={fmt.align === 'justify'} disabled={off} run={() => exec('justifyFull')}><AlignGlyph how="justify" /></B>
        <span className="pv-fsep" aria-hidden="true" />
        <B title="Insert a table" disabled={off} run={insertTable}><TableGlyph op="insert" /></B>
        <B title="Insert a row below" disabled={off || !fmt.table} run={insertRow}><TableGlyph op="row" /></B>
        <B title="Delete the table" disabled={off || !fmt.table} run={deleteTable}><TableGlyph op="delete" /></B>
      </div>
      <div className="pv-scroll">
        <div className={`pv-page${Children.toArray(children).length ? '' : ' fill'}`}>
          <div
            ref={el} className="pv-text" role="textbox" aria-multiline="true" aria-label="Consultation text" spellCheck={false}
            contentEditable={editable} suppressContentEditableWarning aria-readonly={!editable}
            onInput={changed} onBlur={flush} onKeyUp={refresh} onMouseUp={refresh}
            onPaste={e => {
              // paste formatting-free text: foreign HTML would bring styles and markup along
              if (!editable) return
              e.preventDefault()
              document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
            }}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush() }
            }}
          />
        </div>
        {children}
      </div>
    </div>
  )
}
