import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'
import { Dialog } from '../../ui/Dialog'
import { allCommands, formatKeys, getCommand, isEnabled, onCommandsChanged, runCommand } from '../../commands/registry'
import { actions } from '../../state/store'
import { REFERENCE_SECTIONS, filterSection, shortcutGroups } from './shortcuts'
import type { ReferenceSection } from './shortcuts'
import './workspace.css'

function Keys({ keys, raw }: { keys: string[]; raw?: boolean }) {
  return (
    <span className="ws-keys">
      {keys.map((k, i) => (
        <span key={k} className="ws-keys-alt">
          {i > 0 && <span className="ws-keys-or">or</span>}
          <kbd className="kbd">{raw ? k : formatKeys(k)}</kbd>
        </span>
      ))}
    </span>
  )
}

export function ShortcutsDialog({ onClose, query: initialQuery }: { onClose: () => void; query?: string }) {
  const [q, setQ] = useState(typeof initialQuery === 'string' ? initialQuery : '')
  const [all, setAll] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => onCommandsChanged(() => setVersion(v => v + 1)), [])

  const groups = useMemo(() => shortcutGroups(allCommands(), q, { includeUnbound: all }), [q, all, version])
  const refs = useMemo(() => REFERENCE_SECTIONS.map(s => filterSection(s, q)).filter(s => s.rows.length), [q])
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const run = (id: string) => {
    const c = getCommand(id)
    if (!c || !isEnabled(c)) return
    onClose()
    // let the dialog restore focus before the command moves it
    window.setTimeout(() => runCommand(id), 0)
  }

  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // runnable rows in display order: the roving focus ring and the Enter target
  const runnable = useMemo(() => groups.flatMap(g => g.rows).filter(r => { const c = getCommand(r.id); return !!c && isEnabled(c) }).map(r => r.id), [groups])
  const [active, setActive] = useState<string | null>(null)
  const current = active && runnable.includes(active) ? active : runnable[0] ?? null
  const [inputFocused, setInputFocused] = useState(true)

  const focusRow = (id: string | undefined) => {
    if (!id) return
    setActive(id)
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-cmd="${CSS.escape(id)}"]`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }
  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); return }
    if (e.key === 'ArrowDown' && runnable.length) { e.preventDefault(); focusRow(current ?? runnable[0]) }
    else if (e.key === 'Enter' && current) { e.preventDefault(); run(current) }
  }
  const onRowKey = (e: ReactKeyboardEvent, id: string) => {
    const i = runnable.indexOf(id)
    let n: number | null = null
    if (e.key === 'ArrowDown') n = Math.min(runnable.length - 1, i + 1)
    else if (e.key === 'ArrowUp') { if (i <= 0) { e.preventDefault(); inputRef.current?.focus(); return } n = i - 1 }
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = runnable.length - 1
    else if (e.key === 'PageDown') n = Math.min(runnable.length - 1, i + 10)
    else if (e.key === 'PageUp') n = Math.max(0, i - 10)
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      // typing goes back to the search box
      inputRef.current?.focus()
      return
    }
    if (n == null) return
    e.preventDefault()
    focusRow(runnable[n])
  }

  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={880} initialFocus=".ws-sc-search input">
      <div className="ws-sc">
        <div className="ws-sc-bar">
          <label className="ws-sc-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              role="combobox"
              aria-expanded={runnable.length > 0}
              aria-controls="ws-sc-results"
              aria-autocomplete="list"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Search commands or keys (e.g. clipboard, F6, Ctrl+B)"
              aria-label="Search shortcuts"
              onChange={e => { setQ(e.target.value); setActive(null) }}
              onKeyDown={onInputKey}
            />
            {q && <button className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}><X size={13} /></button>}
          </label>
          <label className="ws-check">
            <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
            <span>Include commands without a shortcut</span>
          </label>
          <span className="ws-muted ws-sc-count" aria-live="polite">{total} command{total === 1 ? '' : 's'}</span>
        </div>

        <div className="ws-sc-body" ref={bodyRef} id="ws-sc-results">
          {!groups.length && !refs.length && (
            <div className="empty-state ws-sc-empty">
              <strong>No shortcuts match “{q}”</strong>
              <span>Try a command name, a menu name or a key such as F2.</span>
            </div>
          )}
          {groups.length > 0 && (
            <div className="ws-sc-cols">
              {groups.map(g => (
                <section key={g.category} className="ws-sc-group" aria-label={g.category}>
                  <h3>{g.category}</h3>
                  <ul>
                    {g.rows.map(r => {
                      const c = getCommand(r.id)
                      const enabled = !!c && isEnabled(c)
                      return (
                        <li key={r.id}>
                          <button
                            className={`ws-sc-row${inputFocused && r.id === current ? ' ws-sc-target' : ''}`}
                            data-cmd={r.id}
                            tabIndex={r.id === current ? 0 : -1}
                            onClick={() => run(r.id)}
                            onKeyDown={e => onRowKey(e, r.id)}
                            onFocus={() => setActive(r.id)}
                            disabled={!enabled}
                            title={enabled ? 'Run now (Enter)' : 'Not available here'}
                          >
                            <span className="ws-sc-title">{r.title.replace(/…$/, '')}</span>
                            {r.keys.length ? <Keys keys={r.keys} /> : <span className="ws-muted">—</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {refs.length > 0 && (
            <div className="ws-sc-refs">
              {refs.map(s => <RefSection key={s.id} section={s} />)}
            </div>
          )}
        </div>
        <div className="ws-sc-foot">
          <span><kbd className="kbd">↓</kbd> <kbd className="kbd">↑</kbd> move · <kbd className="kbd">↵</kbd> runs the highlighted command</span>
          <span><kbd className="kbd">{formatKeys('Mod+K')}</kbd> opens the command palette, which searches everything.</span>
          <button className="btn btn-sm" onClick={() => { onClose(); actions.setCommandPalette(true) }}>Open palette</button>
        </div>
      </div>
    </Dialog>
  )
}

function RefSection({ section }: { section: ReferenceSection }) {
  return (
    <section className={`ws-sc-group ws-sc-ref ws-sc-ref-${section.id}`} aria-label={section.title}>
      <h3>{section.title}</h3>
      <ul>
        {section.rows.map(r => (
          <li key={r.title} className="ws-sc-static">
            <Keys keys={r.keys} raw />
            <span className="ws-sc-title">{r.title}{r.detail && <span className="ws-sc-detail">{r.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
