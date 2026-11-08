/**
 * The consultation text of the patient tab is rich text (RadarOpus's consultation editor: font, size,
 * bold / italic / underline, colour, alignment, tables). It is stored as sanitised HTML in
 * `Consultation.notesHtml`, with its plain text in `notes` for search, reports and export.
 */

const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'SPAN', 'FONT', 'DIV', 'P', 'BR', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'PRE', 'HR'])
/** Removed together with their content. */
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'LINK', 'META', 'TEMPLATE', 'VIDEO', 'AUDIO',
  'CANVAS', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'TITLE', 'HEAD', 'BASE', 'FRAME', 'FRAMESET'])
const STYLES = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'text-align']
const BLOCK = new Set(['DIV', 'P', 'LI', 'TR', 'TABLE', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'PRE', 'HR'])

function safeValue(v: string) { return !/url\s*\(|expression|javascript:|[<>{}]/i.test(v) }

/** Keep only formatting markup: no scripts, handlers, links, images or foreign styles. */
export function sanitizeHtml(html: string): string {
  const t = document.createElement('template')
  t.innerHTML = html
  const clean = (parent: Node) => {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) continue
      if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); continue }
      const el = node as HTMLElement
      if (DROP.has(el.tagName)) { el.remove(); continue }
      clean(el)
      if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue }
      const style = el.getAttribute('style')
      const keep: [string, string][] = []
      for (const a of ['face', 'color', 'size', 'align', 'colspan', 'rowspan'] as const) {
        const v = el.getAttribute(a)
        if (v !== null && safeValue(v) && v.length < 80) keep.push([a, v])
      }
      for (const a of [...el.attributes]) el.removeAttribute(a.name)
      for (const [a, v] of keep) el.setAttribute(a, v)
      if (style) {
        const probe = document.createElement('span')
        probe.setAttribute('style', style)
        const parts = STYLES.map(p => [p, probe.style.getPropertyValue(p)] as const).filter(([, v]) => v && safeValue(v))
        if (parts.length) el.setAttribute('style', parts.map(([p, v]) => `${p}: ${v}`).join('; '))
      }
    }
  }
  clean(t.content)
  return t.innerHTML
}

/** Plain text of the editor's HTML: blocks and <br> become line breaks, table cells are tab separated. */
export function htmlToText(html: string): string {
  const t = document.createElement('template')
  t.innerHTML = html
  let out = ''
  let started = false
  // a block that has just opened needs no line break of its own (nested blocks, a table's first row)
  let opened = false
  const walk = (parent: Node) => {
    parent.childNodes.forEach((node, i) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const d = (node as Text).data.replace(/\u00a0/g, ' ')
        if (d) { out += d; started = true; opened = false }
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node as HTMLElement
      if (el.tagName === 'BR') {
        // a trailing <br> only keeps an empty block open
        const last = i === parent.childNodes.length - 1 && parent !== t.content
        if (!last) { out += '\n'; started = true; opened = false }
        return
      }
      if ((el.tagName === 'TD' || el.tagName === 'TH') && el.previousElementSibling) out += '\t'
      const block = BLOCK.has(el.tagName)
      if (block) {
        if (started && !opened) out += '\n'
        started = true; opened = true
      }
      walk(el)
      if (block) opened = false
    })
  }
  walk(t.content)
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One <div> per line, as the browser's editor writes them. */
export function textToHtml(text: string): string {
  return text.split('\n').map(l => `<div>${l ? esc(l) : '<br>'}</div>`).join('')
}

/** The HTML to show for a consultation: its rich text while it still matches the plain notes, else the notes. */
export function consultationHtml(c: { notes: string; notesHtml?: string }): string {
  if (c.notesHtml) {
    const html = sanitizeHtml(c.notesHtml)
    if (htmlToText(html) === c.notes) return html
  }
  return textToHtml(c.notes)
}
