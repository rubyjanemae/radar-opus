#!/usr/bin/env node
/**
 * Builds public/data/ from the OOREP database dump (GPL v3).
 *   git clone --depth 1 https://github.com/nondeterministic/oorep
 *   node scripts/build-data.mjs oorep/oorep.sql.gz [--only=mm]
 *
 * Output:
 *   remedies.json            [[id, abbrev, longName, altName|null], ...]
 *   repertories.json         [{ abbrev, title, lang, author, year, publisher, license, rubricCount, uniquePaths,
 *                              nodeCount, syntheticCount, duplicatePaths, entryCount, file }]
 *                            rubricCount = source rubric rows (duplicate full paths included, synthetic headings not)
 *   rep-<abbrev>.json        columnar repertory (see src/data/types.ts RepertoryFile)
 *   mm-boericke.json         Boericke materia medica, one entry per remedy
 *   src/data/data-manifest.json  content hashes of the data files (cache-busting URLs)
 *
 * Sub-rubrics are ordered like the printed book: time modalities, then clock hours in
 * chronological order, then alphabetically; bare connector nodes ("death" > "of") are folded
 * into one rubric ("death, of"). A missing intermediate path that groups several sub-rubrics
 * ("Gemüt, Ärger") becomes a synthetic heading without remedies; duplicate full paths are merged
 * (logged with counts). See scripts/lib/rubric-tree.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { buildBoericke } from './lib/boericke.mjs';
import { writeManifest } from './lib/manifest.mjs';
import { childComparator, duplicatePaths, foldConnectors, linkParents } from './lib/rubric-tree.mjs';

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
const reps = [];
for (const info of only ? [] : tables.info) {
  const [abbrev, title, lang, authorLast, authorFirst, year, publisher, license, , , displayTitle] = info;
  const rows = tables.rubric.filter(r => r[0] === abbrev).map(r => ({ oid: Number(r[1]), path: r[5].trim() }));
  // Rows sharing a full path are one rubric (their remedies merge below).
  const dups = duplicatePaths(rows);
  const merged = dups.reduce((n, d) => n + d.count - 1, 0);
  console.log(abbrev, 'duplicate full paths:', dups.length, 'paths,', merged, 'rows merged', dups.length ? `(most repeated: ${dups.slice(0, 5).map(d => `"${d.path}" x${d.count}`).join(', ')})` : '');
  // Parent = the path without its last ", " segment; missing intermediate paths become synthetic headings (no remedies).
  const { roots, synthetic } = linkParents(rows, () => ({ oid: null }), { lang });
  const byPath = new Map();
  for (const r of rows) if (!byPath.has(r.path)) byPath.set(r.path, r);
  const uniq = [...byPath.values()];
  const sourceRubrics = uniq.length;
  const order = CHAPTER_ORDER[abbrev] ?? [];

  // remedies per rubric (duplicate paths share one node; the highest grade wins)
  const byOid = new Map(uniq.map(r => [r.oid, r]));
  for (const r of rows) if (!byOid.has(r.oid)) byOid.set(r.oid, byPath.get(r.path));
  for (const r of [...uniq, ...synthetic]) r.entries = new Map(); // synthetic headings: remedy_count 0
  for (const [ab, rid, remId, weight] of tables.rubricremedy) {
    if (ab !== abbrev) continue;
    const r = byOid.get(Number(rid));
    if (!r) continue;
    const g = Math.min(4, Math.max(1, Number(weight)));
    r.entries.set(Number(remId), Math.max(r.entries.get(Number(remId)) ?? 0, g));
  }
  const sameEntries = (a, b) => a.entries.size === b.entries.size && [...a.entries].every(([id, g]) => b.entries.get(id) === g);
  const folds = foldConnectors(roots, lang, sameEntries);

  roots.sort((a, b) => {
    const ia = order.indexOf(a.text), ib = order.indexOf(b.text);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.text.localeCompare(b.text, lang);
  });

  // depth-first flatten in book order
  const flat = [];
  const visit = (r, depth, chapter) => {
    r.idx = flat.length; r.depth = depth; r.chapter = chapter; flat.push(r);
    r.children.sort(childComparator(lang, r.text));
    for (const c of r.children) visit(c, depth + 1, chapter);
  };
  roots.forEach((r, ci) => visit(r, 0, ci));
  const entries = flat.map(r => r.entries);
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
    // synthetic headings (a missing intermediate path grouping several sub-rubrics; no remedies), by index
    synthetic: flat.filter(r => r.synthetic).map(r => r.idx),
  };
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(out));
  // rubricCount: rubrics of the source (unique full paths; synthetic headings not counted); nodeCount: rubrics in the file.
  reps.push({
    abbrev, title: displayTitle ?? title, fullTitle: title, lang, author: [authorFirst, authorLast].filter(Boolean).join(' '), year: Number(year) || null, publisher, license,
    rubricCount: rows.length, uniquePaths: sourceRubrics, nodeCount: flat.length, syntheticCount: synthetic.length, duplicatePaths: dups.length, entryCount: data.length, file,
  });
  const pct = (n) => `${((100 * n) / flat.length).toFixed(2)}%`;
  console.log(abbrev, flat.length, 'rubrics', data.length, 'entries', roots.length, 'chapters', folds, 'connector rubrics folded');
  const underSynthetic = flat.filter(r => r.parent?.synthetic).length;
  console.log(abbrev, 'source rubrics', rows.length, `(${sourceRubrics} distinct paths)`, '· synthetic headings', synthetic.length, `(${pct(synthetic.length)} of the tree), holding ${underSynthetic} sub-rubrics`,
    synthetic.length ? `e.g. ${synthetic.slice().sort((a, b) => b.children.length - a.children.length).slice(0, 5).map(r => `"${r.path}" (${r.children.length})`).join(', ')}` : '');
  if (synthetic.length / flat.length >= 0.005) console.warn(abbrev, 'WARNING: synthetic headings are 0.5% of the tree or more');
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

console.log('manifest', Object.keys(writeManifest(outDir)).length, 'files');
