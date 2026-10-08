import { memo, useRef } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookText, ClipboardPlus, Network, PanelLeft, PanelRight, PanelBottom, Users, Undo2, Redo2, Bookmark, MoreHorizontal } from 'lucide-react'
import { displayKey, formatKeys, getCommand, runCommand } from '../commands/registry'
import { useCommandState } from '../commands/useCommandState'
import type { CommandState } from '../commands/useCommandState'
import { useCatalog } from '../data/CatalogContext'
import { actions, useApp, selectActiveTab, selectActiveConsultation } from '../state/store'
import { QuickFind } from '../features/search/QuickFind'
import { useContextMenu } from '../ui/Menu'
import type { MenuItem } from '../ui/Menu'
import { onColor } from './color'
import { openRepertory, takeRefs } from '../features/repertory/ops'
import { DEFAULT_TAKE } from '../features/repertory/take'
import { RUBRIC_MIME, parseRubricDrop } from '../features/clipboard/logic'

/** Width below which the repertory picker, clipboard chips and Analyse also fold into "More tools" (shell.css). */
export const COMPACT_TOOLBAR_QUERY = '(max-width: 760px)'

/** Lower-priority tools that fold into the "More tools" menu in narrow windows (see workspace.css). */
const OVERFLOW_ITEMS: MenuItem[] = [
  { command: 'rubric.bookmark' },
  { type: 'separator' },
  { command: 'edit.undo' },
  { command: 'edit.redo' },
  { type: 'separator' },
  { command: 'patients.open' },
  { command: 'mm.open' },
  { command: 'families.open' },
]

/** Every command the toolbar shows: their enabled/checked flags drive its re-renders. */
const TOOL_COMMANDS = [
  'nav.back', 'nav.forward', 'nav.parent', 'rubric.add', 'rubric.bookmark', 'analysis.open', 'edit.undo', 'edit.redo',
  'patients.open', 'mm.open', 'families.open', 'view.toggleTree', 'view.toggleDock', 'view.toggleClipboard',
] as const

type ToolButtonProps = { command: string; icon: typeof ArrowLeft; label?: string; state: CommandState | undefined; pressed?: boolean }
/** Memoised on the command's flags (the state objects are rebuilt each render): switching documents re-renders only buttons whose state changed. */
const ToolButton = memo(function ToolButton({ command, icon: Icon, label, state, pressed }: ToolButtonProps) {
  const cmd = getCommand(command)
  const key = displayKey(cmd?.keys)
  const title = cmd ? `${cmd.title}${key ? ` (${formatKeys(key)})` : ''}` : command
  return (
    <button
      className={`tool-btn${label ? ' with-label' : ''}`}
      aria-label={cmd?.title ?? command}
      aria-pressed={pressed}
      title={title}
      disabled={!cmd || !state?.enabled}
      onClick={() => runCommand(command)}
    >
      <Icon size={15} aria-hidden />
      {label && <span>{label}</span>}
    </button>
  )
}, (a: ToolButtonProps, b: ToolButtonProps) => a.command === b.command && a.icon === b.icon && a.label === b.label && a.pressed === b.pressed
  && a.state?.enabled === b.state?.enabled && a.state?.checked === b.state?.checked)

export const Toolbar = memo(function Toolbar() {
  const catalog = useCatalog()
  const cs = useCommandState(TOOL_COMMANDS)
  // the repertory the active document reads: a repertory tab's book, or the first book a search searches
  const repertory = useApp(s => {
    const t = selectActiveTab(s)
    return t?.kind === 'repertory' ? t.repertory : t?.kind === 'search' ? (t.repertories[0] ?? null) : null
  })
  // elsewhere the picker names the last repertory used (dimmed) rather than a bare placeholder
  const lastRepertory = useRef<string | null>(null)
  if (repertory) lastRepertory.current = repertory
  const fallbackRepertory = useApp(s => s.settings.defaultRepertory)
  const shownRepertory = lastRepertory.current ?? fallbackRepertory
  /** Ctrl/Cmd held while choosing: open another tab even when the repertory is already open. */
  const newTabChoice = useRef(false)
  const chooseRepertory = (abbrev: string) => {
    const s = useApp.getState()
    const existing = s.tabs.find(t => t.kind === 'repertory' && t.repertory === abbrev)
    if (newTabChoice.current) void openRepertory(abbrev, undefined, { reuse: false })
    else if (existing) actions.activateTab(existing.id)
    else runCommand(`repertory.open.${abbrev}`)
    newTabChoice.current = false
  }
  const clipboards = useApp(s => selectActiveConsultation(s)?.clipboards ?? null)
  const activeClipboardId = useApp(s => s.activeClipboardId)
  const more = useContextMenu()
  const currentClip = activeClipboardId ?? clipboards?.[0]?.id

  /** "More tools": the folded low-priority tools, plus the picker, chips and Analyse in a compact toolbar. */
  const overflowItems = (): MenuItem[] => {
    if (!window.matchMedia?.(COMPACT_TOOLBAR_QUERY).matches) return OVERFLOW_ITEMS
    return [
      { command: 'analysis.open' },
      { label: 'Open repertory', submenu: catalog.repertoryInfos.map(r => ({ command: `repertory.open.${r.abbrev}`, checked: r.abbrev === repertory })) },
      ...(clipboards?.length ? [{
        label: 'Active clipboard',
        submenu: clipboards.map((cb, i): MenuItem => ({ label: `${i + 1}. ${cb.name} (${cb.symptoms.length})`, checked: cb.id === currentClip, keys: i < 9 ? `Alt+${i + 1}` : undefined, run: () => actions.setActiveClipboard(cb.id) })),
      }] : []),
      { type: 'separator' },
      ...OVERFLOW_ITEMS,
    ]
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="tool-group">
        <ToolButton command="nav.back" icon={ArrowLeft} state={cs['nav.back']} />
        <ToolButton command="nav.forward" icon={ArrowRight} state={cs['nav.forward']} />
        <ToolButton command="nav.parent" icon={ArrowUp} state={cs['nav.parent']} />
      </div>
      <div className="tool-group tool-rep">
        <select
          className={`tool-select${repertory == null ? ' tool-select-dim' : ''}`}
          aria-label="Repertory"
          title={repertory == null ? 'Open a repertory (Ctrl+click: in a new tab)' : 'Repertory (Ctrl+click: open in a new tab)'}
          value={repertory ?? ''}
          onMouseDown={e => { newTabChoice.current = e.ctrlKey || e.metaKey }}
          onKeyDown={e => { newTabChoice.current = e.ctrlKey || e.metaKey }}
          onChange={e => { if (e.target.value) chooseRepertory(e.target.value) }}
        >
          {/* outside a repertory the picker shows the last one used, dimmed; choosing it (or another) opens it */}
          {repertory == null && <option value="" disabled hidden>{catalog.repertoryInfos.find(r => r.abbrev === shownRepertory)?.title ?? 'Repertory…'}</option>}
          {catalog.repertoryInfos.map(r => <option key={r.abbrev} value={r.abbrev}>{r.title}</option>)}
        </select>
      </div>
      <QuickFind />
      <div className="tool-group">
        <ToolButton command="rubric.add" icon={ClipboardPlus} label="Take" state={cs['rubric.add']} />
        <span className="tool-low"><ToolButton command="rubric.bookmark" icon={Bookmark} state={cs['rubric.bookmark']} /></span>
      </div>
      <div className="tool-group clip-switch" role="group" aria-label="Active clipboard">
        {clipboards?.map((cb, i) => (
          <button
            key={cb.id}
            className={`clip-chip${cb.id === currentClip ? ' active' : ''}`}
            style={{ ['--chip' as string]: cb.color, ['--chip-fg' as string]: onColor(cb.color) }}
            title={`${cb.name} (${cb.symptoms.length})${i < 9 ? ` — ${formatKeys(`Alt+${i + 1}`)}` : ''}`}
            aria-label={`${cb.name}, ${cb.symptoms.length} symptom${cb.symptoms.length === 1 ? '' : 's'}`}
            aria-pressed={cb.id === currentClip}
            onClick={() => actions.setActiveClipboard(cb.id)}
            onDragOver={e => { if (e.dataTransfer.types.includes(RUBRIC_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('drop') } }}
            onDragLeave={e => e.currentTarget.classList.remove('drop')}
            onDrop={e => {
              e.currentTarget.classList.remove('drop')
              const refs = parseRubricDrop(e.dataTransfer.getData(RUBRIC_MIME))
              if (!refs.length) return
              e.preventDefault()
              // the standard take: recents, the take toast with Undo, into this chip's clipboard
              takeRefs(refs, { ...DEFAULT_TAKE, clipboard: i + 1 })
            }}
          >
            {i + 1}<sup aria-hidden="true">{cb.symptoms.length || ''}</sup>
          </button>
        ))}
      </div>
      <div className="tool-group tool-analyse">
        <ToolButton command="analysis.open" icon={BarChart3} label="Analyse" state={cs['analysis.open']} />
      </div>
      <div className="tool-spacer" />
      <div className="tool-group tool-low">
        <ToolButton command="edit.undo" icon={Undo2} state={cs['edit.undo']} />
        <ToolButton command="edit.redo" icon={Redo2} state={cs['edit.redo']} />
      </div>
      <div className="tool-group tool-low">
        <ToolButton command="patients.open" icon={Users} state={cs['patients.open']} />
        <ToolButton command="mm.open" icon={BookText} state={cs['mm.open']} />
        <ToolButton command="families.open" icon={Network} state={cs['families.open']} />
      </div>
      <div className="tool-group tool-more">
        <button className="tool-btn" aria-label="More tools" title="More tools" aria-haspopup="menu" aria-expanded={more.isOpen} onClick={e => more.openAt(e.currentTarget, overflowItems())}>
          <MoreHorizontal size={15} aria-hidden />
        </button>
      </div>
      <div className="tool-group tool-panes">
        <ToolButton command="view.toggleTree" icon={PanelLeft} state={cs['view.toggleTree']} pressed={!!cs['view.toggleTree']?.checked} />
        <ToolButton command="view.toggleDock" icon={PanelBottom} state={cs['view.toggleDock']} pressed={!!cs['view.toggleDock']?.checked} />
        <ToolButton command="view.toggleClipboard" icon={PanelRight} state={cs['view.toggleClipboard']} pressed={!!cs['view.toggleClipboard']?.checked} />
      </div>
      {more.element}
    </div>
  )
})
