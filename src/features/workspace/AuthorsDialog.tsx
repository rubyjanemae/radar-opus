import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { useCatalog } from '../../data/CatalogContext'
import { useFamilies } from '../families/api'
import './workspace.css'

interface Row { author: string; title: string; kind: string; year: string; detail: string }

/**
 * View › List of authors and documents (RadarOpus): every installed document with its author, sorted
 * by author; a column header click sorts by that column.
 */
export function AuthorsDialog({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog()
  const { index } = useFamilies()
  const [mm, setMm] = useState<{ info: NonNullable<typeof catalog.mmInfo>; size: number } | null>(null)
  useEffect(() => {
    let live = true
    catalog.loadMateriaMedica().then(m => { if (live && catalog.mmInfo) setMm({ info: catalog.mmInfo, size: m.size }) }).catch(() => { /* listed without it */ })
    return () => { live = false }
  }, [catalog])
  const [sort, setSort] = useState<keyof Row>('author')
  const rows = useMemo(() => {
    const out: Row[] = catalog.repertoryInfos.map(r => ({
      author: r.author, title: r.fullTitle && r.fullTitle !== r.title ? `${r.title} (${r.fullTitle})` : r.title, kind: 'Repertory',
      year: r.year ? String(r.year) : '', detail: `${r.lang.toUpperCase()} · ${r.rubricCount.toLocaleString()} rubrics`,
    }))
    if (mm) out.push({ author: mm.info.author, title: mm.info.title.replace(/^./, c => c.toUpperCase()), kind: 'Materia medica', year: String(mm.info.year), detail: `${mm.info.lang.toUpperCase()} · ${mm.size.toLocaleString()} remedies` })
    if (index) out.push({ author: 'Radar Opus (editorial)', title: index.source.title, kind: 'Families', year: '', detail: `${index.nodes.length.toLocaleString()} groups` })
    const surname = (a: string) => a.split(/\s+/).pop() ?? a
    return out.sort((a, b) => (sort === 'author' ? surname(a.author).localeCompare(surname(b.author)) : a[sort].localeCompare(b[sort])) || a.title.localeCompare(b.title))
  }, [catalog, mm, index, sort])
  const head = (k: keyof Row, label: string) => (
    <th scope="col" aria-sort={sort === k ? 'ascending' : 'none'}><button className="ws-authors-sort" onClick={() => setSort(k)}>{label}{sort === k ? ' ▴' : ''}</button></th>
  )
  return (
    <Dialog title="List of authors and documents" onClose={onClose} width={760} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <div className="ws-authors">
        <table>
          <thead><tr>{head('author', 'Author')}{head('title', 'Document')}{head('kind', 'Type')}{head('year', 'Year')}<th scope="col">Contents</th></tr></thead>
          <tbody>{rows.map(r => <tr key={`${r.kind}:${r.title}`}><td>{r.author}</td><td>{r.title}</td><td>{r.kind}</td><td>{r.year}</td><td>{r.detail}</td></tr>)}</tbody>
        </table>
      </div>
    </Dialog>
  )
}
