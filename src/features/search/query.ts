import { fold, tokenize } from './text'

/**
 * Search query language (RadarOpus simple search, extended):
 *   dream cats          AND (a space or `&`)
 *   fear | anxiety      OR
 *   dream cats ! dogs   NOT (`!`, also `-word`)
 *   "worse at night"    phrase, words in this order
 *   fear*  *phobia  *xyz*  wildcards (prefix, suffix, infix)
 *   (a | b) c           grouping
 *   #lach  #lach:3      rubrics containing a remedy (optionally with minimum grade)
 * Words without a wildcard also match their inflected branches (fear → fears, feared).
 */

export type Wildcard = 'none' | 'prefix' | 'suffix' | 'infix'

export type Term =
  | { kind: 'word'; text: string; wildcard: Wildcard }
  | { kind: 'phrase'; words: string[]; prefixLast: boolean }
  | { kind: 'remedy'; token: string; minGrade: number }

export type Node =
  | { t: 'term'; term: Term }
  | { t: 'and'; items: Node[] }
  | { t: 'or'; items: Node[] }
  | { t: 'not'; item: Node }

export interface ParsedQuery {
  ast: Node | null
  /** Terms that are not negated: used for ranking and highlighting. */
  positive: Term[]
  error: string | null
}

type Tok = { k: 'word'; v: string } | { k: 'phrase'; v: string } | { k: 'op'; v: '&' | '|' | '!' | '(' | ')' }

function lex(q: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < q.length) {
    const c = q[i]
    if (/\s/.test(c) || c === ',' || c === ';') { i++; continue }
    if (c === '"' || c === '“' || c === '”') {
      let j = i + 1
      while (j < q.length && !'"“”'.includes(q[j])) j++
      out.push({ k: 'phrase', v: q.slice(i + 1, j) })
      i = j + 1
      continue
    }
    if (c === '&' || c === '|' || c === '!' || c === '(' || c === ')') { out.push({ k: 'op', v: c }); i++; continue }
    if (c === '+' && (i === 0 || /\s/.test(q[i - 1]))) { out.push({ k: 'op', v: '&' }); i++; continue }
    if (c === '-' && (i === 0 || /\s|\(/.test(q[i - 1])) && i + 1 < q.length && !/\s/.test(q[i + 1])) { out.push({ k: 'op', v: '!' }); i++; continue }
    let j = i
    while (j < q.length && !/\s/.test(q[j]) && !'&|!()"“”,;'.includes(q[j])) j++
    const w = q.slice(i, j)
    if (w === 'AND') out.push({ k: 'op', v: '&' })
    else if (w === 'OR') out.push({ k: 'op', v: '|' })
    else if (w === 'NOT') out.push({ k: 'op', v: '!' })
    else out.push({ k: 'word', v: w })
    i = j
  }
  return out
}

/** Turn one raw word into one or more term nodes ("absent-minded" becomes a phrase). */
function wordNode(raw: string, isLast: boolean, prefixLast: boolean): Node | null {
  if (raw.startsWith('#') && raw.length > 1) {
    const m = /^#([^:]+)(?::([1-4]))?$/.exec(raw)
    if (m) return { t: 'term', term: { kind: 'remedy', token: fold(m[1]), minGrade: m[2] ? Number(m[2]) : 1 } }
  }
  const lead = raw.startsWith('*')
  const trail = raw.endsWith('*')
  const words = tokenize(raw)
  if (!words.length) return null
  if (words.length > 1) return { t: 'term', term: { kind: 'phrase', words, prefixLast: (trail || (isLast && prefixLast)) } }
  const text = words[0]
  let wildcard: Wildcard = lead && trail ? 'infix' : lead ? 'suffix' : trail ? 'prefix' : 'none'
  if (wildcard === 'none' && isLast && prefixLast) wildcard = 'prefix'
  return { t: 'term', term: { kind: 'word', text, wildcard } }
}

/**
 * Parse a query. With `prefixLast`, the final word is treated as a prefix (type-ahead),
 * unless the query ends with a space.
 */
export function parseQuery(q: string, opts: { prefixLast?: boolean } = {}): ParsedQuery {
  const toks = lex(q)
  const prefixLast = !!opts.prefixLast && !/\s$/.test(q)
  let lastWord = -1
  toks.forEach((t, i) => { if (t.k === 'word' || t.k === 'phrase') lastWord = i })
  let pos = 0
  let error: string | null = null

  const peek = () => toks[pos]
  const parseOr = (): Node | null => {
    const items: Node[] = []
    const first = parseAnd()
    if (first) items.push(first)
    while (peek()?.k === 'op' && peek()!.v === '|') {
      pos++
      const n = parseAnd()
      if (n) items.push(n)
      else if (!error) error = 'Nothing after “|”'
    }
    return items.length === 0 ? null : items.length === 1 ? items[0] : { t: 'or', items }
  }
  const parseAnd = (): Node | null => {
    const items: Node[] = []
    for (;;) {
      const t = peek()
      if (!t) break
      if (t.k === 'op' && (t.v === '|' || t.v === ')')) break
      if (t.k === 'op' && t.v === '&') { pos++; continue }
      const n = parseUnary()
      if (n) items.push(n)
    }
    return items.length === 0 ? null : items.length === 1 ? items[0] : { t: 'and', items }
  }
  const parseUnary = (): Node | null => {
    const t = toks[pos++]
    if (t.k === 'op' && t.v === '!') {
      if (!peek() || (peek()!.k === 'op' && peek()!.v !== '(' && peek()!.v !== '!')) { if (!error) error = 'Nothing after “!”'; return null }
      const n = parseUnary()
      return n ? { t: 'not', item: n } : null
    }
    if (t.k === 'op' && t.v === '(') {
      const n = parseOr()
      if (peek()?.k === 'op' && peek()!.v === ')') pos++
      else if (!error) error = 'Missing “)”'
      return n
    }
    if (t.k === 'op') { if (!error) error = `Unexpected “${t.v}”`; return null }
    if (t.k === 'phrase') {
      const words = tokenize(t.v)
      if (!words.length) return null
      return { t: 'term', term: { kind: 'phrase', words, prefixLast: pos - 1 === lastWord && prefixLast } }
    }
    return wordNode(t.v, pos - 1 === lastWord, prefixLast)
  }

  let ast = parseOr()
  while (pos < toks.length) {
    // stray ")" – skip and keep going
    if (!error) error = 'Unbalanced “)”'
    pos++
    const more = parseOr()
    if (more) ast = ast ? { t: 'and', items: [ast, more] } : more
  }

  const positive: Term[] = []
  const collect = (n: Node, neg: boolean) => {
    if (n.t === 'term') { if (!neg) positive.push(n.term) }
    else if (n.t === 'not') collect(n.item, !neg)
    else n.items.forEach(x => collect(x, neg))
  }
  if (ast) collect(ast, false)
  if (ast && !positive.length && !error) error = 'A query needs at least one word that is not negated'
  return { ast, positive, error }
}

/** Does a normalised token match a word term? 0 = no, 2 = exact, 1 = branch / wildcard. */
export function wordTermMatch(term: Extract<Term, { kind: 'word' }>, token: string, branch: (root: string, w: string) => 0 | 1 | 2): 0 | 1 | 2 {
  switch (term.wildcard) {
    case 'none': return branch(term.text, token)
    case 'prefix': return token === term.text ? 2 : token.startsWith(term.text) ? 1 : 0
    case 'suffix': return token === term.text ? 2 : token.endsWith(term.text) ? 1 : 0
    case 'infix': return token === term.text ? 2 : token.includes(term.text) ? 1 : 0
  }
}

/** Human description of a query for the syntax helper / tooltips. */
export function describeQuery(p: ParsedQuery): string {
  const d = (n: Node): string => {
    if (n.t === 'term') {
      const t = n.term
      if (t.kind === 'word') return t.wildcard === 'none' ? t.text : t.wildcard === 'prefix' ? `${t.text}…` : t.wildcard === 'suffix' ? `…${t.text}` : `…${t.text}…`
      if (t.kind === 'phrase') return `“${t.words.join(' ')}${t.prefixLast ? '…' : ''}”`
      return `remedy ${t.token}${t.minGrade > 1 ? ` (grade ≥ ${t.minGrade})` : ''}`
    }
    if (n.t === 'not') return `not ${d(n.item)}`
    const inner = n.items.map(x => (x.t === 'and' || x.t === 'or') ? `(${d(x)})` : d(x))
    return inner.join(n.t === 'and' ? ' and ' : ' or ')
  }
  return p.ast ? d(p.ast) : ''
}
