import { useRef, useState } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useApp } from '../../state/store'
import { Dialog } from '../../ui/Dialog'
import { deleteMix, recallMix, saveMix, setDefaultMix } from './ops'
import './docmix.css'

/** A document key as its title ("Repertorium Publicum"), the families document as "Families". */
function useDocTitle() {
  const catalog = useCatalog()
  return (key: string) => {
    if (key.startsWith('rep:')) return catalog.repertoryInfos.find(r => r.abbrev === key.slice(4))?.title ?? key.slice(4)
    if (key.startsWith('fam:')) return 'Families'
    return key
  }
}

/** File › Save selection as a document mix: name the documents checked in the table of contents. */
export function SaveMixDialog({ onClose }: { onClose: () => void }) {
  const keys = useApp(s => s.layout.tocChecked)
  const title = useDocTitle()
  const [name, setName] = useState('')
  const ok = () => { if (saveMix(name)) onClose() }
  return (
    <Dialog title="Save selection as a document mix" onClose={onClose} width={440} initialFocus="input"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={ok} disabled={!name.trim() || !keys.length}>OK</button></>}>
      <form className="dm-form" onSubmit={e => { e.preventDefault(); ok() }}>
        <label className="dm-row"><span>Name</span><input className="input" value={name} onChange={e => setName(e.target.value)} aria-label="Name of the document mix" /></label>
        <div className="dm-docs" aria-label="Documents in the mix">
          {keys.length ? keys.map(k => <div key={k}>{title(k)}</div>) : <p className="dm-muted">No document is checked. Check documents in the list of repertories (table of contents) first.</p>}
        </div>
      </form>
    </Dialog>
  )
}

/** File › Recall a document mix / Select a default document mix: choose one of the saved mixes. */
export function PickMixDialog({ onClose, mode }: { onClose: () => void; mode: 'recall' | 'default' }) {
  const list = useApp(s => s.layout.docMixes)
  const current = useApp(s => s.layout.defaultDocMix)
  const title = useDocTitle()
  const [k, setK] = useState(() => Math.max(0, list.findIndex(m => m.name === current)))
  const cur = Math.min(k, list.length - 1)
  const listRef = useRef<HTMLDivElement>(null)
  const choose = (i = cur) => {
    const m = list[i]
    if (!m) return
    if (mode === 'recall') recallMix(m.name)
    else setDefaultMix(m.name)
    onClose()
  }
  const move = (i: number) => { setK(i); listRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }) }
  return (
    <Dialog title={mode === 'recall' ? 'Recall a document mix' : 'Select a default document mix'} onClose={onClose} width={520} initialFocus=".dm-list"
      footer={<>
        <button className="btn" onClick={() => { const m = list[cur]; if (m) deleteMix(m.name) }} disabled={!list.length}>Delete</button>
        <span className="dm-spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => choose()} disabled={!list.length}>OK</button>
      </>}>
      {!list.length ? <p className="dm-muted">No document mix has been saved. Check documents in the list of repertories and use File › Save selection as a document mix.</p> : (
        <div ref={listRef} className="dm-list" role="listbox" aria-label="Document mixes" tabIndex={0} aria-activedescendant={`dm-opt-${cur}`}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(Math.min(list.length - 1, cur + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(Math.max(0, cur - 1)) }
            else if (e.key === 'Home') { e.preventDefault(); move(0) }
            else if (e.key === 'End') { e.preventDefault(); move(list.length - 1) }
            else if (e.key === 'Enter') { e.preventDefault(); choose() }
          }}>
          {list.map((m, i) => (
            <div key={m.name} id={`dm-opt-${i}`} data-i={i} role="option" aria-selected={i === cur} className={`dm-opt${i === cur ? ' active' : ''}`}
              onMouseDown={() => setK(i)} onDoubleClick={() => choose(i)}>
              <span className="dm-name">{m.name}{m.name === current ? ' (default)' : ''}</span>
              <span className="dm-sub">{m.keys.map(title).join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
