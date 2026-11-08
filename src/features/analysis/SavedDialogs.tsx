import { useRef, useState } from 'react'
import { useApp } from '../../state/store'
import { Dialog } from '../../ui/Dialog'
import { deleteSavedAnalysis, recallAnalysis, saveAnalysis } from './ops'
import { ctimeDate, defaultSaveName } from './saved'
import './analysis.css'

/** Analysis › Save current analysis: name the snapshot (the date and time by default). */
export function SaveAnalysisDialog({ consultationId, onClose }: { consultationId: string; onClose: () => void }) {
  const count = useApp(s => s.consultations[consultationId]?.savedAnalyses?.length ?? 0)
  const [name, setName] = useState(() => defaultSaveName(new Date()))
  const ok = () => { if (saveAnalysis(consultationId, name)) onClose() }
  return (
    <Dialog
      title="Save current analysis" onClose={onClose} width={420} initialFocus="input"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={ok}>OK</button></>}
    >
      <form className="an-save" onSubmit={e => { e.preventDefault(); ok() }}>
        <label className="an-save-row">
          <span>Analysis {count + 1}</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} onFocus={e => e.currentTarget.select()} aria-label="Name of the analysis" />
        </label>
      </form>
    </Dialog>
  )
}

/** Analysis › Recall an existing analysis: pick a saved analysis of the case; it replaces the current clipboards. */
export function RecallAnalysisDialog({ consultationId, onClose }: { consultationId: string; onClose: () => void }) {
  const c = useApp(s => s.consultations[consultationId])
  const list = c?.savedAnalyses ?? []
  const [k, setK] = useState(() => Math.max(0, list.findIndex(a => a.id === c?.currentAnalysisId)))
  const cur = Math.min(k, list.length - 1)
  const listRef = useRef<HTMLDivElement>(null)
  const recall = (i = cur) => { const a = list[i]; if (a && recallAnalysis(consultationId, a.id)) onClose() }
  const remove = () => { const a = list[cur]; if (a) deleteSavedAnalysis(consultationId, a.id) }
  const move = (i: number) => {
    setK(i)
    listRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  return (
    <Dialog
      title="Recall an existing analysis" onClose={onClose} width={560} initialFocus=".an-recall-list"
      footer={
        <>
          <button className="btn" onClick={remove} disabled={!list.length}>Delete</button>
          <span className="an-spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => recall()} disabled={!list.length}>OK</button>
        </>
      }
    >
      {!list.length ? <p className="an-muted">This case has no saved analysis.</p> : (
        <div
          ref={listRef} className="an-recall-list" role="listbox" aria-label="Saved analyses" tabIndex={0}
          aria-activedescendant={`an-recall-${cur}`}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(Math.min(list.length - 1, cur + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(Math.max(0, cur - 1)) }
            else if (e.key === 'Home') { e.preventDefault(); move(0) }
            else if (e.key === 'End') { e.preventDefault(); move(list.length - 1) }
            else if (e.key === 'Enter') { e.preventDefault(); recall() }
            else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
          }}
        >
          <div className="an-recall-row an-recall-head" aria-hidden="true"><span>No</span><span>Name</span><span>Saved</span><span>Symptoms</span></div>
          {list.map((a, i) => (
            <div
              key={a.id} id={`an-recall-${i}`} data-i={i} role="option" aria-selected={i === cur}
              className={`an-recall-row${i === cur ? ' active' : ''}`}
              onMouseDown={() => setK(i)} onDoubleClick={() => recall(i)}
            >
              <span>{i + 1}</span>
              <span className="an-recall-name">{a.name || '—'}</span>
              <span>{ctimeDate(new Date(a.savedAt))}</span>
              <span>{a.clipboards.reduce((n, cb) => n + cb.symptoms.length, 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
