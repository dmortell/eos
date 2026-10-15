# Pages tool: analysis, improvements and a clean-start plan

*Written 2026-10-01 against `main` @ 9cc6587e. Scope: `src/routes/projects/[pid]/pages/`, plus the legacy tools
it is meant to replace (Outlets, Elevations/Racks/Frames/Patching, Risers, Sheets, Drawings, Packages, Fill rate).*

---

## 0. Summary

**Pages is impressive, and too big for what it delivers in the domain.** In 14 days (17 Sep – 1 Oct) it took
**579 commits**. It grew from ~6.5k lines (at review 2, 2026-09-20) to **~27.5k lines of code plus ~7.4k lines of
tests** (92 test files, 798 tests, all passing). That is **2.4 MB of source**, three times the size of the Sheets
tool it replaces. It also carries **3.7k lines of Markdown** (todo, review, changelog, six plans).

It is complicated for three reasons, and none of them is that the problem itself needs this much code:

1. **Scope.** It is trying to be four products at once:
   - **AutoCAD**: 114 commands, a command line, TRIM / EXTEND / OFFSET / HATCH, F-keys, polar tracking, DXF.
   - **Revit-lite**: walls, openings, sections and elevations at any angle, hidden-line removal, iso / perspective,
     an OSM site view.
   - **A document manager**: register, tags, tree views, versions, revisions, packages.
   - **A structured-cabling tool**: outlets, trunks, racks, panel allocation.

   The last one, which is the reason the app exists, is the **thinnest**:
   - Outlets are block inserts with string attributes (`attrs.LABEL`, `attrs.PORTS`).
   - Ports, cables and BOM lines don't exist as data.
   - There is no BOM and no patch list.
   - Panel allocation is a third, disconnected label store.
2. **Growth by accretion.** Each request landed as a patch on whatever code was nearest. Design reviews happened
   after the fact (`review.md` is 1,177 lines of findings), and comments carry ticket archaeology ("R3 commit 2a",
   "B29", "eos-07"). The result:
   - **Four** vocabularies for tools.
   - **Four** ways to mutate the document.
   - **Seven** selection kinds.
   - **~10** coordinate systems.
   - **Three** hidden-line methods.
   - **~15** module-level singletons.
   - A 1,800-line `+page.svelte` that hands a ~60-member callback bundle down the tree.
3. **The wrong centre of gravity.** The architecture centres on *drawings* (sheets → viewports → a generic geometric
   model) instead of *project data* (outlets, ports, racks, links, containment) with drawings as generated views of
   it. So every domain feature has to be faked in geometry and attributes, and every report (schedule, BOM, patch
   list) has to reverse-engineer them back out of shapes.

**My recommendation** is a **clean kernel built alongside, not a big-bang rewrite**:
- **The new design:**
  - **Domain data first**: typed entities with stable ids, stored one document per entity.
  - **Drawings are generated views** of that data, plus a thin layer of annotations.
  - **A small editor kernel**: one tool interface, one input router, one undo built on operations, one display list
    shared by screen, print and DXF.
  - **2.5D, not 3D**: everything has a z, and elevations are generated. An optional read-only three.js viewer can
    come later.
- **What to keep:** a lot of what exists is worth porting, especially the ~90 pure, tested modules and the legacy
  tools' domain engines. §5 lists them.
- **How to deliver:** in vertical slices, each of which retires a legacy tool (§7).

Open questions that change the plan are in §9.

---

## 1. What is there today

### 1.1 Size and shape

| Area | Files | Notes |
|---|---|---|
| `+page.svelte` | 1 | 1,802 lines / 141 KB. Shell, tabs, panes, activation, section management, clipboard, menus, keys, tool tables, printing, wiring |
| `pagesProject.svelte.ts` | 1 | 845 lines. Tree, places, models, sheets, title block, versions, imports, packages, the drawings dialog, and a 17-member host bundle |
| `ui/` | ~110 | Interaction (`vpInteraction` 94 KB, `vpView` 50 KB), commands (`cmdScripts` 50 KB, 57 scripts), snap / grips / hit / geometry, render |
| `3dview/` | ~25 | Engine ported from `sheets/tools/model3d` on 09-20. `projection.ts` has grown 471 → 810 lines since |
| `store/` | ~40 | Firestore schema, mappers, saver, places, tree views, versions, importers, allocation, schedules |
| `parts/` | ~45 | Panels and dialogs (`DrawingNavigator` 58 KB, `EntProps` 40 KB, `PaperPage` 39 KB, `HelpDialog` 38 KB) |

### 1.2 Persisted data (Firestore)

| Location | Holds | Write |
|---|---|---|
| `projects/{pid}.pages` | places[], titleBlock, settings, drawingDefaults, treeViews | whole object, merge |
| `projects/{pid}/drawings/{id}` (`toolType:'pages'`) | registry fields, plus paper, frames[] (viewports), revLog, tags | merge (a merge never deletes, hence the `''` workarounds) |
| `projects/{pid}/models/{id}` | **the whole model**: objects (prisms / walls / conduits), shapes (annotations), guides, sections, layers, levels | whole-doc replace, debounced 500 ms |
| `…/models/{id}/versions/{v}`, `…/drawings/{id}/versions\|revisions` | version / issue snapshots | replace |
| `blocks/{id}` (**global, every project**) | block definitions | direct save |
| `settings/pagesTags` (global) | tag vocabulary | transaction |

---

## 2. Findings

### 2.1 Architecture and state

- **God shell.** `+page.svelte` has 32 `$state`, 19 `$derived`, 20 `$effect` and 84 functions:
  - It owns tabs and panes, viewport activation, view state, frame CRUD, section management, the clipboard,
    menus, the keyboard, five tool lookup tables and printing.
  - Panels get ~50 props, many as inline lambdas holding logic.
  - Panes get a `Workspace` object of ~60 accessors, kept as a plain const with getters because a `$derived` version
    rebuilt it on every status-text change.
- **God project object.** `PagesProject` (845 lines, ~60 members) reaches back into `+page` through a 17-member
  `ProjectHost`, and `ProjectImports` and `PagesProject` reference each other.
- **~15 module-level `$state` singletons** live for the whole browser session and leak across projects (review B17):
  - `models`, `docs`, `viewState`, `selStore`, `layerUI`
  - `cmdBus`, `imgEdit`, `cptPick`, `walk`, `outletSticky`, `textDialog`
  - the tool specs (`sectionSpec`, `openingSpec`, `dimSpec`, `trunkSpecs`)

  `cmdBus.target` is set by whichever `$effect` ran last, so who owns it depends on effect order.
- **Mock data is still live:**
  - **Demo models in the registry.** It starts with demo models (`3dview/models.svelte.ts:11`:
    `$state(migrateModels(demoModels()))`).
  - **`'m1'` fallback.** `FLOOR_MODEL_ID = 'm1'` (the demo 33F) is the fallback in 15 places.
  - **Mock types and controls.** `mock/data.ts` supplies the `NavNode` types for every tree module and the title
    bar's Package / Version / Revision selectors.
  - **Mock layer template.** New place models get the mock layer template.
- **Many copies of the same data:**
  - **A model is held 3–4 times:** the Firestore doc, the `PagesStore.models` raw copy, the live registry proxy,
    and up to 100 history snapshots. `ensurePlaceModel` has to reconcile when "the registry can lag the store".
  - **Sheet frames are held 3 times:** `PagesSheetDoc.frames` in mm with field `direction`, `PageDoc.frames` in
    paper px with field `proj`, and the history snapshots.
  - **The project doc and the drawings collection are each subscribed twice.**
  - **There are two trees** (the old-tools tree and the place tree), each with its own Properties path.
- **Sheet annotations are stored on models.** A viewport-only note is a model shape with `space:'view:<frameId>'`,
  so duplicating, pasting or deleting a sheet has to walk every model. The same reverse dependency appears in
  `Layer.onlyIn`, where a model layer lists sheet frame ids.

### 2.2 Undo and saving

- **Undo snapshots the whole world.**
  - **What a step holds.** Every step stores a deep `$state.snapshot` of *every model in the registry* (every stored
    model of the project, plus the demos) and all frames of every loaded sheet. Up to 100 steps.
  - **Cost.** Memory is about 100 × the project's total model data, and each step costs O(project).
  - **Amendments.** Out-of-band changes (async floorplan attach, live calibration) are patched into every step
    afterwards (`amendModel`).
  - **Remote edits are lost.** Undo after a colleague's edit puts your snapshot back over theirs, and autosave then
    writes it.
  - **Not undoable:** paper and scale changes. Layer visibility and lock toggles also mutate the model proxies
    directly (`LayersPanel.svelte:38,66,68`) with no history step, so the next undo silently reverts them.
- **Saving is O(all models) per edit.**
  - One `$effect` re-runs on any deep change to any model, then snapshots and queues every stored model.
  - Each queued model is serialised in full.
  - `saveModel` replaces `ps.models`, which re-runs every `$derived` that reads it.
- **Collaboration granularity is a whole model.**
  - **Lost edits.** Two people editing different outlets on one floor overwrite each other (last write wins on
    the whole doc).
  - **Size cap.** The 1 MiB doc limit covers the model *plus every sheet's view annotations*. The todo already
    flags this as the reason to look at Turso.
- **Layer visibility is document data**, so hiding a layer hides it for everyone.
- **`img:` image keys are session-only** (`imageStore.ts`). They are the fallback when an upload fails, and after a
  reload the stored model points at nothing.

### 2.3 Interaction layer

- **Tools are bare strings.**
  - **Counts.** There are 29 TOOLS entries, 18 real tool states, 7 pseudo-tools that run commands, and 7 "variants"
    that set a global spec.
  - **Vocabularies.** Tools are named in four separate maps (TOOLS / STRIP, TOOL_VARIANT, MENU_TOOL / TOOL_LABEL,
    TOOL_CMD / CMD_TOOL) and in the sets DRAW / POLY / MODEL_TOOL.
  - **Branching.** There are 73 `tool === '…'` comparisons across vpInteraction, vpView, render, prompt and place.
    The same per-tool facts are written again in `place`, `acceptDraw`, `drawPrompt`, `readout`, `onClick`,
    `onDown`, `cursorStyle` and the preview.
- **Side modes on top of the tool:**
  - `navMode`, `acadMode`
  - `imgEdit.mode`, `cptPick`, `walk`, `placeBlock`
  - `cmdBus.pick`, `editText`, `viewPreview`, `secAsk`
  - the paper's own `placing`
- **`onDown` and `onClick` split one gesture between them.**
  - `onDown` (~90 lines) is a ladder of guards followed by a 9-level pick cascade.
  - `onClick` (~80 lines) does the actual selecting.
  - They coordinate through instance flags: `suppressClick`, `shiftPressId`, `pressedSection`, `selAtPress`,
    `lastClick`.
  - The bug-fix comments (B25, B29 "swallow the trailing click") come from that split.
- **Paper and viewport are two interaction engines.** Each has its own drag registry, marquee, grid, window key
  handlers, command target and drafting gesture. `altToVp` synthesises Wheel / Pointer events into the child
  viewport.
- **Four mutation paths:**
  - `Editor.ents.*` (immutable replace)
  - in-place mutation of `v.mdl` with `begin` / `mark` / `end`
  - `modelEdit` functions
  - `docEdit` / the command target

  In-place mutation of model proxies is why object projections can't be cached by identity (shapes can be).
- **Rendering is all SVG, and every sheet frame is a full Viewport** with its own projection of the whole model:
  - N frames means N whole-model renders.
  - Zoom re-runs every entity's style, because `entStyle` includes `gripSize`, which depends on zoom.
  - Iso is projected twice, once to paint and once to pick.
  - There are 28 window listener registrations.

### 2.4 Geometry / 3D

- **It is 2.5D, with one truly 3D feature.**
  - Walls are extruded polylines and boxes are vertical extrusions; tilt is rare.
  - Conduits are genuine 3D polylines, swept as tubes.
  - There is no CSG and no depth buffer.
- **Hidden lines use three methods:**
  - an exact vector algorithm for elevations, O(E·F) worst case, uncached, rerun on every edit
  - painter's sort by average depth for iso, which is wrong for long walls next to small boxes
  - painter's sort by −z for plan
- **Openings are prisms on a flagged layer**, matched to walls by footprint overlap. Moving a wall leaves its doors
  behind.
- **~10 coordinate systems:**
  1. Model mm (y-down)
  2. Engine (u, v-up)
  3. Drawing mm
  4. Clip-local and hidden-line view space
  5. Iso camera
  6. Viewport (BASE / dscale)
  7. Paper (`PAPER_PX_PER_MM`)
  8. DXF (y-up)
  9. Three z datums
  10. OSM metres

  On top of those:
  - **Four angle conventions** and duplicate basis tables (`BASIS`, `ELEV_BASIS`, `DIR_T`, plus Sheets' `BASIS`
    with the opposite signs).
  - **Elevation drawing coordinates bake in constants:** `GROUND = 10250`, `PLAN_CX/CY = 14000/8750`. Annotations
    drawn in an elevation are stored in those coordinates.
  - **Sign bugs.** Today's commit 7c589c65 fixed mirrored LEFT / RIGHT and back-to-front hidden lines. It touched
    **8 test files that had pinned the wrong output**: tests written as "pin today's behaviour" locked the bug in.
- **Regression from 7c589c65 (fixed in f10f2dd0, which made the rack front the +y face and added a semantic
  test):**
  - Front now looks along −y, from the +y side (`geometry.ts:254-256`).
  - But `rackPlan` still draws the rack's FRONT line on the −y side (`projection.ts:713`), and `racksImport.ts:44`
    puts front-mounted devices flush at y0, also the −y side.
  - So in a Front elevation with hidden lines on, the front devices are probably hidden behind the rack's near face,
    and the plan's front marker faces away from the Front view.
- **What 3D actually delivers for the stated goals:**

  | Goal | Delivered by the 3D model? |
  |---|---|
  | Rack elevations | **No gain.** U positions are turned into z, then projected back to boxes. Elevations / Racks already render racks parametrically, and better (U numbers, device faces). |
  | Wall elevations with outlets at height | **Not delivered.** In an elevation an outlet (a 2D shape with `z`) is drawn as an edge-on line: no faceplate symbol, not hidden by walls. |
  | Room elevations / sections | **Yes**, the strongest result. |
  | Trunks / conduits | Consistent plan / elevation / drops, but **no length takeoff or BOM**. Fill counts outlets by nearest conduit in plan, not by route. |
  | Risers | `storeyMap` is useful; a dedicated Risers tool already exists. |

### 2.5 Domain: the core problem

Nothing in the cabling domain is a first-class entity:

| Concept | Representation in Pages |
|---|---|
| Outlet | an `Ent` of type `insert`; a shape counts as an outlet if `attrs.PORTS != null`; mount type is inferred from the block id |
| Port | not an entity; its label is computed as `label + '.A'` (alpha only, no numeric style, no overrides) |
| Label | free text; `FF.Z.NNN-SPP` and the per-client `labelFormats` templates are not used |
| Rack / device / panel | `prism` with `rack: {…}` / `device: {…}`; `kind` is a free string |
| Panel allocation | `device.alloc[port] = {outlet, model, port, label}`, a **snapshot of the label** that goes stale on rename |
| Cable | not an entity; conduits hold `cables: {type, qty, d}[]` counts with no endpoints |
| BOM line | **does not exist** (no catalogue, no part numbers, no lengths) |
| Patch list / cords | **does not exist** (only placeholder links to the old Patching tool) |

**Pages also bypasses the agreed label model.**
- **What `archive/ux-plan.md` and `elevations-plan.md` decided:**
  - Frames port labels are canonical.
  - Outlets and Patching read them.
  - Everything links by id (`locationId`, `structuredLinks`, cords by `PortRef`).
- **What Pages does instead:**
  - It keeps its *own* places, outlet labels and panel allocation.
  - It imports from the legacy docs one way, with no sync.

  That is a fourth label store.
- **What already exists elsewhere.** The most complete domain implementation in the repo is not in Pages. It is
  `elevations/` (which already absorbed Racks / Frames / Patching; those routes redirect to it) plus the pure
  `$lib/elevation/*` modules (`labelTemplate`, `portmap`, `links`, `reconcile`, `trace`).

### 2.6 Process and documentation

- **Velocity outran design.** ~40 commits a day, several days over 100. The review and plan docs describe intended
  architecture (R1–R11, X1–X15, K1–K12) faster than it can be built.
- **The documentation is large and partly stale:**
  - The README still says "Mock — no Firestore yet".
  - `types.ts` says "y = north".
  - `model-plan.md` says openings aren't cut.
  - `frameAt`'s doc comment is now 180° off.
  - Comments are dominated by review and bug ids rather than intent.
- **Tests are plentiful** (798) but often pin current output rather than meaning, so they resist correct fixes, as
  in the mirror fix above.

---

## 3. What is good (keep or port)

- **The pure, tested modules**, all context-first (`ViewCtx`):
  - `snap.ts` (61 tests): OSNAP, polar, otrack
  - `hit.ts`, `grips.ts`, `place.ts`, `modify.ts` (OFFSET / TRIM / EXTEND), `geometry.ts`, `selection.ts`,
    `mapper.ts`
- **The best seams in the code:**
  - `gestures.ts` (`beginPointerDrag` + `DragRegistry`).
  - `ItemEditor` / `ItemSource` (`ui/itemEdit.svelte.ts`). One engine already serves shapes, 3D objects and paper
    frames.
- **The command system:**
  - `commands.ts`: a parser.
  - `CommandRunner`: async scripts that `await ask()`, where the answer can be typed or clicked, with ghost
    previews.
  - This is a good design to build every tool on.
- **Persistence pieces:**
  - `store/saver.ts`: debounce, echo suppression, pending-wins.
  - `store/schema.ts`: Firestore-stable names.
  - `store/mappers.ts`.
  - `store/versions.ts`: content-hash "edited since version".
  - Remote changes applied in subscription callbacks, not effects.
- **Geometry worth keeping:**
  - `ElevFrame` / `OClip`: any-angle view frames and clips, small and tested.
  - `graph.ts`, `graphJoin.ts`, `graphAudit.ts`, `connect.ts`: containment topology, exactly what cable routing
    needs.
  - The tube sweep and `storeyMap`.
  - `hiddenLines.ts`, as a fallback.
- **Import and export:**
  - The importers (`outletsImport`, `racksImport`, `risersImport`, `sheetsImport`) with deterministic ids.
  - `exportDxf.ts` + `dxfEntities.ts`.
  - The title block, the drawing register + Excel export, tree views and tags.
- **UX ideas proven in Pages:** the touch model (two-finger-only navigation), split panes, the command line,
  explicit z-order, tree views.

---

## 4. Improvements to the current code (if you continue with it)

In priority order. The first block is about correctness. Each later block makes the next one cheaper.

**A. Correctness (days)**
1. ~~Check the rack-front regression (§2.4) in the browser. Then fix `rackPlan` and `racksImport`, or flip the
   convention, and add a *semantic* test.~~ **DONE in f10f2dd0.** The rack front is now its +y face, and a
   semantic test checks that Front shows the front-mounted devices.
2. Remove the demo models from the registry, along with the `FLOOR_MODEL_ID` fallbacks. A real project should never
   contain `m1`–`m4`.
3. Make layer visibility and lock per-user view state, not model data. Until then, give the toggles an undo step.
4. Save only the models that changed. Track dirty ids in the mutators instead of an `$effect` over all models.
5. Never persist an `img:` key. If the upload fails, refuse the insert or keep it pending until the upload retries.
6. Fix the stale comments (README, `types.ts` y-north, `frameAt`, `devOblique`, `Model3d` header).

**B. Stop the bleeding (a week)**
- **Feature freeze.** Only bug fixes in Pages while you decide §9. Every new feature now costs more than the last.
- **A file-size budget.** Treat >500 lines as a smell. No new code in `+page.svelte`, `vpInteraction`, `vpView` or
  `pagesProject`.
- **Comments say why, not which ticket.** Move review ids to commit messages.
- **Tests assert meaning, not snapshots of current output.**

**C. Structural refactors** (these largely match `review.md` R-items and `editing-merge-plan.md`)
1. **One tool registry**: `ToolDef { id, label, icon, group, commandNames, options, create(): Tool }`. It replaces
   the four name maps and the DRAW / POLY / MODEL sets, and tool options move off the global specs.
2. **A `Tool` interface:**
   - `onDown / onMove / onUp / onKey / preview / prompt / cancel`.
   - **Select becomes a `SelectTool`** that picks on press and selects on release inside one gesture. That deletes
     the `suppressClick` family of flags.
   - Image calibration, connection-point pick, Renumber and Block become tools, not side modes.
3. **Drawing tools become command coroutines** on the existing `CommandRunner`. AutoCAD two-click vs EOS press-drag
   becomes an input adapter. That deletes `draft`, `acceptDraw`, `drawPrompt` and `finishPolyline`.
4. **One input router per surface; paper is just another surface** with paper tools. One keyboard dispatcher
   replaces the per-instance window listeners.
5. **Undo built on operations, with one mutation path** (`doc.apply(op)`; no in-place proxy mutation). Undo
   becomes per-user and survives remote edits, and projections can be cached by object identity.
6. **Split `+page.svelte` into context stores**: workspace / tabs / panes, activation, documents, view, selection,
   history, tools. Panels read stores instead of receiving ~50 props.
7. **Move sheet-only annotations onto the sheet**, and remove `Layer.onlyIn`.
8. **Introduce typed Outlet / Port / Panel / Link records** that reference the canonical label store, instead of
   `attrs` strings and `device.alloc` snapshots.

Doing all of C on the live code is roughly as much work as the kernel in §6. Much of it is a rewrite in place, done
under the constraint of not breaking a 35k-line system that is in daily use. That is the main argument for §6.

---

## 5. Should you start again?

| Option | For | Against |
|---|---|---|
| **Keep refactoring Pages** | No migration; users keep everything | Every refactor fights the singletons, the snapshot undo and the shapes-as-domain model; the domain core (ports, links, cords, BOM) still has to be built from scratch |
| **Big-bang rewrite** | Clean | Months with nothing shippable; Pages and the old tools drift meanwhile |
| **New kernel alongside, with slices that retire tools (recommended)** | Each slice ships and retires a legacy tool; the pure modules and domain engines port over with their tests | Two editors coexist for a while; needs discipline to delete the old ones |

**What carries over into the new kernel, mostly verbatim:**

| From | Modules |
|---|---|
| Pages | `snap`, `hit`, `grips`, `modify`, `geometry` (2D parts), `selection`, `gestures`, `itemEdit`, `commands` + `CommandRunner` + many `cmdScripts`, `saver`, `versions`, `titleBlock`, `drawingList(+Export)`, `treeViews`, `tags`, `places` / `placeTree`, `graph*` / `connect` / `fill` / `storeyMap`, `ElevFrame` / `OClip`, `hiddenLines` (fallback), `exportDxf` / `dxfEntities`, the importers |
| `$lib/elevation` | `labelTemplate`, `portmap`, `links`, `reconcile`, `trace` |
| `frames/parts/engine.ts` | `generatePortLabels`, `buildPanelsWithReservations`, `validateConfig` |
| `patching/parts` | `cableUtils` (cable length, standard lengths), `exportExcel` (patch schedule + cable BOM) |
| `racks/parts` | `bom`, `compat`, `constants`, plus `$lib/catalog` (Panduit) |
| `risers/parts/engine.ts` | `validateRoute`, `buildCableRuns`, `computeCableLanes` |
| `fillrate/parts` | `constants` (`calcFillRate`), `packing` |
| `outlets` | `derivePortLabels`, `trunks/geometry` (`computeTrunkLength`), `trunks/constants` (trunk catalogue). The secondary routing and per-node fill are buried in `$derived` blocks in `Outlets.svelte`; extract them. |
| Elevations | the rack elevation renderer and `ElevationsEditor` / `BenchEditor` logic (the most complete domain UI) |

---

## 6. If I were starting again: architecture

### 6.1 Principles

1. **Project data is the product; drawings are views of it.** The BOM, the patch list, the outlet schedule and the
   printed plans all come from one set of typed entities. Nothing in the domain is a "shape with attributes".
2. **Generated, not drawn.** Plans, elevations, rack fronts, riser schematics and schedules are *computed* from the
   data. Stored drawing content is limited to annotations, view configuration and a small set of overrides.
3. **Tables are first-class editors.** Location and port data entry, label assignment, panel allocation and
   patching are tabular work (§2.5). They live as grid views over the same data, next to the canvas, not as drawn
   objects.
4. **2.5D.** Everything has a z, and containment runs are 3D polylines. Elevations are generated by projecting onto
   a frame, with no general 3D engine. A read-only three.js view can be added later for presentation.
5. **A small kernel with one way to do each thing:** one tool interface, one input router, one mutation path
   (operations), one undo, one selection model, one display list for screen, print and DXF. That gives two
   coordinate systems (model mm and paper mm) plus the camera transform.
6. **Drafting scope is chosen deliberately.** Enough CAD to annotate and tidy up generated drawings, not an AutoCAD
   clone (see §9 Q2).

### 6.2 Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Shell (Svelte): workspace, tree, tabs/panes, panels, bottom grid panel   │  src/routes/projects/[pid]/cad/
├──────────────────────────────────────────────────────────────────────────┤
│ Editor kernel: Surface, Camera, InputRouter, Tool registry, Commands,    │  src/lib/cad/editor/
│ Selection, Grips, Snaps, behaviours per entity type                      │
├──────────────────────────────────────────────────────────────────────────┤
│ View generators: (data, ViewDef) → DisplayList                           │  src/lib/cad/views/
│ plan · wall elev · room elev/section · rack elev · riser · tables        │
├──────────────────────────────────────────────────────────────────────────┤
│ Renderers / exporters: DisplayList → SVG (screen/print) · DXF · PDF      │  src/lib/cad/render/
├──────────────────────────────────────────────────────────────────────────┤
│ Document store: entities by id, ops, transactions, undo, subscriptions   │  src/lib/cad/store/
├──────────────────────────────────────────────────────────────────────────┤
│ Domain (pure TS): types, labels, allocation, routing, fill, BOM, patch   │  src/lib/cad/domain/
├──────────────────────────────────────────────────────────────────────────┤
│ Persistence adapter: Firestore (entity-per-doc) · import/export JSON     │  src/lib/cad/persist/
└──────────────────────────────────────────────────────────────────────────┘
```

Dependencies only point down. `domain/` and `views/` have no Svelte imports and are unit-tested in Node.

### 6.3 Domain model (sketch)

```ts
type Id = string                                  // nanoid, never prefix-encoded
type Pt = { x: number; y: number }                // ONE point type; model mm, plan y-down
type Ref = { type: EntityType; id: Id }

// Places
interface Building { id; name; order }
interface Level    { id; buildingId; name; number; slabZ; ffl; raisedFloor?; ceiling?; slabAboveZ }   // ONE z datum: FFL
interface Space    { id; levelId; parentId?; kind: string; name; code?; boundary?: Pt[] }          // zone/room/server room — generic

// Physical layout (per level)
interface Wall     { id; levelId; path: GraphNodesSegs; thickness; height; openings: Opening[] }  // openings HOSTED
interface Opening  { id; at: number /*along wall*/; width; sill; head; kind: 'door'|'window'|'hole'; swing? }
interface Underlay { id; levelId; fileId; page; origin: Pt; scale; crop? }                          // files/{id}, never data URLs

// Cabling
interface Outlet   { id; levelId; spaceId?; at: Pt; z; mount: 'floor'|'wall'|'desk'|'ceiling'; hostWallId?;
                     tier: 'low'|'high'; usage; symbolId; location: LocationKey; ports: OutletPort[] }
interface OutletPort { id; index; cableType; serverRoomId; label?: LabelParts }   // label = structured parts, rendered by format
interface Rack     { id; spaceId; at: Pt; rot; widthMm; depthMm; heightU; catalogId?; rowId? }    // front = local +y (as fixed in f10f2dd0), ONE convention
interface Device   { id; rackId; u; heightU; face: 'front'|'rear'|'both'; kind: 'panel'|'switch'|'shelf'|…; catalogId?; ports: DevicePort[] }
interface Link     { id; a: PortRef; b: PortRef; kind: 'horizontal'|'backbone'|'tie'; cableType; route?: Id[] /*containment segs*/ }
interface Cord     { id; a: PortRef; b: PortRef; cableType; colour; lengthM; status: 'add'|'remove'|'change'|'installed'; cordId? }
interface Containment { id; levelId?; catalogId; graph: { nodes: {id; x; y; z}[]; segs: {id; a; b; spec?}[] } }  // trunks, trays, conduits, risers
interface Catalog  { id; sku; maker; description; unit: 'ea'|'m'; price?; kind }                  // Panduit etc.

// Drawings
interface ViewDef  { id; kind: 'plan'|'wallElev'|'roomElev'|'section'|'rackElev'|'riser'|'schedule'|'patchList'|'bom';
                     params: Record<string, unknown> /* levelId, wallId, frame, rackIds… */; categories?: string[] }
interface Sheet    { id; number; title; placeId; paper; titleBlock: TitleBlockFill; viewports: Viewport[]; revisions }
interface Viewport { id; viewId; rect: Rect /*paper mm*/; scale: number; centre: Pt; clip?: Rect; overrides?: Record<Id, Override> }
interface Annotation { id; owner: { sheetId } | { viewId } | { levelId }; kind: 'line'|'poly'|'rect'|'circle'|'text'|'dim'|'leader'|'cloud'|'image';
                       geom; style; layerId; attach?: Ref /* a leader pointing at an outlet follows it */ }
```

Notes:
- **Labels** are stored as parts (floor, zone, location, server room, port, high flag) and rendered through the
  project's label format (`$lib/elevation/labelTemplate`). Renaming the format re-renders everything; nothing stores
  a pre-joined label snapshot.
- **Annotations belong to a sheet, a view or a level**, never to "a model, scoped to a frame". Deleting a sheet
  deletes its annotations, with no walk over models.
- **Rack front** has one convention (local +y), tested semantically: "the Front elevation shows face=front devices".

### 6.4 Derived data (pure functions, no storage)

| Function | From | Replaces |
|---|---|---|
| `renderLabel(parts, format)` | labelTemplate | the four label stores |
| `allocatePorts(level, panels, rules)` | frames engine `buildPanelsWithReservations` | `store/allocate.ts`, Frames |
| `routeLinks(links, containment)` | graph + Dijkstra over containment; secondary routing from Outlets | Outlets' `$derived` routing |
| `fillBySegment(routes)` | `fill.ts` + `calcFillRate` / `packSection`; accumulate up the tree | fill rate, per-node fill |
| `lengths(routes)` | 3D segment lengths + drops + slack | nothing today |
| `bom(project, catalog)` | outlets × faceplate / module SKU, containment metres by SKU, racks / devices by SKU, cable metres by type, cords by length | rack BOM, patching cable BOM, nothing for containment |
| `patchList(cords, labels)` | `patching/exportExcel` | Elevations patch list |
| `outletSchedule(outlets)` | `store/outletSchedule.ts` | Outlets Excel |
| `riserRuns(links, risers)` | risers engine | Risers |

A quote is `bom()` × catalogue prices, exported to Excel. A BOM line is never stored; it is always recomputed.

### 6.5 Document store and persistence

- **In memory.** A `Store` holds `Map<Id, Entity>` per type, as `$state.raw` (immutable records, replaced not
  mutated).
- **The only mutation path:**
  ```ts
  store.transact('Move 3 outlets', tx => { tx.put(outlet1, {...outlet1, at}); … })
  // → Op[] = { type, id, before, after }[]  → applied, pushed to undo, sent to persistence
  ```
  Gestures open a transaction on press and commit on release; Esc rolls back.
- **Undo** is per user. Each step is the list of ops it applied; undo applies their inverses. If someone else has
  changed the entity since, undo skips it and shows a toast.
- **Firestore layout:**
  - **Entities.** One doc per entity: `projects/{pid}/entities/{id} = { type, levelId?, …fields, rev, updatedAt,
    updatedBy }`.
  - **Listeners.** One per open level (`where('levelId','==',X)`) plus one for project-wide types (levels, spaces,
    racks, catalogue overrides, view defs).
  - **Writes.** A transaction becomes one `writeBatch` of the changed docs.
  - **What this fixes.** Collaboration granularity becomes one entity, and the 1 MiB limit stops mattering.
  - **Cost.** A floor with 3,000 outlets costs 3,000 reads to open, which is cents. Ports are embedded in their
    outlet or device doc.
  - **Sheets** are their own docs (`projects/{pid}/sheets/{id}`: paper, viewports, title block fill). The existing
    `drawings/` registry stays the index, `toolType: 'cad'`.
  - **Versions and revisions:** an issue freezes a snapshot of the entities a sheet's views depend on (by level),
    reusing `store/versions.ts` hashing.
- **Echo suppression** reuses `DocSaver`'s rules per entity (`rev` + `updatedBy`).
- **Persistence sits behind an adapter interface.** Turso (todo §12) can be evaluated later without touching the
  kernel. My view: stay on Firestore, since auth, live listeners and every other tool already use it.
- **Session and view state** (tabs, panes, camera, layer visibility, tool options) goes in a `Workspace` store per
  project, in localStorage, created per project. No module singletons.

### 6.6 View generators and the display list

```ts
type Prim =
  | { k: 'line' | 'poly'; pts: Pt[]; closed?: boolean; cls: string; src?: Ref }
  | { k: 'text'; at: Pt; text: string; size: number /*paper mm*/; rot?: number; cls: string; src?: Ref }
  | { k: 'symbol'; symbolId: string; at: Pt; rot?: number; scale?: number; src?: Ref }
  | { k: 'image'; fileId: string; page?: number; rect: Rect; src?: Ref }
type DisplayList = { prims: Prim[]; bounds: Rect; space: 'model' | 'paper' }

generate(view: ViewDef, data: StoreSnapshot): DisplayList   // pure, memoised per (view, entity revs)
```

- **One display list** feeds the SVG renderer (screen and print), the DXF writer and picking (`src` = the entity
  behind each prim). This fixes the render ≠ pick ≠ export drift.
- **Generators:**
  - **Plan:** underlay, walls with opening gaps, outlets as symbols with labels, containment, racks with a front
    marker, spaces.
  - **Wall elevation:** a host wall's openings, plus outlets hosted on it drawn as faceplate symbols at height. Exact,
    with no hidden-line removal.
  - **Room elevation / section:** upright extrusions projected onto an `ElevFrame`. Hidden lines by interval
    occlusion in (u, z), which is exact for upright boxes; `hiddenLines.ts` stays as a fallback. Containment is
    projected as 3D polylines.
  - **Rack elevation:** the Elevations renderer made pure (front / rear, U numbers, port labels at fixed size).
  - **Riser:** a schematic from levels, risers and backbone links (`storeyMap`, `computeCableLanes`).
  - **Tables:** schedule, patch list and BOM produce text and line prims, so they can be placed on a sheet and print
    like any view.
- **Elevation views get their own 2D drawing space** (u, z) with the origin at the frame. No `GROUND` / `PLAN_CX`
  constants baked into stored annotations.

### 6.7 Editor kernel

```ts
interface EntityBehaviour<E> {             // one per entity type — the only place type-specific editing lives
  type: EntityType
  bounds(e: E): Rect
  hit(e: E, p: Pt, tol: number): boolean
  grips(e: E, view: ViewDef): Grip[]       // Grip = { at: Pt; kind; apply(e, to: Pt, mods): E }
  move(e: E, d: Pt): E
  transform?(e: E, m: Mat2D): E            // rotate/scale/mirror
  fields: FieldDef[]                       // drives the Properties panel AND the grid columns
}

interface Tool {                           // one per tool; the registry holds { id, label, icon, group, create }
  onDown(ev: ViewEvent): void; onMove(ev: ViewEvent): void; onUp(ev: ViewEvent): void
  onKey?(ev: KeyboardEvent): boolean
  preview?(): Prim[]; prompt?(): string; cursor?: string
  cancel(): void
}
// ViewEvent = { model: Pt; snapped: Pt; screen: Pt; mods; view: ViewDef; surface: Surface } — built once by the router
```

- **The Surface** (a viewport, or a sheet's paper) has a camera (pan, zoom, scale). Paper is a surface whose items
  are viewports and paper annotations. Same router, same `ItemEditor`, same marquee, same grips. That removes the
  PaperPage / Viewport split.
- **InputRouter order:** command pick → active tool → SelectTool. There is one keyboard dispatcher at workspace level.
- **Drawing tools are command coroutines** (`CommandRunner`):
  ```ts
  async function line(c) { const a = await c.point('First point'); for (;;) { const b = await c.point('Next', { from: a }); … } }
  ```
- **Selection** is `Ref[]`. Sub-element selection (a graph node or segment) is `{ref, part}`.
- **Snaps** come from the display list (endpoints, midpoints, centres) plus behaviour-provided snaps (outlet
  centre, port, wall face). `snap.ts` ports almost as-is.
- **Properties panel and grids** are generated from `fields` (type, label, editor, validation). Multi-select shows
  mixed values. The bottom panel shows the same fields as a spreadsheet: the "tables are first-class" principle.

### 6.8 Shell

- **The ux-plan layout:**
  - tree navigator on the left (places → levels → spaces → racks, plus sheets, with the tree views kept)
  - canvas with tabs and split panes in the centre
  - Properties / Library on the right
  - a collapsible bottom grid panel: outlets, ports, patch list, BOM, issues
- **Workspace state** is one store provided through Svelte context and created per project. The shell file stays
  small (target: under 300 lines) because each concern is its own store or component.

### 6.9 Size targets (to keep it honest)

| Part | Target |
|---|---|
| domain + derived | ~4k lines (much of it ported) |
| store + persist | ~1.5k |
| views + render + DXF | ~4k |
| editor kernel + tools + commands | ~6k |
| shell + panels + grids | ~5k |
| **Total** | **~20k lines**, against ~27.5k in Pages today plus ~40k across the legacy tools it replaces |

---

## 7. Delivery plan (vertical slices)

Each phase ends with something usable and **retires a legacy tool**. The old tools stay read-only until their slice
lands; data moves through one-shot importers (most already exist). Effort is relative.

| # | Phase | Contents | Exit criterion | Retires | Effort |
|---|---|---|---|---|---|
| 0 | **Decide and spec** | Answer §9. Write a glossary and short ADRs (label model, persistence, 2.5D, drafting scope, z datum and axis conventions with *semantic* tests). Freeze Pages features. | Signed-off ADRs, entity schemas in `domain/types.ts` | — | S |
| 1 | **Domain + store** | `domain/` types and derived functions (port the legacy engines with their tests), `store/` ops / undo / transactions, the Firestore entity adapter, JSON export / import (O14) | `bom()`, `patchList()`, `outletSchedule()` run in Node against data imported from a real project | — | M |
| 2 | **Kernel + plan: Outlets** | Surface / camera / router / tools / select / grips / snaps, the plan generator, underlays from `files/{id}` with calibration, outlet placement with labels from the format, containment drawing, an outlets grid in the bottom panel, Excel schedule, DXF | Can do a floor's outlets and trunks end to end | **Outlets** | L |
| 3 | **Racks, ports, patching: Elevations** | Rack / device editing (the rack elevation generator and a U grid), the locations / ports grid, allocation and reservations, links, cords, the patch list panel, trace, the cable BOM | Allocate a floor's outlets to panels and produce the patch list and BOM | **Elevations** (and with it Racks / Frames / Patching) | L |
| 4 | **Sheets and issue** | Paper, title block, viewports placing ViewDefs, paper annotations, print / PDF, register, revisions / issue, packages | Issue a package of plan + rack sheets | **Sheets, Drawings, Packages** | M–L |
| 5 | **Routing, fill, quote** | `routeLinks`, segment fill, lengths, the containment BOM, a catalogue with prices, quote export, riser schematic | Produce a quote BOM for a floor | **Fill rate, Risers** | M |
| 6 | **Elevations and sections** | Walls with hosted openings, wall and room elevations, sections, the hidden-line interval method; optional read-only three.js view | Room elevation of a comms room with outlets at height | (the Pages 3D engine) | M |
| 7 | **Decommission** | Import the remaining Pages sheets / models, delete the old routes and `pages/`, remove the legacy registry leaves | `src/routes/projects/[pid]/` contains only the new tool + Uploads | **Pages** | S–M |

**Ground rules for every phase:**
- **Order of work.** Data and tests first, then the generator, then the tool and UI.
- **Done means deleted.** A phase isn't done until the code it replaces is deleted or frozen.
- **Size limits.** No file over ~500 lines and no module-level `$state`.
- **Comments** say why. Ticket ids go in commit messages.
- **Browser checks.** Every slice gets a live browser check against the Test Project before merge. Writes to real
  projects need your OK.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Rewrites stall halfway and two tools linger | Slices retire tools; phase 2 is useful on its own; old tools frozen, not maintained |
| Losing Pages features you rely on | Phase 0 lists the Pages features in actual use (tree views, command line, split panes, DXF, touch) and puts each in a phase or explicitly drops it |
| Entity-per-doc read cost or listener fan-out | Ports are embedded; listeners are per level; measure in phase 1 on the largest real floor (33F, ~3,300 items) |
| Generated drawings need "just this one tweak" | Per-viewport overrides (hide, offset label, extra text) as a deliberate, small feature, not free-form editing of generated geometry |
| Label-format migration | Labels stored as parts; importers parse existing strings with `labelTemplate`; anything unparseable is flagged in an issues grid |

---

## 9. Questions for you

**Decided (User, 2026-10-02):**
- **Approach:** fix bugs only for now (the §4A items); decide on the restart later.
- **Q4 Canonical data:** the new drawing tool owns locations, ports, labels and cords, and replaces Elevations too.
- **Q2 Drafting:** keep the command line plus a core set of ~25 commands; drop the long tail.
- **Q3 3D:** 2.5D is fine, with an optional read-only 3D viewer later.
- **Still open:** Q1 concurrency, Q5 quote pricing, Q6 backend.

These change the plan materially; the plan above assumes the **bold** answer.

1. **Users and concurrency.** Will several people edit the same floor at the same time, or is it mostly you, one
   person per project? (**Several, occasionally**. That drives entity-per-doc storage.)
	A: Usually one person per project, maybe two or three occasionally
2. **Drafting depth.** Is AutoCAD-level drafting (command line, TRIM / EXTEND / OFFSET, polar tracking, 114
   commands) something your drafters need, or was it a parity exercise? (**Keep the command line and a core set of
   ~25 commands; drop the rest**.)
3. **3D.** Are you OK dropping the general 3D engine (iso / perspective editing, tilted boxes, the OSM site view) for
   2.5D with generated elevations and an optional read-only 3D viewer? (**Yes**.)
4. **The canonical data.** Should the new tool own locations, ports, labels and cords, migrating the
   `frames` / `racks` / `patching` / `outlets` docs into entities and retiring Elevations? Or should Elevations stay
   as the rack / port editor and the drawing tool read its data? (**The new tool owns them**, which is what ux-plan
   implies.)
5. **Quotes.** Does a quote need prices and part numbers (catalogue with prices, labour rates, margins), or just
   quantities exported to Excel for pricing elsewhere? (**Quantities by SKU; prices optional**.)
6. **Backend.** Stay on Firestore (**yes**), or is the Turso investigation driven by something beyond doc size and
   write volume (SQL reporting, cost)?
7. **Appetite.** Clean kernel alongside (§5, recommended), or continue refactoring Pages in place (§4)? Is there a
   deadline or live project that Pages must keep serving meanwhile?
	A: No deadline, no live project; focus on fixing bugs first. I use some pages/sheets in Project Tourney as references for cabling design decisions, but noone else uses it in production, just testing
