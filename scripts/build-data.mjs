#!/usr/bin/env node
/**
 * Builds public/data/ from the OOREP database dump (GPL v3).
 *   git clone --depth 1 https://github.com/nondeterministic/oorep
 *   node scripts/build-data.mjs oorep/oorep.sql.gz [--only=mm]
 *
 * Output:
 *   remedies.json            [[id, abbrev, longName, altName|null], ...]
 *   repertories.json         [{ abbrev, title, lang, author, year, publisher, license, rubricCount, file }]
 *   rep-<abbrev>.json        columnar repertory (see src/data/types.ts RepertoryFile)
 *   mm-boericke.json         Boericke materia medica, one entry per remedy
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { buildBoericke } from './lib/boericke.mjs';

const input = process.argv[2];
if (!input) { console.error('usage: node scripts/build-data.mjs <oorep.sql[.gz]> [--only=mm]'); process.exit(1); }
/** --only=mm rebuilds just the materia medica files. */
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? null;
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });

const unescape = (f) => f === '\\N' ? null : f.replace(/\\(.)/g, (_, c) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' }[c] ?? c));

const tables = { info: [], remedy: [], rubric: [], rubricremedy: [], mminfo: [], mmchapter: [], mmsection: [] };
let table = null;
const rl = readline.createInterface({
  input: fs.createReadStream(input).pipe(input.endsWith('.gz') ? zlib.createGunzip() : new (await import('node:stream')).PassThrough()),
  crlfDelay: Infinity,
});
for await (const line of rl) {
  if (table === null) {
    const m = line.match(/^COPY public\.(\w+) /);
    if (m && m[1] in tables) table = m[1];
    continue;
  }
  if (line === '\\.') { table = null; continue; }
  tables[table].push(line.split('\t').map(unescape));
}

// ---- remedies ----
const remedies = tables.remedy.map(([id, abbrev, long, alt]) => [Number(id), abbrev.replace(/\.$/, ''), long, alt]).sort((a, b) => a[0] - b[0]);
if (!only) fs.writeFileSync(path.join(outDir, 'remedies.json'), JSON.stringify(remedies));

// ---- repertories ----
const CHAPTER_ORDER = {
  publicum: ['Mind', 'Vertigo', 'Head', 'Eye', 'Vision', 'Ear', 'Hearing', 'Nose', 'Face', 'Mouth', 'Teeth', 'Throat', 'External throat', 'Appetite', 'Stomach', 'Abdomen', 'Rectum', 'Stool', 'Bladder', 'Kidneys', 'Prostate gland', 'Urethra', 'Urine', 'Genitalia male', 'Genitalia female', 'Larynx and trachea', 'Respiration', 'Cough', 'Expectoration', 'Chest', 'Heart & Circulation', 'Back', 'Extremities', 'Sleep', 'Chill', 'Fever', 'Perspiration', 'Skin', 'Blood', 'Generalities', 'Clinical'],
  'kent-de': ['Gemüt', 'Schwindel', 'Kopf', 'Auge', 'Sehen', 'Ohr', 'Gehör', 'Nase', 'Gesicht', 'Mund', 'Zähne', 'Hals', 'Hals-Außenseite', 'Magen', 'Bauch', 'Mastdarm', 'Stuhl', 'Blase', 'Nieren', 'Prostata', 'Harnröhre', 'Urin', 'Geschlechtsorgane männlich', 'Geschlechtsorgane weiblich', 'Kehlkopf und Luftröhre', 'Atmung', 'Husten', 'Auswurf', 'Brust', 'Rücken', 'Extremitäten', 'Schlaf', 'Frost', 'Fieber', 'Schweiß', 'Haut', 'Allgemeines'],
};
// Repertories list time modalities before the alphabetical sub-rubrics.
const TIMES = {
  en: ['daytime', 'morning', 'forenoon', 'noon', 'afternoon', 'evening', 'night', 'midnight'],
  de: ['tagsüber', 'morgens', 'vormittags', 'mittags', 'nachmittags', 'abends', 'nachts', 'mitternacht'],
};

const reps = [];
for (const info of only ? [] : tables.info) {
  const [abbrev, title, lang, authorLast, authorFirst, year, publisher, license, , , displayTitle] = info;
  const rows = tables.rubric.filter(r => r[0] === abbrev).map(r => ({ oid: Number(r[1]), path: r[5].trim() }));
  const byPath = new Map();
  for (const r of rows) if (!byPath.has(r.path)) byPath.set(r.path, r);
  const uniq = [...byPath.values()];

  // parent = longest existing proper prefix at a ", " boundary
  for (const r of uniq) {
    let p = r.path, parent = null;
    while (true) {
      const i = p.lastIndexOf(', ');
      if (i < 0) break;
      p = p.slice(0, i);
      if (byPath.has(p)) { parent = byPath.get(p); break; }
    }
    r.parent = parent;
    r.text = parent ? r.path.slice(parent.path.length + 2) : r.path;
    r.children = [];
  }
  const order = CHAPTER_ORDER[abbrev] ?? [];
  const roots = uniq.filter(r => !r.parent);
  for (const r of uniq) if (r.parent) r.parent.children.push(r);
  const times = TIMES[lang] ?? TIMES.en;
  const key = (r) => { const t = times.indexOf(r.text.toLowerCase()); return t >= 0 ? [0, t, ''] : [1, 0, r.text.toLowerCase()]; };
  const cmp = (a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2], lang); };
  roots.sort((a, b) => {
    const ia = order.indexOf(a.text), ib = order.indexOf(b.text);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.text.localeCompare(b.text, lang);
  });

  // depth-first flatten in book order
  const flat = [];
  const visit = (r, depth, chapter) => {
    r.idx = flat.length; r.depth = depth; r.chapter = chapter; flat.push(r);
    r.children.sort(cmp);
    for (const c of r.children) visit(c, depth + 1, chapter);
  };
  roots.forEach((r, ci) => visit(r, 0, ci));

  const byOid = new Map(uniq.map(r => [r.oid, r]));
  for (const r of rows) if (!byOid.has(r.oid)) byOid.set(r.oid, byPath.get(r.path));
  const entries = flat.map(() => new Map());
  for (const [ab, rid, remId, weight] of tables.rubricremedy) {
    if (ab !== abbrev) continue;
    const r = byOid.get(Number(rid));
    if (!r) continue;
    const m = entries[r.idx], g = Math.min(4, Math.max(1, Number(weight)));
    m.set(Number(remId), Math.max(m.get(Number(remId)) ?? 0, g));
  }
  const offsets = [0], data = [];
  for (const m of entries) {
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [rem, g] of sorted) data.push(rem * 4 + (g - 1));
    offsets.push(data.length);
  }
  const file = `rep-${abbrev}.json`;
  const out = {
    abbrev, title: displayTitle ?? title, lang,
    chapters: roots.map(r => r.idx),
    text: flat.map(r => r.text),
    parent: flat.map(r => r.parent ? r.parent.idx : -1),
    depth: flat.map(r => r.depth),
    chapter: flat.map(r => r.chapter),
    offsets, data,
  };
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(out));
  reps.push({ abbrev, title: displayTitle ?? title, fullTitle: title, lang, author: [authorFirst, authorLast].filter(Boolean).join(' '), year: Number(year) || null, publisher, license, rubricCount: flat.length, entryCount: data.length, file });
  console.log(abbrev, flat.length, 'rubrics', data.length, 'entries', roots.length, 'chapters');
}
reps.sort((a, b) => (a.lang === 'en' ? 0 : 1) - (b.lang === 'en' ? 0 : 1) || a.title.localeCompare(b.title));
if (!only) fs.writeFileSync(path.join(outDir, 'repertories.json'), JSON.stringify(reps, null, 1));

// ---- materia medica (Boericke) ----
for (const mm of tables.mminfo) {
  const [mmId, abbrev, lang, fulltitle, last, first, publisher, year, license] = mm;
  const { entries, log } = buildBoericke(
    tables.mmchapter.filter(c => c[1] === mmId),
    tables.mmsection,
    remedies.map(([id, ab, name, altName]) => ({ id, abbrev: ab, name, altName })),
  );
  for (const l of log) console.log('mm', abbrev, l);
  const out = {
    abbrev, lang, title: fulltitle, author: [first, last].filter(Boolean).join(' '), year: Number(year), publisher, license: license ?? 'Public domain',
    remedies: entries,
  };
  fs.writeFileSync(path.join(outDir, `mm-${abbrev}.json`), JSON.stringify(out));
  console.log('mm', abbrev, out.remedies.length);
}
