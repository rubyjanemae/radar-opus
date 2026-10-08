# RadarOpus UI/UX and interaction map: reverse-engineering report for a web successor

**Scope and caveats.** Most of radaropus.com (the flipbook manual pages, academy pages, "What's new" PDFs) refused automated fetches because of robots.txt or connection timeouts. The richest sources I could reach are the official manuals mirrored on radaropus.us (v3.1, 2016 edition), the Bjain-hosted v2.2 manual, the official Synthesis App manual and distributor pages. I could not open any screenshots directly, so every statement about visual layout, proportions, colours or density is marked **[INFERRED]**. Inferred items come from the manual's textual descriptions, the typography of the companion Synthesis App, and general knowledge of the Radar/RadarOpus product line. Anything that is **[DOCUMENTED]** has a cited source.

Primary sources used:
- S1: RadarOpus Manual and Tutorial Videos, v3.1 (updated 31 May 2021). https://www.radaropus.us/wp-content/uploads/2022/06/RadarOpus-Version-3.1.pdf
- S2: RadarOpus Manual, Archibel 2016. https://radaropus.us/wp-content/uploads/2016/07/Manual_Opus_English.pdf
- S3: RadarOpus Manual v2.2. https://bjain.com/static_mailer/Manual_RadarOpus_English_2.2_154.pdf
- S4: Synthesis App User Guide (Archibel, 2019). https://www.radaropus.com/custom/files/manuals-SynthesisApp/synthesis_app_manual-english-20191126.pdf
- S5: RadarOpus Packages 2020 (feature matrix). https://www.radaropus.us/wp-content/uploads/2020/02/RadarOpus-Packages-2020.pdf
- S6: Intro Tutorial Videos index. https://www.radaropus.us/wp-content/uploads/2022/06/Intro-Tutorial-Videos.pdf
- S7: Homeobook, "RADAR Opus in clinical practice, teaching and learning". https://www.homeobook.com/radar-opus-in-clinical-practice-teaching-and-learning/
- S8: RadarOpus UK software page. https://www.radar-uk.co.uk/software/
- S9: Bjain RadarOpus Advance package. https://www.bjainrx.com/radaropus-advance/
- S10: Polar Symptom Analysis add-on (radaropus.us). https://www.radaropus.us/product/boenninghausen-clemens-von-polar-symptom-analysis-add-on/
- S11: RadarOpus UK, Boenninghausen page. https://www.radar-uk.co.uk/boenninghausen/
- S12: RadarOpus 4.1 update changelog. https://www.radaropus.us/product/radaropus-4-1-update/
- S13: Complete Dynamics step-by-step demo (Homeobook). https://www.homeobook.com/complete-dynamics-and-complete-repertory-step-by-step-demo/
- S14: Techjockey listing (system requirements). https://www.techjockey.com/detail/radar-opus-homeopathic-software
- S15: RadarOpus manuals index. https://www.radaropus.us/radaropus-manuals/
- S16: Similia blog, OOREP vs Similia. https://www.similia.io/blog/oorep-vs-similia
- Found but not fetchable (worth opening by hand with a browser): the RadarOpus YouTube channel https://www.youtube.com/user/RadarOpus and the clipboard tutorial https://www.youtube.com/watch?v=cU3fIIdfqPU; flipbook manual pages such as https://www.radaropus.com/RadarOpus/docs/manual/3.1/en/files/basic-html/page81.html; "What's new" PDFs for 2.0, 3.3 and 4.1 under https://www.radaropus.com/custom/files/whatsnew/.

---

## 1. Mental model: "one program, one database, linked documents"

RadarOpus describes itself as one central program over one central database. Every repertory, materia medica, patient and remedy is a document that links to the others (S2). The UI is a **document browser**, not a form-based app. The key ideas:

- **Documents open in tabs, grouped by document type.** "All Repertories in one Tab, all References in another Tab. All items in the list of repertories will open in the same Tab, all on top of each other" (S1). A small triangle in the tab corner shows that the tab holds several stacked documents. Clicking it shows a list or a preview grid for switching between them (S1, S2).
- **Browser-like navigation.** There are Back, Forward and History buttons (S8: "tabbed layout similar to web browsers… back, forward & history buttons"; S14).
- **Three main windows** (Repertory, Reference, Patient), switched with **Alt+1 / Alt+2 / Alt+3** (S1, S6).
- **Symptom clipboards are always present** as a docked strip at the left. Together, the set of clipboards is called an **"Analysis"** (S1: "a set of clipboards is referred to as an 'Analysis'").

For the web successor, this maps to a single-page app with a tab strip per document type, a persistent left clipboard rail, and URL-addressable documents so the browser's own Back/Forward works as history.

---

## 2. Main window layout

### 2.1 Top toolbar (documented contents; icon order partly inferred)

This is a classic icon toolbar, not an Office-style ribbon. The ribbon wording in the brief does not match the product. **[DOCUMENTED S1, S2, S7]**

| Group | Item | Behaviour | Hotkey |
|---|---|---|---|
| TOC icons (the first five icons) | **Repertories** (subsections: Repertories, Concepts, Families) | Opens the table of contents of repertories | Ctrl/Cmd+1 |
| | **References** (materia medicas, journals, therapeutics, etc.) | TOC of the reference library | Ctrl/Cmd+2 |
| | **Patients** | List of all patients | Ctrl/Cmd+3 |
| | **Remedies** | List of remedy abbreviations | Ctrl/Cmd+4 |
| | **Families** | Available family groupings | Ctrl+5 (S1) |
| Find | **Find** (hierarchical) | Chapter → rubric → sub-rubric picker | F2 |
| Take | **Take** button with a sub-menu (intensity 1–4, options) | Copies the current rubric to the default clipboard | `+`/`=`/F6 |
| Search | **Search** button with **Simple** / **Advanced** | Opens the search windows | F4 (or `?`) / F5 |
| Quick Search Box | Text field in the toolbar | Searches the default location; the manual says it is "advised for experienced users" (S1) | – |
| Analysis | **Analysis** button | Shows clipboards plus analysis | F8 |
| Navigation | **Back / Forward / History** | Browser-style | – |
| Camera | Screenshot icon | Captures the window for sharing | – |

- There is also a **main menubar** (Windows menubar, macOS app menu). It includes a **Take** menu (take with intensities 1–4), a **Search** menu (for example "Find a rubric") and **Tools** (Options on Windows; RadarOpus → Preferences on Mac) (S1).
- **[INFERRED]** The toolbar is one row about 40–48 px high, with medium-size (roughly 24–32 px) coloured glyph icons and text labels under or beside the TOC icons. It follows a Windows-desktop visual idiom with a light grey/white chrome.

### 2.2 Per-window local toolbar

Each document window has a small toolbar at its top **[DOCUMENTED S1, S2]**:
- **Local Find** button, which is document-scoped F2.
- **Local Take** button ("A Local Take button is available at the top of each repertory window"), with a sub-menu for intensity and options.
- **Repertory View selector**: Full Synthesis, Millennium, Quantum, Modern till 1987, Pioneers till 1843, Kent Repertory (revised), Boger–Boenninghausen, and so on. The Homeobook review counts about 10 views (S2, S7).
- **Tags** button with a sub-menu: Bookmarks, Notes, Cross-References, Concepts, Miasm labels, Synonym rubric links. Toggling the main button hides "Referring rubrics", which are empty synonym pointers (S1, S2).
- **Local Options** icon at the upper right of every window. It opens a settings menu that applies to that window only (S1: "Many windows have a local options button").

### 2.3 Left rail: symptom clipboards

- The clipboards appear as **numbered icons in a vertical strip at the left** (S1, S2).
- **How many clipboards depends on the licence package:** 1 / 3 / 6 / **12** (S5). The Advance package lists "Symptom Clipboards – (6)" (S9). The manual's take syntax addresses clipboards 1–12. **Correction to the brief:** the maximum is 12, not 10.
- The **lower-left corner** has "Hide toolbars & clipboards", which the manual suggests for teaching or presentation mode (S1 p. 26).
- **[INFERRED]** The rail is narrow, about 40–60 px wide. The icons are stacked squares numbered 1..N, and the default or selected clipboard is highlighted. A custom clipboard name, if set, shows as a label or tooltip.

### 2.4 Central document area

- The **symptom path breadcrumb** runs across the top of the document (for example MIND › FEAR › alone, of being). It "shows you the current symptom which the hand indicator is pointing to". Clicking it opens **F3 Find from current location**, which can be switched off in Local Options ("Open F3 when clicking on the path") (S1, S2).
- The body is the rubric list, in **one- or two-column** layout (Local Options) (S1, S2).
- A **hand indicator** (a pointing-hand cursor or marker) marks the current rubric (S1).
- **[INFERRED]** The layout proportions are: left rail about 5%, main document about 95%, or a vertical split when the analysis is open (see §7). In the two-column layout the rubric text runs like a printed book in two newspaper columns, with the remedies following each rubric in wrapped lines. The density is high, similar to the printed Synthesis at a readable 11–13 px.

### 2.5 Status bar

- **[INFERRED / not documented]** No source I found describes a status bar. Counts (remedies per rubric, excluded remedies) appear inline in the rubric view, not in a footer. **Recommendation:** add a slim footer showing the active clipboard, symptom count, active repertory view and analysis method.

### 2.6 Minimum resolution and platforms

The minimum screen size is 1152×720 on Windows 7–10 and macOS 10.12+ (S14). Version 4.1.4 fixed "font blurriness on Windows at high zoom levels", so there is a zoom feature (S12).

---

## 3. Rubric display (repertory view)

### 3.1 Hierarchy

Chapter → main rubric → sub-rubric → sub-sub-rubric. This is Synthesis/Kent style: comma-separated modalities, indented children. **[DOCUMENTED S1, S2]**

In the Synthesis App, **main rubrics are shown in a blue font and sub-rubrics in black**. A rubric that has no remedies but has sub-rubrics is "written in one line with a vertical separation line" (S4). **[INFERRED]** The desktop product uses a similar colour hierarchy.

### 3.2 The spacebar display cycle (a signature interaction)

"The Spacebar has a special function in a repertory window. Press on it three times and it will switch between three different displays" (S1):
1. **Only the number of remedies**, for example `MIND - FEAR - alone, of being (54)`.
2. **Remedy abbreviations** shown inline after the rubric.
3. **Remedy abbreviations plus authors** (source references) after each remedy.

Complete Dynamics uses the spacebar the same way (Full/Compact view) and Shift+Space to change remedy order (S13). The web successor should keep Space for this.

### 3.3 Remedy grade typography

The companion Synthesis App manual documents the Synthesis convention (S4):

| Degree | Style | Example |
|---|---|---|
| 1 | lower case, plain (black) | `acon` |
| 2 | first letter capital, **blue, italic** | *Acon* |
| 3 | first letter capital, **red, bold** | **Acon** |
| 4 | ALL CAPITALS, **bold, red** | **ACON** |

**[INFERRED]** The desktop RadarOpus uses the same four-level scheme (same data and publisher). RadarOpus UK marketing text mentions extracting "italic, bold or underlined rubrics" (S8). For comparison, Complete Dynamics uses black (1), green (2), red (3), blue (4) (S13).

### 3.4 Author and source markers

These appear after the remedy abbreviation in display mode 3 (S4):
- Classical sources: no icon.
- Modern provings: `°`.
- Hypothetical sources: `*`.
- Veterinary: `˜`.
- A remedy copied up from a sub-rubric: a **downward arrow**.

"Show tooltips on remedies and authors (advised on)" is an option (S1 p. 21). Hovering a remedy shows its full name, and hovering an author shows the full reference.

### 3.5 Inline icons and tags

Source: S7, S2.
- **Camera icon:** an image is available. **Speaker:** audio explanation. **Lightbulb:** concept or related conditions.
- **Red dot:** Künzli dots (curative or therapeutic importance, on a remedy or a rubric) (S4, S7).
- **Flag:** rubric explanation, in three varieties.
- **Blue V / green V / red V:** veterinary relevance levels.
- **Yin-yang icon:** polar rubric in the Boenninghausen Therapeutic Pocketbook (S11).
- **Bookmarks, notes, miasm labels, synonym links, concept links:** all toggled from the Tags button (S1).

### 3.6 Cross-references

These are shown by default as **"arrow icons only (collapsed)"**. Hovering shows a tooltip with the target rubrics, which are linkable. Local Options can expand them inline; the manual recommends the expanded setting (S1, S2). In the app, you tap a cross-reference to jump to it (S4).

### 3.7 Repertory views and excluded remedies

A view filters remedies by source reliability. View buttons show or hide excluded remedies and empty rubrics. **The number of excluded remedies appears as a number, and hovering it lists the filtered remedies** (S2).

---

## 4. Navigation

| Action | Mechanism | Source |
|---|---|---|
| Jump to chapter by typing | "Just start to type any character of a chapter… the CHAPTER icons window will open". For example `MI` then Enter opens MIND | S1 |
| Hierarchical Find | **F2**: chapter → main rubric → sub-rubric by typing or selecting. The "Stay in the same chapter" option keeps searches in the current chapter | S1, S2 |
| Find from current location | **F3**, or a click on the symptom path | S1 |
| Go up levels | **Backspace** or **Arrow Left**, pressed one or more times, or click a breadcrumb level | S1 |
| History | Back / Forward / History toolbar buttons | S8, S14 |
| Switch main windows | Alt+1 / Alt+2 / Alt+3 | S1, S6 |
| Open TOCs | Ctrl/Cmd+1..5 | S1 |
| Simple search | **F4** or `?`, with operators `&` (AND), `\|` (OR), `!` (NOT). Scope dropdown: Current document, All open documents, Whole library, Search Area, Document mix. A language flag selects the search language, with translation | S2 |
| Advanced search | **F5**, one word per box, proximity, remedy search options (degree, rubric size, maximum co-remedies at the same degree), and **Remedy Comparison** (up to 10 remedies, S5) | S1, S2 |
| Search Area | Drag chapters or main rubrics onto the "Search Area" button to scope a search | S1 |
| Multiple result tabs | Keep an earlier result, open another search tab, then "Search result graphically" compares the tabs, for example "Injure head" vs "convulsions" | S1 p. 50, S2 |
| Copy | Ctrl/Cmd+C copies the rubric with its remedies; Shift+Ctrl/Cmd+C copies the text only | S1 |

**Web recommendation:**
- A command palette with type-ahead, where typing letters in the repertory pane opens a chapter chooser (the same mental model).
- Backspace/← for parent, a clickable breadcrumb, and history through the History API.

---

## 5. Taking rubrics into clipboards

### 5.1 Ways to take a rubric (S1, S2)

1. **Drag and drop** a rubric onto a clipboard icon. Intensity defaults to 1. If several search results are ticked, dragging one of them takes all of them.
2. **Keyboard mini-language** typed while a rubric is current:
   - `+` Enter or `=`: intensity 1 into the default clipboard (1).
   - `+2` Enter: intensity 2.
   - `+1>2`: intensity 1 into clipboard 2. `+2>3`: intensity 2 into clipboard 3.
   - `+!`: take as **eliminative**.
   - `+a`: take into **group "a"**.
   - `+1/s`: take **with sub-rubrics**. `+1/x`: take **with cross-references**.
3. **F6 "Take with options" dialog.** Fields: intensity (1–4), Eliminative, Excluding (the manual calls it "Exclusive"), Causative (for VES), Group letter, Take also sub-rubrics, Take also cross-references, clipboard number.
4. The **Local Take button** or the main **Take menu** (intensities 1–4).
- **Alt+Click** on a clipboard icon makes it the default clipboard.

### 5.2 Clipboard contents and row display

- Each symptom row shows the **intensity (1–4, or 0 to exclude it from the analysis)**, the rubric text or path, the **remedy count**, and an optional **group letter** (S1, summarised).
- **[INFERRED]** An eliminative symptom carries a marker such as "E" or "!", and an excluding symptom a marker such as "X" or "–". Intensity may also be shown by underlining (the VES text speaks of "underlining" for intensity, S2).

### 5.3 Clipboard operations

| Operation | How | Source |
|---|---|---|
| Change intensity | Select, then press **1/2/3/4**, or right-click → Change intensity | S1, S2 |
| Multi-select | Ctrl/Cmd+Click, or Ctrl/Cmd+A | S1, S2 |
| Reorder | Ctrl/Cmd+↑/↓, or right-click → Move Up/Down | S1 |
| Sort | Right-click → Sort: "Ascending homeopathic order" (Mind → Generals) or "Descending intensity" (4 → 1). Packages 2+ can also sort by alphabetical order, rubric size or intensity | S1, S5, S9 |
| Eliminative / Exclusive | Right-click → Change Qualification. Eliminative: "only remedies which are in that symptom will remain". Exclusive: "all remedies which are in that symptom are removed" | S1, S2 |
| **Group** | Give several symptoms the same letter. "The original symptoms remain in the clipboard but they are calculated as one symptom" | S1 |
| **Combine** | Right-click → Combine creates **one new rubric** that contains the union of the remedies | S1 |
| Move between clipboards | Select, then drag onto another clipboard icon | S1 |
| Rename clipboard | Right-click the icon → **Change clipboard name**, for this analysis only or as the default name | S1 p. 56 |
| Clipboard icon menu | Save analysis, Recall analysis (checkbox "Merge with the current case"), Clear this clipboard, Clear all clipboards | S1, S3 |
| Persist | Saved automatically to the patient file, Ctrl/Cmd+S to a folder, or XML export to share with colleagues | S1 |
| Symptom notes | **Not documented in the clipboard.** The Tools menu mentions "Notes & Annotations" on symptoms and cases (S1 summary). Treat this as weak evidence | S1 |

**Web recommendation:**
- Support weights 1–4 plus 0 (ignored), eliminative and excluding flags, group letters (a–z), and combine-into-new-rubric.
- Add **per-symptom free-text notes**; this is a gap to exceed.
- Allow up to 12 or unlimited clipboards, renameable.
- Drag from the rubric list to the rail using the HTML5 DnD or dnd-kit library, with the `+`-language command parser.

---

## 6. Analysis window (F8)

### 6.1 Display modes

The display icon at the top left switches between "Show only the symptoms (F7)", "Show symptoms and the analysis (F8)" and "Show only the analysis" (S1).
- **[INFERRED]** In the combined mode the window is split: the symptom list sits above (or at the left) and the remedy grid below (or at the right).

### 6.2 Clipboard selection

Clicking one clipboard analyses only that clipboard. Ctrl/Cmd+Click adds other clipboards to a combined analysis (S1, S2).

### 6.3 Methods: the chess icon

"With the Chess icon you can select the analysis method" (S1 p. 61). The same menu has a toggle for whether symptom intensity is used. Package 1 has only "sum of symptoms"; packages 2–4 have **9 methods** (S5). Named methods:
- **Sum of Symptoms (Sort degrees)**, the default: most symptoms covered, then sum of degrees, then alphabetical order (S1, S3).
- Sum of Symptoms (ignoring degrees), Sum of Degrees (sorted by symptoms), **Small Rubrics** (Organon §153), **Small Rubrics + Small Remedies**, **Prominence** (S7).
- Separate modules: **Vithoulkas Expert System**, which opens in its own tab, needs at least 4 symptoms with intensities, ignores eliminative rubrics and uses the Causative flag (S2). **Herscu Cycles & Segments** (S2). **Boenninghausen Polar Symptom Analysis** (S10, S11).

### 6.4 Result presentation

- **[DOCUMENTED]** Remedies are ranked by score. Each remedy has a symptom count and a degree sum; the Synthesis App's analysis table labels these **Sy** and **Deg** and has a "Symptoms" column showing "for each remedy which symptoms it covers" (S4).
- **[INFERRED, from general knowledge of Radar, not seen in a source this session]** The desktop analysis is a **grid**:
  - Columns are remedies in rank order. The remedy abbreviation heads each column, with the score under it, for example `8/19` (symptoms/degrees).
  - Rows are the symptoms. Each cell shows that remedy's degree in that rubric as a coloured mark, or is left blank.
  - It is dense: about 20–40 remedy columns are visible, and the rest are reached by horizontal scrolling.
- The "graphic analysis module" and "bar-graph analysis… several search tabs at once" (S8) suggest bar charts as well as tables. RadarOpus 4.1.7 fixed a "graphical glitch in analysis window" (S12). The exact form of the graphic (bar height against score) is **[INFERRED]**.
- **Excluded remedies** (removed by eliminative or excluding rubrics, or by a family limit) disappear, or appear **greyed "in their position"** when that Local Option is on (S2, S3).

### 6.5 Analysis controls

- **Remedy box:** an autocomplete list of the remedies in the current analysis only, which jumps to that remedy's position (S1 p. 58, S2).
- **Family button / Limit To / Highlight** restrict the analysis to one family or highlight it. **Ctrl/Cmd+Z** removes the limitation. The manual prefers applying family limits from the Families TOC by right-click, using "Limit or highlight your analysis to this family" (S1 pp. 18, 61).
- **Repertory View selector** applies a source filter to the analysis (S2).
- **Tags** button (S2).
- **Polar analysis** is opened with a black-and-white circle icon. It adds a virtual clipboard of opposite polar symptoms and columns for patient-symptom degree sum, opposite-symptom degree sum and **polarity difference**. Contraindicated remedies are shown in **bold**, and an option sorts by polarity difference (S10, S11).

### 6.6 Drill-down

- **Double-click a remedy** in the analysis to open the Remedy Information Window (S1 p. 57).
- The v2.2 summary says that double-clicking shows the symptoms where that remedy appears in the analysis (S3). The documentation is **ambiguous** here; the App's "Symptoms" column is the explicit per-remedy coverage view (S4).
- **[INFERRED]** Clicking a grid cell or a symptom row in the desktop product highlights the remedy's presence.

**Web recommendation:** offer three linked views over one data model:
- (a) a **grid heatmap**: rows are symptoms, columns are remedies, and cells show the degree glyph and colour;
- (b) **horizontal score bars** with a stacked segment per symptom;
- (c) a **remedy card view** listing the rubrics it covers and misses.

Also:
- Clicking a remedy highlights its column and dims the rubrics it does not cover. Clicking a rubric highlights the remedies in it.
- Offer family and kingdom **clusters** as colour bands or grouping. Complete Dynamics offers miasm filters (S13), and MacRepertory has concept and kingdom graphs.

---

## 7. Remedy Information Window (RIW)

It opens with a double-click on a remedy abbreviation, in the analysis, the TOC or a rubric (S1, S2). Contents:
- Keynote materia medica.
- A **Families** section showing where the remedy sits in the classification systems (for example APG2 for plants), with the other family members.
- **Limit To / Highlight** buttons at the lower right, which act on the analysis.
- A remedy search across the whole library (S2).
- Data sources include RADAR keynotes, Kingdom/Miasm/Sankaran/Bowel nosode families, Vermeulen Passport, multimedia, and web links to Wikipedia, Google, provings.com, GRIN, NCBI and HathiTrust (S7).

Remedy search options available from the right-click menu: degree, minimum/maximum rubric size, maximum co-remedies at the same degree (S1).

---

## 8. Context menus (documented)

- **Symptom in clipboard:** Move Up/Down, Sort, Change intensity, Change Qualification (Eliminative/Exclusive), Combine/Group, Take with options (S2, S3).
- **Clipboard icon:** Save analysis, Recall analysis, Clear this clipboard, Clear all clipboards, Change clipboard name (S1, S3).
- **Remedy in search result:** remedy search options (S2).
- **Families TOC node:** open the Families repertory at that level; limit or highlight the analysis to this family (S2).
- **Remedy (general):** search in Repertories, References, Wikipedia, Google Images (S9).
- **[INFERRED]** Rubric in the repertory: Take (intensities), Take with options, Copy, Bookmark, Add note, Show cross-references.

---

## 9. Full keyboard map (compiled from S1, S2)

| Key | Function |
|---|---|
| F2 / F3 / F4 (or ?) / F5 | Find / Find from current / Simple search / Advanced search |
| F6 / F7 / F8 | Take with options / Clipboards only / Clipboards plus analysis |
| typing letters | Opens the chapter chooser |
| Backspace, ← | Up one level |
| Space | Cycle the rubric display (count → remedies → remedies plus authors) |
| `+`, `=`, `+n`, `+n>c`, `+!`, `+a`, `+/s`, `+/x` | Take mini-language |
| 1–4 | Set intensity of the selected symptom(s) |
| Ctrl/Cmd+↑/↓ | Move symptom |
| Ctrl/Cmd+A / C / Shift+C / V / S / Z | Select all / copy with remedies / copy text only / paste / save analysis / remove family limit |
| Ctrl/Cmd+1..5 | TOCs |
| Alt+1..3 | Repertory / Reference / Patient windows |
| Alt+Click (clipboard) | Set the default clipboard |
| Ctrl/Cmd+Click (clipboard) | Combine clipboards in the analysis |

---

## 10. Colour scheme and typography

- **[DOCUMENTED, App]** Blue main rubrics, black sub-rubrics. Remedy grades: black plain, blue italic, red bold, red bold capitals (S4). An advanced-search "blue icon" shows branch words (S1 p. 41). Greyed text marks excluded remedies (S2).
- **[INFERRED]** The desktop uses a light theme: white document background, light-grey chrome, a serif or system-sans body at about 12–13 px, with a strong book metaphor that mirrors the printed Synthesis typography. I found no mention of a dark theme. Font zoom exists (S12, S4 "font size adjustment").

**Web palette recommendation:** define CSS tokens for grades (`--grade-1` neutral text, `--grade-2` blue italic, `--grade-3` red bold, `--grade-4` red bold small-caps or uppercase) with dark-mode variants. Grade must never be carried by colour alone, because the italic, bold and caps distinction must survive for colour-blind users. Do not copy Synthesis's exact typographic identity or branding; the 1–4 degree convention itself is a century-old public repertory convention (Kent/Boenninghausen).

---

## 11. Gaps to exceed in the web successor

1. **Symptom notes** per clipboard entry (not documented in RadarOpus).
2. **Explicit drill-down:** remedy → covered and missing rubrics side panel; rubric → highlighted remedies. RadarOpus relies on double-click to open the RIW.
3. **Unlimited, renameable clipboards** with colours, instead of a 1/3/6/12 licence tier.
4. **Live, undoable analysis:** changing a weight re-ranks the results instantly, with an animated reorder. Show intensity, eliminative, excluding and group letter as chips on each row.
5. **A status bar** and a **command palette** that exposes the `+`-take mini-language with inline help.
6. **Responsive layout:** the rail collapses to a bottom sheet on phones. The Synthesis App already uses swipe to page (S4).
7. **Grid, bar and card views** of the same analysis, with PNG/CSV/print export instead of a screenshot camera.
8. **Accessibility:** keyboard-first navigation (already the RadarOpus ethos), ARIA grid for the analysis, and grade shown by more than colour.

---

## Unverified / needs manual confirmation

- The exact appearance of the desktop analysis grid and graphic, and the toolbar icon order: watch the RadarOpus YouTube channel videos (https://www.youtube.com/user/RadarOpus) and "RadarOpus for Beginners – How to Use the Clipboard Function" (https://www.youtube.com/watch?v=cU3fIIdfqPU).
- Whether desktop grade colours match the App (blue italic / red bold): check a screenshot.
- The full list of the 9 analysis methods: see S1 p. 61 or the academy "Different analysing methods" video (https://www.radaropus.com/academy/DIFFERENT-ANALYSING-METHODS-VIDEO-6-%E0%A4%B9%E0%A4%A6).
- UI changes in 3.3, 4.0 and 4.1: the "What's new" PDFs on radaropus.com could not be fetched: https://www.radaropus.com/custom/files/whatsnew/radaropus_4_1_whats_new.pdf and https://radaropus.com/custom/files/whatsnew/radaropus_3_3_whats_new.pdf