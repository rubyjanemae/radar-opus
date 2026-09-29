import type { Remedy } from '../../data/types'

/**
 * Resolves remedy mentions in materia medica prose ("Nat mur", "Kali carb.", "Pulsat",
 * "Hydrocy acid", "Mercur") to remedy ids. Boericke abbreviates freely and differently from
 * the repertory abbreviations (Nat-m, Kali-c, Puls), so we match in order of confidence:
 *
 *  1. exact abbreviation ("puls", "nat-m", "nat m")
 *  2. exact name / alternative name / Boericke heading
 *  3. override table for Boericke's shorthand that is ambiguous by rule ("nux" = Nux vomica)
 *  4. name prefix: every query word is a prefix of the corresponding name word
 *     ("natr mur" → Natrium Muriaticum). Ties go to the shortest abbreviation (the polychrest).
 *  5. abbreviation prefix: every abbreviation part is a prefix of the query word
 *     ("phosphor" → Phos, "bryon" → Bry). The longest abbreviation wins.
 */

interface Entry { remedy: Remedy; abbrev: string; abbrevParts: string[]; names: string[][] }

const OVERRIDES: Record<string, string> = {
  nux: 'nux-v', china: 'chin', chin: 'chin', merc: 'merc', mercur: 'merc', mercurius: 'merc', calc: 'calc', calcarea: 'calc',
  sulph: 'sulph', sulphur: 'sulph', sulf: 'sulph', ars: 'ars', arsen: 'ars', arsenic: 'ars', 'ars alb': 'ars', 'arsen alb': 'ars',
  ign: 'ign', ignat: 'ign', lyc: 'lyc', lycop: 'lyc', lycopod: 'lyc', sep: 'sep', sil: 'sil', silica: 'sil', graph: 'graph',
  kali: 'kali-c', natr: 'nat-m', natrum: 'nat-m', puls: 'puls', pulsat: 'puls', pulsatilla: 'puls', bell: 'bell', bellad: 'bell',
  rhus: 'rhus-t', 'rhus tox': 'rhus-t', ant: 'ant-t', 'ant tart': 'ant-t', 'ant crud': 'ant-c', carbo: 'carb-v', 'carbo veg': 'carb-v',
  'carb veg': 'carb-v', 'carb an': 'carb-an', 'carbo an': 'carb-an', 'ferr': 'ferr', ferrum: 'ferr', cham: 'cham', coloc: 'coloc',
  plumb: 'plb', plumbum: 'plb', 'plumb met': 'plb', 'mag phos': 'mag-p', 'aur met': 'aur', aurum: 'aur', cupr: 'cupr', cuprum: 'cupr',
  'cupr met': 'cupr', 'zinc met': 'zinc', zinc: 'zinc', zincum: 'zinc', 'stann': 'stann', stannum: 'stann', plat: 'plat', platina: 'plat',
  lach: 'lach', lachesis: 'lach', crotal: 'crot-h', 'crotal hor': 'crot-h', naja: 'naja', apis: 'apis', canth: 'canth', thuja: 'thuj',
  caust: 'caust', causticum: 'caust', phos: 'phos', phosph: 'phos', phosphor: 'phos', phosphorus: 'phos', 'phos ac': 'ph-ac', 'phosph ac': 'ph-ac',
  'mur ac': 'mur-ac', 'nit ac': 'nit-ac', 'nitr ac': 'nit-ac', 'sul ac': 'sul-ac', 'sulph ac': 'sul-ac', gels: 'gels', gelsem: 'gels',
  hep: 'hep', hepar: 'hep', 'hepar sul': 'hep', 'hep sulph': 'hep', 'hepar sulph': 'hep', bry: 'bry', bryon: 'bry', bryonia: 'bry',
  verat: 'verat', 'verat alb': 'verat', 'veratr': 'verat', 'verat vir': 'verat-v', coff: 'coff', coffea: 'coff', op: 'op', opium: 'op',
  ipec: 'ip', ipecac: 'ip', ip: 'ip', staph: 'staph', 'staphis': 'staph', nat: 'nat-m', 'natr mur': 'nat-m', 'nat mur': 'nat-m',
  iod: 'iod', iodum: 'iod', iodine: 'iod', brom: 'brom', bromium: 'brom', bromine: 'brom', camph: 'camph', camphor: 'camph',
  cina: 'cina', cocc: 'cocc', con: 'con', conium: 'con', dros: 'dros', dulc: 'dulc', euphr: 'euphr', ham: 'ham', hyos: 'hyos',
  kreos: 'kreos', led: 'led', ledum: 'led', mez: 'mez', mosch: 'mosch', petrol: 'petr', sabad: 'sabad', sang: 'sang',
  sec: 'sec', secale: 'sec', spong: 'spong', spongia: 'spong', stram: 'stram', tab: 'tab', tabac: 'tab', tabacum: 'tab',
  tarent: 'tarent', ther: 'ther', tub: 'tub', tuberc: 'tub', valer: 'valer', 'arn': 'arn', arnica: 'arn', acon: 'acon', aconite: 'acon',
  alum: 'alum', alumina: 'alum', ambr: 'ambr', ambra: 'ambr', anac: 'anac', 'ant tar': 'ant-t', bar: 'bar-c', 'bar carb': 'bar-c',
  borax: 'bor', 'calc carb': 'calc', 'calc phos': 'calc-p', 'calc fl': 'calc-f', 'calc sulph': 'calc-s', 'kali bich': 'kali-bi',
  'kali carb': 'kali-c', 'kali phos': 'kali-p', 'kali sulph': 'kali-s', 'kali iod': 'kali-i', 'kali mur': 'kali-m', 'kali brom': 'kali-br',
  'nat sulph': 'nat-s', 'natr sulph': 'nat-s', 'nat carb': 'nat-c', 'natr carb': 'nat-c', 'nat phos': 'nat-p', 'natr phos': 'nat-p',
  'mag carb': 'mag-c', 'mag mur': 'mag-m', 'ammon carb': 'am-c', 'ammon mur': 'am-m', 'am carb': 'am-c', 'am mur': 'am-m',
  'merc cor': 'merc-c', 'merc corr': 'merc-c', 'merc sol': 'merc', 'merc viv': 'merc', 'merc dulc': 'merc-d', 'merc iod': 'merc-i-f',
  'nux vom': 'nux-v', 'nux mos': 'nux-m', 'nux mosch': 'nux-m', 'rhus t': 'rhus-t', 'rhus rad': 'rhus-r', 'rhus ven': 'rhus-v',
  'cimicif': 'cimic', cimicifuga: 'cimic', cimic: 'cimic', actea: 'cimic', 'actaea rac': 'cimic', 'arg nit': 'arg-n', 'argent nit': 'arg-n',
  'arg met': 'arg-m', 'aur mur': 'aur-m', 'lac can': 'lac-c', 'lac def': 'lac-d', 'lil tig': 'lil-t', 'sulph iod': 'sul-i',
}

/** Lower-case, dots/hyphens to spaces, collapsed. */
export function normToken(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/[.\-–_/]+/g, ' ').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()
}

/** Parse a Postgres-style array string '{a,"b c"}' (the remedies.json alt-name column) into names. */
export function parseAltNames(alt: string | null): string[] {
  if (!alt) return []
  const s = alt.trim().replace(/^\{/, '').replace(/\}$/, '')
  const out: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g
  for (const m of s.matchAll(re)) {
    const v = (m[1] ?? m[2] ?? '').trim()
    if (v) out.push(v)
  }
  return out
}

export class RemedyResolver {
  private readonly byAbbrev = new Map<string, Remedy>()
  private readonly byName = new Map<string, Remedy>()
  private readonly byFirst = new Map<string, Entry[]>()
  private readonly cache = new Map<string, Remedy | null>()

  /** `headings`: extra names per remedy id, e.g. Boericke chapter headings. */
  constructor(remedies: Iterable<Remedy>, headings: Iterable<[number, string]> = []) {
    const entries: Entry[] = []
    const byId = new Map<number, Entry>()
    for (const r of remedies) {
      const abbrev = normToken(r.abbrev)
      const names = [r.name, ...parseAltNames(r.altName)].map(n => normToken(n).split(' ').filter(Boolean)).filter(n => n.length)
      const e: Entry = { remedy: r, abbrev, abbrevParts: abbrev.split(' '), names }
      entries.push(e)
      byId.set(r.id, e)
      if (!this.byAbbrev.has(abbrev)) this.byAbbrev.set(abbrev, r)
    }
    for (const [id, heading] of headings) {
      const e = byId.get(id)
      if (!e) continue
      for (const part of heading.split(/\s*(?:--|—|–| - |-(?=[A-Z]{3}))\s*/)) {
        const words = normToken(part).split(' ').filter(Boolean)
        if (words.length) e.names.push(words)
      }
    }
    for (const e of entries) {
      for (const n of e.names) {
        const key = n.join(' ')
        const prev = this.byName.get(key)
        if (!prev || prev.abbrev.length > e.remedy.abbrev.length) this.byName.set(key, e.remedy)
      }
      const firsts = new Set([...e.names.map(n => n[0].slice(0, 2)), e.abbrevParts[0].slice(0, 2)])
      for (const f of firsts) {
        let list = this.byFirst.get(f)
        if (!list) this.byFirst.set(f, (list = []))
        list.push(e)
      }
    }
  }

  /** Resolve a free-text remedy mention; null when unknown or too ambiguous. */
  resolve(raw: string): Remedy | null {
    const q = normToken(raw)
    if (!q) return null
    const hit = this.cache.get(q)
    if (hit !== undefined) return hit
    const r = this.compute(q)
    this.cache.set(q, r)
    return r
  }

  private compute(q: string): Remedy | null {
    const ab = this.byAbbrev.get(q)
    if (ab) return ab
    const nm = this.byName.get(q)
    if (nm) return nm
    const ov = OVERRIDES[q]
    if (ov) { const r = this.byAbbrev.get(normToken(ov)); if (r) return r }
    const words = q.split(' ')
    if (words.length > 4 || words[0].length < 3 || /^\d/.test(q)) return null
    const cands = this.byFirst.get(words[0].slice(0, 2)) ?? []

    // name prefix
    let best: { e: Entry; score: number } | null = null
    for (const e of cands) {
      for (const n of e.names) {
        if (words.length > n.length) continue
        if (!words.every((w, i) => n[i].startsWith(w))) continue
        // single-word queries must be a solid stem (avoid "Sore" → "Sorghum")
        if (words.length === 1 && words[0].length < 4 && words[0] !== n[0]) continue
        const score = (words.length === n.length ? 0 : 100) + (words[0] === n[0] ? 0 : 20) + e.remedy.abbrev.length
        if (!best || score < best.score) best = { e, score }
      }
    }
    if (best) return best.e.remedy

    // abbreviation prefix: each abbreviation part a prefix of the query word
    let bestAb: Entry | null = null
    for (const e of cands) {
      const p = e.abbrevParts
      if (p.length !== words.length) continue
      if (!p.every((x, i) => words[i].startsWith(x))) continue
      if (p[0].length < 3) continue
      if (!bestAb || e.abbrev.length > bestAb.abbrev.length) bestAb = e
    }
    return bestAb?.remedy ?? null
  }
}
