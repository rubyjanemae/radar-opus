# Scoring specification: analysis strategies, formulas and test vectors

Status: normative for the analysis engine (inventory items ANA-*). Derived from `reports/analysis.md`, with every test vector recomputed by a reference script on 2026-09-29.

Evidence labels:
- **[SOURCED]**: behaviour documented for RadarOpus or a named program.
- **[INFERRED]**: our reading of incomplete sources.
- **[PROPOSED]**: our own design. It is not claimed to match RadarOpus.

**Clean-room rule.** We do not reproduce the Vithoulkas Expert System (VES), the Farokh Master strategy or any other proprietary logic. All strategies below are generic, published methods or our own designs, and they are named neutrally.

---

## 1. Inputs and notation

### 1.1 Case model (what the engine receives)

```ts
interface AnalysisInput {
  lines: SymptomLine[];              // from the selected clipboards, in clipboard order
  selectedClipboards: string[];      // union of these; empty = all non-empty clipboards
  strategy: StrategyId;
  params: StrategyParams;            // see section 6
  intensityOn: boolean;              // "consider symptom intensity" toggle, default true
  view: RepertoryViewId;             // source filter applied before scoring
  familyLimit?: FamilyId[];          // remedies not in any listed family are excluded
  familyHighlight?: FamilyId[];      // flag only, no score change
}
interface SymptomLine {
  id: string;
  clipboardId: string;
  kind: 'rubric' | 'group' | 'combined' | 'mmLink';
  rubricIds: string[];               // 1 for a rubric; 2+ for a group, combined or cross line
  groupMode?: 'combine' | 'cross';   // for kind 'group': combine = max/union (default), cross = min/intersection
  intensity: 0 | 1 | 2 | 3 | 4;      // default 1; 0 = keep but ignore
  qualifier: 'normal' | 'eliminative' | 'exclusive';
  causative?: boolean;               // stored; used only by the composite strategy's category weight
  category?: 'srp' | 'mental' | 'general' | 'particular';  // default derived from the chapter (section 1.4)
  groupLetter?: string;              // a..z; lines sharing a letter are scored as ONE line (section 2, step 2)
  polarOppositeRubricId?: string;    // for the polarity strategy
  generalRubricIds?: string[];       // for the Boenninghausen preset (grand generalisation)
}
```

### 1.2 Symbols

| Symbol | Meaning |
|---|---|
| s | An effective symptom line after grouping (section 2, step 2). |
| i_s | Intensity of s, in {1,2,3,4}. Lines with i_s = 0 are dropped before step 1. When `intensityOn = false`, i_s = 1 for all lines. |
| g(r,s) | Grade of remedy r in s, in the rubric's native scale (Publicum/Kent 1–3, Knerr 1–4, TPB 1–5). 0 if absent. |
| n_s | Rubric size: the number of remedies in s under the active view. For a group, the size of the union (combine) or intersection (cross). |
| m_r | Remedy size: the number of rubrics containing r in the active repertory and view. Precomputed per repertory and view at build time. |
| κ_s | Category weight (Kent preset): srp 4, mental 3, general 2, particular 1 (editable). |
| [x] | 1 if x is true, else 0. |

### 1.3 Base quantities (every strategy exposes these)

- C(r) = Σ_s [g(r,s) > 0], the coverage count
- D(r) = Σ_s g(r,s), the degree sum
- CI(r) = Σ_s i_s·[g(r,s) > 0]
- DI(r) = Σ_s i_s·g(r,s)

The result row for every remedy carries `{C, D, CI, DI, score, secondary, cells: {lineId: g}, excludedReason?}`.

### 1.4 Default category from chapter [PROPOSED]
- `Mind` gives mental.
- `Generalities` / `Generals`, `Sleep`, `Dreams`, `Fever`, `Chill`, `Perspiration` give general.
- Every other chapter gives particular.
- `srp` is set only by the user.

---

## 2. Pipeline (identical for all strategies)

1. **Collect lines.** Take the union of the lines in the selected clipboards, preserving order and dropping lines with i_s = 0. Per-clipboard weight c_k (default 1) multiplies i_s [PROPOSED]. The product is not clamped.
2. **Group lines.** All grades used in this step are already view-filtered: the view (step 3) is applied per rubric *before* any group max/min or union/intersection is computed, so a group can never take a grade that the active view hides (vector E8).
   - Lines sharing a `groupLetter` inside the same clipboard merge into one effective line. g = max over members, n = union size, and i = max member intensity [PROPOSED]. The qualifier is `eliminative` if any member is; otherwise `exclusive` if all members are; otherwise `normal`.
   - Explicit `group` lines use `groupMode`:
     - combine: g = max, over the union [SOURCED, RadarOpus manual 3.1 p. 57].
     - cross: g = min, over the intersection [SOURCED, Complete Dynamics].
   - A group line carries its own intensity; member intensities are ignored [PROPOSED].
3. **Apply the view.** Grades from sources outside the active view are removed before anything else (logically this runs before step 2; it is listed here only to keep the step numbers that other documents cite). n_s is computed after the view is applied. A rubric left with 0 remedies under the view still counts as a line for the quality light (§4.15) but contributes to no score.
4. **Candidates.** The candidate set is the union of the remedies with g > 0 in any effective line.
5. **Eliminative lines.** Keep only the remedies present in every eliminative line. The others are excluded with reason `eliminative:<lineId>`, naming the first failing line in line order. [SOURCED]
6. **Exclusive lines.** Remove the remedies present in any exclusive line, with reason `exclusive:<lineId>`. [SOURCED]
7. **Family limit.** Remedies in none of the limited families are excluded with reason `family-limit`. [SOURCED]
8. **Score.** Qualified lines still contribute to the score of the remedies that remain [INFERRED].
9. **Sort** by the strategy key, then by the universal tie chain.
10. **Excluded remedies** are scored too, so that "show in their position" can place them. They are returned in `excluded[]` and are never ranked above an included remedy in the main list.

### 2.1 Universal tie chain
After the strategy's own keys, ties are broken by:
1. C, descending
2. D, descending
3. Remedy abbreviation, ascending: case-insensitive, by Unicode code point, with trailing dots stripped
4. Remedy id, ascending

### 2.2 Numeric rules
- Integer strategies use exact integer arithmetic.
- Fractional strategies compare `Math.round(x·1e9)`. Scores are displayed with 1 decimal place, or 0 decimal places when the score is an integer.

### 2.3 Determinism contract
The same `AnalysisInput` and data version must give byte-identical ordered output. A saved analysis stores its `AnalysisInput`, the data version hash and a result snapshot (top 100 remedies with scores).

---

## 3. Strategy catalogue

| ID | Name in UI | Evidence | Primary key | Secondary key | Then |
|---|---|---|---|---|---|
| `sumSymDeg` | Sum of symptoms (sort by degrees), the **default** | SOURCED | C (CI if intensity on) | D (DI if on) | tie chain |
| `sumSym` | Sum of symptoms | SOURCED (tie INFERRED) | C (CI) | — | tie chain |
| `sumDegSym` | Sum of degrees (sort by symptoms) | SOURCED | D (DI) | C (CI) | tie chain |
| `sumSymPlusDeg` | Sum of symptoms and degrees | SOURCED name, PROPOSED formula | C + D (CI + DI) | — | tie chain |
| `weighted` | Weighted rubrics | OOREP / Complete Dynamics | Σ i_s·g | — | tie chain |
| `smallRubrics` | Small rubrics | SOURCED idea (≤10), PROPOSED factor | Σ g·i_s·f_s | — | tie chain |
| `smallRubricsCont` | Small rubrics (continuous) | PROPOSED (Mercurius-like) | Σ g·i_s·w(n_s) | — | tie chain |
| `smallRemedies` | Small remedies | PROPOSED | DI·f(r) | — | tie chain |
| `smallBoth` | Small rubrics + small remedies | PROPOSED | Σ g·i_s·f_s·f(r) | — | tie chain |
| `prominence` | Prominence (keynote) | PROPOSED | P | then `sumSymDeg` keys | tie chain |
| `kent` | Kent hierarchy preset | PROPOSED | Σ g·i_s·κ_s | — | tie chain |
| `boenninghausen` | Boenninghausen generalisation | INFERRED / PROPOSED | C over g_eff | D over g_eff | tie chain |
| `polarity` | Polarity analysis | SOURCED (Frei) | contraindicated (false first) | PD | PS, coverage, name |
| `segments` | Segments (cross-clipboard) | PROPOSED (Herscu-like) | SegScore | DI | name |
| `composite` | Expert (composite) | PROPOSED (not VES) | Σ g·i·κ·w(n)·π·f(r) | — | tie chain |
| `families` | Family overview | PROPOSED | any base strategy over family pseudo-remedies | | |

**Strategy tiers.**
- P0: `sumSymDeg`, `sumSym`, `sumDegSym`, `weighted`, `smallRubrics`.
- P1: `sumSymPlusDeg`, `smallRemedies`, `smallBoth`, `prominence`, `kent`, `polarity`, `families`.
- P2: `boenninghausen`, `segments`, `composite`, `smallRubricsCont`.

---

## 4. Formulas

### 4.1 `sumSymDeg` (default) [SOURCED]
- Intensity off: key = (C desc, D desc, name asc).
- Intensity on: key = (CI desc, DI desc, name).
- Display: `C/D`, or `CI/DI` when intensity is on.

### 4.2 `sumSym`
Key = (C desc), then the tie chain, which falls through to D and then the name.

### 4.3 `sumDegSym`
- Intensity off: key = (D desc, C desc, name).
- Intensity on: key = (DI desc, CI desc, name).

### 4.4 `sumSymPlusDeg` [PROPOSED]
- score = C + D, or CI + DI when intensity is on.
- The key is the score, then the tie chain.

### 4.5 `weighted`
- score = Σ i_s·g(r,s) = DI.
- Intensity 0 removes the line (already done in step 1).

### 4.6 `smallRubrics`
- f_s = F_small if n_s ≤ T_small, otherwise 1. Defaults: T_small = 10, F_small = 2.
- score = Σ g·i_s·f_s.

### 4.7 `smallRubricsCont`
- w(n) = 1 + (W_max − 1)·2^(−(n−1)/H). Defaults: W_max = 30, H = 10.
- score = Σ g·i_s·w(n_s).

### 4.8 `smallRemedies`
- f(r) = clamp((M_ref/m_r)^α, f_min, f_max). Defaults: M_ref = 1000, α = 0.5, f_min = 0.5, f_max = 4.
- score = DI·f(r).

### 4.9 `smallBoth`
score = f(r)·Σ g·i_s·f_s.

### 4.10 `prominence`
- A remedy r is **prominent** in line s when both hold:
  - g(r,s) = max_x g(x,s)
  - |{x : g(x,s) = max}| ≤ K_prom (default 3)
- P(r) = Σ over prominent lines of i_s·g(r,s)·w_s, where w_s = 1. With the `soleBonus` option, w_s = 2 when r is the only remedy at the maximum.
- Key = (P desc, then the `sumSymDeg` keys, then the tie chain).

### 4.11 `kent`
- score = Σ g·i_s·κ_s.
- Option `markedMentalEliminative`: the first mental line with i_s ≥ 3 becomes eliminative.
- Option `mustCoverStrong`: every line with i_s ≥ 3 becomes eliminative.

### 4.12 `boenninghausen`
- g_eff(r,s) = max(g(r,s), max over the general rubrics linked to s of g(r,·)).
- Then apply `sumSymDeg` over g_eff.
- Boger variant: a line's generalisation applies only when its `generalizeFlag` is set, and the UI sets that flag only when the user marks the feature as occurring in 3 or more locations.

### 4.13 `polarity` [SOURCED, Frei; Complete Dynamics]
- Input: the polar lines p_k with opposites o_k. There are N polar lines; the UI warns when N < 5.
- For each remedy:
  - PS = Σ g(p_k)
  - OS = Σ g(o_k)
  - PD = PS − OS
  - cov = |{k : g(p_k) > 0}|
- Contraindicated if there is a k with g(p_k) ≤ LOW (default 2) AND g(o_k) ≥ HIGH (default 3). [SOURCED: "A contradiction occurs when the patient symptom is observed in the 1st or 2nd grade with the opposite pole listed for the remedy in the 3rd, 4th, or 5th grade", Oskin, AJHM 2015, summarising Frei.] Treating an absent grade (0) as low is **[INFERRED]**; it only matters when allowMissing > 0.
- Candidates: cov ≥ N − allowMissing, where allowMissing defaults to 0.
- `includeNonPolar` (default off) adds the non-polar lines' degree sum to PS.
- Sort: contraindicated false first, then PD desc, then PS desc, then cov desc, then name.
- Display, one row per remedy: `C/D`, PS, OS, and **PD** in bold. Contraindicated remedies are shown struck or greyed with a "CI" badge.

### 4.14 `segments`
- Run the base strategy (default `sumSymDeg`, intensity off) on each selected clipboard separately.
- SegScore(r) = the number of clipboards in which r ranks in the top K (default 10).
- Key = (SegScore desc, DI over all lines desc, name).
- Herscu's published method uses at most 4–6 segments [SOURCED, RadarOpus manual]. The UI warns "Segments work best with 2–6 clipboards" when fewer than 2 or more than 6 non-empty clipboards are selected; the calculation still runs.

### 4.15 `composite` [PROPOSED; never labelled VES]
- score = f(r)·Σ g·i_s·κ_s·w(n_s)·π(r,s), where π = 2 if r is the sole top-grade remedy of s, otherwise 1.
- Confidence = 100·(S1 − S2)/S1, where S1 and S2 are the top two scores. It is 0 if S1 = 0.
- Quality warnings, shown as a traffic light:
  - red: fewer than 4 lines
  - amber: more than 80% of lines at i = 1, or more than 20% at i = 4
  - green: otherwise

### 4.16 `families` [PROPOSED]
- g(F,s) = max over the members r of F of g(r,s).
- n and m are recomputed on the pseudo-remedies.
- The chosen base strategy runs over the pseudo-remedies. Family density = the number of members in the top N (default 20) of the remedy-level result.

### 4.17 Limit and highlight
- **Limit:** exclusion, applied in pipeline step 7.
- **Highlight:** adds `highlight: familyId[]` to the row and changes no score.
- Undo (Ctrl/Cmd+Z) pops the last limit or highlight action from the analysis undo stack.

---

## 5. Test vectors

### 5.1 Fixture F1 (synthetic)

```json
{
  "lines": [
    {"id":"R1","intensity":1,"n":250,"category":"mental",    "grades":{"A":3,"B":2,"C":1,"D":1,"E":2}},
    {"id":"R2","intensity":2,"n":3,  "category":"particular","grades":{"A":1,"B":3,"F":2}},
    {"id":"R3","intensity":1,"n":60, "category":"general",   "grades":{"A":2,"B":1,"C":3,"D":2,"E":1,"F":1}},
    {"id":"R4","intensity":1,"n":8,  "category":"particular","grades":{"A":1,"C":2,"D":1}}
  ],
  "remedySize": {"A":20000,"B":4000,"C":1000,"D":250,"E":250,"F":10}
}
```

The `n` value is the declared rubric size, used only by the size-based strategies. It deliberately differs from the number of remedies listed.

Base values:

| Remedy | C | D | CI | DI |
|---|---|---|---|---|
| A | 4 | 7 | 5 | 8 |
| B | 3 | 6 | 4 | 9 |
| C | 3 | 6 | 3 | 6 |
| D | 3 | 4 | 3 | 4 |
| E | 2 | 3 | 2 | 3 |
| F | 2 | 3 | 3 | 5 |

### 5.2 Expected outputs

| # | Strategy / setup | Expected order (score) |
|---|---|---|
| T1 | `sumSymDeg`, intensity off | A(4/7), B(3/6), C(3/6), D(3/4), E(2/3), F(2/3) |
| T2 | `sumSymDeg`, intensity on | A(5/8), B(4/9), C(3/6), F(3/5), D(3/4), E(2/3) |
| T3 | `sumSym`, intensity off | A4, B3, C3, D3, E2, F2 (same order as T1) |
| T4 | `sumDegSym`, intensity off | A7, B6, C6, D4, E3, F3 |
| T5 | `sumDegSym`, intensity on | B9, A8, C6, F5, D4, E3 |
| T6 | `weighted` | B9, A8, C6, F5, D4, E3 |
| T7 | `sumSymDeg` off, R4 eliminative | A(4/7), C(3/6), D(3/4); excluded B, E, F with reason `eliminative:R4` |
| T8 | `sumSymDeg` off, R2 exclusive | C(3/6), D(3/4), E(2/3); excluded A, B, F with reason `exclusive:R2` |
| T9 | Combine G = R1+R3 (max); lines G, R2, R4; `sumSymDeg` off | G grades A3, B2, C3, D2, E2, F1. Order A(3/5), B(2/5), C(2/5), D(2/3), F(2/3), E(1/2) |
| T10 | Cross R1×R3 (min) | A2, B1, C1, D1, E1; F absent |
| T11 | `smallRubrics` (T = 10, F = 2), intensity on | B15, A11, F9, C8, D5, E3 |
| T12 | w(n), W_max = 30, H = 10 | w(1) = 30, w(11) = 15.5, w(21) = 8.25, w(31) = 4.625; w(3) = 26.245966, w(8) = 18.851594, w(60) = 1.485647, w(250) = 1.000001 |
| T13 | `smallRubricsCont`, intensity on | B 160.9614, F 106.4695, A 77.3148, C 43.1601, D 22.8229, E 3.4856 |
| T14 | `smallRemedies` factors | A 0.5 (0.2236 clamped up), B 0.5, C 1, D 2, E 2, F 4 (10 clamped down) |
| T15 | `smallRemedies`, intensity on | F20, D8, C6, E6, B4.5, A4 (C before E on the tie chain: C 3 > 2) |
| T16 | `smallBoth` | F36, D10, C8, B7.5, E6, A5.5 |
| T17 | `prominence` (K = 3, no sole bonus), intensity on | Top-grade remedies: R1 A(3), R2 B(3), R3 C(3), R4 C(2). P: B6, C5, A3, D0, E0, F0. Order B, C, A, F, D, E (the P = 0 remedies fall back to the `sumSymDeg` intensity-on keys: F 3/5, D 3/4, E 2/3). With intensity off, P is B3, C5, A3 and the order is C, A, B, D, E, F (A before B on the tie chain: C 4 > 3) |
| T18 | `kent` (κ: mental 3, general 2, particular 1) | A16, B14, C11, D8, E8, F6 (D before E on the tie chain: C 3 > 2) |
| T19 | `sumSymPlusDeg`, intensity off | A11, B9, C9, D7, E5, F5 |
| T20 | `sumSymPlusDeg`, intensity on | A13, B13, C9, F8, D7, E5 (A before B on the tie chain: C 4 > 3) |
| T21 | `composite` (defaults) | F 431.8206, B 161.9614, C 96.2341, D 55.5884, A 47.6431, E 17.9426. Confidence 62.49. Quality light: fewer than 4 lines is false, 75% of lines at i = 1 is under 80%, so green |
| T22 | `boenninghausen`: particular A2, B1; general A3, C2, D4 | g_eff: A3, B1, C2, D4 |
| T23 | `families`: Fam1 = {A, D}, Fam2 = {B, E, F}, `sumSymDeg` off | Fam1 (4/7), Fam2 (3/6) |
| T24 | `segments`, K = 2; clipboard 1 = {R1, R2}, clipboard 2 = {R3, R4} | Clipboard 1: B(2/5), A(2/4), E(1/2), F(1/2), C(1/1), D(1/1), so the top 2 are B and A. Clipboard 2: C(2/5), A(2/3), D(2/3), …, so the top 2 are C and A. SegScore A2, B1, C1. Order A, B (DI 9), C (DI 6) |

**T21 worked detail for F.** F appears in R2 (grade 2, sole top grade: no, because B has 3) and R3 (grade 1, not top).
- R2 term: 2·2·κ1·26.245966·1 = 104.9839
- R3 term: 1·1·κ2·1.485647·1 = 2.9713
- Sum 107.9551; × f(F) = 4 gives 431.8206.

### 5.3 Polarity fixture F2

| Remedy | Patient grades p1..p3 | Opposite grades o1..o3 |
|---|---|---|
| X | 4, 3, 2 | 1, 0, 1 |
| Y | 3, 3, 1 | 0, 1, 3 |
| Z | 2, 2, 2 | 0, 0, 0 |
| W | 4, 4, 0 | 0, 0, 4 |

| # | Setup | Expected |
|---|---|---|
| T25 | allowMissing = 0 | X (PD 7), Z (PD 6), Y (PD 3, contraindicated at pair 3). W excluded: coverage 2/3 |
| T26 | allowMissing = 1 | X 7, Z 6, W 4 (contraindicated: g(p3) = 0 ≤ 2 and g(o3) = 4 ≥ 3), Y 3 (contraindicated) |
| T27 | Published sanity values | PS 14, OS 3 gives PD 11 (Ipeca); PS 9, OS 5 gives PD 4 (Arnica) |

### 5.4 Edge-case vectors [PROPOSED]

| # | Case | Expected |
|---|---|---|
| E1 | No active lines (all at i = 0) | Empty result, empty `excluded`, UI message "No symptoms to analyse" |
| E2 | Two eliminative lines with no common remedy | Empty result; every remedy in `excluded` with the first failing line as its reason |
| E3 | Line is both eliminative and at i = 0 | The line is ignored entirely, including its elimination |
| E4 | Same rubric taken twice in one clipboard | Stored once; the second take updates intensity and qualifier and does not duplicate (the UI shows a toast) |
| E5 | Same rubric in two selected clipboards | Counted twice (union of lines); the UI flags it with a "duplicate across clipboards" badge |
| E6 | Remedy with an abbreviation that differs only in case (`Nat-m` vs `nat-m`) | Resolved to one remedy id at load time |
| E7 | 1,000 lines × 2,500 remedies | `sumSymDeg` completes in under 50 ms (median of 20 runs after 3 warm-up runs) in a Web Worker on reference hardware (feature-inventory "Reference environment") |
| E8 | View "Grade 3 only"; combine group G = R1+R3 | The view is applied before grouping: G grades are A3 (from R1) and C3 (from R3) only, n_G = 2. B, D, E and F are absent from G |
| E9 | Eliminative line with intensity off | Elimination still applies (the qualifier is independent of `intensityOn`); T7 output is unchanged |
| E10 | A remedy excluded by both an eliminative and an exclusive line | One reason only: the eliminative reason wins (step 5 runs before step 6) |

---

## 6. Parameter schema and defaults

```json
{
  "intensityOn": true,
  "smallRubrics": {"threshold": 10, "factor": 2},
  "smallRubricsCont": {"wMax": 30, "halfLife": 10},
  "smallRemedies": {"mRef": 1000, "alpha": 0.5, "fMin": 0.5, "fMax": 4},
  "prominence": {"k": 3, "soleBonus": false},
  "kent": {"weights": {"srp": 4, "mental": 3, "general": 2, "particular": 1},
           "markedMentalEliminative": false, "mustCoverStrong": false},
  "polarity": {"low": 2, "high": 3, "allowMissing": 0, "includeNonPolar": false, "minLinesWarn": 5},
  "segments": {"base": "sumSymDeg", "topK": 10},
  "composite": {"soleTopFactor": 2},
  "clipboardWeights": {},
  "display": {"topN": 20, "showExcluded": false}
}
```

Every parameter is editable in the strategy panel's "Advanced" drawer. It is saved with the analysis, and a "Reset to defaults" button restores the defaults.

## 7. Grade scales across repertories
- Scores use each repertory's native grade. Publicum and kent-de are 1–3.
- Mixing repertories in one clipboard is allowed. An optional `normalizeGrades` setting maps grades linearly to 1–4 with g′ = round(g·4/max_scale) [PROPOSED]. It is off by default, and the analysis header shows a warning when scales are mixed.
- Display typography maps native grades as follows:
  - 1–3 scale: grade 1 plain, 2 italic, 3 bold.
  - 1–4 scale: adds 4 as bold capitals.
  - 1–5 scale: 5 is bold capitals underlined.
