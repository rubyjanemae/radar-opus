import type { RubricRef } from '../../data/types'
import type { Symptom } from '../../engine/model'

/** Pure helpers for the clipboard panel (selection, ordering, sorting, drag payloads). */

export type SortMode = 'homeopathic' | 'intensity' | 'alphabetical' | 'size'

export const SORT_LABELS: Record<SortMode, string> = {
  homeopathic: 'Homeopathic order (chapters)',
  intensity: 'Intensity, strongest first',
  alphabetical: 'Alphabetical',
  size: 'Rubric size, smallest first',
}

/** What sorting needs to know about a rubric; supplied by the catalog in the app, by fixtures in tests. */
export interface RubricFacts {
  /** Order of the repertory in the catalog. */
  repertoryOrder: number
  /** Chapter position within its repertory. */
  chapter: number
  /** Book-order index. */
  index: number
  /** Full path used for alphabetical sort. */
  path: string
  size: number
}

/** Returns symptom ids in sorted order. Stable; unknown rubrics sort last. */
export function sortSymptomIds(symptoms: Symptom[], mode: SortMode, facts: (ref: RubricRef) => RubricFacts | null): string[] {
  const keyed = symptoms.map((s, pos) => ({ s, pos, f: facts(s.rubrics[0]) }))
  const cmp = (a: typeof keyed[number], b: typeof keyed[number]): number => {
    if (!a.f || !b.f) return (a.f ? -1 : b.f ? 1 : 0) || a.pos - b.pos
    switch (mode) {
      case 'homeopathic':
        return a.f.chapter - b.f.chapter || a.f.repertoryOrder - b.f.repertoryOrder || a.f.index - b.f.index || a.pos - b.pos
      case 'intensity':
        return b.s.weight - a.s.weight || a.pos - b.pos
      case 'alphabetical':
        return a.f.path.localeCompare(b.f.path, undefined, { sensitivity: 'base' }) || a.pos - b.pos
      case 'size':
        return a.f.size - b.f.size || a.pos - b.pos
    }
  }
  return keyed.sort(cmp).map(k => k.s.id)
}

/** Move a set of ids so they sit before `beforeId` (null = end), keeping their relative order. */
export function moveIdsBefore(order: string[], ids: string[], beforeId: string | null): string[] {
  const moving = new Set(ids)
  const picked = order.filter(id => moving.has(id))
  const rest = order.filter(id => !moving.has(id))
  let at = beforeId === null ? rest.length : rest.indexOf(beforeId)
  if (at < 0) {
    // target is itself being moved: insert where the first moved item following it would be
    const idx = order.indexOf(beforeId as string)
    at = rest.findIndex(id => order.indexOf(id) > idx)
    if (at < 0) at = rest.length
  }
  return [...rest.slice(0, at), ...picked, ...rest.slice(at)]
}

/** Shift each selected id up (-1) or down (+1) by one place, as a block where they touch. */
export function moveIdsBy(order: string[], ids: string[], delta: -1 | 1): string[] {
  const sel = new Set(ids)
  const out = [...order]
  if (delta < 0) {
    for (let i = 1; i < out.length; i++) if (sel.has(out[i]) && !sel.has(out[i - 1])) [out[i - 1], out[i]] = [out[i], out[i - 1]]
  } else {
    for (let i = out.length - 2; i >= 0; i--) if (sel.has(out[i]) && !sel.has(out[i + 1])) [out[i], out[i + 1]] = [out[i + 1], out[i]]
  }
  return out
}

/** Click selection semantics: plain = single, toggle = Ctrl/Cmd, range = Shift from anchor. */
export function clickSelect(order: string[], current: string[], anchor: string | null, id: string, mode: 'single' | 'toggle' | 'range'): { selected: string[]; anchor: string } {
  if (mode === 'toggle') {
    const has = current.includes(id)
    return { selected: has ? current.filter(x => x !== id) : [...current, id], anchor: id }
  }
  if (mode === 'range' && anchor && order.includes(anchor)) {
    const a = order.indexOf(anchor)
    const b = order.indexOf(id)
    const [lo, hi] = a < b ? [a, b] : [b, a]
    return { selected: order.slice(lo, hi + 1), anchor }
  }
  return { selected: [id], anchor: id }
}

/** Remedy count of a (possibly combined) symptom given each rubric's remedy ids. */
export function combinedSize(parts: (Iterable<number> | null)[], mode: 'union' | 'intersection'): number {
  const sets = parts.filter((p): p is Iterable<number> => !!p).map(p => new Set(p))
  if (!sets.length) return 0
  if (mode === 'union') {
    const all = new Set<number>()
    for (const s of sets) for (const r of s) all.add(r)
    return all.size
  }
  const [first, ...rest] = sets
  let n = 0
  for (const r of first) if (rest.every(s => s.has(r))) n++
  return n
}

export const SYMPTOM_MIME = 'application/x-radar-symptoms'
export const RUBRIC_MIME = 'application/x-rubric-ref'

export interface SymptomDragPayload { clipboardId: string; ids: string[] }

/** Accepts a JSON array, a single ref, or refs separated by whitespace, commas or newlines. */
export function parseRubricDrop(data: string): RubricRef[] {
  const t = data.trim()
  if (!t) return []
  let items: unknown[] = []
  if (t.startsWith('[') || t.startsWith('{') || t.startsWith('"')) {
    try {
      const v = JSON.parse(t) as unknown
      items = Array.isArray(v) ? v : typeof v === 'object' && v && Array.isArray((v as { refs?: unknown }).refs) ? (v as { refs: unknown[] }).refs : [v]
    } catch { items = t.split(/[\s,]+/) }
  } else items = t.split(/[\s,]+/)
  const out: RubricRef[] = []
  for (const x of items) if (typeof x === 'string' && /^[\w.-]+:\d+$/.test(x) && !out.includes(x)) out.push(x)
  return out
}

export function clipboardStats(symptoms: Symptom[]) {
  return {
    total: symptoms.length,
    active: symptoms.filter(s => s.weight > 0).length,
    eliminative: symptoms.filter(s => s.eliminatory).length,
    excluding: symptoms.filter(s => s.exclusive).length,
  }
}

/** Next weight when the intensity control is clicked (cycles 1→2→3→4→0→1). */
export function cycleWeight(w: number, dir: 1 | -1 = 1): 0 | 1 | 2 | 3 | 4 {
  return (((w + dir) % 5) + 5) % 5 as 0 | 1 | 2 | 3 | 4
}
