# Pages tool — changelog

A readable, curated history of the major milestones (R11). For the exact, per-commit record use
`git log -- 'src/routes/projects/[pid]/pages/'`; `todo.md` keeps the long historical done-log and the
open items; `review.md §0a` tracks which review findings are closed.

## Parity pick-list, small items (2026-09-25) — parity-review.md
- **Nav bar Pan / Orbit** are latched tools: a left drag (or one finger) pans / orbits; Esc, a right-click or a
  tool pick drops them.
- **Title block**:
  - a company block (name / address / contact);
  - Show toggles (logo / company / fields);
  - an optional printed margin border;
  - a per-sheet "shown on this sheet" switch;
  - frames snap to the drawing-area and title-block edges.
- **Sheets**: viewport labels print and have an editable Label; Ctrl/Shift-click sheets in the tree and drag
  them as a block; PageUp / PageDown page-pan the sheet.
- **Annotations**:
  - line text labels (start / middle / end);
  - a callout frame (box / underline / none);
  - type a dimension's length.

  The Sheets import keeps all three.
- **Editing**:
  - repeat clicks step down through overlapping shapes;
  - copied outlets get the next free label;
  - model objects Ctrl/Shift-click multi-select and move together;
  - shared layer / colour / base Z / height edits;
  - a model object's own colour;
  - greyscale images.
- **Layers**: the active layer can't be deleted; a layer with items asks, then takes them with it. Nothing is
  drawn onto a hidden or locked layer.
- **Keys and prompts**: `+` / `-` / Home zoom keys; a point count while drawing a run.
- **Refactor**:
  - `PropertiesPanel` is a dispatcher over `parts/props/` (Frame, ModelObj, ModelObjs, Place, Page, Ent, with
    shared `props.css` + `fields.ts`);
  - `docEdit.svelte.ts` holds the document edits (out of `+page`);
  - `projectImports.svelte.ts` holds the phase-8 imports (out of `pagesProject`).

## Drawings, models, places (2026-09-24) — drawings-plan.md phases 1–5
- Places, stored models (`projects/{pid}/models`) and sheets (registry `toolType 'pages'`); floorplan PDFs as
  image shapes; a global **Blocks** library with `insert` shapes; **Outlets import** (outlets → block inserts,
  trunks → conduits) per place; model views restored on reload; a click opens any place with a model.
- **Title block** (phase 5): one template per project (`pages.titleBlock`), auto-filled per sheet (project,
  title, location, Dwg №, rev, date, scale, size, drawn); edited in a sheet's page Properties.
- **Drawings dialog** (phase 6): sheets register (search, filters, grouping, sort, inline + bulk edit, renumber
  patterns, tags, archive, Excel export), archived list with restore / hard delete, and a Models tab (usage,
  archive / restore, frames showing a Missing model).
- **History** (phase 7): model versions (1.0 first; majors keep a full copy you can restore, minors are notes;
  "edited since" by content hash), sheet revisions (Issue rev N / Overwrite rev N, blocked until every model is at
  an unedited major — with Overwrite / Open per model), title block rev + date from the latest issue, draft
  packages of issued sheets. The mock revisions are gone.
- **Sheets import** (phase 8): a Sheets-tool sheet → a Pages sheet in a chosen place (drawings dialog › Import
  from Sheets), or another tool's register drawing → a one-frame Pages sheet (tree ⋮). Outlets viewports keep
  their scale + framing on the place model, with their annotations (text, lines, dims, rects / clouds, ellipses,
  callouts, images, outlet symbols as block inserts) scoped to the frame; unmappable viewports show "Not mapped
  yet"; a note lists everything that didn't map.
- `+page.svelte` split: `pagesProject.svelte.ts` (project side), `history.svelte.ts` (undo timeline),
  `ui/clipboard.ts` — 1640 → ~1200 lines.

## Refactors — code-review 2 R-items (2026-09-22 → 09-24)
Work was split across sessions: one spec'd and diff-reviewed, one implemented, one live-gated each
commit in the browser (`review.md §0a` holds the gate records). The working notes were in `HANDOFF.md`,
now deleted; it's in git history.
- **R1 Viewport split** (`refactor-plan.md` executed, then deleted — it's in git history before this
  commit): `ui/Viewport.svelte` 2209 → 90 lines. Pure modules `annotations.ts`, `mapper.ts` (one layout
  read per event), `hit.ts` (+ `pickAt`), `grips.ts`, `snap.ts`, `place.ts`, `gestures.ts`
  (`beginPointerDrag` + `DragRegistry`), `render/EntRender.svelte`. Then two classes: `vpView.svelte.ts`
  (view model) and `vpInteraction.svelte.ts` (pointer/key state machine). Plus `vpPrompt.ts`, `vpTypes.ts`
  and `render/VpMarks`/`VpOverlays`/`VpWidgets`.
- **R2** `viewState.svelte.ts`, `doc.svelte.ts` (PageDoc) and one `session` object. **R3** one Selection
  model (`selection.ts`, per-viewport `editor.sel`, including frames). **R4** the mock `'box'` Ent removed (3D
  solids are model prisms) and `line` retired for a 2-point polyline. **R5** one layer model per model. **R6** `modelEdit.ts` store mutations; `VpOn` = view events,
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
  - elevation snap points sit on the drawn ground line, not in empty space (B22)
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
