# Interaction map: layout, keyboard, context menus, flows and analysis views

Status: normative UI spec for the web successor. Sources are `reports/ui.md`, `reports/features.md` and `reports/patients.md`.
- **RO:** RadarOpus reference behaviour.
- **[OURS]:** our design choice where RadarOpus is undocumented or we exceed it.

Visual identity must not copy Synthesis/RadarOpus branding. The 1–4 grade typographic convention is a public repertory tradition and is kept.

---

## 1. Mental model

- **One workspace over linked documents.** The document types are repertory, reference (materia medica), patient, remedy, family, search result and analysis. Every document has a URL (section 7), so the browser's Back and Forward act as history.
- **The clipboard rail is always present.** The set of clipboards is "the Analysis" (RO).
- **Tabs.** Documents open in tabs grouped by kind (RO stacks all repertories in one tab). [OURS] Each document gets its own tab, and a kind-grouping toggle reproduces RO stacking.

---

## 2. Layout spec (desktop, 1440×900 reference)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar 44px: logo · TOC toggles(6) · Find · Take▾ · Search▾ · Analysis ·    │
│ Back/Fwd/History · quick search (Ctrl+K palette) · patient banner · settings  │
├──────┬──────────────┬─────────────────────────────────────────┬──────────────┤
│Clip- │ TOC panel    │ Tab strip 32px                          │ Inspector    │
│board │ 280px        ├─────────────────────────────────────────┤ 320px        │
│rail  │ (Repertories │ Local toolbar 36px: Find·Take·View▾·    │ (Remedy info,│
│56px  │ /References/ │ Tags▾·display cycle·zoom·Local options  │ drill-down,  │
│      │ Patients/    ├─────────────────────────────────────────┤ rubric notes)│
│ 1 ●  │ Remedies/    │ Breadcrumb (symptom path) 28px          │ collapsible  │
│ 2    │ Families/    ├─────────────────────────────────────────┤              │
│ 3    │ Bookmarks)   │ Document body (rubric list, 1 or 2 col) │              │
│ …    │ collapsible  │   or analysis split (section 5)         │              │
│ +    │              │                                         │              │
├──────┴──────────────┴─────────────────────────────────────────┴──────────────┤
│ Status bar 24px: default clipboard · #symptoms · view · strategy · data ver  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Pane sizes

| Pane | Default | Min / max | Resizable | Collapse |
|---|---|---|---|---|
| Clipboard rail | 56px (icons) | expands to 300px as a list with names and counts | yes when expanded | Ctrl/Cmd+B toggles expanded; "Hide toolbars & clipboards" (presentation) hides it |
| TOC panel | 280px (about 19%) | 200–480px | drag handle, persisted | Double-click a tab hides the TOC (RO); Ctrl/Cmd+\ |
| Main document | fills the rest (about 56–75%) | min 480px | — | — |
| Inspector | 320px (about 22%) | 260–560px | yes | auto-opens on a remedy double-click; Esc closes it when focused |
| Top bar | 44px | — | — | hidden in presentation mode |
| Status bar | 24px | — | — | hidden in presentation mode |

- Pane widths persist per device in local storage.
- A workspace layout (open tabs, pane widths, active document) is restored on reload [OURS].

### 2.2 Responsive breakpoints

| Width | Behaviour |
|---|---|
| ≥ 1280 | Full layout as above. |
| 1024–1279 | The inspector overlays the right edge as a drawer. The TOC is docked but starts collapsed. |
| 768–1023 | The TOC and inspector are drawers. The clipboard rail stays at 56px. The analysis defaults to the "analysis only" view. |
| < 768 (phone) | Single column with no horizontal page scroll and a 16px side gutter. Bottom navigation: Browse, Search, Clipboard, Analysis, Patients. The clipboard becomes a bottom sheet (peek 64px showing default clipboard and count). Swipe left/right pages rubrics. Long-press replaces right-click. |

### 2.3 Density modes (Settings → Appearance) [OURS]

| Mode | Rubric row min height | Body font | Remedy list font | Line height |
|---|---|---|---|---|
| Compact (print-like, the RO default feel) | 20px | 13px | 12px | 1.35 |
| Comfortable (default) | 24px | 14px | 13px | 1.45 |
| Large | 30px | 16px | 15px | 1.5 |

- Zoom runs 70–200% in steps of 10 with Ctrl/Cmd+= / − / 0. It applies live, with no reload (RO 3.3).
- Two-column layout (RO local option) is available at 1280px and wider. The columns flow like newspaper columns, and each rubric's remedies wrap under it.

### 2.4 Typography

- **Font stacks.**
  - UI: system sans (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`).
  - Repertory and MM body: a selectable serif (`"Source Serif 4", Georgia, serif`) or sans, per setting.
  - Remedy abbreviations: the same family as the body, with tabular numerals for counts.
- **Rubric hierarchy.**

| Level | Style |
|---|---|
| Chapter heading | 13px uppercase, letter-spacing 0.06em, semibold, `--rubric-chapter` |
| Main rubric | semibold, `--rubric-main` (accent colour); the RO App shows main rubrics in blue |
| Sub-rubric (depth ≥ 2) | regular, `--text`; indented 16px per level (12px in compact) |
| Empty parent rubric (no remedies, has children) | regular, `--text-muted`, with a trailing "│" separator (RO App convention) |
| Remedy count | `(54)` in `--text-muted` tabular numerals, right after the rubric text |

- **Remedy grade typography.** Grade must never be carried by colour alone. WCAG AA contrast is required in both themes.

| Native grade (1–4 scale) | Case | Weight / style | Light token | Dark token | Example |
|---|---|---|---|---|---|
| 1 | lower case | regular | `--grade-1: #3b3b3b` | `#c9c9c9` | acon |
| 2 | Capitalised | *italic* | `--grade-2: #1f5fa8` | `#8ab8f0` | *Acon* |
| 3 | Capitalised | **bold** | `--grade-3: #b3261e` | `#ff8a80` | **Acon** |
| 4 | UPPER CASE | **bold** + 1px underline | `--grade-4: #8c1d18` | `#ffb4ab` | **ACON** |
| 5 (TPB 1–5 scale) | UPPER CASE | **bold** + double underline | `--grade-5: #6d1812` | `#ffd2cc` | **ACON** |

  - On a 1–3 scale (Publicum, Kent), grades 1–3 use rows 1–3.
  - Excluded or filtered remedies: `--text-disabled` with a strikethrough when they are shown "in their position".
  - Family pseudo-remedies: suffix `*` and a dotted underline.
  - Source markers (display mode 3): superscript author abbreviation in `--text-muted`, 0.8em. `°` modern proving, `*` hypothetical, `~` veterinary, and `↓` copied from a sub-rubric.
  - A "colour-blind safe" setting switches the grade colours to a single neutral ink, so that only case, weight and underline carry the grade.

- **Theme tokens.** Themes are light, dark and sepia [OURS]. All colours are CSS custom properties on `:root`, dark mode uses `prefers-color-scheme` plus an explicit override, and the body background is always explicit.

### 2.5 Rubric row anatomy

```
[☐] MIND › FEAR › alone, of being  (54)  [🔖][📝][⇄3][⚑]
    acon ars *Bism* **CAMPH** …                      ← display mode 2/3
```

- The selection checkbox appears only in multi-select mode or in search results.
- The count follows the rubric text.
- Tag icons: bookmark, note, cross-reference count (collapsed; hover lists them), concept or explanation flag, polar (yin-yang, for TPB).
- **Hand indicator [RO]:** the current rubric has a 3px left accent bar and `aria-current="true"`.

### 2.6 Clipboard rail anatomy

- Each clipboard is a 40×40 square showing its number, with the symptom count as a badge.
  - The default clipboard has a filled accent ring.
  - Clipboards selected for analysis have a check overlay.
  - An empty clipboard is outlined.
  - The name appears as a tooltip, or as a label when the rail is expanded.
  - A colour dot shows when the user set a colour [OURS].
- A "+" at the bottom adds a clipboard. There are 12 by default and 30 at most [OURS; RO caps at 12].
- **Expanded row (300px):** `[intensity chip 1–4|0] [E/X qualifier chip] [group letter chip] rubric path… (n) [note icon]`.

### 2.7 Status bar
`Clipboard 1 "Chronic" · 14 symptoms (12 active) · View: Publicum full · Strategy: Sum of symptoms (deg) · Intensity on · Data v2026.09 · [lock icon] Patient: J. D. (linked)`

---

## 3. Keyboard map

### 3.1 Principles
- RadarOpus-compatible defaults, so migrating users feel at home.
- Every command is also in the command palette (Ctrl/Cmd+K) with its shortcut shown.
- All bindings can be changed in Settings → Keyboard, with conflict detection.
- **Browser constraints.**
  - Ctrl+1–9, Ctrl+T, W, N, Tab and L cannot be captured in a normal browser tab, so they have fallbacks.
  - F5 and Ctrl+R can be intercepted with `preventDefault` in Chromium and Firefox but not reliably everywhere, so they have fallbacks.
  - When the app runs as an installed PWA window, the RadarOpus bindings for these keys are enabled.
- Shortcuts are scoped: **Global**, **Document** (repertory or reference focused), **Clipboard** (rail or list focused), **Analysis** (grid focused) and **Dialog**.
- Single-letter keys never fire while focus is in an editable field.
- **Document-scope letters belong to type-to-jump.** In the Document scope every unmodified letter a–z starts type-to-jump (REP-008), so document toggles use Alt+letter (matched on `KeyboardEvent.code`, so macOS Option characters such as `å` do not break them). Chapters such as Nose, Teeth, Throat, Vertigo and Larynx would otherwise be unreachable by typing.
- **Keys the browser or OS keeps.** Ctrl/Cmd+Shift+N (incognito), Ctrl/Cmd+Shift+T (reopen tab), Ctrl/Cmd+Shift+P (Firefox private window), Ctrl+Shift+Q (Firefox quit on Windows/Linux) and Ctrl+Shift+M (Chrome profile menu) cannot be reliably intercepted and are never used as defaults. On Linux, Alt+1–9 switches browser tabs in Chrome and Firefox, so every Alt+digit binding has a listed fallback. Ctrl+Alt combinations equal AltGr on Polish, German and other layouts, so an e2e test with the `de` and `pl` layouts checks that AltGr text entry (e.g. `ł`, `@`) in editors never triggers a Ctrl+Alt command.

### 3.2 Global

| Action | RO key | Web default | Fallback / notes |
|---|---|---|---|
| Command palette | — | Ctrl/Cmd+K | F1 overlay lists it; no second default (Ctrl/Cmd+Shift+P is Firefox's private window) |
| Shortcut help overlay | — | F1 | Ctrl/Cmd+/ (`?` is kept for Simple search, RO) |
| TOC: Repertories | Ctrl/Cmd+1 | Alt+Shift+1 | Ctrl/Cmd+1 in PWA mode |
| TOC: References | Ctrl/Cmd+2 | Alt+Shift+2 | Ctrl/Cmd+2 in PWA |
| TOC: Patients | Ctrl/Cmd+3 | Alt+Shift+3 | Ctrl/Cmd+3 in PWA |
| TOC: Remedies | Ctrl/Cmd+4 | Alt+Shift+4 | Ctrl/Cmd+4 in PWA |
| TOC: Families | Ctrl/Cmd+5 | Alt+Shift+5 | Ctrl/Cmd+5 in PWA |
| TOC: Bookmarks | Ctrl/Cmd+6 | Alt+Shift+6 | Ctrl/Cmd+6 in PWA |
| Toggle the TOC panel | double-click a tab | Ctrl/Cmd+\ | double-click a tab also works |
| Toggle the inspector | — | Ctrl/Cmd+I | |
| Toggle clipboard rail expanded | — | Ctrl/Cmd+B | |
| Switch to the Repertory window | Alt+1 | Alt+1 | Ctrl/Cmd+Alt+1 (Alt+1 switches browser tabs on Linux) |
| Switch to the Reference window | Alt+2 | Alt+2 | Ctrl/Cmd+Alt+2 (Alt+2 switches browser tabs on Linux) |
| Switch to the Patient window | Alt+3 | Alt+3 | Ctrl/Cmd+Alt+3 (Alt+3 switches browser tabs on Linux) |
| Switch to the Analysis window | — | Alt+4 | Ctrl/Cmd+Alt+4 |
| Back / Forward | toolbar | Alt+← / Alt+→ | browser buttons also work (URL-backed) |
| History panel | toolbar | Ctrl/Cmd+Shift+H | Ctrl/Cmd+Y is not used: it is Redo on Windows |
| Next / previous tab | — | Ctrl+PageDown / PageUp | Ctrl/Cmd+Alt+→/← |
| Close tab | — | Alt+W | Ctrl/Cmd+W only in PWA |
| Reopen closed tab | — | Alt+Shift+T | |
| Find (hierarchical) | F2 | F2 | Ctrl/Cmd+G |
| Find from the current location | F3 | F3 | Ctrl/Cmd+Shift+G |
| Simple search | F4 or `?` | F4 or `?` | Ctrl/Cmd+F |
| Advanced search | F5 | F5 (intercepted) | Ctrl/Cmd+Shift+F |
| Take with options | F6 | F6 | Ctrl/Cmd+Enter |
| Clipboards: symptoms only | F7 | F7 | Alt+Shift+7 |
| Symptoms plus analysis | F8 | F8 | Alt+Shift+8 |
| Analysis only | — | F9 | Alt+Shift+9 |
| Save analysis | Ctrl/Cmd+S | Ctrl/Cmd+S | |
| Recall analysis | Ctrl/Cmd+R | Ctrl/Cmd+O | Ctrl/Cmd+R in PWA |
| Undo / Redo (all workspace edits) | Ctrl/Cmd+Z (family limit only) | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Ctrl+Y on Windows |
| Zoom in / out / reset | zoom | Ctrl/Cmd+= / − / 0 | the app intercepts browser zoom and uses its own |
| Toggle theme | — | Ctrl/Cmd+Shift+L | |
| Presentation mode | lower-left corner | Ctrl/Cmd+Alt+M | Ctrl+Shift+M is reserved by Chrome |
| Congress mode (pseudonymise) | toggle | Ctrl/Cmd+Shift+C… | **Conflict:** this is also "copy text only" in the Document scope. Congress mode is therefore reached from the palette or the settings toggle, with no default key |
| Lock the app (encrypted store) | timeout | Ctrl/Cmd+Alt+L | Ctrl+Shift+Q quits Firefox on Windows/Linux; also in the palette and on the status-bar lock icon |
| Screenshot / export view as PNG | camera | Ctrl/Cmd+Shift+S | |

### 3.3 Document scope (repertory or reference)

| Key | Action |
|---|---|
| Letters a–z (no modifier, not in a field) | Open the chapter chooser pre-filtered with the typed text ("mi" + Enter opens MIND). With the local option "stay in chapter", it opens Find at the current chapter (RO) |
| ↑ / ↓ | Previous / next rubric at any depth |
| Shift+↑ / Shift+↓ | Previous / next sibling at the same level |
| → | Expand children, or step into the first child |
| ← or Backspace | Up one level (RO) |
| Home / End | First / last rubric of the chapter |
| PageUp / PageDown | Page |
| Alt+↑ / Alt+↓ | Previous / next chapter |
| Enter | Open the rubric (focus the remedies), or descend a level in Find |
| Space | Cycle the display: count only, then abbreviations, then abbreviations plus authors (RO) |
| Shift+Space | Cycle the display backwards |
| `+` Enter or `=` | Take at intensity 1 into the default clipboard (RO) |
| `+n` Enter (n 1–4) | Take at intensity n |
| `+n>m` Enter | Take at intensity n into clipboard m (1–30) |
| `+!` / `+n!` | Take as eliminative |
| `+-` / `+n-` [OURS] | Take as exclusive. RO has no keyboard exclusive |
| `+a`…`+z` / `+na` | Take into group letter a–z |
| `+/s` / `+n/s` | Take with sub-rubrics as a group |
| `+/x` / `+n/x` | Take with cross-references as a group |
| `+^` / `+n^` [OURS] | Take as causative |
| Esc | Cancel a pending take sequence (the inline take HUD shows the parsed command) |
| Ctrl/Cmd+Click (cross-reference) | Multi-select cross-references to take with the rubric (RO) |
| Ctrl/Cmd+C | Copy the rubric with its remedies (RO) |
| Ctrl/Cmd+Shift+C | Copy the rubric text only (RO) |
| Ctrl/Cmd+D | Toggle a bookmark on the current rubric |
| Alt+N | Add or edit a personal note on the focused rubric |
| Alt+X | Toggle cross-references expanded or collapsed |
| Alt+T | Toggle tags visibility |
| Alt+V | Open the repertory-view selector |
| Alt+L | Toggle two-column layout |
| Double-click a remedy / Enter on a focused remedy | Open Remedy Info in the inspector (RO RIW) |
| Double-click an author reference | Open the source text of an addition (RO) |

**Take mini-language grammar [OURS, a superset of RO]:**

```
take      := ('+' spec | '=')                ; '=' acts immediately; '+…' waits for ENTER
spec      := intensity? target? flag* group? expand?
intensity := [0-4]                           ; default 1
target    := '>' clipboardNumber             ; 1..30; default = default clipboard
flag      := '!' (eliminative) | '-' (exclusive) | '^' (causative)
group     := [a-z]                           ; group letter
expand    := '/s' (with sub-rubrics) | '/x' (with cross-references)
```

- The order is fixed as shown. Tokens are case-insensitive, and whitespace is ignored.
- `!` and `-` are mutually exclusive. If both are present, the parser rejects the command and the HUD shows an error.
- Examples:
  - `+3>2!` takes at intensity 3 into clipboard 2 as eliminative.
  - `+2a/s` takes at intensity 2 with sub-rubrics into group a.
  - `+1>2`, `+!` and `+1/x` behave exactly as in RadarOpus.

### 3.4 Clipboard scope (rail or symptom list focused)

| Key | Action |
|---|---|
| 1–4 | Set intensity of the selected symptoms (RO) |
| 0 | Keep but ignore (intensity 0) (RO) |
| E | Toggle eliminative |
| X | Toggle exclusive |
| C | Toggle causative |
| G then a letter | Assign a group letter; G then Backspace clears it |
| Ctrl/Cmd+↑ / ↓ | Move the symptom up or down (RO) |
| Ctrl/Cmd+A | Select all (RO) |
| Shift+↑ / ↓ | Extend the selection |
| Delete / Backspace | Remove the selected symptoms (undoable) |
| Ctrl/Cmd+G | Group the selected symptoms (next free letter) |
| Ctrl/Cmd+Shift+G | Combine the selected symptoms into a new rubric (union, max grade) |
| Enter | Jump to the rubric in the repertory |
| N | Edit the symptom note [OURS] |
| Alt+Click (clipboard icon) | Set as default clipboard (RO) |
| Ctrl/Cmd+Click (clipboard icon) | Add or remove the clipboard from the analysis selection (RO) |
| 1–9 with Shift, when the rail itself (not a symptom row) is focused | Select clipboard 1–9 as the analysis target (Alt+digit is avoided: it switches browser tabs on Linux) |

### 3.5 Analysis scope (grid focused; ARIA grid)

| Key | Action |
|---|---|
| ← → ↑ ↓ | Move the cell focus |
| Enter / double-click on a remedy header | Remedy info plus drill-down in the inspector (RO: RIW) |
| Enter on a symptom row header | Highlight the remedies in that rubric |
| H | Highlight the focused remedy's column and dim uncovered rows |
| S | Cycle the strategy (opens the strategy menu, the "chess" equivalent) |
| I | Toggle intensity on/off |
| V / Shift+V | Cycle views: grid, bars, cards. Tab and Shift+Tab are NOT captured: they move focus into and out of the grid, per the ARIA grid pattern (WCAG 2.1.2, no keyboard trap) |
| / | Focus the remedy finder (jump to the remedy's rank) (RO) |
| F | Open the family limit/highlight picker |
| Ctrl/Cmd+Z | Undo the last limit, highlight or edit (RO) |
| Ctrl/Cmd+C | Copy the analysis as a table: HTML, plus TSV plain text (RO copies RTF) |
| Ctrl/Cmd+Shift+E | Export (PNG / CSV / print) |
| `[` / `]` | Show fewer / more remedy columns (10, 20, 30, 50, 100, all) |
| X | Toggle "show excluded in position" |
| C | Add the focused remedy to the comparison set (max 10) |

### 3.6 Patient scope

| Key | Action |
|---|---|
| Ctrl/Cmd+Alt+N | New patient |
| Ctrl/Cmd+Alt+C | New consultation for the open patient (Ctrl/Cmd+Shift+N is the browser's incognito window) |
| Ctrl/Cmd+Alt+P | New prescription |
| Ctrl/Cmd+E | Grade the selected text in the consultation editor as a symptom (then 1–4) |
| Ctrl/Cmd+Alt+G | Apply a tag to the selected symptom (Ctrl/Cmd+Shift+T reopens a browser tab) |
| Ctrl/Cmd+Alt+A | Link the current analysis to this consultation |

---

## 4. Context menus

Every menu is also reachable with Shift+F10 or the Menu key, and with long-press on touch. Items that are unavailable are disabled, not hidden. **Bold** marks the default action, which is the same as a double-click.

1. **Rubric (repertory body)**
   - **Open / focus**
   - Take ▸ intensity 1, 2, 3, 4 · Into clipboard ▸ 1…N · As eliminative · As exclusive · With sub-rubrics · With cross-references · Take with options… (F6)
   - Copy with remedies · Copy text only · Copy link
   - Bookmark ▸ toggle, or add to a group…
   - Add personal note…
   - Show cross-references ▸ list · Show referring rubrics
   - Find from here (F3) · Search within this rubric (sets the Search Area)
   - Add to Search Area
   - Additions ▸ Add remedy… · Add sub-rubric… · Add cross-reference… (personal layer)
   - Open in new tab · Open in split view
2. **Remedy abbreviation (in a rubric, search result or MM text)**
   - **Remedy info**
   - Search this remedy in ▸ current repertory · all repertories · materia medica · all library
   - Remedy search options… (degrees, min/max rubric size, max co-remedies)
   - Open keynotes (favourite books)
   - Compare with… (adds to the comparison set)
   - Show family ▸ opens the family tree node
   - External ▸ Wikipedia · GBIF · PubChem (by taxonomy or chemistry id; opens in a new browser tab)
   - Edit my addition… / Remove my addition (only on user additions)
   - Show source (author reference)
3. **Clipboard icon (rail)**
   - **Set as default** (Alt+click)
   - Analyse this clipboard only · Add to analysis selection (Ctrl/Cmd+click)
   - Rename… (with "Save as default name") · Set colour ▸
   - Save analysis… (Ctrl/Cmd+S) · Save analysis to folder… · Recall analysis… (with "Merge with current case") · Import analysis file… · Export analysis file…
   - Sort symptoms ▸ homeopathic order · intensity descending · alphabetical · rubric size
   - Clear this clipboard · Clear all clipboards (confirm; undoable)
   - Duplicate clipboard [OURS] · Delete clipboard (only when there are more than 1)
4. **Symptom row in a clipboard (single or multi-select)**
   - **Go to rubric**
   - Intensity ▸ 0, 1, 2, 3, 4
   - Qualification ▸ normal · eliminative · exclusive · causative (toggle)
   - Category ▸ auto · SRP · mental · general · particular
   - Group ▸ assign letter… · ungroup
   - Combine into new rubric (union, max grade) · Cross into new rubric (intersection, min grade)
   - Move ▸ up · down · to clipboard N · Copy to clipboard N
   - Polarity ▸ set opposite rubric… (polarity strategy)
   - Generalise ▸ link general rubric… (Boenninghausen preset)
   - Edit note… [OURS]
   - Remove
5. **Analysis remedy column header**
   - **Remedy info and drill-down**
   - Highlight column · Pin to the left [OURS]
   - Add to compare
   - Limit to this remedy's family ▸ (chooses the classification) · Highlight family ▸
   - Exclude this remedy from the view [OURS] (temporary; undoable)
   - Copy remedy coverage (the rubrics it covers and misses)
6. **Analysis cell**
   - **Go to rubric at this remedy**
   - Show source authors for this grade
   - Filter: show only the rubrics containing this remedy
7. **Analysis symptom row header**
   - **Go to rubric**
   - Highlight the remedies in this rubric
   - Intensity ▸ · Qualification ▸ · Remove from clipboard (the same actions as menu 4)
8. **Analysis background / toolbar**
   - Strategy ▸ (catalogue) · Intensity on/off · Parameters… · Compare with strategy… (§5.11)
   - View ▸ grid · bars · cards · polarity · families · segments
   - Show N remedies ▸ · Show excluded in position (toggle)
   - Clear family limit (Ctrl/Cmd+Z) · Copy · Export ▸ PNG · CSV · print
9. **TOC: repertory or book node**
   - **Open**
   - Open in new tab · Add to favourites (pin to top) · Remove from favourites
   - Include in document mix (checkbox) · Save selection as document mix… · Set as default document mix
   - Show info / licence and source
   - Search in this book
10. **TOC: chapter or main rubric node** (repertory tree)
    - **Open** · Add to Search Area · Find from here · Bookmark
11. **TOC: family node**
    - **Open family (members list)**
    - Limit analysis to this family · Highlight this family in analysis
    - Run family overview analysis
    - Add personal family note… · Edit my family… (for user-defined families)
12. **TOC: remedy list item**
    - **Remedy info** · Search everywhere · Add to compare · Show families
13. **Search result row**
    - **Go to rubric**
    - Take selected ▸ (intensities) · Take all ▸
    - Take selected and create a combined rubric · Take all and create a combined rubric
    - Select all · Export results ▸ CSV · XLSX
    - Open in graphical comparison (the tab combiner)
14. **Tab**
    - Close · Close others · Close to the right · Reopen closed
    - Duplicate · Move to split view · Pin tab
    - Hide TOC (double-click)
15. **Breadcrumb segment**
    - **Go to this level**
    - Find from here (F3) · Copy path
16. **MM (reference) text selection**
    - Take as link symptom (into a clipboard)
    - Bookmark paragraph · Add note
    - Search the selection (Simple search) · Search the selection in repertories
    - Copy · Copy with citation
17. **Patient list row**
    - **Open**
    - New consultation · Move to group ▸ · Pin · Archive
    - Export patient (JSON/PDF) · Print full history
    - Delete patient… (GDPR erase; typed confirmation)
18. **Consultation (timeline item)**
    - **Open**
    - Duplicate as follow-up · Lock / unlock (per region preset) · Show revision history
    - Open linked analysis · Open side by side with…
    - Print · Export
19. **Symptom span in the consultation editor**
    - Grade ▸ 1, 2, 3, 4 · Tags ▸ · Link to rubric… · Add to clipboard ▸ · Copy to current consultation (from a past one) · Attach file…
20. **Bookmark item (Bookmarks TOC)**
    - **Go to** · Rename · Move to group ▸ · Change colour ▸ · Delete
21. **Prescription row**
    - Edit · Add evaluation… · Duplicate as repeat · Print prescription · Mark as planned / given

---

## 5. Analysis views

### 5.1 Display modes (RO F7, F8 and "analysis only")
- **F7, symptoms only.** The clipboard list fills the main pane.
- **F8, split.** The symptom list is on top and the analysis below.
  - Horizontal split, 40/60, when the main pane is at least 900px high; otherwise a vertical split, 35/65.
  - The splitter is draggable and its position persists.
- **F9 [OURS], analysis only.**

### 5.2 Grid view (default)
- **Columns are remedies**, in rank order from left to right.
  - The header shows rank, abbreviation, the score as `C/D` or the strategy score, and a family colour chip. It is 44px wide in compact density and 52px in comfortable.
  - Show 10, 20, 30, 50, 100 or all columns; the default is 20. Virtualised horizontally.
- **Rows are the effective symptom lines.**
  - The sticky left column (320px) shows the intensity chip, qualifier chip, group letter, rubric path (truncated with a tooltip) and n.
- **Cells.**
  - Grade shown as a glyph: `·` for 1, `◆` for 2, `■` for 3, `█` for 4, with the grade colour AND a distinct shape, plus the numeric grade for screen readers.
  - An empty cell is blank.
- **Excluded remedies** can be shown "in their position": greyed with strikethrough and a reason tooltip.
- **Linked highlighting.**
  - Clicking a remedy header highlights its column and dims the rows it does not cover (opacity 0.35).
  - Clicking a row header highlights the remedies present in it.
  - Hover shows crosshair guides.
- **Remedy finder** (/): an autocomplete over the ranked remedies only, which scrolls to and flashes the remedy's column (RO).

### 5.3 Bars view [OURS; RO has a "graphic analysis"]
- One horizontal bar per remedy, in rank order.
- The segments are the covered lines, stacked by grade (grade 4 innermost, then 3, 2, 1), and a segment's length is its contribution to the active score.
- The label shows `abbr  C/D  score`, and the tooltip lists the lines and grades.

### 5.4 Cards view [OURS]
- Remedy cards in a grid: rank, name, score, family chips, covered lines (✓ with grade) and missed lines (✗).
- A "why ranked here" explainer shows the strategy formula terms for that remedy.

### 5.5 Comparison view (RO: extract and compare up to 10; 3.3 graphs of up to 3)
- Pick 2–10 remedies. The table shows the rubrics where at least one of them is present, and each remedy's grade.
- Filters: present in all · present in any · unique to one.
- A chart mode is available for 2–3 remedies (a radar or bar chart per chapter, the "sphere of action").

### 5.6 Polarity view
- Rows are the candidate remedies. The columns are `C/D`, PS, OS and **PD**, and a CI badge marks contraindicated remedies.
- The virtual "Opposite polar symptoms" list is shown under the patient's polar lines.
- Toggles: include non-polar lines; allow N−1 coverage.

### 5.7 Family overview view
- Family pseudo-remedies run through the same grid, bars and cards views.
- A side panel shows the family density: the number of members in the current top N, per classification.

### 5.8 Segments view
- One mini-ranking per clipboard (top K), next to the SegScore ranking.

### 5.9 Strategy panel (the "chess" menu)
- A dropdown lists the strategies, grouped (Basic · Size-weighted · Methods · Special). It includes an intensity switch, a parameters drawer and "Reset to defaults".
- Changing any input re-ranks the result within one frame of the worker response. Rank changes animate for 200ms, and are not animated when the user prefers reduced motion.

### 5.10 Saved-analysis comparison (RO: many windows from past sessions)
- Up to 4 saved analyses open side by side in split panes with synchronised strategy.
- Each pane is labelled with its consultation date.

### 5.11 Strategy comparison (RO: the VES "opens in a separate tab for comparison with the standard analysis")
- "Compare with strategy…" in the strategy panel opens a second analysis pane over the same clipboards with a different strategy (VIS-022). Up to 3 panes.
- Each pane header shows the strategy name and its parameters. A "rank delta" column shows, for each remedy in pane 2+, its rank change versus pane 1 (▲3, ▼2, "new", "—").
- Clipboard edits recompute every pane. Closing a pane returns to the single analysis.

---

## 6. Navigation flows

1. **Browse to a rubric by typing.** Focus the repertory and type "mi". The chapter chooser opens filtered, and Enter opens MIND. Keep typing "fear" to filter main rubrics, Enter, then "alone", Enter. The rubric is focused and the breadcrumb updates. Backspace goes up a level. Finally `+2` Enter takes the rubric into the default clipboard at intensity 2, and a toast offers Undo.
2. **Find (F2 / F3).**
   - F2 opens a three-level column browser: chapters, then main rubrics, then sub-rubrics. It has a type-ahead filter per column.
   - F3 opens the same browser at the current location, with the hand indicator on it.
   - Take inside Find uses `+` syntax, F6 or drag, without leaving Find.
3. **Search, then take.**
   - F4 opens Simple search with a scope selector (current document · open documents · whole library · document mix · Search Area · Patient cases) and a language filter. The Patient cases scope (SRC-025) runs case remedy and case pathology searches and is shown only when the patient store is unlocked.
   - Results appear in a new search tab. Tick results and use the context menu to take them, or take them as a combined rubric.
   - Opening another search tab and choosing "Compare search tabs graphically" shows the remedies present across all the tabs.
4. **Analyse.**
   - F8 opens the split view and the grid shows the default strategy.
   - Choose a strategy, then double-click a remedy. The inspector shows its coverage (covered and missed rubrics), keynotes and families.
   - "Limit to family" filters the analysis, and Ctrl/Cmd+Z undoes the limit.
5. **Remedy information.**
   - Double-clicking a remedy anywhere opens the inspector with these tabs: Overview (names, kingdom, families), Keynotes (favourite MM books in order), Relationships, Rubrics (the remedy's rubrics filtered by grade and chapter), Sources and Notes.
   - Buttons: Limit to family / Highlight family / Search everywhere.
6. **Patient case.**
   - Open the Patients TOC and choose a patient. The case view shows the timeline on the left, the consultation editor in the centre and the anamnesis summary on the right.
   - "New consultation" opens an editor with an optional template. Selected text is graded with Ctrl/Cmd+E and 1–4, and optionally linked to a rubric, which adds it to the clipboard.
   - While a consultation is open, the banner "Analysis linked to J. D. – 2026-09-29" is shown and the clipboards save with it.
   - "Prescribe" opens the prescription dialog. On close, the clipboards clear by default (RO 3.3), with a prompt and an Undo.
7. **Follow-up.** "Duplicate as follow-up" copies the unresolved symptoms. "Add evaluation" records GHHOS, a subjective score and the reaction type. The follow-up chart plots the evaluations over time with prescription markers.
8. **Recall or compare analyses.** Ctrl/Cmd+O opens the recall dialog (folders, patient analyses, files) with an option to merge into the current clipboards. "Open side by side" gives up to 4 panes.
9. **Additions.** From a rubric's context menu choose Additions ▸ Add remedy, then enter the remedy, grade, source/author and optional MM link. The addition shows with a "personal" marker and can be toggled with the "My additions" layer switch.
10. **Presentation and congress.** Presentation mode hides the chrome and enlarges the fonts. Congress mode pseudonymises the patient names, hides prescriptions in summaries and converts dates to relative ones.

---

## 7. URL scheme (deep links; history source of truth)

| Route | Document |
|---|---|
| `/r/:repertory/:rubricId?display=1|2|3&view=:viewId` | Repertory, focused on a rubric |
| `/r/:repertory/find?at=:rubricId` | Find (F2/F3) |
| `/mm/:book/:remedy#:sectionId` | Materia medica section |
| `/remedy/:slug?tab=overview|keynotes|relations|rubrics|sources|notes` | Remedy info (as a full page on mobile) |
| `/family/:system/:familyId` | Family members |
| `/search?q=&scope=&lang=&mode=simple|advanced` | Search result tab |
| `/analysis?cb=1,2&s=sumSymDeg&int=1&view=grid` | Current workspace analysis |
| `/analysis/:savedId` | Saved analysis (read-only snapshot, "Load into clipboards" button) |
| `/patients`, `/patients/:id`, `/patients/:id/c/:consultationId` | Patient pages |
| `/settings/:section` | Settings |

The URL does not encode clipboard contents, which live in the workspace store. Shareable analysis links use an exported file, not a URL.

---

## 8. Accessibility requirements (apply to all views)
- Everything is operable with the keyboard alone, and focus is always visible (2px outline).
- The analysis is a `role="grid"` with row and column headers, and each cell's accessible name is "Acon, grade 3, in MIND – FEAR – alone".
- Grades are distinguished by case, weight and underline, not only by colour.
- Live regions announce takes ("Taken into clipboard 1 at intensity 2") and re-ranking ("Analysis updated, top remedy Sulph").
- Motion respects `prefers-reduced-motion`.
- Hit targets are at least 32px on desktop and 44px on touch.
