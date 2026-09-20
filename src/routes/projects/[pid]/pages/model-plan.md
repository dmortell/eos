# Pages — real 3D floor MODEL + sections plan

> **Decisions (Dave, 2026-09-20):** keep Pages' own editor; import the geometry engine into a new
> **`pages/3dview/`** subfolder (Decision 1B). Each viewport references the relevant **model** for the
> floor shown (Decision 2). **Fake outline-gap openings** for now (Decision 3). **Multi-direction
> sections** yes. The **mock box** (`ui/geometry.ts` `box`) will be retired once the model lands.
> **P1 DONE (2026-09-20):** ported `types/graph/projection/migrate` into `pages/3dview/`; added
> `models.svelte.ts` (in-memory registry, seeded demo floor = walls + furniture + a rect trunk);
> `Model3d.svelte` renders a model's projected outlines (per-layer colour) into the viewport. Wired
> into `ui/Viewport.svelte` for the plan view. Verified in-browser: walls render as a mitred
> double-line ribbon, furniture + trunk as footprints.
> **P1b DONE (commit 7d55bcd):** the model renders in the four elevations + iso via one per-direction
> group transform (plan identity, elevation `translate(ox,ground) scale(1 -1)`, iso `translate(0,2cy)
> scale(1 -1)`); lineweight is non-scaling + layer-defined. Mock box retired (commit ab44a31).
> **P2a/P2b DONE:** prism **pick + move in the PLAN *and* the four ELEVATION views** — shared `modelSel`
> (models.svelte.ts, global to the model), amber highlight in every view (Model3d `selIds`), body-drag
> mutates the store in place. Editing reuses the SAME projection Pages entities use (`projU`/ELEV_BASIS +
> GROUND), so a prism picks/moves exactly where Model3d draws it: plan = footprint (dx,dy); elevation =
> the silhouette face, horizontal drag → on-axis position (× sign), vertical drag → z (base elevation,
> clamped ≥0). Verified in-browser (select in plan + front, move both axes, cross-view via the store,
> deselect). **Gaps still open in P2:** **rotate** prisms; **walls/conduits** graph
> editing (node-drag, junctions, per-seg thickness); **placement** (draw new); **iso** editing (deferred
> to the 3D camera). **P2c DONE — prism resize grips:** 4 corner Handles on the selected prism (footprint
> in plan, silhouette face in elevation); dragging a corner resizes about the fixed opposite corner
> (`applyPrismGrip`, anchor captured at grip-down); plan edits x/y/w/d, elevation edits on-axis size (via
> projUInv) + z/h. Verified in-browser (plan footprint grew about the top-left corner; elevation top grip
> raised height with the base anchored on the floor).
> **P2d DONE — model UNDO/REDO:** model edits now join Pages' per-doc history. Each `HStep` also snapshots
> the shared model (`snapModels`); a model gesture routes through the active doc's timeline via a new
> `on.modeledit` callback (begin/modeledit/end folds it into one step), and `beginGesture` seeds the
> baseline BEFORE the store mutates. `applyPtr` restores the step's model via `setModels`. KEY BUG fixed:
> `setModels`/`snapModels` must unwrap the stored proxy with `$state.snapshot`, NOT `structuredClone` —
> the step's model lives inside the `$state` history tree, so it's a Svelte proxy and `structuredClone`
> throws `DataCloneError` (undo silently no-op'd). Verified in-browser: move a desk → Ctrl+Z restores it.
> Next slice: walls (graph editing).


Goal: in Pages, draw a floor's **model** (walls, openings for doors/windows, furniture as boxes/holes,
horizontal + vertical pipes and rectangular trunks), then cut **section boxes** to generate elevation
views — all from ONE 3D model, projected per view. Most of the engine already exists in
`sheets/tools/model3d/`; this plan is mostly a **port + adapt**, plus a few genuinely new pieces.

Grounded in a full read of `edit3d/` and `sheets/tools/model3d/` (see the code map, 2026-09-20) and the
Pages decisions in `todo.md` §4 (imported files), §5 (model registry), §8 (drawing tree), §11 (tools).

---

## 0. TL;DR / decisions needed up front

- **Borrow from `sheets/tools/model3d/`, NOT `edit3d/`.** model3d is the mature fork (graph walls/conduits,
  per-segment profiles, junctions, sections, undo, groups, layers, DXF). edit3d is the frozen playground —
  read only its `merge-analysis.md` for narrative.
- **Lift these PURE files nearly verbatim** (no Svelte/state deps): `projection.ts`, `graph.ts`, `types.ts`,
  `migrate.ts`. These are the whole projection + geometry engine.
- **◧ DECISION 1 — the editor host.** model3d's editor (`model3d-editor.svelte.ts`) extends the Sheets
  `edit/` base (`SurfaceEditor`, `History`, `SelectionCoordinator`, `armHotkey`, the `SheetViewport` host).
  Pages has its OWN parallel stack (`ui/Viewport.svelte`, per-doc history in `+page.svelte`, `layers.svelte.ts`,
  `ui/geometry.ts`). Two options:
  - **(A) Reuse the Sheets `edit/` base classes in Pages.** Least new code for the editor, but couples Pages
    to Sheets' host types and its client↔mm CTM mapping (Pages uses `getBoundingClientRect`, not
    `getScreenCTM`). Risk: two coordinate/selection systems to reconcile.
  - **(B) Keep Pages' own editor/host; port only the GEOMETRY methods** (draw/edit prism/wall/conduit) onto
    Pages' Viewport + history. More glue, but Pages stays self-consistent (its mm space, its layers/undo,
    its ELEV_BASIS which already matches model3d's BASIS).
  - **Recommendation: (B).** Pages' projection convention, mm units, layers, undo, groups and copy/paste
    already exist and are tested; the expensive part (projection.ts/graph.ts) is pure and drops in. Bridging
    the geometry-editing methods onto Pages' `Viewport`/history is smaller and less entangling than importing
    the Sheets host. Revisit if the editor glue balloons.
- **◧ DECISION 2 — model vs page.** A **model** (a floor's 3D) is a separate, project-level store; a **page**
  is a sheet of viewports, each viewport referencing a model + view config. This is exactly §5 and exactly how
  Sheets already works (`ViewportSource {kind:'model3d', modelId, direction, clip}`). Adopt it.
- **◧ DECISION 3 — what's a "tab" in Pages?** Today a tab == a doc of mock entities. New model: a tab is
  either a **model editor** (draw the floor's 3D) or a **sheet** (paper + viewports onto models). The current
  plan/elevation/3D tabs collapse into: one **model** with plan/front/…/iso VIEWS of it (the ViewCube already
  switches direction). Keep annotations (the `space`-tagged 2D objects from the elevation-annotations v1) as a
  per-view layer ON TOP of the model projection.

---

## 1. Data model — reuse model3d's types (mm)

Lift `sheets/tools/model3d/types.ts` into `pages/model/types.ts`:
- `Prism` (box: x/y/z + w/h/d + `edges` (4=box, 16/24=cylinder) + `rot`).
- `Wall` (graph: `nodes: GNode[]`, `segments: WallSeg[]` with per-seg `thickness`/`h`; defaults `h`/`thickness`).
- `Conduit` (graph: `nodes/segments` with per-seg `w`/`h`/`edges`; **edges 4 = rectangular trunk, 16/24 = round
  pipe** — the rect-vs-round ask is already covered by edge count).
- `Obj = (Prism|Wall|Conduit) & { layer?; id?; groupId? }`, `Layer`, `Underlay`, `Levels`, `Dir`, `Clip`,
  `SectionInfo`, `BASIS`. Also `graph.ts` (runs/junctions), `migrate.ts` (`polyToGraph`, id backfill).

Pages already stores real mm and shares the ELEV_BASIS/axis convention, so units + projection line up. Pages'
existing mock `box`/2D `Ent` stays for **annotations** (the `space`-tagged elevation labels), which live
alongside the model — the model is the geometry, `Ent`s are the markup.

New types to ADD (gaps — see §5):
- `Opening` (door/window/hole): `{ type:'opening', wall?: id, x,y,z, w,h, kind:'door'|'window'|'hole' }` on a
  wall plane; renders as an outline gap.
- `furniture`: start as plain `Prism` on a "Furniture" layer (no new type); revisit with blocks.

## 2. Projection & render — port `projection.ts` + `Model3dRender`

- `projection.ts` is pure; drop it into `pages/model/`. It gives `project(obj, dir, yaw, pitch, cx, cy) →
  Shape[]` (outline polylines/polygons), `faces3d`/`edges3d` (iso), iso `cam` + `isoDepthR` (painter's
  hidden-line), `trimToClip`/`modelBounds`/`modelZRange` (section culling + framing), `wallOffsets/wallBoxes`
  (mitred walls), `conduitRings` (swept pipe/trunk), whole-mm snapping.
- Port `Model3dRender.svelte` into a Pages component that renders a Model into the current view (plan/elev/iso)
  INSIDE `ui/Viewport.svelte`'s SVG group (real mm; the group transform + dscale already exist). Outline-only
  polygons in ortho; sorted white faces in iso; level datum lines from `Levels` in elevations; per-object
  colour from its layer; per-viewport layer visibility from Pages' layer store.
- Replace the mock backdrop/`boxFaces` iso with the real projection for MODEL content (keep the decorative
  backdrop only until a real model exists). The ViewCube already sets the direction.

## 3. Editor — port geometry methods onto Pages' Viewport (Decision 1B)

Reuse the pure geometry; reimplement the thin editing glue on Pages' host:
- **Placement:** `startPlacing('prism'|'wall'|'conduit')` → press-drag box (prism) / click-points (wall,
  conduit; Shift 15°, ⏎/dbl-click finish, Esc cancel). Build via `polyToGraph` with defaults (wall
  h=2800/thick=100, conduit 80×80 edges=16, prism 600×600×750). New objects on the active layer.
- **Selection/handles:** id-keyed selection (model3d already uses ids, not indices — Pages' selection is id-based
  too). Corner/rotate resize for prisms; path-node drag / insert-midpoint / extend / disconnect / delete-node
  for wall+conduit graphs (`graph.ts`); per-segment profile edits + multi-segment select. Reuse Pages' marquee,
  group, nudge, copy/paste, undo (per-doc history) — wrap each gesture in `beginGesture`/`endGesture` so it's one
  history step (Pages already does this).
- **Panels:** a Pages "Object" panel mirroring `Model3dEditPanel` — place buttons, per-type numeric props
  (X/Y/Z · W/H/D already the Properties layout), per-segment list, section/opening editors.
- **Vertical runs:** conduit/trunk z is edited in an ELEVATION view (each view's BASIS exposes its two in-plane
  axes; plan can't change z). Add a small "route vertically" affordance / height field so it's discoverable
  (gap noted below).

## 4. Sections → elevations

Port the section flow (`model3d-editor` sectionMode + `Model3dViewport` wiring):
- **Draw** a rectangular clip box on the plan (`startSectionMode` → rubber-band x/y rect; z auto-grown to the
  slab `Levels` for plenum headroom via `modelZRange`).
- **Spawn** a new viewport whose source = `{ model, direction:'front', clip, hiddenLines:true }`. In Pages this
  is a new sheet viewport (paper) OR a new elevation tab of the same model.
- **Markers:** existing section boxes show as editable markers on the plan (move/resize/relabel/re-direction/
  delete), via a `sections` provider over the sheet's model viewports (`trimToClip` for the cut).
- **◧ GAP — multi-direction sections.** A `SectionInfo` has ONE `direction` today. The user wants "one (or more)
  view directions" per box. Extend to `directions: Dir[]` (spawn one viewport per direction sharing the clip),
  or keep one-per-viewport and let a marker list its sibling directions. Recommend `directions[]` on the marker,
  fanning out to N viewports.

## 5. The gaps (net-new work, in priority order)

1. **Openings / holes (doors, windows, holes)** — biggest gap; nothing exists (no CSG). Near-term the user only
   needs "boxes and holes" for line drawings. **Recommendation: an `Opening` object (owner wall + rect on the
   wall plane, `kind`).** Render as an outline gap in ortho (the render is already outline-only — a nested
   outline reads as a cut without real subtraction) and a face gap in iso. Door = opening + a swing arc (a 2D
   arc annotation); window = opening + sill/head lines. TRUE boolean CSG (carving `wallBoxes`/`faces3d`) is a
   large, separate effort — defer.
2. **Furniture** — start as `Prism` on a "Furniture" layer; upgrade to block instances later (blocks are already
   a separate Pages todo).
3. **Rectangular-trunk UX** — capability exists (`edges=4`); add a "Trunk (rect) vs Pipe (round)" toggle in the
   conduit panel that sets edges 4 vs 16, plus w/h fields.
4. **Multi-direction sections** — §4 gap.
5. **Vertical-run editing from plan** — add a height/z affordance so routing a drop doesn't force a view switch.
6. **Blocks / reusable instances** — none exist (Sheets copies geometry). Future; unblocks real furniture/doors.

## 6. Storage & the model registry (aligns with §5 + §12)

- Reuse the pattern: a single project doc **`models3d/{pid}` = `{ models: Model[] }`** (mirrors Sheets'
  `ModelStore`), `$state`-reactive, debounced 500ms save, de-duped by JSON. A `Model` = `{ id:number, name,
  objects, layers?, underlays?, levels? }`. Numeric ids.
- Pages viewport/tab references a model by id + `{ direction, scale, clip, layerOverrides }` — the §5 model
  registry, realised. A **page** stays its own doc; it holds viewports pointing at models. This keeps "one sheet,
  viewports of different models" (the §5 requirement) and per-floor model reuse.
- Watch the **1 MiB doc limit**: a floor of walls/furniture/trunks is fine as one doc for now; if a model gets
  heavy, split to a subcollection with fractional order keys (see the clipboard/order notes) — not needed yet.

## 7. Drawing-tree integration (§8)

- A **floor** node (e.g. "33F") owns a **plan model** (the 3D). Its child leaves are VIEWS of that model: Plan,
  Front/Rear/Left/Right elevations (from sections), 3D. Opening a leaf opens a tab bound to `{ modelId,
  direction, clip }`.
- Elevations created by a section box appear as new leaves under the floor. Detail views (rack elevations,
  frames, patching) reference their OWN models (§11) — the registry handles many model kinds.

## 8. Suggested phasing (each phase shippable + testable)

- **P1 — Model foundation.** Port `types.ts`/`graph.ts`/`projection.ts`/`migrate.ts`; add a `models.svelte.ts`
  store (in-memory first, Firestore later). Render a seeded model (a prism) in Pages' plan view via a ported
  `Model3dRender`. No editing yet. *Test: a box model renders in plan/front/iso, projected correctly.*
- **P2 — Draw prisms + walls.** Placement + selection + resize/rotate for prisms; graph walls (draw, node-drag,
  junctions, per-segment thickness/height, mitre). Undo via Pages' history. *Test: draw a room of walls with
  clean mitred corners; edit thickness.*
- **P3 — Conduits/trunks + vertical runs.** Conduit graph, round vs rect toggle (edges), per-seg w/h, vertical
  routing in an elevation. *Test: a horizontal trunk + a vertical drop, shown in plan + elevation.*
- **P4 — Sections → elevations.** Draw a clip box on plan → spawn a front elevation viewport; editable markers;
  multi-direction fan-out. *Test: one section box drives front + right elevations that update with the model.*
- **P5 — Openings (doors/windows/holes).** `Opening` type on walls, outline-gap render, door swing / window
  lines. *Test: a door + window cut a wall's outline in plan + elevation.*
- **P6 — Storage + registry + tree.** Firestore `models3d/{pid}`; wire the model dropdown on viewports (§5);
  floor→model in the drawing tree (§8).
- **Later:** blocks/instances (real furniture, parametric doors), true boolean CSG, DXF export (already exists in
  model3d), underlays (PDF/DXF import, §4).

## 9. Open questions for Dave

1. **Editor host (Decision 1)** — reuse Sheets `edit/` base classes, or keep Pages' own editor and port only the
   geometry methods? (Plan assumes the latter.)
2. **One model per floor, or per discipline?** (§5/§11 hint at multiple models per floor: architectural, trunks,
   racks.) Does a floor's plan = one model with layers, or several linked models?
3. **Openings** — fake outline-gaps now (fast, line-drawing-correct) vs. invest in real boolean CSG (needed for
   true 3D / quantities)? Plan assumes fake-now.
4. **Multi-direction sections** — `directions[]` on one marker fanning to N viewports, OK?
5. **Do we retire the mock box** (`ui/geometry.ts` `box`) once the real model lands, or keep it for quick
   sketches? (Annotations `Ent`s stay regardless.)
