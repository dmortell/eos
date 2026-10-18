# Hacky code — review (2026-10-17)

A read-only survey of `src/lib/cad` (tests, docs, bench, dev, persist/import skipped), for the User's todo "Look for more
hacky code to improve" (backlog). Nothing fixed yet; paths relative to `src/lib/cad/`. Line numbers as of commit
2698d2dd.

## Top 8 to fix first

ALL 8 FIXED 2026-10-17/18: 1 (c36b0062), 2 (3c4537f3), 3 (0e58f036), 4 (5bea71cc), 5 (91b396a6 — a remover that removes
only its own; the namer is still a module global), 6 (`Prim.role` — picking, port tips, overlays, layers and DXF read it;
still on `cls`: Prims.svelte's selection look, the Fit's datum filter, the title block / paper snap lines, dimension
grips, plan label placement, the layer / shape style rules), 7 (027d41d5), 8 (CordToolDeps; ShellActions attached once
— toolDefaults left as a settable query).
1. `ws.focus` / `ws.centreOn` are one-shot requests held as shared state: whichever pane's fit effect runs first takes
   them (FindDevice waits a `tick()` so "the plan doesn't take it"; Navigator / CadShell don't) — ui/ViewCanvas.svelte
   ~268-300. Fix: a request naming its pane / view, or a direct `canvas.focus(id)`.
2. Swallowed errors: app/issueStates.svelte.ts ~43-50 (one catch round the whole sheet loop — one bad sheet hides the
   rest), persist/sync.ts ~46 (a remote delete dropped without a trace), app/restoreNotice.svelte.ts ~90. Fix: per-sheet
   try / catch that logs; warn / surface the others.
3. `ProjectIndex.get<T>()` is an unchecked cast posing as a generic (domain/project.ts ~54; `ix.get<Rack>(…)` callers),
   and `store.get('settings') as ProjectSettings` in several places. Fix: `getOf(type, id)` that checks the type; one
   `settingsOf(store)`.
4. REGION shape kinds drifted: domain/validate.ts ~15 lacks `ellipse` (editor/selectTool.ts ~44, views/plan.ts ~118
   have it) — an ellipse with `extent` fails validation but resizes. Fix: one exported set in domain/shapes.ts.
5. render/download.ts `namer` / `patterner` module globals installed by a CadShell effect: two shells (HMR) — the last
   wins, an unmount nulls the other's. Fix: pass via context / an argument.
6. Prim `cls` strings used as semantics (~118 `cls.startsWith/includes` checks; render/dxf.ts maps CSS class → DXF
   layer by regex): renaming a CSS class changes picking and DXF layers. Fix: a typed `role` / `layer` field on Prim.
7. Rack height `heightU * 44.45 + 150` written 3× (views/rackRow.ts, views/elevation.ts, ui/RackProps.svelte), the
   rack-unit constant 4× (RU_MM ×2, RU, U_MM). Fix: one domain/units.ts and one `rackHeight()`.
8. CordTool's 6 positional constructor params (editor/cordTool.ts, app/workspace.svelte.ts) and ~20 Workspace
   `foo: () => void = () => {}` slots CadShell overwrites (a late-bound locator: calling one before mount does nothing).
   Fix: a `CordToolDeps` object; one typed `ShellActions` injected once.

## The rest, by kind
- **Effects that should be derived / mirror state** — FIXED 2026-10-18: the status bar's readout, the guides key and
  the points being drawn are read off the active canvas (`canvas.info()` / `guidesKey()` / `pathPending()`); the
  Layers panel takes the sheet from the active pane's spec; the project's name / owner / details / user name are
  getters over the shell's props (`CadProject` `meta`), the new-cord status a query like `toolDefaults`; the deleted
  pane / tab check runs when something is gone, not on every edit; the level fix-up reads what it writes untracked;
  `buildingsOf()` drops a stale answer. Was: ViewCanvas `tick` counter + `ws.pathPending` mirror (~93-95,
  516); `ws.viewInfo`, `ws.activeGuideKey` pushed up by effects (~718-731, ~199); CadShell mirrors `ws.activeSheet`,
  `ws.newCordStatus`, project name / owner by effects (~224, 614, 86); an effect reads + writes `ws.levelId` /
  `paneLevels` (~435-440); an effect on `project.rev` runs `setPane()` / `tabs.prune()` on every edit (~335-343); an
  async `buildingsOf()` in an effect without cancellation (~90-94).
- **Type escapes** — FIXED 2026-10-18: the narrowed casts gone (labelEdit, usages, toolDefaults, clipboard — its
  shapes behind a `type` guard, the room name via `getOf`); `SelKind` keyed by kind (one cast where it's built, none
  in Properties); OpenProjectDialog maps each doc field by field (`toProject`); `readableClip` uses `labelOf`;
  FindDevice drops devices with no rack up front (no `r!`). Was: casts right after a discriminant check that already narrows (domain/labelEdit.ts, usages.ts,
  toolDefaults.ts, clipboard.ts); `SelKind` not a discriminated union (`k.items as Outlet[]` ×7 in Properties);
  `data as unknown as Project[]` on unvalidated Firestore data (ui/OpenProjectDialog.svelte ~28); pasteText.ts ~65
  re-implements `labelOf()` through a double cast; FindDevice `r!` ×5 after a non-guard filter.
- **DOM / Svelte** — FIXED 2026-10-18 except two: CadDialog counts itself open (`ui/modals.svelte.ts`, a context the
  shell gives) and shellKeys, the paste handler and AskBox read that count; the Ctrl+K palette hands the cad page a
  level / sheet through `setCadOpener` / `openInCad` ($lib/palette), not a window event. LEFT: EditHistorySettings'
  3 copied style rules (shared form-row components would restyle Settings — a pass of its own); Properties' Enter /
  Esc microtask (works; changing it risks the "keys went into the field" gotcha). Was: EditHistorySettings copies SettingsPanel's scoped styles (shared form row components wanted);
  `document.querySelector('[role=dialog]')` decides whether keys reach the drawing (shellKeys, clipboardEvents,
  AskBox) — fix: a `ws.modalOpen` count kept by CadDialog; a window CustomEvent `'cad-open'` as a bus (CadShell ↔
  CommandPalette); Properties' delegated Enter / Esc sets `t.value` and blurs in a microtask.
- **Parameters** — FIXED 2026-10-18: `makeBox(levelId, centre, { w, d, h, z?, rot? })` (tests only); `dimGrips(prims,
  id, { a, b, a2, b2 })`; `dragDevices(g, dU, { others, rackOf }, { target, copy, side })`; `setTool(id,
  { keepSelection })`; `groupKey(…, 'group' | 'ungroup')`; `tabs.open(i, view, 'preview' | 'keep', rev)`. Was: `makeBox(levelId, centre, w, d, z, h, rot)`, `dimGrips(prims, id, a, b, a2, b2)`,
  `dragDevices(…, copy: boolean, …)`, `setTool(id, keep)`, `groupKey(ungroup)`, `tabs.open(i, view, keep, rev)`.
- **Drift / copies** — FIXED 2026-10-18: `deviceMatches` / `deviceFace` (domain/devices.ts) for Find a device and Ctrl+K
  (Ctrl+K now also finds a device by its kind and its rack's name, as Find a device did); `PATH_KINDS` (editor/
  pathTool.ts) for the click-drawn tools; `toolName()` (ui/toolGroups.ts); the Workspace's openSettings / openWindow
  take `SettingsTab` / `WinId` (details, company, members and walkthrough, tips now too). Was: Find matching differs between FindDevice and Ctrl+K (navTree), the rear-face rule copied in both;
  the path-tool id list (`line / trunk / conduit / wall`) in 3–4 places; the tool display-name expression ×4;
  `SettingsTab` / window-id unions restated in workspace.svelte.ts (already missing details / company / members).
- **Timers / polling** — FIXED 2026-10-18 except the polls: Title block… asks Settings to show the section (a
  `scrollTo` request; the heading's action scrolls after one `tick()` — the dialog moves itself to the shell's root as
  it opens), not two shell `tick()`s and a `getElementById`; the riser view refits in its effect (`prims` is derived —
  no microtask). KEPT: backups' 100 ms and the restore countdown's 250 ms polls — they wait on a clock or several
  unrelated states, only while a backup / restore runs; a reactive wait would hang on any one that isn't reactive.
  **Global state** — FIXED: Z's chord time is `ws.zoomChordAt` (per shell), not a shellKeys module variable. Was: a double `tick()` before scrolling Settings to the title block (CadShell ~176); 100 ms / 250 ms
  polls in app/backups.ts and restoreNotice; `queueMicrotask(zoomExtents)` in a ViewCanvas effect (~208).
- **Global state**: shellKeys' `zoomPending` chord state at module level.
- **Strings parsed for structure** — FIXED 2026-10-18: `pageKey` / `parsePageKey` (app/pdf.svelte.ts) build and read
  `fileId#page` everywhere; outletPortCells keeps the far ends' devices instead of splitting `device:port`; the
  viewport picker's choices carry their views (`viewChoices`; the key is only compared — a view it doesn't list shows
  itself, not a blank); issueGuard joins a frozen copy's parts and reads its image references (`copiesDrawing`, tested)
  — the review's prefix false positive wasn't real (the needle ended in `#`), but a reference cut between two parts
  was missed, so a file an old release draws could be deleted. Was: `${fileId}#${page}` built and split in 6 places; `${dev}:${port}` split in
  overlays.ts; SheetProps' viewport picker splits `key.split(':')` (an unknown key → a row spec with `spaceId: ''`);
  app/issueGuard.ts finds file use by substring search over serialised JSON (id-prefix false positives).
