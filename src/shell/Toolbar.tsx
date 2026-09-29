import { memo } from 'react'
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

function ToolButton({ command, icon: Icon, label, state, pressed }: { command: string; icon: typeof ArrowLeft; label?: string; state: CommandState | undefined; pressed?: boolean }) {
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
}

export const Toolbar = memo(function Toolbar() {
  const catalog = useCatalog()
  const cs = useCommandState(TOOL_COMMANDS)
  const repertory = useApp(s => { const t = selectActiveTab(s); return t?.kind === 'repertory' ? t.repertory : null })
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
          className="tool-select"
          aria-label="Repertory"
          value={repertory ?? ''}
          onChange={e => runCommand(`repertory.open.${e.target.value}`)}
        >
          {repertory == null && <option value="">Repertory…</option>}
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
            onDragOver={e => { if (e.dataTransfer.types.includes('application/x-rubric-ref')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('drop') } }}
            onDragLeave={e => e.currentTarget.classList.remove('drop')}
            onDrop={e => {
              e.currentTarget.classList.remove('drop')
              const refs = e.dataTransfer.getData('application/x-rubric-ref').split(/[\s,]+/).filter(r => /^[\w.-]+:\d+$/.test(r))
              if (!refs.length) return
              e.preventDefault()
              const n = actions.addRubrics(refs, { clipboardId: cb.id })
              actions.toast(n ? `Added ${n} rubric${n === 1 ? '' : 's'} to ${cb.name}` : `Already in ${cb.name}`, n ? 'success' : 'info')
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
        <button className="tool-btn" aria-label="More tools" title="More tools" aria-haspopup="menu" onClick={e => more.openAt(e.currentTarget, overflowItems())}>
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
