# Data plan: licensed sources and seeding

Status: plan of record for the DAT-* inventory items. Source: `reports/data.md`, verified 2026-09-29. This is not legal advice; items marked **LEGAL** need a review before public launch.

## 1. Hard constraints

1. **Excluded content.** Ship nothing from Synthesis (any edition), Complete Repertory, Murphy, Phatak (modern editions), RadarOpus concepts, keynotes, families or maps, the Vithoulkas Expert System, Hpathy or homeopathybooks.in formatting, or B. Jain reprint additions.
2. **OOREP content.** From OOREP, use only the content its FAQ says is distributed with the source: `publicum`, `kent-de` and `boericke`, plus the shared `remedy` table. The other OOREP books must not be scraped.
3. **Provenance on every row.** Every rubric, grade, section, relation and classification row carries a `source_id` that joins to the `source` table below.
4. **Licence separation.**
   - GPL v3 data ships as a separate data package with its own LICENSE and NOTICE files.
   - CC BY data ships with its attribution text.
   - The app shows an "About data" page listing every source, its licence and a link.

## 2. Source register

| id | Source | Content | Licence | Access | Phase | Priority |
|---|---|---|---|---|---|---|
| `oorep-publicum` | OOREP `oorep.sql.gz`, Repertorium Publicum v0.5 (Polony 2008) | English Kent-derived repertory: 74,667 rubrics, grades 1–3 | GPL v3 | git clone (Verified) | 1 | P0 |
| `oorep-kent-de` | OOREP dump, kent-de (Bildungswerk / Körschgen 2012) | German Kent: 68,741 rubrics | GPL v3 | git clone | 1 | P1 |
| `oorep-remedy` | OOREP `remedy` table | 2,432 remedies: abbreviation, long name, alternate names | GPL v3 | git clone | 1 | P0 |
| `oorep-boericke` | OOREP dump, Boericke 1906 | 688 remedy chapters, 6,393 sections, 543 Relationship sections | GPL v3 (text is public domain) | git clone | 1 | P0 |
| `homeoremedica` | github.com/rasagyavatsal/HomeoRemedica | Boericke 9th ed., Clarke (OCR), Kent's Lectures, Allen's Nosodes: raw text plus parsed JSON (1,250 remedies, 118k passages) | Dataset CC BY 4.0; code MIT | git clone | 2 | P1 |
| `gutenberg-38757` | Project Gutenberg #38757, Anshutz, *New, Old and Forgotten Remedies* (1900) | Clean materia medica text | Public domain (Gutenberg licence on the wrapper; strip the header) | build machine | 2 | P2 |
| `clarke-ia` | archive.org `adictionaryprac04clargoog` and the Wellcome `b29808108_000{1,2,3}` scans | Clarke *Dictionary* (1900–02): N.O. lines, Relations | Public domain | build machine (archive.org is not reachable from the sandbox) | 2 | P1 |
| `allen-keynotes-ia` | archive.org `in.ernet.dli.2015.31637`; Wellcome `ax9q8msd` | Allen's *Keynotes* (1899): Relations lines | Public domain (check the edition: use only the original text of any reprint) | build machine | 4 | P2 |
| `kent-rep-nlm` | NLM `nlmuid-101302476-bk` (1897, Public Domain Mark) | English Kent repertory, PDF plus OCR | Public domain | build machine | 4 | P2 |
| `tpb-1891` | archive.org `100889133.nlm.nih.gov` | Boenninghausen TPB (T. F. Allen 1891) with Concordances; grades 1–5, needed for polarity | Public domain | build machine | 4 | P2 (P1 if the polarity strategy is prioritised) |
| `knerr-1896` | archive.org `repertoryofherin00heri` | Knerr's repertory of Hering's Guiding Symptoms (4 grades) | Public domain | build machine | 4 | P2 |
| `gibson-miller` | HathiTrust 002088731 | *Relationship of Remedies*, about 150 remedies | Public domain (US) | manual transcription | 4 | P2 |
| `gbif` | GBIF species match API / Backbone | Plant, animal and fungus taxonomy | CC BY 4.0 (**verify**) | build machine or a GitHub Action | 3 | P1 |
| `wikidata` | Wikidata SPARQL | Taxonomy and element or compound data | CC0 | build machine | 3 | P1 |
| `pubchem-pt` | PubChem periodic table CSV | Element period, group and block | Public domain | build machine | 3 | P1 |
| `fda-unii` | openFDA UNII | Substance ids and cross-references | Public domain / CC0 | build machine | 3 | P2 |
| `allen-miasms-ia` | archive.org scans of J. H. Allen, *The Chronic Miasms* (1904–08) | Remedy-level miasm attributions (psora, sycosis, pseudo-psora/tubercular, syphilis) for FAM-016 | Public domain (US; check the scan is the original edition) | build machine, manual transcription | 4 | P2 |
| `wikimedia-commons` | Wikimedia Commons API | Remedy source images (plant, animal, mineral) for MM-020 | Per file: CC0, CC BY or CC BY-SA only; licence and author stored per image | build machine | 4 | P2 |
| `manual-curation` | Our team | Nosodes, sarcodes, imponderabilia, Lac- milks, family name mapping (Compositae → Asteraceae …) | Our licence (CC BY 4.0 proposed) | repo | 3 | P1 |

**QA-only sources (never shipped):**
- homeoint.org HTML, through the `pragya6/homoeo-quiz` cache (no licence) and the `aadjones/kent_repertory_etl` raw pages. They are used as parser oracles and for grade cross-checks.
- **LEGAL:** Médi-T may hold EU database rights, so ask for permission before any derivative ships.

**Outreach:**
- Email info@oorep.com asking for redistribution rights to English Kent (1897), Boger's *Synoptic Key* and Knerr. A yes would cut OCR work in Phase 4.
- Optionally, contact Médi-T.

## 3. Target data model (browser plus build)

```sql
source(id, title, author, edition, year, url, licence, licence_url, attribution, sha256, imported_at)
remedy(id, slug UNIQUE, abbrev, name_long, kingdom, source_id)
remedy_alias(remedy_id, alias, alias_norm, source_id)            -- alias_norm = lower, no dots or spaces
repertory(id, abbrev, title, lang, grade_scale, source_id)
chapter(id, repertory_id, ordinal, name, name_norm)
rubric(id, repertory_id, chapter_id, parent_id NULL, depth, ordinal, text, full_path, path_norm, remedy_count)
rubric_remedy(rubric_id, remedy_id, grade, source_id)             -- the view filter works on source_id / flags
xref(from_rubric_id, to_rubric_id, kind 'see'|'compare'|'synonym', origin 'data'|'user')
mm_book(id, abbrev, title, source_id); mm_chapter(id, book_id, remedy_id, heading)
mm_section(id, chapter_id, parent_id, ordinal, heading, content_md)
remedy_relation(from_remedy_id, to_remedy_id, kind, context, source_id, source_ref, raw_text, parse_confidence)
taxon(remedy_id, system, rank, name, parent_name, origin 'gbif'|'wikidata'|'clarke_no'|'manual', confidence, override)
remedy_image(remedy_id, url, thumb_url, licence, author, source_page_url, source_id)   -- MM-020; CC0/CC BY/CC BY-SA only
family(id, system, name, parent_id, level); family_member(family_id, remedy_id, source_id)
element(symbol, number, period, group, block)                     -- minerals
data_version(id, created_at, sources_json, sha256)
```

- Relation `kind` is an enum: compare, complementary, antidoted_by, antidotes, follows_well, followed_well_by, inimical, relieves_ailments_from, chronic_of, similar_to.
- The family `system` is an enum: kingdom, gbif_family, gbif_order, gbif_class, apg_family, mineral_cation, mineral_anion, periodic_row, periodic_group, nosode_type, miasm, user.
- **User layer (never mixed into the data package):** `user_rubric`, `user_rubric_remedy`, `user_xref`, `user_note`, `user_family` and `user_bookmark`, all in the encrypted IndexedDB workspace, with author, source and timestamps.

## 4. ETL pipeline (Node/TypeScript, `tools/etl/`)

### Phase 1: OOREP GPL seed (P0; the sandbox can do all of it)

1. **Clone.** `git clone --depth 1 https://github.com/nondeterministic/oorep`. Record the commit SHA and `sha256(oorep.sql.gz)` in `source`.
2. **Parse.** Stream-gunzip the dump and parse the `COPY <table> (...) FROM stdin;` blocks until the `\.` line. Split on tabs, map `\N` to null, and unescape `\\`, `\t` and `\n`. Postgres arrays (`{"a","b"}`) are parsed for `namealt`. No Postgres is needed.
3. **Remedies.**
   - `slug = lower(nameabbrev).replace(/\.$/,'').replace(/\s+/g,'-')`.
   - Collisions get a `-2` suffix and are logged.
   - Aliases: the abbreviation with and without the dot, the long name, and each entry of `namealt`.
4. **Rubric tree.**
   - For each repertory, split `fullpath` on `", "`. Segment 0 is the chapter.
   - Build the parent chain by the path prefix, creating a synthetic node for any missing intermediate path with `remedy_count` 0.
   - Keep the file order as `ordinal`. Chapter ordinals follow the `chapterid` order.
   - **Caveat:** the text of some Kent rubrics contains ", ", which causes false splits. Mitigation: prefer the longest existing prefix present as a real rubric when choosing the parent, and log any node whose parent had to be synthesised. Target: under 0.5% synthetic nodes.
5. **Grades.** `rubricremedy.weight` becomes `rubric_remedy.grade` (1–3), and `repertory.grade_scale = 3`.
6. **Boericke.** `mmchapter` and `mmsection` rebuild the section tree through `parent_sec_id` and `succ_sec_id`. `*text*` becomes markdown italics.
7. **Boericke relations.**
   - Split the Relationship sections on the label regex `(Compare|Antidotes?|Complementary|Incompatible|Inimical|Follows? well|Followed by)\s*:`.
   - Split the remedy lists on `;` and `,` outside parentheses. Parenthesised text becomes `context`.
   - Resolve names through `remedy_alias.alias_norm`. Unresolved names go to `etl-report/unresolved-relations.csv`.
   - Target: 90% of tokens resolved.
8. **Precompute.** `rubric.remedy_count`, `m_r` (rubric count per remedy per repertory), and chapter-to-category defaults for the scoring engine.
9. **Emit `packages/data-oorep/`** (GPL v3):
   - `manifest.json`: version, sources, sha256 per file.
   - `remedies.json`.
   - `repertories/<abbrev>/index.json`: chapters, ordinals and counts.
   - `repertories/<abbrev>/ch-<nn>.bin`: a columnar shard per chapter with rubric rows and a `(remedyId u16, grade u8)` run per rubric; plus a JSON fallback.
   - `mm/boericke/<slug>.json`.
   - `relations/boericke.json`.
   - `search/<abbrev>.minisearch.json` (or a SQLite FTS5 file; see section 5).
   - `LICENSE` (GPL-3.0), `NOTICE` (attributions below) and `SOURCE.md` (dump URL and commit).
10. **Size budget.**
    - Publicum has 735,566 links (source-verified; see the §7 row-count gate), roughly 3–4 MB gzipped as binary shards including rubric text (inferred; DAT-003 caps it at 4 MB). kent-de adds 624,010 links. The whole package, including kent-de and Boericke, should be at most 12 MB gzipped.
    - The first paint loads only `index.json` and the active chapter shard.

### Phase 2: public-domain materia medica (P1)
- **HomeoRemedica.** Import `processed/*.json` as the books `boericke9`, `clarke`, `kent-lectures` and `allen-nosodes`. Map the remedy headings through the alias table and attribute CC BY 4.0.
- **Clarke re-parse.**
  - Re-parse from the raw OCR (HomeoRemedica), or from the archive.org `_djvu.txt` / hOCR fetched by a GitHub Action.
  - Extract the header block: Latin name, common names, `N. O.` line and preparation.
  - Extract the `Relations.` paragraph with the phrase regexes: `It is antidoted by:` → antidoted_by, `It antidotes:` → antidotes, `It is often indicated after:` → follows (stored as followed_well_by on the other remedy, per our direction rule), `It is complementary to:`, `It relieves ailments from:`, `Compare also:`/`Compare:`, `Incompatible`/`Inimical`, `Follows well`/`Followed well by`.
  - OCR fixes table: `Puis.` → `Puls.`, `Com^ard` → `Compare`, and so on, maintained in `tools/etl/ocr-fixes.tsv`.
  - QA against the homeoint Clarke HTML (769 pages with Relations): target a relation-set F1 score of at least 0.85 on a 50-remedy sample.
- **Anshutz.** Import Gutenberg #38757 with its header and footer removed.

### Phase 3: classification (P1)
- **Kingdom assignment rules, in order:**
  1. manual list (nosodes, sarcodes, imponderabilia, milks)
  2. mineral parser (a cation or element Latin stem, plus an anion suffix)
  3. GBIF match
  4. Clarke N.O.
  5. unknown
- **GBIF.**
  - Runs as a GitHub Action (`.github/workflows/taxonomy.yml`) on each binomial and caches its responses in `tools/etl/cache/gbif/*.json`. The cached data, not the live API, is used when building.
  - Accept matches with matchType EXACT and confidence of at least 90, or FUZZY with confidence of at least 95. Everything else goes to the manual review CSV.
- **Mineral parser.**
  - The stems map to elements: Kali → K, Natrum → Na, Calcarea → Ca, Magnesia → Mg, Baryta → Ba, Ferrum → Fe, Aurum → Au, Argentum → Ag, Cuprum → Cu, Zincum → Zn, Plumbum → Pb, Stannum → Sn, Mercurius → Hg, Arsenicum → As, Phosphorus → P, Sulphur → S, and so on.
  - The suffixes map to anions: -carbonicum CO3, -muriaticum Cl, -sulphuricum SO4, -phosphoricum PO4, -iodatum I, -bromatum Br, -nitricum NO3, -aceticum acetate, -arsenicosum AsO3, -metallicum (element).
  - Join to `element` for period and group.
- **Families emitted.** kingdom; GBIF family, order and class; mineral cation, anion and period/group; nosode type (bowel, disease, other).
- Clarke's 19th-century family names map to APG names. Each assignment stores `origin`, a confidence value and an override flag.
- **Acceptance:** at least 95% of the remedies in Publicum have a kingdom; at least 85% of the plant remedies have a family; a hand-checked sample of 100 has at least 97% precision.
- **Miasms (P2, FAM-016).** Remedy-level miasm tags come only from `allen-miasms-ia` (and later other public-domain texts), each with `origin`, a page reference and a confidence value. RadarOpus' Ortega miasm tags on Synthesis rubrics are proprietary and are not reproduced; rubric-level miasm tags are out of scope.
- **Explicitly out of scope:** Scholten/Sankaran series-stage themes, and Boyd, Dorcsi or Teste groupings unless a public-domain source is transcribed.

### Phase 4: additional repertories and relations (P2)
- **Kent 1897 (NLM), TPB 1891 and Knerr 1896.**
  - Run hOCR/ALTO font-style extraction: bold and italic determine the grade, and small caps give grade 4 in Knerr.
  - Validate the Kent grades against Publicum on the rubrics that match: target agreement of at least 95%.
  - The TPB polar-pair table is curated by hand from the book's modality sections to feed the polarity strategy.
- **Gibson Miller.** Transcribe manually into `relations/gibson-miller.csv` with double-entry QA.
- **TPB Concordances.** Parse into `remedy_relation` with kind `similar_to`, and context set to the chapter group and grade.

## 5. Runtime loading and search

- **Storage.** The data package is served as static files with an immutable cache. On first run the app downloads the manifest and the active repertory, and a Service Worker caches them for offline use. A "Download all for offline" setting fetches everything.
- **Search.**
  - Build-time MiniSearch indexes over the rubric paths, per repertory, with a stemmed English analyser. A root-and-branch expansion list is built from the word forms observed in the data.
  - The materia medica full-text index is built lazily in a Worker the first time the user searches MM.
  - Fallback plan: if the index size exceeds 15 MB, switch to SQLite-WASM with FTS5 (OPFS-backed).
- **Views (source filters).** Publicum has no per-grade author attribution, so the first views are:
  - Full
  - Grades 2–3 only
  - Grade 3 only
  - "Exclude remedies copied from sub-rubrics": not available in OOREP data, so hidden
  - Our user additions on or off

  Author-based views come once Phase 4 books carry sources.
- **Versioning.** `data_version.id` is the date plus a short sha. Saved analyses store it. When the stored data version differs from the loaded one, the app shows "Data changed since this analysis was saved", with a "Re-run" or "View snapshot" choice.

## 6. Attribution text (NOTICE)

```
Repertory data: "Repertorium Publicum" © 2008 Vladimir Polony (OpenRep), GPL-3.0;
"Kent (deutsch)" © 2012 Bildungswerk für therapeutische Berufe / Joscha Körschgen, GPL-3.0;
distributed via OOREP (https://github.com/nondeterministic/oorep, Andreas Bauer), GPL-3.0.
Materia medica: W. Boericke, Pocket Manual of Homoeopathic Materia Medica (1906) via OOREP (GPL-3.0);
HomeoRemedica Dataset © 2026 Rasagya Vatsal, CC BY 4.0 (public-domain source texts).
Taxonomy: GBIF Backbone Taxonomy (CC BY 4.0), Wikidata (CC0), PubChem (public domain).
```

## 7. QA and test gates (CI)

| Gate | Check | Threshold |
|---|---|---|
| Row counts | publicum: 74,667 source rubrics; 735,566 links (grade 1: 465,346; grade 2: 198,628; grade 3: 71,592). kent-de: 68,741 source rubrics; 624,010 links (393,738 / 174,241 / 56,031). Dump totals: 143,408 rubrics, 1,359,576 `rubricremedy` rows, 2,432 remedies. Synthetic nodes are counted separately and never included in these figures | exact |
| Displayed counts | the rubric count shown in the Repertories TOC (REP-001) equals the source rubric count, excluding synthetic nodes | exact |
| Tree integrity | every non-chapter rubric has a parent; no cycles; synthetic nodes | < 0.5% |
| Remedy resolution | every `rubric_remedy.remedy_id` exists | 100% |
| Grades | only values in 1..grade_scale | 100% |
| Relations | Boericke tokens resolved | ≥ 90% |
| Kingdom coverage | Publicum remedies with a kingdom | ≥ 95% |
| Determinism | two ETL runs on the same inputs give identical sha256 | identical |
| Licence | every emitted file lists a `source_id` present in `source`, with a licence | 100% |
| Size | the gzipped data-oorep package | ≤ 12 MB |
| Spot checks | 20 golden rubrics (e.g. `Mind, fear, alone, of being`) with their expected remedy and grade lists, checked in as fixtures | exact |

## 8. Open legal items (LEGAL)
1. Whether a GPL v3 data package loaded at runtime by a differently licensed SPA counts as "aggregation". The options are to license the app under GPL-compatible terms (for example AGPL/GPL) or to get counsel's opinion.
2. The GBIF Backbone licence (CC BY 4.0 is assumed) and the attribution it requires.
3. Médi-T/homeoint database rights, if any homeoint-derived structure is shipped (the plan is to ship none).
4. Reprint editions on archive.org (`in.ernet.dli.2015.*`): shipping needs the original-text-only extraction.
