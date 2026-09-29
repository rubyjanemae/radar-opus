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
}

const commands = new Map<string, Command>()
const listeners = new Set<() => void>()

export function registerCommands(list: Command[]) {
  for (const c of list) commands.set(c.id, c)
  listeners.forEach(fn => fn())
}

export function getCommand(id: string): Command | undefined { return commands.get(id) }
export function allCommands(): Command[] { return [...commands.values()] }
export function onCommandsChanged(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

export function isEnabled(c: Command) { return c.enabled ? c.enabled() : true }

export function runCommand(id: string): boolean {
  const c = commands.get(id)
  if (!c || !isEnabled(c)) return false
  void c.run()
  return true
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** Normalise a KeyboardEvent to "Mod+Shift+Alt+Key". */
export function eventToKeys(e: KeyboardEvent): string {
  const parts: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod')
  if (isMac && e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let k = e.key
  if (k === ' ') k = 'Space'
  else if (k.length === 1) k = k.toUpperCase()
  if (!['Control', 'Meta', 'Shift', 'Alt'].includes(k)) parts.push(k)
  return parts.join('+')
}

/** Human label for a shortcut, platform aware. */
export function formatKeys(keys: string): string {
  return keys.split('+').map(p => {
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
    for (const c of commands.values()) {
      if (!c.keys?.includes(combo)) continue
      if (editing && !c.allowInInput) continue
      if (c.scope && !(e.target instanceof Element && e.target.closest(c.scope))) continue
      if (!isEnabled(c)) continue
      e.preventDefault()
      void c.run()
      return
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
