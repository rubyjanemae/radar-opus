import { memo, useLayoutEffect, useRef } from 'react'
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ComponentType } from 'react'
import { displayKey, formatKeys, getCommand, runCommand } from '../commands/registry'
import { useCommandState } from '../commands/useCommandState'
import type { CommandState } from '../commands/useCommandState'
import { useChrome } from './chrome'
import { useApp } from '../state/store'
import type { TocView } from './chrome'
import { QuickFind } from '../features/search/QuickFind'
import { useContextMenu } from '../ui/Menu'
import type { MenuItem } from '../ui/Menu'
import { DEFAULT_METHOD_ITEM, LIMIT_FAMILY_ITEM } from './menus'
import { activeSearchTab, openSearch } from '../features/search/ops'
import { keepFocus, returnFocusFromChrome } from './focus'
import { AnalysisIcon } from '../features/analysis/AnalysisIcon'
import { BackArrowIcon, BookmarksIcon, CameraIcon, ForwardArrowIcon, HistoryBookIcon, MapsIcon, PatientsIcon, PrintIcon, RepertoriesIcon, ZoomGlassIcon } from './toolbarIcons'

type Tone = 'blue' | 'teal' | 'orange' | 'amber' | 'green' | 'grey' | 'ink' | 'slate'
type ToolIcon = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>

/**
 * References: an open book in light teal line art, unfilled, its pages resting on a curved base
 * (RadarOpus draws it as an outline, unlike the solid Repertories book; original glyph).
 */
function ReferencesIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth * 0.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="tb-refs-book" style={{ fill: 'none' }}>
        <path d="M12 6.2C10.2 4.7 7.2 4 3 4.3v12.4c4.2-.3 7.2.4 9 1.9 1.8-1.5 4.8-2.2 9-1.9V4.3C16.8 4 13.8 4.7 12 6.2z" />
        <path d="M12 6.2v12.4" />
        <path d="M3 17.2v1.7c4.2-.3 7.2.4 9 1.9 1.8-1.5 4.8-2.2 9-1.9v-1.7" />
      </g>
    </svg>
  )
}

/**
 * Remedies: a grey glass jar with a screw lid and two orange-yellow globules resting at its bottom
 * (RadarOpus's remedy jar; original glyph).
 */
function RemediesIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth * 0.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect className="tb-jar-lid" x="7.6" y="1.8" width="8.8" height="3.2" rx=".8" />
      <path className="tb-jar-glass" d="M8.4 5v1.4c-1.6.8-2.6 2-2.6 3.6v9.6c0 1.2.9 2.2 2.2 2.2h8c1.3 0 2.2-1 2.2-2.2V10c0-1.6-1-2.8-2.6-3.6V5" />
      <circle className="tb-jar-pill" cx="10.4" cy="18.2" r="2.3" />
      <circle className="tb-jar-pill" cx="14" cy="16.6" r="2.3" />
    </svg>
  )
}

/**
 * Families: a wide, scalloped green canopy (eight lobes, a little darker underneath) in front of which
 * a thick tan trunk forks into two branches and flares at its foot (RadarOpus's family tree; original glyph).
 */
function FamiliesIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth * 0.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="tb-tree-crown" d="M5.2 9.2A2.8 2.8 0 0 1 8.5 5.2A3.7 3.7 0 0 1 15.5 5.2A2.8 2.8 0 0 1 18.8 9.2A2.6 2.6 0 0 1 19.1 14.2A2.4 2.4 0 0 1 15.5 16.8A3.6 3.6 0 0 1 8.5 16.8A2.4 2.4 0 0 1 4.9 14.2A2.6 2.6 0 0 1 5.2 9.2z" />
      <path className="tb-tree-shade" d="M5.4 13.4c2.2 1.5 4.4 2.1 6.6 2.1s4.4-.6 6.6-2.1c.6.4 1 .9 1.1 1.5a2.4 2.4 0 0 1-4.2 1.9 3.6 3.6 0 0 1-7 0 2.4 2.4 0 0 1-4.2-1.9c.1-.6.5-1.1 1.1-1.5z" />
      <path className="tb-tree-trunk" d="M8.2 21.9c1.6-.9 2.3-2.1 2.3-4.2l-.3-3.6c-.3-.9-.7-1.5-1.2-2.1l2.6-.7c.3 1.2.7 2.2 1.2 2.9.5-.6.9-1.3 1.1-2.1l2.4.6c-.4 1.5-1.2 2.7-1.9 3.6l-.1 2.3c.1 1.6.8 2.5 2 3.3z" />
    </svg>
  )
}

const ZoomIn = ({ size }: { size?: number }) => <ZoomGlassIcon size={size} plus />
const ZoomOut = ({ size }: { size?: number }) => <ZoomGlassIcon size={size} plus={false} />
/**
 * Search area: a grey dashed square framing a small blue magnifier with a pale lens (RadarOpus's
 * "search area" picture; original glyph).
 */
function SearchAreaIcon({ size = 24 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect className="tb-area-frame" x="2.5" y="2.5" width="19" height="19" strokeWidth="1.6" strokeDasharray="2.2 1.8" strokeLinecap="butt" />
      <circle className="tb-area-lens" cx="10.6" cy="10.6" r="3.9" strokeWidth="1.9" />
      <path className="tb-area-handle" d="m13.5 13.5 3.9 3.9" strokeWidth="2.6" />
    </svg>
  )
}

/**
 * Search: a glass magnifier, grey rim around a pale lens, on a gold handle running down to the right
 * (RadarOpus's Search picture; original glyph).
 */
function SearchGlassIcon({ size = 24 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="tb-glass-handle" d="m15.6 15.6 6 6" strokeWidth="3.6" />
      <circle className="tb-glass-lens" cx="9.8" cy="9.8" r="7.4" strokeWidth="1.9" />
    </svg>
  )
}

/** Every command the toolbar shows: their enabled flags drive its re-renders. */
const TOOL_COMMANDS = [
  'toc.repertories', 'toc.references', 'patients.open', 'toc.remedies', 'toc.families', 'toc.bookmarks',
  'search.open', 'analysis.open', 'maps.open', 'shell.back', 'shell.forward', 'view.history', 'view.zoomIn', 'view.zoomOut', 'file.print', 'tools.screenshot',
] as const

/** RadarOpus's tooltip wording per button (its menu item for the same action); the shortcut follows it. */
const TIPS: Record<string, string> = {
  'toc.repertories': 'Open list of repertories', 'toc.references': 'Open list of references', 'toc.remedies': 'List of remedies',
  'toc.families': 'List of families', 'toc.bookmarks': 'Bookmarks',
  'repertory.toc': 'Open list of repertories', 'mm.open': 'Open list of references', 'patients.open': 'Open list of patients',
  'remedy.open': 'List of remedies', 'families.open': 'List of families', 'bookmarks.open': 'Bookmarks', 'search.open': 'Search',
  'analysis.open': 'Show current analysis with symptoms and remedies', 'maps.open': 'Maps', 'shell.back': 'Go back', 'shell.forward': 'Go forward', 'view.history': 'History',
  'view.zoomIn': 'Zoom in', 'view.zoomOut': 'Zoom out', 'file.print': 'Print', 'tools.screenshot': 'Take a screenshot',
}
// RadarOpus's Print menu is the File menu's trio; Print there prints the active document (analysis, monograph),
// else the page. The case report stays after a rule: it has no other place in the menus.
const PRINT_MENU: MenuItem[] = [
  { label: 'Print', commands: ['analysis.print', 'mm.print', 'file.print'], keys: 'Mod+P' },
  { command: 'file.printPreview', label: 'Print preview' },
  { command: 'file.printSetup', label: 'Print setup' },
  { type: 'separator' },
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
  LIMIT_FAMILY_ITEM,
  { command: 'analysis.save', label: 'Save current analysis' },
  { command: 'analysis.recall', label: 'Recall an existing analysis' },
  { command: 'clipboard.clearAll', label: 'Start a new analysis (clear all clipboards)' },
  { command: 'analysis.email', label: 'Send current analysis by email' },
  { command: 'analysis.old', label: 'Show old analysis with old Remedy' },
  DEFAULT_METHOD_ITEM,
]

/** Maps ▾: the maps the current analysis can be shown on (features/maps). */
const MAPS_MENU: MenuItem[] = [
  { command: 'maps.periodic', label: 'Periodic table' },
  { command: 'maps.kingdoms', label: 'Kingdoms' },
]

const tip = (command: string | undefined, fallback: string) => {
  const cmd = command ? getCommand(command) : undefined
  const key = displayKey(cmd?.keys)
  return `${(command && TIPS[command]) ?? fallback}${key ? ` (${formatKeys(key)})` : ''}`
}

/** The small solid ▾ at a menu button's icon (original glyph). */
// RadarOpus's menu triangle: small (6 x 3.5 pt) and dark grey rather than black
const Caret = () => <svg width="6" height="3.5" viewBox="0 0 6 3.5" aria-hidden="true"><path d="M0 0h6L3 3.5z" fill="currentColor" opacity=".8" /></svg>

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
  /** A toggle's state (RadarOpus draws a checked toggle on a rounded rose fill). */
  pressed?: boolean
  /** Class of the button's ▾ menu (its own look). */
  menuClass?: string
  /** Never drawn dimmed (RadarOpus's Back / Forward): a click with nothing to step to does nothing. */
  live?: boolean
}

/** A RadarOpus toolbar button: a large icon over its label, optionally with a ▾ menu. */
function BigButton({ label, icon: Icon, tone, command, state, menu, disabled, low, pressed, menuClass, live }: BigButtonProps) {
  const cm = useContextMenu()
  const idle = live ? false : disabled ?? (command ? !state?.enabled : false)
  const openMenu = (el: HTMLElement) => { if (menu) cm.openAt(el, menu(), menuClass) }
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
        aria-pressed={pressed}
        aria-haspopup={!command && menu ? 'menu' : undefined}
        aria-expanded={!command && menu ? cm.isOpen : undefined}
        // like a desktop toolbar: a click acts on the document without taking its focus
        onMouseDown={keepFocus}
        onClick={e => {
          if (idle) return
          if (command) { if (state?.enabled !== false) runCommand(command); returnFocusFromChrome('.toolbar') } else openMenu(e.currentTarget)
        }}
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
  // RadarOpus checks only the button of the list the table of contents shows (Patients at start), none
  // while it is hidden
  const tocView = useChrome(s => s.tocView)
  const tocOpen = useApp(s => s.layout.showTree)
  const shows = (v: TocView) => tocOpen && tocView === v
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
  const b = (command: string, label: string, icon: ToolIcon, tone: Tone, menu?: () => MenuItem[], low?: boolean, pressed?: boolean) => (
    <BigButton command={command} state={cs[command]} label={label} icon={icon} tone={tone} menu={menu} low={low} pressed={pressed} />
  )
  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar" ref={ref} onKeyDown={onKeyDown} onFocus={onFocus}>
      {b('toc.repertories', 'Repertories', RepertoriesIcon, 'blue', undefined, false, shows('repertories'))}
      {b('toc.references', 'References', ReferencesIcon, 'teal', undefined, false, shows('references'))}
      {b('patients.open', 'Patients', PatientsIcon, 'orange', () => PATIENTS_MENU, false, shows('patients'))}
      {b('toc.remedies', 'Remedies', RemediesIcon, 'grey', undefined, false, shows('remedies'))}
      {b('toc.families', 'Families', FamiliesIcon, 'green', undefined, false, shows('families'))}
      {b('toc.bookmarks', 'Bookmarks', BookmarksIcon, 'grey', undefined, true, shows('bookmarks'))}
      <Sep />
      <BigButton label="Search area" icon={SearchAreaIcon} tone="blue" menu={scopeMenu} low />
      {b('search.open', 'Search', SearchGlassIcon, 'grey', () => SEARCH_MENU)}
      <div className="tb-find"><QuickFind /></div>
      <Sep />
      {b('analysis.open', 'Analysis', AnalysisIcon, 'amber', analysisMenu)}
      {b('maps.open', 'Maps', MapsIcon, 'green', () => MAPS_MENU)}
      <Sep />
      {/* RadarOpus draws Back and Forward in full colour even with nothing to step to; a click then does nothing */}
      <BigButton command="shell.back" state={cs['shell.back']} label="Back" icon={BackArrowIcon} tone="blue" live />
      <BigButton command="shell.forward" state={cs['shell.forward']} label="Forward" icon={ForwardArrowIcon} tone="blue" live />
      {/* always available, as in RadarOpus: its popup (shell/HistoryPopup) starts with "Clear History" */}
      <BigButton command="view.history" state={cs['view.history']} label="History" icon={HistoryBookIcon} tone="slate" />
      <Sep low />
      {/* the room of RadarOpus's Shop and Gifts group (its own store, left out here), so the groups after it
          stand where RadarOpus draws them */}
      <span className="tb-gap tb-low" aria-hidden="true" />
      <Sep low />
      {b('view.zoomIn', 'Zoom in', ZoomIn, 'ink', undefined, true)}
      {b('view.zoomOut', 'Zoom out', ZoomOut, 'ink', undefined, true)}
      <Sep low />
      {b('file.print', 'Print', PrintIcon, 'grey', () => PRINT_MENU, true)}
      {b('tools.screenshot', 'Screenshot', CameraIcon, 'grey', undefined, true)}
    </div>
  )
})

