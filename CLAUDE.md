# Radar Opus: working notes

A web successor to desktop repertorisation software (RadarOpus-class): repertory, materia medica, patients/cases and analysis in one keyboard-first workspace. Vite + React 19 + TypeScript SPA, zustand store, IndexedDB persistence. No backend.

## Commands

- `npm run dev` / `npm run build` / `npx vite preview --port 4173`
- `npx tsc -b` typecheck, `npm test` (vitest, `src/**/*.test.ts(x)`), `npx playwright test` (e2e in `e2e/`)
- `node scripts/shot.mjs <url> <out.png> [--w 1440 --h 900 --dark --keys "F2,Escape" --eval "js"]` screenshots with the preinstalled Chromium
- `node scripts/build-data.mjs <oorep.sql.gz>` regenerates `public/data/` from the OOREP dump (GPL v3)

## Architecture

- `src/data/` reference data. `Catalog` (remedies, repertory infos, lazy repertories, Boericke MM). `Repertory` is columnar: rubric ids are indexes in book order, so a subtree is the range `[i, subtreeEndOf(i))`. Rubrics are addressed across the app by `RubricRef = "<repertory>:<index>"`. Remedy grades 1..4 (1 plain, 2 italic blue, 3 bold red, 4 bold red caps; classes `.g1`..`.g4` in `index.css`).
- `src/engine/` pure analysis (no React). `model.ts` has Symptom/Clipboard/AnalysisOptions; `analysis.ts` strategies. Keep it pure and unit-tested.
- `src/state/store.ts` single zustand store `useApp` + `actions`. Case data (patients, consultations) goes through `mutateCase` so undo/redo covers it. Workspace (tabs, layout, settings, bookmarks, notes) persists via `state/persist.ts` autosave.
- `src/commands/registry.ts` every user action is a registered command (id, title, keys, enabled, checked). Menus (`shell/menus.ts`), the toolbar, the command palette and keyboard shortcuts all read the registry. Feature commands are registered from `features/<name>/commands.ts` exporting `register(catalog)`, listed in `features/register.ts`.
- `src/shell/` window chrome: menubar, toolbar, tab strip, resizable panes, status bar, `DialogHost` (dialogs registered with `registerDialog(kind, Component)` and opened with `actions.openDialog(kind, props)`).
- `src/ui/` primitives: `MenuList`/`useContextMenu`, `Dialog`, `Splitter`, `Toasts`, `ErrorBoundary`, `files.ts`.
- `src/features/<name>/` one folder per system. A feature owns its folder; touch shared files (store, model, menus, register.ts, shell) only with small, targeted edits after re-reading them.

## Conventions

- Dense desktop-grade UI: 13px base, 24px rows, CSS variables from `index.css` (never hard-code colours; dark mode must work). Feature CSS lives next to the feature (`feature.css`, imported by its main component) and uses class prefixes per feature.
- Every visible control must work. No placeholders, no "coming soon". If something can't be done well, leave it out.
- Keyboard first: every action has a command; lists are keyboard navigable with roving focus; context menus open with right-click, Shift+F10 and the ContextMenu key.
- Large lists (rubrics, remedies) must be virtualised; the repertories have ~70k rubrics each.
- Grade is never conveyed by colour alone (italic/bold/caps too).
- Keyboard map follows RadarOpus where sensible: F2 find, F3 find from current, F4 search, F5 advanced/remedy search, F6 take with options, F7 clipboards, F8 analysis, Space cycles rubric display, `+`/`=` take mini-language (`+2`, `+1>3`, `+!`), 0–4 set symptom intensity, Backspace/← parent rubric.
