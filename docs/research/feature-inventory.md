# RadarOpus feature inventory (versions 2.x to 3.3, plus the RADAR 10 lineage)

This inventory is built from these sources:
- The official RadarOpus manuals for v2.2, v3.1 and the 2016 edition (PDF).
- The official release posts for 3.0 and 3.3.
- Distributor feature matrices from the US, UK, South Africa and India.
- The Synthesis App manual, the OpusGo App Store listing and third-party reviews.

Items marked **[inferred]** are my reconstruction and are not stated in a source.

**Sources I could not read:**
- **radaropus.com manual and academy pages:** the HTML manuals (3.2 and 2.2), the Academy and the 3.3 "What's New" PDF were refused by robots.txt or returned 403.
- **Scribd:** its copies of "What's New 3.3" and "2.0 Functions & Features" need JavaScript.
- **YouTube:** the Vithoulkas Expert System video was refused by the proxy (HTTP 429, rate limited), so I have no video transcripts.
- **Other refusals:** homeoint.org (Will Taylor's software comparison) got stuck in a redirect loop, and willtaylormd.substack.com returned 429.

The 3.2 and 3.3 details therefore come from the 3.1 manual and the 3.3 blog post, not from the 3.3 manual itself.

---

## 0. Product architecture and editions

### 0.1 Engines and packages
- **Engines.** The v3.1 manual names four engine levels: MINI, SILVER, GOLD and DIAMOND. Country-specific packages bundle content on top of an engine. Source: [3.1 manual](https://www.radaropus.us/wp-content/uploads/2022/06/RadarOpus-Version-3.1.pdf).
- **Where features are gated.** Several features are tied to an engine:
  - Diamond: repertory additions and custom synonyms.
  - Gold: extended patient file (lab reports, vaccinations, contacting the patient).
  - Silver: basic patient file, prescription printing, veterinary files.

  Sources: [3.1 manual](https://www.radaropus.us/wp-content/uploads/2022/06/RadarOpus-Version-3.1.pdf), [BjainRx Expert](https://www.bjainrx.com/radaropus-expert/), [BjainRx Plus](https://www.bjainrx.com/radaropus-plus/).
- **US package matrix.** Student, Beginning, Everyday, Advanced and All-Inclusive. Source: [radaropus.us/packages](https://www.radaropus.us/packages/).

| Capability | Student | Beginning | Everyday | Advanced | All-Inclusive |
|---|---|---|---|---|---|
| Repertories | 1 | 19 | 19 | 20 | 40 |
| Synthesis edition | Core | Treasure | Treasure | Treasure | Adonis |
| Materia medica volumes | 21 | 91 | 713 | 982 | 1,137 |
| Symptom clipboards | 1 | 3 | 6 | 12 | 12 |
| Patient-feature level | 1 | 2 | 3 | 4 | 4 |
| Concepts | 0 | 5 | 5 | 8 | 11 |
| Maps | – | – | – | – | 13 |
| Create/edit repertory views | – | – | yes | yes | yes |
| Add/edit families | – | – | – | yes | yes |
| Clificol | – | yes | yes | yes | yes |
| Analyse by 5,000+ families | – | yes | yes | yes | yes |

- **2020 package PDF feature gating.** Source: [RadarOpus-Packages-2020.pdf](https://www.radaropus.us/wp-content/uploads/2020/02/RadarOpus-Packages-2020.pdf).
  - **All packages:**
    - Context-sensitive help with video, content updater and "103+" keyboard shortcuts.
    - Keyless licence, backup/restore and an embedded browser.
    - Word, remedy and family search across all repertories and references.
    - Remedy extraction: compare up to 10 remedies.
  - **Package 2 and up:**
    - LiveUpdate, content icons, export tools, zoom, bookmarks and image viewing.
    - Access to 5,500+ families.
    - Sorting symptoms by homeopathic order, alphabet, rubric size or intensity.
    - Symptom intensity on a 0–10 scale, and qualifications.
    - Right-click remedy search in repertories, references, Wikipedia and Google Images.
    - Limited search areas, and search in consultations, pathologies and prescriptions.
    - Prescription printing and customisable pick lists.
  - **Package 3 and up:**
    - Multiple repertory views, add remedies to existing symptoms, and import/export of Synthesis additions (logfiles).
    - Multiple search windows, export to Excel, graphs of search results, and search across all patient data.
    - Materia medica symptoms included in the analysis.
    - Extra administrative fields, contacting the patient (phone, Skype, email), lab and vaccination records, and unlimited multimedia.
  - **Package 4:**
    - Photo, video or PDF attached to a symptom, invoices, and a treatment-progress chart.
    - Filtering by tagged symptom, and text search in the current or all consultations of a patient.
    - Frequency analysis, advanced additions editing with source documentation, and Polar Symptom Analysis.
  - **Clificol by package:**
    - Upload: all packages.
    - Search by remedy or pathology: package 2 and up.
    - Search by any criteria and PDF download: package 3 and up.
    - Hidden-remedy download and project management: package 4.

### 0.2 Platforms and related apps
- **Desktop:** native 64-bit Windows and Mac. Source: [radar-uk software](https://www.radar-uk.co.uk/software/).
- **Network version (3.0):** several users share one database over an intranet, with access levels per staff role. Source: [3.0 blog](https://www.radaropus.com/blog/27/RadarOpus-3.0-has-arrived).
- **Synthesis App (mobile).** Source: [Synthesis App manual](https://www.radaropus.com/custom/files/manuals-SynthesisApp/synthesis_app_manual-english-20191126.pdf).
  - Browse, Find and Search.
  - Clipboard of up to 25 symptoms, and a clipboard list of up to 30 clipboards.
  - Analysis: sum of symptoms, then sum of degrees.
  - Bookmarks, and Day/Night view.
  - Source markers: none for classical sources, ° for modern provings, * for hypothetical sources, ~ for veterinary.
  - Export as PDF by email, or as "RadarOpus XML" to continue the case on the desktop.
- **OpusGo (Zeus Soft, launched Feb 2024).** Source: [App Store](https://apps.apple.com/us/app/opusgo/id6741098026).
  - Multiple clipboards, patient files, sync with RadarOpus, and search by word, root or remedy.
  - Day/night mode, offline use, and copy/paste.
  - v1.2 added Russian and Japanese, zoom, and search of authors and remedies by abbreviation.
- **Predecessor RADAR 10 / 10.5.** Source: [Hpathy](https://hpathy.com/software/the-homoeopathy-software-radar-10/).
  - Concepts Finder, Families functions, Keynotes, and a right-click remedy menu.
  - Radar Free Notes, and multimedia (remedy pictures and sound clips).
  - Modules by De Schepper, Stoeteler and Giampietro.

---

## 1. Global UI shell

### 1.1 Table of Contents (TOC) panels
There are five TOC icons, each with a shortcut. Source: [3.1 manual](https://www.radaropus.us/wp-content/uploads/2022/06/RadarOpus-Version-3.1.pdf), [2.2 manual](https://bjain.com/static_mailer/Manual_RadarOpus_English_2.2_154.pdf).

| TOC | Windows | Mac | Contents |
|---|---|---|---|
| Repertories | Ctrl+1 | Cmd+1 | All repertories; you can drop a remedy onto its header or onto one title |
| References | Ctrl+2 | Cmd+2 | Materia medica, cases, philosophy, therapeutics, journals, provings, dictionaries |
| Patients | Ctrl+3 | Cmd+3 | Patient database |
| Remedies | Ctrl+4 | Cmd+4 | Remedy list; double-click opens Remedy Info |
| Families | Ctrl+5 | Cmd+5 | Family levels; right-click to Limit or Highlight |

- **TOC checkboxes (document selection boxes).** You tick documents to form a temporary "document mix", which can be used as a search location.
- **Hiding the TOC.** Double-clicking a tab hides the Table of Contents.

### 1.2 Document windows and tabs
- **Main window types.** There are three: Repertory, Reference and Patient. Switch between them with **Alt+1**, **Alt+2** and **Alt+3**.
- **Tabs.** The layout is tabbed like a browser, with "back, forward & history buttons" ([radar-uk](https://www.radar-uk.co.uk/software/)). The 2016 manual describes "Back and Forward button, with a full 'History' option" ([2016 manual](https://radaropus.us/wp-content/uploads/2016/07/Manual_Opus_English.pdf)).
- **Multiple search tabs.** Earlier results stay open so you can compare them.
- **Toolbar toggles (3.3).** Six toolbar icons now work as toggles ([3.3 blog](https://www.radaropus.com/blog/50/RadarOpus-3.3-Create-and-Analyse-Bundle)).
- **Presentation mode.** The lower-left corner has options to hide toolbars and clipboards, for use with a projector.
- **Congress mode.** Hides patient names so cases can be presented safely ([patient management](https://www.radaropus.com/products/radaropus/patient-management)).
- **Camera button.** Copies the full screen or the current window.
- **Font changes (3.3).** Font changes apply dynamically without a restart. 3.3 also brought a visual redesign with new icons, layout options and a new colour scheme.
- **Built-in web browser.** Has its own history, and links to Wikipedia, Google Images, PassPort, GRIN taxonomy and NCBI ([Techjockey](https://www.techjockey.com/detail/radar-opus-homeopathic-software)).

### 1.3 Local Options buttons
Many windows have a "local options" button with window-specific preferences.
- **Repertory window:**
  - One- or two-column layout.
  - Expand or collapse cross-references, and separately expand or collapse concepts.
  - Show symptom tags, and tooltips on remedies and authors.
  - Expand rubric synonyms, shown in light grey (3.1).
- **Find window:** "stay in the same chapter when you start to type".
- **Search window:** default search location, and whether Simple or Advanced search opens by default.
- **Analysis window:** remedy display format, intensity on/off, and "Show in their position", which shows excluded remedies greyed out in place.
- **Symptom path:** you can change the right-click behaviour so it only moves up a level instead of opening Find.

### 1.4 Global program options
- **Where to find them.** Tools → Options on Windows; RadarOpus → Preferences on Mac.
- **Contents:**
  - Menu language, and user account (login and password).
  - Database management and backups.
  - Import from RadarClassic 8, 9, 10 and 10.5.
  - Practitioner details used on invoices and prescriptions.
- **3.3 addition.** Password protection can be switched off ([3.3 blog](https://www.radaropus.com/blog/50/RadarOpus-3.3-Create-and-Analyse-Bundle)).
- **Help menu.** Help → Check for new content.

---

## 2. Repertory module

### 2.1 Display
- **Rubric display.** Each rubric shows a hierarchical symptom path at the top. Remedies are listed in degrees 1–4 (bold, italic and so on in print tradition).
- **Spacebar cycle.** Pressing Spacebar three times cycles the display:
  1. remedy count only
  2. plus remedy abbreviations
  3. plus author references (sources)
- **Author references.** Underlined author abbreviations can be double-clicked to open the source text of an addition (2.2 additions section).
- **Tooltips.** Hovering over remedies and authors shows tooltips (local option).
- **Symptom path.** Clicking it opens "Find from current location" (F3).
- **Languages.** World icon → "Show this document in" picks the language. "Additional languages" shows a second language alongside the first, and the two can be swapped. Synthesis is available in Dutch, English, French, German, Italian, Portuguese, Spanish and Turkish. Boenninghausen, Kent and Foster are also available translated.
- **Single-click translation (2016).** "Translate to your own language with a single click on a word or sentence". Techjockey mentions a translation tool covering 57 languages.

### 2.2 Repertory views (source filters)
Views filter the remedies shown according to their source set. Source: [3.1 manual](https://www.radaropus.us/wp-content/uploads/2022/06/RadarOpus-Version-3.1.pdf).
- **Full Synthesis.**
- **Full Synthesis, no remedies copied:** leaves out remedies copied from sub-rubrics.
- **Millennium:** contemporary sources.
- **Quantum:** traditional sources plus a selection of contemporary ones. This matches the paper "Essential Synthesis".
- **Reliable sources (T. Galic).**
- **Kent Repertory (revised).**
- **Modern till 1987 (Schmidt).**
- **Pioneers till 1843 (Hahnemann).**
- **Adonis-only views:**
  - Only remedies, and only families.
  - Only minerals, only plants (includes bacteria) and only animals (includes nosodes).
  - Only clinical information, and only all provings.
- **View buttons.** One button shows or hides the count of remedies left out by the view; hovering over the count lists them. A second button shows or hides rubrics that are empty in the current view.
- **Custom views.** You can create and edit your own repertory views (Everyday package and up).

### 2.3 Family-remedies (Adonis)
- **What they are.** Family abbreviations appear as pseudo-remedies inside rubrics, marked with an asterisk (for example `solanac*`).
- **Options.** Highlight them, sort them alphabetically, and place them at the start or end of the remedy list.

### 2.4 Tags
"Any symptom in the repertory or in the materia medica can have one or more Tags connected to it."
- **Tag types:** bookmarks, miasm labels, cross-references, synonym links and concept links.
- **Controls.** The main Tags button shows or hides all tags. Its sub-button chooses which tag types to show.
- **Ortega miasmatic module.** Adds miasm tags throughout Synthesis ([radar-uk modules](https://www.radar-uk.co.uk/modules/)).

### 2.5 Cross-references and synonyms
- **Cross-reference display.** Either expanded, or collapsed to an icon with a hover tooltip. Clicking one jumps to that rubric.
- **Taking cross-references.** Ctrl/Cmd+click the ones you want, then take the rubric. The selected cross-references are added as a group. Typing `+/x` takes all of them.
- **Referring rubrics (synonyms).** Empty rubrics point to the synonym rubric that holds the remedies. From 3.1 they are shown in grey next to the main rubric, or as "..." with a hover list.
- **Custom links (3.0).** You can add your own cross-references and referring rubrics ([3.0 blog](https://www.radaropus.com/blog/27/RadarOpus-3.0-has-arrived)).

### 2.6 Concepts
- **What they are.** Concept repertories let "a Concept (an idea, pathology or theme)" point to related rubrics. They "translate the language of the patients into the language of the repertory".
- **Titles.** Examples: RadarOpus Concepts, Servais Index, Valadares Semiological Guide, Zulian Themes, Dragos Mind Concepts, Lara Latent Psora and Petrucci Children.
- **Clipboard links (3.3).** Concepts on the clipboard link directly to the linked symptoms in Adonis.

### 2.7 Other repertories
- **Titles.** Murphy 3.0, Kent, Boenninghausen Therapeutic Pocket Book, Foster, Phatak, Boger, Clarke Clinical, Sherr Mental Qualities / Q-Rep, Norland Thematic Repertory, the Dimitriadis Boenninghausen repertory, and many small clinical repertories (haemorrhoids, pneumonia, heart and others).
- **Size.** 80+ repertories in total ([radar-uk](https://www.radar-uk.co.uk/software/)).

### 2.8 Synthesis editions
- **Lineage.** Kent-based, then 9.1, then Treasure Edition (TE 2009), then Adonis. **Core Synthesis** is the student subset. Sources: [Similia guide](https://www.similia.io/blog/synthesis-repertory-guide), [radar-uk Adonis](https://www.radar-uk.co.uk/product/synthesis-adonis-update-from-treasure-edition/).
- **Adonis figures.** 3,233 remedies, 153,109 symptoms with remedies and 1,599 author references ([BjainRx Adonis](https://www.bjainrx.com/tutorials/synthesis-adonis/)).
- **What Adonis adds.** Many modern-language rubrics, reorganisation (for example food desires moved from Stomach to Generals), Kent's Treasure handwritten additions, and integration of Hering's Guiding Symptoms. It comes in human and veterinary versions.
- **Personal Chapter (3.0).** A user chapter in Adonis for your own symptoms, clinical rubrics and themed cross-references, which you can add to during a consultation.
- **Licensing.** Synthesis is not licensed to third parties, so a successor has to use open data (for example OOREP's Kent or Publicum) **[inferred as project constraint]**.

---

## 3. Find (hierarchical navigation)
- **F2** opens the chapter window: repertory chapter icons, or a book's chapters. Typing a chapter name directly ("MI" goes to MIND) jumps there. Enter goes down a level.
- **F3** opens Find at the current location, marked with a hand indicator.
- **Moving up.** Backspace or Left arrow moves up one level. Clicking a level in the path also works.
- **Other entry points.** The local Find button in the document toolbar, and the main toolbar's Search sub-button → "Find a rubric".
- **Taking without leaving Find.** Drag and drop, `+`↵, `=`, F6, or the local Take button.
- **Levels.** Repertories go chapter → main rubric → sub-rubric(s). Reference documents follow each book's own structure (for example Preface / Remedies).

---

## 4. Search

### 4.1 Quick search box
A search box in the toolbar that searches the default location with limited options. The manual recommends it "only for experienced users".

### 4.2 Simple Search (F4 or `?`)
- **Search locations:**
  - current document, open documents or all documents
  - the current document mix
  - a specific Search Area
- **Language flag.** Limits the search to documents in one language. Documents in two languages are searched in their first language only.
- **Operators:**
  - AND is `&` or a space, and is the default.
  - OR is `|`.
  - NOT is `!`, as in "dream cats ! dogs".
- **Wildcards.** `*word`, `word*` and `*word*`.
- **Root and Branches.** Without an asterisk, the search automatically includes every "branch" word of a root. Right-clicking a word lists its branch words. This is RadarOpus's word index **[inferred mapping]**: no separate "Word index" module is documented.
- **Fields.** One word per field; Enter adds the next field.
- **Remedy search.** Type a remedy and pick the "(Remedy)" autocomplete entry. Right-click it for filters: which degrees (for example 3–4 only), minimum and maximum rubric size, and the maximum number of co-remedies.
- **Family search.** Type the family name, or pick a family-remedy (`*`) entry.
- **Results.** A rubric list. Right-click to take the selected rubrics or all of them, or "Take selected/all rubrics and create a new combined rubric".

### 4.3 Advanced Search (F5)
- **Layout.** Guided fields with a proximity control (how far apart the words may be) and a blue icon that lists the branch words.
- **Search types:**
  - word, remedy and family
  - Concept
  - **Case remedy:** all cases in which a remedy was prescribed. Double-click to open the full case.
  - Pathology (chapters or paragraphs about a disease), and case pathology
- **Remedy comparison.** Several remedy boxes, with three comparison methods. One example: "Symptoms with at least one of these remedies", showing each remedy's presence and degree.
- **Combined searches.** Word plus remedies, for example a symptom containing X where Lach or Lyc is present.

### 4.4 Search Area
Drag repertory chapters or main rubrics onto the "Search Area" button to limit the search to them. Works in both F4 and F5.

### 4.5 Graphical search analysis
- **Search-result graphs.** "Totally unique graphic analysis of any search." Open several search tabs and see which remedies meet all the criteria ([radar-uk](https://www.radar-uk.co.uk/software/)).
- **Export.** Search results can be exported to Excel (Package 3 and up).

### 4.6 Global and library search
- **Whole library.** Search all materia medica, repertories and keynotes at once.
- **Personal material.** Also searches personal notes, personal keynotes and personal family notes ([2016 manual](https://radaropus.us/wp-content/uploads/2016/07/Manual_Opus_English.pdf)).
- **Proximity.** "Combinations of keywords within a sentence, paragraph."

---

## 5. Take (capturing symptoms)

| Keys | Effect |
|---|---|
| `+`↵ or `=` | Take at intensity 1 into the default clipboard |
| `+1`…`+4` | Take at intensity 1–4 |
| `+1>2`, `+1>3`, `+1>4`, `+2>1`…`+4>4` | Intensity **n** into clipboard **m** |
| `+!`, `+1!`, `+2!` | Take as an eliminative symptom, optionally with intensity |
| `+a`, `+1a`, `+b` | Put in group a or b (avoids giving one theme too much weight) |
| `+/s`, `+1/s` | Take with its sub-rubrics, as a group |
| `+/x`, `+1/x` | Take with its cross-references, as a group |
| F6 | "Take with options" dialog |
| Ctrl/Cmd+click cross-references, then take | Adds the selected cross-references as a group |

- **Other ways to take.** Drag onto a clipboard, the local Take button and its submenu, the menu bar Take entry (intensity 1–4 or F6), or right-clicking search results.
- **Reference text as symptoms.** Any materia medica text can be taken, even text with no remedy, as a "link symptom". Double-clicking it jumps back to the source. Package 3 and up can include materia medica symptoms in the analysis.
- **Anamnestic import (3.0).** Brings patient-file anamnesis symptoms onto the clipboard without retyping them.

---

## 6. Symptom clipboards and analysis

### 6.1 Clipboards
- **Number.** Up to 12 clipboards, depending on the package.
- **Default clipboard.** Alt+click a clipboard, or right-click → Set as default.
- **Views:**
  - **F7:** symptoms only.
  - **F8:** symptoms plus analysis.
  - The Display icon also offers analysis only.
- **Which clipboards are analysed.** Ctrl/Cmd+click several clipboard icons to analyse them together. The Analysis icon uses all non-empty clipboards.
- **Right-click menu on a clipboard:**
  - Save / Save to folder, and Recall, with a "Merge with current case" option.
  - Import an analysis, and Import additions.
  - Clear this clipboard, and Clear all clipboards.
  - Change name, with an option to save it as the default name.
  - Set as default.
- **Symptom operations:**
  - Move a symptom with Ctrl/Cmd+↑/↓, or right-click → Move.
  - Right-click → Sort: homeopathic order ascending, or intensity descending. The packages also list alphabetical order and rubric size.
  - Number keys **1–4** set intensity, and **0** keeps the symptom but takes it out of the score. The packages mention a 0–10 intensity range.
  - Multi-select, then press a number key to change several at once.
  - Drag a symptom to another clipboard.
- **Combining symptoms.** Right-click → Combine/group:
  - **Group:** the symptoms are counted as one unit and the originals are kept.
  - **Full combine:** creates one new rubric containing the union of remedies, keeping each remedy's highest degree.
- **Qualifications.** Right-click → Change qualification:
  - **Eliminative:** only remedies in this symptom stay in the analysis.
  - **Exclusive:** remedies in this symptom are removed from the analysis.
- **Clearing (3.3).** An option clears the clipboards automatically. **Ctrl+S / Ctrl+R** save and recall an analysis.
- **Templates and smart edit (3.3, Create & Analyse bundle).** Custom symptom templates are checklists of frequently used rubrics. Smart Symptom Edit speeds up entering symptoms in the patient file.

### 6.2 Analysis strategies
There are nine in the core. They are chosen from the chess icon menu, which also switches intensity on or off. Sources: [Homeobook](https://www.homeobook.com/radar-opus-in-clinical-practice-teaching-and-learning/), [2020 packages](https://www.radaropus.us/wp-content/uploads/2020/02/RadarOpus-Packages-2020.pdf).
- **Sum of symptoms.** Ignores degree; counts how many rubrics each remedy covers.
- **Sum of symptoms (sort degrees).** The default. Ranks by symptom count, then by the sum of degrees, then alphabetically.
- **Sum of degrees (sorted by sum of symptoms).**
- **Sum of symptoms and degrees.**
- **Small rubrics.** Gives more weight to rubrics with fewer than 10 remedies.
- **Small remedies.** Favours lesser-known remedies. Named in the Vithoulkas "Small Rx" option; listed separately here **[inferred]**.
- **Small rubrics + small remedies.**
- **Prominence.** High degree in a small rubric ("keynote prescribing").
- **Vithoulkas Expert System.** See section 11.
- **Farokh Master strategy (3.3).** A separate module that weights the analysis by an approval rating for each author.
- **3.3 analysis screen.** One consolidated screen with no switching between strategies. The Graphic Analysis Tool is easier to reach.

### 6.3 The analysis result
- **Layout.** A grid of remedies against symptoms, with totals. There are table and graphic displays **[inferred from "Graphic Analysis Tool"]**.
- **Remedy finder.** An autocomplete box that jumps to a remedy's rank position. It only lists remedies that are in the analysis.
- **Double-click a remedy.** Opens the Remedy Information Window.
- **Filtering.** Limit or Highlight by family, kingdom (plant, animal, mineral, nosode) or Vithoulkas remedy set. **Ctrl/Cmd+Z** clears the limitation.
- **Extract and compare.** Up to 10 remedies.
- **Remedy comparison graphs (3.3).** Up to three remedies side by side, comparing symptoms and sphere of action.

### 6.4 Save, recall and export
- **Three ways to save:**
  - to a folder, with a name and description
  - to a patient consultation (automatic when the patient record is saved)
  - as an encrypted XML file to share with colleagues, imported via Recall → Import
- **Copy.** Ctrl/Cmd+C with nothing selected copies the analysis as RTF. With a symptom selected it copies the symptom plus its remedies. Shift+Ctrl/Cmd+C copies the text only. Ctrl/Cmd+A selects all.
- **Print.** An analysis can be printed ([SA package](https://radaropus.co.za/product/package3/)). Print layout options are not documented in the sources I could read.

---

## 7. Materia medica and references (the bookshelf)
- **Library.** 1,200 to 1,600+ volumes: materia medica, comparative works, clinical cases, provings, therapeutics, journals, philosophy, history and biography, and dictionaries.
- **Browsing.** Open from the References TOC. Navigate the tree with F2 and F3; the symptom path works as in the repertory.
- **Spacebar.** Shows remedy abbreviations in materia medica text.
- **Drag a remedy.** Onto a materia medica title to search that book, or onto the "Materia Medica" header to search all books.
- **Images.** Embedded images can be viewed.
- **Search hits.** Double-clicking a hit jumps to it in the text.
- **Favourites (3.3).** Favourite repertories and materia medica, pinned at the top of the TOC via right-click.
- **Authors and Documents list (3.3).** A new list of authors and documents.
- **Personal Materia Medica (3.3 bundle).** Your own books with chapters, images and bold/italic/underline formatting. The content is searchable.
- **Freenotes.** Downloadable seminar notes and similar material. Opened via File → Open freenotes; stored in `\RadarOpus\Data\Freenotes`.

### 7.1 Keynotes
- **Collections.** Allen's Keynotes, "Radar V4" keynotes, Lippe and others.
- **Favourite keynotes.** From 3.0 you can choose and order favourite keynotes from any reference. From 3.1 a double-click on a remedy opens your favourite keynote books.
- **Personal Keynotes.** For recording lecture notes ([Techjockey](https://www.techjockey.com/detail/radar-opus-homeopathic-software)).

### 7.2 Herbs
The sources do not document a separate "Herbs" module. Botanical content comes through:
- Michal Yakir's Botanical Repertory ("coming soon" at radar-uk).
- Plant families (Cronquist and APG II).
- The "Only plant remedies" view.

Treat "Herbs" as **not found / possibly a confusion**.

---

## 8. Remedy Information Window (RIW)
- **Opening it.**
  - Double-click a remedy abbreviation anywhere, including in the analysis.
  - Drag a remedy onto the TOC Remedies panel.
  - Right-click a remedy in search results.
- **Contents:**
  - Keynote materia medica text (your favourites).
  - Family information (Cronquist and APG II classifications) and the other members of the family.
  - Proving websites, Wikipedia, Google Images and multimedia. RADAR 10 had pictures and sound clips.
  - Sources and author information.
- **Actions:**
  - "Search for this remedy in…": Synthesis, all repertories or the materia medica.
  - Buttons to **Limit To** or **Highlight** this remedy's family in the analysis.

---

## 9. Families, kingdoms and maps
- **Families TOC.** Lists every family level. Clicking one opens the Families repertory with its members. Right-clicking Limits or Highlights the analysis to that family.
- **Classification systems.** 9 to 13 of them: Cronquist, APG II, Boyd, Dorcsi, bowel nosodes, miasmatic, periodic table, Teste and others. There are more than 5,500 families.
- **Your own families.** Add and edit families (Advanced package and up). Personal family notes.
- **Maps.** Up to 13, for example:
  - Will Taylor's Kingdoms, and Jan Scholten's periodic table.
  - Marine invertebrates, birds, lactanthanides/actinides, carbon groups.
  - Degroote's energetic map of 1,300 remedies.
  
  A Maps icon in the analysis window shows the analysis results on a map.
- **Family Finder (Vervarcke and Schroyens).** Defines essential family themes. Works with Family, Highlight and Limit. 3.3 changed its colour scale to run from red to yellow.
- **Display of excluded remedies.** "Show in their position" shows removed remedies in grey. Ctrl/Cmd+Z undoes the family limit.

---

## 10. Patient files and case management
Sources: [3.1 manual](https://www.radaropus.us/wp-content/uploads/2022/06/RadarOpus-Version-3.1.pdf), [patient management](https://www.radaropus.com/products/radaropus/patient-management), [radar-uk patient file](https://www.radar-uk.co.uk/patient-file/), [2020 packages](https://www.radaropus.us/wp-content/uploads/2020/02/RadarOpus-Packages-2020.pdf), [BjainRx Expert](https://www.bjainrx.com/radaropus-expert/).
- **Records.** Human or veterinary patients. Administrative data, extended in higher packages. Contact the patient by phone, Skype or email.
- **Consultations.** Dated consultations with a case-notes editor. Clipboards are saved automatically for each consultation date. Some countries require earlier consultations to be locked against editing, with an edit trace.
- **Symptom grading and tags.**
  - Grade symptoms your own way, with custom tags: 3 tags on the basic level, unlimited higher up.
  - Filter to show only one kind of symptom, or only bold ones.
  - Attach a photo, video or PDF to a symptom.
- **Prescriptions and pathologies.**
  - Remedy, potency and posology. ICD-10 codes for pathologies.
  - Conventional (allopathic) medications, vaccinations, hospitalisations and lab reports.
  - Notes fields in the prescription and pathology section (3.3).
- **Follow-up.** Evaluate the remedy's effect subjectively and on the Glasgow scale. A chart shows how treatment has progressed.
- **Attachments.** JPG, video, PDF, Word and X-ray images.
- **Search and statistics.**
  - Find patients by symptom, address, age or remedy.
  - Search the text of the current consultation or all consultations.
  - Statistics charts by gender and age, graphical audits, and frequency analysis.
- **Admin.**
  - Invoices and prescription printing, using the practitioner details set under Tools → User account.
  - Email from within the program, and customisable pick lists.
  - Close a case.
  - Scheduling and appointment reminders ([Techjockey](https://www.techjockey.com/detail/radar-opus-homeopathic-software) **[less authoritative]**).
- **Privacy.**
  - Encrypted database, and a password prompt after a timeout.
  - Export a patient's full history (practitioner notes excluded), and delete a patient completely.
  - HIPAA and GDPR compliance, and Congress mode.
- **Research.**
  - Clificol case upload and search, with protocols for research groups.
  - WinCHIP Opus import. The WinCHIP patient-management tool is shown in the Academy.

---

## 11. Vithoulkas Expert System (VES)
- **What it does.** Based on work with Vithoulkas in 1987, it "reproduces the reasoning of an expert". It re-evaluates the case every time a symptom is added or changed ([radar-uk VES](https://www.radar-uk.co.uk/vithoulkas/)).
- **Weighting options:**
  - symptoms against degrees
  - "Small Rx"
  - "Small Rubrics"
  - "Prominence"
- **Symptom weighting.** Uses underlining (the patient's intensity) and knows that mind symptoms usually outweigh local ones, except when a keynote is prominent.
- **Case-taking advice.** It suggests which questions to ask next and gives a confidence score from 0 to 100 ([Homeobook](https://www.homeobook.com/radar-opus-in-clinical-practice-teaching-and-learning/)).
- **UI.** Opens in its own tab next to the standard analysis and uses a special Vithoulkas repertory view. Intensity has to be edited in the normal clipboard view, not in the VES tab ([2.2 manual](https://bjain.com/static_mailer/Manual_RadarOpus_English_2.2_154.pdf)).

## 12. Other analysis modules
- **Boenninghausen Polar Symptom Analysis.** Symptoms from the Therapeutic Pocket Book generate a virtual clipboard of "Opposite polar symptoms". The polarity difference is the patient's degree sum minus the opposites' degree sum. It is opened with a black-and-white circle icon ([radaropus.us](https://www.radaropus.us/product/boenninghausen-clemens-von-polar-symptom-analysis-add-on/)).
- **Heiner Frei Polarity Analysis.** Built on the Therapeutic Pocket Book modalities.
- **Herscu Cycles and Segments.** Available as an analysis strategy.
- **Stöteler, Disease Classification of Hahnemann.** Uses 8 clipboards, following the "flower leaves" method.
- **Also available:**
  - Dimitriadis Boenninghausen repertory, and Bentley Facial Analysis.
  - Degroote Energetic Remedy Picture, and the Ortega Miasmatic module.
  - Sherr Q-Rep, Norland Thematic Repertory, and Scholten's Periodic Table.
- **Farokh Master strategy (3.3).**

---

## 13. Personal additions and editing
Diamond engine; menu bar → **Additions**.
- **Types of addition:**
  - add a remedy
  - add a remedy with a link to its materia medica text (**Ctrl/Cmd+F7**)
  - add an author reference to an existing remedy, with or without materia medica text
  - add a personal symptom note
- **Editing additions.** Right-click a remedy you added to remove or change it. Double-click its underlined author to see the text.
- **New structure (3.0):**
  - new symptoms and sub-rubrics
  - your own cross-references and referring rubrics
  - symptom notes (case summaries, web links)
  - the Personal Chapter
- **Custom synonyms.**
- **Combined rubrics.** Build a new combined rubric from search results and store it in a personal "Additions" repertory.
- **Export and import.** Additions → Export writes a logfile; Additions → Import reads one. Import writes `date.licence_REPORT.log` and `_ERROR.log`. RADAR 10 logfiles can be imported into Adonis (3.0).
- **Custom repertory builder (3.3 bundle).** Your own repertories, in alphabetical structure, with symptoms and cross-references, in any language.
- **Custom repertory views.**

## 14. Bookmarks and history
- **Bookmarks.** "Add bookmarks anywhere in the library, group them, quick search" ([2016 manual](https://radaropus.us/wp-content/uploads/2016/07/Manual_Opus_English.pdf)). Bookmarks are a tag type. Repertory bookmarks feed the symptom templates in 3.3.
- **History.** Back, Forward and a full History list, like a browser. The embedded browser keeps its own history.

## 15. Import, export and data
- **Import:**
  - RadarClassic 8, 9, 10 and 10.5 (cases and additions)
  - Radar 10 catalogues, WinCHIP 3.x and RCPC files
  - additions logfiles, and analysis XML
- **Export:**
  - analysis as XML or RTF (via the clipboard)
  - search results to Excel
  - patient history
  - additions logfiles
  - screenshots
  - Synthesis App PDF and XML
- **Backup and restore.** A single encrypted, password-protected file, with scheduling. Restoring needs the password that was in use when the backup was made.
- **Updates.** Content Updater and LiveUpdate cover free and paid documents, freenotes and Synthesis additions.
- **Licence.** A soft key (support moves it to a new computer) or a USB dongle.
- **Startup document mix.** Tick documents, then File → Save selection as a document mix, then File → Select a default document mix.
- **Demo limits.** 10 patients, 10 consultations per patient, 10 repertorisations per consultation, and 30 cases. Backup and update are disabled.

---

## 16. Keyboard shortcut reference

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+1…5 | Open the Repertories / References / Patients / Remedies / Families TOC |
| Alt+1 / Alt+2 / Alt+3 | Switch to the Repertory / Reference / Patient window |
| F2 | Find (chapters); typing letters jumps to a chapter |
| F3 | Find from the current location |
| Backspace / ← | Up one level in Find |
| F4 or `?` | Simple search |
| F5 | Advanced search |
| F6 | Take with options |
| F7 | Clipboards: symptoms only |
| F8 | Symptoms plus analysis |
| `+`↵ / `=` | Quick take |
| `+n`, `+n>m`, `+!`, `+a`, `+/s`, `+/x` | Take syntax (see section 5) |
| 1–4, 0 | Set intensity of a clipboard symptom / take it out of the score |
| Ctrl/Cmd+↑/↓ | Move a symptom in the clipboard |
| Alt+click a clipboard | Make it the default |
| Ctrl/Cmd+click | Multi-select symptoms, clipboards or cross-references |
| Space (×3) | Cycle count / abbreviations / authors |
| Ctrl/Cmd+Z | Remove a family limit or highlight (undo) |
| Ctrl/Cmd+S | Save analysis |
| Ctrl/Cmd+R | Recall analysis (3.3) |
| Ctrl/Cmd+C | Copy the analysis as RTF, or the symptom plus remedies |
| Shift+Ctrl/Cmd+C | Copy symptom text only |
| Ctrl/Cmd+A | Select all |
| Ctrl/Cmd+F7 | Add a remedy with materia medica text (Additions) |
| Double-click a remedy | Remedy Information Window |
| Double-click a tab | Hide the TOC |

The packages advertise "103+" shortcuts. Only the ones above are documented in the sources I could read.

---

## 17. Gaps and opportunities for the web successor [inferred]
- **Features not documented publicly:**
  - a separate Word Index module (the Root & Branches list is the closest match)
  - print layout options
  - bookmark-group management UI
  - the full 103-shortcut map
  - a Herbs module

  Designing our own versions of these is fine.
- **Where competitors and reviews say RadarOpus is weak:**
  - no multi-device or cloud access
  - no everyday-language (semantic) search
  - opaque pricing
  - dated UI

  Sources: [homeopathy.software](https://homeopathy.software/alternatives/best-radaropus-alternative-2026/), [Similia](https://www.similia.io/blog/synthesis-repertory-guide).
- **What a browser SPA can improve on:**
  - sync across devices
  - a command palette with the `+n>m` take syntax
  - semantic search mapped to rubrics, replacing Concepts
  - comparison graphs built in
- **Content constraint.** Synthesis, the Vithoulkas Expert System logic and the proprietary books cannot be used. Plan for open repertories (Kent, Boenninghausen, Boericke through OOREP) and clean-room reimplementations of the generic analysis strategies.