import type { MouseEvent, RefObject } from 'react'
import { BookText } from 'lucide-react'
import type { MateriaMedicaEntry, Remedy } from '../../data/types'
import type { MMBook } from './book'
import { Paragraph } from './components'
import type { RemedyLinkHandlers } from './components'

/**
 * The reading pane: the monograph (or a welcome page) and the "On this page" outline.
 * Presentational: scrolling, marks and links are driven by the reader.
 */
export function MMReaderPane({ readerRef, book, entry, remedy, showAbbrevs, fontPx, termsFor, links, sectionCount, activeSection, onScroll, onContextMenu, onSection, onInfo }: {
  readerRef: RefObject<HTMLElement | null>
  book: MMBook
  entry: MateriaMedicaEntry | null
  remedy: Remedy | null
  showAbbrevs: boolean
  fontPx: number
  termsFor: (section: number) => string[]
  links: RemedyLinkHandlers
  sectionCount: number
  activeSection: number
  onScroll: () => void
  onContextMenu: (e: MouseEvent) => void
  onSection: (i: number) => void
  onInfo: (remedyId: number) => void
}) {
  return (
    <>
      <section
        ref={readerRef}
        className={`mm-reader${showAbbrevs ? ' mm-show-abbr' : ''}`}
        tabIndex={-1}
        onScroll={onScroll}
        onContextMenu={onContextMenu}
        style={{ ['--mm-fs' as string]: `${fontPx}px` }}
        aria-label="Monograph"
      >
        {!entry || !remedy ? (
          <div className="mm-welcome">
            <BookText size={30} strokeWidth={1.4} />
            <h1>Pocket Manual of Homoeopathic Materia Medica</h1>
            <p className="mm-welcome-by">William Boericke · {book.info.year}</p>
            <p>{book.items.length} monographs · {sectionCount.toLocaleString()} sections. Pick a remedy from the list, or search the whole book.</p>
            <ul className="mm-keys">
              <li><span className="kbd">J</span> <span className="kbd">K</span> next / previous remedy</li>
              <li><span className="kbd">/</span> search all monographs, <span className="kbd">↵</span> next match</li>
              <li><span className="kbd">S</span> jump to section, <span className="kbd">I</span> remedy information</li>
              <li><span className="kbd">Space</span> show remedy abbreviations in the text, <span className="kbd">L</span> hide the list</li>
              <li>Type letters in the list to jump; right-click selected text to search the repertory</li>
              <li><span className="kbd">Ctrl</span>+<span className="kbd">4</span> open any remedy</li>
            </ul>
            <p className="mm-source">{book.sourceLine}</p>
          </div>
        ) : (
          <article className="mm-page" lang="en">
            <header className="mm-head">
              <div className="mm-head-meta">
                <button className="mm-abbr" title="Remedy information (I)" onClick={() => onInfo(remedy.id)}>{remedy.abbrev}</button>
                <span>{remedy.name}</span>
              </div>
              <h1>{entry.heading}</h1>
              {entry.commonName && <div className="mm-common">{entry.commonName}</div>}
            </header>
            <section data-sec={-1} className="mm-intro">
              <Paragraph text={entry.intro} book={book} selfId={remedy.id} terms={termsFor(-1)} links={links} />
            </section>
            {entry.sections.map((s, i) => (
              <section key={i} data-sec={i} className="mm-sec">
                <h2>{s.heading}</h2>
                <Paragraph text={s.text} book={book} selfId={remedy.id} relationship={/relation/i.test(s.heading)} terms={termsFor(i)} links={links} />
              </section>
            ))}
            <footer className="mm-source">{book.sourceLine}. Text via OOREP (GPL-3.0).</footer>
          </article>
        )}
      </section>

      {entry && (
        <nav className="mm-outline" aria-label="Sections">
          <div className="mm-outline-title">On this page</div>
          <button className={activeSection === -1 ? 'on' : ''} onClick={() => onSection(-1)}>Introduction</button>
          {entry.sections.map((s, i) => <button key={i} className={activeSection === i ? 'on' : ''} onClick={() => onSection(i)}>{s.heading}</button>)}
        </nav>
      )}
    </>
  )
}
