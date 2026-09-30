import { useEffect, useSyncExternalStore } from 'react'
import type { Repertory } from '../../data/repertory'
import type { Grade } from '../../data/types'

/**
 * Remedy → rubric index for one repertory, cached per repertory. Stored as CSR arrays so a
 * remedy's rubrics are a contiguous slice in book order: `rubrics[start[id] .. start[id+1])`.
 *
 * Built by a counting sort in two tight passes over the raw entry columns (~1M entries for
 * publicum, a few ms) and, after a repertory loads, ahead of time in an idle callback
 * (`warmRemedyIndex`), so views read it with `remedyIndexIfReady` / `useRemedyIndex` and never
 * build it during render.
 */
export class RemedyIndex {
  readonly rep: Repertory
  private readonly start: Int32Array
  /** Rubric ids, grouped by remedy, ascending within a remedy. */
  readonly rubrics: Int32Array
  /** Grade (1..4) of each entry of `rubrics`. */
  readonly grades: Uint8Array
  private readonly statsCache = new Map<number, RemedyStats>()
  /** Highest grade used in this repertory (Kent: 3, some books: 4). */
  readonly maxGrade: Grade

  /** Build synchronously (tests, and callers that need the index right now). */
  constructor(rep: Repertory, built?: BuiltArrays) {
    this.rep = rep
    let b = built
    if (!b) { const it = buildSteps(rep); let r = it.next(); while (!r.done) r = it.next(); b = r.value }
    this.start = b.start
    this.rubrics = b.rubrics
    this.grades = b.grades
    this.maxGrade = b.maxGrade
  }

  /** The slice of `rubrics` / `grades` that belongs to a remedy: [from, to). */
  range(remedyId: number): [number, number] {
    if (remedyId < 0 || remedyId + 1 >= this.start.length) return [0, 0]
    return [this.start[remedyId], this.start[remedyId + 1]]
  }

  rubricCount(remedyId: number): number {
    if (remedyId < 0 || remedyId + 1 >= this.start.length) return 0
    return this.start[remedyId + 1] - this.start[remedyId]
  }

  /** Rubrics of a remedy in book order with their grades. */
  entries(remedyId: number): { rubric: number; grade: Grade }[] {
    const out: { rubric: number; grade: Grade }[] = []
    if (remedyId < 0 || remedyId + 1 >= this.start.length) return out
    for (let p = this.start[remedyId]; p < this.start[remedyId + 1]; p++) out.push({ rubric: this.rubrics[p], grade: this.grades[p] as Grade })
    return out
  }

  stats(remedyId: number): RemedyStats {
    let s = this.statsCache.get(remedyId)
    if (!s) { s = computeStats(this, remedyId); this.statsCache.set(remedyId, s) }
    return s
  }
}

interface BuiltArrays { start: Int32Array; rubrics: Int32Array; grades: Uint8Array; maxGrade: Grade }

/** Entries processed between deadline checks while building. */
const STEP = 32768

/**
 * The counting sort, as a generator that yields every STEP entries so an async build can give
 * the main thread back between slices (see `buildRemedyIndexChunked`).
 */
function* buildSteps(rep: Repertory): Generator<void, BuiltArrays, void> {
  const { offsets, data } = rep.rawEntries()
  const total = offsets[rep.size] ?? data.length
  let maxId = 0, maxCode = 0
  for (let k0 = 0; k0 < total; k0 += STEP) {
    for (let k = k0, e = Math.min(total, k0 + STEP); k < e; k++) {
      const v = data[k], id = v >> 2
      if (id > maxId) maxId = id
      if ((v & 3) > maxCode) maxCode = v & 3
    }
    yield
  }
  const count = new Int32Array(maxId + 2)
  for (let k0 = 0; k0 < total; k0 += STEP) {
    for (let k = k0, e = Math.min(total, k0 + STEP); k < e; k++) count[(data[k] >> 2) + 1]++
    yield
  }
  for (let id = 1; id < count.length; id++) count[id] += count[id - 1]
  const rubrics = new Int32Array(total), grades = new Uint8Array(total)
  const fill = count.slice(0, maxId + 1)
  let done = 0
  for (let i = 0, n = rep.size; i < n; i++) {
    for (let k = offsets[i], e = offsets[i + 1]; k < e; k++) {
      const v = data[k], p = fill[v >> 2]++
      rubrics[p] = i
      grades[p] = (v & 3) + 1
    }
    done += offsets[i + 1] - offsets[i]
    if (done >= STEP) { done = 0; yield }
  }
  return { start: count, rubrics, grades, maxGrade: (maxCode + 1) as Grade }
}

/** Time slice per task while building in the background (ms). */
const SLICE_MS = 8

/**
 * Build a remedy index in slices of ~8 ms, yielding to the event loop between them, so building
 * the index of a ~1M-entry repertory never blocks input or paint with a long task.
 */
export function buildRemedyIndexChunked(rep: Repertory): Promise<RemedyIndex> {
  const it = buildSteps(rep)
  return new Promise((resolve, reject) => {
    const slice = () => {
      try {
        const end = performance.now() + SLICE_MS
        for (;;) {
          const r = it.next()
          if (r.done) { resolve(new RemedyIndex(rep, r.value)); return }
          if (performance.now() >= end) break
        }
        setTimeout(slice, 0)
      } catch (e) { reject(e) }
    }
    slice()
  })
}

export interface ChapterShare {
  /** Chapter number (index into rep.chapters). */
  chapter: number
  root: number
  name: string
  count: number
  /** Rubrics in the chapter. */
  size: number
}

export interface KeynoteRubric { rubric: number; grade: Grade; size: number }

export interface RemedyStats {
  rubricCount: number
  /** grades[g - 1] = rubrics at grade g */
  grades: [number, number, number, number]
  /** Chapters by count, descending. */
  chapters: ChapterShare[]
  /**
   * Characteristic rubrics: the remedy at its top grades (grade ≥ min(3, maxGrade)), smallest
   * rubrics first, then deepest. Chapter roots are skipped.
   */
  keynotes: KeynoteRubric[]
  keynoteMinGrade: Grade
}

function computeStats(idx: RemedyIndex, remedyId: number): RemedyStats {
  const rep = idx.rep
  const grades: [number, number, number, number] = [0, 0, 0, 0]
  const perChapter = new Map<number, number>()
  const entries = idx.entries(remedyId)
  const minGrade = Math.min(3, idx.maxGrade) as Grade
  const keynotes: KeynoteRubric[] = []
  for (const { rubric, grade } of entries) {
    grades[grade - 1]++
    const ch = rep.chapterOf(rubric)
    perChapter.set(ch, (perChapter.get(ch) ?? 0) + 1)
    if (grade >= minGrade && rep.parent(rubric) >= 0) keynotes.push({ rubric, grade, size: rep.remedyCount(rubric) })
  }
  keynotes.sort((a, b) => a.size - b.size || b.grade - a.grade || rep.depth(b.rubric) - rep.depth(a.rubric) || a.rubric - b.rubric)
  const chapters: ChapterShare[] = [...perChapter].map(([chapter, count]) => {
    const root = rep.chapters[chapter]
    return { chapter, root, name: rep.text(root), count, size: rep.subtreeEndOf(root) - root }
  }).sort((a, b) => b.count - a.count || a.chapter - b.chapter)
  return { rubricCount: entries.length, grades, chapters, keynotes, keynoteMinGrade: minGrade }
}

const cache = new WeakMap<Repertory, RemedyIndex>()
const pending = new WeakMap<Repertory, Promise<RemedyIndex>>()
/** Chunked builds in flight (an urgent request joins an idle build that has already started). */
const building = new WeakMap<Repertory, Promise<RemedyIndex>>()
const listeners = new Set<() => void>()
let version = 0

/** The (cached) remedy index of a repertory, built now if needed. Prefer `remedyIndexIfReady` in render. */
export function remedyIndex(rep: Repertory): RemedyIndex {
  return cache.get(rep) ?? publish(rep, new RemedyIndex(rep))
}

function publish(rep: Repertory, idx: RemedyIndex): RemedyIndex {
  const hit = cache.get(rep)
  if (hit) return hit
  cache.set(rep, idx)
  version++
  for (const fn of listeners) fn()
  return idx
}

/** The remedy index if it has been built, else null (never builds). */
export function remedyIndexIfReady(rep: Repertory): RemedyIndex | null {
  return cache.get(rep) ?? null
}

type IdleGlobal = { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }

/**
 * Build the index off the critical path, in ~8 ms slices: starting in an idle callback, or on the
 * next task when `urgent` (someone is waiting for it). Resolves with the index; repeated calls share one build.
 */
export function warmRemedyIndex(rep: Repertory, urgent = false): Promise<RemedyIndex> {
  const hit = cache.get(rep)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(rep)
  if (p && !urgent) return p
  // both paths build in slices (never one long task); `urgent` only skips waiting for idle time
  const run = new Promise<RemedyIndex>((resolve, reject) => {
    const go = () => {
      const hit = cache.get(rep)
      if (hit) { resolve(hit); return }
      let b = building.get(rep)
      if (!b) {
        b = buildRemedyIndexChunked(rep).then(idx => publish(rep, idx))
        building.set(rep, b)
        void b.finally(() => building.delete(rep)).catch(() => {})
      }
      b.then(resolve, reject)
    }
    const idle = (globalThis as IdleGlobal).requestIdleCallback
    if (!urgent && idle) idle(go, { timeout: 3000 })
    else setTimeout(go, 0)
  })
  p = p ? Promise.race([p, run]) : run
  pending.set(rep, p)
  void p.finally(() => pending.delete(rep)).catch(() => {})
  return p
}

/** Subscribe to "some remedy index finished building" (for useSyncExternalStore). */
export function onRemedyIndexBuilt(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function remedyIndexVersion() { return version }

/**
 * The remedy index of `rep` for a component: null until built (the build is started, off the
 * render path, when missing); re-renders when it is ready.
 */
export function useRemedyIndex(rep: Repertory | null | undefined): RemedyIndex | null {
  useSyncExternalStore(onRemedyIndexBuilt, remedyIndexVersion, remedyIndexVersion)
  const ready = rep ? cache.get(rep) ?? null : null
  useEffect(() => { if (rep && !ready) void warmRemedyIndex(rep, true).catch(() => {}) }, [rep, ready])
  return ready
}
