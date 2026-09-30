import { useState } from 'react'
import { Dialog } from '../../ui/Dialog'
import { selectActiveClipboard, selectActiveConsultation, useApp, MAX_CLIPBOARDS } from '../../state/store'
import type { RubricRef } from '../../data/types'
import type { Weight } from '../../engine/model'
import { DEFAULT_TAKE, describeTake } from './take'
import type { TakeOptions } from './take'
import { refLabel, resolve, subtreeRefs, takeRefs } from './ops'

const GROUPS = 'abdefghijklmnopqrtuvwyz'.split('')

/** F6: take the current rubric(s) with intensity, qualifications, group and target clipboard. */
export function TakeOptionsDialog({ onClose, refs = [] }: { onClose: () => void; refs?: RubricRef[] }) {
  const consultation = useApp(selectActiveConsultation)
  const activeCb = useApp(selectActiveClipboard)
  const clipboards = consultation?.clipboards ?? []
  const activeNo = activeCb ? clipboards.findIndex(c => c.id === activeCb.id) + 1 : 1
  const [o, setO] = useState<TakeOptions>({ ...DEFAULT_TAKE, clipboard: Math.max(1, activeNo) })
  const set = (p: Partial<TakeOptions>) => setO(x => ({ ...x, ...p }))
  const first = refs[0] ? resolve(refs[0]) : null
  const subCount = first ? subtreeRefs(first.rep, first.index).length - 1 : 0

  const submit = () => {
    if (!refs.length) return
    onClose()
    takeRefs(refs, o)
  }

  return (
    <Dialog
      title="Take with options" onClose={onClose} width={500} initialFocus={`input[name="rtake-w"][value="${o.weight}"]`}
      footer={<>
        <span className="rtake-summary">{describeTake(o)}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!refs.length}>Take</button>
      </>}
    >
      <form
        className="rtake"
        onSubmit={e => { e.preventDefault(); submit() }}
        onKeyDown={e => {
          const t = e.target as HTMLElement
          if (e.key === 'Enter' && t.tagName !== 'BUTTON' && t.tagName !== 'SELECT') { e.preventDefault(); submit() }
          else if (/^[0-4]$/.test(e.key) && t.tagName !== 'SELECT') { e.preventDefault(); set({ weight: Number(e.key) as Weight }) }
        }}
      >
        <div className="rtake-rubric">
          {refs.length === 1 ? refLabel(refs[0]) : `${refs.length} rubrics`}
          {first && <span className="rtake-count">{first.rep.remedyCount(first.index)} remedies</span>}
        </div>
        <div className="rtake-sec">
          <div className="rtake-label" id="rtake-w-label">Intensity</div>
          <div className="rtake-weights rseg" role="radiogroup" aria-labelledby="rtake-w-label">
            {[0, 1, 2, 3, 4].map(w => (
              <label key={w} className={o.weight === w ? 'on' : ''} title={w === 0 ? 'Kept on the clipboard, ignored in the analysis' : `Counts ×${w}`}>
                <input type="radio" name="rtake-w" value={w} checked={o.weight === w} onChange={() => set({ weight: w as Weight })} />
                {w === 0 ? '0 · ignore' : `×${w}`}
              </label>
            ))}
          </div>
        </div>
        <div className="rtake-sec rtake-flags" role="group" aria-labelledby="rtake-q-label">
          <div className="rtake-label" id="rtake-q-label">Qualification</div>
          <label><input type="checkbox" checked={o.eliminatory} onChange={e => set({ eliminatory: e.target.checked, exclusive: e.target.checked ? false : o.exclusive })} /> Eliminative <small>only remedies in this rubric stay</small></label>
          <label><input type="checkbox" checked={o.exclusive} onChange={e => set({ exclusive: e.target.checked, eliminatory: e.target.checked ? false : o.eliminatory })} /> Excluding <small>remedies in this rubric are removed</small></label>
          <label><input type="checkbox" checked={o.causal} onChange={e => set({ causal: e.target.checked })} /> Causal <small>causation / never well since</small></label>
          <label className={subCount < 1 ? 'disabled' : ''}>
            <input type="checkbox" checked={o.subRubrics} disabled={subCount < 1} onChange={e => set({ subRubrics: e.target.checked })} /> With sub-rubrics
            <small>{subCount > 0 ? `combine with ${subCount} sub-rubrics` : 'no sub-rubrics with remedies'}</small>
          </label>
        </div>
        <div className="rtake-row">
          <label className="field">Group
            <select className="select" value={o.group ?? ''} onChange={e => set({ group: e.target.value || null })}>
              <option value="">None</option>
              {GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}
            </select>
          </label>
          <label className="field">Clipboard
            <select className="select" value={o.clipboard ?? 1} onChange={e => set({ clipboard: Number(e.target.value) })}>
              {clipboards.length === 0 && <option value={1}>Clipboard 1 (new unsaved case)</option>}
              {clipboards.map((cb, n) => <option key={cb.id} value={n + 1}>{n + 1} · {cb.name} ({cb.symptoms.length})</option>)}
              {clipboards.length > 0 && clipboards.length < MAX_CLIPBOARDS && <option value={clipboards.length + 1}>{clipboards.length + 1} · New clipboard</option>}
            </select>
          </label>
        </div>
      </form>
    </Dialog>
  )
}
