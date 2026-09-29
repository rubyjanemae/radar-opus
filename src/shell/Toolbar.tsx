import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookText, ClipboardPlus, Network, PanelLeft, PanelRight, PanelBottom, Users, Undo2, Redo2, Bookmark, MoreHorizontal } from 'lucide-react'
import { formatKeys, getCommand, isEnabled, onCommandsChanged, runCommand } from '../commands/registry'
import { useCatalog } from '../data/CatalogContext'
import { actions, useApp, selectActiveTab, selectActiveConsultation } from '../state/store'
import { QuickFind } from '../features/search/QuickFind'
import { useContextMenu } from '../ui/Menu'
import type { MenuItem } from '../ui/Menu'

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

function ToolButton({ command, icon: Icon, label, pressed }: { command: string; icon: typeof ArrowLeft; label?: string; pressed?: boolean }) {
  const cmd = getCommand(command)
  const title = cmd ? `${cmd.title}${cmd.keys?.[0] ? ` (${formatKeys(cmd.keys[0])})` : ''}` : command
  return (
    <button
      className={`tool-btn${label ? ' with-label' : ''}`}
      aria-label={cmd?.title ?? command}
      aria-pressed={pressed}
      title={title}
      disabled={!cmd || !isEnabled(cmd)}
      onClick={() => runCommand(command)}
    >
      <Icon size={15} />
      {label && <span>{label}</span>}
    </button>
  )
}

export function Toolbar() {
  const catalog = useCatalog()
  const [, force] = useState(0)
  useEffect(() => onCommandsChanged(() => force(x => x + 1)), [])
  // re-render on state that command enablement depends on
  const tab = useApp(selectActiveTab)
  const consultation = useApp(selectActiveConsultation)
  const activeClipboardId = useApp(s => s.activeClipboardId)
  const layout = useApp(s => s.layout)
  useApp(s => s.past.length + s.future.length)
  const more = useContextMenu()

  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="tool-group">
        <ToolButton command="nav.back" icon={ArrowLeft} />
        <ToolButton command="nav.forward" icon={ArrowRight} />
        <ToolButton command="nav.parent" icon={ArrowUp} />
      </div>
      <div className="tool-group">
        <select
          className="tool-select"
          aria-label="Repertory"
          value={tab?.kind === 'repertory' ? tab.repertory : ''}
          onChange={e => runCommand(`repertory.open.${e.target.value}`)}
        >
          {tab?.kind !== 'repertory' && <option value="">Repertory…</option>}
          {catalog.repertoryInfos.map(r => <option key={r.abbrev} value={r.abbrev}>{r.title}</option>)}
        </select>
      </div>
      <QuickFind />
      <div className="tool-group">
        <ToolButton command="rubric.add" icon={ClipboardPlus} label="Take" />
        <span className="tool-low"><ToolButton command="rubric.bookmark" icon={Bookmark} /></span>
      </div>
      <div className="tool-group clip-switch" role="group" aria-label="Active clipboard">
        {consultation?.clipboards.map((cb, i) => (
          <button
            key={cb.id}
            className={`clip-chip${cb.id === (activeClipboardId ?? consultation.clipboards[0].id) ? ' active' : ''}`}
            style={{ ['--chip' as string]: cb.color }}
            title={`${cb.name} (${cb.symptoms.length})${i < 9 ? ` — ${formatKeys(`Alt+${i + 1}`)}` : ''}`}
            aria-pressed={cb.id === activeClipboardId}
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
            {i + 1}<sup>{cb.symptoms.length || ''}</sup>
          </button>
        ))}
      </div>
      <div className="tool-group">
        <ToolButton command="analysis.open" icon={BarChart3} label="Analyse" />
      </div>
      <div className="tool-spacer" />
      <div className="tool-group tool-low">
        <ToolButton command="edit.undo" icon={Undo2} />
        <ToolButton command="edit.redo" icon={Redo2} />
      </div>
      <div className="tool-group tool-low">
        <ToolButton command="patients.open" icon={Users} />
        <ToolButton command="mm.open" icon={BookText} />
        <ToolButton command="families.open" icon={Network} />
      </div>
      <div className="tool-group tool-more">
        <button className="tool-btn" aria-label="More tools" title="More tools" aria-haspopup="menu" onClick={e => more.openAt(e.currentTarget, OVERFLOW_ITEMS)}>
          <MoreHorizontal size={15} />
        </button>
      </div>
      <div className="tool-group tool-panes">
        <ToolButton command="view.toggleTree" icon={PanelLeft} pressed={layout.showTree} />
        <ToolButton command="view.toggleDock" icon={PanelBottom} pressed={layout.showAnalysisDock} />
        <ToolButton command="view.toggleClipboard" icon={PanelRight} pressed={layout.showClipboard} />
      </div>
      <span hidden>{consultation?.id}</span>
      {more.element}
    </div>
  )
}
