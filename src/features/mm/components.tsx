import { memo, useMemo } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { MMBook } from './book'
import { highlight, parseParagraph } from './text'
import type { HighlightPart } from './text'

export interface RemedyLinkHandlers {
  onRemedy: (remedyId: number, e: MouseEvent) => void
  onRemedyMenu: (remedyId: number, e: MouseEvent) => void
}

function Parts({ parts }: { parts: HighlightPart[] }) {
  return <>{parts.map((p, i) => p.hit ? <mark key={i} className="mm-hit">{p.text}</mark> : p.text)}</>
}

/** One materia medica paragraph: emphasis, search highlights and remedy links. */
export const Paragraph = memo(function Paragraph({ text, book, selfId, relationship, terms, links, className }: {
  text: string
  book: MMBook
  selfId: number
  relationship?: boolean
  terms: string[]
  links: RemedyLinkHandlers
  className?: string
}) {
  const spans = useMemo(() => parseParagraph(text, book.resolver, { relationship, selfId }), [text, book, relationship, selfId])
  const out: ReactNode[] = spans.map((s, i) => {
    const inner = <Parts parts={highlight(s.text, terms)} />
    if (s.remedyId !== undefined) {
      const r = book.catalog.remedy(s.remedyId)
      const inBook = book.has(s.remedyId)
      return (
        <button
          key={i}
          type="button"
          className={`mm-rem${inBook ? '' : ' mm-rem-out'}`}
          data-rid={s.remedyId}
          data-abbr={r.abbrev}
          title={`${r.name} (${r.abbrev}) · ${inBook ? 'click: read in Boericke' : 'click: remedy information'} · Shift+click: remedy information`}
          onClick={e => links.onRemedy(s.remedyId!, e)}
          onContextMenu={e => links.onRemedyMenu(s.remedyId!, e)}
        >
          <em>{inner}</em>
        </button>
      )
    }
    return s.em ? <em key={i}>{inner}</em> : <span key={i}>{inner}</span>
  })
  return <p className={className}>{out}</p>
})

/** Snippet parts with highlighted hits. */
export function Snippet({ parts }: { parts: HighlightPart[] }) {
  return <Parts parts={parts} />
}
