import { useEffect, useState } from 'react'
import { BookOpen, Library, LoaderCircle } from 'lucide-react'
import { useCatalog, useRepertory } from '../../data/CatalogContext'
import type { RepertoryInfo } from '../../data/types'
import { actions } from '../../state/store'
import { useContextMenu } from '../../ui/Menu'
import type { MenuItem } from '../../ui/Menu'
import type { RepertoriesTab } from '../../state/workspace'
import { goToRef } from './ops'
import './repertory.css'

const LANG: Record<string, string> = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', nl: 'Dutch', pt: 'Portuguese' }

/** Ctrl+1: table of contents of the installed repertories. */
export function RepertoriesView({ tab }: { tab: RepertoriesTab }) {
  const catalog = useCatalog()
  const infos = catalog.repertoryInfos
  const selected = infos.find(r => r.abbrev === tab.selected) ?? infos[0]
  const select = (abbrev: string) => actions.updateTab<RepertoriesTab>(tab.id, { selected: abbrev })
  const idx = infos.indexOf(selected)
  const cm = useContextMenu()
  const menuFor = (r: RepertoryInfo): MenuItem[] => [
    { type: 'label', label: r.title },
    { label: 'Open', keys: 'Enter', run: () => void goToRef(`${r.abbrev}:0`) },
    { label: 'Open in new tab', run: () => void goToRef(`${r.abbrev}:0`, { newTab: true }) },
    { label: 'Find rubric…', run: () => actions.openDialog('repertory.find', { repertory: r.abbrev, from: -1 }) },
    { type: 'separator' },
    { label: 'Show details', run: () => select(r.abbrev) },
  ]

  return (
    <div className="rtoc-wrap">
    <div className="rtoc">
      <div className="rtoc-list" role="listbox" aria-label="Repertories" tabIndex={0}
        aria-activedescendant={selected ? `rtoc-${selected.abbrev}` : undefined}
        ref={el => { if (el && document.activeElement === document.body) el.focus() }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); const n = infos[Math.min(infos.length - 1, idx + 1)]; if (n) select(n.abbrev) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); const n = infos[Math.max(0, idx - 1)]; if (n) select(n.abbrev) }
          else if (e.key === 'Enter' && selected) { e.preventDefault(); void goToRef(`${selected.abbrev}:0`) }
          else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && selected) {
            e.preventDefault()
            const el = e.currentTarget.querySelector<HTMLElement>(`#rtoc-${CSS.escape(selected.abbrev)}`) ?? e.currentTarget
            cm.openAt(el, menuFor(selected))
          }
        }}>
        <div className="pane-head"><Library size={13} /> Repertories <span className="badge">{infos.length}</span></div>
        {infos.map(r => (
          <div key={r.abbrev} id={`rtoc-${r.abbrev}`} role="option" aria-selected={r === selected}
            className={`rtoc-item${r === selected ? ' active' : ''}`}
            onClick={() => select(r.abbrev)} onDoubleClick={() => void goToRef(`${r.abbrev}:0`)}
            onContextMenu={e => { select(r.abbrev); cm.open(e, menuFor(r)) }}>
            <BookOpen size={16} className="rtoc-icon" />
            <div>
              <div className="rtoc-title">{r.title}</div>
              <div className="rtoc-sub">{r.author}{r.year ? `, ${r.year}` : ''} · {LANG[r.lang] ?? r.lang.toUpperCase()}</div>
              <div className="rtoc-sub">{r.rubricCount.toLocaleString()} rubrics · {r.entryCount.toLocaleString()} remedy entries</div>
            </div>
          </div>
        ))}
      </div>
      {selected ? <RepertoryDetail info={selected} /> : <div className="empty-state"><strong>No repertories installed</strong></div>}
    </div>
    {cm.element}
    </div>
  )
}

function RepertoryDetail({ info }: { info: RepertoryInfo }) {
  const [load, setLoad] = useState(false)
  useEffect(() => { setLoad(false); const t = setTimeout(() => setLoad(true), 150); return () => clearTimeout(t) }, [info.abbrev])
  return (
    <div className="rtoc-detail">
      <header className="rtoc-head">
        <div>
          <h1>{info.title}</h1>
          {info.fullTitle !== info.title && <p className="rtoc-full">{info.fullTitle}</p>}
        </div>
        <button className="btn btn-primary" onClick={() => void goToRef(`${info.abbrev}:0`)}><BookOpen size={14} /> Open</button>
      </header>
      <dl className="rtoc-facts">
        <dt>Author</dt><dd>{info.author || '—'}</dd>
        <dt>Year</dt><dd>{info.year ?? '—'}</dd>
        <dt>Language</dt><dd>{LANG[info.lang] ?? info.lang}</dd>
        <dt>Publisher</dt><dd>{info.publisher || '—'}</dd>
        <dt>Licence</dt><dd>{info.license || '—'}</dd>
        <dt>Rubrics</dt><dd>{info.rubricCount.toLocaleString()}</dd>
        <dt>Remedy entries</dt><dd>{info.entryCount.toLocaleString()}</dd>
      </dl>
      <h2 className="rtoc-h2">Chapters</h2>
      {load ? <Chapters abbrev={info.abbrev} /> : <div className="rtoc-loading"><LoaderCircle size={14} className="spin" /> Loading chapters…</div>}
    </div>
  )
}

function Chapters({ abbrev }: { abbrev: string }) {
  const { rep, error } = useRepertory(abbrev)
  const cm = useContextMenu()
  if (error) return <div className="error-state"><pre>{error.message}</pre></div>
  if (!rep) return <div className="rtoc-loading"><LoaderCircle size={14} className="spin" /> Loading chapters…</div>
  const chapterMenu = (c: number): MenuItem[] => [
    { type: 'label', label: rep.text(c) },
    { label: 'Open chapter', run: () => void goToRef(`${abbrev}:${c}`) },
    { label: 'Open in new tab', run: () => void goToRef(`${abbrev}:${c}`, { newTab: true }) },
    { label: 'Find in chapter…', run: () => actions.openDialog('repertory.find', { repertory: abbrev, from: c }) },
  ]
  return (
    <div className="rtoc-chapters">
      {rep.chapters.map(c => (
        <button key={c} className="rtoc-chapter" onClick={() => void goToRef(`${abbrev}:${c}`)} title={`Open ${rep.text(c)}`}
          onContextMenu={e => cm.open(e, chapterMenu(c))}
          onKeyDown={e => { if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); cm.openAt(e.currentTarget, chapterMenu(c)) } }}>
          <span>{rep.text(c)}</span>
          <span className="rtoc-n">{(rep.subtreeEndOf(c) - c - 1).toLocaleString()} rubrics</span>
        </button>
      ))}
      {cm.element}
    </div>
  )
}
