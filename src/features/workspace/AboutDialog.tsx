import { useEffect, useState } from 'react'
import { BookOpen, BookText, Scale } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { useCatalog } from '../../data/CatalogContext'
import { formatKeys, runCommand } from '../../commands/registry'
import { APP_NAME, APP_VERSION } from './data'
import './workspace.css'

interface Source { title: string; detail: string; licence: string; icon: typeof BookOpen }

/** Data provenance: the repertories come from the OOREP project; the materia medica is public domain. */
function useSources(): Source[] {
  const catalog = useCatalog()
  const [mm, setMm] = useState(catalog.mmInfo)
  useEffect(() => {
    if (mm) return
    let live = true
    catalog.loadMateriaMedica().then(() => { if (live) setMm(catalog.mmInfo) }).catch(() => { /* fall back to the static credit */ })
    return () => { live = false }
  }, [catalog, mm])

  const reps: Source[] = catalog.repertoryInfos.map(r => ({
    title: r.abbrev === 'publicum' ? `${r.title} by ${r.author}` : r.abbrev.startsWith('kent') ? `${r.title}: German translation of Kent's Repertory` : `${r.title} (${r.author})`,
    detail: [r.publisher, r.year ? String(r.year) : '', `${r.rubricCount.toLocaleString()} rubrics`, `${r.entryCount.toLocaleString()} remedy entries`].filter(Boolean).join(' · '),
    licence: r.license.replace(/^GPL v3.*/i, 'GNU GPL v3'),
    icon: BookOpen,
  }))
  const mmSource: Source = {
    title: mm ? `${mm.title.replace(/^./, c => c.toUpperCase())} by ${mm.author}` : 'Pocket Manual of Homoeopathic Materia Medica by William Boericke',
    detail: `${mm?.publisher ?? 'Boericke & Runyon, New York'} · ${mm?.year ?? 1906}`,
    licence: mm?.license ?? 'Public domain',
    icon: BookText,
  }
  return [...reps, mmSource]
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const sources = useSources()
  const catalog = useCatalog()
  const rubrics = catalog.repertoryInfos.reduce((n, r) => n + r.rubricCount, 0)
  return (
    <Dialog title={`About ${APP_NAME}`} onClose={onClose} width={560} initialFocus=".ws-about-close"
      footer={<>
        <button className="btn" onClick={() => { onClose(); window.setTimeout(() => runCommand('help.shortcuts'), 0) }}>Keyboard shortcuts</button>
        <button className="btn btn-primary ws-about-close" onClick={onClose}>Close</button>
      </>}>
      <div className="ws-about">
        <div className="ws-about-head">
          <div className="brand-mark ws-about-mark" aria-hidden="true">R</div>
          <div>
            <h3>{APP_NAME}</h3>
            <div className="ws-muted">Version {APP_VERSION} · Repertory, materia medica, cases and analysis in one keyboard-first workspace.</div>
          </div>
        </div>
        <div className="ws-about-facts">
          <div><strong>{catalog.repertoryInfos.length}</strong><span>repertories</span></div>
          <div><strong>{rubrics.toLocaleString()}</strong><span>rubrics</span></div>
          <div><strong>{catalog.remedies.size.toLocaleString()}</strong><span>remedies</span></div>
        </div>

        <h4>Data sources and licences</h4>
        <ul className="ws-about-sources">
          <li>
            <Scale size={15} className="ws-about-icon" />
            <div>
              <strong>OOREP, the open online repertory</strong>
              <span className="ws-muted">Repertory data and the remedy list are taken from the OOREP database dump. The data is distributed under the GNU General Public License v3, and so is this derived data set.</span>
            </div>
            <span className="ws-lic">GNU GPL v3</span>
          </li>
          {sources.map(s => (
            <li key={s.title}>
              <s.icon size={15} className="ws-about-icon" />
              <div>
                <strong>{s.title}</strong>
                <span className="ws-muted">{s.detail}</span>
              </div>
              <span className="ws-lic">{s.licence}</span>
            </li>
          ))}
        </ul>
        <p className="ws-muted ws-about-note">
          Your patients and cases are stored only in this browser. Nothing is sent to a server. Reference texts are shown for study and
          are not medical advice.
        </p>
        <p className="ws-about-hint">
          Press <kbd className="kbd">{formatKeys('F1')}</kbd> for keyboard shortcuts, <kbd className="kbd">{formatKeys('Mod+K')}</kbd> for the command palette
          and <kbd className="kbd">{formatKeys('Mod+,')}</kbd> for settings.
        </p>
      </div>
    </Dialog>
  )
}
