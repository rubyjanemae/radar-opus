import { memo, useLayoutEffect, useRef } from 'react'
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ArrowLeft, ArrowRight, BookMarked, BookOpen, Bookmark, ChartColumnBig, FlaskConical, Printer, ScanSearch,
  Search, TreeDeciduous, Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { displayKey, formatKeys, getCommand, runCommand } from '../commands/registry'
import { useCommandState } from '../commands/useCommandState'
import type { CommandState } from '../commands/useCommandState'
import { useApp } from '../state/store'
import { QuickFind } from '../features/search/QuickFind'
import { useContextMenu } from '../ui/Menu'
import type { MenuItem } from '../ui/Menu'
import { STRATEGIES } from '../engine/analysis'
import { activeSearchTab, openSearch } from '../features/search/ops'
import { historyItems } from './history'
import { keepFocus, returnFocusFromChrome } from './focus'

type Tone = 'blue' | 'teal' | 'orange' | 'amber' | 'green' | 'grey' | 'ink' | 'slate'
type ToolIcon = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>

/** History: a slate rewind arc around a blue clock face (two tones, as the desktop icon reads; lucide's history geometry). */
function HistoryIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle className="tb-hist-face" cx="12" cy="12" r="6.2" stroke="none" />
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" style={{ fill: 'none' }} />
      <path d="M3 3v5h5" style={{ fill: 'none' }} />
      <path className="tb-hist-hands" d="M12 7v5l4 2" style={{ fill: 'none' }} />
    </svg>
  )
}


/**
 * Zoom in / Zoom out: a dark-rimmed magnifier on a heavy handle whose light lens carries a bold blue
 * plus or minus (the desktop's blue accent, as on Back and Forward; lucide's zoom geometry, original tones).
 */
function zoomIcon(plus: boolean) {
  return function ZoomIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle className="tb-zoom-lens" cx="10.5" cy="10.5" r="7.5" />
        <path d="m16.2 16.2 5 5" strokeWidth={strokeWidth * 1.6} style={{ fill: 'none' }} />
        <path className="tb-zoom-sign" d={plus ? 'M10.5 6.9v7.2M6.9 10.5h7.2' : 'M6.9 10.5h7.2'} strokeWidth={strokeWidth * 1.45} style={{ fill: 'none' }} />
      </svg>
    )
  }
}
const ZoomIn = zoomIcon(true)
const ZoomOut = zoomIcon(false)

/** Every command the toolbar shows: their enabled flags drive its re-renders. */
const TOOL_COMMANDS = [
  'repertory.toc', 'mm.open', 'patients.open', 'remedy.open', 'families.open', 'bookmarks.open',
  'search.open', 'analysis.open', 'shell.back', 'shell.forward', 'view.zoomIn', 'view.zoomOut', 'file.print',
] as const

/** RadarOpus's tooltip wording per button (its menu item for the same action); the shortcut follows it. */
const TIPS: Record<string, string> = {
  'repertory.toc': 'Open list of repertories', 'mm.open': 'Open list of references', 'patients.open': 'Open list of patients',
  'remedy.open': 'List of remedies', 'families.open': 'List of families', 'bookmarks.open': 'Bookmarks', 'search.open': 'Search',
  'analysis.open': 'Show current analysis with symptoms and remedies', 'shell.back': 'Go back', 'shell.forward': 'Go forward',
  'view.zoomIn': 'Zoom in', 'view.zoomOut': 'Zoom out', 'file.print': 'Print',
}
const PRINT_MENU: MenuItem[] = [
  { command: 'file.print', label: 'Print' },
  { command: 'case.report' },
]

const PATIENTS_MENU: MenuItem[] = [
  { command: 'patients.open', label: 'Open list of patients' },
  { command: 'patient.new', label: 'Create a new patient' },
  { command: 'consultation.new', label: 'Create a new consultation' },
]
const SEARCH_MENU: MenuItem[] = [
  { command: 'nav.chapter', label: 'Find a rubric' },
  { command: 'nav.findHere', label: 'Find a rubric starting from the current rubric' },
  { type: 'separator' },
  { command: 'search.open', label: 'Search' },
  { command: 'search.remedy', label: 'Advanced search' },
]
/**
 * Search area: where Search looks. In a search window it changes that search's scope; elsewhere it
 * opens a search with that scope (so the button works from any document).
 */
const SCOPES = [['repertory', 'search.scope.repertory'], ['chapter', 'search.scope.chapter'], ['all', 'search.scope.all']] as const
const scopeMenu = (): MenuItem[] => {
  const cur = activeSearchTab()
  return SCOPES.map(([scope, id]) => ({
    label: getCommand(id)?.title ?? id,
    checked: cur ? cur.scope === scope : undefined,
    run: () => {
      const t = activeSearchTab()
      if (!t || t.mode === 'remedy') openSearch()
      runCommand(id)
    },
  }))
}
// the menubar's Analysis menu, same items and order (RadarOpus): the default method is chosen last
const analysisMenu = (): MenuItem[] => [
  { command: 'view.clipboardsOnly', label: 'Show current analysis with symptoms only' },
  { command: 'analysis.open', label: 'Show current analysis with symptoms and remedies' },
  { command: 'families.filter', label: 'Limit to a family' },
  { command: 'clipboard.clearAll', label: 'Start a new analysis (clear all clipboards)' },
  { label: 'Select your default analysis method', submenu: STRATEGIES.map(s => ({ command: `analysis.default.${s.id}`, label: s.name })) },
]

const tip = (command: string | undefined, fallback: string) => {
  const cmd = command ? getCommand(command) : undefined
  const key = displayKey(cmd?.keys)
  return `${(command && TIPS[command]) ?? fallback}${key ? ` (${formatKeys(key)})` : ''}`
}

/** The small solid ▾ at a menu button's icon (original glyph). */
const Caret = () => <svg width="7" height="4" viewBox="0 0 7 4" aria-hidden="true"><path d="M0 0h7L3.5 4z" fill="currentColor" /></svg>

interface BigButtonProps {
  label: string
  icon: ToolIcon
  tone: Tone
  /** The command a click runs; omitted: a click opens `menu`. */
  command?: string
  state?: CommandState
  /** Items of the ▾ menu (a function: built when it opens). */
  menu?: () => MenuItem[]
  /** Menu-only buttons: disabled while none of their items can run. */
  disabled?: boolean
  /** Folded away in narrow windows (the command is in the menu bar too). */
  low?: boolean
}

/** A RadarOpus toolbar button: a large icon over its label, optionally with a ▾ menu. */
function BigButton({ label, icon: Icon, tone, command, state, menu, disabled, low }: BigButtonProps) {
  const cm = useContextMenu()
  const idle = disabled ?? (command ? !state?.enabled : false)
  const openMenu = (el: HTMLElement) => { if (menu) cm.openAt(el, menu()) }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (menu && command && (e.key === 'ArrowDown' || (e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu')) { e.preventDefault(); openMenu(e.currentTarget) }
  }
  return (
    <div className={`tb-item tone-${tone}${menu && command ? ' has-menu' : ''}${low ? ' tb-low' : ''}`}>
      <button
        className="tb-btn"
        aria-label={label}
        title={tip(command, label)}
        disabled={idle}
        aria-haspopup={!command && menu ? 'menu' : undefined}
        aria-expanded={!command && menu ? cm.isOpen : undefined}
        // like a desktop toolbar: a click acts on the document without taking its focus
        onMouseDown={keepFocus}
        onClick={e => { if (idle) return; if (command) { runCommand(command); returnFocusFromChrome('.toolbar') } else openMenu(e.currentTarget) }}
        onContextMenu={menu ? e => { e.preventDefault(); openMenu(e.currentTarget) } : undefined}
        onKeyDown={onKeyDown}
      >
        <span className="tb-icon"><Icon size={38} strokeWidth={1.9} aria-hidden /></span>
        <span className="tb-label">{label}</span>
      </button>
      {menu && command && (
        // the ▾ beside the icon: a mouse target for the menu (the keyboard opens it with ArrowDown)
        <button className="tb-caret" tabIndex={-1} aria-label={`${label} menu`} aria-haspopup="menu" aria-expanded={cm.isOpen}
          onMouseDown={keepFocus} onClick={e => openMenu(e.currentTarget.parentElement!.querySelector<HTMLElement>('.tb-btn') ?? e.currentTarget)}>
          <Caret />
        </button>
      )}
      {cm.element}
    </div>
  )
}

const Sep = ({ low }: { low?: boolean }) => <span className={`tb-sep${low ? ' tb-low' : ''}`} role="separator" aria-orientation="vertical" />

export const Toolbar = memo(function Toolbar() {
  const cs = useCommandState(TOOL_COMMANDS)
  const hasHistory = useApp(s => s.recentRubrics.length > 0)
  const ref = useRef<HTMLDivElement>(null)
  /** Roving tab stop (ARIA toolbar): the button last focused, else the first enabled one; arrows move between buttons. */
  const current = useRef<string | null>(null)
  const buttons = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('.tb-btn') ?? [])].filter(b => !b.disabled && b.getClientRects().length > 0)
  useLayoutEffect(() => {
    const all = buttons()
    const stop = all.find(b => b.getAttribute('aria-label') === current.current) ?? all[0]
    for (const b of ref.current?.querySelectorAll<HTMLButtonElement>('.tb-btn') ?? []) b.tabIndex = b === stop ? 0 : -1
  })
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (!t.classList.contains('tb-btn') || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    const all = buttons()
    const at = all.indexOf(t as HTMLButtonElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length
    e.preventDefault()
    all[next]?.focus()
  }
  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (!t.classList.contains('tb-btn')) return
    current.current = t.getAttribute('aria-label')
    for (const b of ref.current?.querySelectorAll<HTMLButtonElement>('.tb-btn') ?? []) b.tabIndex = b === t ? 0 : -1
  }
  const b = (command: string, label: string, icon: ToolIcon, tone: Tone, menu?: () => MenuItem[], low?: boolean) => (
    <BigButton command={command} state={cs[command]} label={label} icon={icon} tone={tone} menu={menu} low={low} />
  )
  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar" ref={ref} onKeyDown={onKeyDown} onFocus={onFocus}>
      {b('repertory.toc', 'Repertories', BookMarked, 'blue')}
      {b('mm.open', 'References', BookOpen, 'teal')}
      {b('patients.open', 'Patients', Users, 'orange', () => PATIENTS_MENU)}
      {b('remedy.open', 'Remedies', FlaskConical, 'amber')}
      {b('families.open', 'Families', TreeDeciduous, 'green')}
      {b('bookmarks.open', 'Bookmarks', Bookmark, 'grey', undefined, true)}
      <Sep />
      <BigButton label="Search area" icon={ScanSearch} tone="blue" menu={scopeMenu} low />
      {b('search.open', 'Search', Search, 'grey', () => SEARCH_MENU)}
      <div className="tb-find"><QuickFind /></div>
      <Sep />
      {b('analysis.open', 'Analysis', ChartColumnBig, 'amber', analysisMenu)}
      {/* RadarOpus's Maps, Shop / Gifts and Screenshot are left out: the remaining groups close up, each still
          framed by its separator as in RadarOpus */}
      <Sep />
      {b('shell.back', 'Back', ArrowLeft, 'blue')}
      {b('shell.forward', 'Forward', ArrowRight, 'blue')}
      <BigButton label="History" icon={HistoryIcon} tone="slate" menu={historyItems} disabled={!hasHistory} />
      <Sep low />
      {b('view.zoomIn', 'Zoom in', ZoomIn, 'ink', undefined, true)}
      {b('view.zoomOut', 'Zoom out', ZoomOut, 'ink', undefined, true)}
      <Sep low />
      {b('file.print', 'Print', Printer, 'grey', () => PRINT_MENU, true)}
    </div>
  )
})

