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

/** A plain-text remedy token in a Relationship list: capitalised, letters only, up to three words ("Lyc", "Nat mur"). */
const PLAIN_TOKEN = /^[A-Z][A-Za-z]*(?:[ .-]+[A-Za-z]+){0,2}$/
/** Relationship labels and connectives that are never remedies. */
const PLAIN_STOP = /^(compare|complementary|antidotes?|antidoted|incompatible|inimical|compatible|follows?|followed|also|dose|see|in|after|before|especially)\b/i

/**
 * Split a run of text into list tokens; resolved ones become remedy links.
 *  - emphasised runs (`em`): every capitalised token of up to four words is tried; lower-case
 *    tokens ("*calcarea*") only resolve by exact abbreviation, name or known shorthand.
 *  - plain runs (Relationship sections only): only list items, i.e. tokens next to a ";",
 *    between two ",", or standing alone, only capitalised names ("Lyc; Sep; Sars; Puls"), and only remedies
 *    with a monograph, so prose ("Cystitis, Lupus") stays text.
 */
function linkList(content: string, resolver: RemedyResolver, selfId: number | null, out: Span[], em = true, mode: { relationship?: boolean; loose?: boolean } = {}) {
  const parts = content.split(LIST_SPLIT)
  const tokens = parts.filter((_, k) => k % 2 === 0 && parts[k].trim()).length
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]
    if (!part) continue
    if (k % 2 === 1) { push(out, part, em); continue }
    const m = /^(\s*)(.*?)(\.?\s*)$/s.exec(part)!
    const [, lead, core, trail] = m
    let r: ReturnType<RemedyResolver['resolve']> = null
    if (em) {
      if (/^[A-Z]/.test(core) && core.split(' ').length <= 4) r = resolver.resolve(core)
      else if (/^[a-z][a-z .-]*$/.test(core) && core.split(' ').length <= 2) r = resolver.resolveExact(core)
    } else if (PLAIN_TOKEN.test(core) && !PLAIN_STOP.test(core)) {
      // plain words are prose as often as remedies: only list items naming a remedy of the book
      const before = parts[k - 1] ?? '', after = parts[k + 1] ?? ''
      const listed = before.includes(';') || after.includes(';') || (before.includes(',') && after.includes(',')) || tokens === 1
      const hit = listed ? resolver.resolve(core) : null
      if (hit && resolver.hasMonograph(hit.id)) r = hit
    }
    if (lead) push(out, lead, em)
    if (r && r.id !== selfId) out.push({ text: core, em, remedyId: r.id })
    // Relationship sections: a remedy name inside a phrase ("*after Calcar*"), and in an
    // Incompatible/Inimical clause even in plain prose ("Sulphur should not be given after")
    else if (!r && em && mode.relationship && AFTER.test(core)) linkAfter(core, resolver, selfId, out)
    else if (!r && !em && mode.loose && /\s/.test(core.trim())) linkWords(core, resolver, selfId, out, em)
    else push(out, core, em)
    if (trail) push(out, trail, em)
  }
}

/** A sequence phrase in a Relationship section: "*after Calcar*", "*before Sulph*". */
const AFTER = /^((?:acts |follows |given |especially )?(?:well )?(?:after|before|with|than|then|follows|followed by)\s+)([A-Z][A-Za-z]*(?: [a-z]+)?)$/

function linkAfter(core: string, resolver: RemedyResolver, selfId: number | null, out: Span[]) {
  const [, lead, name] = AFTER.exec(core)!
  const hit = resolver.resolve(name)
  push(out, lead, true)
  if (hit && hit.id !== selfId) out.push({ text: name, em: true, remedyId: hit.id })
  else push(out, name, true)
}

/** Link each capitalised word of a phrase that names a remedy of the book; the rest stays text. */
function linkWords(core: string, resolver: RemedyResolver, selfId: number | null, out: Span[], em: boolean) {
  for (const w of core.split(/(\s+)/)) {
    const hit = /^[A-Z][a-z]{2,}$/.test(w) && !PLAIN_STOP.test(w) ? resolver.resolve(w) : null
    if (hit && hit.id !== selfId && resolver.hasMonograph(hit.id)) out.push({ text: w, em, remedyId: hit.id })
    else push(out, w, em)
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
 * set (Boericke's "Relationship" section), in every emphasised list and in plain remedy lists.
 */
export function parseParagraph(text: string, resolver: RemedyResolver | null, opts: { relationship?: boolean; selfId?: number | null; inimical?: boolean } = {}): Span[] {
  const out: Span[] = []
  let depth = 0
  let i = 0
  const n = text.length
  // Incompatible/Inimical clauses: [bodyAt, end) ranges where plain capitalised names are linked too
  const inimical: [number, number][] = opts.inimical ? [[0, n]] : []
  if (resolver && opts.relationship) {
    const marks = [...text.matchAll(LABEL)]
    marks.forEach((m, k) => {
      if (kindOf(m[2]) === 'Inimical') inimical.push([m.index + m[0].length, k + 1 < marks.length ? marks[k + 1].index + marks[k + 1][1].length : n])
    })
  }
  const looseAt = (at: number) => inimical.some(([a, b]) => at >= a && at < b)
  /** Plain text: in a Relationship section, its remedy lists are linked line by line. */
  const pushPlain = (plain: string, at: number) => {
    if (!resolver || !opts.relationship) { push(out, plain, false); return }
    let pos = at
    for (const line of plain.split(/(\n)/)) {
      if (line) linkList(line, resolver, opts.selfId ?? null, out, false, { loose: looseAt(pos) })
      pos += line.length
    }
  }
  while (i < n) {
    const star = text.indexOf('*', i)
    const end = star < 0 ? -1 : text.indexOf('*', star + 1)
    if (star < 0 || end < 0) {
      pushPlain(text.slice(i), i)
      break
    }
    const plain = text.slice(i, star)
    for (const ch of plain) { if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1) }
    pushPlain(plain, i)
    const content = text.slice(star + 1, end)
    if (resolver && (depth > 0 || opts.relationship)) linkList(content, resolver, opts.selfId ?? null, out, true, { relationship: opts.relationship })
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

const LABEL = /(^|\n|[.;)]\s+)((?:[A-Z][a-z]+(?: [a-z]+){0,3} )?(?:[Cc]omplementary(?: to)?|[Cc]ompare(?: also| especially| its constituents)?|Also compare|Antidotes?(?: to| for [a-z ]+)?|Antidoted by|Incompatible|Inimical|Compatible|Follows? well(?: after)?|Followed(?: well)? by)(?: in [a-z ,]{1,30})?)\s*(?:\.?:|;|\.(?=\s+\*?[A-Z])|(?=\s*\*))/g

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
    const kind = kindOf(m.label)
    // a list label (Complementary, Inimical, Compatible, Follows well) covers its remedy list only: a
    // later sentence of prose ("Nux intensifies action.") is a separate remark, kept as a Compare note.
    // Antidote and Compare clauses are prose by nature ("Nux antidotes the nausea…") and stay whole.
    const [list, rest] = kind === 'Compare' || kind === 'Antidotes' ? [body, ''] : splitListClause(body, resolver, selfId)
    out.push(clause(kind, contextOf(m.label), list, resolver, selfId))
    if (rest) out.push(clause('Compare', '', rest, resolver, selfId))
  }
  return out
}

function clause(kind: RelationKind, context: string, text: string, resolver: RemedyResolver, selfId: number | null): Relation {
  const spans = parseParagraph(text, resolver, { relationship: true, selfId, inimical: kind === 'Inimical' })
  const remedies = [...new Set(spans.flatMap(s => s.remedyId !== undefined ? [s.remedyId] : []))]
  return { kind, context, text, remedies }
}

/** Balance emphasis markers of a piece cut out of a longer text. */
function closeStars(s: string, open: boolean): string {
  const odd = ((s.match(/\*/g)?.length ?? 0) % 2) === 1
  return !odd ? s : open ? `*${s}` : `${s}*`
}

/**
 * Split a labelled clause into its remedy list and any trailing prose: the list ends before the
 * first later sentence with two or more ordinary words outside remedy names and parentheses.
 */
export function splitListClause(body: string, resolver: RemedyResolver, selfId: number | null): [string, string] {
  const breaks = [...body.matchAll(/\.\s+(?=\*?[A-Z])/g)].map(b => b.index + 1)
  for (let k = 0; k < breaks.length; k++) {
    const at = breaks[k]
    const sentence = body.slice(at, breaks[k + 1] ?? body.length).replace(/\*/g, '').replace(/\([^)]*\)/g, ' ')
    const spans = parseParagraph(sentence, resolver, { relationship: true, selfId, inimical: true })
    const prose = spans.filter(s => s.remedyId === undefined).map(s => s.text).join(' ')
      .split(/[^A-Za-z]+/).filter(w => w.length > 2 && /^[a-z]/.test(w) && !/^(also|and|the|for|with)$/.test(w))
    if (prose.length >= 2) {
      const list = closeStars(body.slice(0, at).trim(), false)
      const rest = closeStars(body.slice(at).trim(), true)
      return [list, rest]
    }
  }
  return [body, '']
}

/** Group relation clauses by kind, remedies de-duplicated, in RELATION_ORDER; kinds naming no remedy are left out. */
export function groupRelations(rel: Relation[]): { kind: RelationKind; remedies: number[]; clauses: Relation[] }[] {
  return RELATION_ORDER.flatMap(kind => {
    const clauses = rel.filter(r => r.kind === kind)
    const remedies = [...new Set(clauses.flatMap(c => c.remedies))]
    // a clause without remedy names ("Antidote: Paralysis from lead-poisoning") is not a group
    if (!remedies.length) return []
    return [{ kind, remedies, clauses }]
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
  const it = citationSteps(entries, resolver)
  let r = it.next()
  while (!r.done) r = it.next()
  return r.value
}

/**
 * The citation scan as a generator that yields after each monograph, so it can run in time
 * slices (`buildCitationsChunked`) instead of one long task over the whole book.
 */
export function* citationSteps(entries: Iterable<MateriaMedicaEntry>, resolver: RemedyResolver): Generator<void, Map<number, Citation[]>, void> {
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
    yield
  }
  return out
}

/** `buildCitations` in slices of ~`sliceMs`, yielding to the event loop between them. */
export function buildCitationsChunked(entries: Iterable<MateriaMedicaEntry>, resolver: RemedyResolver, sliceMs = 8): Promise<Map<number, Citation[]>> {
  const it = citationSteps(entries, resolver)
  return new Promise((resolve, reject) => {
    const slice = () => {
      try {
        const end = performance.now() + sliceMs
        for (;;) {
          const r = it.next()
          if (r.done) { resolve(r.value); return }
          if (performance.now() >= end) break
        }
        setTimeout(slice, 0)
      } catch (e) { reject(e) }
    }
    slice()
  })
}

/** Title-case a Boericke heading ("NATRIUM MURIATICUM" → "Natrium Muriaticum"). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-(/])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
}
