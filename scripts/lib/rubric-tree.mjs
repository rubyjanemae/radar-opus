/**
 * Rubric tree shaping for build-data.mjs: sub-rubric order (time modalities, then clock hours,
 * then alphabetical) and folding of bare connector nodes ("death" > "of" becomes "death, of").
 * Pure functions over plain nodes { text, children, parent } so they can be unit-tested.
 */

/**
 * Time modalities, listed before the alphabetical sub-rubrics in repertory order. Each slot
 * lists its spellings; `start` is the clock minute the period's hours are counted from, so the
 * hours below "night" run 10 p.m., 11 p.m., midnight, 1 a.m. … rather than 1 a.m. … 11 p.m.
 */
export const TIMES = {
  en: [
    { names: ['daytime'], start: 3 * 60 },
    { names: ['morning'], start: 3 * 60 },
    { names: ['forenoon'], start: 6 * 60 },
    { names: ['noon'], start: 11 * 60 },
    { names: ['afternoon'], start: 12 * 60 },
    { names: ['evening'], start: 15 * 60 },
    { names: ['night'], start: 18 * 60 },
    { names: ['midnight'], start: 22 * 60 },
  ],
  de: [
    { names: ['tagsüber', 'am tage', 'am tag'], start: 3 * 60 },
    { names: ['morgens'], start: 3 * 60 },
    { names: ['vormittags', 'vormittag'], start: 6 * 60 },
    { names: ['mittags'], start: 11 * 60 },
    { names: ['nachmittags'], start: 12 * 60 },
    { names: ['abends'], start: 15 * 60 },
    { names: ['nachts'], start: 18 * 60 },
    { names: ['mitternacht'], start: 22 * 60 },
  ],
};
/** Where the clock starts below any other rubric: the repertory day begins in the early morning. */
const DAY_START = 3 * 60;

/** Clock positions of the named hours, so "midnight" sorts among "11 p.m." and "1 a.m." below "night". */
const NAMED_HOURS = { en: { noon: 12 * 60, midnight: 24 * 60 }, de: { mittags: 12 * 60, mitternacht: 24 * 60 } };

/** Index of a time modality in TIMES[lang], or -1. */
export function timeSlot(text, lang) {
  const t = text.trim().toLowerCase();
  return (TIMES[lang] ?? TIMES.en).findIndex(s => s.names.includes(t));
}

const H = String.raw`(\d{1,2})(?:[:.](\d{2}))?`;
/**
 * English hour, also written "h-mm" ("2-30 p.m." is 14:30). A hyphen followed by a valid 12-hour clock hour
 * (1-12) is a range instead ("4-8 p.m.", "10-12 a.m."), so only 00 and 13-59 after a hyphen are minutes.
 */
const H_EN = String.raw`(\d{1,2})(?:(?:[:.]|-(?!(?:0?[1-9]|1[0-2])\b))(\d{2}))?`;
const EN_MER = String.raw`\s*(a\.\s?m\.?|p\.\s?m\.?|h\b)`;
const RANGE = String.raw`\s*(?:-|–|to|till|until|or|and|bis|oder|und)\s*`;

/**
 * Clock time a rubric text starts with, in minutes after midnight (0..1439), or null.
 * English: "3 a.m.", "2-30 p.m." (14:30), "10 a.m. to 2 p.m.", "7 to 8 p.m." (meridiem taken from the range end),
 * "11 h". German: "15 Uhr", "9 bis 13 Uhr". The end of a range is returned as `end` when present.
 */
export function parseClock(text, lang = 'en') {
  const t = text.trim().toLowerCase();
  if (lang === 'de') {
    let m = new RegExp(`^${H}\\s*uhr`).exec(t);
    let end = null;
    if (!m) {
      m = new RegExp(`^${H}${RANGE}${H}\\s*uhr`).exec(t);
      if (!m) return null;
      end = mins(+m[3], +(m[4] ?? 0));
    } else {
      const r = new RegExp(`^${RANGE}${H}\\s*uhr`).exec(t.slice(m[0].length));
      if (r) end = mins(+r[1], +(r[2] ?? 0));
    }
    const start = mins(+m[1], +(m[2] ?? 0));
    return start === null ? null : { start, end };
  }
  let m = new RegExp(`^${H_EN}${EN_MER}`).exec(t);
  if (m) {
    const start = en(+m[1], +(m[2] ?? 0), m[3]);
    if (start === null) return null;
    const r = new RegExp(`^${RANGE}${H_EN}${EN_MER}`).exec(t.slice(m[0].length));
    return { start, end: r ? en(+r[1], +(r[2] ?? 0), r[3]) : null };
  }
  // "7 to 8 p.m.": the first hour borrows the meridiem of the second
  m = new RegExp(`^${H_EN}${RANGE}${H_EN}${EN_MER}`).exec(t);
  if (!m) return null;
  const end = en(+m[3], +(m[4] ?? 0), m[5]);
  let start = en(+m[1], +(m[2] ?? 0), m[5]);
  if (start === null || end === null) return null;
  if (start > end && m[5].startsWith('p')) start = en(+m[1], +(m[2] ?? 0), 'a.m.'); // "11 to 1 p.m."
  return { start, end };
}

function mins(h, m) { return h > 24 || m > 59 ? null : (h % 24) * 60 + m; }
function en(h, m, mer) {
  if (h > 24 || m > 59) return null;
  if (mer.startsWith('h')) return (h % 24) * 60 + m;
  if (h < 1 || h > 12) return null;
  const pm = mer.startsWith('p');
  return ((h % 12) + (pm ? 12 : 0)) * 60 + m;
}

/**
 * Comparator for the children of one rubric, in repertory (Kent) order:
 *   1. time modalities (daytime, morning … midnight) in their fixed order,
 *   2. clock hours in chronological order counted from the parent period ("night": 10 p.m. before 1 a.m.),
 *   3. everything else alphabetically.
 * Below a time period, "noon"/"midnight" take their place among the hours.
 */
export function childComparator(lang, parentText) {
  const slots = TIMES[lang] ?? TIMES.en;
  const parentSlot = parentText == null ? -1 : timeSlot(parentText, lang);
  const origin = parentSlot >= 0 ? slots[parentSlot].start : DAY_START;
  const named = NAMED_HOURS[lang] ?? NAMED_HOURS.en;
  const rel = (m) => (m - origin + 1440) % 1440;
  const keyCache = new Map();
  const key = (node) => {
    let k = keyCache.get(node);
    if (k) return k;
    const lower = node.text.trim().toLowerCase();
    const slot = timeSlot(lower, lang);
    const clock = parentSlot >= 0 && lower in named ? { start: named[lower] % 1440, end: null } : parseClock(lower, lang);
    if (clock) k = [1, rel(clock.start), clock.end === null ? -1 : rel(clock.end)];
    else if (slot >= 0) k = [0, slot, 0];
    else k = [2, 0, 0];
    keyCache.set(node, k);
    return k;
  };
  return (a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
      || a.text.toLowerCase().localeCompare(b.text.toLowerCase(), lang, { numeric: true });
  };
}

/** Bare connector words: a sub-rubric consisting only of one of these continues its parent's text. */
export const CONNECTORS = {
  en: new Set(['of', 'in', 'during', 'after', 'before', 'while', 'on', 'from', 'to', 'with', 'when', 'at', 'by', 'for', 'about', 'under', 'over', 'into', 'upon', 'through', 'without', 'within', 'between', 'against', 'towards', 'toward', 'since', 'until', 'till', 'as', 'if']),
  de: new Set(['von', 'vom', 'im', 'in', 'am', 'an', 'bei', 'beim', 'mit', 'nach', 'vor', 'während', 'durch', 'auf', 'über', 'um', 'zu', 'zum', 'zur', 'für', 'aus', 'unter', 'gegen', 'bis', 'seit', 'wenn', 'als', 'ohne']),
};

export function isConnector(text, lang) {
  return (CONNECTORS[lang] ?? CONNECTORS.en).has(text.trim().toLowerCase());
}

/**
 * Fold bare connector nodes into their parent: when a rubric's only child is a bare connector
 * ("fear, death" > "of") listing exactly the same remedies and grades, the two are one rubric in
 * the book ("fear, death, of"); the connector's children move up to it. Chapter roots are never
 * folded. `sameEntries(parent, child)` decides remedy equality. Returns the number of folds.
 * Nodes are { text, children, parent }; folded-away nodes get `mergedInto` set.
 */
export function foldConnectors(roots, lang, sameEntries) {
  let folds = 0;
  const visit = (r) => {
    while (r.parent && r.children.length === 1 && isConnector(r.children[0].text, lang) && sameEntries(r, r.children[0])) {
      const c = r.children[0];
      r.text = `${r.text}, ${c.text}`;
      r.children = c.children;
      for (const k of r.children) k.parent = r;
      c.mergedInto = r;
      folds++;
    }
    for (const c of r.children) visit(c);
  };
  for (const r of roots) visit(r);
  return folds;
}

/** A missing intermediate path becomes a synthetic heading when at least this many distinct sub-rubrics sit below it. */
export const MIN_HEADING_CHILDREN = 6;

/**
 * Link rubrics into a tree by their full paths ("Gemüt, Ärger, abends"). Segments are split at ", ", but some
 * rubric texts contain ", " themselves ("Essen, beim" is one rubric, "beim Essen"), so a missing intermediate
 * path is only a heading when it groups several sub-rubrics:
 *   - a missing path with at least `minChildren` distinct next segments, whose own last segment does not start
 *     with a connector word, gets a synthetic node (`makeSynthetic(path)`, flagged `synthetic: true`, no remedies);
 *     "Gemüt, Ärger" is not a rubric of kent-de but holds 27 sub-rubrics;
 *   - otherwise the rubric attaches to its longest prefix that is a rubric or a heading, and keeps the rest of the
 *     path as its text ("Kribbeln, warm").
 * Sets `parent`, `text` and `children` on every node. Duplicate paths keep their first node. Returns
 * { roots, synthetic }. Siblings keep the input order, synthetic headings after the source rubrics (the build sorts them).
 */
export function linkParents(nodes, makeSynthetic, { lang = 'en', minChildren = MIN_HEADING_CHILDREN } = {}) {
  const byPath = new Map();
  for (const n of nodes) if (!byPath.has(n.path)) byPath.set(n.path, n);
  const real = [...byPath.values()];
  // distinct next segments below every missing prefix
  const below = new Map();
  for (const { path } of real) {
    for (let i = path.indexOf(', '); i >= 0; i = path.indexOf(', ', i + 2)) {
      const pre = path.slice(0, i);
      if (byPath.has(pre)) continue;
      const rest = path.slice(i + 2);
      const j = rest.indexOf(', ');
      let set = below.get(pre);
      if (!set) below.set(pre, (set = new Set()));
      set.add(j < 0 ? rest : rest.slice(0, j));
    }
  }
  const synthetic = [];
  for (const [pre, next] of below) {
    if (next.size < minChildren || !pre.includes(', ')) continue;
    const own = pre.slice(pre.lastIndexOf(', ') + 2);
    if (isConnector(own.split(' ')[0], lang)) continue;
    const n = { ...makeSynthetic(pre), path: pre, synthetic: true };
    byPath.set(pre, n);
    synthetic.push(n);
  }
  const all = [...real, ...synthetic];
  const roots = [];
  for (const n of all) {
    n.children = [];
    let p = n.path, parent = null;
    for (let i = p.lastIndexOf(', '); i >= 0; i = p.lastIndexOf(', ')) {
      p = p.slice(0, i);
      parent = byPath.get(p) ?? null;
      if (parent) break;
    }
    n.parent = parent;
    n.text = parent ? n.path.slice(parent.path.length + 2) : n.path;
  }
  for (const n of all) (n.parent ? n.parent.children : roots).push(n);
  return { roots, synthetic };
}

/** Rows sharing a full path, merged into one rubric: [{ path, count }] with count ≥ 2, most repeated first. */
export function duplicatePaths(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
  return [...counts].filter(([, c]) => c > 1).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}
