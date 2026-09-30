#!/usr/bin/env node
/**
 * Content hashes of public/data/*.json, written to src/data/data-manifest.json. The app appends
 * the hash to each data URL (`rep-publicum.json?v=<hash>`), so the files can be served with an
 * immutable cache policy: a changed file gets a new URL.
 *   node scripts/lib/manifest.mjs        (build-data.mjs runs it after writing the data)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(root, 'public', 'data');
export const MANIFEST = path.join(root, 'src', 'data', 'data-manifest.json');

/** First 12 hex digits of the SHA-256 of a buffer. */
export function contentHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

/** { "<file>": "<hash>" } for every .json file in the data directory, sorted by name. */
export function computeManifest(dir = DATA_DIR) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) out[f] = contentHash(fs.readFileSync(path.join(dir, f)));
  return out;
}

export function writeManifest(dir = DATA_DIR, file = MANIFEST) {
  const m = computeManifest(dir);
  fs.writeFileSync(file, JSON.stringify(m, null, 1) + '\n');
  return m;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = writeManifest();
  for (const [f, h] of Object.entries(m)) console.log(h, f);
}
