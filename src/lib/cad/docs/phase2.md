# Phase 2: editor kernel + plan → retire Outlets (in progress)

## Slice 1 (done 2026-10-02): route, load / save, import, plan view, select / move / place

- **Route** `projects/[pid]/cad` (linked from the project page as "CAD (new)"):
  - It waits for sign-in, then mounts `ui/CadShell.svelte` per project.
  - The layout is levels on the left, the plan in the middle, Properties on the right and the outlets grid below.
- **`app/project.svelte.ts` (`CadProject`)** owns the entity store and its Firestore sync:
  - project scope first, then each level's scope as levels arrive
  - a `rev` counter that every derived read uses
  - the import preview / apply
- **`app/workspace.svelte.ts`:** the open level, the active tool and the selection (session state only).
- **`app/pdf.svelte.ts`:** floorplan PDFs are rasterised once and placed from their Uploads calibration.
- **`views/plan.ts`:** the plan generator.
  - Draws underlays, shapes / walls, containment (bands at their real width; vertical segments as a riser symbol with
    their z range), racks (with the front line) and outlets.
  - Symbols and text keep a constant paper size at 1:100.
- **`editor/`:**
  - `camera.ts`: zoom about the cursor, fit.
  - `pick.ts`: picks the drawn prims.
  - `behaviours.ts`: move per type.
  - `tools.ts`: SelectTool (select on press, drag = one undo step, window); OutletTool (next free label, sticky
    defaults).
  - `commands.ts`: delete, with cascade to links and cords.
- **UI:** `PlanCanvas` (now `ViewCanvas`; pan with right / middle drag, wheel zoom, Home = fit), `Prims`, `OutletGrid` (editable;
  renaming carries into the port labels), `Properties` (outlet / rack / shape), `ImportPanel`.
- **Tests:** 90 (pure modules).

### Checked live on Test Project (with Dave's OK for writes there)
- **Import:** the legacy import wrote 327 items to `projects/250505-115939/cadEntities`. Both levels, the calibrated
  floorplan and the outlets / racks appeared.
- **Move and undo:** dragging an outlet saved it (rev 2). Undo restored and saved it (rev 3). The Properties panel
  followed the selection.
- **Outlet tool:** placed outlets with the next label and the previous outlet's defaults. The test outlets were
  removed afterwards; Test Project is back to the 327 imported items.
- **Console:** no errors.

### Things learned
- **New files and Tailwind.** Tailwind's arbitrary classes in files created while the dev server runs weren't
  generated, and Vite then served the shell's `<style>` stale until the style block was edited (memory: Vite stale
  CSS). The shell layout now lives in the component's `<style>`.
- **HMR resets undo.** An HMR remount of the shell creates a fresh store, so the undo history is lost. That only
  matters in development. Clean up test data before editing code.

## Slice 2 (done 2026-10-02): runs, walls, lines, rise / drop, grips, snaps, convert

- **`editor/pathTool.ts`:** one tool with four presets (Line L, Trunk T, Conduit C, Wall W).
  - Click points at work Z.
  - **R** asks for a Z and adds a vertical segment at the last point; the work Z follows.
  - Enter, double-click or a right-CLICK finishes; Backspace drops the last point; Esc finishes (or cancels with
    fewer than two points).
  - The tool bar shows Z / W / H (Ø for conduit, thickness / height for a wall) with presets per tool:
    - trunk / conduit Z = mid-plenum from the level heights
    - wall height = the level's clear height
- **`editor/snap.ts`:**
  - Snaps to path nodes, segment midpoints, outlet and rack centres, else a 10 mm grid (Alt = no snap), with a snap
    marker.
  - Snapping a run's node onto an outlet or rack **attaches** it.
- **`editor/grips.ts` + SelectTool:**
  - A selected path shows node grips; a vertical stack is ONE grip, so a drop never leans.
  - Dragging a grip snaps and is one undo step.
  - Moving an outlet or rack carries the run nodes attached to it (`followAttached`).
- **`ui/PathProps.svelte`:**
  - "Is a" converts Line / Wall / Trunk / Conduit / Tray; the nodes never move (ADR 0007).
  - Section fields, label, "All nodes Z".
  - A node table with X / Y / Z per node and ↕ to add a drop / rise at a node (via the tool-bar prompt).
- **Rendering:** banded runs also get a 1 px centre line, so they show at any zoom. The tool preview (rubber band,
  grips, snap marker) draws on top.
- **Tests:** 98 (snaps, attach + follow, R = drop as one undo step, walls, grips on a vertical stack, convert keeps
  geometry).

### Checked live on Test Project
- **Drawing:** drew a trunk with a drop (R → 300): 3 nodes, one vertical, saved.
- **Convert:** "Is a" → Line dropped the role and section with identical nodes (saved, rev 2); undo restored the trunk
  (rev 3).
- **Cleanup:** Delete removed it. Test Project is back to 327 items.

## Slice 3 (done 2026-10-02): racks on the plan, Excel schedule, DXF — what Outlets did

- **Racks:**
  - The left panel lists the open level's racks by server room, unplaced first with **Place**. The next click puts
    the rack's centre there (`RackTool`), then it's back to Select with the rack selected.
  - Properties has ⟲ / ⟳ 90°, a rotation field, **Unplace** (the rack stays in the project), and the device count.
  - Placed racks move with Select like anything else; attached run ends follow.
- **Outlet schedule → Excel** (`render/outletSchedule.ts`, exceljs on demand):
  - Two exports: this level ("Schedule") or all levels.
  - Columns: Level, Zone, Room, Outlet, Usage, Tier, Mount, Height, Ports, Port labels, Cable, Server room, Patched to,
    On plan.
  - A totals line at the top.
- **DXF** (`render/dxf.ts`): the open plan's DISPLAY LIST → DXF.
  - Same content as the screen.
  - y flipped to DXF y-up.
  - Runs and walls as LWPOLYLINEs at their real constant width.
  - Layers E-OUTLETS / E-CONTAINMENT(-HIGH) / E-RISERS / E-RACKS / A-WALL / ANNO-LABELS / ANNO-TEXT.
  - The floorplan PDF is not included (reported).
- **Tests:** 104 (DXF content and layers, width, y flip; the schedule rows; rack placement + undo).

### Checked live on Test Project
- **Rack:** Place V03 → saved (rev 2); ⟳ 90° → rev 3; Unplace → rev 4; three undos → V03 exactly as imported.
- **Exports:** not clicked in the browser (they download files). Their content is covered by tests.
- **Changes not made by this session:**
  - an outlet **A007** created at 19:49:58
  - rack **Desk001** edited at 18:49:43
  - outlet **A.010** edited at 18:50:13

  They are probably Dave's own edits in another tab; left as they are. Test Project now has 328 items.

## Slice 4 (done 2026-10-02): elevations, view switching, split view, drawing in elevations

- **`views/space.ts`:**
  - A view spec (Plan / Front / Rear / Left / Right) and its view space: view point ⇄ model point; a drag → a model
    displacement.
  - Tools now work in VIEW coordinates and ask the space for model points, so every tool works in plan or elevation.
- **`views/elevation.ts`:** a level projected onto a named frame.
  - Racks show their devices at their U (front devices from the front, rear from the rear, none from the side).
  - Outlets show as faceplates at their height (high ones at the ceiling).
  - Runs show as bands, vertical drops at true height; walls are panels; boxes are rectangles.
  - SSL / FFL / ceiling / slab-above datum lines.
  - Painted far → near with opaque fills (good enough for upright boxes; exact interval HLR later).
- **Editing in an elevation:**
  - Dragging moves along the view and up / down (an outlet dragged up gets its Z).
  - Grips on a run's nodes change their height.
  - The path tool draws at the work depth, so a drop is just drawn.
  - The outlet tool places an outlet at the clicked height.
  - Snaps go to drawn vertices.
- **`ui/ViewCanvas.svelte`** replaces PlanCanvas.
  - Each pane has its own view switcher.
  - **Split** gives two panes, and each shows the other's work plane (a green dashed line).
  - The tool bar has **Depth** when the active pane is an elevation (blank = the middle of the floor).
  - The fit follows pane size.
- **Tests:** 112 (what each elevation shows; device U; drop height; order flips in the rear view; drawing a drop in
  Front and a line in Left at the work depth; dragging an outlet up sets Z).

### Checked live on Test Project
- **Split:** Plan + Front showed racks with devices, datums, high outlets at the ceiling, and the work-plane lines.
- **Drawing:** a trunk drawn straight down in Front gave a vertical run at the work depth (a riser symbol on the
  plan's dashed line). It was undone; Test Project is back to 328 items.
- **Console:** no errors. After the dev-server restart, Tailwind arbitrary classes are generated and every cad
  component's CSS is current.

## Slice 5 (done 2026-10-02): typed points, node editing, risers to other levels

- **Typed points** (`editor/input.ts`). With Line / Trunk / Conduit / Wall / Outlet active, start typing (a digit,
  `@`, `-` or `.`) and the tool-bar point box opens.
  - `x,y`, `@dx,dy`, `d<a`, `@d<a`, or a bare distance towards the cursor.
  - Read AutoCAD-style, Y up: up the sheet in plan, height in an elevation.
  - The Outlet tool takes `@1200,0` from the last outlet placed.
- **Node editing** (`domain/pathEdit.ts`, pure, the same for walls / runs / lines):
  - **Double-click** a selected run's segment to insert a point (z interpolated).
  - **Ctrl-drag** a grip to branch a new segment.
  - **✕** in the Properties node table deletes a point. A middle point is healed (its two segments join, wall
    openings on removed segments go); a path left with < 2 points is deleted.
- **Risers to other levels:** **V** while drawing a trunk / conduit asks for a level number. It adds a vertical
  segment to that level's FFL and ends the run.
  - Both levels' plans show it as "Riser 33F ↕ 34F".
  - Elevations lift nodes on other levels by the level-height difference.
  - Lengths / BOM already add level elevations.
- **Fixes:**
  - **Double-click** never worked: a pointerdown's `detail` is always 0 (Pointer Events spec), so the canvas now counts
    presses itself (400 ms / 5 px).
  - **Esc** with nothing drawn now returns to Select.
- **Tests:** 127 (parser; insert / branch / heal / delete; typed trunk; outlets spaced by `@1200,0`; double-click
  insert; Ctrl-drag branch; V riser on both plans).

### Checked live on Test Project
- **Typed trunk:** a click, then typed `@3000,0` and `@0,2000`, gave exactly (9660, 12390) → (+3000, 0) → (0, −2000).
- **Insert and delete a point:** double-click inserted point 4 on the segment; ✕ deleted it and healed the run.
- **Cleanup:** Delete removed the trunk. Test Project is back to 328 items.

## What "retire Outlets" still needs
- **Outlet symbols as blocks** (ADR 0007), the legend, and print. Outlets prints scaled plans; cad gets sheets in
  Phase 4, so Outlets stays until then for printing.
- **Calibrating floorplans:** done in Uploads today (cad reads it) — fine to keep.
- **Secondary routes and per-node fill:** Phase 5.

## Next slices
1. **Renumber** (deferred by Dave 2026-10-02, still high priority): the function is in `domain/labels.ts`.
2. **Containment, still to do:**
   - typed points / lengths (command runner)
   - Level (a riser to another level)
   - inserting a node on a segment, branching from a node
   - Delete on a single node
3. ~~**Plane inset + work Z / guides**~~ — dropped (Dave, 2026-10-02): the split view is enough.
4. **More snaps:** intersection, perpendicular, nearest.
5. **Racks:** place / rotate on the plan; unplaced racks listed by room.
6. **Exports:** the outlet schedule to Excel; DXF from the display list.
7. **Help panel:** keys and tools.
