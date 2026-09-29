import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark as BookmarkIcon, Folder, FolderPlus, Pencil, Search, Trash2, ArrowUpRight } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { actions, useApp } from '../../state/store'
import { useCatalog } from '../../data/CatalogContext'
import { parseRef } from '../../data/catalog'
import type { Bookmark } from '../../state/workspace'
import { goToRef } from './ops'
import { bookmarkFolders } from './logic'

const ALL = '\u0000all'

export function BookmarksDialog({ onClose, selectId }: { onClose: () => void; selectId?: string }) {
  const bookmarks = useApp(s => s.bookmarks)
  const catalog = useCatalog()
  const [folder, setFolder] = useState<string>(ALL)
  const [extra, setExtra] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<string | null>(selectId ?? bookmarks[0]?.id ?? null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [folderEdit, setFolderEdit] = useState<{ from: string | null; value: string } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const folders = bookmarkFolders(bookmarks, extra)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bookmarks
      .filter(b => folder === ALL || b.folder === folder)
      .filter(b => !q || b.label.toLowerCase().includes(q) || b.folder.toLowerCase().includes(q))
      .sort((a, b) => a.folder.localeCompare(b.folder) || a.label.localeCompare(b.label))
  }, [bookmarks, folder, query])
  const selIdx = visible.findIndex(b => b.id === sel)
  const current = selIdx >= 0 ? visible[selIdx] : null

  useEffect(() => { listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const open = (b: Bookmark, newTab = false) => { onClose(); void goToRef(b.ref, { newTab }) }
  const remove = (b: Bookmark) => {
    const idx = visible.indexOf(b)
    actions.removeBookmark(b.id)
    setSel(visible[idx + 1]?.id ?? visible[idx - 1]?.id ?? null)
    actions.toast('Bookmark deleted', 'info', { label: 'Undo', run: () => actions.addBookmark(b.ref, b.label, b.folder) })
  }
  const commitFolder = () => {
    if (!folderEdit) return
    const name = folderEdit.value.trim()
    if (name && folderEdit.from == null) { setExtra(x => [...x, name]); setFolder(name) }
    else if (name && folderEdit.from && name !== folderEdit.from) {
      for (const b of bookmarks) if (b.folder === folderEdit.from) actions.updateBookmark(b.id, { folder: name })
      setExtra(x => x.map(f => f === folderEdit.from ? name : f))
      if (folder === folderEdit.from) setFolder(name)
    }
    setFolderEdit(null)
  }

  const onListKey = (e: React.KeyboardEvent) => {
    if (renaming) return
    let handled = true
    if (e.key === 'ArrowDown') setSel(visible[Math.min(visible.length - 1, selIdx + 1)]?.id ?? sel)
    else if (e.key === 'ArrowUp') setSel(visible[Math.max(0, selIdx - 1)]?.id ?? sel)
    else if (e.key === 'Home') setSel(visible[0]?.id ?? null)
    else if (e.key === 'End') setSel(visible[visible.length - 1]?.id ?? null)
    else if (e.key === 'Enter' && current) open(current, e.ctrlKey || e.metaKey)
    else if ((e.key === 'F2') && current) setRenaming(current.id)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && current) remove(current)
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  return (
    <Dialog title="Bookmarks" onClose={onClose} width={780} initialFocus=".rbm-list"
      footer={<>
        <span className="rbm-foot-hint"><kbd className="kbd">↵</kbd> open <kbd className="kbd">F2</kbd> rename <kbd className="kbd">Del</kbd> delete</span>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn btn-primary" disabled={!current} onClick={() => current && open(current)}>Open</button>
      </>}
    >
      <div className="rbm">
        <aside className="rbm-folders" aria-label="Folders">
          <button className={`rbm-folder${folder === ALL ? ' on' : ''}`} onClick={() => setFolder(ALL)}><BookmarkIcon size={13} /> All bookmarks <span className="badge">{bookmarks.length}</span></button>
          {folders.map(f => folderEdit?.from === f ? (
            <input key={f} className="input rbm-folder-input" autoFocus value={folderEdit.value} aria-label="Folder name"
              onChange={e => setFolderEdit({ from: f, value: e.target.value })} onBlur={commitFolder}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitFolder(); if (e.key === 'Escape') setFolderEdit(null) }} />
          ) : (
            <button key={f} className={`rbm-folder${folder === f ? ' on' : ''}`} onClick={() => setFolder(f)} onDoubleClick={() => setFolderEdit({ from: f, value: f })} title="Double-click to rename">
              <Folder size={13} /> <span className="rbm-folder-name">{f}</span> <span className="badge">{bookmarks.filter(b => b.folder === f).length}</span>
            </button>
          ))}
          {folderEdit?.from === null ? (
            <input className="input rbm-folder-input" autoFocus placeholder="Folder name" value={folderEdit.value} aria-label="New folder name"
              onChange={e => setFolderEdit({ from: null, value: e.target.value })} onBlur={commitFolder}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitFolder(); if (e.key === 'Escape') setFolderEdit(null) }} />
          ) : (
            <button className="rbm-folder rbm-newfolder" onClick={() => setFolderEdit({ from: null, value: '' })}><FolderPlus size={13} /> New folder</button>
          )}
          {folder !== ALL && folders.includes(folder) && (
            <button className="rbm-folder rbm-renamefolder" onClick={() => setFolderEdit({ from: folder, value: folder })}><Pencil size={12} /> Rename folder</button>
          )}
        </aside>
        <div className="rbm-main">
          <div className="rbm-search">
            <Search size={12} />
            <input className="input" placeholder="Filter bookmarks" aria-label="Filter bookmarks" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); listRef.current?.focus() } }} />
          </div>
          <div className="rbm-list" ref={listRef} tabIndex={0} role="listbox" aria-label="Bookmarks" onKeyDown={onListKey}
            aria-activedescendant={current ? `rbm-${current.id}` : undefined}>
            {visible.length === 0 && (
              <div className="empty-state">
                <strong>{bookmarks.length ? 'No bookmarks here' : 'No bookmarks yet'}</strong>
                <span>{bookmarks.length ? 'Try another folder or filter.' : 'Bookmark a rubric with Ctrl+D or from its context menu.'}</span>
              </div>
            )}
            {visible.map(b => {
              const { repertory } = parseRef(b.ref)
              const repTitle = catalog.repertoryInfos.find(r => r.abbrev === repertory)?.title ?? repertory
              return (
                <div key={b.id} id={`rbm-${b.id}`} role="option" aria-selected={b.id === sel}
                  className={`rbm-row${b.id === sel ? ' active' : ''}`}
                  onClick={() => setSel(b.id)} onDoubleClick={() => open(b)}>
                  <div className="rbm-row-main">
                    {renaming === b.id ? (
                      <input className="input rbm-rename" autoFocus defaultValue={b.label} aria-label="Bookmark label"
                        onBlur={e => { const v = e.target.value.trim(); if (v) actions.updateBookmark(b.id, { label: v }); setRenaming(null) }}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); listRef.current?.focus() }
                          if (e.key === 'Escape') { setRenaming(null); listRef.current?.focus() }
                        }} />
                    ) : <span className="rbm-label">{b.label}</span>}
                    <span className="rbm-meta">{repTitle} · {new Date(b.createdAt).toLocaleDateString()}</span>
                  </div>
                  <select className="select rbm-move" aria-label="Folder" value={b.folder} onClick={e => e.stopPropagation()}
                    onChange={e => actions.updateBookmark(b.id, { folder: e.target.value })}>
                    {folders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button className="icon-btn" title="Open" aria-label="Open bookmark" onClick={e => { e.stopPropagation(); open(b) }}><ArrowUpRight size={13} /></button>
                  <button className="icon-btn" title="Rename (F2)" aria-label="Rename bookmark" onClick={e => { e.stopPropagation(); setSel(b.id); setRenaming(b.id) }}><Pencil size={13} /></button>
                  <button className="icon-btn rbm-del" title="Delete (Del)" aria-label="Delete bookmark" onClick={e => { e.stopPropagation(); remove(b) }}><Trash2 size={13} /></button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
