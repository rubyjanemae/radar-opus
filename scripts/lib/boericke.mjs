/**
 * Boericke materia medica from the OOREP tables (mmchapter, mmsection).
 *
 * The OOREP data is not one-monograph-per-chapter: a chapter can hold several monographs
 * (each starts at a depth-1 section, its depth-2 sections point to it as parent), and a few
 * chapters carry the wrong remedy id (LACTICUM ACIDUM on Aceticum acidum, IRIDIUM on Indium,
 * RADIUM BROMATUM on Cadmium bromatum…) or a "None" heading. So every monograph is identified
 * by its own heading: when the heading does not name the chapter's remedy, the remedy whose
 * name matches the heading exactly takes the monograph. Duplicate monographs (the same text
 * listed twice) are merged, keeping the fuller one; nothing is dropped silently.
 */

const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** "{a,\"b c\"}" → ['a', 'b c'] */
function altNames(alt) {
  if (!alt) return [];
  return [...alt.replace(/^\{|\}$/g, '').matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)].map(m => (m[1] ?? m[2] ?? '').trim()).filter(Boolean);
}

/** Order-insensitive key: "Acidum Sarcolacticum" == "SARCOLACTICUM ACIDUM". */
const bag = (s) => norm(s).split(' ').filter(Boolean).sort().join(' ');

/** Heading parts: "ABIES CANADENSIS-PINUS CANADENSIS", "ABRUS PRECATORIUS -- JEQUIRITY". */
const headingParts = (h) => h.split(/\s*(?:--|—|–|-(?=[A-Z]{3}))\s*/).map(norm).filter(Boolean);

/**
 * Spelling variants in Boericke's headings that do name the chapter's remedy (checked by hand);
 * everything else must match a remedy name.
 */
export const HEADING_VARIANTS = {
  'joanesia asoca': 'Jon',
  'loleum temulentum': 'Lol',
  skatolum: 'Scat',
};

/** Does a Boericke heading name this remedy? Loose: the first word agrees on 4 letters with a name. */
export function headingNamesRemedy(heading, remedy) {
  const parts = headingParts(heading);
  if (!parts.length) return false;
  if (parts.some(p => HEADING_VARIANTS[p] === remedy.abbrev)) return true;
  const names = [remedy.name, ...altNames(remedy.altName)].map(norm).filter(Boolean);
  return parts.some(p => {
    const w = p.split(' ');
    return names.some(n => {
      const nw = n.split(' ');
      if (bag(n) === bag(p)) return true;
      return w[0].slice(0, 4) === nw[0].slice(0, 4) || (w.length > 1 && nw.length > 1 && w[1].slice(0, 4) === nw[0].slice(0, 4) && w[0].slice(0, 4) === nw[1].slice(0, 4));
    });
  });
}

const isNone = (h) => !h || /^none$/i.test(h.trim());

/** A relationship clause label opening a line or a sentence. */
const REL_LINE = /^(?:Complementary|Antidotes?(?: to [A-Za-z ]+)?|Compare|Incompatible|Inimical)\s*:/;
const REL_INLINE = /([.;)*]\s+)((?:Complementary|Antidotes?|Compare|Incompatible|Inimical)\s*:)/;
export const isRelationshipHeading = (h) => /relation/i.test(h ?? '');

/**
 * In a few monographs (Arsenicum album, Aethusa, Ammonium iodatum, X-ray, Cytisus, Scrophularia,
 * Belladonna, Saccharum, Viola tricolor) the relationship paragraphs trail another section
 * (Modalities, Dose, Extremities) instead of standing in their own "Relationship" section.
 * Move such a trailing block, starting at a line (not the first) or a sentence that opens with
 * "Complementary:", "Antidotes:", "Compare:", "Incompatible:" or "Inimical:", into the
 * Relationship section (appended to an existing one, else created: before Dose when the block
 * came from Dose, otherwise right after its source section). Returns the new sections and
 * the headings that were split.
 */
export function splitTrailingRelationships(sections) {
  const out = sections.map(s => ({ ...s }));
  const moved = [];
  const split = [];
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (isRelationshipHeading(s.heading)) continue;
    const lines = s.text.split('\n');
    let at = -1;
    const li = lines.findIndex((l, k) => k > 0 && REL_LINE.test(l.trim()));
    if (li > 0) at = lines.slice(0, li).join('\n').length + 1;
    else {
      // inline: "...; 11 am. Compare: *Lycop*." (never the section's first sentence)
      const m = REL_INLINE.exec(s.text);
      if (m && m.index > 0) at = m.index + m[1].length;
    }
    if (at <= 0) continue;
    const block = s.text.slice(at).trim();
    s.text = s.text.slice(0, at).trim();
    moved.push({ from: i, block });
    split.push(s.heading);
  }
  if (!moved.length) return { sections: out, split };
  const text = moved.map(m => m.block).join('\n');
  const existing = out.find(s => isRelationshipHeading(s.heading));
  if (existing) { existing.text = `${existing.text}\n${text}`.trim(); return { sections: out, split }; }
  const src = moved[0].from;
  const at = /^dose/i.test(out[src].heading) ? src : src + 1;
  out.splice(at, 0, { heading: 'Relationship', text });
  return { sections: out, split };
}

/**
 * @param chapters rows [id, mmId, heading, remedyId|null]
 * @param sections rows [id, chapterId, depth, parentId|null, nextId|null, heading|null, content|null]
 * @param remedies [{ id, abbrev, name, altName }]
 * @returns {{ entries: object[], log: string[] }}
 */
export function buildBoericke(chapters, sections, remedies) {
  const log = [];
  const byId = new Map(remedies.map(r => [r.id, r]));
  const byBag = new Map();
  for (const r of remedies) for (const n of [r.name, ...altNames(r.altName)]) {
    const k = bag(n);
    if (k && !byBag.has(k)) byBag.set(k, r);
  }
  const secsByChapter = new Map();
  for (const s of sections) {
    const [id, chId, depth, parent, , heading, content] = s;
    if (!secsByChapter.has(chId)) secsByChapter.set(chId, []);
    secsByChapter.get(chId).push({ id: Number(id), depth: Number(depth), parent: parent == null ? null : Number(parent), heading, content: (content ?? '').trim() });
  }

  const monos = [];
  for (const [chId, , chHeading, remId] of chapters) {
    if (remId == null) continue;
    const chRemedy = byId.get(Number(remId));
    const s = (secsByChapter.get(chId) ?? []).sort((a, b) => a.id - b.id);
    const heads = s.filter(x => x.depth === 1);
    const groups = heads.length
      ? heads.map(h => ({ head: h, body: s.filter(x => x.depth > 1 && (x.parent === h.id || (x.parent == null && heads.length === 1))) }))
      : [{ head: null, body: s.filter(x => x.depth > 1) }];
    for (const { head, body } of groups) {
      let heading = !isNone(head?.heading) ? head.heading.trim() : !isNone(chHeading) ? chHeading.trim() : '';
      let remedy = chRemedy;
      if (heading && remedy && !headingNamesRemedy(heading, remedy)) {
        const other = headingParts(heading).map(p => byBag.get(bag(p))).find(Boolean);
        if (other) { log.push(`remap "${heading}": ${remedy.abbrev} → ${other.abbrev}`); remedy = other; }
        else log.push(`warning: "${heading}" does not name ${remedy.abbrev}; kept`);
      }
      if (!remedy) { log.push(`warning: chapter ${chId} "${heading}" has unknown remedy ${remId}; skipped`); continue; }
      if (!heading) { heading = remedy.name.toUpperCase(); log.push(`heading for ${remedy.abbrev} taken from the remedy name`); }
      const [common, ...rest] = (head?.content ?? '').split('\n');
      const commonName = (common ?? '').trim()
      // a few sections end with the next monograph's intro pasted in ("…\n**An Indian Shrub…**\n…")
      const stray = commonName ? `\n**${commonName}**` : null
      const { sections: secs, split } = splitTrailingRelationships(body.map(x => {
        const at = stray ? x.content.indexOf(stray) : -1
        if (at >= 0) log.push(`stripped a pasted intro from ${remedy.abbrev} › ${x.heading}`)
        return { heading: x.heading, text: at >= 0 ? x.content.slice(0, at).trim() : x.content }
      }));
      for (const h of split) log.push(`moved relationships trailing ${remedy.abbrev} › ${h} into Relationship`);
      monos.push({ remedyId: remedy.id, heading, commonName, intro: rest.join('\n').trim(), sections: secs });
    }
  }

  // merge duplicates: keep the fuller monograph (intro, then more text)
  const size = (m) => (m.intro ? 1e6 : 0) + m.sections.reduce((n, x) => n + x.text.length, 0);
  const byRemedy = new Map();
  for (const m of monos) {
    const prev = byRemedy.get(m.remedyId);
    if (!prev) { byRemedy.set(m.remedyId, m); continue; }
    const keep = size(m) > size(prev) ? m : prev, drop = keep === m ? prev : m;
    const dupText = drop.sections.every(x => keep.sections.some(y => y.heading === x.heading && y.text.replace(/\s+/g, ' ').startsWith(x.text.replace(/\s+/g, ' ').slice(0, 200))));
    if (!dupText) throw new Error(`Two different Boericke monographs for remedy ${byId.get(m.remedyId)?.abbrev}: "${prev.heading}" and "${m.heading}"`);
    log.push(`merged duplicate "${drop.heading}" into "${keep.heading}" (${byId.get(m.remedyId)?.abbrev})`);
    byRemedy.set(m.remedyId, keep);
  }
  const entries = [...byRemedy.values()].sort((a, b) => a.heading.localeCompare(b.heading));
  return { entries, log };
}
