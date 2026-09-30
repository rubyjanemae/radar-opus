import type { Weight } from '../../engine/model'

/** Options for taking a rubric into a clipboard (the `+` mini-language and the F6 dialog). */
export interface TakeOptions {
  weight: Weight
  /** 1-based clipboard number, null = active clipboard. */
  clipboard: number | null
  eliminatory: boolean
  exclusive: boolean
  causal: boolean
  group: string | null
  /** Take the rubric together with all its sub-rubrics as one combined symptom. */
  subRubrics: boolean
  /**
   * Whether `weight` was asked for. A rubric already on the clipboard keeps its intensity unless one
   * was given: a bare `+`, Insert or Ctrl+Enter never downgrades it. Unset: given when not 1 (so
   * "take with intensity 3" is explicit, a plain take is not).
   */
  weightSet?: boolean
  /**
   * The options describe the whole symptom (the F6 dialog): on a rubric already taken, qualifications
   * and group not set are cleared. Otherwise (the mini-language) only what was given changes.
   */
  replace?: boolean
}

export const DEFAULT_TAKE: TakeOptions = { weight: 1, clipboard: null, eliminatory: false, exclusive: false, causal: false, group: null, subRubrics: false }

/** Whether a take asked for its intensity (see TakeOptions.weightSet). */
export const weightGiven = (o: TakeOptions) => o.weightSet ?? o.weight !== 1

export type TakeParse = { ok: true; options: TakeOptions } | { ok: false; error: string }

/**
 * Parse the RadarOpus take mini-language.
 *   `+` / `=`            weight 1 into the active clipboard
 *   `+2`                 weight 2 (0–4)
 *   `+1>3`               weight 1 into clipboard 3 (1–12)
 *   `+!`                 eliminative
 *   `+x`                 excluding
 *   `+c`                 causal
 *   `+a`                 group a (any letter except c, s, x)
 *   `/s`                 with sub-rubrics (as in `+1/s`)
 * Tokens after the optional weight and clipboard can appear in any order: `+2>1!a/s`.
 */
export function parseTake(input: string): TakeParse {
  const s = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return { ok: false, error: 'Empty command' }
  if (s[0] !== '+' && s[0] !== '=') return { ok: false, error: 'Start with + or =' }
  const o: TakeOptions = { ...DEFAULT_TAKE, weightSet: false }
  let i = 1
  if (i < s.length && /[0-9]/.test(s[i])) {
    const w = Number(s[i])
    if (w > 4) return { ok: false, error: `Intensity ${w} is out of range (0–4)` }
    o.weight = w as Weight
    o.weightSet = true
    i++
    if (i < s.length && /[0-9]/.test(s[i])) return { ok: false, error: 'Intensity is a single digit (0–4)' }
  }
  if (s[i] === '>') {
    i++
    const m = /^[0-9]{1,2}/.exec(s.slice(i))
    if (!m) return { ok: false, error: 'Clipboard number expected after >' }
    const n = Number(m[0])
    if (n < 1 || n > 12) return { ok: false, error: `Clipboard ${n} is out of range (1–12)` }
    o.clipboard = n
    i += m[0].length
  }
  while (i < s.length) {
    const ch = s[i]
    if (ch === '/') {
      const f = s[i + 1]
      if (f === 's') { o.subRubrics = true; i += 2; continue }
      if (f === 'x') return { ok: false, error: 'This repertory has no cross-references to take' }
      return { ok: false, error: `Unknown option /${f ?? ''}` }
    }
    if (ch === '!') { if (o.exclusive) return { ok: false, error: 'A symptom cannot be both eliminative and excluding' }; o.eliminatory = true; i++; continue }
    if (ch === 'x') { if (o.eliminatory) return { ok: false, error: 'A symptom cannot be both eliminative and excluding' }; o.exclusive = true; i++; continue }
    if (ch === 'c') { o.causal = true; i++; continue }
    if (/[a-z]/.test(ch) && ch !== 's') {
      if (o.group && o.group !== ch) return { ok: false, error: 'Only one group letter' }
      o.group = ch; i++; continue
    }
    return { ok: false, error: `Unexpected “${ch}”` }
  }
  return { ok: true, options: o }
}

/** Human summary of take options, e.g. "×2 · eliminative · group a". */
export function describeTake(o: TakeOptions, clipboardName?: string): string {
  const parts = [`×${o.weight}`]
  if (o.eliminatory) parts.push('eliminative')
  if (o.exclusive) parts.push('excluding')
  if (o.causal) parts.push('causal')
  if (o.group) parts.push(`group ${o.group}`)
  if (o.subRubrics) parts.push('with sub-rubrics')
  if (clipboardName) parts.push(`→ ${clipboardName}`)
  else if (o.clipboard) parts.push(`→ clipboard ${o.clipboard}`)
  return parts.join(' · ')
}

/** Book-style remedy label: grade 1 lower case, 2–3 capitalised, 4 upper case. */
export function bookAbbrev(abbrev: string, grade: number): string {
  const a = abbrev.endsWith('.') ? abbrev : `${abbrev}.`
  if (grade <= 1) return a.toLowerCase()
  if (grade >= 4) return a.toUpperCase()
  return a[0].toUpperCase() + a.slice(1)
}

/** Plain-text rendering of a rubric with its remedies (grades 3–4 upper case, 2 capitalised, 1 lower case). */
export function rubricPlainText(path: string, remedies: { abbrev: string; grade: number }[]): string {
  if (!remedies.length) return path
  return `${path}: ${remedies.map(r => bookAbbrev(r.abbrev, r.grade === 3 ? 4 : r.grade)).join(' ')}`
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** HTML rendering with print-tradition typography, for rich paste into word processors. */
export function rubricHtml(path: string, remedies: { abbrev: string; grade: number }[]): string {
  const rem = remedies.map(r => {
    const t = esc(bookAbbrev(r.abbrev, r.grade))
    if (r.grade === 2) return `<i style="color:#1c55b8">${t}</i>`
    if (r.grade === 3) return `<b style="color:#c2261b">${t}</b>`
    if (r.grade >= 4) return `<b style="color:#8a1911">${t}</b>`
    return t
  }).join(' ')
  return `<p><b>${esc(path)}</b>${remedies.length ? `: ${rem}` : ''}</p>`
}

/**
 * Rank chapters for the type-to-jump chooser: prefix matches first, then word prefix, then
 * substring. Within a tier, items with a lower `recency` rank (recently used chapters) come first.
 */
export function matchChapters<T extends { name: string }>(items: T[], query: string, recency?: (item: T) => number): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  const scored: { item: T; score: number; i: number }[] = []
  items.forEach((item, i) => {
    const n = item.name.toLowerCase()
    let score = -1
    if (n.startsWith(q)) score = 0
    else if (n.split(/[\s,&-]+/).some(w => w.startsWith(q))) score = 1
    else if (n.includes(q)) score = 2
    if (score >= 0) scored.push({ item, score, i })
  })
  const rank = (x: T) => { const r = recency?.(x) ?? -1; return r < 0 ? Infinity : r }
  return scored.sort((a, b) => a.score - b.score || (rank(a.item) - rank(b.item) || 0) || a.i - b.i).map(x => x.item)
}
