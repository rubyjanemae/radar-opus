import { actions } from '../state/store'

/**
 * Every user action lives here once. Menus, the command palette, context menus
 * and keyboard shortcuts all read from this registry, so nothing is wired twice.
 *
 * Features register their commands at module load with `registerCommands`.
 */

export interface Command {
  id: string
  title: string
  /** Menu / palette group, e.g. "File", "Repertory". */
  category: string
  /** Shortcut in "Mod+Shift+K" form; Mod = Ctrl (Cmd on macOS). Several allowed. */
  keys?: string[]
  run: () => void | Promise<void>
  /** When false the command is disabled (menus grey it out, shortcuts ignore it). */
  enabled?: () => boolean
  /** Checked state for toggles. */
  checked?: () => boolean
  /** Shortcut still fires while typing in an input. */
  allowInInput?: boolean
  /** CSS selector: the shortcut only fires when the key event target is inside a matching element (menus and the palette still run it). */
  scope?: string
  /** Hidden from the palette (e.g. arrow-key handlers). */
  hidden?: boolean
  keywords?: string
  /** Human label for `scope` in the shortcuts reference ("in the clipboard list"). */
  scopeLabel?: string
}

const commands = new Map<string, Command>()
const listeners = new Set<() => void>()

export function registerCommands(list: Command[]) {
  for (const c of list) commands.set(c.id, c.keys ? { ...c, keys: dedupe(c.keys.map(normaliseChord)) } : c)
  listeners.forEach(fn => fn())
}

function dedupe(keys: string[]) { return [...new Set(keys)] }

export function getCommand(id: string): Command | undefined { return commands.get(id) }
export function allCommands(): Command[] { return [...commands.values()] }
export function onCommandsChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

export function isEnabled(c: Command) { return c.enabled ? c.enabled() : true }

/**
 * Run a command's handler, reporting a thrown error or a rejected promise as an error toast
 * instead of letting it escape as an unhandled rejection.
 */
export function execute(c: Command): Promise<void> {
  return Promise.resolve()
    .then(() => c.run())
    .catch((e: unknown) => {
      console.error(`Command ${c.id} failed`, e)
      actions.toast(`${c.title.replace(/…$/, '')} failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    })
}

export function runCommand(id: string): boolean {
  const c = commands.get(id)
  if (!c || !isEnabled(c)) return false
  void execute(c)
  return true
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Split "Mod+Shift+K" into its parts, keeping a "+" key ("Mod++" is Mod and "+"). */
export function splitChord(chord: string): string[] {
  if (chord === '+') return ['+']
  return chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+')
}

/** A single printable character that is not a letter or digit ("+", "?", ":"): typing it may need Shift. */
const isPunct = (k: string) => k.length === 1 && !/[\p{L}\p{N}\s]/u.test(k)

/**
 * Canonical chord spelling. Shift is dropped in front of punctuation because the character itself
 * already says whether Shift was needed (and that depends on the keyboard layout): "Mod+Shift++" and
 * "Shift+?" become "Mod++" and "?".
 */
export function normaliseChord(chord: string): string {
  const parts = splitChord(chord)
  const key = parts[parts.length - 1]
  if (isPunct(key)) return parts.filter((p, i) => !(p === 'Shift' && i < parts.length - 1)).join('+')
  return chord
}

/** Normalise a KeyboardEvent to "Mod+Shift+Alt+Key". */
export function eventToKeys(e: KeyboardEvent): string {
  const parts: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod')
  if (isMac && e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  let k = e.key
  if (k === ' ') k = 'Space'
  else if (k.length === 1) k = k.toUpperCase()
  // shifted punctuation ("+" on Shift+=, "?" on Shift+/) is matched by the character alone
  if (e.shiftKey && !isPunct(k)) parts.push('Shift')
  if (!['Control', 'Meta', 'Shift', 'Alt'].includes(k)) parts.push(k)
  return parts.join('+')
}

/**
 * Chords the browser keeps for itself (tab and window management): a page never receives them,
 * so they are never shown as a command's shortcut. Mod+Shift+P is Firefox's private window.
 */
export const BROWSER_RESERVED: ReadonlySet<string> = new Set([
  'Mod+W', 'Mod+Shift+W', 'Mod+T', 'Mod+Shift+T', 'Mod+N', 'Mod+Shift+N', 'Mod+Q',
  'Mod+Tab', 'Mod+Shift+Tab', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Mod+PageUp', 'Mod+PageDown', 'Mod+Shift+PageUp', 'Mod+Shift+PageDown',
  'Mod+1', 'Mod+2', 'Mod+3', 'Mod+4', 'Mod+5', 'Mod+6', 'Mod+7', 'Mod+8', 'Mod+9',
  'Mod+Shift+P',
])

export const isReserved = (chord: string) => BROWSER_RESERVED.has(normaliseChord(chord))

/** The shortcut to show for a command in menus, tooltips and the palette: the first one the browser lets through. */
export function displayKey(keys: readonly string[] | undefined): string | undefined {
  return keys?.find(k => !isReserved(k))
}

/** All of a command's shortcuts that actually reach the page. */
export function usableKeys(keys: readonly string[] | undefined): string[] {
  return (keys ?? []).filter(k => !isReserved(k))
}

/** Human label for a shortcut, platform aware. */
export function formatKeys(keys: string): string {
  return splitChord(keys).map(p => {
    if (p === 'Mod') return isMac ? '⌘' : 'Ctrl'
    if (p === 'Shift') return isMac ? '⇧' : 'Shift'
    if (p === 'Alt') return isMac ? '⌥' : 'Alt'
    if (p === 'ArrowUp') return '↑'
    if (p === 'ArrowDown') return '↓'
    if (p === 'ArrowLeft') return '←'
    if (p === 'ArrowRight') return '→'
    if (p === 'Enter') return '↵'
    if (p === 'Escape') return 'Esc'
    if (p === 'Backspace') return '⌫'
    if (p === 'Delete') return 'Del'
    return p
  }).join(isMac ? '' : '+')
}

function inEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Global shortcut dispatcher; install once. */
export function installKeybindings(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    const combo = eventToKeys(e)
    const editing = inEditable(e.target)
    // Scoped commands (bound to a view) win over global ones with the same key when focus is inside their scope.
    for (const scoped of [true, false]) {
      for (const c of commands.values()) {
        if (!!c.scope !== scoped || !c.keys?.includes(combo)) continue
        if (editing && !c.allowInInput) continue
        if (c.scope && !(e.target instanceof Element && e.target.closest(c.scope))) continue
        if (!isEnabled(c)) continue
        e.preventDefault()
        void execute(c)
        return
      }
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
