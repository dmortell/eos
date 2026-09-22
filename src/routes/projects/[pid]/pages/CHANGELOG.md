# Pages tool — changelog

A readable, curated history of the major milestones (R11). For the exact, per-commit record use
`git log -- 'src/routes/projects/[pid]/pages/'`; `todo.md` keeps the long historical done-log and the
open items; `review.md §0a` tracks which review findings are closed.

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
- **R11** README file map + this changelog. **R1** started: `ui/annotations.ts` extracted (see `refactor-plan.md`).

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
