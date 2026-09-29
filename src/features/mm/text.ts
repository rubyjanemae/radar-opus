import type { MateriaMedicaEntry } from '../../data/types'
import type { RemedyResolver } from './resolve'

/**
 * Materia medica text model. Boericke text marks emphasis with *asterisks* and cites other
 * remedies inside emphasis, usually in parentheses: "Night-sweat (*China*)", "(*Berb; Ocim*)".
 * We turn a paragraph into flat spans: plain text, emphasised text, and remedy links.
 */

export interface Span { text: string; em: boolean; remedyId?: number }

/** Separators between remedy names inside an emphasised list. */
const LIST_SPLIT = /(\s*[;,]\s*|\.\s+(?=[A-Z])|\s+(?:and|or|also)\s+)/

/** Split an emphasised remedy list into tokens; resolved ones become links. */
function linkList(content: string, resolver: RemedyResolver, selfId: number | null, out: Span[]) {
  const parts = content.split(LIST_SPLIT)
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]
    if (!part) continue
    if (k % 2 === 1) { push(out, part, true); continue }
    const m = /^(\s*)(.*?)(\.?\s*)$/.exec(part)!
    const [, lead, core, trail] = m
    const r = /^[A-Z]/.test(core) && core.split(' ').length <= 4 ? resolver.resolve(core) : null
    if (lead) push(out, lead, true)
    if (r && r.id !== selfId) out.push({ text: core, em: true, remedyId: r.id })
    else push(out, core, true)
    if (trail) push(out, trail, true)
  }
}

function push(out: Span[], text: string, em: boolean) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.em === em && last.remedyId === undefined) last.text += text
  else out.push({ text, em })
}

/**
 * Parse one paragraph. Remedy links are made inside parentheses and, when `relationship` is
 * set (Boericke's "Relationship" section), in every emphasised list.
 */
export function parseParagraph(text: string, resolver: RemedyResolver | null, opts: { relationship?: boolean; selfId?: number | null } = {}): Span[] {
  const out: Span[] = []
  let depth = 0
  let i = 0
  const n = text.length
  while (i < n) {
    const star = text.indexOf('*', i)
    const end = star < 0 ? -1 : text.indexOf('*', star + 1)
    if (star < 0 || end < 0) {
      push(out, text.slice(i), false)
      break
    }
    const plain = text.slice(i, star)
    for (const ch of plain) { if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1) }
    push(out, plain, false)
    const content = text.slice(star + 1, end)
    if (resolver && (depth > 0 || opts.relationship)) linkList(content, resolver, opts.selfId ?? null, out)
    else push(out, content, true)
    i = end + 1
  }
  return out
}

/** Text without emphasis markers (for search and snippets). */
export function plainText(text: string): string {
  return text.replace(/\*/g, '')
}

// ───────────────────────── relationships ─────────────────────────

export type RelationKind = 'Complementary' | 'Antidotes' | 'Compare' | 'Inimical' | 'Follows well' | 'Compatible'

export const RELATION_ORDER: RelationKind[] = ['Complementary', 'Follows well', 'Compatible', 'Antidotes', 'Inimical', 'Compare']

export interface Relation {
  kind: RelationKind
  /** Qualifier around the label, e.g. "in albuminuria". */
  context: string
  /** Source text of this clause (with *emphasis*). */
  text: string
  remedies: number[]
}

const LABEL = /(^|\n|[.;)]\s+)((?:[A-Z][a-z]+(?: [a-z]+){0,3} )?(?:[Cc]omplementary(?: to)?|[Cc]ompare(?: also| especially| its constituents)?|Also compare|Antidotes?(?: to| for [a-z ]+)?|Antidoted by|Incompatible|Inimical|Compatible|Follows? well(?: after)?|Followed(?: well)? by)(?: in [a-z ,]{1,30})?)\s*(?::|(?=\s*\*))/g

function kindOf(label: string): RelationKind {
  const l = label.toLowerCase()
  if (l.includes('complementary')) return 'Complementary'
  if (l.includes('antidot')) return 'Antidotes'
  if (l.includes('incompatible') || l.includes('inimical')) return 'Inimical'
  if (l.includes('compatible')) return 'Compatible'
  if (l.includes('follow')) return 'Follows well'
  return 'Compare'
}

function contextOf(label: string): string {
  return label
    .replace(/\b(complementary( to)?|compare( also| especially)?|also compare|antidotes?( to)?|antidoted by|incompatible|inimical|compatible|follows? well( after)?|followed( well)? by)\b/i, '')
    .replace(/\s+/g, ' ').trim()
}

/** Split a Boericke Relationship section into labelled clauses with their remedy links. */
export function parseRelationships(text: string, resolver: RemedyResolver, selfId: number | null): Relation[] {
  const marks: { at: number; bodyAt: number; label: string }[] = []
  for (const m of text.matchAll(LABEL)) {
    const at = m.index + m[1].length
    marks.push({ at, bodyAt: m.index + m[0].length, label: m[2] })
  }
  const out: Relation[] = []
  if (!marks.length || marks[0].at > 0) {
    const head = text.slice(0, marks[0]?.at ?? text.length).trim()
    if (head) marks.unshift({ at: 0, bodyAt: 0, label: 'Compare' })
  }
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k]
    const body = text.slice(m.bodyAt, marks[k + 1]?.at ?? text.length).trim()
    if (!body) continue
    const spans = parseParagraph(body, resolver, { relationship: true, selfId })
    const remedies = [...new Set(spans.flatMap(s => s.remedyId !== undefined ? [s.remedyId] : []))]
    out.push({ kind: kindOf(m.label), context: contextOf(m.label), text: body, remedies })
  }
  return out
}

/** Group relation clauses by kind, remedies de-duplicated, in RELATION_ORDER. */
export function groupRelations(rel: Relation[]): { kind: RelationKind; remedies: number[]; clauses: Relation[] }[] {
  return RELATION_ORDER.flatMap(kind => {
    const clauses = rel.filter(r => r.kind === kind)
    if (!clauses.length) return []
    return [{ kind, remedies: [...new Set(clauses.flatMap(c => c.remedies))], clauses }]
  })
}

// ───────────────────────── full-text search ─────────────────────────

export interface MMDoc {
  remedyId: number
  /** -1 = introduction */
  section: number
  heading: string
  /** lower-cased plain text */
  lower: string
  plain: string
}

export function buildDocs(entries: Iterable<MateriaMedicaEntry>): MMDoc[] {
  const docs: MMDoc[] = []
  for (const e of entries) {
    const intro = plainText(e.intro)
    if (intro) docs.push({ remedyId: e.remedyId, section: -1, heading: 'Introduction', plain: intro, lower: intro.toLowerCase() })
    e.sections.forEach((s, i) => {
      const plain = plainText(s.text)
      docs.push({ remedyId: e.remedyId, section: i, heading: s.heading, plain, lower: plain.toLowerCase() })
    })
  }
  return docs
}

/** Query terms: quoted phrases stay together; words shorter than 2 letters are dropped. */
export function queryTerms(q: string): string[] {
  const out: string[] = []
  for (const m of q.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const t = (m[1] ?? m[2]).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').trim()
    if (t.length >= 2 && !out.includes(t)) out.push(t)
  }
  return out
}

export interface MMHit { remedyId: number; section: number; heading: string; count: number; snippet: HighlightPart[] }
export interface HighlightPart { text: string; hit: boolean }

/** Every term must occur in the same section (AND). Hits are in book order. */
export function searchDocs(docs: MMDoc[], q: string, limit = 5000): { hits: MMHit[]; truncated: boolean; terms: string[] } {
  const terms = queryTerms(q)
  const hits: MMHit[] = []
  if (!terms.length) return { hits, truncated: false, terms }
  for (const d of docs) {
    let ok = true
    for (const t of terms) if (!d.lower.includes(t)) { ok = false; break }
    if (!ok) continue
    if (hits.length >= limit) return { hits, truncated: true, terms }
    hits.push({ remedyId: d.remedyId, section: d.section, heading: d.heading, count: countOccurrences(d.lower, terms), snippet: snippet(d.plain, d.lower, terms) })
  }
  return { hits, truncated: false, terms }
}

function countOccurrences(lower: string, terms: string[]): number {
  let n = 0
  for (const t of terms) for (let i = lower.indexOf(t); i >= 0; i = lower.indexOf(t, i + t.length)) n++
  return n
}

/** A window of text around the first term, with every term highlighted. */
export function snippet(plain: string, lower: string, terms: string[], before = 50, after = 110): HighlightPart[] {
  const first = Math.min(...terms.map(t => { const i = lower.indexOf(t); return i < 0 ? Infinity : i }))
  const at = Number.isFinite(first) ? first : 0
  let s = Math.max(0, at - before)
  let e = Math.min(plain.length, at + after)
  if (s > 0) { const sp = plain.indexOf(' ', s); if (sp >= 0 && sp < at) s = sp + 1 }
  if (e < plain.length) { const sp = plain.lastIndexOf(' ', e); if (sp > at) e = sp }
  const parts = highlight(plain.slice(s, e), terms)
  if (s > 0) parts.unshift({ text: '…', hit: false })
  if (e < plain.length) parts.push({ text: '…', hit: false })
  return parts
}

/** Split text into highlighted/plain parts (case-insensitive, overlapping terms merged). */
export function highlight(text: string, terms: string[]): HighlightPart[] {
  if (!terms.length || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const ranges: [number, number][] = []
  for (const t of terms) for (let i = lower.indexOf(t); i >= 0; i = lower.indexOf(t, i + t.length)) ranges.push([i, i + t.length])
  if (!ranges.length) return [{ text, hit: false }]
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  const out: HighlightPart[] = []
  let pos = 0
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: text.slice(pos, a), hit: false })
    out.push({ text: text.slice(a, b), hit: true })
    pos = b
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false })
  return out
}

// ───────────────────────── citations ─────────────────────────

export interface Citation { remedyId: number; section: number; heading: string }

/**
 * Reverse index: for each remedy, the monograph sections that cite it
 * (remedy links in parentheses and Relationship sections).
 */
export function buildCitations(entries: Iterable<MateriaMedicaEntry>, resolver: RemedyResolver): Map<number, Citation[]> {
  const out = new Map<number, Citation[]>()
  const add = (target: number, c: Citation) => {
    let list = out.get(target)
    if (!list) out.set(target, (list = []))
    const last = list[list.length - 1]
    if (!last || last.remedyId !== c.remedyId || last.section !== c.section) list.push(c)
  }
  for (const e of entries) {
    const paras: [number, string, string][] = [[-1, 'Introduction', e.intro], ...e.sections.map((s, i): [number, string, string] => [i, s.heading, s.text])]
    for (const [section, heading, text] of paras) {
      const spans = parseParagraph(text, resolver, { relationship: /relation/i.test(heading), selfId: e.remedyId })
      for (const s of spans) if (s.remedyId !== undefined) add(s.remedyId, { remedyId: e.remedyId, section, heading })
    }
  }
  return out
}

/** Title-case a Boericke heading ("NATRIUM MURIATICUM" → "Natrium Muriaticum"). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-(/])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
}
