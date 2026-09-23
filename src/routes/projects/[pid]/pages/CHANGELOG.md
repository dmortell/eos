# Pages tool — changelog

A readable, curated history of the major milestones (R11). For the exact, per-commit record use
`git log -- 'src/routes/projects/[pid]/pages/'`; `todo.md` keeps the long historical done-log and the
open items; `review.md §0a` tracks which review findings are closed.

## Refactors — code-review 2 R-items (2026-09-22 → 09-24)
- **R1 Viewport split** (`refactor-plan.md` executed, then deleted — it's in git history before this
  commit): `ui/Viewport.svelte` 2209 → 90 lines. Pure modules `annotations.ts`, `mapper.ts` (one layout
  read per event), `hit.ts` (+ `pickAt`), `grips.ts`, `snap.ts`, `place.ts`, `gestures.ts`
  (`beginPointerDrag` + `DragRegistry`), `render/EntRender.svelte`. Then two classes: `vpView.svelte.ts`
  (view model) and `vpInteraction.svelte.ts` (pointer/key state machine). Plus `vpPrompt.ts`, `vpTypes.ts`
  and `render/VpMarks`/`VpOverlays`/`VpWidgets`.
- **R2** `viewState.svelte.ts`, `doc.svelte.ts` (PageDoc) and one `session` object. **R3** one Selection
  model (`selection.ts`, per-viewport `editor.sel`, including frames). **R4** `line` retired for a 2-point
  polyline. **R5** one layer model per model. **R6** `modelEdit.ts` store mutations; `VpOn` = view events,
  plus an `Editor` for document edits. **R7** one projection path for render and edit. **R9** `+page`
  split (`Pane`, `ToolStrip`, `TabMenu`, `printing.ts`, the `Workspace` object).
- **R8-lite** `PaperPage` frames use the shared modules: `inBox`/`marqueeSelect` picking, `gripsLocal`
  resize, and `frameSnapDelta` paper-edge/margin/5 mm snap with Alt bypass. Full R8 (sheet = Viewport) is parked.
- **P1–P6** per-event mapper, hover via `pickAt` once per frame, history folding, cached iso pick faces and
  grips, and a pages-scoped pre-commit gate (`pnpm check:pages`).

## Features & fixes (2026-09-22 → 09-24)
- Bugs B19–B31 fixed. Highlights:
  - drag threshold + Properties remount (B19)
  - odd-sided prisms (B21)
  - Shift-press toggle (B25)
  - first section/guide lost behind the `$state` proxy (B26)
  - stable drawing ids (B18)
  - dark AutoCAD-style model space (B31)
- **K5** model corners/nodes are OSNAP targets.
- **VP Freeze**: hide a layer in one sheet frame only.
- Split view keeps the left pane.
- One rotate/Shift-15° rule for every handle.
- Rack tabs at 1:10 with an editable grid step.
- XP7/19/22/26/32/33: margins, custom + Fit scale, viewport lock, frame mm, line types, line-end heads.
- **Real project data**:
  - File › Open Project (Ctrl+O)
  - project tree from Firestore, with buildings (create, drag floors, reorder)
  - Properties that edit project/building/floor/zone/room names
  - clicking a floor opens its model with the calibrated floorplan PDF on a Background layer
  - the last tree item is restored on load
- Zoom up to 2000 % everywhere (one clamp in `constants.ts`).

## Code-review 2 fixes (2026-09-22)
- **B1** svelte-check green (dropped the instance-script type re-export).
- **B2** paper frames render true 1:N scale (`PAPER_PX_PER_MM`, not the mock `BASE`).
- **B3** annotative sizing — dims/text/arrows/clouds are a fixed size on paper (`paperMm`), not on screen.
- **B4** one global undo timeline (per-tab history no longer reverts other tabs' edits).
- **B5** sections live in the model (`Model.sections`) — model-scoped + undoable.
- **B6** closing/reopening a tab keeps the page (document state keyed by drawing id).
- **B7/B9/B10** hit-testing follows paint order, one `tolMm` pick tolerance, tilted prisms pick/grip on their true silhouette.
- **B8** Edit-menu Cut/Copy/Paste/Delete wired.
- **B11/B12** removed the dead FrameSel path + other dead code/props/CSS.
- **B13** one nanoid id generator (`ids.ts`). **B14** fixed by B4. **B15** one home for the duplicated types (`types.ts`).
- **B16** the Layers panel can hide/lock model objects (walls/furniture/trunks).
- **R11** README file map + this changelog. **R1** started: `ui/annotations.ts` extracted.

## Capability milestones (earlier, from `todo.md` / model-plan)
- Ported the model3d engine into `3dview/` — a real 3D wall/conduit/prism model with plan/elevation/iso
  projection, hidden-line + shaded iso, section boxes driving live elevations.
- Data into the model: entities, guides and sections live in `Model`, shared across every view of a floor;
  undo rides one model snapshot.
- Multi-viewport paper space (draggable frames, per-frame scale/projection/clip), split panes, a drawing
  navigator, a title block, and a model registry (a floor + a rack as separate models in one sheet).
- Real dimensions (arrows + extension ticks + measured length), revision clouds, callouts, arrows.
- Grid + object snap, rotated-shape grips (provably fixed anchor), per-axis (X/Y/Z) prism rotation with
  rotate handles in plan + elevation, elevation depth-snap for drawing conduits across views.
- Image underlays with origin/scale/crop calibration; layers with groups + view presets.
- Touch: 1-finger draw/select, 2-finger navigate, pointer capture (the reference touch model in the app).
- Object styling (colour/weight/layer), copy/paste, group/ungroup, z-order, tool fly-outs with touch parity.
