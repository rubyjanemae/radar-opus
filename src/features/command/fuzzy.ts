/**
 * Fuzzy subsequence matching for the command palette. Rewards matches at word starts,
 * consecutive runs and an early first match; returns the matched character positions
 * for highlighting.
 */

export interface FuzzyMatch { score: number; positions: number[] }

const isSep = (c: string) => c === ' ' || c === '-' || c === '_' || c === '.' || c === '/' || c === ',' || c === '(' || c === ':' || c === '›'

function lowerFold(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }

export function fuzzy(query: string, text: string): FuzzyMatch | null {
  const q = lowerFold(query.trim())
  if (!q) return { score: 0, positions: [] }
  const t = lowerFold(text)
  // folding can change lengths for exotic characters; fall back to plain lowercase
  const hay = t.length === text.length ? t : text.toLowerCase()

  // contiguous substring beats everything else
  const sub = hay.indexOf(q)
  if (sub >= 0) {
    const atWord = sub === 0 || isSep(hay[sub - 1])
    const positions = Array.from({ length: q.length }, (_, k) => sub + k)
    return { score: 1000 + (atWord ? 300 : 0) - sub * 2 - (hay.length - q.length) * 0.5 + (sub === 0 ? 100 : 0), positions }
  }

  // greedy word-start preferring subsequence
  const positions: number[] = []
  let score = 0
  let ti = 0
  let prev = -2
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]
    if (c === ' ') continue
    // look ahead for this char at a word start first
    let found = -1
    for (let k = ti; k < hay.length; k++) {
      if (hay[k] === c && (k === 0 || isSep(hay[k - 1]))) { found = k; break }
    }
    const next = hay.indexOf(c, ti)
    if (next < 0) return null
    // prefer the consecutive continuation over a distant word start
    if (found < 0 || next === prev + 1) found = next
    const atWord = found === 0 || isSep(hay[found - 1])
    score += 10
    if (atWord) score += 25
    if (found === prev + 1) score += 18
    score -= Math.min(20, found - ti)
    positions.push(found)
    prev = found
    ti = found + 1
  }
  score -= positions[0] ?? 0
  // scattered letters are noise: most characters must start a word or continue a run
  if (score < positions.length * 22) return null
  return { score, positions }
}

/** Split text into highlighted runs by matched positions. */
export function markPositions(text: string, positions: number[]): { text: string; hit: boolean }[] {
  if (!positions.length) return [{ text, hit: false }]
  const set = new Set(positions)
  const out: { text: string; hit: boolean }[] = []
  let cur = ''
  let curHit = set.has(0)
  for (let i = 0; i < text.length; i++) {
    const h = set.has(i)
    if (h !== curHit && cur) { out.push({ text: cur, hit: curHit }); cur = '' }
    curHit = h
    cur += text[i]
  }
  if (cur) out.push({ text: cur, hit: curHit })
  return out
}
