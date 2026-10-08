# Feature inventory: web successor to RadarOpus

Status: the master backlog, grouped by system. Sources are `reports/features.md`, `reports/ui.md`, `reports/analysis.md`, `reports/patients.md` and `reports/data.md`. Companion specs: `interaction-map.md` (keys, menus and layout), `scoring-spec.md` (formulas and test vectors) and `data-plan.md` (sources and ETL).

**Item format.**
- **ID**: a system prefix plus a number.
- **Desc**: what the feature is.
- **RO**: RadarOpus reference behaviour. [doc] means documented in a source; [inf] means inferred; "—" means RadarOpus has no equivalent.
- **Target**: our behaviour.
- **AC**: testable acceptance criteria.

**Priorities.**
- **P0**: MVP. This is the repertorise-a-case loop on open data: browse, search, take, analyse and drill down, with workspace basics.
- **P1**: parity release. This covers patients, families, the other strategies and materia medica depth.
- **P2**: exceed or long-tail.

**Global rules that apply to every item.**
- **Keyboard and touch.** Every action is reachable by keyboard and by touch, and appears in the command palette.
- **Undo.** Every user-data mutation can be undone (WS-008).
- **Offline.** Every view works offline once its data is cached.
- **Phone width.** No view has horizontal page scroll at 360px width. Grids scroll inside their own container.
- **Content constraint.** No Synthesis, RadarOpus or proprietary content or logic may be used (see `data-plan.md` §1).

**Reference environment for every timing, frame-rate and memory AC.** Unless an AC says otherwise:
- *Desktop reference:* Apple M1 (8 GB) or Intel Core i5-1135G7 (16 GB), current stable Chrome, no CPU throttling, window 1440×900, comfortable density.
- *Phone reference:* a Moto G Power (2022)-class Android device (or Chrome DevTools 4× CPU throttle on the desktop reference), 360×740 viewport.
- *"Cable" network:* 20 Mbps down, 5 Mbps up, 20 ms RTT (Lighthouse custom throttling). *Cold* = empty HTTP cache and Service Worker; *warm* = both populated.
- A timing is met when the **p95 of 20 runs** (after 3 warm-up runs) is under the budget. Frame-rate ACs use a Chrome performance trace of a 5 s scripted scroll and count dropped frames.

**Reference data for the ACs.** The ACs use Repertorium Publicum (`publicum`) as the reference repertory, and "the fixture" means scoring-spec fixture F1.

---

## 1. Repertory browser (REP)

#### REP-001 Repertory table of contents — P0
- **Desc:** The list of available repertories. Opening one shows its chapters.
- **RO:** [doc] The Repertories TOC opens with Ctrl/Cmd+1, favourites can be pinned (3.3), and documents can be ticked for a document mix.
- **Target:** The TOC panel has a Repertories tab listing each repertory with its title, language, grade scale and licence badge. Pinned favourites appear first. Opens with Alt+Shift+1, or Ctrl/Cmd+1 in PWA mode.
- **AC:**
  - Given publicum and kent-de are installed, the panel lists both, with their source rubric counts (74,667 and 68,741). Synthetic intermediate nodes created by the ETL (data-plan Phase 1, step 4) are not counted.
  - Clicking or pressing Enter on a repertory opens its first chapter in a repertory tab in under 500 ms (warm cache).
  - "Add to favourites" moves the item to the top, and the order persists after reload.

#### REP-002 Chapter chooser — P0
- **Desc:** A grid or list of the chapters of the active repertory.
- **RO:** [doc] The F2 chapter icons window; typing "MI" jumps to MIND.
- **Target:** A modal list of chapters with type-ahead that matches the chapter start first, then any substring.
- **AC:**
  - In publicum, typing "mi" and pressing Enter opens `Mind`.
  - Typing "ext" selects `Extremities`.
  - Esc closes the chooser without navigating.
  - Chapters are in source order (ordinal), not alphabetical.

#### REP-003 Hierarchical rubric rendering — P0
- **Desc:** Renders the chapter, main rubric and sub-rubric tree with indentation.
- **RO:** [doc] Kent/Synthesis hierarchy; the App shows main rubrics in blue and sub-rubrics in black; an empty parent is shown with a separator.
- **Target:** Main rubrics in `--rubric-main` semibold, sub-rubrics indented 16px per depth, and empty parents muted with "│" (interaction-map §2.4).
- **AC:**
  - `Mind, fear, alone, of being` renders at depth 2 under `Mind > fear`.
  - A rubric with 0 remedies and children renders in the muted style.
  - Indentation grows by exactly 16px (comfortable density) per level.
  - Rubric order matches the ETL ordinal.

#### REP-004 Remedy grade typography — P0
- **Desc:** Distinguishes remedy grades by typography and colour.
- **RO:** [doc, App] 1 plain, 2 blue italic, 3 red bold, 4 red bold capitals.
- **Target:** Tokens `--grade-1`…`--grade-5`. Case, weight and underline carry the grade even without colour. A colour-blind mode is available.
- **AC:**
  - A grade-1 remedy renders lower case and regular; grade 2 capitalised and italic; grade 3 capitalised and bold; grade 4 upper case, bold and underlined.
  - With colour-blind mode on, all grades share one colour and remain distinguishable.
  - Contrast is at least 4.5:1 in the light and dark themes (axe check).

#### REP-005 Remedy count per rubric — P0
- **Desc:** Shows the number of remedies next to each rubric.
- **RO:** [doc] "(54)" count, display mode 1.
- **Target:** A tabular-numeral count after the rubric text. It respects the active view (REP-019).
- **AC:**
  - The count equals the number of `rubric_remedy` rows visible in the active view.
  - With the "grade 3 only" view, the count drops to the grade-3 total.

#### REP-006 Spacebar display cycle — P0
- **Desc:** Cycles how much of each rubric is shown.
- **RO:** [doc] Space cycles: count only → abbreviations → abbreviations plus authors.
- **Target:** Space cycles modes 1→2→3→1; Shift+Space cycles backwards. Mode 3 shows source markers when the data has them (REP-018) and otherwise behaves like mode 2 plus a tooltip "no author data".
- **AC:**
  - Pressing Space three times returns to the starting mode.
  - The mode persists per repertory tab and appears in the URL (`display=`).
  - Space in an input field types a space and does not cycle.

#### REP-007 Symptom path breadcrumb — P0
- **Desc:** A clickable path for the current rubric.
- **RO:** [doc] The path at the top; clicking opens F3 (configurable to "up one level").
- **Target:** A sticky breadcrumb, 28px high. Clicking a segment navigates there. Clicking the path background opens F3 unless the local option says otherwise.
- **AC:**
  - Focusing `Mind, fear, alone, of being` shows `MIND › fear › alone, of being`.
  - Clicking `fear` focuses that rubric.
  - With the local option "Open F3 on path click" off, clicking the background does nothing.

#### REP-008 Type-to-jump — P0
- **Desc:** Typing letters in the repertory opens the chapter chooser pre-filtered.
- **RO:** [doc] "Just start to type any character of a chapter".
- **Target:** A letter key with no modifier and not in an input opens REP-002 with the letter pre-filled. With "stay in chapter" (REP-012), it opens Find at the current chapter instead.
- **AC:**
  - Pressing `m` while a rubric is focused opens the chooser showing "m".
  - The `+` and `=` keys never trigger type-to-jump; they go to the take parser.
  - Every letter a–z (including n, t, v, l and x) triggers type-to-jump; Alt+letter document toggles (interaction-map §3.3) never do.
  - In publicum, typing "n" then "o" and Enter opens `Nose`; typing "t" then "h" shows `Throat` among the matches.

#### REP-009 Keyboard rubric navigation — P0
- **Desc:** Moves through the tree with the keyboard.
- **RO:** [doc] Backspace/← moves up a level; [inf] arrow keys.
- **Target:** The keys in interaction-map §3.3: ↑/↓, Shift+↑/↓ for siblings, →, ←/Backspace, Home/End, PageUp/PageDown, Alt+↑/↓ for chapters.
- **AC:**
  - From a depth-2 rubric, Backspace focuses its depth-1 parent, and Backspace again focuses the chapter.
  - Shift+↓ skips the descendants and lands on the next sibling.
  - Alt+↓ at the last chapter does nothing and does not wrap.

#### REP-010 Find (F2), hierarchical browser — P0
- **Desc:** A column-browser picker for chapter → rubric → sub-rubric.
- **RO:** [doc] F2 Find; typing filters; Enter descends; take without leaving Find.
- **Target:** A three-column (or more) Miller-column dialog with a per-column type-ahead filter. `+` syntax, F6 and drag all work inside it.
- **AC:**
  - F2, then "mi" Enter, "fear" Enter, "alone" shows `alone, of being` highlighted.
  - `+2` Enter takes it into the default clipboard at intensity 2 and Find stays open.
  - Esc closes Find and focuses the last highlighted rubric.

#### REP-011 Find from current location (F3) — P0
- **Desc:** Opens Find at the current rubric.
- **RO:** [doc] F3; hand indicator.
- **Target:** The same dialog, opened with its columns set to the current path.
- **AC:**
  - With `Mind, fear` focused, F3 opens with the columns Mind › fear and focus on fear's children.
  - Backspace moves the focus to the parent column.

#### REP-012 "Stay in same chapter" option — P1
- **Desc:** Keeps typed navigation inside the current chapter.
- **RO:** [doc] A Find local option.
- **Target:** A repertory local option. When it is on, typing letters filters the current chapter's rubrics instead of the chapters.
- **AC:**
  - With the option on in Mind, typing "anx" lists the Mind rubrics that start with "anx" and never switches chapter.
  - The setting persists.

#### REP-013 One- or two-column layout — P1
- **Desc:** A book-like two-column flow of the rubric list.
- **RO:** [doc] A local option.
- **Target:** A toggle (Alt+L; plain letters are reserved for type-to-jump) that is enabled at widths of 1280px and above. Columns flow top to bottom, then left to right.
- **AC:**
  - Toggling keeps the focused rubric visible.
  - Below 1280px the toggle is disabled, with a tooltip explaining why.
  - Keyboard ↓ order is the same in both layouts.

#### REP-014 Cross-references — P1
- **Desc:** Displays cross-references (see, compare) between rubrics.
- **RO:** [doc] Collapsed as an icon with a hover list, or expanded inline; click to jump.
- **Target:** Collapsed "⇄n" chip or expanded inline list (Alt+X toggles). Sources are data cross-references (Phase 4 data; there are none in OOREP) and user cross-references (REP-030).
- **AC:**
  - A rubric with 2 user cross-references shows "⇄2"; hovering lists both targets.
  - Clicking a target navigates to it and pushes history.
  - Expanded mode renders the targets as links under the rubric.

#### REP-015 Referring / synonym rubrics — P2
- **Desc:** Empty rubrics that point to the synonym rubric holding the remedies.
- **RO:** [doc] Grey "..." or an inline grey synonym (3.1); toggled from the Tags button.
- **Target:** The synonym `xref` kind renders a grey "→ see X" line, and the Tags menu toggles it.
- **AC:**
  - With a synonym xref A→B, rubric A shows "→ B" in muted grey.
  - Toggling synonyms off hides the line.
  - Taking A with `+/x` includes B.

#### REP-016 Tags display — P1
- **Desc:** Per-rubric tag icons: bookmark, note, cross-reference, concept, miasm or user tag.
- **RO:** [doc] The Tags button shows all tags; a sub-menu chooses types.
- **Target:** A Tags dropdown with checkboxes per type. Icons render in the rubric row (interaction-map §2.5). Alt+T toggles all.
- **AC:**
  - Bookmarking a rubric shows the bookmark icon immediately.
  - Unticking "Bookmarks" hides the icon but not the bookmark itself.
  - The settings persist per user.

#### REP-017 Remedy and author tooltips — P0
- **Desc:** Hovering over a remedy abbreviation shows its full name.
- **RO:** [doc] "Show tooltips on remedies and authors (advised on)".
- **Target:** A tooltip after 300 ms showing the full Latin name, kingdom and grade in this rubric. Long-press on touch. It can be switched off in local options.
- **AC:**
  - Hovering `Acon.` in a rubric where it has grade 3 shows "Aconitum napellus · Plant · grade 3".
  - With tooltips off, nothing appears.
  - Tooltips are keyboard-reachable (focus plus 300 ms delay).

#### REP-018 Author and source markers — P2
- **Desc:** Per-remedy source attribution in display mode 3.
- **RO:** [doc] Underlined authors, `°` for modern provings, `*` hypothetical, `~` veterinary, ↓ copied from a sub-rubric; double-click opens the source text.
- **Target:** Superscript source abbreviations from `rubric_remedy.source_id` and user additions. This is only meaningful once multiple sources exist (DAT-016+).
- **AC:**
  - A user-added remedy shows a "me" marker in mode 3.
  - Double-clicking the marker opens the addition's source note.
  - A remedy with 2 sources shows both markers.

#### REP-019 Repertory views (source filters) — P1
- **Desc:** Named filters over which remedy entries are shown.
- **RO:** [doc] Full Synthesis (with and without remedies copied from sub-rubrics), Millennium, Quantum, Modern (till 1987), Classic Kent (till 1916), Pioneers (till 1843), plus Kent and Provings, Kent and Clinical Verification, Vithoulkas and Brunson views (8 presets in the top package). One button shows the excluded count and lists the filtered remedies on hover; another hides rubrics left empty by the view (REP-020).
- **Target:**
  - Views: Full, Grades 2+, Grade 3 only, Without my additions, Only my additions, plus source-based views once the data allows.
  - The view selector (Alt+V) sits in the local toolbar.
  - The excluded count shows as "−n" and hovering lists the remedies.
  - The analysis uses the active view (ANA-024).
- **AC:**
  - In the Grades 2+ view, no grade-1 remedy is shown, and "−k" equals the number hidden.
  - Hovering "−k" lists those k remedies.
  - Switching views updates counts without a reload.

#### REP-020 Hide empty rubrics in the view — P2
- **Desc:** Hides rubrics that have no remedies under the current view.
- **RO:** [doc] A view button.
- **Target:** A toggle in the view menu.
- **AC:**
  - In the Grade 3 only view with "hide empty" on, no rubric with count 0 and no children is rendered.
  - Parents that have visible children stay visible.

#### REP-021 Custom repertory views — P2
- **Desc:** User-defined filters.
- **RO:** [doc] Create and edit views (Everyday package and up).
- **Target:** A view editor with rules: minimum grade, include or exclude sources, include or exclude kingdoms or families, and include user additions.
- **AC:**
  - Create "Plants grade 2+", apply it, and only plant remedies of grade 2 or higher are shown.
  - The view is saved, renamable and deletable, and is usable in the analysis.

#### REP-022 Current rubric indicator and cursor memory — P1
- **Desc:** Marks the current rubric and restores the position.
- **RO:** [doc] Hand indicator; 3.2 reverts to the previous cursor position.
- **Target:** A 3px accent bar with `aria-current`. Each repertory tab remembers its focused rubric and scroll offset across tab switches and reloads.
- **AC:**
  - Focus a deep rubric, switch tab, switch back: the same rubric is focused and in view.
  - After a reload the tab reopens at the same rubric.

#### REP-023 Multiple repertories open — P1
- **Desc:** More than one repertory open at the same time.
- **RO:** [doc] All repertories stack in one tab, with a triangle to switch.
- **Target:** Each repertory opens in its own tab. The "group by kind" setting stacks them in one tab with a switcher dropdown.
- **AC:**
  - Opening publicum then kent-de gives 2 tabs (grouping off) or 1 tab with a switcher showing 2 entries (grouping on).
  - Clipboards accept rubrics from both, and each clipboard row shows its repertory abbreviation.

#### REP-024 Document language — P2
- **Desc:** Shows a repertory in another language, or bilingually.
- **RO:** [doc] "Show this document in", with an additional language shown side by side.
- **Target:** The UI chrome is i18n (WS-025). Repertories are separate documents per language (publicum EN, kent-de DE). Cross-language rubric mapping is out of scope until mapping data exists.
- **AC:**
  - The language badge shows EN or DE per repertory.
  - The search language filter (SRC-009) restricts results to that language.

#### REP-025 Remedy abbreviation interactions — P0
- **Desc:** Clicking, double-clicking and the context menu on a remedy in a rubric.
- **RO:** [doc] Double-click opens the Remedy Information Window; right-click searches repertories, references and the web.
- **Target:** A single click selects. Double-click or Enter opens Remedy Info in the inspector (MM-006). Context menu per interaction-map §4.2.
- **AC:**
  - Double-clicking `Sulph.` opens the inspector with sulph within 300 ms.
  - The context menu "Search this remedy in all repertories" opens a search tab with the remedy query.

#### REP-026 Virtualised rendering and performance — P0
- **Desc:** Smooth browsing of chapters with thousands of rubrics.
- **RO:** — (native app).
- **Target:** A windowed list with variable row heights. Chapter shards load lazily.
- **AC:**
  - Opening the largest publicum chapter renders its first screen in under 300 ms after the shard is cached.
  - Scrolling holds at least 55 fps on reference hardware (Chrome performance trace).
  - Memory stays under 300 MB with 3 repertory tabs open.

#### REP-027 Rubric permalink — P1
- **Desc:** A stable URL for each rubric.
- **RO:** —
- **Target:** `/r/:repertory/:rubricId`. "Copy link" is in the context menu.
- **AC:**
  - Pasting a copied link into a new tab opens the same rubric focused.
  - Rubric ids are stable across data rebuilds of the same source version (ETL determinism).

#### REP-028 Personal addition: add a remedy to a rubric — P1
- **Desc:** The user adds a remedy with a grade to an existing rubric.
- **RO:** [doc] Additions (Diamond): add a remedy, optionally with a materia medica link and author reference.
- **Target:** Context menu Additions ▸ Add remedy. Fields: remedy (autocomplete), grade, source or author (free text), note, and an optional MM link. Stored in the user layer.
- **AC:**
  - Adding `lyc` grade 2 to a rubric shows it with the "personal" marker, and the count increases by 1.
  - The addition is included in the analysis (fixture: an added remedy covers the line).
  - Editing and removing work and can be undone.
  - The "Without my additions" view hides it.

#### REP-029 Personal rubrics and personal chapter — P2
- **Desc:** New user rubrics and sub-rubrics, and a Personal chapter.
- **RO:** [doc] 3.0: new symptoms and sub-rubrics, and a Personal Chapter usable during a consultation.
- **Target:** Additions ▸ Add sub-rubric under any rubric, plus a "Personal" chapter per repertory. Personal rubrics hold remedies from REP-028.
- **AC:**
  - Creating `Mind, fear, of elevators (personal)` shows it under `fear` with the personal marker.
  - It can be taken and analysed like any rubric.
  - It persists after reload and appears in an additions export (IO-011).

#### REP-030 Personal cross-references and referring rubrics — P2
- **Desc:** User-defined links between rubrics.
- **RO:** [doc] 3.0: your own cross-references and referring rubrics.
- **Target:** Additions ▸ Add cross-reference (kind: see, compare or synonym) to any rubric in any repertory.
- **AC:**
  - Adding A→B shows "⇄1" on A.
  - `+/x` on A takes A and B as one group.
  - Deleting the cross-reference removes the chip.

#### REP-031 Custom synonyms — P2
- **Desc:** User word synonyms that feed search.
- **RO:** [doc] Custom synonyms (Diamond).
- **Target:** Settings → Search → Synonyms: pairs of words, applied as query expansion.
- **AC:**
  - Adding "anxiety ↔ anguish" makes a search for "anguish" also return rubrics containing "anxiety".
  - The synonyms can be exported and imported.

#### REP-032 Additions layer toggle and metadata — P1
- **Desc:** Shows or hides all user additions, with author, source and date on each.
- **RO:** [doc] Additions with author references; they are separate from Synthesis.
- **Target:** A global "My additions" switch in the status bar. Each addition stores the author (user), the source text and created/updated timestamps.
- **AC:**
  - Switching it off removes all personal remedies, rubrics and cross-references from display and analysis in under 200 ms.
  - The tooltip on a personal remedy shows its source and date.

#### REP-033 Custom repertory builder — P2
- **Desc:** A user-authored repertory with alphabetical structure.
- **RO:** [doc] The 3.3 bundle: your own repertories in any language.
- **Target:** Create a new repertory document: chapters, rubrics, remedies and cross-references. It behaves like an installed repertory.
- **AC:**
  - Create a repertory "My clinical" with 1 chapter and 3 rubrics, then take and analyse from it.
  - It appears in the TOC with a "personal" badge.
  - It can be exported and imported as JSON.

#### REP-034 Family pseudo-remedies in rubrics — P2
- **Desc:** Family abbreviations shown as pseudo-remedies (`solanac*`) within rubrics.
- **RO:** [doc] Adonis family-remedies, with highlight, sort and position options.
- **Target:** An optional display that computes, per rubric, the families with at least 2 members present (FAM data). They are shown with `*` and a dotted underline at the start or end of the list.
- **AC:**
  - With the option on and 2 Solanaceae remedies in a rubric, `Solanaceae*` appears.
  - Its tooltip lists the members.
  - With the option off, nothing appears.

#### REP-035 Copy rubric — P0
- **Desc:** Copies a rubric to the system clipboard.
- **RO:** [doc] Ctrl/Cmd+C copies with remedies; Shift+Ctrl/Cmd+C copies the text only.
- **Target:** The same keys. The copy contains HTML (grade styling) and plain text: `MIND - FEAR - alone, of being (54): acon. ARS. …`.
- **AC:**
  - Pasting into a plain-text editor gives the path, count and remedy list with grade-4 remedies in capitals.
  - The Shift variant copies the path only.

#### REP-036 Minimum-grade filter — P1
- **Desc:** A quick filter that hides remedies below a grade.
- **RO:** — (Complete Dynamics has one on keys 1–4).
- **Target:** Local-toolbar buttons 1/2/3/4 (min grade). This is display-only and does not change the analysis.
- **AC:**
  - Min grade 3 shows only grade-3 and higher remedies in rubric lists.
  - The counts show "12 of 54".
  - The analysis results are unchanged.

#### REP-037 Remedy order within a rubric — P1
- **Desc:** Sorts the remedies in a rubric alphabetically or by grade.
- **RO:** [inf] alphabetical; Complete Dynamics has Shift+Space for order.
- **Target:** A local option "Order remedies: alphabetical | grade then alphabetical".
- **AC:**
  - With "grade then alphabetical", grade-3 remedies come first, then grade 2, then grade 1, each group alphabetical.

#### REP-038 Polar rubric marker — P2
- **Desc:** Marks rubrics that have a polar opposite (TPB).
- **RO:** [doc] Yin-yang icon in the Boenninghausen TPB.
- **Target:** A ☯ icon on rubrics with a curated opposite (DAT-017). Clicking it jumps to the opposite.
- **AC:**
  - A TPB rubric with an opposite shows ☯.
  - Clicking it navigates to the opposite.
  - Taking it into a clipboard auto-fills the line's `polarOppositeRubricId`.

---

## 2. Search (SRC)

#### SRC-001 Quick search and command-palette search — P0
- **Desc:** A fast search box in the top bar.
- **RO:** [doc] A quick search box on the default location, "for experienced users".
- **Target:** Ctrl/Cmd+K palette. It shows commands, rubrics (current repertory), remedies and open documents in one list, and prefixes scope it: `>` commands, `@` remedies, `#` rubrics.
- **AC:**
  - Typing "fear alone" lists `Mind, fear, alone, of being` within 150 ms (cached index).
  - Enter navigates there.
  - Typing ">theme" lists "Toggle theme".

#### SRC-002 Simple search (F4 or ?) — P0
- **Desc:** A word search over rubric texts, with fields.
- **RO:** [doc] F4, one word per field, Enter adds a field, scope and language flag.
- **Target:** A dialog with a single query line plus optional extra fields, a scope selector (SRC-006) and a results tab (SRC-012).
- **AC:**
  - In publicum, "fear" plus "alone" returns every rubric whose path contains both words, including `Mind, fear, alone, of being`.
  - Results appear in under 300 ms for the whole repertory.
  - `?` opens the dialog only when focus is not in a text field.

#### SRC-003 Boolean operators — P0
- **Desc:** AND, OR and NOT.
- **RO:** [doc] AND with `&` or a space (default), OR with `|`, NOT with `!`.
- **Target:** The same syntax, plus parentheses [OURS] and quoted phrases.
- **AC:**
  - "dream cats ! dogs" returns rubrics containing dream and cats but not dogs.
  - "fear | anxiety" returns the union.
  - `"alone, of being"` matches the phrase exactly.

#### SRC-004 Wildcards — P0
- **Desc:** Prefix, suffix and infix wildcards.
- **RO:** [doc] `*word`, `word*`, `*word*`.
- **Target:** The same syntax.
- **AC:**
  - "throb*" matches throbbing and throbs.
  - "*ache" matches headache.
  - "*ach*" matches stomach and headache.

#### SRC-005 Root and branch expansion — P1
- **Desc:** A root word automatically includes its word forms.
- **RO:** [doc] With no asterisk, the search includes every branch word; right-click lists them.
- **Target:** A stem-based expansion from a build-time word-form table (DAT-011). A "branches" popover per query term lets the user untick forms.
- **AC:**
  - "burn" also matches burning and burns.
  - The popover lists the matched forms with counts.
  - Unticking "burns" re-runs without it.

#### SRC-006 Search scope — P0 (mix and area are P1)
- **Desc:** Where to search.
- **RO:** [doc] Current document, open documents, all documents, document mix or Search Area.
- **Target:** A dropdown with the same five options. It defaults to "Current document".
- **AC:**
  - With scope "All documents", a word found in both publicum and kent-de returns results from both, grouped by document.
  - With "Current document", results come from one document only.

#### SRC-007 Document mix — P1
- **Desc:** A named set of documents used as a search scope.
- **RO:** [doc] TOC checkboxes, "Save selection as document mix", and a default mix at startup.
- **Target:** TOC checkboxes, then "Save as mix…". Mixes appear in the scope dropdown, and one can be set as the default.
- **AC:**
  - Tick publicum and Boericke, save as "Core", then search with scope Core: only those two documents return hits.
  - The default mix is preselected after reload.

#### SRC-008 Search Area — P1
- **Desc:** Restricts the search to chosen chapters or rubrics.
- **RO:** [doc] Drag chapters or main rubrics onto the "Search Area" button.
- **Target:** Drag onto the Search Area chip, or use the context menu "Add to Search Area". The chip shows a count, and × clears it.
- **AC:**
  - With the area set to `Mind`, searching "fear" returns only Mind rubrics.
  - Adding `Stomach` makes the results come from both chapters.
  - Clearing restores the full scope.

#### SRC-009 Language filter — P2
- **Desc:** Limits the search to documents in one language.
- **RO:** [doc] Language flag; bilingual documents are searched in their first language.
- **Target:** A language dropdown (All, EN, DE, …).
- **AC:**
  - With DE, searching "Angst" returns kent-de results only.

#### SRC-010 Remedy search with filters — P0
- **Desc:** Finds the rubrics that contain a remedy.
- **RO:** [doc] Pick "(Remedy)" from autocomplete; filters for degrees, minimum and maximum rubric size, and maximum co-remedies.
- **Target:** `@remedy` or the remedy autocomplete entry. The filter popover has: grades (multi-select), min and max rubric size, max co-remedies, and chapter.
- **AC:**
  - "@lach" with grades {3} and max rubric size 10 returns only rubrics where lach is grade 3 and the rubric has 10 or fewer remedies.
  - The result count matches a direct query on the data (test fixture).

#### SRC-011 Family search — P1
- **Desc:** Finds rubrics containing members of a family.
- **RO:** [doc] Type the family name or pick a family-remedy (`*`).
- **Target:** A `family:<name>` term or an autocomplete entry. Options: at least k members present (default 1), and a minimum grade.
- **AC:**
  - `family:Solanaceae` with k = 2 returns only rubrics with 2 or more Solanaceae members.
  - Each result shows the matching members.

#### SRC-012 Results list and taking results — P0
- **Desc:** The result tab: a list of rubrics with selection and take actions.
- **RO:** [doc] Right-click takes the selected or all rubrics, or creates a combined rubric.
- **Target:**
  - Results are grouped by document and chapter, with the match terms highlighted, a count and checkboxes.
  - Context menu per interaction-map §4.13.
  - Dragging one ticked result takes all ticked results.
- **AC:**
  - Tick 3 results and choose "Take selected at intensity 2": 3 lines appear in the default clipboard at intensity 2.
  - "Take all and create combined rubric" creates 1 combined line whose remedies are the union with the maximum grade.
  - The result header shows "n rubrics in m chapters".

#### SRC-013 Advanced search (F5) — P1
- **Desc:** A guided multi-field search with proximity.
- **RO:** [doc] F5, one word per box, proximity control, blue branch-words icon.
- **Target:** A form with word fields (each with its own branches popover), proximity (same rubric segment / same rubric / within N words for MM), and remedy and family criteria.
- **AC:**
  - Words "pain" and "burning" with proximity "same segment" match `…, pain, burning` but not rubrics where the two words are in different path segments.
  - F5 is intercepted and does not reload the page (Chromium and Firefox). Ctrl/Cmd+Shift+F also opens the form.

#### SRC-014 Remedy comparison search — P1
- **Desc:** Compares where 2–10 remedies occur.
- **RO:** [doc] Several remedy boxes and three comparison methods, e.g. "Symptoms with at least one of these remedies".
- **Target:** Methods: all present, any present, only the first present (unique). The result table shows each rubric with a grade column per remedy.
- **AC:**
  - With {lach, lyc} and "all present", every result rubric contains both.
  - With "only the first present", every result contains lach and not lyc.
  - The grade columns match the data.

#### SRC-015 Combined word and remedy search — P1
- **Desc:** Word criteria plus remedy presence.
- **RO:** [doc] For example, a symptom containing X where Lach or Lyc is present.
- **Target:** The query syntax allows `fear @lach|@lyc`.
- **AC:**
  - Returns only rubrics that contain "fear" and have lach or lyc.
  - The results equal the intersection of SRC-002 and SRC-010 run separately.

#### SRC-016 Multiple search tabs — P0
- **Desc:** Earlier results stay open.
- **RO:** [doc] Multiple search windows.
- **Target:** Each search opens a new tab (the setting "reuse the search tab" is off by default). The tab title is the query.
- **AC:**
  - Running 3 searches gives 3 tabs.
  - Each tab keeps its own ticks and scroll after switching.

#### SRC-017 Graphical comparison of search tabs — P2
- **Desc:** Which remedies satisfy all of the open searches.
- **RO:** [doc] The "unique graphic analysis of any search", across several tabs.
- **Target:** Select 2 or more search tabs and choose "Compare": a bar chart of the remedies by the number of tabs in which they appear in any result rubric, with each remedy's maximum grade per tab.
- **AC:**
  - With tabs "injury head" and "convulsions", a remedy present in both scores 2.
  - Clicking a bar lists the contributing rubrics.

#### SRC-018 Materia medica full-text search — P1
- **Desc:** Searches the reference texts.
- **RO:** [doc] Whole-library search; double-clicking a hit jumps to it.
- **Target:** The same dialog with an MM scope. Results show a snippet with highlights. Enter opens the book at the section with the hit highlighted.
- **AC:**
  - Searching "craving salt" in Boericke returns the Nat-m section among the results.
  - Opening a hit scrolls to it and highlights it.
  - The first MM search builds its index in a Worker without freezing the UI (no long task over 200 ms).

#### SRC-019 Search personal content — P1
- **Desc:** Includes the user's notes, additions and bookmarks in search.
- **RO:** [doc] Searches personal notes, personal keynotes and personal family notes.
- **Target:** The scope option "Include my content" (on by default for All).
- **AC:**
  - A note containing "elevator" is found by searching "elevator".
  - The result links to the rubric carrying the note.

#### SRC-020 Everyday-language rubric suggestions — P2
- **Desc:** Translates the patient's words into rubrics.
- **RO:** [doc] Concepts ("translate the language of the patients into the language of the repertory"), proprietary.
- **Target:** A suggestions panel. A local synonym/embedding index (built from open data only) maps a phrase to the top 10 rubrics, each with a confidence and a take button. This is opt-in and runs locally.
- **AC:**
  - "scared of being by myself" returns `Mind, fear, alone, of being` in the top 5 (golden set of 50 phrases, at least 70% top-5 recall).
  - No network call is made by default.

#### SRC-021 Concept index (open, user-curated) — P2
- **Desc:** Named concepts that link to lists of rubrics.
- **RO:** [doc] Concept repertories (proprietary titles).
- **Target:** A user-created concept document: a name plus a list of rubric links, searchable, and takeable as a group.
- **AC:**
  - Create a concept "Abandonment" with 4 rubrics. Taking the concept with `+/x` semantics adds 4 grouped lines.

#### SRC-022 Search history and saved searches — P2
- **Desc:** Recalls earlier queries.
- **RO:** —
- **Target:** The search dialog keeps the last 50 queries and offers a star to save one.
- **AC:**
  - Re-running a history item restores its query, scope and filters exactly.

#### SRC-023 Result presentation — P0
- **Desc:** Result highlighting, grouping and navigation.
- **RO:** [inf] A rubric list.
- **Target:** Matches are highlighted, results are grouped by chapter with counts, and the keyboard works: ↑/↓ moves, Space ticks, Enter opens.
- **AC:**
  - Every visible result highlights every matched term.
  - Space toggles the tick without scrolling.
  - Chapter groups are collapsible.

#### SRC-024 Typo tolerance — P1
- **Desc:** Fuzzy matching for misspellings.
- **RO:** —
- **Target:** When a query returns 0 exact hits, a "Did you mean" suggestion appears, based on edit distance ≤ 1 for terms of 5 or more letters.
- **AC:**
  - "throbing" suggests "throbbing".
  - Accepting the suggestion runs the corrected search.

#### SRC-025 Case remedy and case pathology search — P1
- **Desc:** Searches the patient files from the search dialog: every case in which a remedy was prescribed, or every case with a pathology.
- **RO:** [doc] Search types "Case remedy" (all cases in which a remedy was prescribed; double-click opens the full case) and "Case pathology".
- **Target:** A "Patient cases" scope in the search dialog (interaction-map §6 flow 3). `@remedy` in this scope runs PAT-020 `remedy:`; a pathology term runs `icd:` or a label match. Results list patient (or pseudonym in congress mode), consultation date, remedy, potency and GHHOS badge. Hidden while the patient store is locked (PAT-024 gate).
- **AC:**
  - On the 20-patient fixture, `@nux-v` in the Patient cases scope returns exactly the consultations whose prescriptions include nux-v, newest first.
  - Double-clicking a result opens that consultation in the case view.
  - With the app locked, the scope is absent from the dropdown and no patient data is read (IndexedDB access log shows no patient-store reads).
  - In congress mode (PAT-026) the result rows show pseudonyms only.

---

## 3. Clipboards and case symptoms (CLP)

#### CLP-001 Multiple clipboards — P0
- **Desc:** Several symptom lists in one workspace.
- **RO:** [doc] 1, 3, 6 or 12 clipboards depending on the licence.
- **Target:** 12 by default, addable up to 30, with no licence tiers. They appear as numbered icons in the rail.
- **AC:**
  - A new workspace shows 12 empty clipboards.
  - "+" adds number 13.
  - A 31st cannot be added (the button is disabled, with a tooltip).
  - Deleting a clipboard renumbers the later ones, with confirmation.

#### CLP-002 Default clipboard — P0
- **Desc:** The target for takes with no explicit clipboard number.
- **RO:** [doc] Alt+click or right-click → Set as default.
- **Target:** The same, shown with a filled ring. The status bar shows the default.
- **AC:**
  - Alt+click clipboard 3, then `+` Enter: the rubric lands in 3.
  - The default persists after reload.

#### CLP-003 Rename and colour clipboards — P1
- **Desc:** Custom names, with an option to save a name as the default.
- **RO:** [doc] Change name, "save as default name".
- **Target:** Rename (inline edit) with a "Use as default name for new workspaces" option, and a colour from 8 tokens.
- **AC:**
  - Renaming 2 to "Acute" shows "Acute" in the tooltip, the expanded rail and the analysis header.
  - With the default-name option on, a new workspace starts with clipboard 2 named "Acute".

#### CLP-004 Take mini-language — P0
- **Desc:** Keyboard take commands.
- **RO:** [doc] `+`↵, `=`, `+n`, `+n>m`, `+!`, `+a`, `+/s`, `+/x`.
- **Target:** The grammar in interaction-map §3.3, a superset of RO. An inline HUD shows the parsed command as the user types.
- **AC:**
  - `+3>2!` Enter adds the focused rubric to clipboard 2 at intensity 3 as eliminative.
  - `=` takes immediately at intensity 1 into the default clipboard.
  - `+9` Enter shows the error "intensity 0–4" and takes nothing.
  - `+!-` is rejected.
  - A screen reader announces each take.

#### CLP-005 Take by drag and drop — P0
- **Desc:** Drag a rubric onto a clipboard icon.
- **RO:** [doc] Drag onto a clipboard; intensity 1; multiple ticked results go together.
- **Target:** HTML5 drag and drop (or pointer events on touch). The drop target highlights. Dropping on the expanded list inserts at the drop position.
- **AC:**
  - Dragging a rubric to clipboard 4 adds it at intensity 1.
  - Dragging one of 5 ticked search results adds all 5.
  - Keyboard alternative: context menu Take ▸ Into clipboard ▸ 4.

#### CLP-006 Take with options (F6) — P0
- **Desc:** A dialog with all take options.
- **RO:** [doc] Intensity, eliminative, exclusive, causative, group letter, sub-rubrics, cross-references and clipboard number.
- **Target:** The same fields plus category and note. The last-used values are remembered.
- **AC:**
  - F6 opens with the focused rubric's path shown.
  - Setting intensity 4, exclusive and clipboard 5 then OK creates that line.
  - Enter confirms and Esc cancels.

#### CLP-007 Take via button, menu and context menu — P0
- **Desc:** Take without the keyboard.
- **RO:** [doc] The local Take button with a submenu, and the Take menu.
- **Target:** The local toolbar Take split-button (click = default take; ▾ = intensities, clipboards, options) and context menu §4.1.
- **AC:**
  - Each path produces a line identical to the equivalent keyboard take (same fields).

#### CLP-008 Take with sub-rubrics as a group — P1
- **Desc:** Takes a rubric and all its descendants as one grouped line.
- **RO:** [doc] `+/s`.
- **Target:** Creates one combine-group line whose members are the rubric and its descendants, with n equal to the size of the union.
- **AC:**
  - `+/s` on a rubric with 3 sub-rubrics adds 1 group line with 4 members.
  - In the analysis each remedy takes its maximum grade across the members (scoring-spec T9 semantics).

#### CLP-009 Take with cross-references — P2
- **Desc:** Takes a rubric plus its cross-references as a group.
- **RO:** [doc] `+/x`, or Ctrl/Cmd+click to take only selected cross-references.
- **Target:** The same. Ctrl/Cmd+click on cross-reference chips preselects them.
- **AC:**
  - With 2 cross-references, `+/x` creates a group of 3 members.
  - With one cross-reference Ctrl/Cmd+clicked, a normal take creates a group of 2.

#### CLP-010 Materia medica text as a link symptom — P2
- **Desc:** Takes selected MM text into a clipboard.
- **RO:** [doc] "link symptom"; double-clicking it jumps back; it can be included in the analysis.
- **Target:** Select text, then "Take as link symptom". The line kind is `mmLink`. It contributes grade 1 for the chapter's remedy when "Include MM symptoms in analysis" is on (default off).
- **AC:**
  - The line shows a book icon, and double-clicking opens the book at the highlighted text.
  - With the setting on, the book's remedy gains coverage of 1 in the analysis.

#### CLP-011 Intensity 0–4 — P0
- **Desc:** Sets the weight of a symptom.
- **RO:** [doc] Keys 1–4; 0 keeps the line but ignores it; multi-select applies to all.
- **Target:** The same keys, plus an intensity chip menu on each row.
- **AC:**
  - Select 3 rows and press 2: all three show intensity 2 and the analysis re-ranks within 150 ms (the ANA-026 budget).
  - Pressing 0 greys the row out and the line no longer affects the analysis (scoring-spec E3).

#### CLP-012 Eliminative and exclusive — P0
- **Desc:** Symptom qualifications that filter remedies.
- **RO:** [doc] Eliminative keeps only the remedies in the symptom; exclusive removes them.
- **Target:** The E and X keys, or menu → Qualification. The row shows an E or X chip.
- **AC:**
  - Setting fixture R4 eliminative yields scoring-spec T7.
  - Setting R2 exclusive yields T8.
  - Setting E on a row that has X replaces X; the two are mutually exclusive.

#### CLP-013 Causative flag — P2
- **Desc:** Marks a symptom as a cause ("ailments from").
- **RO:** [doc] Causative, used by the VES.
- **Target:** The C key and a chip. It is used by the composite strategy's options and otherwise stored only.
- **AC:**
  - The flag persists and exports.
  - The composite strategy can be configured to weight causative lines ×2.
  - Other strategies are unaffected (their test vectors still pass).

#### CLP-014 Group by letter — P1
- **Desc:** Several lines counted as one symptom.
- **RO:** [doc] `+a`, "original symptoms remain but are calculated as one".
- **Target:** G then a letter, or menu → Group. Grouped rows show a coloured letter chip and a bracket in the list.
- **AC:**
  - Grouping fixture R1 and R3 under "a" produces the T9 results.
  - Ungrouping restores the T1 results.
  - The group's intensity is the maximum of its members (scoring-spec §2 step 2).

#### CLP-015 Combine or cross into a new rubric — P1
- **Desc:** Creates a single new line from several.
- **RO:** [doc] Combine gives a new rubric with the union at maximum degree; Complete Dynamics also offers cross (intersection at minimum).
- **Target:** Menu → Combine or Cross. The originals are replaced by one line (Undo restores them). The line is named "A ∪ B" or "A ∩ B" and can be renamed.
- **AC:**
  - Cross of R1 and R3 yields T10 grades.
  - Combine yields the T9 grades on a single line.
  - Undo returns the two original lines at their positions.

#### CLP-016 Reorder symptoms — P0
- **Desc:** Changes the line order.
- **RO:** [doc] Ctrl/Cmd+↑/↓ or Move.
- **Target:** Keys, drag handles and the menu.
- **AC:**
  - Ctrl/Cmd+↑ on row 2 makes it row 1.
  - The order persists.
  - The analysis rows follow the clipboard order.

#### CLP-017 Sort symptoms — P1
- **Desc:** Sorts a clipboard.
- **RO:** [doc] Homeopathic order ascending, intensity descending, alphabetical, rubric size.
- **Target:** Clipboard menu → Sort ▸ four options. Homeopathic order is the chapter ordinal, then the rubric ordinal.
- **AC:**
  - Sorting by intensity descending puts the intensity-4 rows first and keeps the original order among ties (a stable sort).
  - Homeopathic order puts Mind before Generalities rubrics, following the repertory's chapter ordinals.

#### CLP-018 Move or copy between clipboards — P0
- **Desc:** Transfers lines between clipboards.
- **RO:** [doc] Drag a symptom to another clipboard.
- **Target:** Drag rows onto a rail icon (move; Alt-drag copies) or use the menu Move to / Copy to.
- **AC:**
  - Moving 2 rows from 1 to 3 changes the counts from 1:5, 3:0 to 1:3, 3:2.
  - Copy keeps both.
  - Undo reverses the move.

#### CLP-019 Remove and clear — P0
- **Desc:** Deletes lines or clears clipboards.
- **RO:** [doc] Clear this clipboard; clear all.
- **Target:** Delete key; menu Clear this / Clear all, with a confirmation for more than 3 lines. Undo is available.
- **AC:**
  - Clear all empties every clipboard, and Ctrl/Cmd+Z restores them completely, including intensities, qualifiers, groups and notes.

#### CLP-020 Symptom notes — P1
- **Desc:** Free-text notes on a clipboard line.
- **RO:** — (not documented in the clipboard).
- **Target:** N key or menu → Edit note. The row shows a note icon and the text as a tooltip. Notes are included in saves and exports and excluded from shared anonymised exports on request.
- **AC:**
  - A note persists after reload and after save and recall.
  - A search of personal content (SRC-019) finds it.

#### CLP-021 Symptom category — P1
- **Desc:** SRP, mental, general or particular for each line.
- **RO:** — (a clinical method, used by the VES implicitly).
- **Target:** Auto-derived from the chapter (scoring-spec §1.4) and overridable in the menu. A small chip shows it.
- **AC:**
  - A Mind rubric defaults to mental and a Stomach rubric to particular.
  - Overriding to SRP changes the kent strategy's score as κ = 4 predicts.

#### CLP-022 Duplicate detection — P1
- **Desc:** Prevents taking the same rubric twice into one clipboard.
- **RO:** [inf]
- **Target:** Scoring-spec E4 and E5: the same rubric in the same clipboard updates the existing line and shows a toast; across clipboards it shows a badge.
- **AC:**
  - Taking the same rubric twice at intensities 1 then 3 leaves one line at intensity 3 and shows the toast "Updated existing symptom".

#### CLP-023 Symptom row display — P0
- **Desc:** What each clipboard line shows.
- **RO:** [doc] Intensity, rubric path, remedy count, group letter.
- **Target:** Intensity chip, qualifier chip, group chip, category chip, the repertory abbreviation, the full path (truncated with a tooltip), n, and a note icon.
- **AC:**
  - A line taken from publicum at intensity 2 as eliminative shows "2", "E", "publicum", the path and n.
  - At 360px width the path wraps without horizontal scroll.

#### CLP-024 Clipboard selection for the analysis — P0
- **Desc:** Which clipboards feed the analysis.
- **RO:** [doc] Clicking one analyses only it; Ctrl/Cmd+click adds others; the Analysis icon uses all non-empty ones.
- **Target:** The same behaviour. Selected clipboards show a check. "All non-empty" is the default when nothing is selected.
- **AC:**
  - Clicking clipboard 2 analyses only 2's lines.
  - Ctrl/Cmd+clicking 3 analyses the union of 2 and 3.
  - Clearing the selection analyses all non-empty clipboards.

#### CLP-025 Save analysis — P0
- **Desc:** Saves the whole clipboard set.
- **RO:** [doc] Save to a folder with a name and description; Ctrl/Cmd+S.
- **Target:** Ctrl/Cmd+S opens a dialog with name, description, folder (tree) and an "include result snapshot" checkbox (default on). The saved object includes the AnalysisInput and the data version.
- **AC:**
  - Saving, clearing everything and recalling restores the lines, clipboards, names, strategy and parameters identically (deep-equal).
  - The saved list shows the name, date and symptom count.

#### CLP-026 Recall analysis with merge — P0
- **Desc:** Loads a saved analysis.
- **RO:** [doc] Recall, with a checkbox "Merge with current case".
- **Target:** Ctrl/Cmd+O opens a dialog with the folders and patient analyses. The merge option appends into the matching clipboard numbers and de-duplicates (CLP-022).
- **AC:**
  - Recalling without merge replaces the current set (undoable).
  - With merge, a saved clipboard 1 with 3 lines merged into a current clipboard 1 with 2 lines (1 shared) gives 4 lines.

#### CLP-027 Clipboard persistence — P0
- **Desc:** Clipboards survive a reload or crash.
- **RO:** [inf] Clipboards persist between sessions.
- **Target:** Every mutation is written to IndexedDB within 500 ms (debounced).
- **AC:**
  - Take 3 rubrics and hard-reload within 1 s: all 3 are present.
  - Killing the tab mid-edit loses at most the last 500 ms.

#### CLP-028 Polar opposite linking — P2
- **Desc:** Links a line to its opposite rubric for polarity analysis.
- **RO:** [doc] TPB polar pairs create the "Opposite polar symptoms" virtual clipboard.
- **Target:** Filled automatically from the curated pairs (REP-038) and editable with the menu "Set opposite rubric…".
- **AC:**
  - A polar TPB line shows ☯ and its opposite's path in a tooltip.
  - The polarity view lists it under the virtual clipboard.

#### CLP-029 Generalisation links — P2
- **Desc:** Links a particular line to general rubrics (Boenninghausen).
- **RO:** — (a clinical method).
- **Target:** Menu → Generalise ▸ link general rubric(s).
- **AC:**
  - Linking produces the g_eff values of scoring-spec T22 in the boenninghausen strategy.

#### CLP-030 Per-clipboard weight — P2
- **Desc:** A multiplier applied to every line of a clipboard.
- **RO:** —
- **Target:** Clipboard menu → Weight (0.5, 1, 2, 3).
- **AC:**
  - With clipboard 2 at weight 2, its lines' i_s double in the analysis (DI changes by the expected amount).
  - The multiplier appears in the analysis header.

---

## 4. Analysis engine (ANA)

#### ANA-001 Deterministic pipeline in a Web Worker — P0
- **Desc:** The core scoring pipeline.
- **RO:** [doc] Re-evaluates the analysis on every change; [inf] native code.
- **Target:** The scoring-spec §2 pipeline in a Worker. Pure functions with the input AnalysisInput and the output ordered rows plus `excluded[]`.
- **AC:**
  - Scoring-spec test vectors T1–T27, E1–E6 and E8–E10 pass in CI (E7 is the ANA-025 performance gate).
  - The same input run twice gives byte-identical JSON output.
  - The main thread is never blocked for more than 16 ms by scoring.

#### ANA-002 Sum of symptoms (sort by degrees), the default — P0
- **Desc:** Ranks by coverage, then degree sum, then name.
- **RO:** [doc] The chess default.
- **Target:** scoring-spec §4.1.
- **AC:** T1 and T2 pass.

#### ANA-003 Sum of symptoms — P0
- **Desc:** Coverage count only.
- **RO:** [doc]
- **Target:** §4.2.
- **AC:** T3 passes.

#### ANA-004 Sum of degrees (sort by symptoms) — P0
- **Desc:** Degree sum, then coverage.
- **RO:** [doc]
- **Target:** §4.3.
- **AC:** T4 and T5 pass.

#### ANA-005 Sum of symptoms and degrees — P1
- **Desc:** Coverage plus degree sum.
- **RO:** [doc] name only.
- **Target:** §4.4.
- **AC:** T19 and T20 pass.

#### ANA-006 Weighted rubrics — P0
- **Desc:** Σ intensity × grade.
- **RO:** — (OOREP and Complete Dynamics).
- **Target:** §4.5.
- **AC:** T6 passes.

#### ANA-007 Intensity toggle — P0
- **Desc:** Whether symptom intensity is used.
- **RO:** [doc] A switch in the chess menu.
- **Target:** A toggle in the strategy panel (I key). Off means i_s = 1 for every line with i_s > 0.
- **AC:**
  - Toggling switches between the T1 and T2 outputs.
  - Lines at intensity 0 stay excluded in both states.

#### ANA-008 Eliminative and exclusive filtering with reasons — P0
- **Desc:** Removes remedies according to the qualified lines.
- **RO:** [doc]
- **Target:** §2 steps 5–6. Each excluded remedy carries a reason.
- **AC:**
  - T7 and T8 pass, including the reason strings.
  - E2 passes.

#### ANA-009 Group, combine and cross semantics — P0
- **Desc:** Grouped lines count once.
- **RO:** [doc] maximum degree, counted as one.
- **Target:** §2 step 2.
- **AC:**
  - T9 and T10 pass.
  - The group intensity is the maximum of its members.

#### ANA-010 Small rubrics — P0
- **Desc:** Extra weight for small rubrics.
- **RO:** [doc] "<10 remedies".
- **Target:** §4.6, with editable threshold and factor.
- **AC:**
  - T11 passes.
  - Changing the threshold to 2 makes no line small, and the output equals the `weighted` order.

#### ANA-011 Small rubrics (continuous) — P2
- **Desc:** A smooth rubric-size weight.
- **RO:** — (Mercurius-like).
- **Target:** §4.7.
- **AC:** T12 and T13 pass.

#### ANA-012 Small remedies — P1
- **Desc:** Corrects for the bias towards large (polychrest) remedies.
- **RO:** [doc] name only.
- **Target:** §4.8; m_r is precomputed per repertory and view.
- **AC:**
  - T14 and T15 pass.
  - m_r for `sulph` in publicum equals the count of its rubric_remedy rows (a data test).

#### ANA-013 Small rubrics plus small remedies — P1
- **Desc:** Combines the two corrections.
- **RO:** [doc]
- **Target:** §4.9.
- **AC:** T16 passes.

#### ANA-014 Prominence (keynote) — P1
- **Desc:** A high grade in a rubric where few remedies share that grade.
- **RO:** [doc] name and description only.
- **Target:** §4.10.
- **AC:**
  - T17 passes in both intensity states (on: B, C, A, F, D, E; off: C, A, B, D, E, F).
  - With the sole-bonus option, B's P becomes 12.

#### ANA-015 Kent hierarchy preset — P1
- **Desc:** Category-weighted scoring.
- **RO:** — (a clinical method).
- **Target:** §4.11, with editable κ and the two options.
- **AC:**
  - T18 passes.
  - With `mustCoverStrong`, remedies missing any line of intensity 3 or more are excluded, with a reason.

#### ANA-016 Boenninghausen generalisation preset — P2
- **Desc:** Effective grade taken from linked general rubrics.
- **RO:** — (Complete Dynamics "Bönninghausen").
- **Target:** §4.12.
- **AC:** T22 passes.

#### ANA-017 Polarity analysis — P2
- **Desc:** Polarity difference and contraindication.
- **RO:** [doc] The Polar Symptom Analysis module and Frei's sort.
- **Target:** §4.13.
- **AC:**
  - T25–T27 pass.
  - The contraindication rule is Frei's (patient pole at grade 1–2 with the opposite pole at grade 3–5); LOW and HIGH are editable and "Reset to defaults" restores 2 and 3.
  - With fewer than 5 polar lines, the warning "Polarity analysis needs ≥5 polar symptoms" is shown.

#### ANA-018 Segments (cross-clipboard) — P2
- **Desc:** Remedies that rank highly across the clipboards.
- **RO:** [doc] Herscu Cycles and Segments (proprietary method; ours is clean-room).
- **Target:** §4.14.
- **AC:**
  - T24 passes.
  - Selecting 7 non-empty clipboards shows the warning "Segments work best with 2–6 clipboards" and still returns a result.

#### ANA-019 Expert composite — P2
- **Desc:** A multi-factor composite score with a confidence value and a quality light.
- **RO:** [doc] The VES is proprietary; this is not it.
- **Target:** §4.15, named "Expert (composite)".
- **AC:**
  - T21 passes (scores to 4 decimals, confidence 62.49, green light).
  - No UI string contains "Vithoulkas" or "VES".

#### ANA-020 Family pseudo-remedy analysis — P1
- **Desc:** The analysis run over families instead of remedies.
- **RO:** [doc] "Analyse by 5,000+ families"; MacRepertory family graphs.
- **Target:** §4.16. The classification system is chosen (kingdom, GBIF family, mineral cation, …).
- **AC:**
  - T23 passes.
  - Switching the system recomputes in under 200 ms.

#### ANA-021 Family limit and highlight — P0
- **Desc:** Filters or flags the remedies by family.
- **RO:** [doc] Limit To / Highlight; Ctrl/Cmd+Z removes the limitation.
- **Target:** §2 step 7 and §4.17. Several limits combine as a union (OR) of families [OURS].
- **AC:**
  - Limiting the fixture to Fam1 = {A, D} leaves A and D, and B, C, E and F are excluded with reason `family-limit`.
  - Highlight changes no score.
  - Ctrl/Cmd+Z restores the unlimited list.

#### ANA-022 Strategy parameters — P1
- **Desc:** Editable parameters with defaults.
- **RO:** [inf] a few options.
- **Target:** The scoring-spec §6 schema, an "Advanced" drawer, "Reset to defaults", and the parameters saved with the analysis.
- **AC:**
  - Changing smallRemedies α to 1 re-ranks immediately.
  - Reset restores the §6 JSON exactly.
  - A recalled analysis restores its parameters.

#### ANA-023 Grade scales across repertories — P1
- **Desc:** Mixing repertories with different grade scales.
- **RO:** — (a single Synthesis scale).
- **Target:** Scoring-spec §7. The native scale is used by default, `normalizeGrades` is optional, and a warning appears when scales are mixed.
- **AC:**
  - A clipboard with lines from a 1–3 and a 1–5 repertory shows the warning.
  - With normalisation on, a 1–3 grade of 3 becomes 4 in the analysis cells.

#### ANA-024 View filter before scoring — P1
- **Desc:** The analysis respects the active repertory view.
- **RO:** [doc] The repertory view selector applies to the analysis.
- **Target:** §2 step 3. n_s and m_r are view-specific.
- **AC:**
  - With the "Grade 3 only" view, no cell shows grade 1 or 2.
  - n_s equals the grade-3 count.

#### ANA-025 Performance budget — P0
- **Desc:** Analysis speed.
- **RO:** [inf] instant.
- **Target:** Scoring-spec E7.
- **AC:**
  - A 40-line case over publicum computes every P0 strategy in under 30 ms in the Worker.
  - A 1,000-line synthetic case computes `sumSymDeg` in under 50 ms.

#### ANA-026 Live recompute — P0
- **Desc:** Updates the analysis as the case changes.
- **RO:** [doc] Re-evaluates on every change.
- **Target:** Any change to a clipboard, strategy, filter or view triggers a recompute (debounced by 50 ms). Stale responses are dropped by request id.
- **AC:**
  - Changing intensity updates the ranking in under 150 ms end to end.
  - A fast series of 10 changes renders only the final state (no flicker to an intermediate order).

#### ANA-027 Result snapshot and data version — P1
- **Desc:** Makes a saved analysis reproducible.
- **RO:** —
- **Target:** Scoring-spec §2.3 and data-plan §5 versioning.
- **AC:**
  - Recalling an analysis saved under an older data version shows "Data changed" with the choices "Re-run" and "View snapshot".
  - The snapshot view shows the stored top 100 exactly.

#### ANA-028 Case quality indicator — P2
- **Desc:** A warning about the case's structure.
- **RO:** — (Complete Dynamics quality light; VES distribution guidance).
- **Target:** A traffic light in the analysis header for every strategy, with the §4.15 rules.
- **AC:**
  - A case with 3 lines shows red, with the tooltip "Fewer than 4 symptoms".
  - The fixture shows green.

#### ANA-029 Materia medica link symptoms in the analysis — P2
- **Desc:** `mmLink` lines contribute to scoring.
- **RO:** [doc] Package 3 and up.
- **Target:** CLP-010 semantics: grade 1 for the chapter remedy, n = 1.
- **AC:**
  - With the setting on, an mmLink line for Boericke Nat-m adds C + 1 to nat-m only.

#### ANA-030 Source (author) weighting — P2
- **Desc:** Weights each grade by a user-assigned confidence in its source.
- **RO:** [doc] The 3.3 Farokh Master strategy weights the analysis by an approval rating for each author. That strategy and its ratings are proprietary and are not reproduced; this is a generic, user-configured mechanism.
- **Target:** [PROPOSED] A per-source weight w_src in {0, 0.5, 1, 1.5, 2} (default 1) set in the strategy panel. Any strategy that uses g(r,s) uses g·w_src, taking the maximum weighted grade when a remedy has several sources in one rubric. A weight of 0 removes the entry entirely, so it is also left out of n_s and m_r. Only meaningful once more than one source exists (DAT-016+ or user additions); the control is hidden otherwise.
- **AC:**
  - With every weight at 1, all scoring-spec vectors are unchanged.
  - Setting "my additions" to 0 gives the same result as the "Without my additions" view (REP-019).
  - The weights are saved with the analysis and shown in the analysis header and print (IO-006).

---

## 5. Analysis visualisation and drill-down (VIS)

#### VIS-001 Display modes (F7, F8, F9) — P0
- **Desc:** Symptoms only, split, or analysis only.
- **RO:** [doc] F7, F8 and "analysis only".
- **Target:** interaction-map §5.1, with a persisted splitter.
- **AC:**
  - F7 shows only the list, F8 shows the split, F9 shows only the grid.
  - The splitter position persists after reload.

#### VIS-002 Grid view — P0
- **Desc:** A symptoms × remedies matrix.
- **RO:** [inf] Remedies as columns in rank order, symptoms as rows, grade marks.
- **Target:** interaction-map §5.2, with sticky headers and horizontal virtualisation.
- **AC:**
  - The fixture under T1 renders columns A–F in that order, and cell (R2, B) shows the grade-3 glyph.
  - An empty cell is blank.
  - 1,000 columns scroll smoothly (at least 55 fps).

#### VIS-003 Remedy column count — P0
- **Desc:** How many remedies are shown.
- **RO:** [inf] a selectable number of columns.
- **Target:** 10, 20 (default), 30, 50, 100 or All, changed with `[` and `]`.
- **AC:**
  - Choosing 10 shows exactly 10 columns.
  - The setting persists per user.

#### VIS-004 Score headers — P0
- **Desc:** What each column header shows.
- **RO:** [doc, App] Sy and Deg; [inf] "8/19".
- **Target:** Rank, abbreviation, `C/D` (or `CI/DI`) for the sum strategies, or the strategy score (1 decimal place, 0 when it is an integer) with `C/D` below it, or `CI/DI` when intensity is on. A family chip.
- **AC:**
  - Under T2, A's header shows "1 · A · 5/8".
  - Under T15 (intensity on), F shows "20" and "3/5".
  - Under T15 with intensity off, the second line switches to "2/3" within the ANA-026 budget.

#### VIS-005 Linked highlighting — P0
- **Desc:** Cross-highlighting between remedies and rubrics.
- **RO:** [inf]
- **Target:** Clicking a remedy highlights its column and dims the rows it does not cover. Clicking a row highlights the remedies present. Esc clears.
- **AC:**
  - Clicking F in the fixture dims R1 and R4.
  - Clicking R4 highlights A, C and D.

#### VIS-006 Remedy finder — P0
- **Desc:** Jumps to a remedy's rank.
- **RO:** [doc] Autocomplete over the analysis remedies only.
- **Target:** The / key focuses the finder, which suggests only ranked (or shown excluded) remedies. Enter scrolls to the column and flashes it.
- **AC:**
  - Typing a remedy that is not in the analysis shows "not in analysis".
  - Entering E scrolls to column 5 (T1).

#### VIS-007 Show excluded remedies in position — P1
- **Desc:** Displays filtered remedies greyed out.
- **RO:** [doc] "Show in their position".
- **Target:** The X toggle. Excluded remedies interleave at the rank their score would give, greyed and struck, with a reason tooltip.
- **AC:**
  - Under T7 with the toggle on, B appears between A and C, greyed, with the tooltip "Eliminated by R4".
  - The ranks of the included remedies are unchanged.

#### VIS-008 Bars view — P1
- **Desc:** Horizontal stacked bars per remedy.
- **RO:** [doc] "graphic analysis" (form inferred).
- **Target:** interaction-map §5.3. Segment lengths are the contributions to the active score.
- **AC:**
  - Under T11, B's bar has a total length proportional to 15 and a segment for R2 of 12 (2·3·2).
  - Hovering a segment shows "R2 · grade 3 · intensity 2 · ×2 small rubric = 12".

#### VIS-009 Cards view with explanation — P1
- **Desc:** Remedy cards with covered and missed lines and the score terms.
- **RO:** —
- **Target:** interaction-map §5.4.
- **AC:**
  - A's card under T18 lists 4 covered lines and the terms 9 + 2 + 4 + 1 = 16.
  - Missed lines are shown with ✗.

#### VIS-010 Drill-down inspector — P0
- **Desc:** Selecting a remedy shows its coverage in the case.
- **RO:** [doc] Double-click opens the RIW; [doc, App] a Symptoms column per remedy.
- **Target:** The inspector has a "In this case" tab listing the covered lines (with grade) and the missed lines, plus Limit/Highlight family buttons. The other tabs come from MM-006.
- **AC:**
  - Double-clicking C under T1 shows 3 covered lines (R1:1, R3:3, R4:2) and 1 missed line (R2).
  - Clicking a line navigates to the rubric in the repertory.

#### VIS-011 Remedy comparison — P1
- **Desc:** Compares 2–10 remedies.
- **RO:** [doc] Extract and compare up to 10; 3.3 comparison graphs of up to 3.
- **Target:** interaction-map §5.5.
- **AC:**
  - Adding 11 remedies is refused with a message.
  - The "present in all" filter for {A, C} lists R1, R3 and R4.
  - The chart mode is enabled only for 2–3 remedies.

#### VIS-012 Polarity view — P2
- **Desc:** The polarity table.
- **RO:** [doc] Three lines per remedy, PD in bold, contraindicated remedies marked.
- **Target:** interaction-map §5.6.
- **AC:**
  - The F2 fixture shows the rows X, Z, Y with PD 7, 6, 3, and Y carries the CI badge.
  - The "allow N−1" toggle adds W between Z and Y.

#### VIS-013 Family overview view and density panel — P1
- **Desc:** Families ranked, and density in the top N.
- **RO:** [doc] maps, Family Finder (proprietary); MacRepertory family graphs.
- **Target:** interaction-map §5.7.
- **AC:**
  - The T23 view shows Fam1 above Fam2.
  - The density panel shows "Fam1: 2 in top 20".

#### VIS-014 Segments view — P2
- **Desc:** A mini-ranking per clipboard.
- **RO:** —
- **Target:** interaction-map §5.8.
- **AC:**
  - The T24 setup shows the clipboard 1 top 2 (B, A), the clipboard 2 top 2 (C, A) and the final order A, B, C.

#### VIS-015 Strategy panel — P0
- **Desc:** Chooses the strategy.
- **RO:** [doc] The chess icon menu.
- **Target:** interaction-map §5.9, with the strategies grouped and P2 strategies behind the "More" group.
- **AC:**
  - Choosing a strategy updates the ranking and the header labels in under 150 ms.
  - The current strategy shows in the status bar.
  - The S key opens the menu.

#### VIS-016 Animated re-rank — P2
- **Desc:** Columns animate to their new positions.
- **RO:** —
- **Target:** A 200 ms FLIP animation, disabled under reduced motion.
- **AC:**
  - With `prefers-reduced-motion: reduce`, there is no animation.
  - Otherwise, after a re-rank each moved column header has exactly one running Web Animation of 200 ms ± 20 ms (`element.getAnimations()`), and no header that kept its rank is animated.

#### VIS-017 Side-by-side saved analyses — P2
- **Desc:** Compares analyses from several consultations.
- **RO:** [doc] Many windows from previous sessions, with a family filter per window.
- **Target:** interaction-map §5.10, up to 4 panes.
- **AC:**
  - Opening 2 saved analyses shows both with their date labels.
  - Changing the strategy in synchronised mode updates both.

#### VIS-018 Family colour chips — P1
- **Desc:** A kingdom or family colour on the remedy headers.
- **RO:** [doc] The Family Finder colour scale (3.3).
- **Target:** A kingdom chip by default (plant, animal, mineral, nosode, fungus, other), switchable to a family system. A legend is available.
- **AC:**
  - Every column header shows a chip.
  - The legend lists the colours in use.
  - The chip has a text label for screen readers.

#### VIS-019 Accessible grid — P0
- **Desc:** Screen-reader and keyboard access to the analysis.
- **RO:** —
- **Target:** `role="grid"` with cell names (interaction-map §8).
- **AC:**
  - axe reports no critical issues.
  - Navigating to cell (R2, B) announces "B, grade 3, in <R2 path>".
  - All the grid actions in interaction-map §3.5 work from the keyboard.

#### VIS-020 Mobile analysis layout — P1
- **Desc:** The analysis at phone width.
- **RO:** [doc, App] a simple table of Sy and Deg.
- **Target:** Below 768px the default view is Cards/Bars. The grid is available with horizontal scroll inside its container.
- **AC:**
  - At 360px there is no page-level horizontal scroll.
  - The top 10 remedies are visible without zooming.
  - Tapping a card opens the drill-down as a full-screen sheet.

#### VIS-021 Prescribed-before marker — P2
- **Desc:** Marks remedies prescribed earlier for the linked patient.
- **RO:** — (Complete Dynamics has a dot).
- **Target:** A dot on the header when the linked patient has a prescription of that remedy.
- **AC:**
  - For a patient previously given `puls`, the puls column shows the dot, and its tooltip shows the date.

#### VIS-022 Strategy comparison side by side — P1
- **Desc:** The same case analysed with two or three strategies at once.
- **RO:** [doc] The VES result "opens in a separate tab for comparison with the standard analysis".
- **Target:** interaction-map §5.11: up to 3 panes over the same clipboards, each with its own strategy and parameters, and a rank-delta column against pane 1.
- **AC:**
  - With the fixture, pane 1 `sumSymDeg` (intensity on) and pane 2 `weighted` show T2 and T6 orders, and pane 2 marks B "▲1" and A "▼1".
  - Changing an intensity recomputes both panes within the ANA-026 budget.
  - A 4th pane is refused with a message.

---

## 6. Materia medica and remedy information (MM)

#### MM-001 References table of contents — P0
- **Desc:** The list of books.
- **RO:** [doc] The References TOC (Ctrl/Cmd+2), with categories.
- **Target:** A TOC tab listing the books grouped by category (Materia medica, Lectures, Other), with licence badges.
- **AC:**
  - Boericke (OOREP) appears.
  - After Phase 2, Clarke, Kent's Lectures and Allen's Nosodes appear.
  - Clicking opens the book.

#### MM-002 Book reader — P0
- **Desc:** Reads a materia medica book by remedy and section.
- **RO:** [doc] F2/F3 navigation, symptom path, images.
- **Target:** A left-hand remedy list with filter, the content in the centre, and a section outline. F2 and F3 work as in a repertory (book → remedy → section).
- **AC:**
  - Opening Boericke and typing "nat-m" jumps to Natrum muriaticum.
  - The outline lists its sections (Mind, Head, …, Modalities, Relationship, Dose).
  - Clicking a section scrolls to it.

#### MM-003 Section anchors and permalinks — P0
- **Desc:** Deep links into books.
- **RO:** —
- **Target:** `/mm/:book/:remedy#:sectionId`.
- **AC:**
  - A copied section link opens at that section in a new tab.

#### MM-004 Remedy abbreviations in the text — P2
- **Desc:** Detects remedy names in materia medica prose.
- **RO:** [doc] Space shows the remedy abbreviations in MM text.
- **Target:** Remedy mentions in the text become links, resolved through aliases. Space toggles their highlighting.
- **AC:**
  - In Boericke's Relationship section, "Compare: Thuja" renders Thuja as a link to the thuj remedy info.

#### MM-005 Search within a book, and remedy-to-book search — P1
- **Desc:** Finds a remedy's mentions in one book or in all.
- **RO:** [doc] Drag a remedy onto a book title, or onto the MM header for all books.
- **Target:** The remedy context menu "Search this remedy in ▸ materia medica". Dropping a remedy onto a book in the TOC does the same.
- **AC:**
  - Dropping `lach` onto Boericke opens a result tab listing the passages mentioning Lachesis, including its own chapter first.

#### MM-006 Remedy info inspector — P0
- **Desc:** A consolidated view of one remedy.
- **RO:** [doc] The RIW: keynotes, families, links, sources, limit and highlight.
- **Target:** Inspector tabs: Overview (names, aliases, kingdom, families, counts per repertory), Keynotes (MM-007), Relationships (MM-009), Rubrics (MM-010), Sources, Notes. Also a full page on mobile.
- **AC:**
  - Double-clicking `acon` opens the Overview showing "Aconitum napellus", aliases, kingdom Plant, family Ranunculaceae (after DAT-009) and the rubric count in publicum.

#### MM-007 Keynotes tab — P1
- **Desc:** The remedy's text from the user's favourite books.
- **RO:** [doc] Favourite keynotes (3.0); double-click opens the favourite keynote books (3.1).
- **Target:** Shows the remedy's chapter from the first favourite book, with tabs for the others.
- **AC:**
  - With favourites [Boericke, Clarke], the Keynotes tab shows Boericke's acon chapter first and a Clarke tab second.
  - A remedy absent from a book shows "not in this book".

#### MM-008 Favourite keynote book configuration — P1
- **Desc:** Chooses and orders the favourite books.
- **RO:** [doc] Unlimited and orderable.
- **Target:** Settings → Materia medica → Favourites (drag to order).
- **AC:**
  - Reordering changes the tab order in MM-007 immediately.

#### MM-009 Relationships tab — P1
- **Desc:** Complementary, antidote, compare and other relations.
- **RO:** [doc] Families and related remedies; RADAR shows relationships of remedies.
- **Target:** Relations grouped by kind, then by source book. Each shows a context note and the raw source sentence on expand. Links go to the related remedies.
- **AC:**
  - For acon (after DAT-006 and DAT-008), "Complementary" lists coff with the context "in fever…" and source Clarke.
  - The raw sentence is shown verbatim.

#### MM-010 Rubrics tab — P1
- **Desc:** The remedy's rubrics.
- **RO:** [doc] "Search for this remedy in…".
- **Target:** A list filterable by repertory, chapter, grade and rubric size. Each rubric has a take button.
- **AC:**
  - For sulph with grade = 3 and size ≤ 10, the list equals the SRC-010 query results.

#### MM-011 External references — P2
- **Desc:** Outbound links.
- **RO:** [doc] Wikipedia, Google Images, provings sites, GRIN, NCBI.
- **Target:** Links to Wikipedia, GBIF (by taxon key) and PubChem (by CID), opened in a new tab with no data sent.
- **AC:**
  - For acon, the GBIF link uses the stored usageKey.
  - Links are hidden when their ids are missing.

#### MM-012 Remedies table of contents — P0
- **Desc:** The list of all remedies.
- **RO:** [doc] The Remedies TOC; double-click opens Remedy Info.
- **Target:** A virtualised list with search by abbreviation, Latin name or alias, and kingdom filter chips.
- **AC:**
  - Typing "wolfsbane" finds acon through its alias (after DAT-008).
  - The full list shows all remedies present in the installed data (2,432 in OOREP).

#### MM-013 Favourite books and repertories — P1
- **Desc:** Pins preferred documents.
- **RO:** [doc] 3.3 favourites at the top of the TOC.
- **Target:** The context menu "Add to favourites" pins the document to the top of its TOC section.
- **AC:**
  - A pinned book appears first after reload.

#### MM-014 Notes and bookmarks on MM paragraphs — P1
- **Desc:** Annotates the reference texts.
- **RO:** [doc] Tags on any MM symptom.
- **Target:** Select text, then Bookmark paragraph or Add note. The icons show in the margin.
- **AC:**
  - A note on a Boericke paragraph shows a margin icon and appears in the notes index and in search (SRC-019).

#### MM-015 Personal materia medica — P2
- **Desc:** The user's own books.
- **RO:** [doc] 3.3 personal MM with chapters, images and formatting.
- **Target:** Create a book: remedy chapters with markdown (bold, italic, underline), images and sections. The book is searchable.
- **AC:**
  - A new book with 2 chapters is listed in the References TOC, searchable, and available in the keynote favourites.

#### MM-016 Personal keynotes — P2
- **Desc:** Short per-remedy personal notes.
- **RO:** [doc] Personal Keynotes.
- **Target:** A "My keynotes" book created automatically, with one chapter per remedy on demand. The Notes tab in the inspector edits it.
- **AC:**
  - Typing in the Notes tab creates or updates the remedy's chapter in "My keynotes".

#### MM-017 Import user documents (freenotes) — P2
- **Desc:** Adds seminar notes and similar documents.
- **RO:** [doc] Freenotes.
- **Target:** Import a Markdown or plain-text file as a personal reference document.
- **AC:**
  - Importing a 50 KB `.md` file creates a searchable document with its headings as the outline.

#### MM-018 Side-by-side materia medica comparison — P2
- **Desc:** Compares 2–3 remedies' chapters.
- **RO:** —
- **Target:** Split panes with sections aligned by heading.
- **AC:**
  - Comparing acon and bell in Boericke aligns their "Mind" sections at the same vertical position.

#### MM-019 Sources and authors page — P1
- **Desc:** A list of documents and authors with licences.
- **RO:** [doc] 3.3 authors and documents list.
- **Target:** "About data" (DAT-013), plus a per-document info panel.
- **AC:**
  - Every installed document shows its title, author, year, licence and source URL.

#### MM-020 Remedy images — P2
- **Desc:** Pictures of the source substance (plant, animal, mineral) in Remedy Info.
- **RO:** [doc] Multimedia: remedy pictures (RADAR 10 also had sound clips), image viewing and Google Images links.
- **Target:** An Images section in the inspector Overview tab, from `remedy_image` (data-plan §3; Wikimedia Commons files licensed CC0, CC BY or CC BY-SA only). Each image shows its author and licence and links to its source page. Lazy-loaded; cached offline only after "Download all".
- **AC:**
  - For acon, at least one image appears with a visible author and licence line.
  - Any image whose licence is not in the allow-list fails the data-plan §7 licence gate.
  - With no image for a remedy, the section is hidden (no empty frame).
  - Images are loaded only when the Overview tab is visible (network log).

---

## 7. Families, kingdoms and filters (FAM)

#### FAM-001 Families table of contents — P1
- **Desc:** A tree of classification systems, their families and members.
- **RO:** [doc] The Families TOC (Ctrl/Cmd+5) with right-click to limit or highlight.
- **Target:** A TOC tab with the systems (Kingdom, Plant families, Animal groups, Minerals by element, Minerals by anion, Periodic period and group, Nosodes, My families). Clicking a family opens its member list.
- **AC:**
  - The Kingdom system lists Plant, Animal, Mineral, Nosode, Sarcode, Fungus, Imponderable, Unknown with counts.
  - The counts sum to the total number of remedies.

#### FAM-002 Kingdom classification — P1
- **Desc:** Each remedy's kingdom.
- **RO:** [doc] Plant, animal, mineral, nosode.
- **Target:** From DAT-009, following the rule order in data-plan Phase 3.
- **AC:**
  - At least 95% of the publicum remedies have a kingdom other than Unknown.
  - The spot checks acon → Plant, lach → Animal, nat-m → Mineral, med → Nosode pass.

#### FAM-003 Plant families — P1
- **Desc:** Botanical family and order.
- **RO:** [doc] Cronquist and APG II (proprietary curation).
- **Target:** GBIF-derived family and order, with the Clarke N.O. cross-check and APG naming.
- **AC:**
  - acon → Ranunculaceae; bell → Solanaceae; arn → Asteraceae (not Compositae).
  - A manual override on a remedy persists across ETL runs.

#### FAM-004 Animal groups — P1
- **Desc:** Class and order groups for animal remedies.
- **RO:** [doc] maps and families (proprietary).
- **Target:** GBIF class and order, plus the app tags Snakes, Spiders, Insects, Milks (Lac-), Marine.
- **AC:**
  - lach → Reptilia / Squamata and tag Snakes; tarent → Arachnida and tag Spiders; lac-c → tag Milks.

#### FAM-005 Mineral classification — P1
- **Desc:** Element, anion and periodic position.
- **RO:** [doc] Periodic table map (Scholten, proprietary themes).
- **Target:** The mineral parser gives the cation element, anion and period/group (facts only, with no theme texts).
- **AC:**
  - calc-p → Ca, phosphate, period 4 group 2; nat-m → Na, chloride, period 3 group 1; aur → Au, metal, period 6 group 11.

#### FAM-006 Nosode categories — P2
- **Desc:** Bowel nosodes, disease nosodes and others.
- **RO:** [doc] Bowel nosode family.
- **Target:** A hand-curated list (data-plan Phase 3).
- **AC:**
  - Morgan, Proteus, Gaertner, Dys-co and Sycotic appear under "Bowel nosodes" when they are present in the remedy list.

#### FAM-007 Limit the analysis to a family — P1 (engine support is ANA-021, P0)
- **Desc:** The user interface for limiting.
- **RO:** [doc] From the TOC right-click, the RIW button or the analysis Family button.
- **Target:** Every family node, remedy inspector and column header has "Limit to family ▸". The active limits show as removable chips in the analysis header.
- **AC:**
  - Limiting to Solanaceae from the TOC shows the chip "Solanaceae ×", and only Solanaceae remedies remain ranked.
  - Clicking × removes the limit.

#### FAM-008 Highlight a family — P1
- **Desc:** Visually marks the members of a family.
- **RO:** [doc]
- **Target:** The highlighted members' columns get a tinted background and a chip. Ranks are unchanged.
- **AC:**
  - The ranks and scores are identical before and after highlighting.
  - The highlighted columns carry `aria-description="highlighted: Solanaceae"`.

#### FAM-009 Several families at once — P2
- **Desc:** Limits to a union of families.
- **RO:** — (single family).
- **Target:** Several limit chips act as an OR. A modifier combines two limits as an AND (e.g. Plant AND Ranunculaceae).
- **AC:**
  - Limits Solanaceae and Ranunculaceae keep the members of either.
  - Plant AND Solanaceae equals Solanaceae.

#### FAM-010 Undo a limit or highlight — P1
- **Desc:** Removes the last family action.
- **RO:** [doc] Ctrl/Cmd+Z.
- **Target:** Part of the global undo stack (WS-008).
- **AC:**
  - Limit, then highlight, then Ctrl/Cmd+Z twice restores the original unlimited, unhighlighted state.

#### FAM-011 Kingdom quick filters — P1
- **Desc:** One-click kingdom chips in the analysis.
- **RO:** [doc] Filtering by remedy type (plant, animal, mineral, nosode).
- **Target:** A chip row above the grid. Clicking a chip limits; Alt+click highlights.
- **AC:**
  - Clicking "Mineral" leaves only mineral remedies ranked.
  - Clicking it again removes the limit.

#### FAM-012 User-defined families — P2
- **Desc:** The user's own groupings.
- **RO:** [doc] Add and edit families (Advanced package and up).
- **Target:** "My families": create a family, then add remedies (autocomplete or multi-select from the analysis). Usable for limit, highlight and analysis.
- **AC:**
  - Creating "My acute kit" with 10 remedies and limiting to it leaves at most those 10 ranked.
  - It is exported with the user data.

#### FAM-013 Personal family notes — P2
- **Desc:** Notes attached to a family.
- **RO:** [doc]
- **Target:** A notes field on the family page. It is searchable.
- **AC:**
  - A note on Solanaceae is found by search (SRC-019).

#### FAM-014 Periodic table view — P2
- **Desc:** The analysis plotted on the periodic table.
- **RO:** [doc] Maps icon (proprietary maps).
- **Target:** A periodic grid in which each element cell is shaded by the best rank of its mineral remedies in the current analysis. Clicking a cell lists its remedies.
- **AC:**
  - With nat-m ranked 1, the Na cell has the strongest shade, and clicking it lists nat-m with its rank.

#### FAM-015 Family page with provenance — P1
- **Desc:** A family's members and data source.
- **RO:** [doc] Families repertory.
- **Target:** Members with kingdom, the source of each assignment (gbif, clarke_no, manual) and its confidence.
- **AC:**
  - Each member row shows its origin badge.
  - A low-confidence assignment (below 90) shows a warning icon.

#### FAM-016 Miasmatic classification — P2
- **Desc:** Remedy-level miasm groups usable for limit, highlight and family analysis.
- **RO:** [doc] Miasm families and filtering "by miasm"; the Ortega miasmatic module tags Synthesis rubrics (proprietary).
- **Target:** A "Miasms" system in the Families TOC (psora, sycosis, tubercular, syphilis, plus "multiple") built only from public-domain sources (data-plan `allen-miasms-ia`), each assignment with its source page. No rubric-level miasm tags.
- **AC:**
  - Each assignment shows its origin and page reference on the family page (FAM-015).
  - Limiting the analysis to "Sycosis" behaves like any family limit (ANA-021 reason `family-limit`).
  - A remedy with two miasms appears under both and under "multiple".

---

## 8. Patients and consultations (PAT)

**Gate:** No PAT feature ships before PAT-024, encryption and lock.

#### PAT-001 Patient list — P1
- **Desc:** A browsable, filterable list of patients.
- **RO:** [doc] The Patients TOC (Ctrl/Cmd+3) with groups.
- **Target:** A virtualised table (name or pseudonym, year of birth, last visit, last remedy, group) with a quick filter, recent and pinned lists, and group drawers.
- **AC:**
  - 5,000 synthetic patients scroll at 55 fps or more.
  - Typing "jo" filters to matching names in under 100 ms.
  - Pinned patients appear first.

#### PAT-002 Patient record — P1
- **Desc:** Administrative data.
- **RO:** [doc] Admin fields, extended by package; discriminatory data (race, religion) is not allowed.
- **Target:** Name, sex, birth date (partial allowed), species (human or animal with species and breed), contact, photo, blood group, groups, status. No race or religion fields.
- **AC:**
  - With the clock mocked to 2026-09-29, a birth date of "1980-00-00" (year only) is accepted and the age shows "~46"; "1980-10-00" shows "~45".
  - The form has no race or religion fields (schema test).
  - Required: name or pseudonym.

#### PAT-003 Veterinary variant — P2
- **Desc:** Animal patients.
- **RO:** [doc] A veterinary patient file.
- **Target:** Species "animal" shows the species, breed, owner name and owner contact fields.
- **AC:**
  - Creating a dog patient shows the owner fields and hides human-only fields such as blood group.

#### PAT-004 Groups and archive — P1
- **Desc:** Organises the patients.
- **RO:** [doc] Groups of patients; Complete Dynamics drawers.
- **Target:** Default groups Patients, Colleagues, Study, Seminars, Archived. Custom groups can be added. Archive hides a patient from the default list.
- **AC:**
  - Moving a patient to Archived removes it from the "Patients" view and shows it under Archived.
  - Custom groups can be renamed and deleted (with confirmation).

#### PAT-005 Consultation timeline — P1
- **Desc:** The patient's consultations in order.
- **RO:** [doc] "List of consultations & saved analyses".
- **Target:** A left timeline of consultations, prescriptions (with evaluation badge), analyses and lab entries, newest first, with type icons.
- **AC:**
  - A patient with 3 consultations shows 3 items with dates and types.
  - Clicking one opens it in the editor.

#### PAT-006 Consultation editor — P1
- **Desc:** A rich-text case note per consultation.
- **RO:** [doc] Consultation text editor.
- **Target:** A rich-text editor (headings, bold, italic, lists) that autosaves every 1 s, with a word count.
- **AC:**
  - Typing text and reloading after 2 s preserves everything.
  - Formatting survives export and re-import.

#### PAT-007 Symptom spans: grading and tagging — P1
- **Desc:** Marks important symptoms in the note.
- **RO:** [doc] "Grade & tag symptoms", show only bold.
- **Target:** Select text, then Ctrl/Cmd+E and 1–4 creates a graded span (the grade shows as typographic weight). Tags come from a user list. A span can link to rubrics.
- **AC:**
  - Grading "desires salt" at 3 renders it bold, and it appears in the anamnesis summary.
  - Linking it to a rubric adds a take button.

#### PAT-008 Custom tags and case filter — P1
- **Desc:** User tag set and filtering of the note.
- **RO:** [doc] Custom tags (unlimited), filter by tag or bold.
- **Target:** A tag manager (name and colour). The case filter shows only the spans with tag X or grade ≥ n.
- **AC:**
  - With the filter "tag: Mind", only Mind-tagged spans are visible and the rest is collapsed.
  - Clearing the filter restores the full view.

#### PAT-009 Anamnesis summary pane — P1
- **Desc:** All graded or tagged symptoms across consultations.
- **RO:** [doc] Anamnesis summary window; the 3.2 option hides prescriptions.
- **Target:** A right pane in the case view listing the spans by consultation date with filters, and a "Hide prescriptions" toggle.
- **AC:**
  - With 2 consultations each having 2 graded spans, the pane shows 4.
  - The "Hide prescriptions" toggle removes the remedy names from the pane.

#### PAT-010 Copy a symptom from a previous consultation — P2
- **Desc:** Carries symptoms forward.
- **RO:** [doc] 3.2: copies a symptom with its tags into the current consultation.
- **Target:** The span context menu "Copy to current consultation", plus "Carry forward all unresolved" (spans that were not marked resolved).
- **AC:**
  - A copied span keeps its grade, tags and rubric links.
  - Its origin date is shown in a tooltip.

#### PAT-011 Symptom templates and checklists — P2
- **Desc:** Structured case-taking.
- **RO:** [doc] 3.0 symptom templates that feed the clipboard; 3.3 custom templates.
- **Target:** Templates are checklists of items, each optionally mapped to a rubric. Ticking an item writes it to the notes and optionally takes the rubric.
- **AC:**
  - A template "Thermals" with 3 mapped items: ticking 2 adds 2 note lines and 2 clipboard lines.
  - Templates can be created, edited, exported and imported.

#### PAT-012 Linking an analysis to a consultation — P1
- **Desc:** The clipboards belong to the open consultation.
- **RO:** [doc] Clipboards are saved automatically with the patient.
- **Target:** While a consultation is open, a banner shows "Analysis linked to <patient> – <date>", and every clipboard change autosaves to it. A scratch mode applies outside patients.
- **AC:**
  - Opening consultation A, taking 2 rubrics, switching to consultation B (empty) and back to A shows the 2 rubrics again.
  - The banner is always visible while the analysis is linked.

#### PAT-013 Clear clipboards on patient close — P1
- **Desc:** Prevents symptoms leaking between patients.
- **RO:** [doc] 3.3 automatic clearing.
- **Target:** On close, the clipboards clear by default, with an undo toast. There is an option to disable it.
- **AC:**
  - After closing a patient, the clipboards are empty and "Undo" restores them.
  - Opening another patient never shows the previous patient's lines.

#### PAT-014 Prescriptions — P1
- **Desc:** Records what was given.
- **RO:** [doc] Remedy, potency, posology; 3.3 notes field.
- **Target:** Fields: remedy (autocomplete), potency plus scale (C, D/X, LM/Q, M, CM), form, posology, repetition, instructions, planned or given, rationale, differentials (remedies), date.
- **AC:**
  - Saving "puls 30C, 3 globules once" shows it on the timeline.
  - "Planned" prescriptions are styled differently.
  - The remedy must resolve to a known id, or be explicitly marked "free text".

#### PAT-015 Evaluations of the remedy response — P1
- **Desc:** Outcome scoring.
- **RO:** [doc] The Glasgow scale plus general, subjective and reaction-type scales.
- **Target:** GHHOS (−3…+4), subjective 0–10, reaction type (aggravation, amelioration, relapse, no change, new symptoms, return of old symptoms), per-complaint scores and a note.
- **AC:**
  - Adding an evaluation with GHHOS +2 to a prescription shows the badge "+2" on the timeline.
  - A value outside −3…+4 is rejected.

#### PAT-016 Follow-up chart — P2
- **Desc:** The course of treatment over time.
- **RO:** [doc] Treatment progression chart.
- **Target:** A line chart of GHHOS and subjective scores over time, with prescription markers on the x axis.
- **AC:**
  - 3 evaluations produce 3 points in date order.
  - Hovering a marker shows the prescription.

#### PAT-017 Pathologies and ICD codes — P2
- **Desc:** Diagnoses.
- **RO:** [doc] ICD-10 codes.
- **Target:** Pathology entries with an ICD-10 or ICD-11 code (free code plus label; no bundled proprietary code list) linked to a consultation.
- **AC:**
  - Adding "J45 Asthma" shows it in the case header.
  - Patient search `icd:J45` finds the patient.

#### PAT-018 Medical history — P2
- **Desc:** Conventional medicines, vaccinations, hospitalisations and lab results.
- **RO:** [doc] Engines 3–4.
- **Target:** Typed history items with dates. Lab items have attachments and a before/after flag.
- **AC:**
  - A vaccination item appears in the timeline.
  - Lab items marked before and after can be viewed side by side.

#### PAT-019 Attachments — P2
- **Desc:** Files on a patient, consultation or symptom.
- **RO:** [doc] Photo, video, PDF, Word, X-ray; per symptom (Engine 4).
- **Target:** Files are encrypted in IndexedDB with a per-file size cap (default 50 MB). Images get a preview.
- **AC:**
  - Attaching a 5 MB JPG to a span shows a thumbnail, and the file is unreadable without the passphrase (ciphertext at rest).
  - A 60 MB file is rejected with a message.

#### PAT-020 Patient search — P1
- **Desc:** Finds patients by criteria.
- **RO:** [doc] By symptom, address, age, remedy; research extracts.
- **Target:** The query language (reports/patients §4.2): `name:`, `remedy:`, `-remedy:`, `age:30-50`, `city:`, `tag:`, `symptom:"…"`, `icd:`, `after:`, and OR with `|`. Searches can be saved.
- **AC:**
  - `remedy:nux-v -remedy:sulph` returns exactly the patients prescribed nux-v and never sulph (fixture of 20 patients).
  - `age:30-50` computes ages from the current date: with the clock mocked to 2026-09-29, a patient born 1976-09-30 (age 49) matches and one born 1976-09-28 (age 50) matches, while one born 1975-09-28 (age 51) does not.

#### PAT-021 Full-text search of consultations — P1
- **Desc:** Searches note text across one or all patients.
- **RO:** [doc] The current or all consultations.
- **Target:** A local encrypted index, or an in-memory index built after unlock.
- **AC:**
  - Searching "thunderstorm" lists every consultation containing it, with snippets.
  - Nothing is indexed while the app is locked.

#### PAT-022 Statistics dashboard — P2
- **Desc:** Practice statistics.
- **RO:** [doc] Gender and age charts, audits, frequency analysis.
- **Target:** Charts: prescriptions by remedy, outcomes (GHHOS) by remedy and pathology, age and sex distribution, visits per month, with date-range filters.
- **AC:**
  - The fixture dataset gives the expected counts (unit test on the aggregations).
  - Every chart has a table alternative.

#### PAT-023 Consultation locking and revision history — P2
- **Desc:** Edit-blocking and an audit trail.
- **RO:** [doc] An edit trace and blocking by country.
- **Target:** A region preset sets "lock after N hours" or "lock on sign-off". Every edit creates a revision (timestamp and diff). Locked consultations can only be amended with a visible addendum.
- **AC:**
  - With lock after 24 h, editing a 25 h-old consultation is blocked and offers "Add addendum".
  - The revision list shows every save.

#### PAT-024 Encryption at rest, passphrase and auto-lock — P1
- **Desc:** Protects patient data in the browser.
- **RO:** [doc] Encrypted database, password (8 or more characters with special characters), lock after 3 h (can be disabled in 3.3).
- **Target:**
  - WebCrypto AES-GCM. The key is derived with PBKDF2-HMAC-SHA256 (600,000 iterations, the OWASP 2023 minimum; 16-byte random salt) or Argon2id in WASM (m = 64 MiB, t = 3, p = 1). A fresh 96-bit IV is used for every encryption.
  - The passphrase needs 8 or more characters with a letter, a digit and a symbol.
  - Idle auto-lock is configurable (default 30 min; "never" requires a confirmation).
  - The key is wiped from memory on lock.
- **AC:**
  - IndexedDB contains no plaintext patient field (an automated scan for a known name returns 0 hits).
  - After the idle timeout the UI locks and requires the passphrase.
  - A wrong passphrase 5 times triggers a 30 s back-off.

#### PAT-025 GDPR export and erase — P1
- **Desc:** The patient's data rights.
- **RO:** [doc] Export the history without practitioner notes; complete deletion.
- **Target:** "Export patient" produces a PDF plus JSON with private notes excluded. "Erase patient" is a hard delete that needs typed confirmation and writes a PII-free erasure log.
- **AC:**
  - The export contains every consultation, prescription and evaluation, and no PractitionerNote text.
  - After erase, no record references the patient id (DB scan), and the erasure log holds only a date and a count.

#### PAT-026 Congress (pseudonymisation) mode — P2
- **Desc:** Safe presentation of cases.
- **RO:** [doc] Hides patient names.
- **Target:** Names become initials or an alias, photos are blurred, prescriptions are hidden in summaries and dates become relative. The toggle is in the status bar.
- **AC:**
  - With the mode on, no patient full name appears anywhere in the DOM (automated scan).
  - Dates show as "Day 0" or "+6 w".

#### PAT-027 Practitioner private notes — P1
- **Desc:** Notes kept out of the clinical record.
- **RO:** [doc] Personal notes are excluded from exports and printed separately.
- **Target:** A "Private note" field per consultation, visually distinct and excluded from exports and patient prints.
- **AC:**
  - The PAT-025 export and IO-008 prints contain no private-note text (automated check).

#### PAT-028 Scratch analyses and case cloning — P1 (cloning is P2)
- **Desc:** Analyses outside any patient, and duplicating cases.
- **RO:** [doc] Save to a folder outside the patient file; OOREP clones cases.
- **Target:** Scratch mode is the default when no patient is open. "Attach to patient…" moves a scratch analysis into a consultation. Clone creates a new patient case from an existing one (P2).
- **AC:**
  - A scratch analysis attached to a consultation appears in that patient's timeline and is removed from scratch.

#### PAT-029 Invoices (optional module) — P2
- **Desc:** Simple invoices.
- **RO:** [doc] Invoices and credit notes (Engine 4).
- **Target:** An optional module that is off by default: practitioner profile, invoice lines, numbering and a PDF.
- **AC:**
  - With the module enabled, creating an invoice gives a sequential number and a PDF with the practitioner details.
  - With it disabled, no invoice UI is visible.

#### PAT-030 Appointments (deferred) — P2
- **Desc:** Scheduling.
- **RO:** [inf] Mentioned only in one review; competitors have it.
- **Target:** No built-in calendar. A follow-up date field on the consultation, and an ICS export of follow-ups.
- **AC:**
  - Setting a follow-up date and exporting ICS produces a valid VEVENT that imports into a calendar app.

---

## 9. Workspace (WS)

#### WS-001 App shell and panes — P0
- **Desc:** The main layout.
- **RO:** [doc, inf] Toolbar, TOC, clipboard rail, document area.
- **Target:** interaction-map §2: pane sizes, resizing and persistence.
- **AC:**
  - At 1440×900, the widths are rail 56, TOC 280, inspector 320 and main the remainder (±2px).
  - Dragged widths persist after reload.
  - The TOC and inspector collapse with the listed keys.

#### WS-002 Tabs — P0
- **Desc:** Multiple open documents.
- **RO:** [doc] Tabs stacked by document type.
- **Target:** Open, close, reorder by drag, pin, reopen closed (the last 20), duplicate, and an optional "group by kind" mode.
- **AC:**
  - Alt+W closes the active tab and Alt+Shift+T reopens it in the same state.
  - Tab order persists after reload.
  - With 30 tabs open, the strip scrolls and shows an overflow menu.

#### WS-003 Split view — P2
- **Desc:** Two documents side by side.
- **RO:** [doc] Several windows side by side.
- **Target:** "Move to split view" on a tab gives a vertical split with a draggable divider. Each pane has its own tab strip.
- **AC:**
  - A repertory in the left pane and Boericke in the right both stay navigable.
  - Closing one pane returns to the single layout.

#### WS-004 History and routing — P0
- **Desc:** Back and forward navigation.
- **RO:** [doc] Back, Forward and History buttons.
- **Target:** URL-backed routes (interaction-map §7). Alt+←/→ and the browser buttons both work, and history is per tab.
- **AC:**
  - Navigating A → B → C and pressing Alt+← twice returns to A, with the rubric focused.
  - A route URL opened directly renders the same document.

#### WS-005 History panel — P1
- **Desc:** A full list of recent locations.
- **RO:** [doc] The full "History" option.
- **Target:** Ctrl/Cmd+Shift+H opens a panel (Ctrl+Y is Redo on Windows) of the last 500 visits (document, rubric or section, time) with a filter. It can be cleared.
- **AC:**
  - Clicking an entry navigates there.
  - "Clear history" empties the panel and does not affect bookmarks.

#### WS-006 Bookmarks — P1
- **Desc:** Saved locations.
- **RO:** [doc] Bookmarks anywhere, grouped, with quick search; the Bookmarks TOC on Ctrl/Cmd+6 (3.2).
- **Target:** Toggle with Ctrl/Cmd+D on a rubric or MM paragraph. A Bookmarks TOC with groups (folders), colours and search. Arrow keys and Enter jump to a bookmark.
- **AC:**
  - Bookmarking 3 rubrics into the group "Fears" shows them under Fears.
  - Searching "alone" in the panel filters to the matching bookmark.
  - Bookmarks are included in the user-data export.

#### WS-007 Personal notes on rubrics — P1
- **Desc:** Annotations.
- **RO:** [doc] Personal notes and symptom notes (3.0) with links.
- **Target:** Markdown notes with links on any rubric, opened with Alt+N or the context menu. A notes index panel lists all notes, sortable by date.
- **AC:**
  - A note with a markdown link renders the link as clickable.
  - The notes index lists it, and the rubric shows a note icon.
  - Notes are private (never included in patient exports).

#### WS-008 Undo and redo — P0
- **Desc:** A global undo stack for workspace edits.
- **RO:** [doc] Ctrl/Cmd+Z for family limits only.
- **Target:** Command-pattern undo for clipboard operations, analysis filters, bookmarks, notes and additions. At least 200 steps per session. Text-editor undo stays local to the editor.
- **AC:**
  - Performing 5 mixed operations (take, set intensity, group, limit family, delete) and pressing Ctrl/Cmd+Z 5 times restores the initial state exactly.
  - Ctrl/Cmd+Shift+Z replays them.

#### WS-009 Autosave and workspace restore — P0
- **Desc:** Nothing is lost on reload.
- **RO:** [inf] Clipboards persist; tabs probably do not.
- **Target:** The workspace (tabs, panes, clipboards, selections, strategy, view) is saved to IndexedDB, debounced by 500 ms, and restored on load.
- **AC:**
  - Set up 4 tabs, a split, 2 clipboards and the kent strategy, then reload: the state is identical.
  - A corrupted workspace record falls back to the defaults with a notice and keeps a backup copy.

#### WS-010 Command palette — P0
- **Desc:** Keyboard access to everything.
- **RO:** — (RO has 103+ shortcuts).
- **Target:** Ctrl/Cmd+K: fuzzy search over commands with their shortcuts shown, recently used first, plus the SRC-001 document search. The take syntax can be typed with a `+` prefix.
- **AC:**
  - Every command in interaction-map §3 is listed.
  - Typing "+2>3" and pressing Enter with a rubric focused performs that take.
  - Recently used commands appear first.

#### WS-011 Default keyboard shortcuts and help overlay — P0
- **Desc:** RadarOpus-compatible key bindings.
- **RO:** [doc] F2–F8, Ctrl+1–6, Alt+1–3, the `+` syntax, and so on.
- **Target:** interaction-map §3 with browser fallbacks. F1 shows the overlay with every binding grouped by scope.
- **AC:**
  - Each binding in §3 triggers its command in an automated e2e test in Chromium, Firefox and WebKit, with the documented fallbacks where native keys are reserved.
  - F1 lists all of them.
  - A lint test fails CI if any default binding is one of the reserved browser or OS keys listed in interaction-map §3.1, or if any unmodified letter is bound in the Document scope.

#### WS-012 Rebindable shortcuts — P2
- **Desc:** A custom keyboard map.
- **RO:** —
- **Target:** Settings → Keyboard: record a new binding, detect conflicts, reset per command or all, and export or import the map.
- **AC:**
  - Rebinding "Simple search" to Ctrl+Shift+Y works immediately.
  - Assigning a binding that is already used shows the conflict and requires a confirmation.

#### WS-013 Context menus — P0
- **Desc:** Right-click menus throughout the app.
- **RO:** [doc] Several documented menus.
- **Target:** All the menus in interaction-map §4. They are keyboard-accessible (Shift+F10 and the Menu key) and open with a long press on touch.
- **AC:**
  - Each menu in §4 opens on its target and lists the specified items.
  - Arrow keys navigate, Enter activates and Esc closes, returning focus to the target.

#### WS-014 Settings — P0
- **Desc:** Global preferences.
- **RO:** [doc] Tools → Options: language, account, database, backups, practitioner details.
- **Target:** Sections: Appearance, Repertory, Search, Clipboards and analysis defaults, Materia medica, Patients and privacy, Keyboard, Data and storage, Backup, About. Changes apply live.
- **AC:**
  - Every setting persists after reload.
  - "Reset section" restores its defaults.
  - Settings can be exported and imported as JSON.

#### WS-015 Themes and colour-blind mode — P0
- **Desc:** Visual themes.
- **RO:** [doc] 3.3 new colour scheme; Synthesis App day and night.
- **Target:** Light, dark, sepia or follow the system. The grade colour-blind mode (REP-004). Tokens on `:root`.
- **AC:**
  - Switching theme repaints in under 100 ms with no reload.
  - "System" follows `prefers-color-scheme` changes live.
  - All themes pass the AA contrast check.

#### WS-016 Density, zoom and fonts — P0
- **Desc:** Readability controls.
- **RO:** [doc] Zoom; 3.3 font changes apply without a restart.
- **Target:** Density modes (interaction-map §2.3), zoom from 70% to 200%, font family choice for the repertory and MM body. All apply live.
- **AC:**
  - Ctrl/Cmd+= increases zoom by 10% up to 200%.
  - Changing the density keeps the focused rubric in view.

#### WS-017 Local options per window — P1
- **Desc:** Settings scoped to one document window.
- **RO:** [doc] A Local Options button in many windows.
- **Target:** A ⚙ in each local toolbar with the window-specific options (repertory: columns, cross-references, tags, tooltips, path click; analysis: excluded-in-position, header format; search: default scope).
- **AC:**
  - Changing the repertory local option "two columns" affects only that repertory tab's kind default, and the global settings show that it has been overridden.

#### WS-018 Presentation mode — P2
- **Desc:** A clean view for projecting.
- **RO:** [doc] Hide toolbars and clipboards.
- **Target:** Ctrl/Cmd+Alt+M (Ctrl+Shift+M is reserved by Chrome) hides the top bar, status bar and rail and increases the font by 25%. Esc exits.
- **AC:**
  - In presentation mode only the document area and a floating exit button are visible.
  - Esc restores the previous layout.

#### WS-019 Status bar — P1
- **Desc:** A footer showing the workspace state.
- **RO:** — (undocumented).
- **Target:** interaction-map §2.7. Each item is clickable to change it.
- **AC:**
  - The status bar shows the default clipboard, the symptom count, the view, the strategy and the intensity state, and updates within 100 ms of a change.
  - Clicking the strategy opens the strategy menu.

#### WS-020 Toasts and live announcements — P0
- **Desc:** Feedback on actions.
- **RO:** —
- **Target:** Non-blocking toasts with Undo where applicable. An `aria-live` region announces takes and re-ranks.
- **AC:**
  - A take shows the toast "Taken into 1 at intensity 2 · Undo" for 5 s, and Undo removes the line.
  - A screen reader hears the same text.

#### WS-021 Responsive and mobile layout — P1
- **Desc:** Works on phones and tablets.
- **RO:** — (separate mobile apps).
- **Target:** interaction-map §2.2: bottom navigation, the clipboard as a bottom sheet, swipe paging.
- **AC:**
  - At 360×740 every P0 flow (browse, search, take, analyse, drill down) completes with touch only (e2e test).
  - There is no horizontal page scroll.

#### WS-022 Offline and installable PWA — P1
- **Desc:** Works without a network connection.
- **RO:** — (desktop app).
- **Target:** A Service Worker caches the app shell and the downloaded data. The app is installable. "Download all data" is a setting.
- **AC:**
  - After loading publicum once, the app reloads and repertorises in airplane mode.
  - Installed as a PWA, Ctrl/Cmd+1–6 open the TOCs.

#### WS-023 Help and onboarding — P2
- **Desc:** In-app guidance.
- **RO:** [doc] Context-sensitive help with video.
- **Target:** A first-run tour (skippable), a "?" help link per panel to a docs page, and an empty-state hint per view.
- **AC:**
  - The tour runs on the first launch only and can be restarted from Help.
  - Every panel's help link resolves (link check).

#### WS-024 Multi-device sync — P2
- **Desc:** Syncs the workspace and patients across devices.
- **RO:** — (a documented weakness).
- **Target:** Optional end-to-end-encrypted sync (the server only stores ciphertext), offline-first, with conflict resolution per record (latest write wins, plus a conflict copy for notes).
- **AC:**
  - A clipboard edit on device A appears on device B within 10 s when both are online.
  - The server database contains no plaintext (inspection test).

#### WS-025 UI language (i18n) — P2
- **Desc:** Translated interface.
- **RO:** [doc] Menu language.
- **Target:** English at launch; German next. All strings are externalised (ICU messages).
- **AC:**
  - Switching to German translates 100% of the UI strings (a missing-key check fails CI).
  - Data content is not translated.

#### WS-026 Performance budgets — P0
- **Desc:** Speed of the application.
- **RO:** —
- **Target:** The initial JS bundle is at most 300 KB gzipped. Time to interactive is under 2.5 s on a mid-range laptop over cable (cold) and under 1 s warm.
- **AC:**
  - A Lighthouse CI performance score of 85 or more on the repertory route.
  - The bundle-size check fails CI above the budget.

#### WS-027 Storage quota and error handling — P1
- **Desc:** Behaves well when things fail.
- **RO:** —
- **Target:** Request persistent storage, show the storage usage in Settings, and warn above 80% of the quota. Failed writes are retried and surfaced.
- **AC:**
  - A simulated `QuotaExceededError` shows a blocking notice with "Export backup" and loses no in-memory state.
  - `navigator.storage.persist()` is requested after the first patient is created.

---

## 10. Import, export and printing (IO)

#### IO-001 Export an analysis file — P1
- **Desc:** Shares an analysis with a colleague.
- **RO:** [doc] Encrypted XML export (2.2 and later: encrypted, not password-protected).
- **Target:** An `.rpa.json` file (AnalysisInput, snapshot, data version) with optional password encryption (AES-GCM) and an "anonymise" option that strips the patient linkage and notes.
- **AC:**
  - Exporting and then importing on a clean profile reproduces the analysis (deep-equal input).
  - A password-protected file cannot be opened without the password.

#### IO-002 Import an analysis file — P1
- **Desc:** Loads a shared analysis.
- **RO:** [doc] Recall → Import.
- **Target:** Drop the file or use Recall → Import, with the merge option (CLP-026). Rubric ids that do not resolve are reported.
- **AC:**
  - A file referencing 2 unknown rubric ids imports the rest and lists the 2 as "missing" with their stored paths.

#### IO-003 Copy the analysis to the clipboard — P0
- **Desc:** Pastes the analysis into Word or a spreadsheet.
- **RO:** [doc] Ctrl/Cmd+C copies the analysis as RTF.
- **Target:** Ctrl/Cmd+C in the analysis copies an HTML table (grade styling) plus TSV plain text: the top N remedies × lines.
- **AC:**
  - Pasting into a spreadsheet gives N+1 columns (path plus remedies) and header rows for the scores.
  - Pasting into a rich-text editor keeps bold and italic grades.

#### IO-004 Export the analysis as CSV — P1
- **Desc:** A data export.
- **RO:** —
- **Target:** CSV with one row per line and a column per remedy (grade), plus header rows for score, C and D.
- **AC:**
  - The CSV for the fixture under T1 matches a golden file byte for byte (UTF-8, RFC 4180).

#### IO-005 Export a view as PNG — P2
- **Desc:** An image of the grid or bars view.
- **RO:** [doc] Camera screenshot.
- **Target:** Ctrl/Cmd+Shift+S renders the current view to a PNG at 2× scale.
- **AC:**
  - The PNG contains the visible headers and cells, has the view's width, and downloads with a dated filename.

#### IO-006 Print the analysis — P1
- **Desc:** A printable analysis.
- **RO:** [doc] Printable; layout undocumented.
- **Target:** A print stylesheet: a header (case or patient pseudonym, date, strategy, parameters), the grid (top 20 by default) and optionally the bars. Colour or black-and-white.
- **AC:**
  - Print preview fits 20 columns on A4 landscape.
  - In black-and-white, the grades remain distinguishable by glyph and weight.

#### IO-007 Print a prescription — P1
- **Desc:** A prescription sheet for the patient.
- **RO:** [doc] Prescription printing using the practitioner details.
- **Target:** A template with letterhead (IO-016), patient name, date, remedy, potency, posology and instructions.
- **AC:**
  - Printing produces one A4 or A5 page with all the fields.
  - Missing practitioner details show a warning before printing.

#### IO-008 Print a consultation, case cover or full history — P2
- **Desc:** Patient printouts.
- **RO:** [doc] Print everything at the patient's request; personal notes printed separately.
- **Target:** Templates: case cover, single consultation, full history (for a patient request), and a multi-patient overview.
- **AC:**
  - The full-history print excludes private notes (PAT-027).
  - Each template paginates with the patient name and page numbers in the footer.

#### IO-009 Encrypted backup — P1
- **Desc:** A single-file backup of all user data.
- **RO:** [doc] A single encrypted, password-protected file, with scheduling.
- **Target:** A `.rpbackup` file (encrypted ZIP of JSON and attachments). Manual download, plus automatic rotating backups in the browser store (daily for 30 days, monthly for 12 months).
- **AC:**
  - A backup of a 100-patient fixture downloads as one file.
  - The rotation keeps at most 30 daily and 12 monthly backups (clock-mocked test).

#### IO-010 Restore a backup — P1
- **Desc:** Restores user data.
- **RO:** [doc] Needs the password in use when the backup was made.
- **Target:** A restore dialog with the backup's password prompt. Mode: replace all, or merge with per-record New / Replace / Merge / Ignore (IO-013 rules).
- **AC:**
  - Restoring into an empty profile reproduces every record (count and hash check).
  - A wrong password gives an error and changes no data.

#### IO-011 Export and import user additions — P2
- **Desc:** Shares personal additions.
- **RO:** [doc] Additions logfiles with REPORT and ERROR logs.
- **Target:** A JSON additions file. Import produces a report listing the applied, skipped (duplicate) and error (unresolved rubric) entries.
- **AC:**
  - Importing a file with 10 additions (1 duplicate, 1 unresolved) applies 8 and reports "8 applied, 1 skipped, 1 error" with details.

#### IO-012 Export search results — P1
- **Desc:** Search results to a spreadsheet.
- **RO:** [doc] Export to Excel.
- **Target:** CSV and XLSX (via a client library) with the rubric path, count, remedies and grades.
- **AC:**
  - Exporting 50 results produces 50 data rows.
  - XLSX opens in a spreadsheet app with the grades in separate columns.

#### IO-013 Case bundle export and import with merge — P2
- **Desc:** Transfers patients between installations.
- **RO:** [doc] Patient history export; Complete Dynamics New / Replace / Merge / Ignore.
- **Target:** A `.rpcase` encrypted bundle of one or more patients, with incremental "modified since". On import, a dialog per conflict offers New / Replace / Merge / Ignore.
- **AC:**
  - Importing a bundle containing an existing patient id shows the conflict dialog, and each choice produces the documented result (4 e2e tests).

#### IO-014 Legacy analysis import (investigation) — P2
- **Desc:** Imports RadarOpus or Synthesis-App XML analyses.
- **RO:** [doc] RadarOpus XML and the Synthesis App XML.
- **Target:** A spike only. If the format is documented publicly and the user owns the file, map the rubric paths to publicum by fuzzy path match. No proprietary content is shipped.
- **AC:**
  - A written spike report exists stating feasibility and the licensing position before any code ships.

#### IO-015 Printed-content licensing cap — P1
- **Desc:** Limits how much repertory content is printed or exported.
- **RO:** — (Complete Dynamics caps printing at 20 rubrics).
- **Target:** A cap per export or print of the rubric-with-remedies lists, applied only to non-GPL or non-public-domain sources. There is no cap for GPL or public-domain data. Configurable per source licence.
- **AC:**
  - Printing 30 rubrics from a source flagged `capped` prints 20 with a notice.
  - Publicum is not capped.

#### IO-016 Letterhead and practitioner profile — P2
- **Desc:** Practitioner details for printouts.
- **RO:** [doc] Practitioner details from Tools → User account.
- **Target:** Settings → Practice: name, qualifications, address, contact and logo (PNG/SVG).
- **AC:**
  - The prescription and invoice templates show the logo and details.
  - Changing the profile updates the next print.

#### IO-017 Patient list export — P2
- **Desc:** Exports the patient list for research or administration.
- **RO:** [doc] Excel import/export ("cumbersome").
- **Target:** CSV or XLSX of the current (filtered) patient list with the chosen columns, with a pseudonymise option.
- **AC:**
  - Exporting with pseudonymise on contains no full names.
  - The column chooser controls the output columns.

#### IO-018 Legacy patient-file import (WinCHIP and CSV) — P2
- **Desc:** Brings existing patient records from another program.
- **RO:** [doc] WinCHIP Opus import into the RadarOpus patient file.
- **Target:** A spike first (same rules as IO-014: only publicly documented formats, user-owned files, no proprietary content). The shipped path is a generic CSV/XLSX import with column mapping (name, birth date, sex, contact, consultation date, consultation text, prescription), preview and a dry-run report.
- **AC:**
  - A spike report on the WinCHIP export format and its licensing position exists before any WinCHIP-specific code ships.
  - Importing a 100-row CSV fixture with 2 invalid dates creates 98 patients and reports the 2 rows with their line numbers; a dry run writes nothing.
  - Imported patients are encrypted at rest like any other (PAT-024 plaintext scan).

---

## 11. Data (DAT)

#### DAT-001 OOREP dump ETL — P0
- **Desc:** Parses `oorep.sql.gz` without Postgres.
- **RO:** —
- **Target:** data-plan Phase 1, steps 1–2.
- **AC:**
  - The row counts equal the data-plan §7 gates (rubric 143,408 total; rubricremedy 1,359,576; remedy 2,432).
  - Two runs give an identical sha256.

#### DAT-002 Remedy master list and aliases — P0
- **Desc:** Canonical remedy ids.
- **RO:** —
- **Target:** Slugs and the alias table (data-plan Phase 1, step 3).
- **AC:**
  - `Acon.`, `acon` and `Aconitum Napellus` all resolve to the same id.
  - Slug collisions are logged, and there are 0 unresolved collisions.

#### DAT-003 Publicum repertory package — P0
- **Desc:** The primary English repertory.
- **RO:** —
- **Target:** The rubric tree rebuilt from `fullpath`, sharded per chapter, grades 1–3.
- **AC:**
  - 74,667 source rubrics and 735,566 remedy links (the data-plan §7 row-count gate); synthetic nodes are fewer than 374 (0.5%) and are flagged `synthetic = true`.
  - The 20 golden rubrics match their fixtures exactly.
  - The package is at most 4 MB gzipped.

#### DAT-004 kent-de package — P1
- **Desc:** The German Kent repertory.
- **RO:** —
- **Target:** The same as DAT-003, with language DE.
- **AC:**
  - 68,741 rubrics.
  - The language badge is DE.
  - It is searchable with the DE analyser.

#### DAT-005 Boericke materia medica — P0
- **Desc:** The primary MM book.
- **RO:** —
- **Target:** Section trees from `mmsection`.
- **AC:**
  - 688 chapters and 6,393 sections.
  - Every chapter links to a remedy id.
  - `*italic*` renders as italics.

#### DAT-006 Boericke relationships — P1
- **Desc:** Parsed relations.
- **RO:** —
- **Target:** data-plan Phase 1, step 7.
- **AC:**
  - At least 90% of the tokens resolve.
  - An unresolved CSV is produced.
  - Nat-m's relations include the kinds present in its source text (golden test).

#### DAT-007 HomeoRemedica materia medica import — P1
- **Desc:** Boericke 9th edition, Clarke, Kent's Lectures and Allen's Nosodes.
- **RO:** —
- **Target:** data-plan Phase 2, with CC BY attribution.
- **AC:**
  - 4 books are installed, and each remedy chapter maps to a remedy id or is logged.
  - The attribution appears on About data.

#### DAT-008 Clarke re-parse (N.O. and Relations) — P1
- **Desc:** Clarke's family and relationship data.
- **RO:** —
- **Target:** data-plan Phase 2.
- **AC:**
  - Relation-set F1 of at least 0.85 on the 50-remedy QA sample.
  - The N.O. is captured for at least 80% of the plant remedies in Clarke.

#### DAT-009 Classification build — P1
- **Desc:** Kingdoms and families.
- **RO:** —
- **Target:** data-plan Phase 3.
- **AC:** The FAM-002 to FAM-005 AC pass, as do the data-plan §7 kingdom-coverage gate and a 97% precision sample.

#### DAT-010 Precomputed statistics — P0
- **Desc:** Values the scoring engine needs.
- **RO:** —
- **Target:** `remedy_count` per rubric, m_r per remedy, repertory and view, and default chapter categories.
- **AC:**
  - For 10 random rubrics, `remedy_count` equals the count of their rubric_remedy rows.
  - m_r for 10 random remedies equals the count of their rows.

#### DAT-011 Search indexes and word forms — P0
- **Desc:** Build-time search indexes.
- **RO:** —
- **Target:** Per-repertory MiniSearch indexes and a word-form (branch) table (SRC-005). A size-triggered switch to SQLite FTS5.
- **AC:**
  - The publicum index is at most 6 MB gzipped.
  - A query benchmark gives a p95 under 50 ms over 1,000 sample queries.

#### DAT-012 Data versioning and manifest — P0
- **Desc:** Identifies each build of the data.
- **RO:** [doc] LiveUpdate / Content Updater.
- **Target:** `manifest.json` with the version id and per-file sha256. The client checks it for updates and shows "New data available".
- **AC:**
  - Changing one shard changes the manifest version.
  - The client downloads only the changed files (network log).

#### DAT-013 Provenance and About data — P0
- **Desc:** Source attribution throughout.
- **RO:** —
- **Target:** A `source` table, a `source_id` on every row, and an About data page listing the sources, licences, links and NOTICE text.
- **AC:**
  - The data-plan §7 licence gate passes.
  - The About page lists every source present in the manifest.

#### DAT-014 Licence packaging — P0
- **Desc:** Keeps GPL data separate.
- **RO:** —
- **Target:** The `packages/data-oorep` package with LICENSE (GPL-3.0), NOTICE and SOURCE.md. The app code licence is a LEGAL decision (data-plan §8).
- **AC:**
  - The built data package contains LICENSE, NOTICE and SOURCE.md.
  - CI fails if any data file is missing from the manifest's licence map.

#### DAT-015 Offline data caching — P1
- **Desc:** The data is available offline.
- **RO:** —
- **Target:** The Service Worker caches the manifest, index and shards, on demand or all at once.
- **AC:** See WS-022. Additionally, "Download all" reports its progress and total size before starting.

#### DAT-016 Kent 1897 from OCR — P2
- **Desc:** The English Kent repertory from a public-domain scan.
- **RO:** —
- **Target:** data-plan Phase 4.
- **AC:** Grade agreement with Publicum of at least 95% on matched rubrics, and the tree integrity gates pass.

#### DAT-017 Boenninghausen TPB 1891 and polar pairs — P2
- **Desc:** The 1–5 grade repertory, concordances and polar pairs.
- **RO:** —
- **Target:** data-plan Phase 4.
- **AC:**
  - At least 200 curated polar pairs are loaded.
  - REP-038 and ANA-017 work end to end on a TPB case.

#### DAT-018 Knerr 1896 — P2
- **Desc:** Knerr's repertory of Hering's Guiding Symptoms.
- **RO:** —
- **Target:** data-plan Phase 4.
- **AC:** Tree integrity gates pass, and grades take values in 1–4.

#### DAT-019 Gibson Miller relationships — P2
- **Desc:** Hand-transcribed relations.
- **RO:** —
- **Target:** data-plan Phase 4.
- **AC:** About 150 remedies with double-entry agreement of at least 99%, and the relations appear in MM-009 with source "Gibson Miller".

#### DAT-020 Anshutz — P2
- **Desc:** *New, Old and Forgotten Remedies* (Gutenberg #38757).
- **RO:** —
- **Target:** data-plan Phase 2.
- **AC:** The book is installed with the Gutenberg header and footer stripped, and its chapters are mapped to remedies or logged.

#### DAT-021 CI quality gates — P0
- **Desc:** Automated data QA.
- **RO:** —
- **Target:** Every gate in data-plan §7 runs in CI on each ETL change.
- **AC:** A deliberately broken fixture (a missing parent) fails the tree-integrity gate.

#### DAT-022 User data layer schema — P0
- **Desc:** The IndexedDB stores for user data, separate from the content.
- **RO:** —
- **Target:** Stores: workspace, clipboards, analyses, bookmarks, notes, additions, families, settings, patients* (encrypted). Versioned migrations.
- **AC:**
  - A schema upgrade from v1 to v2 migrates the fixture data without loss (migration test).
  - The content packages can be replaced without touching the user stores.

#### DAT-023 Scoring fixtures — P0
- **Desc:** Golden test data for ANA.
- **RO:** —
- **Target:** Fixtures F1 and F2 and vectors T1–T27 and E1–E10 as JSON under `packages/engine/test/fixtures/`.
- **AC:** The engine test suite loads every vector, and CI fails on any mismatch.

---

## Summary counts

| System | Prefix | Items | P0 | P1 | P2 |
|---|---|---|---|---|---|
| Repertory browser | REP | 38 | 15 | 12 | 11 |
| Search | SRC | 25 | 9 | 11 | 5 |
| Clipboards / case symptoms | CLP | 30 | 16 | 8 | 6 |
| Analysis engine | ANA | 30 | 12 | 10 | 8 |
| Analysis visualisation and drill-down | VIS | 22 | 9 | 8 | 5 |
| Materia medica and remedy info | MM | 20 | 5 | 8 | 7 |
| Families / kingdoms and filters | FAM | 16 | 0 | 10 | 6 |
| Patients and consultations | PAT | 30 | 0 | 18 | 12 |
| Workspace (tabs, panes, history, bookmarks, notes, undo/redo, autosave, command palette, shortcuts, context menus, settings, themes) | WS | 27 | 13 | 8 | 6 |
| Import / export and printing | IO | 18 | 1 | 9 | 8 |
| Data | DAT | 23 | 12 | 6 | 5 |
| **Total** | | **279** | **92** | **108** | **79** |

Priority counts are taken from each item heading. Where a heading carries a split priority (SRC-006, FAM-007, PAT-028), the item is counted under its first-listed priority.
